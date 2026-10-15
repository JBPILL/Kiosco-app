// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest'
const kid='10000000-0000-4000-8000-000000000001'
const actor='20000000-0000-4000-8000-000000000001'
const venta='30000000-0000-4000-8000-000000000001'
const id='40000000-0000-4000-8000-000000000001'
const detalle='50000000-0000-4000-8000-000000000001'
const pago='60000000-0000-4000-8000-000000000001'
const solicitud={ version:1,id,ventaId:venta,metodo:'OTRO',motivo:'ERROR_COBRO',notas:null,
  sesionReintegroId:null,items:[{ detalleId:detalle,cantidad:1,reingresaStock:true }] }
const snapshot={ id:venta,kiosco_id:kid,total:80,detalles:[{ id:detalle,cantidad:2,subtotal:100 }],pagos:[{ id:pago,medio_pago:'EFECTIVO',monto:80 }] }
let db:PGlite
beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY,estado_suscripcion text);
    CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid,activo boolean,rol text);
    CREATE TABLE ventas(id uuid PRIMARY KEY,kiosco_id uuid,total numeric,estado text,afip_cae text);
    CREATE TABLE checkout_manuales(venta_id uuid PRIMARY KEY,kiosco_id uuid,solicitud jsonb,resultado jsonb);
    CREATE TABLE pagos_venta(id uuid PRIMARY KEY,venta_id uuid,medio_pago text,monto numeric);
    CREATE TABLE devoluciones_venta(id uuid PRIMARY KEY,venta_id uuid);
    INSERT INTO kioscos VALUES('${kid}','ACTIVO');
    INSERT INTO usuarios VALUES('${actor}','${actor}','${kid}',true,'CAJERO');
    INSERT INTO ventas VALUES('${venta}','${kid}',80,'COMPLETADA',NULL);
    INSERT INTO pagos_venta VALUES('${pago}','${venta}','EFECTIVO',80);`)
  for(const f of ['supabase_fase_devolucion_registro_privado.sql','supabase_fase_devolucion_calculo_historico.sql','supabase_fase_devolucion_preparacion_privada.sql']){
    await db.exec(readFileSync(f,'utf8')); await db.exec(readFileSync(f,'utf8'))
  }
},30_000)
beforeEach(async()=>{
  await db.exec(`RESET ROLE; SET request.jwt.claim.sub='${actor}';
    DELETE FROM devoluciones_parciales_atomicas; DELETE FROM devoluciones_venta; DELETE FROM checkout_manuales;
    DELETE FROM usuarios WHERE id<>'${actor}'; UPDATE usuarios SET activo=true,rol='CAJERO',kiosco_id='${kid}';
    UPDATE kioscos SET estado_suscripcion='ACTIVO'; UPDATE ventas SET total=80,estado='COMPLETADA',afip_cae=NULL;
    UPDATE pagos_venta SET monto=80;`)
  await db.query('INSERT INTO checkout_manuales VALUES($1,$2,$3::jsonb,$4::jsonb)',[venta,kid,JSON.stringify(snapshot),JSON.stringify({venta_id:venta})])
})
afterAll(async()=>{await db.close()})
const preparar=async(entrada:unknown=solicitud)=>(await db.query<{ plan: {confirmada:boolean;detalles?:unknown;resultado?:unknown} }>(
  'SELECT preparar_devolucion_parcial_privada($1::jsonb) plan',[JSON.stringify(entrada)])).rows[0].plan
it('autoriza cajero activo y obtiene importe histórico sin escribir confirmación',async()=>{
  const plan=await preparar()
  expect(plan.confirmada).toBe(false)
  expect(plan.detalles).toEqual([{detalle_id:detalle,cantidad:1,importe:40}])
  expect((await db.query('SELECT count(*)::int n FROM devoluciones_parciales_atomicas')).rows[0]).toEqual({n:0})
})
it.each([
  {entrada:{...solicitud,precioUnitario:1}},
  {entrada:{...solicitud,usuarioId:actor}},
  {entrada:{...solicitud,metodo:'INVALIDO'}},
  {entrada:{...solicitud,motivo:'INVALIDO'}},
  {entrada:{...solicitud,notas:1}},
  {entrada:{...solicitud,notas:'a'.repeat(1001)}},
  {entrada:{...solicitud,metodo:'EFECTIVO_CAJA',sesionReintegroId:null}},
  {entrada:{...solicitud,sesionReintegroId:pago}},
  {entrada:{...solicitud,items:[{detalleId:detalle,cantidad:1,reingresaStock:true,precioUnitario:1}]}},
  {entrada:{...solicitud,items:[{detalleId:detalle,cantidad:1,reingresaStock:'true'}]}},
  {entrada:{...solicitud,items:[{detalleId:detalle,cantidad:1}]}},
])('SQL rechaza campos extra o tipos inválidos %j',async({entrada})=>{
  await expect(preparar(entrada)).rejects.toThrow('Solicitud de devolución inválida')
})
it.each([
  'SET request.jwt.claim.sub=\'\'',
  'UPDATE usuarios SET activo=false',
  "UPDATE usuarios SET rol='SUPERADMIN'",
  "UPDATE kioscos SET estado_suscripcion='INACTIVO'",
  'UPDATE usuarios SET kiosco_id=NULL',
  'UPDATE checkout_manuales SET resultado=NULL',
  "UPDATE ventas SET estado='ANULADA'",
  'UPDATE ventas SET total=100',
  "UPDATE ventas SET afip_cae='123'",
  'UPDATE pagos_venta SET monto=70',
  `INSERT INTO devoluciones_venta VALUES('${id}','${venta}')`,
  `INSERT INTO usuarios VALUES('${id}','${actor}','${kid}',true,'CAJERO')`,
])('rechaza contexto inválido %s',async sql=>{
  await db.exec(sql)
  await expect(preparar()).rejects.toThrow()
})
it('reintento conserva actor y contenido; cantidades previas limitan la siguiente devolución',async()=>{
  const resultado={id,venta_id:venta,kiosco_id:kid,monto_total:40,detalles:[{detalle_id:detalle,cantidad:1,importe:40}]}
  await db.query(`INSERT INTO devoluciones_parciales_atomicas(id,venta_id,kiosco_id,actor_auth_id,solicitud,resultado)
    VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,[id,venta,kid,actor,JSON.stringify(solicitud),JSON.stringify(resultado)])
  expect(await preparar()).toEqual({confirmada:true,resultado})
  await expect(preparar({...solicitud,items:[{detalleId:detalle,cantidad:2,reingresaStock:true}]})).rejects.toThrow('solicitud original')
  const nueva={...solicitud,id:pago}
  expect((await preparar(nueva)).detalles).toEqual([{detalle_id:detalle,cantidad:1,importe:40}])
  await expect(preparar({...nueva,items:[{detalleId:detalle,cantidad:2,reingresaStock:true}]})).rejects.toThrow()
  await db.exec(`UPDATE devoluciones_parciales_atomicas SET actor_auth_id='${pago}'`)
  await expect(preparar()).rejects.toThrow('otra operación')
})
it('ningún rol API puede llamar a la preparación privada',async()=>{
  const {rows}=await db.query<{ejecuta:boolean}>(`SELECT has_function_privilege(oid,'preparar_devolucion_parcial_privada(jsonb)','EXECUTE') ejecuta
    FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')`)
  expect(rows).toHaveLength(3)
  expect(rows.every(r=>!r.ejecuta)).toBe(true)
})
