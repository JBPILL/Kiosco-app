import { validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import { prepareFiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditDraft, FiscalCreditDraftInput } from '../../supabase/functions/_shared/fiscalCreditDraft'
import { saveFiscalCreditDraft, loadFiscalCreditDraft, cancelFiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraftService'
import { emitAuthorizedFiscalVoucher } from '../../supabase/functions/_shared/fiscalEmissionWorker'
import { validateFiscalPresentationContext } from '../../supabase/functions/_shared/fiscalPresentationContext'
import { prepareFiscalPresentationFacts } from '../../supabase/functions/_shared/fiscalPresentation'
import { correctRejectedFiscalVoucher } from '../../supabase/functions/_shared/fiscalRejectedCorrection'
import { createFiscalClient } from '../lib/fiscalClient'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp'
import { replaceFiscalPreparation } from '../../supabase/functions/_shared/fiscalReplacementService'
import { validatePublicFiscalOwnerReview } from '../../supabase/functions/_shared/fiscalOwnerReview'
// @vitest-environment node
// PostgreSQL embebido con parámetros sintéticos: no acredita ARCA ni JWT hospedados.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { prepareFiscalData, requestFromPreparedFiscalData } from '../../supabase/functions/_shared/fiscalPreparation'
import { freezeFiscalRequest, serializeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import type { FiscalPreparationContext, FiscalPreparationInput } from '../../supabase/functions/_shared/fiscalPreparationContract'
import { wsfeSample } from './fixtures/fiscalWsfe'
import { prepareFiscalVoucher } from '../../supabase/functions/_shared/fiscalPreparationWorker'
import { createFiscalTicketCache } from '../../supabase/functions/_shared/fiscalTicketCache'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import type { WsaaTicketLoader } from '../../supabase/functions/_shared/fiscalTicketCache'
import { vi } from 'vitest'
import { validateFiscalReceipt } from '../../supabase/functions/_shared/fiscalReceipt'
import { validateFiscalDiagnosis } from '../../supabase/functions/_shared/fiscalDiagnosis'
import { cancelFiscalPreparation } from '../../supabase/functions/_shared/fiscalCancellationService'

const db=new PGlite(),kid=crypto.randomUUID(),actor=crypto.randomUUID(),owner=crypto.randomUUID(),sale=crypto.randomUUID(),product=crypto.randomUUID(),op=crypto.randomUUID(),credential=crypto.randomUUID()
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
 const root='supabase/bootstrap'
 for(const file of [join(root,'001_domain.sql'),join(root,'002_identity_helpers.sql'),...readdirSync(join(root,'steps')).sort().map(n=>join(root,'steps',n)),join(root,'900_final_security.sql')])await db.exec(readFileSync(file,'utf8'))
 await db.exec('ALTER TABLE ventas ADD COLUMN afip_cae text')
 // Escenarios históricos001–031 conservan su fase; los de032 instalan el guard
 // dentro de su transacción para comprobar explícitamente la transición y replay.
 for(const file of readdirSync('supabase/pilot-fiscal').filter(n=>/^\d{3}_.*\.sql$/.test(n)&&Number(n.slice(0,3))<=31).sort()){
  const sql=readFileSync(join('supabase/pilot-fiscal',file),'utf8');await db.exec(sql);await db.exec(sql)
  if(file==='011_fiscal_owner_review.sql')await db.query('SELECT fiscal_exigir_actor_preparacion($1,$2)',[crypto.randomUUID(),crypto.randomUUID()])
 }
 await db.query('INSERT INTO auth.users VALUES($1)',[actor])
 await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Preparación sintética')",[kid])
 await db.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Dueño','DUEÑO')",[owner,actor,kid])
 await db.query("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta) VALUES($1,$2,'Ensayo',123.45)",[product,kid])
 await db.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45)',[sale,kid,owner])
 await db.query('INSERT INTO detalles_venta(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,1,123.45,123.45)',[sale,product])
},120000)
beforeEach(async()=>{
 await db.exec('BEGIN')
 await db.query('INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado) VALUES($1,$2,7,$3,$4,true)',[kid,wsfeSample.cuitEmisor,credential,'a'.repeat(64)])
 await db.exec(`INSERT INTO fiscal_parametros_homologacion(revision,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado)
 VALUES(1,'[{"id":5,"descripcion":"Ensayo","comprobantes":[11]}]','[]',repeat('b',64),clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true);
 SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true);`)
})
afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE')})
afterAll(async()=>{await db.close()})
async function context(who=actor,which=sale) {
 return (await db.query<{data:FiscalPreparationContext}>('SELECT cargar_datos_preparacion_homologacion($1,$2) data',[who,which])).rows[0].data
}
function input():FiscalPreparationInput {
 const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,numero:_n,...data}=wsfeSample
 const {total:_total,...importes}=data.importes
 return {condicionEmisor:'MONOTRIBUTO',datos:{...data,importes}}
}
async function prepared(){return prepareFiscalData(await context(),input())}
async function resolve(who=actor,which=sale){return (await db.query<{data:Record<string,unknown>}>('SELECT resolver_preparacion_fiscal_homologacion($1,$2) data',[who,which])).rows[0].data}
async function save(canonical:string,hash:string,id=op,who=actor,which=sale){
 return (await db.query<{data:Record<string,unknown>}>('SELECT guardar_datos_preparacion_homologacion($1,$2,$3,$4,$5) data',[who,which,id,canonical,hash])).rows[0].data
}
async function denied(run:()=>Promise<unknown>){await db.exec('SAVEPOINT denied');await expect(run()).rejects.toThrow();await db.exec('ROLLBACK TO SAVEPOINT denied; RELEASE SAVEPOINT denied')}
async function admin(sql:string,args:unknown[]=[]){await db.exec('RESET ROLE');await db.query(sql,args);await db.exec('SET ROLE service_role')}
const hash=(text:string)=>createHash('sha256').update(text).digest('hex')
function workerFixture(){
 // Las consultas de unidades pasan por SQL031 real; sólo Auth es sintético.
 const flags:Record<string,string>={SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',ARCA_HOMO_BACKEND_ENABLED:'true',ARCA_HOMO_PREPARATION_ENABLED:'true'}
 const mapping:Record<string,string[]>={autorizar_consulta_fiscal_homologacion:['p_actor_auth_id','p_operacion_id'],cargar_fuente_preparacion_homologacion:['p_actor_auth_id','p_operacion_id'],cargar_revision_fiscal_homologacion:['p_operacion_id','p_actor_auth_id'],persistir_preparacion_fiscal_homologacion:['p_actor_auth_id','p_operacion_id','p_canonico','p_sha','p_ultimo_autorizado','p_consultado_en']}
 mapping.cargar_fuente_correccion_rechazo_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id'];mapping.corregir_rechazo_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_sucesora_id','p_intento_id','p_anterior_sha','p_canonico','p_sha','p_verificacion'];mapping.consultar_correccion_rechazo_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id']
 mapping.cargar_observacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_id'];mapping.cargar_constancia_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id']
 mapping.autorizar_conciliacion_revisada_homologacion=['p_actor_auth_id','p_operacion_id'];mapping.cargar_contexto_conciliacion_homologacion=['p_operacion_id'];mapping.consultar_reconciliacion_homologacion=['p_operacion_id','p_id'];mapping.registrar_conciliacion_revisada_homologacion=['p_actor_auth_id','p_binding','p_id','p_operacion_id','p_intento_id','p_sha','p_revision','p_decision']
 mapping.cargar_datos_preparacion_homologacion=['p_actor_auth_id','p_venta_id'];mapping.resolver_preparacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id']
 mapping.sustituir_reserva_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_sucesora_id','p_anterior_sha','p_canonico','p_sha'];mapping.consultar_sustitucion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id']
 mapping.cancelar_preparacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id'];mapping.consultar_cancelacion_preparacion_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id']
 mapping.cargar_contexto_presentacion_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id'];mapping.cargar_presentacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id'];mapping.guardar_presentacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_solicitud_sha','p_canonico','p_sha'];mapping.cargar_revision_presentacion_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_revision_id'];mapping.aprobar_revision_presentacion_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_revision_id','p_solicitud_sha','p_revision','p_presentacion_sha']
 mapping.cargar_preparacion_envio_homologacion=['p_operacion_id'];mapping.autorizar_envio_presentado_homologacion=['p_actor_auth_id','p_operacion_id','p_sha','p_revision_id'];mapping.registrar_envio_revisado_homologacion=['p_actor_auth_id','p_operacion_id','p_intento_id','p_sha','p_autorizacion_id','p_ultimo_autorizado','p_consultado_en']
 mapping.cargar_representacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id']
 mapping.cargar_unidades_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id']
 mapping.cargar_fuente_contexto_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha']
 mapping.cargar_fuente_cuerpo_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha']
 mapping.cargar_fuente_numeracion_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha','p_preparacion_sha']
 mapping.reservar_cuerpo_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha','p_preparacion_sha','p_reserva_id','p_ultimo_autorizado','p_consultado_en']
 mapping.coordinar_ta_nc_homologacion=['p_actor','p_venta','p_operacion','p_caso','p_sha','p_preparacion_sha','p_binding','p_accion','p_intento','p_generacion','p_cifrado']
 mapping.cargar_preparacion_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha']
 mapping.guardar_preparacion_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha','p_contexto_sha','p_entrada']
 mapping.cargar_fuente_comercial_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id'];mapping.cargar_historial_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_despues'];mapping.guardar_borrador_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_canonico','p_sha'];mapping.cargar_borrador_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id'];mapping.cancelar_borrador_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha']
 const rpc=vi.fn<FiscalAuthClient['rpc']>(async(name,args)=>{
  const keys=mapping[name];if(!keys)throw new Error('UNEXPECTED_PRIVATE_RPC')
  await db.exec('SAVEPOINT worker_rpc')
  try{const result=await db.query<{data:unknown}>(`SELECT ${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) data`,keys.map(key=>typeof args[key]==='object'&&args[key]!==null?JSON.stringify(args[key]):args[key]));await db.exec('RELEASE SAVEPOINT worker_rpc');return {data:result.rows[0].data,error:null}}
  catch{await db.exec('ROLLBACK TO SAVEPOINT worker_rpc; RELEASE SAVEPOINT worker_rpc');return {data:null,error:new Error('SQL_DENIED')}}
 })
 const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:actor}},error:null}))
 const load=vi.fn<WsaaTicketLoader>(async binding=>({entorno:'HOMOLOGACION',servicio:'wsfe',cuitEmisor:binding.cuit_emisor,credencialId:binding.credencial_id,certificadoSha256:binding.certificado_sha256,token:'SYNTHETIC_TA',sign:'SYNTHETIC_SIGN',expiresAt:Date.now()+120000}))
 const fetcher=vi.fn<typeof fetch>(async request=>{
  expect((request as Request).headers.get('SOAPAction')).toContain('FECompUltimoAutorizado')
  return new Response('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult><PtoVta>7</PtoVta><CbteTipo>11</CbteTipo><CbteNro>0</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></s:Body></s:Envelope>',{headers:{'content-type':'text/xml'}})
 })
 const deps={admin:{auth:{getUser},rpc},readSecret:(key:string)=>flags[key],cache:createFiscalTicketCache(),load,fetcher}
 return {deps,admin:{auth:{getUser},rpc},flags,rpc,getUser,load,fetcher,run:()=>prepareFiscalVoucher(deps,'SYNTHETIC_JWT',op)}
}
it('devuelve sólo identidad/total/parámetros públicos desde servidor',async()=>{
 const c=await context();expect(c).toEqual({version:1,venta_id:sale,total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,incluye_recepcion_envases:false,revision_parametros:1,
 condiciones:[{id:5,descripcion:'Ensayo',comprobantes:[11]}],alicuotas:[]})
})
it('guarda datos y snapshot una vez, conserva ACK y no reserva ni altera stock/caja',async()=>{
 const p=await prepared(),ack=await save(p.canonico,p.sha256)
 expect(ack).toEqual({operacion_id:op,venta_id:sale,preparacion_sha256:p.sha256,estado:'DATOS_PREPARADOS',emision_habilitada:false})
 expect(await save(p.canonico,p.sha256)).toEqual(ack)
 await db.exec('RESET ROLE')
 const row=(await db.query<{datos:unknown;actor_auth_id:string}>('SELECT datos,actor_auth_id FROM fiscal_preparaciones_homologacion')).rows[0]
 expect(row.actor_auth_id).toBe(actor);expect(row.datos).toEqual(JSON.parse(p.canonico));expect(p.datos).not.toHaveProperty('numero')
 for(const table of ['fiscal_reservas_homologacion','fiscal_solicitudes_homologacion','movimientos_stock','movimientos_caja'])expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
 expect((await db.query<{total:string}>('SELECT total::text FROM ventas')).rows[0].total).toBe('123.45')
})
it('no cambia identidad al reintentar con otro UUID ni cuerpo',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 await denied(()=>save(p.canonico,p.sha256,crypto.randomUUID()))
 const changed=JSON.parse(p.canonico);changed.datos.fecha='20261022';const canon=JSON.stringify(changed)
 await denied(()=>save(canon,hash(canon)))
})
it.each(['anon','authenticated'])('rol %s no consulta ni escribe preparación privada',async role=>{
 const p=await prepared();await db.exec(`SET ROLE ${role}`)
 await denied(()=>context());await denied(()=>save(p.canonico,p.sha256))
 for(const table of ['fiscal_parametros_homologacion','fiscal_preparaciones_homologacion'])await denied(()=>db.query(`SELECT * FROM ${table}`))
})
it.each(['CAJERO','VISOR'])('rol de negocio %s no prepara',async role=>{
 await admin('UPDATE usuarios SET rol=$1 WHERE id=$2',[role,owner]);await denied(()=>context())
})
it('Auth ajeno, comercio suspendido y venta ajena no revelan el contexto',async()=>{
 await denied(()=>context(crypto.randomUUID()));await denied(()=>context(actor,crypto.randomUUID()))
 await admin("UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id=$1",[kid]);await denied(()=>context())
})
it.each(['habilitado=false','consultado_en=clock_timestamp()+interval \'2 hours\',vence_en=clock_timestamp()+interval \'3 hours\'','vence_en=clock_timestamp()-interval \'1 minute\''])('parámetros %s no se usan',async change=>{
 // Se crea otra fila en vez de mutar datos del catálogo inmutable.
 await admin('DELETE FROM fiscal_parametros_homologacion WHERE false')
 await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 if(change!=='habilitado=false')await admin(`INSERT INTO fiscal_parametros_homologacion SELECT 2,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,true FROM fiscal_parametros_homologacion`)
 if(change!=='habilitado=false'){
  await admin('ALTER TABLE fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables')
  await admin(`UPDATE fiscal_parametros_homologacion SET ${change} WHERE revision=2`)
  await admin('ALTER TABLE fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables')
 }
 await denied(()=>context())
})
it('cambio de Auth, emisor o snapshot invalida replay sin reatribuir la solicitud',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>save(p.canonico,p.sha256,op,actor));await denied(()=>save(p.canonico,p.sha256,op,other))
 await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[actor,owner]);await admin('UPDATE fiscal_emisores_homologacion SET revision=2')
 await denied(()=>save(p.canonico,p.sha256));await admin('UPDATE fiscal_emisores_homologacion SET revision=1')
 await admin('UPDATE detalles_venta SET cantidad=2 WHERE venta_id=$1',[sale]);await denied(()=>save(p.canonico,p.sha256))
})
it('error del validador hace rollback de la operación y no deja preparación parcial',async()=>{
 const p=await prepared(),bad=JSON.parse(p.canonico);bad.datos.importes.neto='1.00';const canon=JSON.stringify(bad)
 await denied(()=>save(canon,hash(canon)))
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_operaciones_homologacion')).rows[0].n).toBe(0)
})
it('condición del emisor nula no se interpreta como una declaración explícita',async()=>{
 const p=await prepared(),bad=JSON.parse(p.canonico);bad.condicionEmisor=null;const canon=JSON.stringify(bad)
 await denied(()=>save(canon,hash(canon)))
})
it('recepción de envases bloqueada en DB aunque se omita el formulario',async()=>{
 const p=await prepared();await admin('UPDATE detalles_venta SET es_devolucion_envase=true WHERE venta_id=$1',[sale])
 expect((await context()).incluye_recepcion_envases).toBe(true);await denied(()=>save(p.canonico,p.sha256))
})
it('preparación y catálogo conservan auditoría inmutable',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);await db.exec('RESET ROLE')
 await denied(()=>db.exec("UPDATE fiscal_preparaciones_homologacion SET actor_auth_id=gen_random_uuid()"))
 await denied(()=>db.exec('DELETE FROM fiscal_preparaciones_homologacion'))
 await denied(()=>db.exec("UPDATE fiscal_parametros_homologacion SET condiciones='[]'"))
 await denied(()=>db.exec('DELETE FROM fiscal_parametros_homologacion'))
})
it('enlaza cuerpo final exacto a preparación y reserva un número sólo en ese paso',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 const frozen=await requestFromPreparedFiscalData(p,1),canonical=await serializeFiscalRequest(frozen)
 const run=()=>db.query<{data:{numero:number}}>('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp()) data',[actor,op,canonical,frozen.sha256])
 const result=(await run()).rows[0].data
 expect(result.numero).toBe(1);expect((await run()).rows[0].data).toEqual(result)
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(1)
})
it.each(['fecha','actor','emisor','parametros'])('cambio de %s no permite reservar cuerpo desde preparación previa',async mode=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 let frozen=await requestFromPreparedFiscalData(p,1)
 if(mode==='fecha')frozen=await freezeFiscalRequest({...frozen.solicitud,fecha:'20261022'})
 if(mode==='emisor')await admin('UPDATE fiscal_emisores_homologacion SET revision=2')
 if(mode==='parametros')await admin('INSERT INTO fiscal_parametros_homologacion SELECT 2,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,true FROM fiscal_parametros_homologacion')
 const canonical=await serializeFiscalRequest(frozen)
 await denied(()=>db.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[mode==='actor'?crypto.randomUUID():actor,op,canonical,frozen.sha256]))
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(0)
})
it('resolver una venta sin preparación no crea operación ni exige parámetros/emisor activos',async()=>{
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 expect(await resolve()).toEqual({venta_id:sale,estado:'SIN_PREPARACION',operacion_id:null,preparacion_sha256:null,emision_habilitada:false})
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_operaciones_homologacion')).rows[0].n).toBe(0)
})
it('recupera identidad/estado originales desde venta, sin volver a preparar ni exigir catálogo',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 const expected={venta_id:sale,estado:'DATOS_PREPARADOS',operacion_id:op,preparacion_sha256:p.sha256,emision_habilitada:false}
 expect(await resolve()).toEqual(expected)
 const frozen=await requestFromPreparedFiscalData(p,1),canonical=await serializeFiscalRequest(frozen)
 await db.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[actor,op,canonical,frozen.sha256])
 await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false');await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 expect(await resolve()).toEqual({...expected,estado:'RESERVADA'})
})
it('registro CAE heredado bloquea preparación y se informa sin inventar su validez ni exponerlo',async()=>{
 const p=await prepared();await admin("UPDATE ventas SET afip_cae='SYNTHETIC_REGISTERED_CAE' WHERE id=$1",[sale])
 await denied(()=>context());await denied(()=>save(p.canonico,p.sha256))
 expect(await resolve()).toEqual({venta_id:sale,estado:'REGISTRO_FISCAL_HEREDADO',operacion_id:null,preparacion_sha256:null,emision_habilitada:false})
})
it('no atribuye una preparación al nuevo Auth de un perfil reasignado ni revela su identificador',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>resolve(actor));expect(await resolve(other)).toEqual({venta_id:sale,estado:'REQUIERE_REVISION',operacion_id:null,preparacion_sha256:null,emision_habilitada:false})
 await denied(()=>resolve(other,crypto.randomUUID()))
})
it.each(['anon','authenticated'])('resolver rechaza rol %s antes de consultar existencia',async role=>{
 await db.exec(`SET ROLE ${role}`);await denied(()=>resolve())
})
it('cambiar el snapshot después de preparar requiere revisión y no simula datos utilizables',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);await admin('UPDATE detalles_venta SET cantidad=2 WHERE venta_id=$1',[sale])
 expect(await resolve()).toEqual({venta_id:sale,estado:'REQUIERE_REVISION',operacion_id:null,preparacion_sha256:null,emision_habilitada:false})
})
it('UUID conocido no permite que el nuevo Auth de un perfil revise o apruebe preparación de otro Auth',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 const frozen=await requestFromPreparedFiscalData(p,1),canonical=await serializeFiscalRequest(frozen)
 await db.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[actor,op,canonical,frozen.sha256])
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>db.query('SELECT cargar_revision_fiscal_homologacion($1,$2)',[op,other]))
 await denied(()=>db.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[op,other,crypto.randomUUID(),frozen.sha256]))
})
it('una revisión ajena histórica tampoco permite consumo directo del permiso ni envío privado',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 const frozen=await requestFromPreparedFiscalData(p,1),canonical=await serializeFiscalRequest(frozen)
 await db.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[actor,op,canonical,frozen.sha256])
 const other=crypto.randomUUID(),permission=crypto.randomUUID()
 await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 // Datos sintéticos con privilegio de fixture: simulan revisión creada antes del refuerzo.
 await admin(`WITH instante AS MATERIALIZED (SELECT clock_timestamp() t)
 INSERT INTO fiscal_revisiones_homologacion(id,operacion_id,usuario_id,actor_auth_id,solicitud_sha256,solicitud_revision,credencial_id,certificado_sha256,emisor_revision,creado_en,vence_en)
 SELECT $1,$2,$3,$4,$5,1,$6,$7,1,t,t+interval '10 minutes' FROM instante`,[crypto.randomUUID(),op,owner,other,frozen.sha256,credential,'a'.repeat(64)])
 await admin(`WITH instante AS MATERIALIZED (SELECT clock_timestamp() t)
 INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,creado_en,vence_en)
 SELECT $1,$2,$3,$4,$5,1,true,t,t+interval '30 minutes' FROM instante`,[op,permission,frozen.sha256,credential,'a'.repeat(64)])
 await denied(()=>db.query('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,0,clock_timestamp())',[other,op,crypto.randomUUID(),frozen.sha256,permission]))
 await db.exec('RESET ROLE')
 await denied(()=>db.query('UPDATE fiscal_permisos_emision_homologacion SET usado_por_intento=$1,usado_en=clock_timestamp() WHERE operacion_id=$2',[crypto.randomUUID(),op]))
 expect((await db.query<{usado_por_intento:string|null}>('SELECT usado_por_intento FROM fiscal_permisos_emision_homologacion')).rows[0].usado_por_intento).toBeNull()
 expect((await db.query<{estado:string}>('SELECT estado FROM fiscal_reservas_homologacion')).rows[0].estado).toBe('RESERVADA')
})
it('worker de preparación exige gate propio antes de TA o consulta',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 const f=workerFixture();f.flags.ARCA_HOMO_PREPARATION_ENABLED='false'
 await expect(f.run()).rejects.toThrow('FISCAL_PREPARACION_CUERPO_NO_HABILITADA')
 expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
})
it('worker prepara cuerpo exacto una vez y replay no consulta ni emite',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);const f=workerFixture()
 const result=await f.run();expect(result.estado).toBe('RESERVADA');expect(result.aprobacion).toBeNull();expect(result.solicitud.solicitud.numero).toBe(1)
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.load).toHaveBeenCalledTimes(1);expect(f.fetcher).toHaveBeenCalledTimes(1)
 expect(JSON.stringify(result)).not.toMatch(/SYNTHETIC_TA|SYNTHETIC_SIGN|credencial_id/)
 f.flags.ARCA_HOMO_PREPARATION_ENABLED='false';expect(await f.run()).toEqual(result)
 expect(f.load).toHaveBeenCalledTimes(1);expect(f.fetcher).toHaveBeenCalledTimes(1)
 await db.exec('RESET ROLE')
 for(const table of ['movimientos_stock','movimientos_caja','fiscal_permisos_emision_homologacion'])expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
})
it('ACK perdido de persistencia se recupera por cuerpo durable sin segunda consulta',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);const f=workerFixture(),base=f.rpc.getMockImplementation()!
 f.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);return name==='persistir_preparacion_fiscal_homologacion'?{data:null,error:new Error('lost')}:result})
 expect((await f.run()).estado).toBe('RESERVADA');expect(f.fetcher).toHaveBeenCalledTimes(1)
 expect((await f.run()).estado).toBe('RESERVADA');expect(f.fetcher).toHaveBeenCalledTimes(1)
})
it.each(['actor','emisor'])('cambio de %s durante TA se rechaza antes de consulta de numeración',async mode=>{
 const p=await prepared();await save(p.canonico,p.sha256);const f=workerFixture(),base=f.load.getMockImplementation()!
 f.load.mockImplementation(async(binding,signal)=>{
  if(mode==='emisor')await admin('UPDATE fiscal_emisores_homologacion SET revision=2')
  else {const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])}
  return base(binding,signal)
 })
 await expect(f.run()).rejects.toThrow();expect(f.fetcher).not.toHaveBeenCalled();expect(f.getUser).toHaveBeenCalledTimes(1)
})
it('cambio de emisor tras consulta no guarda un cuerpo ni usa otra identidad',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);const f=workerFixture(),base=f.fetcher.getMockImplementation()!
 f.fetcher.mockImplementation(async(request,options)=>{const result=await base(request,options);await admin('UPDATE fiscal_emisores_homologacion SET revision=2');return result})
 await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1)
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_solicitudes_homologacion')).rows[0].n).toBe(0)
})
it('sin datos explícitos no consulta, y overflow no reserva otro número',async()=>{
 const missing=workerFixture();await expect(missing.run()).rejects.toThrow();expect(missing.load).not.toHaveBeenCalled()
 const p=await prepared();await save(p.canonico,p.sha256);const f=workerFixture(),base=f.fetcher.getMockImplementation()!
 f.fetcher.mockImplementation(async(request,options)=>{const result=await base(request,options);return new Response((await result.text()).replace('<CbteNro>0</CbteNro>','<CbteNro>99999999</CbteNro>'),{headers:{'content-type':'text/xml'}})})
 await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1)
})
it('fuente privada recupera cuerpo existente aunque venciera el catálogo',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);const f=workerFixture();await f.run()
 await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 const result=await db.query<{data:unknown}>('SELECT cargar_fuente_preparacion_homologacion($1,$2) data',[actor,op])
 expect(result.rows[0].data).toEqual({operacion_id:op,estado:'CUERPO_EXISTENTE',contexto:null,canonico:null,preparacion_sha256:null})
})
it('devolución previa bloquea datos y devolución posterior a datos bloquea antes de TA',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 await admin("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor])
 await admin('INSERT INTO devoluciones_venta(venta_id,kiosco_id) VALUES($1,$2)',[sale,kid])
 await denied(()=>context());const f=workerFixture();await expect(f.run()).rejects.toThrow()
 expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
})
it('persistencia sin commit no produce revisión aunque un ACK falso diga éxito',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);const f=workerFixture(),base=f.rpc.getMockImplementation()!
 f.rpc.mockImplementation((name,args)=>name==='persistir_preparacion_fiscal_homologacion'?Promise.resolve({data:{estado:'RESERVADA'},error:null}):base(name,args))
 await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1)
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_solicitudes_homologacion')).rows[0].n).toBe(0)
})

