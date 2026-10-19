// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

const db = new PGlite()
const id = (n: number) => `ec000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const owner=id(1), cashier=id(2), kid=id(10), caja=id(20), producto=id(30), virtual=id(31), checkout=id(40)
const entrada = { version:1,checkoutId:checkout,kioscoId:kid,usuarioId:cashier,sesionCajaId:caja,fechaHora:new Date().toISOString(),clienteId:null,notas:null,
  tipoAjuste:'NINGUNO',valorAjuste:0,totalEsperado:2500,subtotalesEsperados:[3000,-500],componentesEsperados:[],
  lineas:[{tipo:'PRODUCTO',id:producto,productoId:producto,cantidad:1,sinEnvase:false},{tipo:'DEVOLUCION_ENVASE',id:virtual,envaseId:'vidrio',cantidad:1}],
  pagos:[{id:id(60),medio:'EFECTIVO',montoCentavos:250000,referencia:null}] }
const snapshot = {version:1,id:checkout,kiosco_id:kid,usuario_id:cashier,sesion_caja_id:caja,fecha_hora:entrada.fechaHora,total:2500,notas:null,cliente_id:null,
  detalles:[{id:id(50),producto_id:producto,cantidad:1,precio_unitario:3000,subtotal:3000,sin_envase:false,precio_envase_unitario:0,es_devolucion_envase:false,articulo_libre:null,componentes:[]},
    {id:id(51),producto_id:virtual,cantidad:1,precio_unitario:0,subtotal:-500,sin_envase:false,precio_envase_unitario:500,es_devolucion_envase:true,articulo_libre:{descripcion:'Devolución vidrio',precio_venta:-500},componentes:[]}],
  pagos:[{id:id(60),medio_pago:'EFECTIVO',monto:2500,referencia:null}]}
async function servicio() { await db.exec('RESET ROLE'); await db.query("SELECT set_config('request.jwt.claim.role','service_role',false),set_config('request.jwt.claim.sub','',false)"); await db.exec('SET ROLE service_role') }
async function confirmar(valor: unknown=snapshot, actor=cashier) {
  return (await db.query<{r:unknown}>('SELECT public.confirmar_checkout_envases($1,$2::jsonb,false,NULL) r',[actor,JSON.stringify(valor)])).rows[0].r
}
async function rechazo(action:()=>Promise<unknown>,patron:RegExp) { await db.exec('SAVEPOINT rechazo'); try { await expect(action()).rejects.toThrow(patron) } finally { await db.exec('ROLLBACK TO SAVEPOINT rechazo; RELEASE SAVEPOINT rechazo') } }
async function estado() {
  await db.exec('RESET ROLE')
  return (await db.query<{ stock: string; vacios: number; ventas: number; ledger: number; egresos: number }>(`SELECT (SELECT stock_actual::text FROM productos WHERE id='${producto}') stock,
    (SELECT cantidad FROM envases_saldos WHERE tipo_id='vidrio') vacios,(SELECT count(*)::int FROM ventas) ventas,
    (SELECT count(*)::int FROM envases_checkout_operaciones) ledger,(SELECT count(*)::int FROM movimientos_caja WHERE tipo='EGRESO') egresos`)).rows[0]
}
beforeAll(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  for(const path of ['001_domain.sql','002_identity_helpers.sql',...readdirSync('supabase/bootstrap/steps').sort().map(n=>`steps/${n}`),'900_final_security.sql',
    'commercial/001_commercial_subscription.sql','commercial/002_commercial_write_gate.sql','pilot-operations/001_capabilities.sql','envases/001_shared_ledger.sql','envases/002_checkout_receipts.sql']) await db.exec(readFileSync(`supabase/bootstrap/${path}`,'utf8'))
  await db.exec(readFileSync('supabase/bootstrap/envases/002_checkout_receipts.sql','utf8'))
  for (const path of ['supabase_fase_devolucion_registro_privado.sql','supabase_fase_devolucion_calculo_historico.sql','supabase_fase_devolucion_preparacion_privada.sql','supabase/bootstrap/returns/001_atomic_cash_return.sql','supabase/bootstrap/returns/002_owner_envases_return.sql']) await db.exec(readFileSync(path,'utf8'))
  await db.exec(readFileSync('supabase/bootstrap/returns/002_owner_envases_return.sql','utf8'))
  await db.exec(`INSERT INTO auth.users(id) VALUES('${owner}'),('${cashier}'); INSERT INTO kioscos(id,nombre) VALUES('${kid}','Ensayo');
    INSERT INTO piloto_operaciones_capacidades(kiosco_id,envases,devoluciones_efectivo) VALUES('${kid}',true,true);
    INSERT INTO planes(id,nombre,precio_mensual,max_usuarios) VALUES('${id(90)}','Ensayo',0,3);
    INSERT INTO suscripciones(kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado) VALUES('${kid}','${id(90)}',public.comercial_hoy(),public.comercial_hoy()+30,'ACTIVA');
    INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES('${owner}','${owner}','${kid}','Dueño','DUEÑO'),('${cashier}','${cashier}','${kid}','Caja','CAJERO');
    INSERT INTO sesiones_caja(id,kiosco_id,usuario_id,fecha_apertura) VALUES('${caja}','${kid}','${cashier}',now()-interval '1 day');
    INSERT INTO productos(id,kiosco_id,descripcion,precio_venta,stock_actual) VALUES('${producto}','${kid}','Artículo',3000,10);
    INSERT INTO producto_costos(producto_id,kiosco_id,precio_costo) VALUES('${producto}','${kid}',50);
    INSERT INTO envases_tipos_comercio(kiosco_id,id,nombre,precio) VALUES('${kid}','vidrio','Vidrio',500);
    INSERT INTO envases_saldos(kiosco_id,tipo_id) VALUES('${kid}','vidrio');`)
  await db.query('INSERT INTO checkout_manual_entradas(id,kiosco_id,usuario_id,entrada,snapshot,autorizado_por_auth_id,requiere_supervisor,politica_umbral,politica_revision) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$3,false,15,0)',[checkout,kid,cashier,JSON.stringify(entrada),JSON.stringify(snapshot)])
},120_000)
beforeEach(async()=>{await db.exec('RESET ROLE; BEGIN;');await servicio()})
afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE;')})
afterAll(async()=>{await db.close()})

it('confirma venta y recepción una sola vez, con descuento en ticket y sin egreso extra',async()=>{
  const primera=await confirmar()
  expect(await confirmar()).toEqual(primera)
  expect(await estado()).toEqual({stock:'9.000',vacios:1,ventas:1,ledger:1,egresos:0})
  expect((await db.query('SELECT importe::text importe FROM envases_movimientos')).rows).toEqual([{importe:'500.00'}])
})
it('permite al Dueño recuperar el ACK de la caja, sin repetir la recepción',async()=>{
  const primera=await confirmar()
  expect(await confirmar(snapshot,owner)).toEqual(primera)
  expect((await estado()).vacios).toBe(1)
})
it('un fallo posterior a confirmar la venta revierte también stock, pagos y venta',async()=>{
  await db.exec(`RESET ROLE; CREATE FUNCTION omitir_recepcion_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir_recepcion_test BEFORE INSERT ON envases_movimientos FOR EACH ROW EXECUTE FUNCTION omitir_recepcion_test();`)
  await servicio()
  await rechazo(()=>confirmar(),/No se confirmó el movimiento/)
  expect(await estado()).toEqual({stock:'10.000',vacios:0,ventas:0,ledger:0,egresos:0})
})
it('una cotización congelada mantiene el precio acordado aunque cambie el catálogo',async()=>{
  await db.exec("RESET ROLE; UPDATE envases_tipos_comercio SET precio=800 WHERE id='vidrio'")
  await servicio(); await confirmar()
  await db.exec('RESET ROLE')
  expect((await db.query('SELECT importe::text importe FROM envases_movimientos')).rows).toEqual([{importe:'500.00'}])
})
it('no permite reducir el reconocimiento por prorrateo comercial indebido',async()=>{
  const alterado=structuredClone(snapshot);alterado.detalles[1].subtotal=-450;alterado.detalles[0].subtotal=2950
  await db.exec('RESET ROLE')
  await db.query('UPDATE checkout_manual_entradas SET snapshot=$1::jsonb WHERE id=$2',[JSON.stringify(alterado),checkout])
  await servicio()
  await rechazo(()=>confirmar(alterado),/Reconocimiento/)
  expect((await estado()).ventas).toBe(0)
})
it('conserva la exigencia de supervisor',async()=>{
  await db.exec('RESET ROLE')
  await db.query('UPDATE checkout_manual_entradas SET requiere_supervisor=true WHERE id=$1',[checkout])
  await servicio();await rechazo(()=>confirmar(),/supervisor/)
  expect((await estado()).ventas).toBe(0)
})
it('un navegador autenticado no puede llamar al cierre reservado al servidor',async()=>{
  await db.exec('RESET ROLE; SET ROLE authenticated')
  await rechazo(()=>confirmar(),/permission denied/)
})
it('la anulación heredada no conserva silenciosamente vacíos que fueron acreditados',async()=>{
  await confirmar();await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[owner])
  await db.exec('SET ROLE authenticated')
  await rechazo(()=>db.query('SELECT public.anular_venta_atomica($1,$2,NULL)',[checkout,'Anulación de ensayo']),/recibió envases/)
  expect(await estado()).toEqual({stock:'9.000',vacios:1,ventas:1,ledger:1,egresos:0})
})

const solicitudEnvases = (modalidadEnvases='CONSERVAR_ENVASES', n=100) => ({version:2,id:id(n),ventaId:checkout,metodo:'EFECTIVO_CAJA',motivo:'CAMBIO_PRODUCTO',notas:null,sesionReintegroId:caja,modalidadEnvases,items:[{detalleId:id(50),cantidad:1,reingresaStock:true}]})
async function usuario(uid=owner) {
  await db.exec('RESET ROLE');await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)",[uid]);await db.exec('SET ROLE authenticated')
}
async function devolverEnvases(s:unknown=solicitudEnvases()) {return (await db.query<{r:{monto_total:number;envases:{modalidad:string;credito:number;entregas:unknown[]}}}>('SELECT public.confirmar_devolucion_efectivo_piloto($1::jsonb) r',[JSON.stringify(s)])).rows[0].r}
it.each(['CONSERVAR_ENVASES','ENTREGAR_ENVASES'])('Dueño devuelve ticket completo con %s sin duplicar efectos',async modalidad=>{
  await confirmar();await usuario();const solicitud=solicitudEnvases(modalidad);const ack=await devolverEnvases(solicitud)
  expect(ack.monto_total).toBe(modalidad==='CONSERVAR_ENVASES'?3000:2500)
  expect(ack.envases).toEqual({modalidad,credito:500,entregas:modalidad==='CONSERVAR_ENVASES'?[]:[{tipo_id:'vidrio',cantidad:1,stock_vacios:0}]})
  expect(await devolverEnvases(solicitud)).toEqual(ack)
  expect(await estado()).toEqual({stock:'10.000',vacios:modalidad==='CONSERVAR_ENVASES'?1:0,ventas:1,ledger:1,egresos:1})
  expect((await db.query('SELECT count(*)::int n FROM devoluciones_venta')).rows[0]).toEqual({n:1})
})
it('Cajero no puede elegir ninguna modalidad ni utilizar el contrato anterior para eludirla',async()=>{
  await confirmar();await usuario(cashier)
  await rechazo(()=>devolverEnvases(),/Rol de devolución no autorizado/)
  const {modalidadEnvases:_,...v1}=solicitudEnvases()
  await rechazo(()=>devolverEnvases({...v1,version:1}),/histórico inválido|conciliación/)
  expect((await estado()).egresos).toBe(0)
})
it('rechaza cambio de modalidad en replay y otro reintegro del mismo ticket',async()=>{
  await confirmar();await usuario();await devolverEnvases()
  await rechazo(()=>devolverEnvases(solicitudEnvases('ENTREGAR_ENVASES')),/solicitud original/)
  await rechazo(()=>devolverEnvases(solicitudEnvases('ENTREGAR_ENVASES',101)),/sin devoluciones previas/)
  expect((await estado()).egresos).toBe(1)
})
it('saldo insuficiente no reintegra dinero ni repone productos',async()=>{
  await confirmar();await db.exec('RESET ROLE');await db.exec("UPDATE envases_saldos SET cantidad=0 WHERE tipo_id='vidrio'");await usuario()
  await rechazo(()=>devolverEnvases(solicitudEnvases('ENTREGAR_ENVASES')),/suficientes envases/)
  expect(await estado()).toEqual({stock:'9.000',vacios:0,ventas:1,ledger:1,egresos:0})
})
it('exige devolución completa, modalidad explícita y no admite importes del cliente',async()=>{
  await confirmar();await usuario()
  await rechazo(()=>devolverEnvases({...solicitudEnvases(),items:[{detalleId:id(50),cantidad:0.5,reingresaStock:true}]}),/devolverse completo/)
  await rechazo(()=>devolverEnvases({...solicitudEnvases(),modalidadEnvases:null}),/inválida/)
  await rechazo(()=>devolverEnvases({...solicitudEnvases(),total:1}),/inválida/)
})
it('un fallo al registrar efectivo revierte también la entrega de vacíos',async()=>{
  await confirmar();await db.exec("RESET ROLE; CREATE FUNCTION omitir_reintegro_envase_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$; CREATE TRIGGER omitir_reintegro_envase_test BEFORE INSERT ON movimientos_caja FOR EACH ROW WHEN (NEW.tipo='EGRESO') EXECUTE FUNCTION omitir_reintegro_envase_test();")
  await usuario();await rechazo(()=>devolverEnvases(solicitudEnvases('ENTREGAR_ENVASES')),/No se confirmó el reintegro/)
  expect(await estado()).toEqual({stock:'9.000',vacios:1,ventas:1,ledger:1,egresos:0})
  expect((await db.query("SELECT count(*)::int n FROM envases_movimientos WHERE accion='DEVOLVER_CLIENTE'")).rows[0]).toEqual({n:0})
})
it('recupera el ACK exacto después de suspender comercio y deshabilitar capacidades',async()=>{
  await confirmar();await usuario();const ack=await devolverEnvases();await db.exec("RESET ROLE; UPDATE kioscos SET estado_suscripcion='SUSPENDIDO'; UPDATE piloto_operaciones_capacidades SET envases=false,devoluciones_efectivo=false");await usuario()
  expect(await devolverEnvases()).toEqual(ack)
})
it('una cotización nueva no altera importes ni tipos del reconocimiento original',async()=>{
  await confirmar();await db.exec("RESET ROLE; UPDATE envases_tipos_comercio SET precio=900,activo=false WHERE id='vidrio'");await usuario()
  expect((await devolverEnvases(solicitudEnvases('ENTREGAR_ENVASES'))).monto_total).toBe(2500)
  expect((await estado()).vacios).toBe(0)
})
it('helpers de elección y entrega siguen privados para el navegador',async()=>{
  await usuario()
  await rechazo(()=>db.query("SELECT public.preparar_devolucion_envases_piloto('{}'::jsonb)"),/permission denied/)
  await rechazo(()=>db.query("SELECT public.aplicar_envases_devolucion_piloto('{}'::jsonb,'{}'::jsonb)"),/permission denied/)
})
