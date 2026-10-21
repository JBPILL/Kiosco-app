// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { freezeFiscalRequest, serializeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import { wsfeSample } from './fixtures/fiscalWsfe'

const db = new PGlite()
const id = (n: number) => `de000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const owner=id(1), cashier=id(2), viewer=id(3), other=id(4), kid=id(10), foreign=id(11)
const caja=id(20), foreignCaja=id(21), venta=id(30), producto=id(40), detalle=id(50), pago=id(60), lote=id(70), salida=id(80)
const snapshot = { version:1,id:venta,kiosco_id:kid,usuario_id:cashier,sesion_caja_id:caja,total:1,
  detalles:[{ id:detalle,producto_id:producto,cantidad:3,precio_unitario:1,subtotal:3,es_devolucion_envase:false,articulo_libre:null,componentes:[] }],
  pagos:[{ id:pago,medio_pago:'EFECTIVO',monto:1 }] }
const solicitud = (n=100,cantidad=1,reingresaStock=true) => ({ version:1,id:id(n),ventaId:venta,metodo:'EFECTIVO_CAJA',motivo:'CAMBIO_PRODUCTO',notas:null,
  sesionReintegroId:caja,items:[{ detalleId:detalle,cantidad,reingresaStock }] })
async function actor(uid=cashier,role='authenticated') {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)",[uid,role])
  await db.exec(`SET ROLE ${role}`)
}
async function devolver(entrada: unknown=solicitud()) {
  return (await db.query<{r:{monto_total:number;stock:unknown[]}}>('SELECT public.confirmar_devolucion_efectivo_piloto($1::jsonb) r',[JSON.stringify(entrada)])).rows[0].r
}

it('un Cajero no puede reintegrar desde la caja de otro operador del mismo comercio', async () => {
  await db.exec('RESET ROLE')
  await db.query('UPDATE sesiones_caja SET usuario_id=$1 WHERE id=$2', [owner, caja])
  await actor(cashier)
  await rechazo(() => devolver(), /caja abierta/)
  await db.exec('RESET ROLE')
  expect((await db.query('SELECT count(*)::int n FROM devoluciones_venta')).rows).toEqual([{ n: 0 }])
})
async function rechazo(action:()=>Promise<unknown>,patron:RegExp) {
  await db.exec('SAVEPOINT rechazo')
  try { await expect(action()).rejects.toThrow(patron) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT rechazo; RELEASE SAVEPOINT rechazo') }
}
async function estado() {
  await db.exec('RESET ROLE')
  return (await db.query(`SELECT
    (SELECT stock_actual::text FROM productos WHERE id='${producto}') stock,
    (SELECT cantidad_actual::text FROM lotes_producto WHERE id='${lote}') lote,
    (SELECT count(*)::int FROM devoluciones_venta) devoluciones,
    (SELECT count(*)::int FROM movimientos_caja) egresos`)).rows[0]
}
beforeAll(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  for (const path of ['001_domain.sql','002_identity_helpers.sql',...readdirSync('supabase/bootstrap/steps').sort().map(n=>`steps/${n}`),'900_final_security.sql',
    'commercial/001_commercial_subscription.sql','commercial/002_commercial_write_gate.sql']) await db.exec(readFileSync(`supabase/bootstrap/${path}`,'utf8'))
  for (const path of ['supabase_fase_devolucion_registro_privado.sql','supabase_fase_devolucion_calculo_historico.sql','supabase_fase_devolucion_preparacion_privada.sql']) await db.exec(readFileSync(path,'utf8'))
  await db.exec(readFileSync('supabase/bootstrap/pilot-operations/001_capabilities.sql','utf8'))
  const modulo=readFileSync('supabase/bootstrap/returns/001_atomic_cash_return.sql','utf8')
  await db.exec(modulo); await db.exec(modulo)
  await db.exec(readFileSync('supabase/bootstrap/returns/003_whole_unit_quantities.sql','utf8'))
  for(const path of readdirSync('supabase/pilot-fiscal').filter(n=>/^\d{3}_.*\.sql$/.test(n)).sort()) {
    const sql=readFileSync(`supabase/pilot-fiscal/${path}`,'utf8');await db.exec(sql);await db.exec(sql)
  }
  await db.exec(`INSERT INTO auth.users(id) VALUES('${owner}'),('${cashier}'),('${viewer}'),('${other}');
    INSERT INTO kioscos(id,nombre) VALUES('${kid}','Ensayo'),('${foreign}','Otro');
    INSERT INTO piloto_operaciones_capacidades(kiosco_id,devoluciones_efectivo) VALUES('${kid}',true),('${foreign}',true);
    INSERT INTO planes(id,nombre,precio_mensual,max_usuarios) VALUES('${id(90)}','Ensayo',0,3);
    INSERT INTO suscripciones(kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado)
      VALUES('${kid}','${id(90)}',public.comercial_hoy(),public.comercial_hoy()+30,'ACTIVA'),('${foreign}','${id(90)}',public.comercial_hoy(),public.comercial_hoy()+30,'ACTIVA');
    INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES
      ('${owner}','${owner}','${kid}','Dueño','DUEÑO'),('${cashier}','${cashier}','${kid}','Caja','CAJERO'),
      ('${viewer}','${viewer}','${kid}','Visor','VISOR'),('${other}','${other}','${foreign}','Otro','DUEÑO');
    INSERT INTO sesiones_caja(id,kiosco_id,usuario_id) VALUES('${caja}','${kid}','${cashier}'),('${foreignCaja}','${foreign}','${other}');
    INSERT INTO productos(id,kiosco_id,descripcion,precio_venta,stock_actual) VALUES('${producto}','${kid}','Artículo',1,2);
    INSERT INTO lotes_producto(id,kiosco_id,producto_id,fecha_vencimiento,cantidad_inicial,cantidad_actual,activo)
      VALUES('${lote}','${kid}','${producto}',current_date+30,3,0,false);
    INSERT INTO ventas(id,kiosco_id,usuario_id,sesion_caja_id,total) VALUES('${venta}','${kid}','${cashier}','${caja}',1);
    INSERT INTO detalles_venta(id,venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES('${detalle}','${venta}','${producto}',3,1,3);
    INSERT INTO pagos_venta(id,venta_id,medio_pago,monto) VALUES('${pago}','${venta}','EFECTIVO',1);
    INSERT INTO movimientos_stock(id,kiosco_id,producto_id,tipo,cantidad,motivo,notas,lote_producto_id)
      VALUES('${salida}','${kid}','${producto}','EGRESO',3,'VENTA','Checkout manual ${venta}','${lote}');
    UPDATE movimiento_stock_costos SET precio_costo=7.25 WHERE movimiento_id='${salida}';
    UPDATE producto_costos SET precio_costo=99 WHERE producto_id='${producto}';`)
  await db.query('INSERT INTO checkout_manuales(id,kiosco_id,venta_id,solicitud,resultado) VALUES($1,$2,$1,$3::jsonb,$4::jsonb)',[venta,kid,JSON.stringify(snapshot),JSON.stringify({venta_id:venta})])
},120_000)
beforeEach(async()=>{ await db.exec('RESET ROLE; BEGIN;'); await actor() })
afterEach(async()=>{ await db.exec('ROLLBACK; RESET ROLE;') })
afterAll(async()=>{ await db.close() })

async function prepararFiscal() {
  await actor(owner)
  await db.query('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb)',[id(200),kid,venta,JSON.stringify({version:1,cuit_emisor:wsfeSample.cuitEmisor,punto_venta:2,tipo_comprobante:11,tipo_doc_receptor:99,nro_doc_receptor:'0'})])
}
async function reservarFiscal() {
  const frozen=await freezeFiscalRequest({...wsfeSample,importes:{...wsfeSample.importes,total:'1.00',neto:'1.00'}})
  await actor(owner,'service_role')
  return db.query('SELECT persistir_solicitud_fiscal_homologacion($1,$2,$3,0,clock_timestamp())',[id(200),await serializeFiscalRequest(frozen),frozen.sha256])
}
it.each(['RESERVADA','ENVIO_INCIERTO','AUTORIZADA'])('devolución común rechazada sin stock/caja cuando la factura está %s',async fase=>{
  await prepararFiscal();await reservarFiscal()
  if(fase!=='RESERVADA')await db.query('SELECT registrar_intento_fiscal_homologacion($1,$2)',[id(200),id(201)])
  if(fase==='AUTORIZADA')await db.exec("RESET ROLE; UPDATE fiscal_reservas_homologacion SET estado='AUTORIZADA'")
  await actor(cashier)
  await rechazo(()=>devolver(),/facturación reservada o confirmada/)
  expect(await estado()).toEqual({stock:'2.000',lote:'0.000',devoluciones:0,egresos:0})
})
it('devolver antes de reservar impide fiscalizar el total original y no consume número',async()=>{
  await prepararFiscal();await actor(cashier);await devolver()
  await rechazo(()=>reservarFiscal(),/tiene devoluciones/)
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(0)
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_series_homologacion')).rows[0].n).toBe(0)
  expect(await estado()).toEqual({stock:'3.000',lote:'1.000',devoluciones:1,egresos:1})
})
it('preparar sin reserva permite devolución y conserva el ACK recuperable',async()=>{
  await prepararFiscal();await actor(cashier)
  const ack=await devolver();expect(await devolver()).toEqual(ack)
  expect(await estado()).toEqual({stock:'3.000',lote:'1.000',devoluciones:1,egresos:1})
})
it.each(['anon','authenticated','service_role'])('los helpers de trigger no son ejecutables por %s',async role=>{
  await db.exec('RESET ROLE')
  expect((await db.query<{allowed:boolean}>(`SELECT has_function_privilege($1,'public.fiscal_proteger_devolucion_reservada()','EXECUTE') OR has_function_privilege($1,'public.fiscal_proteger_reserva_devuelta()','EXECUTE') allowed`,[role])).rows[0].allowed).toBe(false)
})
it.each(['REPEATABLE READ','SERIALIZABLE'])('snapshot fija %s falla cerrada sin devolución ni reserva',async isolation=>{
  await db.exec(`ROLLBACK; RESET ROLE; BEGIN ISOLATION LEVEL ${isolation}`)
  await actor(cashier);await rechazo(()=>devolver(),/requiere READ COMMITTED/)
  await prepararFiscal();await rechazo(()=>reservarFiscal(),/requiere READ COMMITTED/)
  expect(await estado()).toEqual({stock:'2.000',lote:'0.000',devoluciones:0,egresos:0})
})

it('recupera la misma devolución sin duplicar efectivo, stock ni lote; conserva costo histórico',async()=>{
  const primera=await devolver()
  expect(primera.monto_total).toBe(0.33)
  expect(await devolver()).toEqual(primera)
  expect(await estado()).toEqual({stock:'3.000',lote:'1.000',devoluciones:1,egresos:1})
  expect((await db.query("SELECT c.precio_costo::text costo FROM movimiento_stock_costos c JOIN movimientos_stock m ON m.id=c.movimiento_id WHERE m.tipo='INGRESO'")).rows).toEqual([{costo:'7.25'}])
})
it('tres devoluciones de una venta descontada reintegran 0,33 + 0,34 + 0,33',async()=>{
  expect((await devolver(solicitud(100))).monto_total).toBe(0.33)
  expect((await devolver(solicitud(101))).monto_total).toBe(0.34)
  expect((await devolver(solicitud(102))).monto_total).toBe(0.33)
  await rechazo(()=>devolver(solicitud(103)),/supera|Cantidad|cantidad|original/i)
  expect(await estado()).toEqual({stock:'5.000',lote:'3.000',devoluciones:3,egresos:3})
})
it('producto dañado devuelve dinero sin reingresar unidades ni lote',async()=>{
  expect((await devolver(solicitud(100,1,false))).monto_total).toBe(0.33)
  expect(await estado()).toEqual({stock:'2.000',lote:'0.000',devoluciones:1,egresos:1})
})
it('no acepta cambiar solicitud, actor ni precios suministrados por cliente',async()=>{
  await devolver()
  await rechazo(()=>devolver(solicitud(100,2)),/solicitud original/)
  await actor(owner)
  await rechazo(()=>devolver(),/actor y solicitud/)
  await rechazo(()=>devolver({...solicitud(101),precioUnitario:0.01}),/inválida/)
})
it.each([viewer,other])('rechaza actor sin permiso o de otro comercio %s',async uid=>{
  await actor(uid)
  await rechazo(()=>devolver(),/no autorizado|no disponible|histórico/i)
})
it('caja ajena o cerrada no causa ningún reintegro ni stock',async()=>{
  await rechazo(()=>devolver({...solicitud(),sesionReintegroId:foreignCaja}),/caja abierta/)
  await db.exec('RESET ROLE')
  await db.query("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=now() WHERE id=$1",[caja])
  await actor()
  await rechazo(()=>devolver(),/caja abierta/)
  expect(await estado()).toEqual({stock:'2.000',lote:'0.000',devoluciones:0,egresos:0})
})
it('falla completa si se omite silenciosamente el egreso de caja',async()=>{
  await db.exec(`RESET ROLE; CREATE FUNCTION omitir_reintegro_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir_reintegro_test BEFORE INSERT ON movimientos_caja FOR EACH ROW EXECUTE FUNCTION omitir_reintegro_test();`)
  await actor()
  await rechazo(()=>devolver(),/No se confirmó el reintegro/)
  expect(await estado()).toEqual({stock:'2.000',lote:'0.000',devoluciones:0,egresos:0})
})
it('cuenta corriente y OTRO continúan fuera del primer circuito',async()=>{
  for(const metodo of ['CUENTA_CORRIENTE','OTRO']) await rechazo(()=>devolver({...solicitud(),metodo,sesionReintegroId:null}),/reintegro en efectivo/)
})
it('APIs no escriben directamente ni leen el ledger privado',async()=>{
  await rechazo(()=>db.query('SELECT * FROM devolucion_reposiciones_atomicas'),/permission denied/)
  await rechazo(()=>db.query('DELETE FROM detalles_devolucion'),/permission denied/)
})

it('rechaza fracciones para artículos unitarios sin caja ni stock parcial', async () => {
  await rechazo(() => devolver(solicitud(100, 0.013)), /cantidades enteras/)
  expect(await estado()).toEqual({stock:'2.000',lote:'0.000',devoluciones:0,egresos:0})
})
it('preserva devolución fraccionada de artículos pesables', async () => {
  await db.exec('RESET ROLE'); await db.query('UPDATE productos SET es_pesable=true,unidad_medida=\'KG\' WHERE id=$1',[producto]); await actor()
  const r = await devolver(solicitud(100, 0.5))
  expect(r.monto_total).toBeGreaterThan(0)
})