async function approvePreparedPresentation(operation:string,sha:string,id=crypto.randomUUID()){
 const source=(await db.query<{data:{lineas:{detalle_id:string}[]}}>('SELECT cargar_contexto_presentacion_homologacion($1,$2,$3) data',[actor,sale,operation])).rows[0].data
 const facts=await prepareFiscalPresentationFacts({version:1,emisor:{razon_social:'Ensayo',domicilio_comercial:'Calle 1',ingresos_brutos:'Exento',inicio_actividades:'20200101'},receptor:{nombre:'Consumidor final',domicilio:'Sin identificar'},lineas:source.lineas.map(x=>({detalle_id:x.detalle_id,descripcion:'Ensayo histórico'})),otros_impuestos_nacionales_indirectos:'0.00'})
 await db.query('SELECT guardar_presentacion_fiscal_homologacion($1,$2,$3,$4,$5,$6)',[actor,sale,operation,sha,facts.canonico,facts.sha256])
 await db.query('SELECT aprobar_revision_presentacion_homologacion($1,$2,$3,$4,$5,1,$6)',[actor,sale,operation,id,sha,facts.sha256])
 return {id,sha:facts.sha256}
}
async function authorizeReceipt(finalize=true,proposal?:FiscalPreparationInput) {
 const p=proposal?await prepareFiscalData(await context(),proposal):await prepared();await save(p.canonico,p.sha256)
 const frozen=await requestFromPreparedFiscalData(p,1),canonical=await serializeFiscalRequest(frozen)
 await db.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[actor,op,canonical,frozen.sha256])
 const permission=crypto.randomUUID(),attempt=crypto.randomUUID()
 await admin(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,creado_en,vence_en)
 VALUES($1,$2,$3,$4,$5,1,true,clock_timestamp(),clock_timestamp()+interval '30 minutes')`,[op,permission,frozen.sha256,credential,'a'.repeat(64)])
 await approvePreparedPresentation(op,frozen.sha256)
 await db.query('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,0,clock_timestamp())',[actor,op,attempt,frozen.sha256,permission])
 // Autorización sintética validada por el ledger; no se contacta ARCA.
 if(finalize)await db.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[crypto.randomUUID(),op,attempt,frozen.sha256,JSON.stringify({estado:'AUTORIZACION_COINCIDENTE',cae:'11111111111111',vencimiento:'20261031',procesadoEn:null,solicitudSha256:frozen.sha256,puedeReenviar:false})])
 return frozen
}
async function storedReceipt(who=actor,which=sale,operation=op){return (await db.query<{data:unknown}>('SELECT cargar_constancia_fiscal_homologacion($1,$2,$3) data',[who,which,operation])).rows[0].data}
it('constancia privada recupera cuerpo/CAE durable y no altera negocio, sin catálogo/emisor habilitados',async()=>{
 const frozen=await authorizeReceipt()
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 expect(await resolve()).toMatchObject({estado:'AUTORIZADA',operacion_id:op})
 const result=await validateFiscalReceipt(await storedReceipt(),{operationId:op,saleId:sale})
 expect(result.solicitud).toEqual(frozen);expect(result.autorizacion).toEqual({cae:'11111111111111',vencimiento:'20261031',procesado_en:null})
 expect(await storedReceipt()).toEqual(result)
 await db.exec('RESET ROLE')
 for(const table of ['movimientos_stock','movimientos_caja'])expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
 expect((await db.query<{total:string}>('SELECT total::text FROM ventas')).rows[0].total).toBe('123.45')
})
it('constancia no existe con datos preparados ni con sólo revisión aprobada',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);await denied(()=>storedReceipt())
 const frozen=await requestFromPreparedFiscalData(p,1)
 await db.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[actor,op,await serializeFiscalRequest(frozen),frozen.sha256])
 await approvePreparedPresentation(op,frozen.sha256)
 await denied(()=>storedReceipt())
})
it.each(['anon','authenticated'])('constancia privada deniega rol %s incluso con UUID conocidos',async role=>{
 await authorizeReceipt();await db.exec(`SET ROLE ${role}`);await denied(()=>storedReceipt())
})
it('constancia deniega venta/operación ajenas y cuenta reasignada',async()=>{
 await authorizeReceipt();await denied(()=>storedReceipt(actor,crypto.randomUUID()));await denied(()=>storedReceipt(actor,sale,crypto.randomUUID()))
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>storedReceipt(other));await denied(()=>storedReceipt(actor))
})
it.each(["rol='CAJERO'","activo=false","es_superadmin=true,kiosco_id=null"])('constancia deniega perfil con %s',async change=>{
 await authorizeReceipt();await admin(`UPDATE usuarios SET ${change} WHERE id=$1`,[owner]);await denied(()=>storedReceipt())
})
it('constancia no permite consultar un comercio suspendido',async()=>{
 await authorizeReceipt();await admin("UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id=$1",[kid]);await denied(()=>storedReceipt())
})

it.each(["solicitud_sha256=repeat('f',64)","resultado='{}'::jsonb","intento_id=gen_random_uuid()"] )('constancia falla cerrada ante ledger inconsistente: %s',async change=>{
 await authorizeReceipt();await admin(`UPDATE fiscal_autorizaciones_homologacion SET ${change} WHERE operacion_id=$1`,[op]);await denied(()=>storedReceipt())
})

async function diagnosis(who=actor,which=sale,operation=op){return (await db.query<{data:unknown}>('SELECT cargar_diagnostico_fiscal_homologacion($1,$2,$3) data',[who,which,operation])).rows[0].data}
async function receiptAttempt(){await db.exec('RESET ROLE');const row=(await db.query<{intento_id:string}>('SELECT intento_id FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[op])).rows[0];await db.exec('SET ROLE service_role');return row.intento_id}
it('diagnóstico reservado no inventa envío, respuesta ni consulta',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);const body=await workerFixture().run()
 const value=validateFiscalDiagnosis(await diagnosis(),sale,op)
 expect(value).toMatchObject({estado:'RESERVADA',solicitud_sha256:body.solicitud.sha256,recepcion:null,ultima_consulta:null,puedeReenviar:false})
})
it('diagnóstico incierto distingue falta de recepción de rechazo y conserva consulta fallida',async()=>{
 const frozen=await authorizeReceipt(false),attempt=await receiptAttempt()
 expect(validateFiscalDiagnosis(await diagnosis(),sale,op)).toMatchObject({estado:'ENVIO_INCIERTO',recepcion:null,ultima_consulta:null})
 await db.query('SELECT registrar_respuesta_emision_homologacion($1,$2,$3,$4,$5::jsonb)',[actor,op,attempt,frozen.sha256,JSON.stringify({estado:'RECHAZO_RECIBIDO',codigos:[10017],puedeReenviar:false})])
 for(const code of ['RESPUESTA_INVALIDA','SIN_CONFIRMACION'])await db.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[crypto.randomUUID(),op,attempt,frozen.sha256,JSON.stringify({estado:'CONCILIAR',codigo:code,puedeReenviar:false})])
 const result=validateFiscalDiagnosis(await diagnosis(),sale,op)
 expect(result.recepcion).toEqual({estado:'RECHAZO_RECIBIDO',codigos:[10017],puedeReenviar:false});expect(result.ultima_consulta).toEqual({estado:'CONCILIAR',codigo:'SIN_CONFIRMACION'})
 expect(result.estado).toBe('ENVIO_INCIERTO');expect(JSON.stringify(result)).not.toMatch(/"[^"]*(?:credencial|certificado|actor_auth|token|sign|intento_id|cae)[^"]*":/)
})
it('diagnóstico autorizado no depende de emisor/catálogo vigente y coteja constancia durable',async()=>{
 await authorizeReceipt();await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 const result=validateFiscalDiagnosis(await diagnosis(),sale,op);expect(result.estado).toBe('AUTORIZADA');expect(result.ultima_consulta).toEqual({estado:'AUTORIZACION_COINCIDENTE',codigo:null})
 await admin("UPDATE fiscal_autorizaciones_homologacion SET resultado='{}'::jsonb");await denied(()=>diagnosis())
})
it.each(['anon','authenticated'])('diagnóstico privado no es RPC pública para rol %s',async role=>{
 await authorizeReceipt();await db.exec(`SET ROLE ${role}`);await denied(()=>diagnosis())
})
it('diagnóstico rechaza otro Auth, otra venta/operación y Auth reasignado',async()=>{
 await authorizeReceipt();await denied(()=>diagnosis(crypto.randomUUID()));await denied(()=>diagnosis(actor,crypto.randomUUID()));await denied(()=>diagnosis(actor,sale,crypto.randomUUID()))
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>diagnosis(other));await denied(()=>diagnosis(actor))
})
it.each(["rol='CAJERO'","activo=false","es_superadmin=true,kiosco_id=null"])('diagnóstico deniega perfil %s',async change=>{
 await authorizeReceipt();await admin(`UPDATE usuarios SET ${change} WHERE id=$1`,[owner]);await denied(()=>diagnosis())
})
it('diagnóstico no reutiliza permiso histórico del worker para comercio suspendido',async()=>{
 const frozen=await authorizeReceipt(false),attempt=await receiptAttempt();await admin("UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id=$1",[kid])
 await db.query('SELECT registrar_respuesta_emision_homologacion($1,$2,$3,$4,$5::jsonb)',[actor,op,attempt,frozen.sha256,JSON.stringify({estado:'RECHAZO_RECIBIDO',codigos:[],puedeReenviar:false})])
 await denied(()=>diagnosis())
})

async function cancelPreparation(operation=op,who=actor,which=sale){return (await db.query<{data:unknown}>('SELECT cancelar_preparacion_fiscal_homologacion($1,$2,$3) data',[who,which,operation])).rows[0].data}
async function cancelledPreparation(operation=op,who=actor,which=sale){return (await db.query<{data:unknown}>('SELECT consultar_cancelacion_preparacion_homologacion($1,$2,$3) data',[who,which,operation])).rows[0].data}
it('cancela UUID aún no guardado, conserva ACK y bloquea guardado tardío antes de nueva preparación',async()=>{
 const p=await prepared(),expected={operacion_id:op,venta_id:sale,estado:'CANCELADA',emision_habilitada:false}
 expect(await cancelledPreparation()).toBeNull();expect(await cancelPreparation()).toEqual(expected);expect(await cancelPreparation()).toEqual(expected)
 expect(await cancelledPreparation()).toEqual(expected);await denied(()=>save(p.canonico,p.sha256))
 const next=crypto.randomUUID();await save(p.canonico,p.sha256,next);expect(await resolve()).toMatchObject({estado:'DATOS_PREPARADOS',operacion_id:next})
 expect(await cancelPreparation()).toEqual(expected)
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_cancelaciones_preparacion_homologacion')).rows[0].n).toBe(1)
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(0)
})
it('cancela datos sin número y permite corregir en otra identidad conservando hechos originales',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);await cancelPreparation()
 expect(await resolve()).toMatchObject({estado:'SIN_PREPARACION',operacion_id:null})
 const changed=input();changed.datos.fecha='20261022';const corrected=await prepareFiscalData(await context(),changed),next=crypto.randomUUID()
 await save(corrected.canonico,corrected.sha256,next);expect(await resolve()).toMatchObject({operacion_id:next,estado:'DATOS_PREPARADOS'})
 await denied(()=>save(p.canonico,p.sha256));await expect(workerFixture().run()).rejects.toThrow()
 await db.exec('RESET ROLE')
 const history=(await db.query<{id:string;estado:string}>('SELECT id,estado FROM fiscal_operaciones_homologacion ORDER BY estado')).rows
 expect(history).toEqual([{id:op,estado:'CANCELADA'},{id:next,estado:'PREPARADA'}])
 expect((await db.query<{canonico:string}>('SELECT canonico FROM fiscal_preparaciones_homologacion WHERE operacion_id=$1',[op])).rows[0].canonico).toBe(p.canonico)
 for(const table of ['movimientos_stock','movimientos_caja','fiscal_reservas_homologacion'])expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
})
it.each(['RESERVADA','ENVIO_INCIERTO','AUTORIZADA'])('cancelación sin número rechaza estado %s sin modificar reserva/CAE',async state=>{
 if(state==='RESERVADA'){const p=await prepared();await save(p.canonico,p.sha256);await workerFixture().run()}else await authorizeReceipt(state==='AUTORIZADA')
 await denied(()=>cancelPreparation());expect(await cancelledPreparation()).toBeNull();expect(await resolve()).toMatchObject({estado:state,operacion_id:op})
})
it('cancela preparación aunque emisor/catálogo dejen de estar habilitados',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 expect(await cancelPreparation()).toMatchObject({estado:'CANCELADA'});expect(await resolve()).toMatchObject({estado:'SIN_PREPARACION'})
})
it.each(['anon','authenticated'])('cancelación fiscal no permite RPC de rol %s',async role=>{
 await db.exec(`SET ROLE ${role}`);await denied(()=>cancelPreparation());await denied(()=>cancelledPreparation())
})
it.each(['anon','authenticated','service_role'])('auditoría de cancelación no es tabla accesible para %s',async role=>{
 await cancelPreparation();await db.exec(`RESET ROLE; SET ROLE ${role}`)
 await denied(()=>db.query('SELECT * FROM fiscal_cancelaciones_preparacion_homologacion'))
 await denied(()=>db.query('DELETE FROM fiscal_cancelaciones_preparacion_homologacion'))
})
it('cancelación no atribuye preparación a otro Auth ni permite mirar cancelación tras reasignación',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);await denied(()=>cancelPreparation(op,crypto.randomUUID()))
 await cancelPreparation();const replacement=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[replacement]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[replacement,owner])
 await denied(()=>cancelPreparation(op,replacement));await denied(()=>cancelledPreparation(op,replacement));await denied(()=>cancelledPreparation())
})
it('operación cancelada no admite reactivación, modificación de snapshot ni borrado de auditoría',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);await cancelPreparation();await db.exec('RESET ROLE')
 await denied(()=>db.query("UPDATE fiscal_operaciones_homologacion SET estado='PREPARADA' WHERE id=$1",[op]))
 await denied(()=>db.query("UPDATE fiscal_operaciones_homologacion SET contexto='{}'::jsonb WHERE id=$1",[op]))
 await denied(()=>db.query('DELETE FROM fiscal_operaciones_homologacion WHERE id=$1',[op]))
 await denied(()=>db.query('DELETE FROM fiscal_cancelaciones_preparacion_homologacion'))
 await denied(()=>db.query('UPDATE fiscal_cancelaciones_preparacion_homologacion SET cancelado_en=clock_timestamp()'))
})
it('entrada heredada no recrea UUID cancelado ni selecciona arbitrariamente historia cancelada',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);await cancelPreparation()
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor]);await db.exec('SET ROLE authenticated')
 const legacy={version:1,cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,tipo_comprobante:11,tipo_doc_receptor:99,nro_doc_receptor:'0'}
 await denied(()=>db.query('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb)',[op,kid,sale,JSON.stringify(legacy)]))
 const next=crypto.randomUUID(),result=(await db.query<{data:{id:string}}>('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb) data',[next,kid,sale,JSON.stringify(legacy)])).rows[0].data
 expect(result.id).toBe(next)
 await db.exec('SET ROLE service_role');await denied(()=>cancelPreparation(next))
})
it('reaplicar SQL017 preserva cancelaciones y unicidad activa sin volver a imponer unicidad histórica',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);await cancelPreparation();const next=crypto.randomUUID();await save(p.canonico,p.sha256,next)
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/017_fiscal_preparation_cancellation.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec('SET ROLE service_role')
 expect(await cancelledPreparation()).toMatchObject({estado:'CANCELADA'});expect(await resolve()).toMatchObject({operacion_id:next,estado:'DATOS_PREPARADOS'})
 await denied(()=>save(p.canonico,p.sha256,crypto.randomUUID()))
})

it.each(['omitir','revertir'])('trigger que intenta %s cancelación no produce ACK ni auditoría huérfana',async mode=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 await db.exec(`RESET ROLE; CREATE FUNCTION alterar_cancelacion_ensayo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${mode==='omitir'?'RETURN NULL;':"NEW.estado:='PREPARADA'; RETURN NEW;"} END $$;
 CREATE TRIGGER zz_alterar_cancelacion BEFORE UPDATE ON fiscal_operaciones_homologacion FOR EACH ROW EXECUTE FUNCTION alterar_cancelacion_ensayo(); SET ROLE service_role`)
 await denied(()=>cancelPreparation());expect(await cancelledPreparation()).toBeNull();expect(await resolve()).toMatchObject({estado:'DATOS_PREPARADOS',operacion_id:op})
})

it('servicio confirma cancelación SQL tras ACK perdido con una sola identidad y sin red fiscal',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);const f=workerFixture(),base=f.rpc.getMockImplementation()!
 f.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);return name==='cancelar_preparacion_fiscal_homologacion'?{data:null,error:new Error('SYNTHETIC_ACK_LOST')}:result})
 expect(await cancelFiscalPreparation({auth:{getUser:f.getUser},rpc:f.rpc},'SYNTHETIC_SESSION',sale,op)).toMatchObject({estado:'CANCELADA',operacion_id:op})
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect(await resolve()).toMatchObject({estado:'SIN_PREPARACION'})
})
it('reasignación Auth entre escritura y lectura no confirma cierre para el perfil nuevo',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);const f=workerFixture(),base=f.rpc.getMockImplementation()!,replacement=crypto.randomUUID()
 await admin('INSERT INTO auth.users VALUES($1)',[replacement])
 f.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='cancelar_preparacion_fiscal_homologacion'){await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[replacement,owner]);f.getUser.mockResolvedValue({data:{user:{id:replacement}},error:null})}return result})
 await expect(cancelFiscalPreparation({auth:{getUser:f.getUser},rpc:f.rpc},'SYNTHETIC_SESSION',sale,op)).rejects.toThrow('FISCAL_CANCELACION_NO_CONFIRMADA')
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor)).toBe(true)
})

// Sustitución reservada: SQL local sin ARCA, TA ni permiso de emisión heredado.
async function reservedReplacementFixture(){
 const p=await prepared();await save(p.canonico,p.sha256)
 const frozen=await requestFromPreparedFiscalData(p,1),canonical=await serializeFiscalRequest(frozen)
 await db.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[actor,op,canonical,frozen.sha256])
 const changed=JSON.parse(p.canonico);changed.datos.fecha='20261023'
 const successor=crypto.randomUUID(),next=JSON.stringify(changed),nextHash=hash(next)
 const replace=(id=successor,canon=next,sha=nextHash,who=actor,oldHash=frozen.sha256)=>db.query<{data:Record<string,unknown>}>(
  'SELECT sustituir_reserva_fiscal_homologacion($1,$2,$3,$4,$5,$6,$7) data',[who,sale,op,id,oldHash,canon,sha])
 const read=()=>db.query<{data:Record<string,unknown>}>('SELECT consultar_sustitucion_fiscal_homologacion($1,$2,$3) data',[actor,sale,op])
 return {p,frozen,canonical,successor,next,nextHash,replace,read}
}
it('sustituye reservada conservando número, fecha y cuerpo original; replay recupera el mismo cierre',async()=>{
 const f=await reservedReplacementFixture()
 await db.exec('RESET ROLE')
 const before=(await db.query<{data:Record<string,unknown>}>('SELECT to_jsonb(r) data FROM fiscal_reservas_homologacion r')).rows[0].data as Record<string,unknown>
 const series=(await db.query<{data:Record<string,unknown>}>('SELECT to_jsonb(s) data FROM fiscal_series_homologacion s')).rows[0].data
 await db.exec('SET ROLE service_role')
 const ack=(await f.replace()).rows[0].data
 expect(ack).toMatchObject({operacion_id:op,sucesora_id:f.successor,venta_id:sale,numero:1,estado:'SUSTITUIDA',emision_habilitada:false,anterior_sha256:f.frozen.sha256,preparacion_sha256:f.nextHash})
 expect((await f.read()).rows[0].data).toEqual(ack);expect((await f.replace()).rows[0].data).toEqual(ack)
 expect(await resolve()).toMatchObject({estado:'RESERVADA',operacion_id:f.successor})
 await denied(()=>db.query('SELECT registrar_intento_fiscal_homologacion($1,$2)',[op,crypto.randomUUID()]))
 await denied(()=>db.query('SELECT cargar_preparacion_envio_homologacion($1)',[f.successor]))
 await db.exec('RESET ROLE')
 expect((await db.query<{data:Record<string,unknown>}>('SELECT to_jsonb(s) data FROM fiscal_series_homologacion s')).rows[0].data).toEqual(series)
 const after=(await db.query<{data:Record<string,unknown>}>('SELECT to_jsonb(r) data FROM fiscal_reservas_homologacion r')).rows[0].data as Record<string,unknown>
 expect(after).toEqual({...before,operacion_id:f.successor,solicitud_sha256:ack.sucesora_sha256})
 expect((await db.query<{cuerpo_canonico:string}>('SELECT cuerpo_canonico FROM fiscal_solicitudes_homologacion WHERE operacion_id=$1',[op])).rows[0].cuerpo_canonico).toBe(f.canonical)
 expect((await db.query<{canonico:string}>('SELECT canonico FROM fiscal_preparaciones_homologacion WHERE operacion_id=$1',[op])).rows[0].canonico).toBe(f.p.canonico)
 expect((await db.query<{estado:string}>('SELECT estado FROM fiscal_operaciones_homologacion WHERE id=$1',[op])).rows[0].estado).toBe('SUSTITUIDA')
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_revisiones_homologacion WHERE operacion_id=$1',[f.successor])).rows[0].n).toBe(0)
})
it.each(['anon','authenticated'])('sustitución privada deniega rol %s y lectura directa de auditoría',async role=>{
 const f=await reservedReplacementFixture();await db.exec(`SET ROLE ${role}`)
 await denied(()=>f.replace());await denied(()=>f.read());await denied(()=>db.query('SELECT * FROM fiscal_sustituciones_homologacion'))
})
it.each(['actor','hash','sucesora','tipo','total','parametros','emisor','envases','intento'])('sustitución rechaza %s y no deja estado parcial',async mode=>{
 const f=await reservedReplacementFixture();let canon=f.next,id=f.successor,who=actor,oldHash=f.frozen.sha256
 if(mode==='actor')who=crypto.randomUUID()
 if(mode==='hash')oldHash='c'.repeat(64)
 if(mode==='sucesora')id=op
 if(['tipo','total','parametros','envases'].includes(mode)){
  const changed=JSON.parse(canon)
  if(mode==='tipo')changed.datos.tipoComprobante=6
  if(mode==='total')changed.datos.importes.total='1.00'
  if(mode==='parametros')changed.revision_parametros=99
  if(mode==='envases'){
   // Corrupción privilegiada para probar el guard de preparación incluso sin formulario.
   await admin('ALTER TABLE detalles_venta DISABLE TRIGGER fiscal_detalles_reservados')
   await admin('UPDATE detalles_venta SET es_devolucion_envase=true WHERE venta_id=$1',[sale])
   await admin('ALTER TABLE detalles_venta ENABLE TRIGGER fiscal_detalles_reservados')
  }
  canon=JSON.stringify(changed)
 }
 if(mode==='emisor')await admin('UPDATE fiscal_emisores_homologacion SET revision=2')
 if(mode==='intento')await rejectPreparedOperation(op,f.frozen.sha256,'AUSENTE')
 await denied(()=>f.replace(id,canon,hash(canon),who,oldHash))
 expect((await f.read()).rows[0].data).toBeNull()
 await db.exec('RESET ROLE')
 expect((await db.query<{estado:string}>('SELECT estado FROM fiscal_operaciones_homologacion WHERE id=$1',[op])).rows[0].estado).toBe('PREPARADA')
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_operaciones_homologacion WHERE id=$1',[f.successor])).rows[0].n).toBe(0)
 expect((await db.query<{operacion_id:string}>('SELECT operacion_id FROM fiscal_reservas_homologacion')).rows[0].operacion_id).toBe(op)
})
it('revoca permiso anterior sin borrarlo y no hereda autorización en la sucesora',async()=>{
 const f=await reservedReplacementFixture()
 await admin(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,vence_en)
 VALUES($1,$2,$3,$4,repeat('a',64),1,true,clock_timestamp()+interval '10 minutes')`,[op,crypto.randomUUID(),f.frozen.sha256,credential])
 await f.replace();await db.exec('RESET ROLE')
 expect((await db.query('SELECT habilitado,usado_por_intento FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[op])).rows[0]).toEqual({habilitado:false,usado_por_intento:null})
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[f.successor])).rows[0].n).toBe(0)
})
it('historial de sustitución inmutable y replay con otra identidad/datos rechazado',async()=>{
 const f=await reservedReplacementFixture();await f.replace()
 await denied(()=>f.replace(crypto.randomUUID()));const changed=JSON.parse(f.next);changed.datos.fecha='20261024';const canon=JSON.stringify(changed)
 await denied(()=>f.replace(f.successor,canon,hash(canon)))
 await admin('SELECT 1')
 await db.exec('RESET ROLE')
 await denied(()=>db.query('DELETE FROM fiscal_sustituciones_homologacion'))
 await denied(()=>db.query("UPDATE fiscal_operaciones_homologacion SET estado='PREPARADA' WHERE id=$1",[op]))
})
it('sustituciones encadenadas conservan ACK históricos y una única reserva activa',async()=>{
 const f=await reservedReplacementFixture();const first=(await f.replace()).rows[0].data
 const changed=JSON.parse(f.next);changed.datos.fecha='20261024';const canon=JSON.stringify(changed),last=crypto.randomUUID()
 await db.query('SELECT sustituir_reserva_fiscal_homologacion($1,$2,$3,$4,$5,$6,$7)',[actor,sale,f.successor,last,first.sucesora_sha256,canon,hash(canon)])
 expect((await f.read()).rows[0].data).toEqual(first);expect((await f.replace()).rows[0].data).toEqual(first)
 expect(await resolve()).toMatchObject({estado:'RESERVADA',operacion_id:last})
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(1)
})
it('transferencia omitida por trigger no confirma ACK y revierte operación, cuerpo y auditoría',async()=>{
 const f=await reservedReplacementFixture()
 await db.exec('RESET ROLE')
 await db.exec(`CREATE FUNCTION omitir_transferencia_ensayo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
 CREATE TRIGGER omitir_transferencia_ensayo BEFORE UPDATE OF operacion_id ON fiscal_reservas_homologacion FOR EACH ROW EXECUTE FUNCTION omitir_transferencia_ensayo()`)
 await db.exec('SET ROLE service_role')
 await denied(()=>f.replace());expect((await f.read()).rows[0].data).toBeNull()
 expect(await resolve()).toMatchObject({estado:'RESERVADA',operacion_id:op})
 await db.exec('RESET ROLE')
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_solicitudes_homologacion WHERE operacion_id=$1',[f.successor])).rows[0].n).toBe(0)
})
it('reinstalar SQL 018 conserva sustituciones existentes y ACK sin reactivar historial',async()=>{
 const f=await reservedReplacementFixture(),ack=(await f.replace()).rows[0].data
 await db.exec('RESET ROLE; SET CONSTRAINTS ALL IMMEDIATE');await db.exec('SAVEPOINT migration')
 // El archivo transaccional no debe cerrar la transacción externa de fixture.
 const sql=readFileSync('supabase/pilot-fiscal/018_fiscal_reserved_replacement.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec('RELEASE SAVEPOINT migration; SET ROLE service_role')
 expect((await f.read()).rows[0].data).toEqual(ack);expect((await f.replace()).rows[0].data).toEqual(ack)
})

it('servicio+SQL recuperan sustitución tras ACK perdido y la revisión sucesora verifica hash canónico real',async()=>{
 const f=await reservedReplacementFixture(),worker=workerFixture(),impl=worker.rpc.getMockImplementation()!
 worker.rpc.mockImplementation(async(name,args)=>{
  const result=await impl(name,args)
  return name==='sustituir_reserva_fiscal_homologacion'?{data:null,error:new Error('SYNTHETIC_ACK_LOST')}:result
 })
 const ack=await replaceFiscalPreparation(worker.admin,'SYNTHETIC_JWT',sale,op,f.successor,f.frozen.sha256,{canonico:f.next,sha256:f.nextHash})
 const raw=(await db.query<{data:unknown}>('SELECT cargar_revision_fiscal_homologacion($1,$2) data',[f.successor,actor])).rows[0].data
 const review=await validatePublicFiscalOwnerReview(raw,f.successor)
 expect(review.solicitud.sha256).toBe(ack.sucesora_sha256);expect(review.solicitud.solicitud.numero).toBe(1);expect(review.solicitud.solicitud.fecha).toBe('20261023')
 expect(worker.getUser).toHaveBeenCalledTimes(1);expect(worker.load).not.toHaveBeenCalled();expect(worker.fetcher).not.toHaveBeenCalled()
})
it('canónico SQL coincide con revisión para descripciones Unicode, comillas y saltos escapados',async()=>{
 const f=await reservedReplacementFixture(),data=JSON.parse(f.next)
 data.datos.tributos=[{id:1,descripcion:'Tributo “ensayo” ñ 漢字 " / \\ salto\nfinal',base:'0.00',alicuota:'0.0000',importe:'0.00'}]
 const canon=JSON.stringify(data),sha=hash(canon);await f.replace(f.successor,canon,sha)
 const raw=(await db.query<{data:unknown}>('SELECT cargar_revision_fiscal_homologacion($1,$2) data',[f.successor,actor])).rows[0].data
 const review=await validatePublicFiscalOwnerReview(raw,f.successor)
 expect(review.solicitud.solicitud.tributos[0].descripcion).toBe(data.datos.tributos[0].descripcion)
})

it('cliente→HTTP→SQL recupera respuesta perdida y abre revisión real de sucesora sin TA/ARCA',async()=>{
 await reservedReplacementFixture();const worker=workerFixture(),fetcher=vi.fn<typeof fetch>()
 const handler=createFiscalHttpHandler({readSecret:key=>worker.flags[key],createAdmin:()=>worker.admin,fetcher})
 const map=new Map<string,string>(),storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value)},removeItem:(key:string)=>{map.delete(key)}}
 const send=vi.fn(async(command:Record<string,unknown>)=>{
  const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{
   method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(command)}))
  expect(response.status).toBe(200);const result=await response.json()
  if(command.accion==='SUSTITUIR_PREPARACION_FISCAL')throw new Error('SYNTHETIC_RESPONSE_LOST_AFTER_COMMIT')
  return result
 })
 const api=createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage,send})
 const reviewed=await api.review(op),ctx=await api.context(),next=input();next.datos.fecha='20261023'
 const ack=await api.replace(reviewed,next,ctx),review=await api.review(ack.sucesora_id)
 expect(review.operacion_id).not.toBe(op);expect(review.solicitud.sha256).toBe(ack.sucesora_sha256);expect(review.aprobacion).toBeNull()
 expect(review.solicitud.solicitud.numero).toBe(reviewed.solicitud.solicitud.numero);expect(review.solicitud.solicitud.fecha).toBe('20261023')
 expect(api.pendingReplacement()).toBeNull();expect([...map.values()].join('')).not.toContain('numeroDocumento')
 expect((await api.resolve()).operacion_id).toBe(ack.sucesora_id)
 expect(send.mock.calls.filter(([cmd])=>cmd.accion==='SUSTITUIR_PREPARACION_FISCAL')).toHaveLength(1)
 expect(fetcher).not.toHaveBeenCalled();expect(worker.load).not.toHaveBeenCalled();expect(worker.fetcher).not.toHaveBeenCalled()
 await db.exec('RESET ROLE');expect((await db.query<{total:string}>('SELECT total FROM ventas WHERE id=$1',[sale])).rows[0].total).toBe('123.45')
})
it('instalación rechaza cuerpos sucesores de revisión canónica anterior sin reescribir historia',async()=>{
 const f=await reservedReplacementFixture();await f.replace()
 await db.exec('RESET ROLE; SET CONSTRAINTS ALL IMMEDIATE')
 await db.exec('ALTER TABLE fiscal_sustituciones_homologacion DISABLE TRIGGER fiscal_sustitucion_inmutable')
 await db.query("UPDATE fiscal_solicitudes_homologacion SET cuerpo_canonico=cuerpo::text,solicitud_sha256=encode(sha256(convert_to(cuerpo::text,'UTF8')),'hex') WHERE operacion_id=$1",[f.successor])
 await db.query('UPDATE fiscal_reservas_homologacion r SET solicitud_sha256=s.solicitud_sha256 FROM fiscal_solicitudes_homologacion s WHERE s.operacion_id=r.operacion_id AND r.operacion_id=$1',[f.successor])
 await db.query('UPDATE fiscal_sustituciones_homologacion x SET sucesora_sha256=s.solicitud_sha256 FROM fiscal_solicitudes_homologacion s WHERE s.operacion_id=x.sucesora_id AND x.operacion_id=$1',[op])
 await db.exec('ALTER TABLE fiscal_sustituciones_homologacion ENABLE TRIGGER fiscal_sustitucion_inmutable')
 const before=(await db.query<{canon:string}>('SELECT cuerpo_canonico canon FROM fiscal_solicitudes_homologacion WHERE operacion_id=$1',[f.successor])).rows[0].canon
 const sql=readFileSync('supabase/pilot-fiscal/018_fiscal_reserved_replacement.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await denied(()=>db.exec(sql))
 expect((await db.query<{canon:string}>('SELECT cuerpo_canonico canon FROM fiscal_solicitudes_homologacion WHERE operacion_id=$1',[f.successor])).rows[0].canon).toBe(before)
})
it('dos almacenes cliente→HTTP→SQL: perdedora descarta sólo su propuesta y recupera revisión ganadora',async()=>{
 await reservedReplacementFixture();const worker=workerFixture(),fetcher=vi.fn<typeof fetch>()
 const handler=createFiscalHttpHandler({readSecret:key=>worker.flags[key],createAdmin:()=>worker.admin,fetcher})
 const commands:Record<string,unknown>[]=[]
 const send=async(command:Record<string,unknown>)=>{
  commands.push(command)
  const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{
   method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(command)}))
  if(!response.ok)throw new Error('SYNTHETIC_HTTP_CONFLICT')
  return response.json()
 }
 const api=()=>{const map=new Map<string,string>();return createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage:{getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,value)},removeItem:key=>{map.delete(key)}},send})}
 const first=api(),second=api(),review=await first.review(op),ctx=await first.context(),a=input(),b=input();a.datos.fecha='20261023';b.datos.fecha='20261024'
 const won=await first.replace(review,a,ctx)
 await expect(second.replace(review,b,ctx)).rejects.toThrow();const local=second.pendingReplacement()!
 expect((await second.resolve()).operacion_id).toBe(won.sucesora_id);expect(second.pendingReplacement()).not.toBeNull()
 expect(await second.cancelReplacement()).toBe('DESCARTADA');expect(second.pendingReplacement()).toBeNull()
 const state=await second.resolve(),current=await second.review(state.operacion_id!)
 expect(current.operacion_id).toBe(won.sucesora_id);expect(current.solicitud.sha256).toBe(won.sucesora_sha256);expect(current.solicitud.solicitud.fecha).toBe('20261023')
 expect(commands.filter(cmd=>cmd.accion==='CANCELAR_PREPARACION_FISCAL').map(cmd=>cmd.operacion_id)).toEqual([local.successorId])
 expect(fetcher).not.toHaveBeenCalled();expect(worker.load).not.toHaveBeenCalled()
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(1)
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_operaciones_homologacion WHERE id=$1',[local.successorId])).rows[0].n).toBe(0)
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=$1',[local.successorId])).rows[0].n).toBe(1)
})

async function rejectPreparedOperation(operationId:string,sha:string,state='RECHAZO_RECIBIDO'){
 const attempt=crypto.randomUUID(),permission=crypto.randomUUID()
 await admin(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,vence_en)
 VALUES($1,$2,$3,$4,repeat('a',64),1,true,clock_timestamp()+interval '10 minutes')`,[operationId,permission,sha,credential])
 await approvePreparedPresentation(operationId,sha)
 await db.query('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,0,clock_timestamp())',[actor,operationId,attempt,sha,permission])
 if(state!=='AUSENTE')await db.query('SELECT registrar_respuesta_emision_homologacion($1,$2,$3,$4,$5::jsonb)',[actor,operationId,attempt,sha,JSON.stringify({estado:state,codigos:[10017],puedeReenviar:false})])
 await db.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[crypto.randomUUID(),operationId,attempt,sha,JSON.stringify({estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false})])
 return attempt
}
async function rejectedCorrectionFixture(state='RECHAZO_RECIBIDO'){
 const f=await reservedReplacementFixture(),attempt=await rejectPreparedOperation(op,f.frozen.sha256,state)
 const proof={version:1,resultado:'NO_ENCONTRADO',consulta:{entorno:'HOMOLOGACION',cuitEmisor:wsfeSample.cuitEmisor,puntoVenta:7,tipoComprobante:11,numero:1},codigo:602,
  consultado_en:new Date(Date.now()-50).toISOString(),ultimo_autorizado:0,ultimo_consultado_en:new Date().toISOString()}
 const run=(check:unknown=proof,canon=f.next,sha=f.nextHash,who=actor,successor=f.successor)=>db.query<{data:Record<string,unknown>}>(
  'SELECT corregir_rechazo_fiscal_homologacion($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) data',[who,sale,op,successor,attempt,f.frozen.sha256,canon,sha,JSON.stringify(check)])
 const read=()=>db.query<{data:Record<string,unknown>|null}>('SELECT consultar_correccion_rechazo_homologacion($1,$2,$3) data',[actor,sale,op])
 return {...f,attempt,proof,run,read}
}
it('R+ausencia+número frescos crean sucesora sin borrar intento/recepción/consulta ni avanzar serie',async()=>{
 const f=await rejectedCorrectionFixture();await db.exec('RESET ROLE')
 const before=(await db.query<{data:Record<string,unknown>}>('SELECT to_jsonb(r) data FROM fiscal_reservas_homologacion r WHERE operacion_id=$1',[op])).rows[0].data
 const series=(await db.query<{data:unknown}>('SELECT to_jsonb(s) data FROM fiscal_series_homologacion s')).rows[0].data
 await db.exec('SET ROLE service_role');const ack=(await f.run()).rows[0].data
 expect(ack).toMatchObject({operacion_id:op,sucesora_id:f.successor,numero:1,estado:'RECHAZO_CORREGIDO',emision_habilitada:false})
 expect((await f.run()).rows[0].data).toEqual(ack);expect((await f.read()).rows[0].data).toEqual(ack)
 const historical=(await db.query<{data:{respuesta:unknown}}>('SELECT cargar_respuesta_emision_homologacion($1,$2,$3,$4) data',[actor,op,f.attempt,f.frozen.sha256])).rows[0].data
 expect(historical.respuesta).toMatchObject({estado:'RECHAZO_RECIBIDO',puedeReenviar:false})
 const review=await validatePublicFiscalOwnerReview((await db.query<{data:unknown}>('SELECT cargar_revision_fiscal_homologacion($1,$2) data',[f.successor,actor])).rows[0].data,f.successor)
 expect(review.solicitud.sha256).toBe(ack.sucesora_sha256);expect(review.aprobacion).toBeNull();expect(review.solicitud.solicitud.numero).toBe(1)
 await denied(()=>db.query('SELECT cargar_preparacion_envio_homologacion($1)',[f.successor]))
 await denied(()=>db.query('SELECT registrar_intento_fiscal_homologacion($1,$2)',[op,crypto.randomUUID()]))
 await db.exec('RESET ROLE')
 expect((await db.query<{data:unknown}>('SELECT to_jsonb(s) data FROM fiscal_series_homologacion s')).rows[0].data).toEqual(series)
 expect((await db.query<{data:unknown}>('SELECT to_jsonb(r) data FROM fiscal_reservas_homologacion r WHERE operacion_id=$1',[op])).rows[0].data).toEqual({...before,estado:'RECHAZO_CORREGIDO'})
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE numero=1')).rows[0].n).toBe(2)
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reconciliaciones_homologacion WHERE operacion_id=$1',[op])).rows[0].n).toBe(1)
})
it.each(['SIN_CONFIRMACION','APROBACION_RECIBIDA','AUSENTE'])('%s no se transforma en rechazo corregible por un 602',async state=>{
 const f=await rejectedCorrectionFixture(state);await denied(()=>f.run());expect((await f.read()).rows[0].data).toBeNull()
 await db.exec('RESET ROLE');expect((await db.query<{estado:string}>('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[op])).rows[0].estado).toBe('ENVIO_INCIERTO')
})
it.each(['ausente','codigo','serie','numero','ultimo','orden','vencido','futuro','extra','version'])('prueba %s inválida no archiva ni crea preparación',async mode=>{
 const f=await rejectedCorrectionFixture();const proof:Record<string,unknown>=structuredClone(f.proof)
 if(mode==='ausente')delete proof.consultado_en
 if(mode==='codigo')proof.codigo=600
 if(mode==='serie')proof.consulta={...f.proof.consulta,puntoVenta:8}
 if(mode==='numero')proof.consulta={...f.proof.consulta,numero:2}
 if(mode==='ultimo')proof.ultimo_autorizado=1
 if(mode==='orden')proof.ultimo_consultado_en=new Date(Date.now()-5000).toISOString()
 if(mode==='vencido')proof.consultado_en=new Date(Date.now()-180000).toISOString()
 if(mode==='futuro'){proof.consultado_en=new Date(Date.now()+60000).toISOString();proof.ultimo_consultado_en=proof.consultado_en}
 if(mode==='extra')proof.binding='PRIVATE'
 if(mode==='version')proof.version=2
 await denied(()=>f.run(proof));expect((await f.read()).rows[0].data).toBeNull()
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_operaciones_homologacion WHERE id=$1',[f.successor])).rows[0].n).toBe(0)
})
it('datos corregidos incompatibles hacen rollback de archivo, auditoría y cuerpo sucesor',async()=>{
 const f=await rejectedCorrectionFixture(),changed=JSON.parse(f.next);changed.datos.importes.total='1.00';const canon=JSON.stringify(changed)
 await denied(()=>f.run(f.proof,canon,hash(canon)));expect((await f.read()).rows[0].data).toBeNull()
 expect(await resolve()).toMatchObject({estado:'ENVIO_INCIERTO',operacion_id:op})
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(1)
})
it.each(['anon','authenticated','service_role'])('rol %s no lee auditoría; roles públicos no corrigen',async role=>{
 const f=await rejectedCorrectionFixture();await db.exec(`SET ROLE ${role}`)
 await denied(()=>db.query('SELECT * FROM fiscal_rechazos_corregidos_homologacion'))
 if(role!=='service_role'){await denied(()=>f.run());await denied(()=>f.read())}
})
it('Auth ajeno, evidencia contradictoria y autorización confirmada no se archivan',async()=>{
 const f=await rejectedCorrectionFixture();await denied(()=>f.run(f.proof,f.next,f.nextHash,crypto.randomUUID()))
 await db.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[crypto.randomUUID(),op,f.attempt,f.frozen.sha256,JSON.stringify({estado:'CONCILIAR',codigo:'DATOS_DISTINTOS',puedeReenviar:false})])
 await denied(()=>f.run())
 await db.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[crypto.randomUUID(),op,f.attempt,f.frozen.sha256,JSON.stringify({estado:'AUTORIZACION_COINCIDENTE',solicitudSha256:f.frozen.sha256,cae:'11111111111111',vencimiento:'20261031',procesadoEn:null,puedeReenviar:false})])
 await denied(()=>f.run());expect((await f.read()).rows[0].data).toBeNull();expect(await resolve()).toMatchObject({estado:'AUTORIZADA'})
})
it('historial de intento rechazado y raíz/auditoría no se reactivan ni borran',async()=>{
 const f=await rejectedCorrectionFixture();await f.run();await db.exec('RESET ROLE')
 await denied(()=>db.query('DELETE FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[op]))
 await denied(()=>db.query("UPDATE fiscal_reservas_homologacion SET estado='ENVIO_INCIERTO' WHERE operacion_id=$1",[op]))
 await denied(()=>db.query("UPDATE fiscal_operaciones_homologacion SET estado='PREPARADA' WHERE id=$1",[op]))
 await denied(()=>db.query('DELETE FROM fiscal_rechazos_corregidos_homologacion'))
})
it('cadena de rechazos conserva todas las filas del número y una única reserva vigente',async()=>{
 const f=await rejectedCorrectionFixture(),ack=(await f.run()).rows[0].data
 const nextAttempt=await rejectPreparedOperation(f.successor,String(ack.sucesora_sha256)),last=crypto.randomUUID(),data=JSON.parse(f.next);data.datos.fecha='20261024'
 const canon=JSON.stringify(data),proof={...f.proof,consultado_en:new Date(Date.now()-50).toISOString(),ultimo_consultado_en:new Date().toISOString()}
 await db.query('SELECT corregir_rechazo_fiscal_homologacion($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)',[actor,sale,f.successor,last,nextAttempt,ack.sucesora_sha256,canon,hash(canon),JSON.stringify(proof)])
 expect((await f.read()).rows[0].data).toEqual(ack);expect(await resolve()).toMatchObject({estado:'RESERVADA',operacion_id:last})
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>("SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE estado='RECHAZO_CORREGIDO'")).rows[0].n).toBe(2)
 expect((await db.query<{n:number}>("SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE estado='RESERVADA'")).rows[0].n).toBe(1)
})

async function rejectedWorkerFixture(){
 const f=await rejectedCorrectionFixture(),worker=workerFixture();worker.flags.ARCA_HOMO_REJECTION_RECOVERY_ENABLED='true'
 const last=worker.fetcher.getMockImplementation()!
 worker.fetcher.mockImplementation(async request=>{
  const req=request as Request,action=req.headers.get('SOAPAction')
  expect(action).not.toContain('FECAESolicitar')
  if(action?.includes('FECompConsultar'))return new Response('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult><Errors><Err><Code>602</Code><Msg>Ausencia sintética</Msg></Err></Errors></FECompConsultarResult></FECompConsultarResponse></s:Body></s:Envelope>',{headers:{'content-type':'text/xml'}})
  return last(req)
 })
 const run=()=>correctRejectedFiscalVoucher(worker.deps,'SYNTHETIC_JWT',sale,op,f.successor,f.frozen.sha256,{canonico:f.next,sha256:f.nextHash})
 return {...f,...worker,run}
}
it('worker R consulta ausencia→último, revalida con Auth único y recupera commit tras ACK perdido sin emitir',async()=>{
 const f=await rejectedWorkerFixture(),impl=f.rpc.getMockImplementation()!
 f.rpc.mockImplementation(async(name,args)=>{const result=await impl(name,args);return name==='corregir_rechazo_fiscal_homologacion'?{data:null,error:new Error('SYNTHETIC_ACK_LOST')}:result})
 const result=await f.run();expect(result.estado).toBe('RECHAZO_CORREGIDO');expect(result.sucesora_id).toBe(f.successor)
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.load).toHaveBeenCalledTimes(1)
 expect(f.fetcher.mock.calls.map(([req])=>(req as Request).headers.get('SOAPAction'))).toEqual(['"http://ar.gov.afip.dif.FEV1/FECompConsultar"','"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"'])
 const sources=f.rpc.mock.calls.filter(([name])=>name==='cargar_fuente_correccion_rechazo_homologacion');expect(sources).toHaveLength(4)
 for(const [,args] of f.rpc.mock.calls)if('p_actor_auth_id' in args)expect(args.p_actor_auth_id).toBe(actor)
 await db.exec('RESET ROLE');const saved=(await db.query<{v:Record<string,unknown>}>('SELECT verificacion v FROM fiscal_rechazos_corregidos_homologacion WHERE operacion_id=$1',[op])).rows[0].v
 expect(saved).toMatchObject({resultado:'NO_ENCONTRADO',codigo:602,ultimo_autorizado:0});expect(JSON.stringify(saved)).not.toContain('SYNTHETIC_TA')
})
it('recuperación R ya confirmada no carga TA ni consulta de nuevo aunque gate/emisor se cierren',async()=>{
 const f=await rejectedWorkerFixture(),first=await f.run();f.flags.ARCA_HOMO_REJECTION_RECOVERY_ENABLED='false'
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 f.getUser.mockClear();f.load.mockClear();f.fetcher.mockClear();f.rpc.mockClear()
 expect(await f.run()).toEqual(first);expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
 expect(f.rpc.mock.calls.map(([name])=>name)).toEqual(['consultar_correccion_rechazo_homologacion'])
})
it('gate R cerrado por defecto impide cargar TA/consultar o corregir',async()=>{
 const f=await rejectedWorkerFixture();delete f.flags.ARCA_HOMO_REJECTION_RECOVERY_ENABLED
 await expect(f.run()).rejects.toThrow('FISCAL_CORRECCION_RECHAZO_NO_HABILITADA');expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
 expect((await f.read()).rows[0].data).toBeNull()
})
it('revocar gate durante carga de TA falla antes del primer fetch',async()=>{
 const f=await rejectedWorkerFixture(),load=f.load.getMockImplementation()!
 f.load.mockImplementation(async(binding,signal)=>{const ticket=await load(binding,signal);f.flags.ARCA_HOMO_REJECTION_RECOVERY_ENABLED='false';return ticket})
 await expect(f.run()).rejects.toThrow();expect(f.fetcher).not.toHaveBeenCalled();expect((await f.read()).rows[0].data).toBeNull()
})
it.each(['aprobacion','codigo','red','ultimo'])('respuesta %s no permite corregir el rechazo',async mode=>{
 const f=await rejectedWorkerFixture(),impl=f.fetcher.getMockImplementation()!
 f.fetcher.mockImplementation(async(request,init)=>{
  const req=request as Request
  if(mode==='red')throw new Error('PRIVATE_NETWORK')
  const response=await impl(req,init),xml=await response.text()
  if(req.headers.get('SOAPAction')?.includes('FECompConsultar'))return new Response(mode==='aprobacion'?xml.replace('<Errors>','<ResultGet><Resultado>A</Resultado></ResultGet><Errors>'):mode==='codigo'?xml.replace('<Code>602</Code>','<Code>600</Code>'):xml,{headers:{'content-type':'text/xml'}})
  return new Response(mode==='ultimo'?xml.replace('<CbteNro>0</CbteNro>','<CbteNro>1</CbteNro>'):xml,{headers:{'content-type':'text/xml'}})
 })
 await expect(f.run()).rejects.toThrow();expect((await f.read()).rows[0].data).toBeNull();expect(f.getUser).toHaveBeenCalledTimes(1)
 await db.exec('RESET ROLE');expect((await db.query<{estado:string}>('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[op])).rows[0].estado).toBe('ENVIO_INCIERTO')
})
it('Auth reasignado después de verificar sesión no se adopta para corregir ni cargar TA',async()=>{
 const f=await rejectedWorkerFixture(),other=crypto.randomUUID(),impl=f.rpc.getMockImplementation()!;let swapped=false
 await admin('INSERT INTO auth.users VALUES($1)',[other])
 f.rpc.mockImplementation(async(name,args)=>{
  const result=await impl(name,args)
  if(name==='consultar_correccion_rechazo_homologacion'&&!swapped){swapped=true;await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner]);f.getUser.mockResolvedValue({data:{user:{id:other}},error:null})}
  return result
 })
 await expect(f.run()).rejects.toThrow();expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
 for(const [,args] of f.rpc.mock.calls)if('p_actor_auth_id' in args)expect(args.p_actor_auth_id).toBe(actor)
})
it('errores privados de Auth/RPC en worker de rechazo se traducen sin filtrar mensajes',async()=>{
 const f=await rejectedWorkerFixture();f.getUser.mockRejectedValueOnce(new Error('PRIVATE_AUTH_SECRET'))
 await expect(f.run()).rejects.toThrow('FISCAL_RECHAZO_NO_CONFIRMADO');expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
 f.rpc.mockRejectedValueOnce(new Error('PRIVATE_DATABASE_SECRET'))
 await expect(f.run()).rejects.toThrow('FISCAL_RECHAZO_NO_CONFIRMADO');expect(f.load).not.toHaveBeenCalled()
})
it('worker sólo usa fuente de la venta original antes de TA y no consulta para otro tipo/serie',async()=>{
 const f=await rejectedWorkerFixture(),p=JSON.parse(f.next);p.datos.puntoVenta=8;const canon=JSON.stringify(p)
 await expect(correctRejectedFiscalVoucher(f.deps,'SYNTHETIC_JWT',sale,op,f.successor,f.frozen.sha256,{canonico:canon,sha256:hash(canon)})).rejects.toThrow('FISCAL_RECHAZO_NO_CONFIRMADO')
 expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
 await denied(()=>db.query('SELECT cargar_fuente_correccion_rechazo_homologacion($1,$2,$3)',[actor,crypto.randomUUID(),op]))
})
it('sucesora autorizada conserva rechazo anterior y permite recuperar constancia sin duplicar número vigente',async()=>{
 const f=await rejectedCorrectionFixture(),ack=(await f.run()).rows[0].data,nextSha=String(ack.sucesora_sha256)
 const attempt=await rejectPreparedOperation(f.successor,nextSha,'AUSENTE')
 await db.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[crypto.randomUUID(),f.successor,attempt,nextSha,JSON.stringify({estado:'AUTORIZACION_COINCIDENTE',solicitudSha256:nextSha,cae:'11111111111111',vencimiento:'20261031',procesadoEn:null,puedeReenviar:false})])
 expect((await f.read()).rows[0].data).toEqual(ack)
 expect((await db.query<{data:{estado:string}}>('SELECT cargar_constancia_fiscal_homologacion($1,$2,$3) data',[actor,sale,f.successor])).rows[0].data.estado).toBe('AUTORIZADA')
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>("SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE estado='AUTORIZADA'")).rows[0].n).toBe(1)
 expect((await db.query<{n:number}>("SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE estado='RECHAZO_CORREGIDO'")).rows[0].n).toBe(1)
})
it('reaplicar SQL 019 conserva corrección, FKs e historial sin reactivar el intento rechazado',async()=>{
 const f=await rejectedCorrectionFixture(),ack=(await f.run()).rows[0].data
 await db.exec('RESET ROLE; SET CONSTRAINTS ALL IMMEDIATE')
 const sql=readFileSync('supabase/pilot-fiscal/019_fiscal_rejected_correction.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec('SET ROLE service_role')
 expect((await f.read()).rows[0].data).toEqual(ack);expect((await f.run()).rows[0].data).toEqual(ack)
 await denied(()=>db.query('SELECT cargar_fuente_correccion_rechazo_homologacion($1,$2,$3)',[actor,sale,op]))
})
it('inserción de sucesora omitida por trigger revierte archivo de rechazo y conserva reserva original',async()=>{
 const f=await rejectedCorrectionFixture();await db.exec('RESET ROLE')
 await db.exec(`CREATE FUNCTION omitir_reserva_corregida() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
 CREATE TRIGGER omitir_reserva_corregida BEFORE INSERT ON fiscal_reservas_homologacion FOR EACH ROW EXECUTE FUNCTION omitir_reserva_corregida()`)
 await db.exec('SET ROLE service_role');await denied(()=>f.run());expect((await f.read()).rows[0].data).toBeNull()
 expect(await resolve()).toMatchObject({estado:'ENVIO_INCIERTO',operacion_id:op})
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_operaciones_homologacion WHERE id=$1',[f.successor])).rows[0].n).toBe(0)
})

it('cliente→HTTP→SQL guarda propuesta R con gate cerrado y recupera cierre privado tras reinicio sin consultar otra vez',async()=>{
 const f=await rejectedWorkerFixture();f.flags.ARCA_HOMO_REJECTION_RECOVERY_ENABLED='false'
 const handler=createFiscalHttpHandler({readSecret:key=>f.flags[key],createAdmin:()=>f.admin,fetcher:f.fetcher})
 const commands:Record<string,unknown>[]=[]
 const send=async(command:Record<string,unknown>)=>{
  commands.push(command)
  const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{
   method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(command)}))
  if(!response.ok)throw new Error('SYNTHETIC_HTTP_CONFLICT')
  return response.json()
 }
 const map=new Map<string,string>(),storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value)},removeItem:(key:string)=>{map.delete(key)}}
 const api=createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage,send}),review=await api.review(op),ctx=await api.context(),candidate=input();candidate.datos.fecha='20261023'
 await expect(api.replace(review,candidate,ctx,'RECHAZO')).rejects.toThrow()
 const pending=api.pendingReplacement()!;expect(pending).toMatchObject({version:2,kind:'RECHAZO'});expect(f.fetcher).not.toHaveBeenCalled()
 f.flags.ARCA_HOMO_REJECTION_RECOVERY_ENABLED='true'
 const closed=await correctRejectedFiscalVoucher(f.deps,'SYNTHETIC_JWT',sale,op,pending.successorId,pending.previousHash,pending.proposal)
 expect(f.fetcher).toHaveBeenCalledTimes(2);f.flags.ARCA_HOMO_REJECTION_RECOVERY_ENABLED='false';f.fetcher.mockClear();commands.length=0
 const reopened=createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage,send})
 expect((await reopened.resolve()).operacion_id).toBe(closed.sucesora_id);expect(reopened.pendingReplacement()).toBeNull();expect(f.fetcher).not.toHaveBeenCalled()
 const reviewed=await reopened.review(closed.sucesora_id);expect(reviewed.solicitud.sha256).toBe(closed.sucesora_sha256);expect(reviewed.aprobacion).toBeNull()
 expect(commands.some(c=>c.accion==='CORREGIR_RECHAZO_FISCAL')).toBe(false)
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[closed.sucesora_id])).rows[0].n).toBe(0)
})

it('dos terminales R conservan propuestas distintas y la perdedora descarta sólo su UUID tras cierre ganador',async()=>{
 const f=await rejectedWorkerFixture();f.flags.ARCA_HOMO_REJECTION_RECOVERY_ENABLED='false'
 const handler=createFiscalHttpHandler({readSecret:key=>f.flags[key],createAdmin:()=>f.admin,fetcher:f.fetcher})
 const commands:Record<string,unknown>[]=[]
 const send=async(command:Record<string,unknown>)=>{
  commands.push(command)
  const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{
   method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(command)}))
  if(!response.ok)throw new Error('SYNTHETIC_HTTP_CONFLICT')
  return response.json()
 }
 const api=()=>{const map=new Map<string,string>();return createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage:{getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,value)},removeItem:key=>{map.delete(key)}},send})}
 const first=api(),second=api(),r=await first.review(op),ctx=await first.context(),a=input(),b=input();a.datos.fecha='20261023';b.datos.fecha='20261024'
 await expect(first.replace(r,a,ctx,'RECHAZO')).rejects.toThrow();await expect(second.replace(r,b,ctx,'RECHAZO')).rejects.toThrow()
 const winner=first.pendingReplacement()!,loser=second.pendingReplacement()!;expect(winner.successorId).not.toBe(loser.successorId)
 f.flags.ARCA_HOMO_REJECTION_RECOVERY_ENABLED='true'
 const closed=await correctRejectedFiscalVoucher(f.deps,'SYNTHETIC_JWT',sale,op,winner.successorId,winner.previousHash,winner.proposal)
 f.flags.ARCA_HOMO_REJECTION_RECOVERY_ENABLED='false';f.fetcher.mockClear();commands.length=0
 expect((await second.resolve()).operacion_id).toBe(closed.sucesora_id);expect(second.pendingReplacement()).toEqual(loser)
 expect(await second.cancelReplacement()).toBe('DESCARTADA');expect(second.pendingReplacement()).toBeNull()
 expect((await second.resolve()).operacion_id).toBe(closed.sucesora_id);expect((await second.review(closed.sucesora_id)).solicitud.sha256).toBe(closed.sucesora_sha256)
 expect(commands.filter(c=>c.accion==='CANCELAR_PREPARACION_FISCAL').map(c=>c.operacion_id)).toEqual([loser.successorId]);expect(f.fetcher).not.toHaveBeenCalled()
 expect((await first.resolve()).operacion_id).toBe(closed.sucesora_id);expect(first.pendingReplacement()).toBeNull()
})

it('SQL 020 liga conciliación a Auth original de hechos y binding exacto dentro del registro',async()=>{
 const f=await rejectedCorrectionFixture('SIN_CONFIRMACION')
 const binding=(await db.query<{data:Record<string,unknown>}>('SELECT autorizar_conciliacion_revisada_homologacion($1,$2) data',[actor,op])).rows[0].data
 const decision={estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false},id=crypto.randomUUID()
 const write=(who=actor,b:unknown=binding)=>db.query<{data:unknown}>('SELECT registrar_conciliacion_revisada_homologacion($1,$2::jsonb,$3,$4,$5,$6,1,$7::jsonb) data',[who,JSON.stringify(b),id,op,f.attempt,f.frozen.sha256,JSON.stringify(decision)])
 await denied(()=>write(actor,{...binding,revision:2}));await denied(()=>write(actor,{...binding,token:'NOT_ALLOWED'}))
 const ack=(await write()).rows[0].data;expect((await write()).rows[0].data).toEqual(ack)
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>write());await denied(()=>write(other))
 await denied(()=>db.query('SELECT autorizar_conciliacion_revisada_homologacion($1,$2)',[other,op]))
})
it.each(['anon','authenticated'])('SQL 020 no concede consultas/registro privados a %s',async role=>{
 await db.exec(`RESET ROLE; SET ROLE ${role}`)
 await denied(()=>db.query('SELECT autorizar_conciliacion_revisada_homologacion($1,$2)',[actor,op]))
 await denied(()=>db.query('SELECT registrar_conciliacion_revisada_homologacion($1,$2::jsonb,$3,$4,$5,$6,1,$7::jsonb)',[actor,'{}',crypto.randomUUID(),op,crypto.randomUUID(),'a'.repeat(64),'{}']))
})

it('SQL 021 recupera observación pendiente histórica aún con emisor revocado y rechazo corregido',async()=>{
 const f=await rejectedCorrectionFixture();await db.exec('RESET ROLE');const id=(await db.query<{id:string}>('SELECT id FROM fiscal_reconciliaciones_homologacion WHERE operacion_id=$1',[op])).rows[0].id;await db.exec('SET ROLE service_role')
 const read=()=>db.query<{data:Record<string,unknown>|null}>('SELECT cargar_observacion_fiscal_homologacion($1,$2,$3,$4) data',[actor,sale,op,id])
 const before=(await read()).rows[0].data;expect(before).toMatchObject({operacion_id:op,estado:'PENDIENTE_CONCILIACION',solicitud_sha256:f.frozen.sha256})
 await f.run();await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false,revision=revision+1')
 expect((await read()).rows[0].data).toEqual(before)
 expect((await db.query<{data:unknown}>('SELECT cargar_observacion_fiscal_homologacion($1,$2,$3,$4) data',[actor,sale,op,crypto.randomUUID()])).rows[0].data).toBeNull()
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>read());await denied(()=>db.query('SELECT cargar_observacion_fiscal_homologacion($1,$2,$3,$4)',[other,sale,op,id]))
})
it('SQL 021 lectura autorizada exige constancia durable y nunca devuelve campos privados',async()=>{
 const f=await rejectedCorrectionFixture('SIN_CONFIRMACION'),id=crypto.randomUUID()
 const ack=(await db.query<{data:Record<string,unknown>}>('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb) data',[id,op,f.attempt,f.frozen.sha256,JSON.stringify({estado:'AUTORIZACION_COINCIDENTE',solicitudSha256:f.frozen.sha256,cae:'11111111111111',vencimiento:'20261031',procesadoEn:null,puedeReenviar:false})])).rows[0].data
 const read=()=>db.query<{data:unknown}>('SELECT cargar_observacion_fiscal_homologacion($1,$2,$3,$4) data',[actor,sale,op,id])
 expect((await read()).rows[0].data).toEqual(ack);await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');expect((await read()).rows[0].data).toEqual(ack)
 await denied(()=>db.query('SELECT cargar_observacion_fiscal_homologacion($1,$2,$3,$4)',[actor,crypto.randomUUID(),op,id]))
 await db.exec('RESET ROLE; ALTER TABLE fiscal_autorizaciones_homologacion DISABLE TRIGGER USER; DELETE FROM fiscal_autorizaciones_homologacion; ALTER TABLE fiscal_autorizaciones_homologacion ENABLE TRIGGER USER; SET ROLE service_role')
 await denied(()=>read())
})
it.each(['anon','authenticated'])('SQL 021 no permite lectura directa a %s',async role=>{
 await db.exec(`RESET ROLE; SET ROLE ${role}`)
 await denied(()=>db.query('SELECT cargar_observacion_fiscal_homologacion($1,$2,$3,$4)',[actor,sale,op,crypto.randomUUID()]))
})

it('cliente→HTTP→SQL recupera observación confirmada después de gate cerrado sin nueva red',async()=>{
 const f=await rejectedWorkerFixture(),commands:Record<string,unknown>[]=[]
 f.flags.ARCA_HOMO_RECONCILIATION_ENABLED='false'
 const handler=createFiscalHttpHandler({readSecret:key=>f.flags[key],createAdmin:()=>f.admin,fetcher:f.fetcher})
 const send=async(cmd:Record<string,unknown>)=>{
  commands.push(cmd);const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(cmd)}))
  if(!response.ok)throw new Error('HTTP_NOT_CONFIRMED');return response.json()
 }
 const map=new Map<string,string>(),storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value)},removeItem:(key:string)=>{map.delete(key)}}
 const api=createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage,send}),r=await api.review(op)
 await expect(api.reconcile(r)).rejects.toThrow();const record=api.pendingObservation()!;expect(f.fetcher).not.toHaveBeenCalled()
 const binding=(await db.query<{data:unknown}>('SELECT autorizar_conciliacion_revisada_homologacion($1,$2) data',[actor,op])).rows[0].data
 await db.query('SELECT registrar_conciliacion_revisada_homologacion($1,$2::jsonb,$3,$4,$5,$6,1,$7::jsonb)',[actor,JSON.stringify(binding),record.observationId,op,f.attempt,f.frozen.sha256,JSON.stringify({estado:'AUTORIZACION_COINCIDENTE',solicitudSha256:f.frozen.sha256,cae:'11111111111111',vencimiento:'20261031',procesadoEn:null,puedeReenviar:false})])
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');commands.length=0
 const reopened=createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage,send});expect((await reopened.resolve()).estado).toBe('AUTORIZADA');expect(reopened.pendingObservation()).toBeNull()
 expect((await reopened.receipt(op)).solicitud.sha256).toBe(record.hash)
 expect(commands.some(c=>c.accion==='CONCILIAR')).toBe(false);expect(f.fetcher).not.toHaveBeenCalled()
})
it('otra terminal corrige R: obs no ejecutada se cierra sólo por transición durable del mismo cuerpo',async()=>{
 const f=await rejectedWorkerFixture();f.flags.ARCA_HOMO_RECONCILIATION_ENABLED='false'
 const handler=createFiscalHttpHandler({readSecret:key=>f.flags[key],createAdmin:()=>f.admin,fetcher:f.fetcher}),commands:Record<string,unknown>[]=[]
 const send=async(cmd:Record<string,unknown>)=>{
  commands.push(cmd);const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(cmd)}))
  if(!response.ok)throw new Error('HTTP_NOT_CONFIRMED');return response.json()
 }
 const map=new Map<string,string>(),storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value)},removeItem:(key:string)=>{map.delete(key)}}
 const api=createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage,send});await expect(api.reconcile(await api.review(op))).rejects.toThrow();const record=api.pendingObservation()!
 const closed=await f.run();f.fetcher.mockClear();commands.length=0
 expect((await api.resolve()).operacion_id).toBe(closed.sucesora_id);expect(api.pendingObservation()).toBeNull()
 expect(commands.some(c=>c.accion==='CONCILIAR')).toBe(false);expect(f.fetcher).not.toHaveBeenCalled()
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reconciliaciones_homologacion WHERE id=$1',[record.observationId])).rows[0].n).toBe(0)
})

// SQL 022: hechos históricos previos a revisión, sin permiso de emisión.
async function presentationFixture(){
 const f=await reservedReplacementFixture()
 await db.exec('RESET ROLE')
 const detail=(await db.query<{id:string}>('SELECT id FROM detalles_venta WHERE venta_id=$1',[sale])).rows[0].id
 await db.exec('SET ROLE service_role')
 const facts={version:1,emisor:{razon_social:'Comercio ñ "histórico"',domicilio_comercial:'Calle 123',ingresos_brutos:'Exento',inicio_actividades:'20200101'},receptor:{nombre:'Consumidor final',domicilio:'Sin identificar'},lineas:[{detalle_id:detail,descripcion:'Artículo histórico'}],otros_impuestos_nacionales_indirectos:'0.00'}
 const proposal=await prepareFiscalPresentationFacts(facts)
 const read=(who=actor,which=sale)=>db.query<{data:unknown}>('SELECT cargar_presentacion_fiscal_homologacion($1,$2,$3) data',[who,which,op])
 const write=(p=proposal,who=actor)=>db.query<{data:unknown}>('SELECT guardar_presentacion_fiscal_homologacion($1,$2,$3,$4,$5,$6) data',[who,sale,op,f.frozen.sha256,p.canonico,p.sha256])
 return {...f,facts,proposal,read,write}
}
it('representación guarda Unicode canónico, replay exacto y lectura histórica sin emisor vigente',async()=>{
 const f=await presentationFixture();expect((await f.read()).rows[0].data).toBeNull()
 const ack=(await f.write()).rows[0].data
 expect(ack).toMatchObject({operacion_id:op,venta_id:sale,solicitud_sha256:f.frozen.sha256,presentacion_sha256:f.proposal.sha256,emision_habilitada:false})
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false WHERE kiosco_id=$1',[kid])
 expect((await f.read()).rows[0].data).toEqual(ack);expect((await f.write()).rows[0].data).toEqual(ack)
})
it('representación conserva datos originales tras sustitución sin heredarlos a sucesora',async()=>{
 const f=await presentationFixture(),ack=(await f.write()).rows[0].data
 await f.replace();expect((await f.read()).rows[0].data).toEqual(ack)
 expect((await db.query<{data:unknown}>('SELECT cargar_presentacion_fiscal_homologacion($1,$2,$3) data',[actor,sale,f.successor])).rows[0].data).toBeNull()
})
it('representación rechaza cambiar hechos ya guardados',async()=>{
 const f=await presentationFixture();await f.write()
 const other=await prepareFiscalPresentationFacts({...f.facts,receptor:{...f.facts.receptor,nombre:'Otro'}})
 await denied(()=>f.write(other));expect((await f.read()).rows[0].data).toMatchObject({presentacion_sha256:f.proposal.sha256})
})
it.each(['detalle','fecha','impuesto'])('representación exige coherencia con cuerpo y snapshot: %s',async kind=>{
 const f=await presentationFixture()
 if(kind==='detalle')f.facts.lineas[0].detalle_id=crypto.randomUUID()
 if(kind==='fecha')f.facts.emisor.inicio_actividades='20990101'
 if(kind==='impuesto')f.facts.otros_impuestos_nacionales_indirectos='124.00'
 const invalid=await prepareFiscalPresentationFacts(f.facts)
 await denied(()=>f.write(invalid));expect((await f.read()).rows[0].data).toBeNull()
})
it('representación niega Auth ajeno y perfil reasignado',async()=>{
 const f=await presentationFixture();await f.write();const other=crypto.randomUUID()
 await denied(()=>f.read(other));await denied(()=>f.write(f.proposal,other))
 await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>f.read());await denied(()=>f.read(other))
})
it.each(['anon','authenticated','service_role'])('representación no concede tabla directa a %s',async role=>{
 const f=await presentationFixture();await f.write();await db.exec(`SET ROLE ${role}`)
 await denied(()=>db.query('SELECT * FROM fiscal_presentaciones_homologacion'))
 if(role!=='service_role'){await denied(()=>f.read());await denied(()=>f.write())}
})
it('representación inmutable incluso para administrador',async()=>{
 const f=await presentationFixture();await f.write();await db.exec('RESET ROLE')
 await denied(()=>db.query('DELETE FROM fiscal_presentaciones_homologacion WHERE operacion_id=$1',[op]))
 await denied(()=>db.query('UPDATE fiscal_presentaciones_homologacion SET creado_en=clock_timestamp() WHERE operacion_id=$1',[op]))
})
it('representación no acusa éxito si trigger ignora inserción',async()=>{
 const f=await presentationFixture()
 await admin(`CREATE FUNCTION ignore_presentation_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;`)
 await admin('CREATE TRIGGER ignore_presentation_test BEFORE INSERT ON fiscal_presentaciones_homologacion FOR EACH ROW EXECUTE FUNCTION ignore_presentation_test()')
 await denied(()=>f.write());expect((await f.read()).rows[0].data).toBeNull()
})

it('representación inicial se bloquea después de una revisión humana',async()=>{
 const f=await presentationFixture()
 await db.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[op,actor,crypto.randomUUID(),f.frozen.sha256])
 await denied(()=>f.write());expect((await f.read()).rows[0].data).toBeNull()
})
it('representación ya guardada admite replay tras revisión humana, sin cambiar aprobación',async()=>{
 const f=await presentationFixture(),ack=(await f.write()).rows[0].data
 await db.query('SELECT aprobar_revision_presentacion_homologacion($1,$2,$3,$4,$5,1,$6)',[actor,sale,op,crypto.randomUUID(),f.frozen.sha256,f.proposal.sha256])
 expect((await f.write()).rows[0].data).toEqual(ack)
})

async function presentationReviewFixture(){
 const f=await presentationFixture();await f.write();const id=crypto.randomUUID()
 const approve=(sha=f.proposal.sha256,who=actor,revisionId=id)=>db.query<{data:Record<string,unknown>}>('SELECT aprobar_revision_presentacion_homologacion($1,$2,$3,$4,$5,1,$6) data',[who,sale,op,revisionId,f.frozen.sha256,sha])
 const read=()=>db.query<{data:unknown}>('SELECT cargar_revision_presentacion_homologacion($1,$2,$3,$4) data',[actor,sale,op,id])
 return {...f,id,approve,readReview:read}
}
it('revisión de representación exige hash visto, confirma durable y replay no extiende vigencia',async()=>{
 const f=await presentationReviewFixture();expect((await f.readReview()).rows[0].data).toBeNull()
 await denied(()=>f.approve('b'.repeat(64)));expect((await f.readReview()).rows[0].data).toBeNull()
 const ack=(await f.approve()).rows[0].data
 expect(ack).toMatchObject({id:f.id,operacion_id:op,presentacion_sha256:f.proposal.sha256,solicitud_sha256:f.frozen.sha256,emision_habilitada:false})
 expect((await f.readReview()).rows[0].data).toEqual(ack);expect((await f.approve()).rows[0].data).toEqual(ack)
})
it('ruta antigua no puede aprobar representación sin hash esperado',async()=>{
 const f=await presentationReviewFixture()
 await denied(()=>db.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[op,actor,f.id,f.frozen.sha256]))
 expect((await f.readReview()).rows[0].data).toBeNull()
 await denied(()=>db.query('SELECT fiscal_aprobar_revision_sin_presentacion($1,$2,$3,$4,1)',[op,actor,f.id,f.frozen.sha256]))
})
it('revisión de representación deniega cuenta ajena y no conserva aprobación parcial por trigger omitido',async()=>{
 const f=await presentationReviewFixture();await denied(()=>f.approve(f.proposal.sha256,crypto.randomUUID()))
 await admin('CREATE FUNCTION ignore_review_link_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$')
 await admin('CREATE TRIGGER ignore_review_link BEFORE INSERT ON fiscal_revisiones_presentacion_homologacion FOR EACH ROW EXECUTE FUNCTION ignore_review_link_test()')
 await denied(()=>f.approve());expect((await f.readReview()).rows[0].data).toBeNull()
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_revisiones_homologacion WHERE id=$1',[f.id])).rows[0].n).toBe(0)
})
it.each(['anon','authenticated','service_role'])('vínculo de revisión no expone tabla ni escritura directa a %s',async role=>{
 const f=await presentationReviewFixture();await f.approve();await db.exec(`SET ROLE ${role}`)
 await denied(()=>db.query('SELECT * FROM fiscal_revisiones_presentacion_homologacion'))
 if(role!=='service_role'){await denied(()=>f.approve());await denied(()=>f.readReview())}
})

async function presentationPermission(f:Awaited<ReturnType<typeof presentationReviewFixture>>){
 const permission=crypto.randomUUID(),attempt=crypto.randomUUID()
 await admin(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,vence_en)
 VALUES($1,$2,$3,$4,$5,1,true,clock_timestamp()+interval '30 minutes')`,[op,permission,f.frozen.sha256,credential,'a'.repeat(64)])
 return {attempt,send:()=>db.query<{data:Record<string,unknown>}>('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,0,clock_timestamp()) data',[actor,op,attempt,f.frozen.sha256,permission])}
}
it('consumo exige la misma revisión ligada al hash histórico y conserva IDs exactos',async()=>{
 const f=await presentationReviewFixture();await f.approve();const permission=await presentationPermission(f)
 expect((await permission.send()).rows[0].data).toMatchObject({estado:'ENVIO_INCIERTO',nuevo_intento:true})
 await db.exec('RESET ROLE')
 expect((await db.query<{revision_aprobada_id:string;usado_por_intento:string}>('SELECT revision_aprobada_id,usado_por_intento FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[op])).rows[0]).toEqual({revision_aprobada_id:f.id,usado_por_intento:permission.attempt})
})
it('consumo no elige otra aprobación sin vínculo aunque sea más reciente; revierte intención',async()=>{
 const f=await presentationReviewFixture();await f.approve();const permission=await presentationPermission(f)
 // Simula historia inconsistente privilegiada; helper no es ejecutable por service_role.
 await admin('SELECT fiscal_aprobar_revision_sin_presentacion($1,$2,$3,$4,1)',[op,actor,crypto.randomUUID(),f.frozen.sha256])
 await denied(()=>permission.send())
 await db.exec('RESET ROLE')
 expect((await db.query<{estado:string;intento_id:string|null}>('SELECT estado,intento_id FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[op])).rows[0]).toEqual({estado:'RESERVADA',intento_id:null})
 expect((await db.query<{usado_por_intento:string|null}>('SELECT usado_por_intento FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[op])).rows[0].usado_por_intento).toBeNull()
})

it('fuente de representación usa snapshot inmutable, no catálogo actual, y no incluye identidad privada',async()=>{
 const f=await presentationFixture()
 const load=()=>db.query<{data:unknown}>('SELECT cargar_contexto_presentacion_homologacion($1,$2,$3) data',[actor,sale,op])
 const context=validateFiscalPresentationContext((await load()).rows[0].data,sale,op)
 expect(context.lineas).toEqual([{detalle_id:f.facts.lineas[0].detalle_id,cantidad:'1.000',precio_unitario:'123.45',subtotal:'123.45'}])
 await admin("UPDATE productos SET descripcion='Nombre modificado',precio_venta=999 WHERE id=$1",[product])
 expect((await load()).rows[0].data).toEqual(context)
 await denied(()=>db.query('SELECT cargar_contexto_presentacion_homologacion($1,$2,$3)',[crypto.randomUUID(),sale,op]))
 expect(Object.keys(context)).toEqual(['venta_id','operacion_id','solicitud_sha256','lineas'])
})
it('HTTP+SQL guarda hechos y aprueba el hash mostrado, recuperando ACK perdido sin TA o red',async()=>{
 const f=await presentationFixture(),worker=workerFixture(),base=worker.rpc.getMockImplementation()!,revision=crypto.randomUUID()
 worker.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);return ['guardar_presentacion_fiscal_homologacion','aprobar_revision_presentacion_homologacion'].includes(name)?{data:null,error:new Error('SYNTHETIC_ACK_LOST')}:result})
 const handler=createFiscalHttpHandler({readSecret:key=>worker.flags[key],createAdmin:()=>worker.admin,fetcher:worker.fetcher})
 const send=async(command:unknown)=>{
  const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(command)}))
  expect(response.status).toBe(200);return (await response.json()).resultado
 }
 const source=await send({accion:'CONTEXTO_REPRESENTACION',venta_id:sale,operacion_id:op})
 expect(source.solicitud_sha256).toBe(f.frozen.sha256)
 expect(await send({accion:'DATOS_REPRESENTACION',venta_id:sale,operacion_id:op})).toBeNull()
 const record=await send({accion:'GUARDAR_REPRESENTACION',venta_id:sale,operacion_id:op,solicitud_sha256:f.frozen.sha256,propuesta:{canonico:f.proposal.canonico,sha256:f.proposal.sha256}})
 expect(record.presentacion_sha256).toBe(f.proposal.sha256)
 const identity={venta_id:sale,operacion_id:op,revision_id:revision,solicitud_sha256:f.frozen.sha256,revision:1,presentacion_sha256:f.proposal.sha256}
 expect(await send({accion:'APROBACION_REPRESENTACION',...identity})).toBeNull()
 const approved=await send({accion:'APROBAR_REPRESENTACION',...identity})
 expect(approved.presentacion_sha256).toBe(f.proposal.sha256)
 expect(await send({accion:'APROBACION_REPRESENTACION',...identity})).toEqual(approved)
 expect(worker.getUser).toHaveBeenCalledTimes(6);expect(worker.load).not.toHaveBeenCalled();expect(worker.fetcher).not.toHaveBeenCalled()
})
it('cliente→HTTP→SQL captura y aprueba hechos exactos sin persistir PII local ni usar aprobación anterior',async()=>{
 const f=await presentationFixture(),worker=workerFixture(),handler=createFiscalHttpHandler({readSecret:key=>worker.flags[key],createAdmin:()=>worker.admin,fetcher:worker.fetcher}),map=new Map<string,string>(),commands:string[]=[]
 const api=createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage:{getItem:key=>map.get(key)??null,setItem:(key,value)=>{map.set(key,value)},removeItem:key=>{map.delete(key)}},send:async command=>{
  commands.push(String(command.accion))
  const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(command)}))
  if(response.status!==200)throw new Error('SYNTHETIC_UNCONFIRMED')
  const body=await response.json()
  if(command.accion==='GUARDAR_REPRESENTACION'||command.accion==='APROBAR_REPRESENTACION')throw new Error('SYNTHETIC_LOST_RESPONSE')
  return body
 }})
 const review=await api.review(op),source=await api.presentationContext(op)
 expect(await api.presentation(op)).toBeNull()
 const record=await api.savePresentation(review,source,f.facts)
 expect(record.datos.emisor.razon_social).toBe(f.facts.emisor.razon_social)
 const id=api.approvalId(review),approval=await api.approvePresentation(review,record,id)
 expect(approval.presentacion_sha256).toBe(record.presentacion_sha256)
 expect(await api.presentationApproval(review,record,id)).toEqual(approval)
 expect(commands).not.toContain('APROBAR_REVISION');expect(worker.fetcher).not.toHaveBeenCalled();expect(worker.load).not.toHaveBeenCalled()
 expect([...map.values()].join(' ')).not.toContain(f.facts.emisor.razon_social)
 expect([...map.values()].join(' ')).not.toContain(f.facts.lineas[0].descripcion)
})



it('preparación explícita sin hechos no pide TA ni red ni crea intención aunque tenga permiso y aprobación antigua',async()=>{
 const f=await reservedReplacementFixture(),worker=workerFixture(),permission=crypto.randomUUID()
 await db.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[op,actor,crypto.randomUUID(),f.frozen.sha256])
 await admin(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,vence_en)
 VALUES($1,$2,$3,$4,repeat('a',64),1,true,clock_timestamp()+interval '10 minutes')`,[op,permission,f.frozen.sha256,credential])
 worker.flags.ARCA_HOMO_EMISSION_ENABLED='true';worker.flags.ARCA_HOMO_RECONCILIATION_ENABLED='true'
 await expect(emitAuthorizedFiscalVoucher(worker.deps,'SYNTHETIC_JWT',op,crypto.randomUUID(),crypto.randomUUID())).rejects.toThrow()
 expect(worker.load).not.toHaveBeenCalled();expect(worker.fetcher).not.toHaveBeenCalled()
 await denied(()=>db.query('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,0,clock_timestamp())',[actor,op,crypto.randomUUID(),f.frozen.sha256,permission]))
 await db.exec('RESET ROLE');expect((await db.query<{estado:string;intento_id:string|null}>('SELECT estado,intento_id FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[op])).rows[0]).toEqual({estado:'RESERVADA',intento_id:null})
})
it('guard previo a TA confirma cuerpo y revisión ligados, y deniega helper directo incluso con hechos válidos',async()=>{
 const f=await presentationReviewFixture();await f.approve()
 const call=(sha=f.frozen.sha256,id=f.id)=>db.query<{data:Record<string,unknown>}>('SELECT autorizar_envio_presentado_homologacion($1,$2,$3,$4) data',[actor,op,sha,id])
 expect((await call()).rows[0].data).toEqual({operacion_id:op,solicitud_sha256:f.frozen.sha256,presentacion_sha256:f.proposal.sha256,revision_id:f.id,emision_habilitada:false})
 await denied(()=>call('b'.repeat(64)));await denied(()=>call(f.frozen.sha256,crypto.randomUUID()))
 await denied(()=>db.query('SELECT registrar_intento_fiscal_homologacion($1,$2)',[op,crypto.randomUUID()]))
 await denied(()=>db.query('SELECT fiscal_exigir_presentacion_envio($1,$2,$3,$4)',[actor,op,f.frozen.sha256,f.id]))
})
it('un cambio de parámetros después de revisión bloquea intención y no usa permiso',async()=>{
 const f=await presentationReviewFixture();await f.approve();const permission=await presentationPermission(f)
 await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 await denied(()=>permission.send())
 await db.exec('RESET ROLE');expect((await db.query<{usado_por_intento:string|null}>('SELECT usado_por_intento FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[op])).rows[0].usado_por_intento).toBeNull()
})
it('un cuerpo persistido por entrada heredada no puede saltar los datos explícitos aprobados',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 const original=await requestFromPreparedFiscalData(p,1),changed=await freezeFiscalRequest({...original.solicitud,fecha:'20261023'}),canonical=await serializeFiscalRequest(changed)
 await db.query('SELECT persistir_solicitud_fiscal_homologacion($1,$2,$3,0,clock_timestamp())',[op,canonical,changed.sha256])
 const review=await approvePreparedPresentation(op,changed.sha256)
 await denied(()=>db.query('SELECT autorizar_envio_presentado_homologacion($1,$2,$3,$4)',[actor,op,changed.sha256,review.id]))
})

async function representation(who=actor){return (await db.query<{data:unknown}>('SELECT cargar_representacion_fiscal_homologacion($1,$2,$3) data',[who,sale,op])).rows[0].data}
it('representación autorizada une CAE, datos aprobados y detalle original sin catálogo o emisor vigente',async()=>{
 await authorizeReceipt();const first=await validateFiscalRepresentation(await representation(),sale,op)
 expect(first.condicion_emisor).toBe('MONOTRIBUTO');expect(first.condicion_receptor).toBe('Ensayo')
 expect(first.contexto.lineas[0]).toMatchObject({cantidad:'1.000',precio_unitario:'123.45',subtotal:'123.45'})
 await admin("UPDATE productos SET descripcion='Nombre posterior',precio_venta=999 WHERE id=$1",[product])
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false,revision=2')
 await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 expect(await validateFiscalRepresentation(await representation(),sale,op)).toEqual(first)
 await denied(()=>representation(crypto.randomUUID()))
})
it('revisión aprobada sin autorización no se convierte en representación fiscal',async()=>{
 const f=await presentationReviewFixture();await f.approve();await denied(()=>representation())
})
it('representación rechaza vínculo consumido inconsistente sin perder la constancia original',async()=>{
 await authorizeReceipt();const receipt=await storedReceipt()
 await admin('ALTER TABLE fiscal_revisiones_presentacion_homologacion DISABLE TRIGGER fiscal_revision_presentacion_inmutable')
 await admin("UPDATE fiscal_revisiones_presentacion_homologacion SET presentacion_sha256=repeat('b',64)")
 await admin('ALTER TABLE fiscal_revisiones_presentacion_homologacion ENABLE TRIGGER fiscal_revision_presentacion_inmutable')
 await denied(()=>representation());expect(await storedReceipt()).toEqual(receipt)
})
it('representación comprueba vigencia al consumo histórico, no al momento de imprimir',async()=>{
 await authorizeReceipt();await representation()
 await admin('ALTER TABLE fiscal_revisiones_homologacion DISABLE TRIGGER fiscal_revision_inmutable')
 await admin("UPDATE fiscal_revisiones_homologacion SET creado_en=clock_timestamp()-interval '3 minutes',vence_en=clock_timestamp()-interval '2 minutes'")
 await admin('ALTER TABLE fiscal_revisiones_homologacion ENABLE TRIGGER fiscal_revision_inmutable')
 await denied(()=>representation())
})
it('representación HTTP usa un Auth verificado y no expone permiso, revisión privada o custodia',async()=>{
 await authorizeReceipt();const f=workerFixture(),handler=createFiscalHttpHandler({readSecret:key=>f.flags[key],createAdmin:()=>f.admin,fetcher:f.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'REPRESENTACION_COMPROBANTE',venta_id:sale,operacion_id:op})}))
 expect(response.status).toBe(200);const body=await response.json()
 expect(Object.keys(body.resultado.hechos)).not.toContain('datos')
 expect((await validateFiscalRepresentation(body.resultado,sale,op)).constancia.estado).toBe('AUTORIZADA')
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.rpc).toHaveBeenCalledTimes(1);expect(f.fetcher).not.toHaveBeenCalled();expect(f.load).not.toHaveBeenCalled()
})
it('historia comercial no conciliada no recibe un ajuste inventado para representar el CAE',async()=>{
 await admin('UPDATE detalles_venta SET subtotal=120 WHERE venta_id=$1',[sale])
 await authorizeReceipt();const receipt=await storedReceipt()
 await denied(()=>representation());expect(await storedReceipt()).toEqual(receipt)
})
it.each(['anon','authenticated'])('representación autorizada no concede acceso directo al rol %s',async role=>{
 await authorizeReceipt();await db.exec(`SET ROLE ${role}`);await denied(()=>representation())
})

async function creditReservationFixture(taxed=false,quantity=2){
 await admin('UPDATE detalles_venta SET cantidad=$2,precio_unitario=61.72 WHERE venta_id=$1',[sale,quantity])
 let proposal: FiscalPreparationInput|undefined
 if(taxed){
  await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
  await admin(`INSERT INTO fiscal_parametros_homologacion VALUES(2,'[{"id":5,"descripcion":"CF ensayo","comprobantes":[6]}]','[{"id":5,"descripcion":"21% ensayo"}]',$1,clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',true)`,['b'.repeat(64)])
  const old=input();proposal={condicionEmisor:'RESPONSABLE_INSCRIPTO',datos:{...old.datos,tipoComprobante:6,importes:{neto:'100',iva:'21',noGravado:'0',exento:'0',tributos:'2.45'},iva:[{id:5,base:'100',importe:'21'}],tributos:[{id:99,descripcion:'Tributo ensayo',base:'100',alicuota:'2.45',importe:'2.45'}]}}
 }
 await authorizeReceipt(true,proposal)
 const source=await validateFiscalRepresentation(await representation(),sale,op),body=source.constancia.solicitud.solicitud
 const today=(await db.query<{v:string}>(`SELECT to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYYMMDD') v`)).rows[0].v
 const draftInput: FiscalCreditDraftInput={version:1,solicitud_id:crypto.randomUUID(),fecha:today,motivo:'Devolución sintética',condicion_iva_receptor:5,
  lineas:[{detalle_id:source.contexto.lineas[0].detalle_id,cantidad:'2.000',importe:body.importes.total,reingresa_stock:true}],importes:structuredClone(body.importes),iva:structuredClone(body.iva),tributos:structuredClone(body.tributos)}
 const make=(value=draftInput)=>prepareFiscalCreditDraft(source,value,today)
 const write=async(p:Readonly<FiscalCreditDraft>,who=actor)=>(await db.query<{data:Record<string,unknown>}>('SELECT guardar_borrador_nc_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,p.canonico,p.sha256])).rows[0].data
 const read=async(p:Readonly<FiscalCreditDraft>,who=actor)=>(await db.query<{data:Record<string,unknown>|null}>('SELECT cargar_borrador_nc_homologacion($1,$2,$3,$4) data',[who,sale,op,p.datos.solicitud_id])).rows[0].data
 const cancel=async(p:Readonly<FiscalCreditDraft>,who=actor)=>(await db.query<{data:Record<string,unknown>}>('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,p.datos.solicitud_id,p.sha256])).rows[0].data
 const partial=(amount:string,qty='1.000',id=crypto.randomUUID()):FiscalCreditDraftInput=>({...draftInput,solicitud_id:id,lineas:[{...draftInput.lineas[0],cantidad:qty,importe:amount}],importes:{...draftInput.importes,total:amount,neto:amount}})
 return {source,input:draftInput,today,make,write,read,cancel,partial}
}
it('NC guarda saldo una vez con ACK recuperable y sin habilitar emisión, efectivo o stock',async()=>{
 const f=await creditReservationFixture(),p=await f.make(),ack=await f.write(p)
 expect(ack).toEqual({version:1,entorno:'HOMOLOGACION',solicitud_id:p.datos.solicitud_id,venta_id:sale,operacion_origen_id:op,propuesta_sha256:p.sha256,estado:'SALDO_RESERVADO_NO_EMITIR',emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
 expect(await f.write(p)).toEqual(ack);expect(await f.read(p)).toEqual(ack)
 await db.exec('RESET ROLE')
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_borradores_homologacion')).rows[0].n).toBe(1)
 for(const t of ['movimientos_stock','movimientos_caja','devoluciones_venta'])expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${t}`)).rows[0].n).toBe(0)
 expect((await db.query<{v:string}>('SELECT total::text v FROM ventas WHERE id=$1',[sale])).rows[0].v).toBe('123.45')
})
it('NC reserva centavos acumulativos y cancela en orden inverso sin reactivar identidad',async()=>{
 const f=await creditReservationFixture(),a=await f.make(f.partial('61.73')),b=await f.make(f.partial('61.72'))
 await f.write(a);await f.write(b)
 const extra=await f.make(f.partial('61.73'));await denied(()=>f.write(extra))
 await denied(()=>f.cancel(a));expect(await f.cancel(b)).toMatchObject({estado:'CANCELADA'});expect(await f.cancel(b)).toMatchObject({estado:'CANCELADA'})
 expect(await f.cancel(a)).toMatchObject({estado:'CANCELADA'});expect(await f.write(a)).toMatchObject({estado:'CANCELADA'})
 const full=await f.make({...f.input,solicitud_id:crypto.randomUUID()});expect(await f.write(full)).toMatchObject({estado:'SALDO_RESERVADO_NO_EMITIR'})
})
it('NC rechaza prorrateo comercial diferente aunque sume y sea inferior a factura',async()=>{
 const f=await creditReservationFixture(),p=await f.make(f.partial('60.00'));await denied(()=>f.write(p))
 expect(await f.read(p)).toBeNull()
})
it('NC rollback no consume saldo ni deja caso; ACK perdido recupera misma identidad',async()=>{
 const f=await creditReservationFixture(),p=await f.make()
 await db.exec('SAVEPOINT nc_crash');await f.write(p);await db.exec('ROLLBACK TO SAVEPOINT nc_crash; RELEASE SAVEPOINT nc_crash')
 expect(await f.read(p)).toBeNull();const ack=await f.write(p);expect(await f.read(p)).toEqual(ack)
})
it('NC guarda IVA y tributos explícitos; saldo por tributo incluye base y centavos sin truncar',async()=>{
 const f=await creditReservationFixture(true)
 const partial=(amount:string,tax:string,base:string)=>({...f.input,solicitud_id:crypto.randomUUID(),lineas:[{...f.input.lineas[0],cantidad:'1.000',importe:amount}],importes:{...f.input.importes,total:amount,neto:'50.00',iva:'10.50',tributos:tax},iva:[{id:5,base:'50.00',importe:'10.50'}],tributos:[{...f.input.tributos[0],base,importe:tax}]})
 await f.write(await f.make(partial('61.73','1.23','75.00')))
 const over=await f.make(partial('61.72','1.22','75.00'));await denied(()=>f.write(over))
 const remainder=await f.make(partial('61.72','1.22','25.00'));expect(await f.write(remainder)).toMatchObject({estado:'SALDO_RESERVADO_NO_EMITIR'})
})
it.each(['CAJERO','VISOR'])('NC rol %s no crea/lee/cancela casos',async role=>{
 const f=await creditReservationFixture(),p=await f.make();await f.write(p);await admin('UPDATE usuarios SET rol=$1 WHERE id=$2',[role,owner])
 await denied(()=>f.read(p));await denied(()=>f.write(p));await denied(()=>f.cancel(p))
})
it('NC Auth reasignado rechaza cuenta original y nueva, incluida recuperación histórica',async()=>{
 const f=await creditReservationFixture(),p=await f.make();await f.write(p)
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 for(const who of [actor,other]){await denied(()=>f.read(p,who));await denied(()=>f.write(p,who));await denied(()=>f.cancel(p,who))}
})
it('NC emisor/catálogo revocados no impiden leer/cancelar historial pero sí crear otra propuesta',async()=>{
 const f=await creditReservationFixture(),p=await f.make(f.partial('61.73'));await f.write(p)
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 expect(await f.read(p)).toMatchObject({estado:'SALDO_RESERVADO_NO_EMITIR'});expect(await f.write(p)).toMatchObject({estado:'SALDO_RESERVADO_NO_EMITIR'})
 const next=await f.make(f.partial('61.72'));await denied(()=>f.write(next));expect(await f.cancel(p)).toMatchObject({estado:'CANCELADA'})
})
it.each(['anon','authenticated','service_role'])('NC tablas y helpers privados denegados al rol %s',async role=>{
 const f=await creditReservationFixture(),p=await f.make();await f.write(p);await db.exec(`SET ROLE ${role}`)
 for(const table of ['fiscal_nc_borradores_homologacion','fiscal_nc_cancelaciones_homologacion']){
  await denied(()=>db.query(`SELECT * FROM ${table}`));await denied(()=>db.query(`DELETE FROM ${table}`))
 }
 await denied(()=>db.query('SELECT fiscal_nc_ack($1)',[p.datos.solicitud_id]))
 await denied(()=>db.query('SELECT fiscal_validar_borrador_nc($1::jsonb,$2::jsonb)',[JSON.stringify(p.datos),JSON.stringify(f.source)]))
 if(role!=='service_role'){await denied(()=>f.write(p));await denied(()=>f.read(p));await denied(()=>f.cancel(p))}
})
it('NC UUID existente exige exactamente el mismo canónico y hash; no sustituye propuesta',async()=>{
 const f=await creditReservationFixture(),p=await f.make();await f.write(p)
 const changed=await f.make({...f.input,motivo:'Otro motivo'});await denied(()=>f.write(changed))
 expect(await f.read(p)).toMatchObject({propuesta_sha256:p.sha256})
})
it('NC valida asociación, tipos y decimales también en SQL aunque se evada el contrato TS',async()=>{
 const f=await creditReservationFixture(),p=await f.make()
 for(const change of [
  (v:Record<string,unknown>)=>({...v,origen:{...(v.origen as object),numero:999}}),
  (v:Record<string,unknown>)=>({...v,tipo_nota_credito:3}),
  (v:Record<string,unknown>)=>({...v,condicion_iva_receptor:999}),
  (v:Record<string,unknown>)=>({...v,lineas:[{...p.datos.lineas[0],cantidad:2}]}),
  (v:Record<string,unknown>)=>({...v,importes:{...p.datos.importes,total:'123,45'}}),
  (v:Record<string,unknown>)=>({...v,motivo:'Control\nprohibido'}),
  (v:Record<string,unknown>)=>({...v,fecha:'20990101'}),
 ]){
  const data=change({...p.datos,solicitud_id:crypto.randomUUID()})
  await db.exec('RESET ROLE');const canonical=(await db.query<{v:string}>('SELECT fiscal_json_canonico_homologacion($1::jsonb) v',[JSON.stringify(data)])).rows[0].v;await db.exec('SET ROLE service_role')
  await denied(()=>db.query('SELECT guardar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,canonical,hash(canonical)]))
 }
})
it('NC conserva filas y cancelaciones incluso ante UPDATE/DELETE privilegiados accidentales',async()=>{
 const f=await creditReservationFixture(),p=await f.make();await f.write(p);await f.cancel(p)
 await db.exec('RESET ROLE')
 for(const table of ['fiscal_nc_borradores_homologacion','fiscal_nc_cancelaciones_homologacion']){
  await denied(()=>db.query(`DELETE FROM ${table}`));await denied(()=>db.query(`UPDATE ${table} SET propuesta_sha256=repeat('b',64)`))
 }
})
it('NC canónico con espacios o hash incorrecto no reserva; cancelación exige hash original',async()=>{
 const f=await creditReservationFixture(),p=await f.make(),spaced=JSON.stringify(p.datos,null,2)
 await denied(()=>db.query('SELECT guardar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,spaced,hash(spaced)]))
 await denied(()=>db.query('SELECT guardar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,p.canonico,'b'.repeat(64)]))
 await f.write(p)
 await denied(()=>db.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,p.datos.solicitud_id,'b'.repeat(64)]))
 expect(await f.read(p)).toMatchObject({estado:'SALDO_RESERVADO_NO_EMITIR'})
})

it('NC servicio usa Auth real una vez y confirma reserva desde getter SQL sin TA ni red fiscal',async()=>{
 const f=await creditReservationFixture(),p=await f.make(),api=workerFixture()
 const ack=await saveFiscalCreditDraft(api.admin,'SYNTHETIC_JWT',sale,op,f.input)
 expect(ack).toMatchObject({solicitud_id:p.datos.solicitud_id,propuesta_sha256:p.sha256,estado:'SALDO_RESERVADO_NO_EMITIR'})
 expect(await f.read(p)).toEqual(ack);expect(api.getUser).toHaveBeenCalledTimes(1)
 expect(api.rpc.mock.calls.map(([name])=>name)).toEqual(['cargar_representacion_fiscal_homologacion','guardar_borrador_nc_homologacion','cargar_borrador_nc_homologacion'])
 expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
})
it('NC servicio recupera guardado y cancelación SQL confirmados cuyo ACK se pierde',async()=>{
 const f=await creditReservationFixture(),p=await f.make(),api=workerFixture(),base=api.rpc.getMockImplementation()!
 api.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='guardar_borrador_nc_homologacion'||name==='cancelar_borrador_nc_homologacion')throw new Error('SYNTHETIC_ACK_LOST');return result})
 const ack=await saveFiscalCreditDraft(api.admin,'SYNTHETIC_JWT',sale,op,f.input)
 const scope={saleId:sale,operationId:op,requestId:p.datos.solicitud_id,sha256:p.sha256}
 expect(ack.estado).toBe('SALDO_RESERVADO_NO_EMITIR');expect((await cancelFiscalCreditDraft(api.admin,'SYNTHETIC_JWT',scope)).estado).toBe('CANCELADA')
 expect((await loadFiscalCreditDraft(api.admin,'SYNTHETIC_JWT',scope))?.estado).toBe('CANCELADA')
 expect(api.rpc.mock.calls.filter(([name])=>name==='guardar_borrador_nc_homologacion')).toHaveLength(1)
 expect(api.rpc.mock.calls.filter(([name])=>name==='cancelar_borrador_nc_homologacion')).toHaveLength(1)
})
it('NC HTTP exige gate de guardado y permite recuperar/cancelar con ese gate apagado',async()=>{
 const f=await creditReservationFixture(),p=await f.make(),api=workerFixture(),handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const request=(body:unknown)=>new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(body)})
 const write={accion:'GUARDAR_BORRADOR_NC',venta_id:sale,operacion_origen_id:op,propuesta:f.input}
 expect((await handler(request(write))).status).toBe(503);expect(api.getUser).not.toHaveBeenCalled()
 api.flags.ARCA_HOMO_CREDIT_DRAFTS_ENABLED='true'
 expect((await handler(request(write))).status).toBe(200);delete api.flags.ARCA_HOMO_CREDIT_DRAFTS_ENABLED
 for(const accion of ['BORRADOR_NC','CANCELAR_BORRADOR_NC']){
  const response=await handler(request({accion,venta_id:sale,operacion_origen_id:op,solicitud_id:p.datos.solicitud_id,propuesta_sha256:p.sha256}))
  expect(response.status).toBe(200);expect((await response.json()).resultado).toMatchObject({emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
 }
 expect(api.getUser).toHaveBeenCalledTimes(3);expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
})
it('NC Auth reasignado después de leer fuente no se infiere de nuevo ni reserva saldo',async()=>{
 const f=await creditReservationFixture(),api=workerFixture(),other=crypto.randomUUID(),base=api.rpc.getMockImplementation()!
 await admin('INSERT INTO auth.users VALUES($1)',[other])
 api.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='cargar_representacion_fiscal_homologacion')await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner]);return result})
 await expect(saveFiscalCreditDraft(api.admin,'SYNTHETIC_JWT',sale,op,f.input)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
 expect(api.getUser).toHaveBeenCalledTimes(1)
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_borradores_homologacion')).rows[0].n).toBe(0)
})

it('NC desistimiento antes del guardado crea cierre durable y bloquea escritura tardía',async()=>{
 const f=await creditReservationFixture(),p=await f.make(),ack=await f.cancel(p)
 expect(ack).toMatchObject({solicitud_id:p.datos.solicitud_id,propuesta_sha256:p.sha256,estado:'CANCELADA',emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
 expect(await f.cancel(p)).toEqual(ack);expect(await f.read(p)).toEqual(ack);await denied(()=>f.write(p))
 const api=workerFixture();expect(await saveFiscalCreditDraft(api.admin,'SYNTHETIC_JWT',sale,op,f.input)).toEqual(ack)
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_borradores_homologacion')).rows[0].n).toBe(0)
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_desistimientos_homologacion')).rows[0].n).toBe(1)
})
it('NC desistimiento no consume saldo y no acepta sustituir hash o Auth',async()=>{
 const f=await creditReservationFixture(),p=await f.make();await f.cancel(p)
 await denied(()=>db.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,p.datos.solicitud_id,'b'.repeat(64)]))
 await denied(()=>db.query('SELECT cargar_borrador_nc_homologacion($1,$2,$3,$4)',[crypto.randomUUID(),sale,op,p.datos.solicitud_id]))
 const next=await f.make({...f.input,solicitud_id:crypto.randomUUID()});expect(await f.write(next)).toMatchObject({estado:'SALDO_RESERVADO_NO_EMITIR'})
})
it.each(['anon','authenticated','service_role'])('NC desistimientos e historial privados al rol %s',async role=>{
 const f=await creditReservationFixture(),p=await f.make();await f.cancel(p);await db.exec(`SET ROLE ${role}`)
 await denied(()=>db.query('SELECT * FROM fiscal_nc_desistimientos_homologacion'));await denied(()=>db.query('DELETE FROM fiscal_nc_desistimientos_homologacion'))
 await denied(()=>db.query('SELECT fiscal_nc_desistimiento_ack($1)',[p.datos.solicitud_id]))
 if(role!=='service_role')await denied(()=>db.query('SELECT cargar_historial_nc_homologacion($1,$2,$3,0)',[actor,sale,op]))
})
it('NC desistimientos inmutables no se convierten en otro caso mediante UPDATE/DELETE',async()=>{
 const f=await creditReservationFixture(),p=await f.make();await f.cancel(p);await db.exec('RESET ROLE')
 await denied(()=>db.query('DELETE FROM fiscal_nc_desistimientos_homologacion'))
 await denied(()=>db.query(`UPDATE fiscal_nc_desistimientos_homologacion SET propuesta_sha256=repeat('b',64)`))
})
it('NC historial pagina casos por secuencia y recupera canónico original tras perder browser',async()=>{
 const f=await creditReservationFixture(),ids:string[]=[]
 for(let n=0;n<11;n++){const p=await f.make({...f.input,solicitud_id:crypto.randomUUID(),motivo:'Caso '+n});await f.write(p);ids.push(p.datos.solicitud_id);if(n<10)await f.cancel(p)}
 const read=async(after=0)=>(await db.query<{v:{version:number;venta_id:string;operacion_origen_id:string;despues:number;casos:{secuencia:number;acuse:Record<string,unknown>;propuesta:{canonico:string;sha256:string}}[];continuar_desde:number|null}}>('SELECT cargar_historial_nc_homologacion($1,$2,$3,$4) v',[actor,sale,op,after])).rows[0].v
 const first=await read();expect(first.casos).toHaveLength(10);expect(first.continuar_desde).toBe(10)
 expect(first.casos.map(x=>x.acuse.solicitud_id)).toEqual(ids.slice(0,10));expect(first.casos.every(x=>x.acuse.estado==='CANCELADA')).toBe(true)
 for(const entry of first.casos){expect(hash(entry.propuesta.canonico)).toBe(entry.propuesta.sha256);expect(entry.acuse.propuesta_sha256).toBe(entry.propuesta.sha256)}
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 const last=await read(10);expect(last.casos).toHaveLength(1);expect(last.casos[0].acuse.solicitud_id).toBe(ids[10]);expect(last.continuar_desde).toBeNull()
 expect((await read(11)).casos).toEqual([])
 await denied(()=>db.query('SELECT cargar_historial_nc_homologacion($1,$2,$3,-1)',[actor,sale,op]))
})
it('NC historial vacío no fabrica casos y no revela factura a Auth reasignado',async()=>{
 const f=await creditReservationFixture(),p=await f.make();await f.cancel(p)
 expect((await db.query<{v:{casos:unknown[];continuar_desde:null}}>('SELECT cargar_historial_nc_homologacion($1,$2,$3,0) v',[actor,sale,op])).rows[0].v).toMatchObject({casos:[],continuar_desde:null})
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 for(const who of [actor,other]){await denied(()=>f.read(p,who));await denied(()=>db.query('SELECT cargar_historial_nc_homologacion($1,$2,$3,0)',[who,sale,op]))}
})
it('NC historial HTTP recupera propuesta y cancelación desde SQL sin habilitar guardados',async()=>{
 const f=await creditReservationFixture(),p=await f.make();await f.write(p);await f.cancel(p)
 const api=workerFixture(),handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'HISTORIAL_BORRADORES_NC',venta_id:sale,operacion_origen_id:op,despues:0})}))
 expect(response.status).toBe(200)
 const body=await response.json()
 expect(body.resultado).toMatchObject({version:1,venta_id:sale,operacion_origen_id:op,despues:0,continuar_desde:null,casos:[{secuencia:1,propuesta:{canonico:p.canonico,sha256:p.sha256},acuse:{estado:'CANCELADA',emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false}}]})
 expect(api.getUser).toHaveBeenCalledTimes(1);expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
 expect(api.rpc.mock.calls.map(([name])=>name)).toEqual(['cargar_representacion_fiscal_homologacion','cargar_historial_nc_homologacion'])
})

async function creditCommercialFixture(kind:'PRODUCTO'|'COMBO'|'LIBRE'='PRODUCTO',quantity=2){
 const cash=crypto.randomUUID()
 await admin('INSERT INTO sesiones_caja(id,kiosco_id,usuario_id) VALUES($1,$2,$3)',[cash,kid,owner])
 await admin('UPDATE ventas SET sesion_caja_id=$1 WHERE id=$2',[cash,sale])
 const f=await creditReservationFixture(false,quantity),detail=f.source.contexto.lineas[0].detalle_id,payment=crypto.randomUUID()
 await db.exec('RESET ROLE')
 const row={id:detail,producto_id:product,cantidad:quantity,precio_unitario:61.72,subtotal:123.45,sin_envase:false,precio_envase_unitario:0,es_devolucion_envase:false,
  articulo_libre:kind==='LIBRE'?{descripcion:'Concepto original',precio_venta:61.72}:null,componentes:kind==='COMBO'?[{producto_id:product,cantidad:3}]:[]}
 const header=(await db.query<{data:{fecha:string}}>(`SELECT jsonb_build_object('fecha',fecha_hora) data FROM ventas WHERE id=$1`,[sale])).rows[0].data
 const snapshot={version:1,id:sale,kiosco_id:kid,usuario_id:owner,sesion_caja_id:cash,fecha_hora:header.fecha,total:123.45,notas:null,cliente_id:null,detalles:[row],pagos:[{id:payment,medio_pago:'EFECTIVO',monto:123.45,referencia:null}]}
 await admin('INSERT INTO checkout_manual_entradas(id,kiosco_id,usuario_id,entrada,snapshot,autorizado_por_auth_id) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',[sale,kid,owner,JSON.stringify({version:1}),JSON.stringify(snapshot),actor])
 await admin('INSERT INTO checkout_manuales(id,kiosco_id,venta_id,solicitud,resultado) VALUES($1,$2,$1,$3::jsonb,$4::jsonb)',[sale,kid,JSON.stringify(snapshot),JSON.stringify({venta_id:sale,kiosco_id:kid,total:123.45})])
 await admin("INSERT INTO pagos_venta(id,venta_id,medio_pago,monto) VALUES($1,$2,'EFECTIVO',123.45)",[payment,sale])
 if(kind!=='LIBRE')await admin("INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,usuario_id) VALUES($1,$2,'EGRESO',$3,'VENTA',$4,$5)",[kid,product,quantity*(kind==='COMBO'?3:1),'Checkout manual '+sale,owner])
 const load=async(who=actor)=>(await db.query<{data:Record<string,unknown>}>('SELECT cargar_fuente_comercial_nc_homologacion($1,$2,$3) data',[who,sale,op])).rows[0].data
 return {...f,row,snapshot,payment,detail,load}
}
it('NC fuente comercial coteja cierres, factura, pagos y salidas sin efectos ni PII',async()=>{
 const f=await creditCommercialFixture(),source=await f.load()
 expect(source).toMatchObject({version:1,venta_id:sale,operacion_origen_id:op,solicitud_sha256:f.source.constancia.solicitud.sha256,total:'123.45',pago_integro_efectivo:true,unidades_historicas:'NO_REGISTRADAS',emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false,pagos:[{medio:'EFECTIVO',importe:'123.45'}],lineas:[{detalle_id:f.detail,producto_id:product,cantidad:'2.000',subtotal:'123.45',tipo:'PRODUCTO',componentes:[{producto_id:product,cantidad:'1.000'}],sin_envase:false,precio_envase_unitario:'0.00'}]})
 expect(source.checkout_sha256).toMatch(/^[a-f0-9]{64}$/);expect(JSON.stringify(source)).not.toContain('referencia');expect(JSON.stringify(source)).not.toContain('autorizado_por_auth_id')
 await db.exec('RESET ROLE')
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_borradores_homologacion')).rows[0].n).toBe(0)
})
it.each(['COMBO','LIBRE'] as const)('NC fuente usa receta histórica %s sin reconstruir catálogo actual',async kind=>{
 const f=await creditCommercialFixture(kind)
 await admin('UPDATE productos SET es_combo=false,es_pesable=true,descripcion=$1 WHERE id=$2',['Nombre cambiado',product])
 expect(await f.load()).toMatchObject({lineas:[{tipo:kind,componentes:kind==='LIBRE'?[]:[{producto_id:product,cantidad:'3.000'}]}]})
})
it('NC fuente ausente no presume pago o receta a partir del catálogo',async()=>{
 const f=await creditReservationFixture()
 await denied(()=>db.query('SELECT cargar_fuente_comercial_nc_homologacion($1,$2,$3)',[actor,sale,op]))
 expect(f.source.estado).toBe('AUTORIZADA')
})
it.each(['snapshot','pago','stock','detalle','resultado'] as const)('NC fuente rechaza historia comercial modificada %s',async kind=>{
 const f=await creditCommercialFixture()
 if(kind==='snapshot')await admin(`UPDATE checkout_manual_entradas SET snapshot=jsonb_set(snapshot,'{total}','1') WHERE id=$1`,[sale])
 if(kind==='pago')await admin('UPDATE pagos_venta SET monto=1 WHERE id=$1',[f.payment])
 if(kind==='stock')await admin('UPDATE movimientos_stock SET cantidad=1,delta_stock=-1 WHERE kiosco_id=$1',[kid])
 if(kind==='detalle')for(const [table,column] of [['checkout_manual_entradas','snapshot'],['checkout_manuales','solicitud']])await admin(`UPDATE ${table} SET ${column}=jsonb_set(${column},'{detalles,0,precio_unitario}','1') WHERE id=$1`,[sale])
 if(kind==='resultado')await admin(`UPDATE checkout_manuales SET resultado=jsonb_set(resultado,'{total}','1') WHERE id=$1`,[sale])
 await denied(()=>f.load())
})
it('NC fuente informa pago no efectivo sin habilitar reintegro ni ocultar el medio',async()=>{
 const f=await creditCommercialFixture()
 await admin(`UPDATE pagos_venta SET medio_pago='TARJETA' WHERE id=$1`,[f.payment])
 for(const [table,column] of [['checkout_manual_entradas','snapshot'],['checkout_manuales','solicitud']])await admin(`UPDATE ${table} SET ${column}=jsonb_set(${column},'{pagos,0,medio_pago}','"TARJETA"') WHERE id=$1`,[sale])
 expect(await f.load()).toMatchObject({pago_integro_efectivo:false,pagos:[{medio:'TARJETA',importe:'123.45'}],reintegro_habilitado:false})
})
it.each(['anon','authenticated'] as const)('NC fuente comercial privada no se concede al rol %s',async role=>{
 await creditCommercialFixture();await db.exec('RESET ROLE; SET ROLE '+role)
 await denied(()=>db.query('SELECT cargar_fuente_comercial_nc_homologacion($1,$2,$3)',[actor,sale,op]))
})
it('NC fuente exige Auth original incluso después de reasignar perfil',async()=>{
 const f=await creditCommercialFixture(),other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 for(const who of [actor,other])await denied(()=>f.load(who))
})

it('NC fuente conserva fracciones históricas sin atribuir unidad/peso desde catálogo actual',async()=>{
 const f=await creditCommercialFixture('PRODUCTO',2.25)
 await admin('UPDATE productos SET es_pesable=false,unidad_medida=$1 WHERE id=$2',['UN',product])
 expect(await f.load()).toMatchObject({unidades_historicas:'NO_REGISTRADAS',lineas:[{cantidad:'2.250',subtotal:'123.45'}],reposicion_habilitada:false})
})
it('NC fuente caja histórica puede estar cerrada; no equivale a caja habilitada para reintegrar',async()=>{
 const f=await creditCommercialFixture()
 await admin("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=now() WHERE id=$1",[f.snapshot.sesion_caja_id])
 expect(await f.load()).toMatchObject({pago_integro_efectivo:true,reintegro_habilitado:false})
})
it('NC fuente rechaza pagos agregados aunque el pago original no cambie',async()=>{
 const f=await creditCommercialFixture();await admin("INSERT INTO pagos_venta(venta_id,medio_pago,monto) VALUES($1,'EFECTIVO',1)",[sale])
 await denied(()=>f.load())
})
it('NC fuente detecta componentes duplicados aunque ambas copias de snapshot coincidan',async()=>{
 const f=await creditCommercialFixture('COMBO')
 for(const [table,column] of [['checkout_manual_entradas','snapshot'],['checkout_manuales','solicitud']])await admin(`UPDATE ${table} SET ${column}=jsonb_set(${column},'{detalles,0,componentes}',$2::jsonb) WHERE id=$1`,[sale,JSON.stringify([{producto_id:product,cantidad:1},{producto_id:product,cantidad:2}])])
 await denied(()=>f.load())
})

it('NC fuente normaliza UUID históricos válidos sin alterar el snapshot original',async()=>{
 const f=await creditCommercialFixture('COMBO')
 for(const [table,column] of [['checkout_manual_entradas','snapshot'],['checkout_manuales','solicitud']])await admin(`UPDATE ${table} SET ${column}=jsonb_set(jsonb_set(${column},'{detalles,0,producto_id}',to_jsonb($2::text)),'{detalles,0,componentes,0,producto_id}',to_jsonb($2::text)) WHERE id=$1`,[sale,product.toUpperCase()])
 expect(await f.load()).toMatchObject({lineas:[{producto_id:product,componentes:[{producto_id:product,cantidad:'3.000'}]}]})
})

it('NC fuente comercial HTTP cruza SQL030 real local con Auth único y sin flags de escritura',async()=>{
 const f=await creditCommercialFixture(),api=workerFixture(),handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'FUENTE_COMERCIAL_NC',venta_id:sale,operacion_origen_id:op})}))
 expect(response.status).toBe(200);expect((await response.json()).resultado).toEqual(await f.load())
 expect(api.getUser).toHaveBeenCalledTimes(1);expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
 expect(api.rpc.mock.calls.map(([name])=>name)).toEqual(['cargar_representacion_fiscal_homologacion','cargar_fuente_comercial_nc_homologacion'])
})
it('NC transporte comercial no infiere Auth nuevo tras reasignación entre sus RPC',async()=>{
 await creditCommercialFixture();const api=workerFixture(),other=crypto.randomUUID(),base=api.rpc.getMockImplementation()!
 await admin('INSERT INTO auth.users VALUES($1)',[other])
 api.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='cargar_representacion_fiscal_homologacion')await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner]);return result})
 const handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'FUENTE_COMERCIAL_NC',venta_id:sale,operacion_origen_id:op})}))
 expect(response.status).not.toBe(200);expect(JSON.stringify(await response.json())).not.toContain('pagos');expect(api.getUser).toHaveBeenCalledTimes(1)
 expect(api.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor)).toBe(true)
})

async function checkoutUnitsFixture(enabled=true,weighted=false,free=false){
 const cash=crypto.randomUUID(),detail=crypto.randomUUID(),virtual=crypto.randomUUID(),quantity=weighted?0.5:1
 await admin('DELETE FROM detalles_venta WHERE venta_id=$1',[sale]);await admin('DELETE FROM ventas WHERE id=$1',[sale])
 await admin('INSERT INTO sesiones_caja(id,kiosco_id,usuario_id) VALUES($1,$2,$3)',[cash,kid,owner])
 await admin('UPDATE productos SET stock_actual=10,precio_venta=$1,es_pesable=$2,unidad_medida=$3 WHERE id=$4',[weighted?248:124,weighted,weighted?'KG':'UN',product])
 if(enabled)await admin('INSERT INTO checkout_unidades_config_homologacion(kiosco_id,habilitado) VALUES($1,true)',[kid])
 const fecha=new Date().toISOString(),prod=free?virtual:product
 const components:{producto_id:string;cantidad:number}[]=[]
 const row={id:detail,producto_id:prod,cantidad:quantity,precio_unitario:weighted?248:124,subtotal:124,sin_envase:false,precio_envase_unitario:0,es_devolucion_envase:false,articulo_libre:free?{descripcion:'Concepto de ensayo',precio_venta:124}:null,componentes:components}
 const snapshot={version:1,id:sale,kiosco_id:kid,usuario_id:owner,sesion_caja_id:cash,fecha_hora:fecha,total:124,notas:null,cliente_id:null,detalles:[row],pagos:[{id:crypto.randomUUID(),medio_pago:'EFECTIVO',monto:124,referencia:null}]}
 const entry={version:1,checkoutId:sale,kioscoId:kid,usuarioId:owner,sesionCajaId:cash,fechaHora:fecha,clienteId:null,notas:null,tipoAjuste:'NINGUNO',valorAjuste:0,totalEsperado:124,subtotalesEsperados:[124],componentesEsperados:[],lineas:[free?{tipo:'LIBRE',id:prod,descripcion:'Concepto de ensayo',cantidad:1,precio:124}:{tipo:'PRODUCTO',id:prod,productoId:prod,cantidad:quantity,sinEnvase:false}],pagos:[{id:snapshot.pagos[0].id,medio:'EFECTIVO',montoCentavos:12400,referencia:null}]}
 const prepare=async()=>(await db.query<{data:unknown}>('SELECT preparar_checkout_manual($1,$2::jsonb,$3::jsonb,false,15,0::bigint) data',[actor,JSON.stringify(entry),JSON.stringify(snapshot)])).rows[0].data
 const close=async()=>(await db.query<{data:unknown}>('SELECT confirmar_venta_manual($1,$2::jsonb) data',[actor,JSON.stringify(snapshot)])).rows[0].data
 const evidence=async()=>{await db.exec('RESET ROLE');const rows=(await db.query<{data:{datos:{lineas:{detalle_id:string;es_pesable:boolean;unidad_medida:string;tipo:string;componentes:unknown[]}[]};unidades_sha256:string}}>('SELECT to_jsonb(u) data FROM checkout_unidades_homologacion u WHERE checkout_id=$1',[sale])).rows;await db.exec('SET ROLE service_role');return rows[0]?.data??null}
 return {cash,detail,prod,row,snapshot,entry,prepare,close,evidence}
}
it('unidades checkout apagadas por defecto no agregan evidencia ni cambian ACK/cierre',async()=>{
 const f=await checkoutUnitsFixture(false);await admin('INSERT INTO checkout_unidades_config_homologacion(kiosco_id) VALUES($1)',[kid]);expect(await f.prepare()).toEqual({entrada:f.entry,snapshot:f.snapshot,requiere_supervisor:false,politica_umbral:15,politica_revision:0});expect(await f.evidence()).toBeNull();await f.close();expect(await f.evidence()).toBeNull()
})
it.each([false,true])('unidades capturadas en preparación y cierre real; pesable=%s',async weighted=>{
 const f=await checkoutUnitsFixture(true,weighted);await f.prepare();const evidence=await f.evidence()
 expect(evidence?.datos.lineas).toMatchObject([{detalle_id:f.detail,tipo:'PRODUCTO',es_pesable:weighted,unidad_medida:weighted?'KG':'UN',componentes:[{producto_id:product,es_pesable:weighted,unidad_medida:weighted?'KG':'UN'}]}])
 await f.close();expect(await f.evidence()).toEqual(evidence)
 const proposal=input();await authorizeReceipt(true,{...proposal,datos:{...proposal.datos,importes:{...proposal.datos.importes,neto:'124.00'}}});const result=(await db.query<{v:Record<string,unknown>}>('SELECT cargar_unidades_nc_homologacion($1,$2,$3) v',[actor,sale,op])).rows[0].v
 expect(result).toMatchObject({estado:'CAPTURADAS',emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false,unidades:{sha256:evidence?.unidades_sha256}})
})
it('unidad cambiada después de preparar revierte cierre/stock/pagos y conserva intento',async()=>{
 const f=await checkoutUnitsFixture(true,true);await f.prepare();const original=await f.evidence();await admin("UPDATE productos SET unidad_medida='GR' WHERE id=$1",[product])
 await denied(()=>f.close());expect(await f.evidence()).toEqual(original)
 await db.exec('RESET ROLE');for(const table of ['ventas','pagos_venta','movimientos_stock'])expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
 expect((await db.query<{v:string}>('SELECT stock_actual::text v FROM productos WHERE id=$1',[product])).rows[0].v).toBe('10.000')
})
it('desactivar captura tras preparar no evita guard; replay confirmado no usa catálogo posterior',async()=>{
 const f=await checkoutUnitsFixture();await f.prepare();await admin('UPDATE checkout_unidades_config_homologacion SET habilitado=false WHERE kiosco_id=$1',[kid])
 await admin('UPDATE productos SET es_pesable=true WHERE id=$1',[product]);await denied(()=>f.close())
 await admin('UPDATE productos SET es_pesable=false WHERE id=$1',[product]);await f.close();const original=await f.evidence()
 await admin("UPDATE productos SET unidad_medida='LT' WHERE id=$1",[product]);await f.close();expect(await f.evidence()).toEqual(original)
})
it('concepto libre captura UN sin inventar salida de stock; creación virtual y cierre reales',async()=>{
 const f=await checkoutUnitsFixture(true,false,true);await f.prepare();expect((await f.evidence())?.datos.lineas).toMatchObject([{tipo:'LIBRE',es_pesable:false,unidad_medida:'UN',componentes:[]}]);await f.close()
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM movimientos_stock')).rows[0].n).toBe(0)
})
it('entrada antigua no se rellena al activar captura y conserva cierre recuperable',async()=>{
 const f=await checkoutUnitsFixture(false);await f.prepare();await admin('INSERT INTO checkout_unidades_config_homologacion(kiosco_id,habilitado) VALUES($1,true)',[kid]);await f.close();expect(await f.evidence()).toBeNull()
 const proposal=input();await authorizeReceipt(true,{...proposal,datos:{...proposal.datos,importes:{...proposal.datos.importes,neto:'124.00'}}});expect((await db.query<{v:Record<string,unknown>}>('SELECT cargar_unidades_nc_homologacion($1,$2,$3) v',[actor,sale,op])).rows[0].v).toMatchObject({estado:'NO_REGISTRADAS',unidades:null})
})
it.each(['anon','authenticated','service_role'] as const)('tablas de configuración/evidencia unidades privadas al rol %s',async role=>{
 const f=await checkoutUnitsFixture();await f.prepare();await db.exec('RESET ROLE; SET ROLE '+role)
 for(const table of ['checkout_unidades_config_homologacion','checkout_unidades_homologacion'])await denied(()=>db.exec('SELECT * FROM '+table))
})
it('snapshot/unidades son inmutables, política de supervisor sigue editable por wrapper',async()=>{
 const f=await checkoutUnitsFixture();await f.prepare();await db.exec('RESET ROLE')
 await denied(()=>db.query('UPDATE checkout_unidades_homologacion SET datos=datos WHERE checkout_id=$1',[sale]));await denied(()=>db.query('DELETE FROM checkout_unidades_homologacion WHERE checkout_id=$1',[sale]))
 await denied(()=>db.query(`UPDATE checkout_manual_entradas SET snapshot=jsonb_set(snapshot,'{total}','1') WHERE id=$1`,[sale]))
 await db.query('UPDATE checkout_manual_entradas SET requiere_supervisor=false WHERE id=$1',[sale]);await db.exec('SET ROLE service_role');await f.close()
})
it('no captura unidades retroactivas de una venta existente ni acepta fracciones de producto por unidad',async()=>{
 const f=await checkoutUnitsFixture();f.snapshot.detalles[0].cantidad=0.5;await denied(()=>f.prepare())
 f.snapshot.detalles[0].cantidad=1;await admin('INSERT INTO ventas(id,kiosco_id,usuario_id,sesion_caja_id,total) VALUES($1,$2,$3,$4,124)',[sale,kid,owner,f.cash]);await denied(()=>f.prepare());expect(await f.evidence()).toBeNull()
})

it.each([false,true])('combo congela unidad de componente y cierre real; cambio=%s',async change=>{
 const f=await checkoutUnitsFixture(true,true),combo=crypto.randomUUID()
 await admin("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta,es_combo) VALUES($1,$2,'Combo de ensayo',124,true)",[combo,kid])
 await admin('INSERT INTO combo_items(kiosco_id,combo_producto_id,componente_producto_id,cantidad) VALUES($1,$2,$3,0.5)',[kid,combo,product])
 f.row.producto_id=combo;f.row.cantidad=1;f.row.precio_unitario=124;f.row.componentes.push({producto_id:product,cantidad:0.5});f.entry.lineas[0]={tipo:'PRODUCTO',id:combo,productoId:combo,cantidad:1,sinEnvase:false}
 await f.prepare();const original=await f.evidence()
 expect(original?.datos.lineas).toMatchObject([{tipo:'COMBO',es_pesable:false,unidad_medida:'UN',componentes:[{producto_id:product,es_pesable:true,unidad_medida:'KG'}]}])
 if(change){await admin("UPDATE productos SET unidad_medida='GR' WHERE id=$1",[product]);await denied(()=>f.close());expect(await f.evidence()).toEqual(original);return}
 await f.close();await admin("UPDATE productos SET unidad_medida='GR' WHERE id=$1",[product]);await admin('UPDATE combo_items SET cantidad=1 WHERE combo_producto_id=$1',[combo])
 const proposal=input();await authorizeReceipt(true,{...proposal,datos:{...proposal.datos,importes:{...proposal.datos.importes,neto:'124.00'}}})
 const result=(await db.query<{v:{estado:string;unidades:{canonico:string}}}>('SELECT cargar_unidades_nc_homologacion($1,$2,$3) v',[actor,sale,op])).rows[0].v
 expect(result.estado).toBe('CAPTURADAS');expect(JSON.parse(result.unidades.canonico).lineas[0].componentes[0].unidad_medida).toBe('KG')
})
it('preparar de nuevo el mismo UUID recupera evidencia original y reinstalación la conserva',async()=>{
 const f=await checkoutUnitsFixture();await f.prepare();const original=await f.evidence();await admin("UPDATE productos SET unidad_medida='LT' WHERE id=$1",[product]);await f.prepare();expect(await f.evidence()).toEqual(original)
 await db.exec('RESET ROLE');await db.exec(readFileSync('supabase/pilot-fiscal/031_checkout_unit_evidence.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));await db.exec('SET ROLE service_role');expect(await f.evidence()).toEqual(original)
})

it('unidades de factura sólo se leen con Auth fiscal original, no con perfil reasignado',async()=>{
 const f=await checkoutUnitsFixture();await f.prepare();await f.close();const proposal=input();await authorizeReceipt(true,{...proposal,datos:{...proposal.datos,importes:{...proposal.datos.importes,neto:'124.00'}}})
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 for(const who of [actor,other])await denied(()=>db.query('SELECT cargar_unidades_nc_homologacion($1,$2,$3)',[who,sale,op]))
})

it('captura de unidades no prohíbe una venta de combo pesable admitida por checkout',async()=>{
 const f=await checkoutUnitsFixture(),combo=crypto.randomUUID()
 await admin("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta,es_combo,es_pesable,unidad_medida) VALUES($1,$2,'Combo pesable',248,true,true,'KG')",[combo,kid])
 await admin('INSERT INTO combo_items(kiosco_id,combo_producto_id,componente_producto_id,cantidad) VALUES($1,$2,$3,2)',[kid,combo,product])
 f.row.producto_id=combo;f.row.cantidad=0.5;f.row.precio_unitario=248;f.row.componentes.push({producto_id:product,cantidad:2});f.entry.lineas[0]={tipo:'PRODUCTO',id:combo,productoId:combo,cantidad:0.5,sinEnvase:false}
 await f.prepare();expect((await f.evidence())?.datos.lineas).toMatchObject([{tipo:'COMBO',es_pesable:true,unidad_medida:'KG'}]);await f.close()
 await db.exec('RESET ROLE');expect((await db.query<{v:string}>('SELECT stock_actual::text v FROM productos WHERE id=$1',[product])).rows[0].v).toBe('9.000');await db.exec('SET ROLE service_role')
 const proposal=input();await authorizeReceipt(true,{...proposal,datos:{...proposal.datos,importes:{...proposal.datos.importes,neto:'124.00'}}})
 const result=await readUnitsHttp()
 expect(result).toMatchObject({estado:'CAPTURADAS',emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
 const verified=await import('../../supabase/functions/_shared/fiscalCreditUnits')
 const commercial=(await db.query<{data:unknown}>('SELECT cargar_fuente_comercial_nc_homologacion($1,$2,$3) data',[actor,sale,op])).rows[0].data
 const source=await (await import('../../supabase/functions/_shared/fiscalRepresentation')).validateFiscalRepresentation(await representation(),sale,op)
 const validated=await verified.validateFiscalCreditUnits(result,source,await (await import('../../supabase/functions/_shared/fiscalCreditCommercialSource')).validateFiscalCreditCommercialSource(commercial,source))
 expect(validated.estado).toBe('CAPTURADAS')
})

async function readUnitsHttp(){
 const api=workerFixture(),handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'UNIDADES_NC',venta_id:sale,operacion_origen_id:op})}))
 expect(response.status).toBe(200);expect(api.getUser).toHaveBeenCalledTimes(1);expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
 expect(api.rpc.mock.calls.map(([name])=>name)).toEqual(['cargar_representacion_fiscal_homologacion','cargar_fuente_comercial_nc_homologacion','cargar_unidades_nc_homologacion'])
 return (await response.json()).resultado
}

async function installCreditBinding(){
 await db.exec('RESET ROLE')
 const sql=readFileSync('supabase/pilot-fiscal/032_fiscal_credit_commercial_binding.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
}
async function installCreditContext(){
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/033_fiscal_credit_context.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
}
async function installCreditContextSource(){
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/034_fiscal_credit_context_source.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
}
async function installCreditPreparation(){
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/035_fiscal_credit_preparation.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
}
async function creditPreparationFixture(invoice:1|6|11=11,concept:1|2|3=1){
 const f=await contextCreditFixture(concept,invoice)
 if(invoice===11)await seedCreditCatalog()
 else await admin(`INSERT INTO fiscal_parametros_nc_homologacion(revision,tipos,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado)
 VALUES(1,$1::jsonb,$2::jsonb,'[{"id":5,"descripcion":"IVA sintético"}]',repeat('c',64),clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true)`,[JSON.stringify([{id:invoice===1?3:8,descripcion:'NC A/B sintética',desde:'20200101',hasta:null}]),JSON.stringify([{id:5,descripcion:'Condición NC sintética',comprobantes:[invoice===1?3:8]}])])
 await installCreditContextSource();await installCreditPreparation()
 const context=await (await import('../../supabase/functions/_shared/fiscalCreditContext')).validateFiscalCreditContext(await f.load(),f.source,f.proposal)
 const entry=concept===1?{servicioDesde:null,servicioHasta:null,vencimientoPago:null}:{servicioDesde:'20261002',servicioHasta:'20261019',vencimientoPago:'20261027'}
 const prepared=await (await import('../../supabase/functions/_shared/fiscalCreditPreparation')).prepareFiscalCreditPreparation(f.source,f.proposal,context,entry)
 const readPreparation=async(who=actor)=>(await db.query<{data:Record<string,unknown>|null}>('SELECT cargar_preparacion_nc_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])).rows[0].data
 const savePreparation=async(value:unknown=entry,contextHash=prepared.datos.contexto_sha256)=>(await db.query<{data:Record<string,unknown>}>('SELECT guardar_preparacion_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,contextHash,JSON.stringify(value)])).rows[0].data
 return{...f,context,entry,prepared,readPreparation,savePreparation}
}
async function preparationEffects(){
 await db.exec('RESET ROLE');const value=(await db.query<{v:unknown}>(`SELECT jsonb_build_object('series',(SELECT count(*) FROM fiscal_series_homologacion),'reservas',(SELECT count(*) FROM fiscal_reservas_homologacion),'stock',(SELECT count(*) FROM movimientos_stock),'caja',(SELECT count(*) FROM movimientos_caja),'devoluciones',(SELECT count(*) FROM devoluciones_venta)) v`)).rows[0].v;await db.exec('SET ROLE service_role');return value
}
async function creditPreparationTransport(invoice:1|6|11=11,concept:1|2|3=1){
 const f=await creditPreparationFixture(invoice,concept),api=workerFixture(),local=new Map<string,string>(),commands:string[]=[]
 api.flags.ARCA_HOMO_CREDIT_PREPARATION_ENABLED='true'
 const handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const send=vi.fn(async(command:Record<string,unknown>)=>{
  commands.push(String(command.accion))
  const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(command)}))
  if(response.status!==200)throw new Error('HTTP_NOT_CONFIRMED')
  return response.json()
 })
 const storage={getItem:(key:string)=>local.get(key)??null,setItem:(key:string,value:string)=>{local.set(key,value)}}
 const make=()=>createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage,send})
 return{...f,api,local,commands,send,make,client:make()}
}
async function installCreditNumbers(){
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/036_fiscal_credit_reservation.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
}
async function creditNumberedFixture(invoice:1|6|11=11,concept:1|2|3=1){
 const f=await creditPreparationFixture(invoice,concept);await f.savePreparation();await installCreditNumbers()
 const reservationId=crypto.randomUUID()
 const reserve=async(id=reservationId,last=22,when=new Date().toISOString())=>(await db.query<{data:Record<string,unknown>}>(`SELECT reservar_cuerpo_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8,$9) data`,[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,f.prepared.sha256,id,last,when])).rows[0].data
 const read=async()=>(await db.query<{data:Record<string,unknown>|null}>('SELECT cargar_reserva_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])).rows[0].data
 return{...f,reservationId,reserve,read}
}
async function installCreditRequestSource(){
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/037_fiscal_credit_request_source.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
}
async function creditNumberSourceFixture(){
 const f=await creditNumberedFixture()
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/038_fiscal_credit_number_source.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
 const api=workerFixture(),{loadFiscalCreditNumberingSource}=await import('../../supabase/functions/_shared/fiscalCreditDraftService')
 const scope={saleId:sale,operationId:op,requestId:f.proposal.datos.solicitud_id,sha256:f.proposal.sha256}
 const load=()=>loadFiscalCreditNumberingSource(api.admin,'SYNTHETIC_JWT',scope,f.prepared.sha256)
 return{...f,api,scope,load}
}
async function creditTicketFixture(){
 const f=await creditNumberSourceFixture(),source=await f.load()
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/039_fiscal_credit_ticket_coordination.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
 const intent=crypto.randomUUID(),cipher={version:1,keyId:crypto.randomUUID(),nonce:'a'.repeat(24),ciphertext:'b'.repeat(32),expiresAt:Date.now()+3600000}
 const call=async(action:string,id:string|null=null,generation:number|null=null,envelope:unknown=null,binding:unknown=source.binding)=>(await db.query<{data:Record<string,unknown>}>('SELECT coordinar_ta_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,f.prepared.sha256,JSON.stringify(binding),action,id,generation,envelope===null?null:JSON.stringify(envelope)])).rows[0].data
 return{...f,source,intent,cipher,call}
}
it.each(['normal','ack-reserva-perdido','recuperacion','gate-cerrado','gate-cambia','wsfe-falla','gate-tras-consulta','concurrente','carrera-fuente'] as const)('worker numeración NC %s usa Auth único, recuperación037 y reserva036',async(mode)=>{
 const f=await creditTicketFixture();await installCreditRequestSource();f.api.getUser.mockClear()
 const {prepareFiscalCreditNumber}=await import('../../supabase/functions/_shared/fiscalCreditNumberWorker')
 const before=await preparationEffects(),flags:Record<string,string>={SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',ARCA_HOMO_BACKEND_ENABLED:'true',ARCA_HOMO_CREDIT_NUMBERING_ENABLED:'true'}
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),keyId=crypto.randomUUID()
 const keys={active:vi.fn(async()=>{if(mode==='gate-cambia')flags.ARCA_HOMO_CREDIT_NUMBERING_ENABLED='false';return{id:keyId,key}}),read:vi.fn(async()=>key)}
 const wsaa=vi.fn(async(binding:typeof f.source.binding,_signal:AbortSignal,beforeSend:()=>Promise<void>)=>{
  await beforeSend();return{entorno:'HOMOLOGACION' as const,servicio:'wsfe' as const,cuitEmisor:binding.cuit_emisor,credencialId:binding.credencial_id,certificadoSha256:binding.certificado_sha256,
   expiresAt:Date.now()+3600000,token:'SYNTHETIC_NUMBER_TOKEN',sign:'SYNTHETIC_NUMBER_SIGN'}
 })
 const fetcher=vi.fn<typeof fetch>(async input=>{
  const request=input as Request;expect(request.url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx');expect(request.headers.get('SOAPAction')).toContain('FECompUltimoAutorizado')
  if(mode==='wsfe-falla')throw new Error('SYNTHETIC_NETWORK_FAILURE')
  if(mode==='gate-tras-consulta')flags.ARCA_HOMO_CREDIT_NUMBERING_ENABLED='false'
  if(mode==='concurrente')await f.reserve(crypto.randomUUID())
  return new Response(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult><PtoVta>${f.source.binding.punto_venta}</PtoVta><CbteTipo>13</CbteTipo><CbteNro>22</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></s:Body></s:Envelope>`,{headers:{'Content-Type':'text/xml'}})
 })
 if(mode==='recuperacion'){await f.reserve();flags.ARCA_HOMO_CREDIT_NUMBERING_ENABLED='false'}
 if(mode==='gate-cerrado')flags.ARCA_HOMO_CREDIT_NUMBERING_ENABLED='false'
 const base=f.api.rpc.getMockImplementation()!
 if(mode==='ack-reserva-perdido'||mode==='carrera-fuente')f.api.rpc.mockImplementation(async(name,args)=>{
  const result=await base(name,args)
  if(mode==='carrera-fuente'&&name==='cargar_fuente_cuerpo_nc_homologacion'&&result.data===null&&!result.error)await f.reserve(crypto.randomUUID())
  if(mode==='ack-reserva-perdido'&&name==='reservar_cuerpo_nc_homologacion'&&!result.error)throw new Error('SYNTHETIC_ACK_LOST')
  return result
 })
 const run=()=>prepareFiscalCreditNumber({admin:f.api.admin,readSecret:name=>flags[name],keys,wsaa,fetcher},'SYNTHETIC_JWT',f.scope,f.prepared.sha256,f.reservationId)
 if(mode==='gate-cerrado'||mode==='gate-cambia'||mode==='wsfe-falla'||mode==='gate-tras-consulta'){
  await expect(run()).rejects.toThrow('FISCAL_NUMERACION_NC_NO_CONFIRMADA')
  expect(fetcher).toHaveBeenCalledTimes(mode==='wsfe-falla'||mode==='gate-tras-consulta'?1:0)
  expect(wsaa).toHaveBeenCalledTimes(mode==='wsfe-falla'||mode==='gate-tras-consulta'?1:0)
  expect(await f.read()).toBeNull()
 }else{
  const result=await run();expect(result.estado).toBe('CUERPO_NC_RESERVADO');expect(result.datos.solicitud.numero).toBe(23);expect(result.emision_habilitada).toBe(false)
  expect(fetcher).toHaveBeenCalledTimes(mode==='recuperacion'||mode==='carrera-fuente'?0:1);expect(wsaa).toHaveBeenCalledTimes(mode==='recuperacion'||mode==='carrera-fuente'?0:1)
  if(mode!=='recuperacion'&&mode!=='concurrente'&&mode!=='carrera-fuente'){flags.ARCA_HOMO_CREDIT_NUMBERING_ENABLED='false';expect(await run()).toEqual(result)}
 }
 expect(f.api.getUser).toHaveBeenCalledTimes(mode==='normal'||mode==='ack-reserva-perdido'?2:1)
 expect(f.api.rpc.mock.calls.filter(([name])=>name==='reservar_cuerpo_nc_homologacion')).toHaveLength(mode==='normal'||mode==='ack-reserva-perdido'||mode==='concurrente'?1:0)
 expect(await preparationEffects()).toEqual(before)
})
it.each(['normal','confirmar-perdido','iniciar-perdido','clave-falla'] as const)('039 loader cifrado integrado %s conserva exclusión y recuperación durable',async(mode)=>{
 const f=await creditTicketFixture(),before=await preparationEffects()
 const {createSharedFiscalCreditTicketLoader}=await import('../../supabase/functions/_shared/fiscalCreditSharedTickets')
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),keyId=crypto.randomUUID()
 const keys={active:vi.fn(async()=>{if(mode==='clave-falla')throw new Error('synthetic custody failure');return{id:keyId,key}}),read:vi.fn(async()=>key)}
 const actions:string[]=[]
 const rpc={rpc:async(name:string,args:Record<string,unknown>)=>{
  expect(name).toBe('coordinar_ta_nc_homologacion');actions.push(String(args.p_accion))
  expect(args.p_actor).toBe(actor);expect(args.p_venta).toBe(sale);expect(args.p_operacion).toBe(op)
  expect(args.p_caso).toBe(f.proposal.datos.solicitud_id);expect(args.p_preparacion_sha).toBe(f.prepared.sha256)
  if(typeof args.p_intento!=='string'||typeof args.p_accion!=='string')throw new Error('invalid synthetic RPC')
  const generation=typeof args.p_generacion==='number'?args.p_generacion:null
  const data=await f.call(args.p_accion,args.p_intento,generation,args.p_cifrado,args.p_binding)
  if(mode==='confirmar-perdido'&&args.p_accion==='CONFIRMAR'||mode==='iniciar-perdido'&&args.p_accion==='INICIAR')throw new Error('synthetic lost ACK after SQL')
  return{data,error:null}
 }}
 const wsaa=vi.fn(async(binding:typeof f.source.binding,_signal:AbortSignal,beforeSend:()=>Promise<void>)=>{
  await beforeSend()
  return{entorno:'HOMOLOGACION' as const,servicio:'wsfe' as const,cuitEmisor:binding.cuit_emisor,credencialId:binding.credencial_id,
   certificadoSha256:binding.certificado_sha256,expiresAt:Date.now()+3600000,token:'synthetic-integrated-token',sign:'synthetic-integrated-sign'}
 })
 const load=()=>createSharedFiscalCreditTicketLoader(rpc,keys,wsaa,async()=>undefined)(f.source.binding,new AbortController().signal)
 if(mode==='normal')expect((await load()).token).toBe('synthetic-integrated-token')
 else await expect(load()).rejects.toThrow('FISCAL_TICKET_NC_NO_CONFIRMADO')
 const state=await f.call('ESTADO')
 if(mode==='iniciar-perdido'){
  expect(state.estado).toBe('ENVIO_INCIERTO');await expect(load()).rejects.toThrow();expect(wsaa).toHaveBeenCalledTimes(1)
  expect(actions).not.toContain('CANCELAR');expect(actions).not.toContain('CONFIRMAR')
 }else if(mode==='clave-falla'){
  expect(state.estado).toBe('VACIO');expect(wsaa).not.toHaveBeenCalled();expect(actions).toEqual(['SOLICITAR','CANCELAR'])
 }else{
  expect(state.estado).toBe('DISPONIBLE');expect((await load()).sign).toBe('synthetic-integrated-sign')
  expect(wsaa).toHaveBeenCalledTimes(1);expect(keys.active).toHaveBeenCalledTimes(1);expect(keys.read).toHaveBeenCalledTimes(1)
  const available=await f.call('SOLICITAR',crypto.randomUUID())
  expect(JSON.stringify(available)).not.toContain('synthetic-integrated-token');expect(JSON.stringify(available)).not.toContain('synthetic-integrated-sign')
 }
 expect(await preparationEffects()).toEqual(before)
})
it('039 ciclo TA NC conserva propiedad, permiso único y sobre cifrado recuperable sin renovar de nuevo',async()=>{
 const f=await creditTicketFixture(),before=await preparationEffects()
 expect(await f.call('ESTADO')).toMatchObject({estado:'VACIO',intento_id:null,revision:0})
 expect(await f.call('SOLICITAR',f.intent)).toMatchObject({estado:'RENOVAR',nuevo_intento:true,revision:1})
 expect(await f.call('SOLICITAR',crypto.randomUUID())).toMatchObject({estado:'RENOVACION_PENDIENTE',nuevo_intento:false})
 expect(await f.call('ESTADO')).toMatchObject({estado:'PREPARADA',intento_id:f.intent,revision:1})
 expect(await f.call('INICIAR',f.intent,1)).toMatchObject({estado:'ENVIO_INCIERTO',nuevo_envio:true})
 expect(await f.call('INICIAR',f.intent,1)).toMatchObject({estado:'ENVIO_INCIERTO',nuevo_envio:false})
 await denied(()=>f.call('CANCELAR',f.intent,1))
 const ack=await f.call('CONFIRMAR',f.intent,1,f.cipher)
 expect(ack).toMatchObject({estado:'DISPONIBLE',intento_id:f.intent,revision:1})
 expect(await f.call('CONFIRMAR',f.intent,1,f.cipher)).toEqual(ack)
 expect(await f.call('SOLICITAR',crypto.randomUUID())).toEqual({estado:'DISPONIBLE',nuevo_intento:false,cifrado:f.cipher})
 await db.exec('RESET ROLE');const attempt=(await db.query<{operacion_origen_id:string|null}>('SELECT operacion_origen_id FROM fiscal_ta_intentos_homologacion WHERE id=$1',[f.intent])).rows[0];await db.exec('SET ROLE service_role')
 expect(attempt.operacion_origen_id).toBeNull();expect(await preparationEffects()).toEqual(before)
})
it('039 cancelación previa a envío libera preparación y conserva historia tras cancelar caso',async()=>{
 const f=await creditTicketFixture();await f.call('SOLICITAR',f.intent)
 await db.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])
 await denied(()=>f.call('INICIAR',f.intent,1))
 expect(await f.call('CANCELAR',f.intent,1)).toMatchObject({estado:'CANCELADA'})
 expect(await f.call('CANCELAR',f.intent,1)).toMatchObject({estado:'CANCELADA'})
 expect(await f.call('ESTADO')).toMatchObject({estado:'VACIO'})
})
it('039 respuesta ya recibida se conserva cifrada tras revocación/cancelación sin permitir nuevo envío',async()=>{
 const f=await creditTicketFixture();await f.call('SOLICITAR',f.intent);await f.call('INICIAR',f.intent,1)
 await db.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 expect(await f.call('CONFIRMAR',f.intent,1,f.cipher)).toMatchObject({estado:'DISPONIBLE'})
 await denied(()=>f.call('SOLICITAR',crypto.randomUUID()));await denied(()=>f.call('INICIAR',f.intent,1));await denied(()=>f.call('CANCELAR',f.intent,1))
})
it.each(['PREPARADA','ENVIO_INCIERTO','DISPONIBLE'] as const)('039 coordina con TA de factura %s sin apropiarse del intento',async(state)=>{
 const f=await creditTicketFixture(),old=crypto.randomUUID(),huella=f.source.binding.certificado_sha256
 await admin('INSERT INTO fiscal_ta_homologacion(certificado_sha256) VALUES($1)',[huella])
 await admin('INSERT INTO fiscal_ta_intentos_homologacion(id,certificado_sha256,revision,operacion_origen_id,envio_iniciado_en) VALUES($1,$2,1,$3,CASE WHEN $4 THEN clock_timestamp() ELSE NULL END)',[old,huella,op,state!=='PREPARADA'])
 await admin('UPDATE fiscal_ta_homologacion SET revision=1,estado=$1,intento_id=$2,cifrado=$3::jsonb,vence_en=$4 WHERE certificado_sha256=$5',[state,old,state==='DISPONIBLE'?JSON.stringify(f.cipher):null,state==='DISPONIBLE'?new Date(f.cipher.expiresAt).toISOString():null,huella])
 expect(await f.call('ESTADO')).toMatchObject({estado:'COMPARTIDA',intento_id:null})
 const result=await f.call('SOLICITAR',f.intent)
 expect(result).toMatchObject({estado:state==='DISPONIBLE'?'DISPONIBLE':'RENOVACION_PENDIENTE',nuevo_intento:false})
 await denied(()=>f.call('INICIAR',old,1));await denied(()=>f.call('CANCELAR',old,1));await denied(()=>f.call('CONFIRMAR',old,1,f.cipher))
})
it.each(['vencido','extra','plano','tamper'] as const)('039 sobre %s no borra incertidumbre ni reemplaza respuesta confirmada',async(reason)=>{
 const f=await creditTicketFixture();await f.call('SOLICITAR',f.intent);await f.call('INICIAR',f.intent,1)
 const cipher=reason==='vencido'?{...f.cipher,expiresAt:Date.now()-1000}:reason==='extra'?{...f.cipher,token:'SYNTHETIC_NOT_ALLOWED'}:reason==='plano'?{token:'SYNTHETIC',sign:'SYNTHETIC'}:{...f.cipher,ciphertext:'bad'}
 await denied(()=>f.call('CONFIRMAR',f.intent,1,cipher))
 expect(await f.call('ESTADO')).toMatchObject({estado:'ENVIO_INCIERTO'})
})
it('039 vínculo TA NC privado e inmutable; RPC de factura no cancela intento NC',async()=>{
 const f=await creditTicketFixture();await f.call('SOLICITAR',f.intent)
 await denied(()=>db.query('SELECT cancelar_preparacion_ta_homologacion($1,$2,$3,$4,$5,1)',[op,f.source.binding.credencial_id,f.source.binding.certificado_sha256,f.source.binding.revision_emisor,f.intent]))
 for(const role of ['anon','authenticated','service_role']){await db.exec(`SET ROLE ${role}`);await denied(()=>db.query('SELECT binding FROM fiscal_nc_ta_vinculos_homologacion'))}
 await db.exec('RESET ROLE');await denied(()=>db.exec('DELETE FROM fiscal_nc_ta_vinculos_homologacion'));await db.exec('SET ROLE service_role')
})
it('039 replay de cancelar una generación anterior no libera la preparación siguiente',async()=>{
 const f=await creditTicketFixture(),next=crypto.randomUUID()
 await f.call('SOLICITAR',f.intent);await f.call('CANCELAR',f.intent,1)
 expect(await f.call('SOLICITAR',next)).toMatchObject({estado:'RENOVAR',revision:2})
 expect(await f.call('CANCELAR',f.intent,1)).toMatchObject({estado:'CANCELADA',revision:1})
 expect(await f.call('ESTADO')).toMatchObject({estado:'PREPARADA',intento_id:next,revision:2})
 await denied(()=>f.call('INICIAR',f.intent,1))
})
it('038 fuente específica liga Dueño/Auth/caso/preparación/emisor sin copiar permiso de factura',async()=>{
 const f=await creditNumberSourceFixture(),before=await preparationEffects(),source=await f.load()
 expect(source.binding).toMatchObject({finalidad:'NUMERACION_NC',actor_auth_id:actor,kiosco_id:kid,usuario_id:owner,solicitud_id:f.proposal.datos.solicitud_id,operacion_origen_id:op,preparacion_sha256:f.prepared.sha256,tipo_comprobante:13,emision_habilitada:false})
 expect(source.binding).not.toHaveProperty('operacion_id');expect(source.binding).not.toHaveProperty('token');expect(source.binding).not.toHaveProperty('sign')
 expect(f.api.getUser).toHaveBeenCalledTimes(1);expect(f.api.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor)).toBe(true)
 expect(await preparationEffects()).toEqual(before);expect(f.api.fetcher).not.toHaveBeenCalled();expect(f.api.load).not.toHaveBeenCalled()
})
it.each(['reservada','cancelada','emisor','catalogo','pago','rol','superadmin'] as const)('038 fuente de consulta nueva rechaza %s sin custodia ni red',async(reason)=>{
 const f=await creditNumberSourceFixture()
 if(reason==='reservada')await f.reserve()
 if(reason==='cancelada')await db.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])
 if(reason==='emisor')await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 if(reason==='catalogo')await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false')
 if(reason==='pago')await admin('UPDATE pagos_venta SET monto=1 WHERE venta_id=$1',[sale])
 if(reason==='rol')await admin("UPDATE usuarios SET rol='CAJERO' WHERE id=$1",[owner])
 if(reason==='superadmin')await admin('UPDATE usuarios SET es_superadmin=true,kiosco_id=NULL WHERE id=$1',[owner])
 await expect(f.load()).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
 expect(f.api.fetcher).not.toHaveBeenCalled();expect(f.api.load).not.toHaveBeenCalled()
})
it('038 no atribuye Auth nuevo entre lectura de factura y fuente de numeración',async()=>{
 const f=await creditNumberSourceFixture(),base=f.api.rpc.getMockImplementation()!,other=crypto.randomUUID()
 await admin('INSERT INTO auth.users VALUES($1)',[other])
 f.api.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='cargar_representacion_fiscal_homologacion')await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner]);return result})
 await expect(f.load()).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA');expect(f.api.getUser).toHaveBeenCalledTimes(1)
 expect(f.api.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor)).toBe(true)
})
it.each([1,6,11] as const)('037 cuerpo NC factura%i se recupera por servicio privado y SQL real sin parámetros vigentes',async(invoice)=>{
 const f=await creditNumberedFixture(invoice);await installCreditRequestSource()
 const api=workerFixture(),{loadFiscalCreditRequest}=await import('../../supabase/functions/_shared/fiscalCreditDraftService')
 const scope={saleId:sale,operationId:op,requestId:f.proposal.datos.solicitud_id,sha256:f.proposal.sha256}
 expect(await loadFiscalCreditRequest(api.admin,'SYNTHETIC_JWT',scope)).toBeNull()
 await f.reserve()
 const stored=await loadFiscalCreditRequest(api.admin,'SYNTHETIC_JWT',scope)
 expect(stored).toMatchObject({estado:'CUERPO_NC_RESERVADO',emision_habilitada:false,datos:{reserva_id:f.reservationId,solicitud:{numero:23,tipoComprobante:invoice===1?3:invoice===6?8:13}}})
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false')
 expect(await loadFiscalCreditRequest(api.admin,'SYNTHETIC_JWT',scope)).toEqual(stored)
 expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
 expect(api.getUser).toHaveBeenCalledTimes(3)
 expect(api.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor)).toBe(true)
})
it('037 Auth reasignado entre factura y fuente no expone cuerpo a ninguna cuenta',async()=>{
 const f=await creditNumberedFixture();await installCreditRequestSource();await f.reserve()
 const api=workerFixture(),base=api.rpc.getMockImplementation()!,other=crypto.randomUUID(),{loadFiscalCreditRequest}=await import('../../supabase/functions/_shared/fiscalCreditDraftService')
 await admin('INSERT INTO auth.users VALUES($1)',[other])
 api.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='cargar_representacion_fiscal_homologacion')await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner]);return result})
 const scope={saleId:sale,operationId:op,requestId:f.proposal.datos.solicitud_id,sha256:f.proposal.sha256}
 await expect(loadFiscalCreditRequest(api.admin,'SYNTHETIC_JWT',scope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
 expect(api.getUser).toHaveBeenCalledTimes(1)
 api.getUser.mockResolvedValue({data:{user:{id:other}},error:null})
 await expect(loadFiscalCreditRequest(api.admin,'SYNTHETIC_JWT',scope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
})
it('036 dos casos parciales distintos de la misma serie no avanzan sobre reserva pendiente',async()=>{
 const f=await boundCreditFixture(true,true);await installCreditBinding();await installCreditContext();await seedCreditCatalog();await installCreditContextSource();await installCreditPreparation();await installCreditNumbers()
 const {validateFiscalCreditContext}=await import('../../supabase/functions/_shared/fiscalCreditContext')
 const {prepareFiscalCreditPreparation}=await import('../../supabase/functions/_shared/fiscalCreditPreparation')
 const entry={servicioDesde:null,servicioHasta:null,vencimientoPago:null},prepared: {id:string;sha:string;dataSha:string}[]=[]
 for(let n=0;n<2;n++){
  const proposal=await f.make({...f.draft,solicitud_id:crypto.randomUUID(),lineas:[{...f.draft.lineas[0],cantidad:'0.250',importe:'62.00'}],importes:{...f.draft.importes,total:'62.00',neto:'62.00'}})
  await f.write(proposal)
  const raw=(await db.query<{data:unknown}>('SELECT cargar_contexto_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,proposal.datos.solicitud_id,proposal.sha256])).rows[0].data
  const context=await validateFiscalCreditContext(raw,f.source,proposal),data=await prepareFiscalCreditPreparation(f.source,proposal,context,entry)
  await db.query('SELECT guardar_preparacion_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,sale,op,proposal.datos.solicitud_id,proposal.sha256,data.datos.contexto_sha256,JSON.stringify(entry)])
  prepared.push({id:proposal.datos.solicitud_id,sha:proposal.sha256,dataSha:data.sha256})
 }
 const reserve=(n:number,last:number)=>db.query('SELECT reservar_cuerpo_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp())',[actor,sale,op,prepared[n].id,prepared[n].sha,prepared[n].dataSha,crypto.randomUUID(),last])
 await reserve(0,22);await denied(()=>reserve(1,23))
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_reservas_homologacion')).rows[0].n).toBe(1);await db.exec('SET ROLE service_role')
})
it.each([[1,1],[6,1],[11,1],[11,2],[11,3]] as const)('036 reserva NC factura%i concepto%i genera cuerpo idéntico al contrato puro y recupera una identidad',async(invoice,concept)=>{
 const f=await creditNumberedFixture(invoice,concept),before=await preparationEffects()
 expect(await f.read()).toBeNull();const reservation=await f.reserve()
 const {fiscalCreditPreparationWire,validateFiscalCreditPreparationRecord}=await import('../../supabase/functions/_shared/fiscalCreditPreparation')
 const {prepareFiscalCreditRequest}=await import('../../supabase/functions/_shared/fiscalCreditRequest')
 const stored=await validateFiscalCreditPreparationRecord(await f.readPreparation(),f.source,f.proposal)
 const request=await prepareFiscalCreditRequest(f.source,f.proposal,fiscalCreditPreparationWire(stored),reservation)
 await db.exec('RESET ROLE')
 const persisted=(await db.query<{canonico:string;solicitud_sha256:string}>('SELECT canonico,solicitud_sha256 FROM fiscal_nc_reservas_homologacion WHERE solicitud_id=$1',[f.proposal.datos.solicitud_id])).rows[0]
 await db.exec('SET ROLE service_role')
 expect(persisted).toEqual({canonico:request.canonico,solicitud_sha256:request.sha256})
 expect(await f.reserve()).toEqual(reservation);expect(await f.read()).toEqual(reservation)
 expect(await preparationEffects()).toEqual(before)
 await denied(()=>f.reserve(crypto.randomUUID()))
 await denied(()=>db.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256]))
})
it.each(['antigua','futura','infinita','negativa','agotada'] as const)('036 rechaza consulta de numeración %s sin persistir reserva parcial',async(reason)=>{
 const f=await creditNumberedFixture()
 const when=reason==='antigua'?new Date(Date.now()-60000).toISOString():reason==='futura'?new Date(Date.now()+60000).toISOString():reason==='infinita'?'infinity':new Date().toISOString()
 await denied(()=>f.reserve(undefined,reason==='negativa'?-1:reason==='agotada'?99999999:22,when))
 expect(await f.read()).toBeNull()
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_series_homologacion')).rows[0].n).toBe(0);await db.exec('SET ROLE service_role')
})
it('036 cancelación previa impide numeración; reserva histórica recupera con emisor/catálogo apagados',async()=>{
 const f=await creditNumberedFixture();await db.exec('SAVEPOINT cancelled_case')
 await db.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])
 await denied(()=>f.reserve());await db.exec('ROLLBACK TO SAVEPOINT cancelled_case; RELEASE SAVEPOINT cancelled_case')
 const reservation=await f.reserve()
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false')
 expect(await f.reserve(undefined,-1,'infinity')).toEqual(reservation);expect(await f.read()).toEqual(reservation)
})
it('036 reserva privada inmutable, sin acceso de tablas/columnas ni helpers',async()=>{
 const f=await creditNumberedFixture();await f.reserve()
 for(const role of ['anon','authenticated','service_role']){
  await db.exec(`SET ROLE ${role}`)
  await denied(()=>db.query('SELECT numero FROM fiscal_nc_reservas_homologacion'))
  await denied(()=>db.query('SELECT cuit_emisor FROM fiscal_nc_series_homologacion'))
 }
 await db.exec('RESET ROLE');await denied(()=>db.exec('UPDATE fiscal_nc_reservas_homologacion SET numero=24'));await denied(()=>db.exec('DELETE FROM fiscal_nc_reservas_homologacion'));await db.exec('SET ROLE service_role')
})
it.each([[1,1],[6,1],[11,1],[11,2],[11,3]] as const)('035 cliente–HTTP–servicio–SQL factura%i concepto%i guarda y recupera canónico exacto',async(invoice,concept)=>{
 const f=await creditPreparationTransport(invoice,concept),before=await preparationEffects()
 expect(await f.client.credits.preparation(f.source,f.proposal)).toBeNull()
 const stored=await f.client.credits.savePreparation(f.source,f.proposal,f.context,f.entry)
 expect(stored.preparacion.sha256).toBe(f.prepared.sha256);expect(stored.preparacion.canonico).toBe(f.prepared.canonico)
 expect(f.client.credits.pendingPreparation()).toBeNull()
 expect(await f.make().credits.preparation(f.source,f.proposal)).toEqual(stored)
 expect(await preparationEffects()).toEqual(before);expect(f.api.fetcher).not.toHaveBeenCalled();expect(f.api.load).not.toHaveBeenCalled()
 expect(f.commands.filter(action=>action==='GUARDAR_PREPARACION_NC')).toHaveLength(1)
})
it('035 ACK HTTP perdido se recupera de SQL real sin reenviar y con catálogo/emisor revocados',async()=>{
 const f=await creditPreparationTransport(),base=f.send.getMockImplementation()!,before=await preparationEffects()
 f.send.mockImplementation(async command=>{
  const result=await base(command)
  if(command.accion==='GUARDAR_PREPARACION_NC'){
   await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false');await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
   throw new Error('SYNTHETIC_LOST_HTTP_ACK')
  }
  return result
 })
 const stored=await f.client.credits.savePreparation(f.source,f.proposal,f.context,f.entry)
 expect(stored.preparacion.sha256).toBe(f.prepared.sha256);expect(f.client.credits.pendingPreparation()).toBeNull()
 expect(await f.make().credits.preparation(f.source,f.proposal)).toEqual(stored)
 expect(f.commands.filter(action=>action==='GUARDAR_PREPARACION_NC')).toHaveLength(1)
 expect(await preparationEffects()).toEqual(before);expect(f.api.fetcher).not.toHaveBeenCalled();expect(f.api.load).not.toHaveBeenCalled()
})
it('035 cancelación HTTP real conserva preparación histórica y no reactiva al reintentar',async()=>{
 const f=await creditPreparationTransport(),before=await preparationEffects()
 await f.client.credits.savePreparation(f.source,f.proposal,f.context,f.entry)
 expect((await f.client.credits.cancel(op,f.proposal.datos.solicitud_id,f.proposal.sha256)).estado).toBe('CANCELADA')
 expect((await f.make().credits.preparation(f.source,f.proposal))?.estado).toBe('CANCELADA')
 expect((await f.client.credits.savePreparation(f.source,f.proposal,f.context,f.entry)).estado).toBe('CANCELADA')
 expect(f.commands.filter(action=>action==='GUARDAR_PREPARACION_NC')).toHaveLength(1)
 expect(await preparationEffects()).toEqual(before);expect(f.api.fetcher).not.toHaveBeenCalled();expect(f.api.load).not.toHaveBeenCalled()
})
it('035 transporte no cambia Auth original si se reasigna perfil entre factura y lectura durable',async()=>{
 const f=await creditPreparationTransport();await f.savePreparation()
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other])
 const base=f.api.rpc.getMockImplementation()!
 f.api.rpc.mockImplementation(async(name,args)=>{
  const result=await base(name,args)
  if(name==='cargar_representacion_fiscal_homologacion')await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
  return result
 })
 await expect(f.client.credits.preparation(f.source,f.proposal)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
 expect(f.api.getUser).toHaveBeenCalledTimes(1)
 expect(f.api.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor)).toBe(true)
 f.api.getUser.mockResolvedValue({data:{user:{id:other}},error:null})
 await expect(f.make().credits.preparation(f.source,f.proposal)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
 expect(f.commands.every(action=>action==='PREPARACION_NC')).toBe(true)
 expect(f.api.fetcher).not.toHaveBeenCalled();expect(f.api.load).not.toHaveBeenCalled()
})
it.each([[1,1],[6,1],[11,1],[11,2],[11,3]] as const)('035 preparación factura%i concepto%i coincide byte a byte con contrato puro y no numera',async(invoice,concept)=>{
 const f=await creditPreparationFixture(invoice,concept),before=await preparationEffects()
 expect(await f.readPreparation()).toBeNull();const stored=await f.savePreparation()
 expect(stored).toMatchObject({estado:'DATOS_NC_PREPARADOS',preparacion:{canonico:f.prepared.canonico,sha256:f.prepared.sha256},contexto:f.context,emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
 expect(await f.savePreparation()).toEqual(stored);expect(await f.readPreparation()).toEqual(stored);expect(await preparationEffects()).toEqual(before)
 await installCreditPreparation();expect(await f.readPreparation()).toEqual(stored)
})
it('035 contexto cambió: no prepara silenciosamente con revisión nueva',async()=>{
 const f=await creditPreparationFixture()
 await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false')
 await admin(`INSERT INTO fiscal_parametros_nc_homologacion SELECT 2,tipos,condiciones,alicuotas,fuente_sha256,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true FROM fiscal_parametros_nc_homologacion WHERE revision=1`)
 await denied(()=>f.savePreparation());expect(await f.readPreparation()).toBeNull()
 const context=await (await import('../../supabase/functions/_shared/fiscalCreditContext')).validateFiscalCreditContext(await f.load(),f.source,f.proposal)
 const fresh=await (await import('../../supabase/functions/_shared/fiscalCreditPreparation')).prepareFiscalCreditPreparation(f.source,f.proposal,context,f.entry)
 expect(await f.savePreparation(f.entry,fresh.datos.contexto_sha256)).toMatchObject({preparacion:{sha256:fresh.sha256}})
})
it.each(['pago','cancelado','emisor','periodo'] as const)('035 guardado nuevo rechaza %s y no deja preparación parcial',async(reason)=>{
 const f=await creditPreparationFixture()
 if(reason==='pago')await admin('UPDATE pagos_venta SET monto=1 WHERE venta_id=$1',[sale])
 if(reason==='emisor')await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 if(reason==='cancelado')await db.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])
 await denied(()=>f.savePreparation(reason==='periodo'?{...f.entry,servicioDesde:'20261001'}:f.entry))
 expect(await f.readPreparation()).toBeNull()
})
it.each(['falta','fecha','invertido'] as const)('035 servicios rechaza período %s sin depender de controles del navegador',async(reason)=>{
 const f=await creditPreparationFixture(11,2)
 const entry=reason==='falta'?{servicioDesde:f.entry.servicioDesde,servicioHasta:f.entry.servicioHasta}:{...f.entry,servicioDesde:reason==='fecha'?'20260231':'20261020'}
 await denied(()=>f.savePreparation(entry));expect(await f.readPreparation()).toBeNull()
})
it('035 borrador antiguo sin vínculo no obtiene preparación nueva ni backfill',async()=>{
 const f=await creditReservationFixture(),p=await f.make();await f.write(p)
 await installCreditBinding();await installCreditContext();await seedCreditCatalog();await installCreditContextSource();await installCreditPreparation()
 expect((await db.query<{data:unknown}>('SELECT cargar_preparacion_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,p.datos.solicitud_id,p.sha256])).rows[0].data).toBeNull()
 await denied(()=>db.query('SELECT guardar_preparacion_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,sale,op,p.datos.solicitud_id,p.sha256,'a'.repeat(64),JSON.stringify({servicioDesde:null,servicioHasta:null,vencimientoPago:null})]))
 expect(await f.read(p)).toMatchObject({estado:'SALDO_RESERVADO_NO_EMITIR'})
})
it('035 ACK perdido y rollback recuperan mismo canónico sin escritura adicional ni permiso',async()=>{
 const f=await creditPreparationFixture()
 await db.exec('SAVEPOINT prep_crash');await f.savePreparation();await db.exec('ROLLBACK TO SAVEPOINT prep_crash; RELEASE SAVEPOINT prep_crash')
 expect(await f.readPreparation()).toBeNull();const stored=await f.savePreparation()
 expect(await f.readPreparation()).toEqual(stored)
 await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false');await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 expect(await f.savePreparation()).toEqual(stored);expect(await f.readPreparation()).toEqual(stored)
 await denied(()=>f.savePreparation(f.entry,'a'.repeat(64)))
})
it('035 cancelación posterior conserva preparación sin reactivar caso o sus efectos',async()=>{
 const f=await creditPreparationFixture();await f.savePreparation()
 await db.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])
 expect(await f.savePreparation()).toMatchObject({estado:'CANCELADA',preparacion:{sha256:f.prepared.sha256},emision_habilitada:false})
})
it('035 Auth reasignado no revela preparación a identidad original ni nueva',async()=>{
 const f=await creditPreparationFixture();await f.savePreparation();const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 for(const who of [actor,other])await denied(()=>f.readPreparation(who))
})
it.each(['anon','authenticated','service_role'])('035 tabla privada sin acceso directo para %s',async(role)=>{
 await installCreditBinding();await installCreditContext();await installCreditContextSource();await installCreditPreparation();await db.exec('RESET ROLE; SET ROLE '+role)
 await denied(()=>db.query('SELECT canonico FROM fiscal_preparaciones_nc_homologacion'))
 if(role!=='service_role')await denied(()=>db.query('SELECT cargar_preparacion_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,crypto.randomUUID(),'a'.repeat(64)]))
})
it('035 preparación inmutable no admite editar ni borrar historial',async()=>{
 const f=await creditPreparationFixture();await f.savePreparation();await db.exec('RESET ROLE')
 await denied(()=>db.query("UPDATE fiscal_preparaciones_nc_homologacion SET preparacion_sha256=repeat('a',64)"));await denied(()=>db.query('DELETE FROM fiscal_preparaciones_nc_homologacion'))
})
it.each(['anon','authenticated'])('034 puente privado no expone canónico a %s',async(role)=>{
 await installCreditBinding();await installCreditContext();await installCreditContextSource();await db.exec('RESET ROLE; SET ROLE '+role)
 await denied(()=>db.query('SELECT cargar_fuente_contexto_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,crypto.randomUUID(),'a'.repeat(64)]))
})
async function seedCreditCatalog(){
 await admin(`INSERT INTO fiscal_parametros_nc_homologacion(revision,tipos,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado)
 VALUES(1,'[{"id":13,"descripcion":"NC C sintética","desde":"20200101","hasta":null}]','[{"id":5,"descripcion":"Condición sintética NC","comprobantes":[13]}]','[]',repeat('c',64),clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true)`)
}
async function contextCreditFixture(concept:1|2|3=1,invoice:1|6|11=11){
 const f=await boundCreditFixture(true,false,false,concept,invoice);await installCreditBinding();const proposal=await f.make();await f.write(proposal);await installCreditContext()
 const load=async(id=proposal.datos.solicitud_id,sha=proposal.sha256,who=actor)=>(await db.query<{data:unknown}>('SELECT cargar_contexto_nc_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,id,sha])).rows[0].data
 return{...f,proposal,load}
}
it('033 no copia catálogo de facturas ni crea filas/activación por defecto',async()=>{
 const f=await contextCreditFixture();await denied(()=>f.load())
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_parametros_nc_homologacion')).rows[0].n).toBe(0)
})
it('033 contexto liga caso/factura/fuente/unidades y catálogo NC explícito sin permiso',async()=>{
 const f=await contextCreditFixture();await seedCreditCatalog()
 const context=await f.load(),{validateFiscalCreditContext}=await import('../../supabase/functions/_shared/fiscalCreditContext')
 expect(await validateFiscalCreditContext(context,f.source,f.proposal)).toMatchObject({solicitud_id:f.proposal.datos.solicitud_id,propuesta_sha256:f.proposal.sha256,punto_venta:7,tipo_nota_credito:13,revision_parametros:1,condiciones:[{id:5,comprobantes:[13]}],emision_habilitada:false})
 await installCreditContext();expect(await f.load()).toEqual(context)
})
it('contexto NC HTTP–servicio–SQL033 real local con Auth único y sin flag de guardar',async()=>{
 const f=await contextCreditFixture();await seedCreditCatalog();await installCreditContextSource();const api=workerFixture();api.flags.ARCA_HOMO_CREDIT_DRAFTS_ENABLED='false'
 const handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'CONTEXTO_NC',venta_id:sale,operacion_origen_id:op,solicitud_id:f.proposal.datos.solicitud_id,propuesta_sha256:f.proposal.sha256})}))
 expect(response.status).toBe(200);expect((await response.json()).resultado).toEqual(await f.load())
 expect(api.getUser).toHaveBeenCalledTimes(1);expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
 expect(api.rpc.mock.calls.map(([name])=>name)).toEqual(['cargar_representacion_fiscal_homologacion','cargar_fuente_contexto_nc_homologacion'])
})
it('contexto NC no atribuye Auth nuevo tras reasignación entre fuente y SQL033',async()=>{
 const f=await contextCreditFixture();await seedCreditCatalog();await installCreditContextSource();const api=workerFixture(),base=api.rpc.getMockImplementation()!,other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other])
 api.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='cargar_representacion_fiscal_homologacion')await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner]);return result})
 const handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'CONTEXTO_NC',venta_id:sale,operacion_origen_id:op,solicitud_id:f.proposal.datos.solicitud_id,propuesta_sha256:f.proposal.sha256})}))
 expect(response.status).not.toBe(200);expect(JSON.stringify(await response.json())).not.toContain('condiciones');expect(api.getUser).toHaveBeenCalledTimes(1)
 expect(api.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor)).toBe(true)
})
it.each(['cancelado','pago','emisor','hash','actor','vencido','noIniciado','tipoVencido','condicion'] as const)('033 rechaza contexto %s sin inferir parámetros o datos nuevos',async(reason)=>{
 const f=await contextCreditFixture();await seedCreditCatalog()
 if(reason==='cancelado')await db.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])
 if(reason==='pago')await admin('UPDATE pagos_venta SET monto=1 WHERE venta_id=$1',[sale])
 if(reason==='emisor')await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false WHERE kiosco_id=$1',[kid])
 if(['vencido','noIniciado','tipoVencido','condicion'].includes(reason)){
  await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false')
  await admin(`INSERT INTO fiscal_parametros_nc_homologacion(revision,tipos,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado)
   SELECT 2,CASE WHEN $1='tipoVencido' THEN jsonb_set(tipos,'{0,hasta}','"20200102"') ELSE tipos END,CASE WHEN $1='condicion' THEN '[{"id":6,"descripcion":"Otra condición","comprobantes":[13]}]'::jsonb ELSE condiciones END,alicuotas,fuente_sha256,
   CASE WHEN $1='noIniciado' THEN clock_timestamp()+interval '1 hour' ELSE clock_timestamp()-interval '2 hours' END,
   CASE WHEN $1='vencido' THEN clock_timestamp()-interval '1 hour' ELSE clock_timestamp()+interval '2 hours' END,true FROM fiscal_parametros_nc_homologacion WHERE revision=1`,[reason])
 }
 await denied(()=>f.load(undefined,reason==='hash'?'a'.repeat(64):undefined,reason==='actor'?crypto.randomUUID():undefined))
})
it('033 caso histórico sin vínculo no recibe contexto nuevo ni se recaptura',async()=>{
 const f=await creditReservationFixture(),p=await f.make();await f.write(p);await installCreditBinding();await installCreditContext();await seedCreditCatalog()
 await denied(()=>db.query('SELECT cargar_contexto_nc_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,p.datos.solicitud_id,p.sha256]))
 expect(await f.read(p)).toMatchObject({estado:'SALDO_RESERVADO_NO_EMITIR'})
})
it.each(['tipoFactura','tipoDuplicado','fecha','claseFactura','condicionDuplicada','texto','codigoString'] as const)('033 catálogo privado valida forma/códigos/vigencia %s',async(reason)=>{
 await installCreditBinding();await installCreditContext();await db.exec('RESET ROLE')
 const tipos=[{id:13,descripcion:'NC sintética',desde:'20200101',hasta:null}],condiciones=[{id:5,descripcion:'Condición',comprobantes:[13]}]
 let t:unknown=tipos,c:unknown=condiciones
 if(reason==='tipoFactura')t=[{...tipos[0],id:11}]
 if(reason==='tipoDuplicado')t=[...tipos,...tipos]
 if(reason==='fecha')t=[{...tipos[0],desde:'20260231'}]
 if(reason==='claseFactura')c=[{...condiciones[0],comprobantes:[11]}]
 if(reason==='condicionDuplicada')c=[...condiciones,...condiciones]
 if(reason==='texto')c=[{...condiciones[0],descripcion:'Bad\ntext'}]
 if(reason==='codigoString')c=[{...condiciones[0],id:'5'}]
 await denied(()=>db.query(`INSERT INTO fiscal_parametros_nc_homologacion(revision,tipos,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en) VALUES(1,$1::jsonb,$2::jsonb,'[]',repeat('c',64),clock_timestamp(),clock_timestamp()+interval '1 hour')`,[JSON.stringify(t),JSON.stringify(c)]))
})
it.each(['anon','authenticated','service_role'])('033 catálogo privado sin acceso directo para %s',async(role)=>{
 await installCreditBinding();await installCreditContext();await db.exec('RESET ROLE; SET ROLE '+role)
 await denied(()=>db.query('SELECT condiciones FROM fiscal_parametros_nc_homologacion'))
 await denied(()=>db.query("SELECT fiscal_validar_catalogo_nc('[]','[]','[]')"))
})
async function boundCreditFixture(enabled=true,weighted=false,free=false,concept:1|2|3=1,invoice:1|6|11=11){
 const f=await checkoutUnitsFixture(enabled,weighted,free);await f.prepare();await f.close()
 if(invoice!==11){await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false');await admin(`INSERT INTO fiscal_parametros_homologacion VALUES(2,'[{"id":5,"descripcion":"Condición sintética A/B","comprobantes":[1,6]}]','[{"id":5,"descripcion":"IVA sintético"}]',repeat('b',64),clock_timestamp()-interval '1 minute',clock_timestamp()+interval '1 hour',true)`)}
 const proposal=input();await authorizeReceipt(true,{condicionEmisor:invoice===11?'MONOTRIBUTO':'RESPONSABLE_INSCRIPTO',datos:{...proposal.datos,tipoComprobante:invoice,concepto:concept,servicioDesde:concept===1?null:'20261001',servicioHasta:concept===1?null:'20261020',vencimientoPago:concept===1?null:'20261025',importes:invoice===11?{...proposal.datos.importes,neto:'124.00'}:{neto:'100.00',iva:'21.00',noGravado:'0.00',exento:'0.00',tributos:'3.00'},iva:invoice===11?[]:[{id:5,base:'100.00',importe:'21.00'}],tributos:invoice===11?[]:[{id:99,descripcion:'Tributo sintético',base:'100.00',alicuota:'3.00',importe:'3.00'}]}})
 const source=await validateFiscalRepresentation(await representation(),sale,op),body=source.constancia.solicitud.solicitud
 const today=(await db.query<{v:string}>("SELECT to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYYMMDD') v")).rows[0].v
 const draft:FiscalCreditDraftInput={version:1,solicitud_id:crypto.randomUUID(),fecha:today,motivo:'Caso ligado sintético',condicion_iva_receptor:5,
  lineas:[{detalle_id:source.contexto.lineas[0].detalle_id,cantidad:source.contexto.lineas[0].cantidad,importe:'124.00',reingresa_stock:!free}],importes:structuredClone(body.importes),iva:structuredClone(body.iva),tributos:structuredClone(body.tributos)}
 const make=(value=draft)=>prepareFiscalCreditDraft(source,value,today)
 const write=async(p:Readonly<FiscalCreditDraft>)=>(await db.query<{data:Record<string,unknown>}>('SELECT guardar_borrador_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,p.canonico,p.sha256])).rows[0].data
 const binding=async(id:string)=>{await db.exec('RESET ROLE');const value=(await db.query<{data:Record<string,unknown>}>('SELECT to_jsonb(b) data FROM fiscal_nc_comercial_homologacion b WHERE solicitud_id=$1',[id])).rows[0]?.data??null;await db.exec('SET ROLE service_role');return value}
 return{...f,source,draft,make,write,binding}
}
it.each([false,true])('032 caso nuevo queda ligado atómicamente a fuente/unidades, pesable=%s',async(weighted)=>{
 const f=await boundCreditFixture(true,weighted);await installCreditBinding();const p=await f.make(),ack=await f.write(p),binding=await f.binding(p.datos.solicitud_id)
 expect(binding).toMatchObject({solicitud_id:p.datos.solicitud_id,operacion_origen_id:op,actor_auth_id:actor,propuesta_sha256:p.sha256,fuente:{pago_integro_efectivo:true,lineas:[{cantidad:weighted?'0.500':'1.000'}]}})
 expect(await f.write(p)).toEqual(ack);expect(await f.binding(p.datos.solicitud_id)).toEqual(binding)
 await installCreditBinding();expect(await f.binding(p.datos.solicitud_id)).toEqual(binding)
})
it('032 ausencia de unidades revierte caso y saldo sin crear un vínculo',async()=>{
 const f=await boundCreditFixture(false);await installCreditBinding();const p=await f.make();await denied(()=>f.write(p))
 expect(await f.binding(p.datos.solicitud_id)).toBeNull()
 expect((await db.query<{data:unknown}>('SELECT cargar_borrador_nc_homologacion($1,$2,$3,$4) data',[actor,sale,op,p.datos.solicitud_id])).rows[0].data).toBeNull()
})
it('032 fracción no pesable falla en servidor aunque omita validación de navegador',async()=>{
 const f=await boundCreditFixture();await installCreditBinding()
 const p=await f.make({...f.draft,lineas:[{...f.draft.lineas[0],cantidad:'0.500',importe:'62.00'}],importes:{...f.draft.importes,total:'62.00',neto:'62.00'}})
 await denied(()=>f.write(p));expect(await f.binding(p.datos.solicitud_id)).toBeNull()
 expect(await f.write(await f.make())).toMatchObject({estado:'SALDO_RESERVADO_NO_EMITIR'})
})
it('032 concepto libre no permite reposición y rollback no deja reserva parcial',async()=>{
 const f=await boundCreditFixture(true,false,true);await installCreditBinding()
 const invalid=await f.make({...f.draft,lineas:[{...f.draft.lineas[0],reingresa_stock:true}]});await denied(()=>f.write(invalid))
 const p=await f.make();await db.exec('SAVEPOINT binding_crash');await f.write(p);await db.exec('ROLLBACK TO SAVEPOINT binding_crash; RELEASE SAVEPOINT binding_crash')
 expect(await f.binding(p.datos.solicitud_id)).toBeNull();await f.write(p);expect(await f.binding(p.datos.solicitud_id)).not.toBeNull()
})
it('032 borrador histórico se recupera/cancela sin backfill ni evidencia inventada',async()=>{
 const f=await creditReservationFixture(),p=await f.make(),ack=await f.write(p);await installCreditBinding()
 expect(await f.write(p)).toEqual(ack);expect(await f.read(p)).toEqual(ack);expect(await f.cancel(p)).toMatchObject({estado:'CANCELADA'})
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_comercial_homologacion')).rows[0].n).toBe(0)
})
it.each(['anon','authenticated','service_role'])('032 vínculo privado deniega tabla y helper a %s',async(role)=>{
 await installCreditBinding();await db.exec('RESET ROLE; SET ROLE '+role)
 await denied(()=>db.query('SELECT fuente FROM fiscal_nc_comercial_homologacion'))
 await denied(()=>db.query('SELECT fiscal_ligar_comercial_nc_homologacion()'))
})
it('032 vínculo no cambia con catálogo posterior, no se modifica ni se borra',async()=>{
 const f=await boundCreditFixture();await installCreditBinding();const p=await f.make();await f.write(p);const before=await f.binding(p.datos.solicitud_id)
 await admin("UPDATE productos SET unidad_medida='LT',es_pesable=true WHERE id=$1",[product]);expect(await f.binding(p.datos.solicitud_id)).toEqual(before)
 await db.exec('RESET ROLE');await denied(()=>db.query('UPDATE fiscal_nc_comercial_homologacion SET propuesta_sha256=repeat(\'a\',64) WHERE solicitud_id=$1',[p.datos.solicitud_id]));await denied(()=>db.query('DELETE FROM fiscal_nc_comercial_homologacion WHERE solicitud_id=$1',[p.datos.solicitud_id]))
})
it('032 replay y cancelación preservan vínculo sin presentar hechos antiguos como permiso actual',async()=>{
 const f=await boundCreditFixture();await installCreditBinding();const p=await f.make(),ack=await f.write(p),before=await f.binding(p.datos.solicitud_id)
 await admin('UPDATE pagos_venta SET monto=1 WHERE venta_id=$1',[sale])
 expect(await f.write(p)).toEqual(ack);expect(await f.binding(p.datos.solicitud_id)).toEqual(before)
 expect((await db.query<{data:Record<string,unknown>}>('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,p.datos.solicitud_id,p.sha256])).rows[0].data).toMatchObject({estado:'CANCELADA',emision_habilitada:false})
 expect(await f.binding(p.datos.solicitud_id)).toEqual(before)
 expect(await f.write(p)).toMatchObject({estado:'CANCELADA'})
})
it.each([true,false])('032 HTTP guardado usa vínculo obligatorio en SQL, unidades=%s',async(enabled)=>{
 const f=await boundCreditFixture(enabled);await installCreditBinding();const api=workerFixture();api.flags.ARCA_HOMO_CREDIT_DRAFTS_ENABLED='true'
 const handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'GUARDAR_BORRADOR_NC',venta_id:sale,operacion_origen_id:op,propuesta:f.draft})}))
 if(enabled){expect(response.status).toBe(200);expect((await response.json()).resultado).toMatchObject({estado:'SALDO_RESERVADO_NO_EMITIR',emision_habilitada:false});expect(await f.binding(f.draft.solicitud_id)).not.toBeNull()}
 else{expect(response.status).not.toBe(200);expect(await f.binding(f.draft.solicitud_id)).toBeNull()}
 expect(api.getUser).toHaveBeenCalledTimes(1);expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
})
it('032 ACK perdido recupera el mismo caso y vínculo sin repetir escritura',async()=>{
 const f=await boundCreditFixture();await installCreditBinding();const api=workerFixture(),base=api.rpc.getMockImplementation()!
 api.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='guardar_borrador_nc_homologacion')throw new Error('SYNTHETIC_ACK_LOST');return result})
 expect(await saveFiscalCreditDraft(api.admin,'SYNTHETIC_JWT',sale,op,f.draft)).toMatchObject({solicitud_id:f.draft.solicitud_id,estado:'SALDO_RESERVADO_NO_EMITIR'})
 expect(api.rpc.mock.calls.filter(([name])=>name==='guardar_borrador_nc_homologacion')).toHaveLength(1)
 expect(await f.binding(f.draft.solicitud_id)).not.toBeNull()
})
it('032 pago mixto se conserva como hecho y no habilita efectivo',async()=>{
 const f=await checkoutUnitsFixture();f.snapshot.pagos[0].medio_pago='TARJETA';f.entry.pagos[0].medio='TARJETA'
 await f.prepare();await f.close();const proposal=input();await authorizeReceipt(true,{...proposal,datos:{...proposal.datos,importes:{...proposal.datos.importes,neto:'124.00'}}})
 const source=await validateFiscalRepresentation(await representation(),sale,op),today=(await db.query<{v:string}>("SELECT to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYYMMDD') v")).rows[0].v
 const p=await prepareFiscalCreditDraft(source,{version:1,solicitud_id:crypto.randomUUID(),fecha:today,motivo:'Pago no efectivo',condicion_iva_receptor:5,lineas:[{detalle_id:source.contexto.lineas[0].detalle_id,cantidad:'1.000',importe:'124.00',reingresa_stock:false}],importes:source.constancia.solicitud.solicitud.importes,iva:[],tributos:[]},today)
 await installCreditBinding();expect((await db.query<{data:Record<string,unknown>}>('SELECT guardar_borrador_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,p.canonico,p.sha256])).rows[0].data).toMatchObject({reintegro_habilitado:false,emision_habilitada:false})
 await db.exec('RESET ROLE');expect((await db.query<{f:unknown}>('SELECT fuente f FROM fiscal_nc_comercial_homologacion WHERE solicitud_id=$1',[p.datos.solicitud_id])).rows[0].f).toMatchObject({pago_integro_efectivo:false,pagos:[{medio:'TARJETA',importe:'124.00'}]})
})
it.each([true,false])('HTTP unidades contrasta cierre real y factura sintética, captura habilitada=%s',async(enabled)=>{
 const f=await checkoutUnitsFixture(enabled);await f.prepare();await f.close();const proposal=input()
 await authorizeReceipt(true,{...proposal,datos:{...proposal.datos,importes:{...proposal.datos.importes,neto:'124.00'}}})
 const result=await readUnitsHttp()
 expect(result).toMatchObject({estado:enabled?'CAPTURADAS':'NO_REGISTRADAS',venta_id:sale,operacion_origen_id:op,emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
 if(!enabled)expect(result.unidades).toBeNull()
})
it('HTTP unidades niega reasignación de Auth entre fuente comercial y unidades sin exponer metadata',async()=>{
 const f=await checkoutUnitsFixture();await f.prepare();await f.close();const proposal=input()
 await authorizeReceipt(true,{...proposal,datos:{...proposal.datos,importes:{...proposal.datos.importes,neto:'124.00'}}})
 const api=workerFixture(),base=api.rpc.getMockImplementation()!,other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other])
 api.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='cargar_fuente_comercial_nc_homologacion')await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner]);return result})
 const handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'UNIDADES_NC',venta_id:sale,operacion_origen_id:op})}))
 expect(response.status).not.toBe(200);expect(JSON.stringify(await response.json())).not.toContain('canonico');expect(api.getUser).toHaveBeenCalledTimes(1)
 expect(api.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor)).toBe(true)
})
