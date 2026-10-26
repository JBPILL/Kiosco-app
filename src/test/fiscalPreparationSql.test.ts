import { emitFiscalCreditOperation } from '../../supabase/functions/_shared/fiscalCreditEmissionWorker'
import { wsfeSoap } from './fixtures/fiscalWsfe'
import { syntheticFiscalCreditEmissionReceipt } from './fixtures/fiscalCreditEmission'
import { sendFiscalCreditEmission } from '../../supabase/functions/_shared/fiscalCreditEmission'
import { reconcileFiscalCreditOperation } from '../../supabase/functions/_shared/fiscalCreditConsultWorker'
import { consultFiscalCreditVoucher } from '../../supabase/functions/_shared/fiscalCreditVoucherQuery'
import { syntheticFiscalCreditVoucherXml } from './fixtures/fiscalCreditVoucherXml'
import { createSharedFiscalCreditConsultTicketLoader } from '../../supabase/functions/_shared/fiscalCreditSharedTickets'
import { validateFiscalCreditConsultBinding } from '../../supabase/functions/_shared/fiscalCreditConsultSource'
import { validateFiscalCreditConsultSource } from '../../supabase/functions/_shared/fiscalCreditConsultSource'
import type { FiscalRpc } from '../../supabase/functions/_shared/fiscalPersistence'
import { createSharedFiscalCreditSendTicketLoader } from '../../supabase/functions/_shared/fiscalCreditSharedTickets'
import { validateFiscalCreditSendBinding } from '../../supabase/functions/_shared/fiscalCreditSendSource'
import { validateFiscalCreditSendSource } from '../../supabase/functions/_shared/fiscalCreditSendSource'
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
 mapping.cargar_intencion_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha']
 mapping.cargar_fuente_consulta_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha']
 mapping.cargar_consulta_nc_homologacion=['p_actor','p_venta','p_operacion','p_caso','p_sha','p_consulta']
 mapping.cargar_autorizacion_nc_homologacion=['p_actor','p_venta','p_operacion','p_caso','p_sha']
 mapping.registrar_consulta_nc_homologacion=['p_actor','p_venta','p_operacion','p_caso','p_sha','p_consulta','p_datos']
 mapping.coordinar_ta_consulta_nc_homologacion=['p_actor','p_venta','p_operacion','p_caso','p_sha','p_preparacion_sha','p_binding','p_accion','p_intento','p_generacion','p_cifrado']

 mapping.cargar_respuesta_envio_nc_homologacion=['p_actor','p_venta','p_operacion','p_caso','p_sha']
 mapping.registrar_respuesta_envio_nc_homologacion=['p_actor','p_venta','p_operacion','p_caso','p_sha','p_datos']
 mapping.cargar_fuente_envio_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha','p_cuerpo_sha','p_revision_id','p_permiso_id']
 mapping.registrar_intencion_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha','p_cuerpo_sha','p_revision_id','p_permiso_id','p_intento_id','p_ultimo_autorizado','p_consultado_en']
 mapping.coordinar_ta_envio_nc_homologacion=['p_actor','p_venta','p_operacion','p_caso','p_sha','p_preparacion_sha','p_binding','p_accion','p_intento','p_generacion','p_cifrado']
 mapping.cargar_fuente_numeracion_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha','p_preparacion_sha']
 mapping.reservar_cuerpo_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha','p_preparacion_sha','p_reserva_id','p_ultimo_autorizado','p_consultado_en']
 mapping.cargar_revision_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha','p_revision_id']
 mapping.aprobar_revision_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha','p_revision_id','p_cuerpo_sha','p_preparacion_sha']
 mapping.coordinar_ta_nc_homologacion=['p_actor','p_venta','p_operacion','p_caso','p_sha','p_preparacion_sha','p_binding','p_accion','p_intento','p_generacion','p_cifrado']
 mapping.cargar_preparacion_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha']
 mapping.guardar_preparacion_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha','p_contexto_sha','p_entrada']
 mapping.cargar_fuente_comercial_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id'];mapping.cargar_historial_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_despues'];mapping.guardar_borrador_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_canonico','p_sha'];mapping.cargar_borrador_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id'];mapping.cancelar_borrador_nc_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_origen_id','p_id','p_sha']
 for(const name of ['cargar_aplicacion_comercial_nc_homologacion','cargar_resolucion_nc_homologacion','registrar_resolucion_nc_autorizada_homologacion'])mapping[name]=['p_actor','p_venta','p_operacion','p_caso','p_sha']
 mapping.aplicar_comercial_nc_homologacion=['p_actor','p_venta','p_operacion','p_caso','p_sha','p_caja']
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
 SELECT $1,$2,$3,credencial_id,certificado_sha256,revision,true,clock_timestamp(),clock_timestamp()+interval '30 minutes'
 FROM fiscal_emisores_homologacion WHERE kiosco_id=$4`,[op,permission,frozen.sha256,kid])
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
 // Seed the acquisition cost before checkout so the movement captures real historical evidence.
 await admin('INSERT INTO producto_costos(producto_id,kiosco_id,precio_costo) VALUES($1,$2,40) ON CONFLICT(producto_id) DO UPDATE SET precio_costo=EXCLUDED.precio_costo',[product,kid])
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
async function creditOwnerReviewFixture(){
 const f=await creditNumberedFixture();await f.reserve();await installCreditRequestSource()
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/040_fiscal_credit_owner_review.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
 const packet=(await db.query<{data:Record<string,unknown>}>('SELECT cargar_fuente_cuerpo_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])).rows[0].data
 const body=packet.cuerpo as {sha256:string},reviewId=crypto.randomUUID()
 const read=async(id:string|null=null)=>(await db.query<{data:Record<string,unknown>}>('SELECT cargar_revision_nc_homologacion($1,$2,$3,$4,$5,$6) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,id])).rows[0].data
 const approve=async(id=reviewId,hash=body.sha256,prep=f.prepared.sha256)=>(await db.query<{data:Record<string,unknown>}>('SELECT aprobar_revision_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,id,hash,prep])).rows[0].data
 return{...f,packet,body,reviewId,readReview:read,approve}
}
async function creditPermissionFixture(){
 const f=await creditOwnerReviewFixture();await f.approve()
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/041_fiscal_credit_emission_permission.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql)
 const emitter=(await db.query<{credencial_id:string;certificado_sha256:string;revision:number}>('SELECT credencial_id,certificado_sha256,revision FROM fiscal_emisores_homologacion WHERE kiosco_id=$1',[kid])).rows[0]
 const deadline=(await db.query<{vence_en:string}>('SELECT vence_en::text FROM fiscal_nc_revisiones_homologacion WHERE id=$1',[f.reviewId])).rows[0].vence_en
 await db.exec('SET ROLE service_role')
 const permit=crypto.randomUUID()
 const seed=async(patch:Record<string,unknown>={})=>{
  const row={id:permit,solicitud_id:f.proposal.datos.solicitud_id,reserva_id:f.reservationId,revision_id:f.reviewId,actor_auth_id:actor,
   solicitud_sha256:f.body.sha256,preparacion_sha256:f.prepared.sha256,credencial_id:emitter.credencial_id,certificado_sha256:emitter.certificado_sha256,
   emisor_revision:emitter.revision,habilitado:true,creado_en:new Date().toISOString(),vence_en:deadline,...patch}
  await admin('INSERT INTO fiscal_nc_permisos_homologacion(id,solicitud_id,reserva_id,revision_id,actor_auth_id,solicitud_sha256,preparacion_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,creado_en,vence_en) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)',Object.values(row))
 }
 const verify=async(who=actor,revision=f.reviewId)=>(await db.query<{data:Record<string,unknown>}>('SELECT verificar_permiso_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,f.body.sha256,revision,permit])).rows[0].data
 return{...f,permit,seed,verify}
}
async function creditConsultJournalFixture(){
 const f=await creditConsultSourceFixture();await f.startIntent();await db.exec('RESET ROLE')
 const sql=readFileSync('supabase/pilot-fiscal/047_fiscal_credit_consultation_journal.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
 const id=crypto.randomUUID(),today=(await db.query<{v:string}>("SELECT to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYYMMDD') v")).rows[0].v
 const received={intento_id:f.attempt,solicitud_sha256:f.body.sha256,consultado_en:new Date().toISOString(),resultado:{estado:'AUTORIZACION_NC_COINCIDENTE',cae:'11111111111111',vencimiento:today,procesadoEn:today,solicitudSha256:f.body.sha256,puedeReenviar:false},emision_habilitada:false}
 const write=async(data:unknown=received,query=id)=>(await db.query<{data:Record<string,unknown>}>('SELECT registrar_consulta_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,query,JSON.stringify(data)])).rows[0].data
 const read=async(query=id,who=actor)=>(await db.query<{data:Record<string,unknown>|null}>('SELECT cargar_consulta_nc_homologacion($1,$2,$3,$4,$5,$6) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,query])).rows[0].data
 const readAuthorization=async(who=actor)=>(await db.query<{data:Record<string,unknown>|null}>('SELECT cargar_autorizacion_nc_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])).rows[0].data
 return{...f,id,received,write,read,readAuthorization}
}
it.each(['normal','recuperado','ack-perdido','get-perdido','gate-cerrado','gate-tras-red','sin-confirmacion','auth-falla','diario-alterado','permiso-revocado','cae-concurrente','conflicto-durable'] as const)('047 worker consulta integrado %s recupera antes de credenciales y no aplica negocio',async(mode)=>{
 const f=await creditConsultJournalFixture();await db.exec('RESET ROLE')
 for(const name of ['039_fiscal_credit_ticket_coordination.sql','046_fiscal_credit_consult_ticket_coordination.sql']){const sql=readFileSync('supabase/pilot-fiscal/'+name,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql)}await db.exec('SET ROLE service_role')
 if(mode==='conflicto-durable'){await db.exec('RESET ROLE');await db.exec(readFileSync('supabase/pilot-fiscal/048_fiscal_credit_conflicts.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));await db.exec('SET ROLE service_role')}
 const source=await f.consult(),validated=await validateFiscalCreditConsultSource(source,f.source,f.proposal,actor),b=validated.binding,api=workerFixture(),before=await preparationEffects()
 api.flags.ARCA_HOMO_CREDIT_CONSULT_ENABLED=mode==='recuperado'||mode==='gate-cerrado'?'false':'true'
 if(mode==='recuperado'||mode==='diario-alterado')await f.write()
 if(mode==='recuperado')await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 if(mode==='permiso-revocado')await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit])
 if(mode==='auth-falla')api.getUser.mockResolvedValue({data:{user:null},error:new Error('SYNTHETIC_AUTH_REJECTED')})
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),keyId=crypto.randomUUID(),keys={active:vi.fn(async()=>({id:keyId,key})),read:vi.fn(async()=>key)}
 const ticket={entorno:'HOMOLOGACION' as const,servicio:'wsfe' as const,cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_WORKER_TOKEN',sign:'SYNTHETIC_WORKER_SIGN',expiresAt:Date.now()+3600000}
 const wsaa=vi.fn(async(_b:Readonly<typeof b>,_signal:AbortSignal,beforeSend:()=>Promise<void>)=>{await beforeSend();return ticket}),createWsaa=vi.fn((_guard:()=>Promise<void>)=>wsaa)
 const fetcher=vi.fn<typeof fetch>(async()=>{if(mode==='gate-tras-red')api.flags.ARCA_HOMO_CREDIT_CONSULT_ENABLED='false';let xml=syntheticFiscalCreditVoucherXml(validated.cuerpo.datos.solicitud).xml
 if(mode==='cae-concurrente'||mode==='conflicto-durable')xml=xml.replace('11111111111111','22222222222222')
 if(mode==='sin-confirmacion')xml=xml.replace(/<CbtesAsoc>.*?<\/CbtesAsoc>/,'')
 return new Response(xml,{headers:{'content-type':'text/xml'}})})
 let recorded=false,loseRead=mode==='get-perdido';const base=api.rpc.getMockImplementation()!
 api.rpc.mockImplementation(async(name,args)=>{if(recorded&&loseRead&&(name==='cargar_autorizacion_nc_homologacion'||name==='cargar_consulta_nc_homologacion'))return{data:null,error:new Error('SYNTHETIC_GET_LOST')}
 if((mode==='cae-concurrente'||mode==='conflicto-durable')&&name==='registrar_consulta_nc_homologacion')await f.write(f.received,crypto.randomUUID())
 const result=await base(name,args)
 if(mode==='diario-alterado'&&name==='cargar_autorizacion_nc_homologacion'&&result.data){const data:unknown=structuredClone(result.data);if(data&&typeof data==='object'&&!Array.isArray(data))return{data:{...data,solicitud_sha256:'f'.repeat(64)},error:null}}
 if(name==='registrar_consulta_nc_homologacion'&&!result.error){recorded=true;if(mode==='ack-perdido')throw new Error('SYNTHETIC_ACK_LOST')}
 return result})
 const scope={saleId:sale,operationId:op,requestId:f.proposal.datos.solicitud_id,sha256:f.proposal.sha256},run=()=>reconcileFiscalCreditOperation({admin:api.admin,readSecret:name=>api.flags[name],keys,createWsaa,fetcher},'SYNTHETIC_JWT',scope,f.id)
 if(['gate-cerrado','gate-tras-red','auth-falla','diario-alterado','get-perdido','cae-concurrente'].includes(mode)){await expect(run()).rejects.toThrow('FISCAL_CONCILIACION_NC_NO_CONFIRMADA')
 if(mode==='get-perdido'){loseRead=false;api.flags.ARCA_HOMO_CREDIT_CONSULT_ENABLED='false';expect(await run()).toMatchObject({estado:'CAE_NC_REGISTRADO_NO_APLICADO'});expect(fetcher).toHaveBeenCalledTimes(1)}
 }else{expect(await run()).toMatchObject({estado:mode==='conflicto-durable'?'CONFLICTO_NC_NO_APLICAR':mode==='sin-confirmacion'?'CONSULTA_NC_REGISTRADA':'CAE_NC_REGISTRADO_NO_APLICADO',emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})}
 if(['recuperado','gate-cerrado','auth-falla','diario-alterado'].includes(mode)){expect(keys.active).not.toHaveBeenCalled();expect(createWsaa).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()}
 expect(api.getUser).toHaveBeenCalledTimes(mode==='get-perdido'?2:1);expect(await preparationEffects()).toEqual(before)
 expect(api.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor||args.p_actor===actor)).toBe(true)
})
it('047 CAE registrado durable no aplica negocio; ACK perdido/replay conserva consulta exacta',async()=>{
 const f=await creditConsultJournalFixture(),before=await preparationEffects();expect(await f.read()).toBeNull();expect(await f.readAuthorization()).toBeNull()
 const ack=await f.write();expect(ack).toMatchObject({consulta_id:f.id,estado:'CAE_NC_REGISTRADO_NO_APLICADO',reintegro_habilitado:false,reposicion_habilitada:false,emision_habilitada:false})
 expect(await f.read()).toEqual(ack);expect(await f.readAuthorization()).toEqual(ack);expect(await f.write()).toEqual(ack);expect(await preparationEffects()).toEqual(before)
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_autorizaciones_homologacion')).rows[0].n).toBe(1);await db.exec('SET ROLE service_role')
})
it('047 distintas consultas mismo CAE conservan una autorización y no se degradan con CONCILIAR',async()=>{
 const f=await creditConsultJournalFixture();await f.write();const next=crypto.randomUUID();await f.write(f.received,next)
 const review={...f.received,resultado:{estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false}};expect(await f.write(review,crypto.randomUUID())).toMatchObject({estado:'CONSULTA_NC_REGISTRADA'})
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_autorizaciones_homologacion')).rows[0].n).toBe(1);expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_consultas_homologacion')).rows[0].n).toBe(3);await db.exec('SET ROLE service_role')
})
it('047 CAE contradictorio o UUID con otros datos no reemplaza historia',async()=>{
 const f=await creditConsultJournalFixture(),ack=await f.write(),altered={...f.received,resultado:{...f.received.resultado,cae:'22222222222222'}}
 await denied(()=>f.write(altered));await denied(()=>f.write(altered,crypto.randomUUID()));expect(await f.read()).toEqual(ack)
})
it('047 rollback no deja consulta ni autorización fantasma',async()=>{
 const f=await creditConsultJournalFixture();await db.exec('SAVEPOINT lost_query');await f.write();await db.exec('ROLLBACK TO SAVEPOINT lost_query; RELEASE SAVEPOINT lost_query');expect(await f.read()).toBeNull();expect(await f.write()).toMatchObject({estado:'CAE_NC_REGISTRADO_NO_APLICADO'})
})
it('047 respuesta recibida/replay se conserva tras deshabilitar custodia sin reautorizar envío',async()=>{
 const f=await creditConsultJournalFixture();await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');const ack=await f.write();expect(await f.read()).toEqual(ack);expect(await f.write()).toEqual(ack);await denied(()=>f.consult());expect(await f.readIntent()).toMatchObject({nuevo_envio:false})
})
it.each(['intento','hash','futuro','infinito','antes','extra','cae','vencimiento','proceso','reenvio','resultado'] as const)('047 rechaza %s sin escritura parcial',async(reason)=>{
 const f=await creditConsultJournalFixture(),data:Record<string,unknown>=structuredClone(f.received)
 if(reason==='intento')data.intento_id=crypto.randomUUID();if(reason==='hash')data.solicitud_sha256='f'.repeat(64)
 if(reason==='futuro')data.consultado_en=new Date(Date.now()+60000).toISOString();if(reason==='infinito')data.consultado_en='infinity';if(reason==='antes')data.consultado_en='2000-01-01T00:00:00Z';if(reason==='extra')data.token='SYNTHETIC_FORBIDDEN'
 if(['cae','vencimiento','proceso','reenvio','resultado'].includes(reason)){data.resultado={...f.received.resultado,...(reason==='cae'?{cae:'00000000000000'}:reason==='vencimiento'?{vencimiento:'20260230'}:reason==='proceso'?{procesadoEn:'20261025259999'}:reason==='reenvio'?{puedeReenviar:true}:{estado:'EMITIDA'})}}
 await denied(()=>f.write(data));expect(await f.read()).toBeNull()
})
it('047 identidad y tablas privadas no se sustituyen desde perfil o navegador',async()=>{
 const f=await creditConsultJournalFixture();await f.write();const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner]);await denied(()=>f.read());await denied(()=>f.read(f.id,other));await denied(()=>f.readAuthorization());await denied(()=>f.readAuthorization(other))
 for(const role of ['anon','authenticated','service_role']){await db.exec('SET ROLE '+role);await denied(()=>db.exec('SELECT * FROM fiscal_nc_consultas_homologacion'));await denied(()=>db.exec('SELECT * FROM fiscal_nc_autorizaciones_homologacion'))}
 for(const role of ['anon','authenticated']){await db.exec('SET ROLE '+role);await denied(()=>f.write());await denied(()=>f.read())}
 await db.exec('RESET ROLE');await denied(()=>db.exec('DELETE FROM fiscal_nc_consultas_homologacion'));await denied(()=>db.exec('UPDATE fiscal_nc_autorizaciones_homologacion SET cae=cae'));await db.exec('SET ROLE service_role')
})
async function creditConsultTicketFixture(){
 const f=await creditConsultSourceFixture();await f.startIntent();const source=await f.consult()
 await db.exec('RESET ROLE');for(const name of ['039_fiscal_credit_ticket_coordination.sql','046_fiscal_credit_consult_ticket_coordination.sql']){const sql=readFileSync('supabase/pilot-fiscal/'+name,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql)}await db.exec('SET ROLE service_role')
 const intent=crypto.randomUUID(),cipher={version:1,keyId:crypto.randomUUID(),nonce:'a'.repeat(24),ciphertext:'b'.repeat(64),expiresAt:Date.now()+3600000}
 const call=async(action:string,id:string|null=null,generation:number|null=null,encrypted:unknown=null,binding:unknown=source.binding)=>(await db.query<{data:Record<string,unknown>}>('SELECT coordinar_ta_consulta_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,f.prepared.sha256,JSON.stringify(binding),action,id,generation,encrypted===null?null:JSON.stringify(encrypted)])).rows[0].data
 return{...f,source,intent,cipher,call}
}
it('046 ciclo TA de consulta no concede envío fiscal ni otro intento comercial',async()=>{
 const f=await creditConsultTicketFixture(),before=await preparationEffects(),original=await f.readIntent()
 expect(await f.call('SOLICITAR',f.intent)).toMatchObject({estado:'RENOVAR',nuevo_intento:true})
 expect(await f.call('SOLICITAR',crypto.randomUUID())).toMatchObject({estado:'RENOVACION_PENDIENTE'})
 expect(await f.call('INICIAR',f.intent,1)).toMatchObject({nuevo_envio:true});expect(await f.call('INICIAR',f.intent,1)).toMatchObject({nuevo_envio:false})
 const ack=await f.call('CONFIRMAR',f.intent,1,f.cipher);expect(await f.call('CONFIRMAR',f.intent,1,f.cipher)).toEqual(ack)
 expect(await f.call('SOLICITAR',crypto.randomUUID())).toMatchObject({estado:'DISPONIBLE',cifrado:f.cipher})
 expect(await f.readIntent()).toEqual(original);expect(await preparationEffects()).toEqual(before);await denied(()=>f.startIntent(crypto.randomUUID()))
})
it('046 permiso de envío revocado no impide TA específico de consulta',async()=>{
 const f=await creditConsultTicketFixture();await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit])
 expect(await f.call('SOLICITAR',f.intent)).toMatchObject({estado:'RENOVAR'});expect(await f.call('INICIAR',f.intent,1)).toMatchObject({nuevo_envio:true})
})
it('046 custodia revocada conserva confirmación recibida y bloquea nueva autenticación',async()=>{
 const f=await creditConsultTicketFixture();await f.call('SOLICITAR',f.intent);await f.call('INICIAR',f.intent,1);await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 expect(await f.call('CONFIRMAR',f.intent,1,f.cipher)).toMatchObject({estado:'DISPONIBLE'});await denied(()=>f.call('SOLICITAR',crypto.randomUUID()));expect(await f.call('ESTADO')).toMatchObject({estado:'DISPONIBLE'})
})
it.each(['intento','finalidad','extra'] as const)('046 binding alterado %s no concede TA',async(reason)=>{
 const f=await creditConsultTicketFixture(),binding={...f.source.binding,[reason==='intento'?'intento_id':reason==='finalidad'?'finalidad':'extra']:reason==='finalidad'?'ENVIO_NC':crypto.randomUUID()}
 await denied(()=>f.call('SOLICITAR',f.intent,null,null,binding));expect(await f.call('ESTADO')).toMatchObject({estado:'VACIO'})
})
it('046 cancelar lease antes de WSAA no borra intención comercial',async()=>{
 const f=await creditConsultTicketFixture(),before=await f.readIntent();await f.call('SOLICITAR',f.intent);expect(await f.call('CANCELAR',f.intent,1)).toMatchObject({estado:'CANCELADA'});expect(await f.readIntent()).toEqual(before)
})
it.each(['anon','authenticated'])('046 coordinación privada rechaza %s',async(role)=>{
 const f=await creditConsultTicketFixture();await db.exec('SET ROLE '+role);await denied(()=>f.call('SOLICITAR',f.intent))
})
it.each(['normal','ack-iniciar','ack-confirmar','clave-falla'] as const)('046 loader consulta SQL integrado %s conserva recuperación',async(mode)=>{
 const f=await creditConsultTicketFixture(),binding=validateFiscalCreditConsultBinding(f.source.binding),actions:string[]=[],original=await f.readIntent()
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),keyId=crypto.randomUUID()
 const keys={active:vi.fn(async()=>{if(mode==='clave-falla')throw new Error('SYNTHETIC_KEY_FAILURE');return{id:keyId,key}}),read:vi.fn(async()=>key)}
 const rpc:FiscalRpc={rpc:async(name,args)=>{expect(name).toBe('coordinar_ta_consulta_nc_homologacion');const action=String(args.p_accion);actions.push(action)
 const data=await f.call(action,typeof args.p_intento==='string'?args.p_intento:null,typeof args.p_generacion==='number'?args.p_generacion:null,args.p_cifrado,args.p_binding)
 if(mode==='ack-iniciar'&&action==='INICIAR'||mode==='ack-confirmar'&&action==='CONFIRMAR')throw new Error('SYNTHETIC_ACK_LOST');return{data,error:null}}}
 const ticket={entorno:'HOMOLOGACION' as const,servicio:'wsfe' as const,cuitEmisor:binding.cuit_emisor,credencialId:binding.credencial_id,certificadoSha256:binding.certificado_sha256,expiresAt:Date.now()+3600000,token:'SYNTHETIC_CONSULT_TOKEN',sign:'SYNTHETIC_CONSULT_SIGN'}
 const wsaa=vi.fn(async(_b:Readonly<typeof binding>,_s:AbortSignal,beforeSend:()=>Promise<void>)=>{await beforeSend();return ticket})
 const load=()=>createSharedFiscalCreditConsultTicketLoader(rpc,keys,wsaa,async()=>{expect((await f.consult()).binding).toEqual(binding)})(binding,new AbortController().signal)
 if(mode==='normal'){expect((await load()).token).toBe(ticket.token);expect((await load()).sign).toBe(ticket.sign);expect(wsaa).toHaveBeenCalledTimes(1)}else{await expect(load()).rejects.toThrow('FISCAL_TICKET_NC_NO_CONFIRMADO')
 if(mode==='ack-confirmar'){expect((await load()).token).toBe(ticket.token);expect(wsaa).toHaveBeenCalledTimes(1);expect(actions).not.toContain('CANCELAR')}
 if(mode==='ack-iniciar'){expect(actions).toEqual(['SOLICITAR','INICIAR']);await expect(load()).rejects.toThrow();expect(actions).not.toContain('CANCELAR')}
 if(mode==='clave-falla'){expect(actions).toEqual(['SOLICITAR','CANCELAR']);expect(wsaa).not.toHaveBeenCalled()}}
 expect(await f.readIntent()).toEqual(original)
})
async function creditConsultSourceFixture(){
 const f=await creditSendSourceFixture();await f.seed()
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/045_fiscal_credit_consult_source.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
 const consult=async(who=actor)=>(await db.query<{data:{binding:Record<string,unknown>;intencion:Record<string,unknown>;cuerpo:unknown}}>('SELECT cargar_fuente_consulta_nc_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])).rows[0].data
 return{...f,consult}
}
it.each([false,true])('045 transporte FECompConsultar con guard SQL actual, custodia revocada=%s',async(revoked)=>{
 const f=await creditConsultSourceFixture();await f.startIntent();const packet=await f.consult(),validated=await validateFiscalCreditConsultSource(packet,f.source,f.proposal,actor),b=validated.binding,before=await preparationEffects(),original=await f.readIntent()
 const ticket={entorno:'HOMOLOGACION' as const,servicio:'wsfe' as const,cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_QUERY_TOKEN',sign:'SYNTHETIC_QUERY_SIGN',expiresAt:Date.now()+120000}
 const xml=syntheticFiscalCreditVoucherXml(validated.cuerpo.datos.solicitud).xml
 const fetcher=vi.fn<typeof fetch>(async()=>new Response(xml,{headers:{'content-type':'text/xml'}})),guard=vi.fn(async(binding:Readonly<typeof b>)=>{await db.exec('SAVEPOINT query_guard');try{expect((await f.consult()).binding).toEqual(binding);await db.exec('RELEASE SAVEPOINT query_guard')}catch{await db.exec('ROLLBACK TO SAVEPOINT query_guard; RELEASE SAVEPOINT query_guard');throw new Error('SYNTHETIC_SQL_GUARD_REJECTED')}})
 if(revoked)await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 const run=()=>consultFiscalCreditVoucher({packet,source:f.source,draft:f.proposal,actorAuthId:actor},ticket,{fetcher,beforeSend:guard,signal:new AbortController().signal})
 if(revoked){await expect(run()).rejects.toThrow('FISCAL_CONSULTA_NC_NO_CONFIRMADA');expect(fetcher).not.toHaveBeenCalled()}
 else{expect(await run()).toMatchObject({intento_id:f.attempt,solicitud_sha256:f.body.sha256,resultado:{estado:'AUTORIZACION_NC_COINCIDENTE',puedeReenviar:false},emision_habilitada:false});expect(fetcher).toHaveBeenCalledTimes(1);expect(guard).toHaveBeenCalledTimes(2)}
 expect(await preparationEffects()).toEqual(before);expect(await f.readIntent()).toEqual(original)
})
it('045 consulta exige intención previa y no devuelve autoridad de envío',async()=>{
 const f=await creditConsultSourceFixture();await denied(()=>f.consult());await f.startIntent();const before=await preparationEffects(),result=await f.consult()
 expect(result.binding).toMatchObject({finalidad:'CONSULTA_NC',intento_id:f.attempt,solicitud_sha256:f.body.sha256,numero:23,actor_auth_id:actor,emision_habilitada:false})
 expect(result.intencion).toMatchObject({nuevo_envio:false,estado:'ENVIO_INCIERTO'});const validated=await validateFiscalCreditConsultSource(result,f.source,f.proposal,actor);expect(validated.binding).toEqual(result.binding);await denied(()=>f.load());expect(await f.consult()).toEqual(result);expect(await preparationEffects()).toEqual(before)
})
it('045 permiso de envío revocado y catálogo deshabilitado no borran consulta histórica',async()=>{
 const f=await creditConsultSourceFixture();await f.startIntent();const before=await f.consult()
 await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit]);await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false')
 expect(await f.consult()).toEqual(before);await denied(()=>f.load());expect(await f.readIntent()).toMatchObject({nuevo_envio:false})
})
it.each(['deshabilitado','credencial','certificado','revision','cuit','punto'] as const)('045 custodia %s bloquea consulta sin borrar intención',async(reason)=>{
 const f=await creditConsultSourceFixture();await f.startIntent();const before=await f.readIntent()
 const sql=reason==='deshabilitado'?'habilitado=false':reason==='credencial'?"credencial_id='11111111-1111-4111-8111-111111111111'":reason==='certificado'?"certificado_sha256=repeat('e',64)":reason==='revision'?'revision=revision+1':reason==='cuit'?"cuit_emisor=CASE WHEN cuit_emisor='20123456786' THEN '20415005963' ELSE '20123456786' END":'punto_venta=8'
 await admin('UPDATE fiscal_emisores_homologacion SET '+sql);await denied(()=>f.consult());expect(await f.readIntent()).toEqual(before)
})
it('045 Auth reasignado no transfiere consulta ni custodia histórica',async()=>{
 const f=await creditConsultSourceFixture();await f.startIntent();const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>f.consult());await denied(()=>f.consult(other))
})
it.each(['anon','authenticated'])('045 consulta no está expuesta al rol %s',async(role)=>{
 const f=await creditConsultSourceFixture();await f.startIntent();await db.exec('SET ROLE '+role);await denied(()=>f.consult())
})
async function creditSendTicketFixture(){
 const f=await creditSendSourceFixture();await f.seed();const source=await f.load()
 await db.exec('RESET ROLE')
 for(const name of ['039_fiscal_credit_ticket_coordination.sql','044_fiscal_credit_send_ticket_coordination.sql']){
  const sql=readFileSync('supabase/pilot-fiscal/'+name,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql)
 }
 await db.exec('SET ROLE service_role');const intent=crypto.randomUUID(),cipher={version:1,keyId:crypto.randomUUID(),nonce:'a'.repeat(24),ciphertext:'b'.repeat(64),expiresAt:Date.now()+3600000}
 const call=async(action:string,id:string|null=null,generation:number|null=null,encrypted:unknown=null,binding:unknown=source.binding)=>(await db.query<{data:Record<string,unknown>}>('SELECT coordinar_ta_envio_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$9,$10,$11::jsonb) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,f.prepared.sha256,JSON.stringify(binding),action,id,generation,encrypted===null?null:JSON.stringify(encrypted)])).rows[0].data
 return{...f,source,intent,cipher,call}
}
it.each(['normal','ack-iniciar','ack-confirmar','clave-falla'] as const)('044 loader ENVIO_NC integrado %s conserva incertidumbre y recuperación',async(mode)=>{
 const f=await creditSendTicketFixture(),binding=validateFiscalCreditSendBinding(f.source.binding),actions:string[]=[],before=await preparationEffects()
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),keyId=crypto.randomUUID()
 const keys={active:vi.fn(async()=>{if(mode==='clave-falla')throw new Error('SYNTHETIC_KEY_FAILURE');return{id:keyId,key}}),read:vi.fn(async()=>key)}
 const rpc:FiscalRpc={rpc:async(name,args)=>{
  expect(name).toBe('coordinar_ta_envio_nc_homologacion');const action=String(args.p_accion);actions.push(action)
  const result=await f.call(action,typeof args.p_intento==='string'?args.p_intento:null,typeof args.p_generacion==='number'?args.p_generacion:null,args.p_cifrado,args.p_binding)
  if(mode==='ack-iniciar'&&action==='INICIAR'||mode==='ack-confirmar'&&action==='CONFIRMAR')throw new Error('SYNTHETIC_ACK_LOST')
  return{data:result,error:null}
 }}
 const ticket={entorno:'HOMOLOGACION' as const,servicio:'wsfe' as const,cuitEmisor:binding.cuit_emisor,credencialId:binding.credencial_id,certificadoSha256:binding.certificado_sha256,expiresAt:Date.now()+3600000,token:'SYNTHETIC_SEND_TOKEN',sign:'SYNTHETIC_SEND_SIGN'}
 const wsaa=vi.fn(async(_b:Readonly<typeof binding>,_s:AbortSignal,beforeSend:()=>Promise<void>)=>{await beforeSend();return ticket})
 const load=()=>createSharedFiscalCreditSendTicketLoader(rpc,keys,wsaa,async()=>{expect((await f.load()).binding).toEqual(binding)})(binding,new AbortController().signal)
 if(mode==='normal'){expect((await load()).token).toBe(ticket.token);expect((await load()).sign).toBe(ticket.sign);expect(wsaa).toHaveBeenCalledTimes(1)}
 else{await expect(load()).rejects.toThrow('FISCAL_TICKET_NC_NO_CONFIRMADO')
  if(mode==='ack-confirmar'){expect((await load()).token).toBe(ticket.token);expect(wsaa).toHaveBeenCalledTimes(1);expect(actions).not.toContain('CANCELAR')}
  if(mode==='ack-iniciar'){expect(actions).toEqual(['SOLICITAR','INICIAR']);await expect(load()).rejects.toThrow();expect(actions).not.toContain('CANCELAR')}
  if(mode==='clave-falla'){expect(actions).toEqual(['SOLICITAR','CANCELAR']);expect(wsaa).not.toHaveBeenCalled()}
 }
 expect(await preparationEffects()).toEqual(before);expect(await f.readIntent()).toBeNull()
})
it('044 ciclo TA ENVIO_NC un permiso de WSAA y confirmación cifrada recuperable',async()=>{
 const f=await creditSendTicketFixture(),before=await preparationEffects()
 expect(await f.call('SOLICITAR',f.intent)).toMatchObject({estado:'RENOVAR',nuevo_intento:true})
 expect(await f.call('SOLICITAR',crypto.randomUUID())).toMatchObject({estado:'RENOVACION_PENDIENTE',nuevo_intento:false})
 expect(await f.call('INICIAR',f.intent,1)).toMatchObject({nuevo_envio:true})
 expect(await f.call('INICIAR',f.intent,1)).toMatchObject({nuevo_envio:false})
 await denied(()=>f.call('CANCELAR',f.intent,1))
 const ack=await f.call('CONFIRMAR',f.intent,1,f.cipher);expect(await f.call('CONFIRMAR',f.intent,1,f.cipher)).toEqual(ack)
 expect(await f.call('SOLICITAR',crypto.randomUUID())).toMatchObject({estado:'DISPONIBLE',nuevo_intento:false,cifrado:f.cipher})
 expect(await preparationEffects()).toEqual(before);expect(await f.readIntent()).toBeNull()
})
it('044 confirmación histórica tras revocación conserva TA sin autorizar nuevo WSAA',async()=>{
 const f=await creditSendTicketFixture();await f.call('SOLICITAR',f.intent);await f.call('INICIAR',f.intent,1)
 await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit]);await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 expect(await f.call('CONFIRMAR',f.intent,1,f.cipher)).toMatchObject({estado:'DISPONIBLE'})
 expect(await f.call('ESTADO')).toMatchObject({estado:'DISPONIBLE',intento_id:f.intent})
 await denied(()=>f.call('SOLICITAR',crypto.randomUUID()));await denied(()=>f.call('INICIAR',f.intent,1))
})
it('044 cancelar lease sin envío no borra historia ni afecta generación siguiente',async()=>{
 const f=await creditSendTicketFixture();await f.call('SOLICITAR',f.intent);await f.call('CANCELAR',f.intent,1)
 const next=crypto.randomUUID();expect(await f.call('SOLICITAR',next)).toMatchObject({estado:'RENOVAR',revision:2})
 expect(await f.call('CANCELAR',f.intent,1)).toMatchObject({estado:'CANCELADA'})
 expect(await f.call('ESTADO')).toMatchObject({estado:'PREPARADA',intento_id:next,revision:2})
})
it.each(['finalidad','permiso','cuerpo','preparacion','actor','extra'] as const)('044 binding ajeno %s no crea intento ni transmite',async(reason)=>{
 const f=await creditSendTicketFixture(),binding:Record<string,unknown>={...f.source.binding}
 const key=reason==='finalidad'?'finalidad':reason==='permiso'?'permiso_id':reason==='cuerpo'?'solicitud_sha256':reason==='preparacion'?'preparacion_sha256':reason==='actor'?'actor_auth_id':'extra'
 binding[key]=reason==='finalidad'?'NUMERACION_NC':reason==='permiso'||reason==='actor'?crypto.randomUUID():'a'.repeat(64)
 await denied(()=>f.call('SOLICITAR',f.intent,null,null,binding));expect(await f.call('ESTADO')).toMatchObject({estado:'VACIO'})
})
it('044 intención comercial NC existente bloquea preparación nueva de WSAA',async()=>{
 const f=await creditSendTicketFixture();await f.startIntent();await denied(()=>f.call('SOLICITAR',f.intent));expect(await f.call('ESTADO')).toMatchObject({estado:'VACIO'})
})
it.each(['extra','plano','vencido'] as const)('044 sobre %s inválido preserva incertidumbre',async(reason)=>{
 const f=await creditSendTicketFixture();await f.call('SOLICITAR',f.intent);await f.call('INICIAR',f.intent,1)
 const encrypted=reason==='extra'?{...f.cipher,token:'SYNTHETIC'}:reason==='plano'?{token:'SYNTHETIC',sign:'SYNTHETIC'}:{...f.cipher,expiresAt:Date.now()-1000}
 await denied(()=>f.call('CONFIRMAR',f.intent,1,encrypted));expect(await f.call('ESTADO')).toMatchObject({estado:'ENVIO_INCIERTO'})
})
it.each(['anon','authenticated'])('044 rol %s no obtiene autoridad de TA',async(role)=>{
 const f=await creditSendTicketFixture();await db.exec('SET ROLE '+role);await denied(()=>f.call('SOLICITAR',f.intent))
})
async function creditSendSourceFixture(){
 const f=await creditIntentFixture()
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/043_fiscal_credit_send_source.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
 const load=async(who=actor,hash=f.body.sha256,review=f.reviewId,permit=f.permit)=>(await db.query<{data:{binding:Record<string,unknown>;cuerpo:unknown;permiso:unknown}}>('SELECT cargar_fuente_envio_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,hash,review,permit])).rows[0].data
 return{...f,load}
}
it('043 fuente de envío exige permiso exacto y entrega finalidad NC propia sin consumirlo',async()=>{
 const f=await creditSendSourceFixture(),before=await preparationEffects();await denied(()=>f.load());await f.seed()
 const result=await f.load();expect(result.binding).toMatchObject({version:1,entorno:'HOMOLOGACION',servicio:'wsfe',finalidad:'ENVIO_NC',actor_auth_id:actor,solicitud_id:f.proposal.datos.solicitud_id,solicitud_sha256:f.body.sha256,permiso_id:f.permit,revision_id:f.reviewId,numero:23,tipo_comprobante:13,emision_habilitada:false})
 expect(result.binding).not.toHaveProperty('operacion_id');expect(result.binding.revision_parametros).toBeTypeOf('number')
 const validated=await validateFiscalCreditSendSource(result,f.source,f.proposal,actor);expect(validated.binding).toEqual(result.binding);expect(validated.cuerpo.sha256).toBe(f.body.sha256)
 expect(await f.readIntent()).toBeNull();expect(await f.load()).toEqual(result);expect(await preparationEffects()).toEqual(before)
})
it('043 intención existente impide obtener nueva fuente de envío; historia sigue recuperable',async()=>{
 const f=await creditSendSourceFixture();await f.seed();await f.load();const ack=await f.startIntent()
 await denied(()=>f.load());expect(await f.readIntent()).toEqual({...ack,nuevo_envio:false})
})
it.each(['actor','hash','revision','permiso','emisor','revocado','parametros'] as const)('043 fuente niega %s sin abrir envío ni alterar efectos',async(reason)=>{
 const f=await creditSendSourceFixture();await f.seed();const before=await preparationEffects()
 if(reason==='emisor')await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 if(reason==='revocado')await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit])
 if(reason==='parametros')await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false')
 await denied(()=>f.load(reason==='actor'?crypto.randomUUID():actor,reason==='hash'?'a'.repeat(64):f.body.sha256,reason==='revision'?crypto.randomUUID():f.reviewId,reason==='permiso'?crypto.randomUUID():f.permit))
 expect(await f.readIntent()).toBeNull();expect(await preparationEffects()).toEqual(before)
})
it.each(['anon','authenticated'])('043 fuente privada no expone custodia al rol %s',async(role)=>{
 const f=await creditSendSourceFixture();await f.seed();await db.exec('SET ROLE '+role);await denied(()=>f.load())
})
async function creditIntentFixture(){
 const f=await creditPermissionFixture()
 await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/042_fiscal_credit_send_intent.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'')
 await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
 const attempt=crypto.randomUUID()
 const read=async(who=actor)=>(await db.query<{data:Record<string,unknown>|null}>('SELECT cargar_intencion_nc_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])).rows[0].data
 const start=async(id=attempt,last:number|null=22,when:string|null=new Date().toISOString(),permit=f.permit,revision=f.reviewId)=>(await db.query<{data:Record<string,unknown>}>('SELECT registrar_intencion_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,f.body.sha256,revision,permit,id,last,when])).rows[0].data
 return{...f,attempt,readIntent:read,startIntent:start}
}
it('042 crea intención y consume permiso atómicamente; sólo ACK nuevo concede una vez',async()=>{
 const f=await creditIntentFixture(),before=await preparationEffects();expect(await f.readIntent()).toBeNull()
 await denied(()=>f.startIntent());await f.seed()
 const ack=await f.startIntent();expect(ack).toMatchObject({version:1,estado:'ENVIO_INCIERTO',intento_id:f.attempt,permiso_id:f.permit,revision_id:f.reviewId,nuevo_envio:true,emision_habilitada:false})
 const recovered=await f.readIntent();expect(recovered).toEqual({...ack,nuevo_envio:false})
 expect(await f.startIntent(f.attempt,null,null)).toEqual(recovered)
 await denied(()=>f.startIntent(crypto.randomUUID()));await denied(()=>f.startIntent(f.attempt,null,null,crypto.randomUUID()))
 expect(await f.readIntent()).toEqual(recovered);expect(await preparationEffects()).toEqual(before)
})
it.each(['ultimo','fecha','futuro','infinito','deshabilitado','revocado'] as const)('042 rechazo %s no consume ni crea estado parcial',async(reason)=>{
 const f=await creditIntentFixture();await f.seed(reason==='deshabilitado'?{habilitado:false}:{})
 if(reason==='revocado')await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit])
 const when=reason==='fecha'?new Date(Date.now()-31000).toISOString():reason==='futuro'?new Date(Date.now()+60000).toISOString():reason==='infinito'?'infinity':new Date().toISOString()
 await denied(()=>f.startIntent(f.attempt,reason==='ultimo'?23:22,when));expect(await f.readIntent()).toBeNull()
})
it('042 rollback restaura permiso disponible sin dejar intención fantasma',async()=>{
 const f=await creditIntentFixture();await f.seed();await db.exec('SAVEPOINT lost_intent')
 expect((await f.startIntent()).nuevo_envio).toBe(true);await db.exec('ROLLBACK TO SAVEPOINT lost_intent; RELEASE SAVEPOINT lost_intent')
 expect(await f.readIntent()).toBeNull();expect((await f.startIntent()).nuevo_envio).toBe(true)
})
it('042 incertidumbre se recupera tras revocar permiso/emisor sin volver a conceder envío',async()=>{
 const f=await creditIntentFixture();await f.seed();const ack=await f.startIntent()
 await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit]);await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 expect(await f.readIntent()).toEqual({...ack,nuevo_envio:false});expect(await f.startIntent(f.attempt,null,null)).toEqual({...ack,nuevo_envio:false})
 await denied(()=>f.startIntent(crypto.randomUUID()))
})
it('042 identidad original e intención inmutable no se sustituyen desde navegador o perfil',async()=>{
 const f=await creditIntentFixture();await f.seed();await f.startIntent()
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>f.readIntent());await denied(()=>f.readIntent(other))
 for(const role of ['anon','authenticated','service_role']){await db.exec(`SET ROLE ${role}`);await denied(()=>db.exec('SELECT * FROM fiscal_nc_intenciones_homologacion'))}
 for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await denied(()=>f.readIntent());await denied(()=>f.startIntent())}
 await db.exec('RESET ROLE');await denied(()=>db.exec('DELETE FROM fiscal_nc_intenciones_homologacion'));await denied(()=>db.exec('UPDATE fiscal_nc_intenciones_homologacion SET actor_auth_id=NULL'));await db.exec('SET ROLE service_role')
})
it('041 instalación vacía no concede permiso; fila exacta sólo acredita verificación sin envío',async()=>{
 const f=await creditPermissionFixture(),before=await preparationEffects()
 await denied(()=>f.verify());await f.seed()
 const result=await f.verify()
 expect(result).toMatchObject({version:1,estado:'PERMISO_NC_VERIFICADO',solicitud_id:f.proposal.datos.solicitud_id,reserva_id:f.reservationId,
  solicitud_sha256:f.body.sha256,preparacion_sha256:f.prepared.sha256,revision_id:f.reviewId,permiso_id:f.permit,actor_auth_id:actor,emision_habilitada:false})
 expect(await f.verify()).toEqual(result);expect(await preparationEffects()).toEqual(before)
})
it.each(['habilitado','cuerpo','preparacion','credencial','certificado','revision','actor','futuro','vencido','revocado','emisor','catalogo'] as const)('041 permiso %s incompatible no se verifica',async(reason)=>{
 const f=await creditPermissionFixture(),patch:Record<string,unknown>={}
 if(reason==='habilitado')patch.habilitado=false
 if(reason==='cuerpo')patch.solicitud_sha256='f'.repeat(64)
 if(reason==='preparacion')patch.preparacion_sha256='f'.repeat(64)
 if(reason==='credencial')patch.credencial_id=crypto.randomUUID()
 if(reason==='certificado')patch.certificado_sha256='f'.repeat(64)
 if(reason==='revision')patch.emisor_revision=2
 if(reason==='actor')patch.actor_auth_id=crypto.randomUUID()
 if(reason==='futuro'){patch.creado_en=new Date(Date.now()+60000).toISOString();patch.vence_en=new Date(Date.now()+120000).toISOString()}
 if(reason==='vencido'){patch.creado_en=new Date(Date.now()-120000).toISOString();patch.vence_en=new Date(Date.now()-60000).toISOString()}
 await f.seed(patch)
 if(reason==='revocado')await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit])
 if(reason==='emisor')await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 if(reason==='catalogo')await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false')
 await denied(()=>f.verify())
})
it('041 revisión ajena/Auth reasignado y permisos directos nunca acreditan envío',async()=>{
 const f=await creditPermissionFixture();await f.seed();await denied(()=>f.verify(actor,crypto.randomUUID()))
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>f.verify());await denied(()=>f.verify(other))
 for(const role of ['anon','authenticated','service_role']){await db.exec(`SET ROLE ${role}`);await denied(()=>db.exec('SELECT * FROM fiscal_nc_permisos_homologacion'));await denied(()=>db.exec('SELECT * FROM fiscal_nc_permisos_revocados_homologacion'))}
 for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await denied(()=>f.verify())}
 await db.exec('RESET ROLE');await denied(()=>db.exec('DELETE FROM fiscal_nc_permisos_homologacion'));await denied(()=>db.exec('UPDATE fiscal_nc_permisos_homologacion SET habilitado=false'));await db.exec('SET ROLE service_role')
})
it('cliente HTTP numeración NC firma CMS con custodia sintética, reserva y recupera sin otro WSAA/WSFE',async()=>{
 const {syntheticEncryptedCustody}=await import('./fixtures/fiscalEncryptedCustody'),material=await syntheticEncryptedCustody()
 await admin('UPDATE fiscal_emisores_homologacion SET credencial_id=$1,certificado_sha256=$2',[material.binding.credencial_id,material.binding.certificado_sha256])
 const f=await creditTicketFixture();await installCreditRequestSource();const api=workerFixture(),keyId=crypto.randomUUID(),raw=crypto.getRandomValues(new Uint8Array(32)),reads:string[]=[]
 material.secrets.ARCA_HOMO_TA_ACTIVE_KEY_ID=keyId
 material.secrets['ARCA_HOMO_TA_KEY_'+keyId.replace(/-/g,'').toUpperCase()]=btoa(String.fromCharCode(...raw));raw.fill(0)
 api.flags.ARCA_HOMO_CREDIT_NUMBERING_ENABLED='true'
 const fetcher=vi.fn<typeof fetch>(async input=>{
  const request=input as Request
  expect(request.redirect).toBe('error')
  if(request.url==='https://wsaahomo.afip.gov.ar/ws/services/LoginCms'){
   const {ContentInfo,SignedData}=await import('pkijs'),cms=(await request.text()).match(/<in0>([^<]+)<\/in0>/)![1]
   const content=ContentInfo.fromBER(Uint8Array.from(atob(cms),c=>c.charCodeAt(0))),signed=new SignedData({schema:content.content})
   const tra=new TextDecoder().decode(signed.encapContentInfo.eContent!.getValue()),id=tra.match(/<uniqueId>(\d+)<\/uniqueId>/)![1],now=Date.now()
   const ticket=`<loginTicketResponse version="1.0"><header><source>CN=wsaa,O=AFIP,C=AR,SERIALNUMBER=CUIT 33693450239</source><destination>SERIALNUMBER=CUIT 20123456786,CN=Kiosko Synthetic</destination><uniqueId>${id}</uniqueId><generationTime>${new Date(now-30000).toISOString()}</generationTime><expirationTime>${new Date(now+3600000).toISOString()}</expirationTime></header><credentials><token>SYNTHETIC_INTEGRATED_NC_TA</token><sign>SYNTHETIC_INTEGRATED_NC_SIGN</sign></credentials></loginTicketResponse>`
   return new Response(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><w:loginCmsResponse xmlns:w="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${ticket.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')}</loginCmsReturn></w:loginCmsResponse></s:Body></s:Envelope>`,{headers:{'Content-Type':'text/xml'}})
  }
  expect(request.url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx');expect(request.headers.get('SOAPAction')).toContain('FECompUltimoAutorizado')
  return new Response('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult><PtoVta>7</PtoVta><CbteTipo>13</CbteTipo><CbteNro>22</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></s:Body></s:Envelope>',{headers:{'Content-Type':'text/xml'}})
 })
 const handler=createFiscalHttpHandler({readSecret:name=>{reads.push(name);return Object.hasOwn(api.flags,name)?api.flags[name]:material.secrets[name]},createAdmin:()=>api.admin,fetcher})
 const {validateFiscalCreditPreparationRecord,fiscalCreditPreparationWire}=await import('../../supabase/functions/_shared/fiscalCreditPreparation')
 const original=await validateFiscalRepresentation(await representation(),sale,op),prep=fiscalCreditPreparationWire(await validateFiscalCreditPreparationRecord(await f.readPreparation(),original,f.proposal))
 const local=new Map<string,string>();let requested:string|undefined
 const client=createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage:{getItem:key=>local.get(key)??null,setItem:(key,value)=>{local.set(key,value)}},send:async command=>{
  if(command.accion==='NUMERAR_NC'){requested=String(command.reserva_id);expect(client.credits.pendingNumber()?.reservationId).toBe(requested)}
  const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(command)}))
  if(!response.ok)throw new Error('SYNTHETIC_HTTP_DENIED')
  const data=await response.json()
  if(command.accion==='NUMERAR_NC')throw new Error('SYNTHETIC_NUMBER_ACK_LOST')
  return data
 }})
 const dto=await client.credits.number(original,f.proposal,prep)
 expect(dto.cuerpo.datos.solicitud.numero).toBe(23);expect(dto.cuerpo.datos.reserva_id).toBe(requested);expect(client.credits.pendingNumber()).toBeNull()
 expect(JSON.stringify(dto)).not.toContain('SYNTHETIC_INTEGRATED_NC_TA');expect(dto.emision_habilitada).toBe(false)
 expect(fetcher).toHaveBeenCalledTimes(2);const secretReads=reads.filter(name=>name.startsWith('ARCA_HOMO_TA_')||name.startsWith('ARCA_HOMO_CREDENTIAL_')).length
 api.flags.ARCA_HOMO_CREDIT_NUMBERING_ENABLED='false'
 expect(await client.credits.number(original,f.proposal,prep)).toEqual(dto)
 expect(fetcher).toHaveBeenCalledTimes(2);expect(reads.filter(name=>name.startsWith('ARCA_HOMO_TA_')||name.startsWith('ARCA_HOMO_CREDENTIAL_'))).toHaveLength(secretReads)
 expect(api.getUser).toHaveBeenCalledTimes(4)
})
it.each(['ausente','lectura','recuperada','prep-distinta','gate-cerrado','custodia-ausente'] as const)('HTTP numeración NC %s recupera antes de claves y no emite',async(mode)=>{
 const f=await creditTicketFixture();await installCreditRequestSource();const api=workerFixture(),secrets:string[]=[]
 const handler=createFiscalHttpHandler({readSecret:name=>{secrets.push(name);return api.deps.readSecret(name)},createAdmin:()=>api.admin,fetcher:api.fetcher})
 if(mode==='recuperada'||mode==='lectura'||mode==='prep-distinta')await f.reserve()
 if(mode==='custodia-ausente')api.flags.ARCA_HOMO_CREDIT_NUMBERING_ENABLED='true'
 const identity={venta_id:sale,operacion_origen_id:op,solicitud_id:f.proposal.datos.solicitud_id,propuesta_sha256:f.proposal.sha256}
 const send=(payload:unknown)=>handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(payload)}))
 const command=mode==='ausente'||mode==='lectura'?{accion:'CUERPO_NC',...identity}:{accion:'NUMERAR_NC',...identity,preparacion_sha256:mode==='prep-distinta'?'f'.repeat(64):f.prepared.sha256,reserva_id:f.reservationId}
 const response=await send(command)
 if(mode==='ausente'){expect(response.status).toBe(200);expect((await response.json()).resultado).toBeNull()}
 else if(mode==='recuperada'||mode==='lectura'){
  expect(response.status).toBe(200);const data=(await response.json()).resultado
  expect(data.aprobacion).toBeNull();expect(data.emision_habilitada).toBe(false);expect(Object.keys(data.cuerpo).sort()).toEqual(['canonico','sha256'])
  expect(JSON.parse(data.cuerpo.canonico).reserva_id).toBe(f.reservationId)
 }else expect(response.ok).toBe(false)
 expect(api.getUser).toHaveBeenCalledTimes(1);expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
 if(mode!=='custodia-ausente')expect(secrets.some(name=>name.startsWith('ARCA_HOMO_TA_')||name.startsWith('ARCA_HOMO_CREDENTIAL_'))).toBe(false)
 if(mode==='custodia-ausente')expect(await f.call('ESTADO')).toMatchObject({estado:'VACIO'})
 expect((await send({...command,extra:true})).status).toBe(400)
})
it.each(['gate-cerrado','confirmada-lectura-perdida'] as const)('cliente HTTP SQL reintento NC %s conserva UUID y vencimiento durable',async(mode)=>{
 const f=await creditOwnerReviewFixture(),api=workerFixture(),handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const {validateFiscalCreditPreparationRecord,fiscalCreditPreparationWire}=await import('../../supabase/functions/_shared/fiscalCreditPreparation')
 const prep=fiscalCreditPreparationWire(await validateFiscalCreditPreparationRecord(f.packet.preparacion,f.source,f.proposal))
 const local=new Map<string,string>(),commands:Record<string,unknown>[]=[],expirations:string[]=[];let posts=0
 api.flags.ARCA_HOMO_CREDIT_REVIEW_ENABLED=mode==='gate-cerrado'?'false':'true'
 const client=createFiscalClient({authId:actor,kioskId:kid,saleId:sale},{storage:{getItem:key=>local.get(key)??null,setItem:(key,value)=>{local.set(key,value)}},send:async command=>{
  commands.push(command)
  if(mode==='confirmada-lectura-perdida'&&command.accion==='REVISION_NC'&&command.revision_id!==null&&posts===1)throw new Error('SYNTHETIC_GET_LOST')
  const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(command)}))
  const data=await response.json()
  if(command.accion==='APROBAR_REVISION_NC'){
   posts++
   if(response.ok)expirations.push(data.resultado.aprobacion.vence_en)
   if(mode==='confirmada-lectura-perdida'&&posts===1)throw new Error('SYNTHETIC_ACK_LOST')
  }
  if(!response.ok)throw new Error('SYNTHETIC_HTTP_DENIED')
  return data
 }})
 const review=await client.credits.review(f.source,f.proposal,prep)
 await expect(client.credits.approveReview(f.source,f.proposal,prep,review)).rejects.toThrow()
 const pending=client.credits.pendingReview();expect(pending).not.toBeNull()
 api.flags.ARCA_HOMO_CREDIT_REVIEW_ENABLED='true'
 const result=await client.credits.retryReview(f.source,f.proposal,prep,review)
 expect(result.aprobacion?.id).toBe(pending?.reviewId);expect(client.credits.pendingReview()).toBeNull()
 const writes=commands.filter(cmd=>cmd.accion==='APROBAR_REVISION_NC');expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1])
 if(mode==='confirmada-lectura-perdida'){expect(expirations).toHaveLength(2);expect(expirations[0]).toBe(expirations[1])}
 expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
})
it('HTTP revisión NC devuelve DTO cerrado, gate de escritura y recuperación con gate cerrado',async()=>{
 const f=await creditOwnerReviewFixture(),api=workerFixture(),handler=createFiscalHttpHandler({readSecret:api.deps.readSecret,createAdmin:()=>api.admin,fetcher:api.fetcher})
 const identity={venta_id:sale,operacion_origen_id:op,solicitud_id:f.proposal.datos.solicitud_id,propuesta_sha256:f.proposal.sha256,revision_id:f.reviewId}
 const send=(payload:unknown)=>handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(payload)}))
 const write={accion:'APROBAR_REVISION_NC',...identity,cuerpo_sha256:f.body.sha256,preparacion_sha256:f.prepared.sha256}
 expect((await send(write)).status).toBe(503);expect(api.getUser).not.toHaveBeenCalled()
 api.flags.ARCA_HOMO_CREDIT_REVIEW_ENABLED='true'
 const saved=await send(write);expect(saved.status).toBe(200)
 const dto=(await saved.json()).resultado
 expect(Object.keys(dto).sort()).toEqual(['aprobacion','cuerpo','emision_habilitada','version'])
 expect(Object.keys(dto.cuerpo).sort()).toEqual(['canonico','sha256']);expect(dto.aprobacion.id).toBe(f.reviewId);expect(dto.emision_habilitada).toBe(false)
 expect(JSON.stringify(dto)).not.toContain('certificado_sha256');expect(JSON.stringify(dto)).not.toContain('credencial_id')
 api.flags.ARCA_HOMO_CREDIT_REVIEW_ENABLED='false'
 const recovered=await send({accion:'REVISION_NC',...identity});expect(recovered.status).toBe(200);expect((await recovered.json()).resultado).toEqual(dto)
 for(const bad of [{...write,extra:true},{...write,revision_id:null},{...write,cuerpo_sha256:'bad'},{accion:'REVISION_NC',...identity,extra:true}])expect((await send(bad)).status).toBe(400)
 expect(api.getUser).toHaveBeenCalledTimes(2);expect(api.fetcher).not.toHaveBeenCalled();expect(api.load).not.toHaveBeenCalled()
})
it.each(['normal','ack-perdido','hash-distinto','respuesta-ajena','sin-auth','auth-reasignado'] as const)('servicio revisión NC %s conserva Auth original y confirma sólo por GET',async(mode)=>{
 const f=await creditOwnerReviewFixture(),api=workerFixture(),base=api.rpc.getMockImplementation()!,other=crypto.randomUUID()
 const {approveFiscalCreditOwnerReview,loadFiscalCreditOwnerReview}=await import('../../supabase/functions/_shared/fiscalCreditOwnerReviewService')
 const scope={saleId:sale,operationId:op,requestId:f.proposal.datos.solicitud_id,sha256:f.proposal.sha256},before=await preparationEffects()
 if(mode==='sin-auth')api.getUser.mockResolvedValue({data:{user:null},error:new Error('SYNTHETIC_AUTH_DENIED')})
 if(mode==='auth-reasignado')await admin('INSERT INTO auth.users VALUES($1)',[other])
 api.rpc.mockImplementation(async(name,args)=>{
  const result=await base(name,args)
  if(mode==='ack-perdido'&&name==='aprobar_revision_nc_homologacion'&&!result.error)throw new Error('SYNTHETIC_LOST_ACK')
  if(mode==='auth-reasignado'&&name==='cargar_representacion_fiscal_homologacion')await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
  if(mode==='respuesta-ajena'&&name==='cargar_revision_nc_homologacion'&&args.p_revision_id!==null&&result.data){
   const packet=result.data as Record<string,unknown>;return{data:{...packet,aprobacion:{...(packet.aprobacion as Record<string,unknown>),id:other}},error:null}
  }
  return result
 })
 const run=()=>approveFiscalCreditOwnerReview(api.admin,'SYNTHETIC_JWT',scope,f.reviewId,mode==='hash-distinto'?'f'.repeat(64):f.body.sha256,f.prepared.sha256)
 if(mode==='normal'||mode==='ack-perdido'){
  const result=await run();expect(result.aprobacion?.id).toBe(f.reviewId);expect(result.emision_habilitada).toBe(false)
  expect(api.getUser).toHaveBeenCalledTimes(1)
  expect(await loadFiscalCreditOwnerReview(api.admin,'SYNTHETIC_JWT',scope,f.reviewId)).toEqual(result)
  expect(api.getUser).toHaveBeenCalledTimes(2)
 }else{await expect(run()).rejects.toThrow('FISCAL_REVISION_NC_NO_CONFIRMADA');expect(api.getUser).toHaveBeenCalledTimes(1)}
 expect(api.rpc.mock.calls.filter(([name])=>name==='aprobar_revision_nc_homologacion')).toHaveLength(mode==='normal'||mode==='ack-perdido'||mode==='respuesta-ajena'?1:0)
 if(mode==='sin-auth')expect(api.rpc).not.toHaveBeenCalled()
 else expect(api.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor)).toBe(true)
 expect(await preparationEffects()).toEqual(before)
})
it('040 revisión NC liga cuerpo/preparación/reserva con ACK recuperable, sin efectos comerciales',async()=>{
 const f=await creditOwnerReviewFixture(),before=await preparationEffects()
 expect(await f.readReview()).toEqual({version:1,cuerpo:f.packet,aprobacion:null,emision_habilitada:false})
 const approved=await f.approve()
 expect(approved).toMatchObject({version:1,emision_habilitada:false,aprobacion:{id:f.reviewId,solicitud_id:f.proposal.datos.solicitud_id,reserva_id:f.reservationId,solicitud_sha256:f.body.sha256,preparacion_sha256:f.prepared.sha256,aprobada:true,emision_habilitada:false}})
 expect(await f.approve()).toEqual(approved);expect(await f.readReview(f.reviewId)).toEqual(approved)
 const {validateFiscalCreditOwnerReview}=await import('../../supabase/functions/_shared/fiscalCreditOwnerReview')
 const review=await validateFiscalCreditOwnerReview(approved,f.source,f.proposal)
 expect(review.cuerpo.sha256).toBe(f.body.sha256);expect(Object.isFrozen(review.aprobacion)).toBe(true)
 const approval=approved.aprobacion as Record<string,unknown>
 for(const patch of [{solicitud_id:crypto.randomUUID()},{reserva_id:crypto.randomUUID()},{solicitud_sha256:'a'.repeat(64)},{preparacion_sha256:'b'.repeat(64)},{aprobada:false},{emision_habilitada:true},{vence_en:'invalid'},{extra:true}]){
  await expect(validateFiscalCreditOwnerReview({...approved,aprobacion:{...approval,...patch}},f.source,f.proposal)).rejects.toThrow('FISCAL_REVISION_NC_NO_CONFIRMADA')
 }
 await db.exec('RESET ROLE');const row=(await db.query<{duration:number}>('SELECT extract(epoch from vence_en-creada_en)::integer duration FROM fiscal_nc_revisiones_homologacion WHERE id=$1',[f.reviewId])).rows[0];await db.exec('SET ROLE service_role')
 expect(row.duration).toBe(600);expect(await preparationEffects()).toEqual(before)
})
it.each(['cuerpo','preparacion','uuid-ajeno','emisor','parametros','auth'] as const)('040 rechazo %s no concede aprobación nueva ni modifica cuerpo',async(reason)=>{
 const f=await creditOwnerReviewFixture(),before=await preparationEffects()
 if(reason==='emisor')await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 if(reason==='parametros')await admin('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false')
 if(reason==='auth'){const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])}
 if(reason==='uuid-ajeno')await denied(()=>f.readReview(crypto.randomUUID()))
 else await denied(()=>f.approve(f.reviewId,reason==='cuerpo'?'f'.repeat(64):f.body.sha256,reason==='preparacion'?'f'.repeat(64):f.prepared.sha256))
 await db.exec('RESET ROLE');expect((await db.query<{count:number}>('SELECT count(*)::integer count FROM fiscal_nc_revisiones_homologacion')).rows[0].count).toBe(0);await db.exec('SET ROLE service_role')
 expect(await preparationEffects()).toEqual(before)
})
it('040 replay histórico conserva vencimiento tras revocar emisor y no permite aprobación nueva',async()=>{
 const f=await creditOwnerReviewFixture(),ack=await f.approve();await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 expect(await f.approve()).toEqual(ack);expect(await f.readReview(f.reviewId)).toEqual(ack)
 await denied(()=>f.approve(crypto.randomUUID()))
})
it('040 revisión privada inmutable y funciones no accesibles por navegador',async()=>{
 const f=await creditOwnerReviewFixture();await f.approve()
 for(const role of ['anon','authenticated','service_role']){await db.exec(`SET ROLE ${role}`);await denied(()=>db.exec('SELECT * FROM fiscal_nc_revisiones_homologacion'))}
 for(const role of ['anon','authenticated']){await db.exec(`SET ROLE ${role}`);await denied(()=>f.readReview(f.reviewId));await denied(()=>f.approve())}
 await db.exec('RESET ROLE');await denied(()=>db.exec('DELETE FROM fiscal_nc_revisiones_homologacion'));await denied(()=>db.exec("UPDATE fiscal_nc_revisiones_homologacion SET solicitud_sha256=repeat('f',64)"));await db.exec('SET ROLE service_role')
})
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

it.each([true,false])('047 HTTP consulta recupera diario antes de custodia, guardado=%s',async(stored)=>{
 const f=await creditConsultJournalFixture(),api=workerFixture(),before=await preparationEffects(),reads:string[]=[]
 if(stored)await f.write()
 api.flags.ARCA_HOMO_CREDIT_CONSULT_ENABLED='false'
 await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 const handler=createFiscalHttpHandler({readSecret:name=>{reads.push(name);return api.flags[name]},createAdmin:()=>api.admin,fetcher:api.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'CONCILIAR_NC',venta_id:sale,operacion_origen_id:op,solicitud_id:f.proposal.datos.solicitud_id,propuesta_sha256:f.proposal.sha256,consulta_id:crypto.randomUUID()})}))
 expect(response.status).toBe(stored?200:409)
 if(stored)expect(await response.json()).toMatchObject({emision_habilitada:false,resultado:{consulta_id:f.id,estado:'CAE_NC_REGISTRADO_NO_APLICADO',reintegro_habilitado:false,reposicion_habilitada:false}})
 expect(api.getUser).toHaveBeenCalledExactlyOnceWith('SYNTHETIC_JWT');expect(api.fetcher).not.toHaveBeenCalled();expect(reads.some(name=>/CUSTODY|CREDENTIAL|TA_KEY|KEYRING/.test(name))).toBe(false)
 expect(await preparationEffects()).toEqual(before)
})

async function creditConflictFixture(){
 const f=await creditConsultJournalFixture();await db.exec('RESET ROLE')
 const sql=readFileSync('supabase/pilot-fiscal/048_fiscal_credit_conflicts.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
 const gate=async(who=actor)=>db.query('SELECT exigir_nc_sin_conflictos_homologacion($1,$2,$3,$4,$5)',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])
 const conflict={...f.received,resultado:{...f.received.resultado,cae:'22222222222222'}}
 return{...f,gate,conflict}
}
it('048 CAE contradictorio conserva ambas observaciones y bloquea gate sin reemplazar original',async()=>{
 const f=await creditConflictFixture(),before=await preparationEffects();await f.gate();const first=await f.write(),id=crypto.randomUUID(),receipt=await f.write(f.conflict,id)
 expect(receipt).toMatchObject({estado:'CONFLICTO_NC_NO_APLICAR',consulta_id:id,emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
 expect(await f.read()).toEqual(first);expect(await f.readAuthorization()).toEqual(receipt);expect(await f.write(f.conflict,id)).toEqual(receipt);await denied(()=>f.gate())
 await f.write(f.received,crypto.randomUUID());expect(await f.readAuthorization()).toEqual(receipt);await denied(()=>f.gate())
 await db.exec('RESET ROLE');expect((await db.query<{cae:string}>('SELECT cae FROM fiscal_nc_autorizaciones_homologacion')).rows[0].cae).toBe('11111111111111');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_conflictos_homologacion')).rows[0].n).toBe(1);await db.exec('SET ROLE service_role')
 expect(await preparationEffects()).toEqual(before)
})
it.each([true,false])('048 DATOS_DISTINTOS bloquea aun sin CAE previo=%s',async(without)=>{
 const f=await creditConflictFixture();if(!without)await f.write()
 const data={...f.received,resultado:{estado:'CONCILIAR',codigo:'DATOS_DISTINTOS',puedeReenviar:false}}
 const receipt=await f.write(data,crypto.randomUUID());expect(receipt.estado).toBe('CONFLICTO_NC_NO_APLICAR');expect(await f.readAuthorization()).toEqual(receipt);await denied(()=>f.gate())
})
it('048 rollback no conserva conflicto fantasma y UUID con otros datos sigue rechazado',async()=>{
 const f=await creditConflictFixture();await f.write();await db.exec('SAVEPOINT conflict_rollback');const id=crypto.randomUUID();await f.write(f.conflict,id);await db.exec('ROLLBACK TO SAVEPOINT conflict_rollback; RELEASE SAVEPOINT conflict_rollback')
 expect(await f.read(id)).toBeNull();expect((await f.readAuthorization())?.estado).toBe('CAE_NC_REGISTRADO_NO_APLICADO');await f.gate();await denied(()=>f.write(f.conflict));expect((await f.readAuthorization())?.estado).toBe('CAE_NC_REGISTRADO_NO_APLICADO')
})
it('048 conflicto recuperado por HTTP con custodia/flag cerrados no accede claves ni red',async()=>{
 const f=await creditConflictFixture();await f.write();const receipt=await f.write(f.conflict,crypto.randomUUID()),api=workerFixture(),reads:string[]=[],before=await preparationEffects()
 api.flags.ARCA_HOMO_CREDIT_CONSULT_ENABLED='false';await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 const handler=createFiscalHttpHandler({readSecret:name=>{reads.push(name);return api.flags[name]},createAdmin:()=>api.admin,fetcher:api.fetcher})
 const response=await handler(new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion',{method:'POST',headers:{origin:'https://kiosco-app-staging.vercel.app',authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify({accion:'CONCILIAR_NC',venta_id:sale,operacion_origen_id:op,solicitud_id:f.proposal.datos.solicitud_id,propuesta_sha256:f.proposal.sha256,consulta_id:crypto.randomUUID()})}))
 expect(response.status).toBe(200);expect(await response.json()).toMatchObject({resultado:receipt});expect(api.getUser).toHaveBeenCalledTimes(1);expect(api.fetcher).not.toHaveBeenCalled();expect(reads.some(name=>/CUSTODY|CREDENTIAL|TA_KEY|KEYRING/.test(name))).toBe(false);expect(await preparationEffects()).toEqual(before)
})
it.each(['anon','authenticated','service_role'])('048 incidencia privada sin acceso directo para %s',async(role)=>{
 const f=await creditConflictFixture();await f.write();await f.write(f.conflict,crypto.randomUUID());await db.exec('RESET ROLE; SET ROLE '+role)
 await denied(()=>db.query('SELECT codigo FROM fiscal_nc_conflictos_homologacion'))
 await denied(()=>db.query("DELETE FROM fiscal_nc_conflictos_homologacion"))
 if(role!=='service_role')await denied(()=>f.gate())
})
it('048 historia de conflicto inmutable y otro Auth no recupera ni abre gate',async()=>{
 const f=await creditConflictFixture();await f.write();await f.write(f.conflict,crypto.randomUUID());await denied(()=>f.readAuthorization(crypto.randomUUID()));await denied(()=>f.gate(crypto.randomUUID()))
 await db.exec('RESET ROLE');await denied(()=>db.query("UPDATE fiscal_nc_conflictos_homologacion SET codigo='DATOS_DISTINTOS'"));await denied(()=>db.query('DELETE FROM fiscal_nc_conflictos_homologacion'))
})

it.each(['normal','ack-perdido','replay','revocado'])('NC transporte042 %s consume antes de fetch y no toca negocio',async mode=>{
 const f=await creditSendSourceFixture();await f.seed();const packet=await f.load(),valid=await validateFiscalCreditSendSource(packet,f.source,f.proposal,actor),b=valid.binding,before=await preparationEffects()
 const ticket={entorno:'HOMOLOGACION' as const,servicio:'wsfe' as const,cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_SEND_TOKEN',sign:'SYNTHETIC_SEND_SIGN',expiresAt:Date.now()+120000}
 if(mode==='replay')await f.startIntent()
 if(mode==='revocado')await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit])
 const events:string[]=[],consumeIntent=vi.fn(async()=>{events.push('042');await db.exec('SAVEPOINT send_authority');let value:unknown
 try{value=await f.startIntent();await db.exec('RELEASE SAVEPOINT send_authority')}catch(error){await db.exec('ROLLBACK TO SAVEPOINT send_authority; RELEASE SAVEPOINT send_authority');throw error}
 if(mode==='ack-perdido')throw new Error('SYNTHETIC_ACK_LOST');return value}),fetcher=vi.fn<typeof fetch>(async()=>{events.push('fetch');expect(await f.readIntent()).toMatchObject({nuevo_envio:false,intento_id:f.attempt});return new Response(syntheticFiscalCreditEmissionReceipt(valid.cuerpo.datos.solicitud),{headers:{'content-type':'text/xml'}})})
 const run=()=>sendFiscalCreditEmission({packet,source:f.source,draft:f.proposal,actorAuthId:actor},ticket,{signal:new AbortController().signal,consumeIntent,fetcher})
 if(mode==='normal'){expect(await run()).toMatchObject({estado:'APROBACION_RECIBIDA',puedeReenviar:false});expect(events).toEqual(['042','fetch']);await expect(run()).rejects.toThrow();expect(fetcher).toHaveBeenCalledTimes(1)}
 else{await expect(run()).rejects.toThrow('FISCAL_ENVIO_NC_NO_CONFIRMADO');expect(fetcher).not.toHaveBeenCalled()}
 expect(await preparationEffects()).toEqual(before)
 if(mode==='revocado')expect(await f.readIntent()).toBeNull();else expect(await f.readIntent()).toMatchObject({nuevo_envio:false,intento_id:f.attempt})
})

it.each(['normal','send-response-lost','intent-ack-lost','existing-uncertain','history','gateclosed','guard-revoked','second-auth','query-lost','journal-ack-lost','body-changed','sendflag-closes','durable-get-lost','candidate-ack-lost','candidate-get-lost','candidate-corrupt'] as const)('NC worker integrado %s nunca reenvía intención previa',async mode=>{
 const f=await creditSendSourceFixture();await f.seed();await db.exec('RESET ROLE')
 for(const file of ['039_fiscal_credit_ticket_coordination.sql','044_fiscal_credit_send_ticket_coordination.sql','045_fiscal_credit_consult_source.sql','046_fiscal_credit_consult_ticket_coordination.sql','047_fiscal_credit_consultation_journal.sql','048_fiscal_credit_conflicts.sql','049_fiscal_credit_send_responses.sql']){const sql=readFileSync('supabase/pilot-fiscal/'+file,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql)}await db.exec('SET ROLE service_role')
 const packet=await f.load(),valid=await validateFiscalCreditSendSource(packet,f.source,f.proposal,actor),b=valid.binding,api=workerFixture(),before=await preparationEffects(),query=crypto.randomUUID()
 api.flags.ARCA_HOMO_CREDIT_SEND_ENABLED=mode==='gateclosed'||mode==='history'||mode==='existing-uncertain'?'false':'true';api.flags.ARCA_HOMO_CREDIT_CONSULT_ENABLED=mode==='history'?'false':'true'
 if(mode==='existing-uncertain'||mode==='history')await f.startIntent()
 if(mode==='history'){
  const fecha=valid.cuerpo.datos.solicitud.fecha,data={intento_id:f.attempt,solicitud_sha256:f.body.sha256,consultado_en:new Date().toISOString(),resultado:{estado:'AUTORIZACION_NC_COINCIDENTE',cae:'11111111111111',vencimiento:fecha,procesadoEn:fecha,solicitudSha256:f.body.sha256,puedeReenviar:false},emision_habilitada:false}
  await db.query('SELECT registrar_consulta_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,crypto.randomUUID(),JSON.stringify(data)]);await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false')
 }
 if(mode==='second-auth')api.getUser.mockResolvedValueOnce({data:{user:{id:actor}},error:null}).mockResolvedValue({data:{user:{id:crypto.randomUUID()}},error:null})
 const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),keyId=crypto.randomUUID(),keys={active:vi.fn(async()=>({id:keyId,key})),read:vi.fn(async()=>key)}
 const ticket={entorno:'HOMOLOGACION' as const,servicio:'wsfe' as const,cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_WORKER_TOKEN',sign:'SYNTHETIC_WORKER_SIGN',expiresAt:Date.now()+3600000}
 const sendWsaa=vi.fn(async(_b:Readonly<typeof b>,_signal:AbortSignal,beforeSend:()=>Promise<void>)=>{await beforeSend();return ticket}),consultWsaa=vi.fn(async(_b:Readonly<import('../../supabase/functions/_shared/fiscalCreditConsultSource').FiscalCreditConsultBinding>,_signal:AbortSignal,beforeSend:()=>Promise<void>)=>{await beforeSend();return ticket})
 const actions:string[]=[];let sent=false
 const fetcher=vi.fn<typeof fetch>(async req=>{const action=new Request(req).headers.get('SOAPAction')??'';actions.push(action)
  if(action.includes('FECompUltimoAutorizado')){if(mode==='guard-revoked')await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit]);return new Response(wsfeSoap('FECompUltimoAutorizado',`<PtoVta>${b.punto_venta}</PtoVta><CbteTipo>${b.tipo_comprobante}</CbteTipo><CbteNro>22</CbteNro>`),{headers:{'content-type':'text/xml'}})}
  if(action.includes('FECAESolicitar')){sent=true;expect(await f.readIntent()).toMatchObject({intento_id:f.attempt,nuevo_envio:false});if(mode==='send-response-lost')throw new Error('SYNTHETIC_RESPONSE_LOST');return new Response(syntheticFiscalCreditEmissionReceipt(valid.cuerpo.datos.solicitud),{headers:{'content-type':'text/xml'}})}
  expect(action).toContain('FECompConsultar');if(mode==='query-lost')throw new Error('SYNTHETIC_QUERY_LOST')
  const xml=sent||mode==='existing-uncertain'?syntheticFiscalCreditVoucherXml(valid.cuerpo.datos.solicitud).xml:wsfeSoap('FECompConsultar','<Errors><Err><Code>602</Code><Msg>Synthetic no encontrado</Msg></Err></Errors>')
  return new Response(xml,{headers:{'content-type':'text/xml'}})
 })
 let loseCandidateRead=mode==='candidate-get-lost',loseDurableRead=mode==='durable-get-lost',storedObservation=false
 const base=api.rpc.getMockImplementation()!
 api.rpc.mockImplementation(async(name,args)=>{if(storedObservation&&loseDurableRead&&['cargar_autorizacion_nc_homologacion','cargar_consulta_nc_homologacion'].includes(name))return{data:null,error:new Error('SYNTHETIC_DURABLE_GET_LOST')}
 const response=await base(name,args)
  if(name==='registrar_respuesta_envio_nc_homologacion'&&!response.error&&mode==='candidate-ack-lost')throw new Error('SYNTHETIC_CANDIDATE_ACK_LOST')
  if(name==='cargar_respuesta_envio_nc_homologacion'&&loseCandidateRead)return{data:null,error:new Error('SYNTHETIC_CANDIDATE_GET_LOST')}
  if(name==='cargar_respuesta_envio_nc_homologacion'&&mode==='candidate-corrupt'&&response.data&&typeof response.data==='object'&&!Array.isArray(response.data))return{data:{...response.data,solicitud_sha256:'f'.repeat(64)},error:null}
  if(name==='registrar_intencion_nc_homologacion'&&!response.error){if(mode==='intent-ack-lost')throw new Error('SYNTHETIC_ACK_LOST');if(mode==='sendflag-closes')api.flags.ARCA_HOMO_CREDIT_SEND_ENABLED='false'}
  if(name==='registrar_consulta_nc_homologacion'&&!response.error)storedObservation=true
  if(name==='registrar_consulta_nc_homologacion'&&!response.error&&mode==='journal-ack-lost')throw new Error('SYNTHETIC_JOURNAL_ACK_LOST')
  if(name==='cargar_fuente_envio_nc_homologacion'&&mode==='body-changed'&&response.data&&typeof response.data==='object'&&!Array.isArray(response.data))return{data:{...response.data,cuerpo:{}},error:null}
  return response
 })
 const run=()=>emitFiscalCreditOperation({admin:api.admin,readSecret:name=>api.flags[name],keys,fetcher,createSendWsaa:()=>sendWsaa,createConsultWsaa:()=>consultWsaa},'SYNTHETIC_JWT',{saleId:sale,operationId:op,requestId:f.proposal.datos.solicitud_id,sha256:f.proposal.sha256},f.reviewId,f.permit,mode==='existing-uncertain'?crypto.randomUUID():f.attempt,query)
 if(['gateclosed','guard-revoked','body-changed'].includes(mode)){await expect(run()).rejects.toThrow('FISCAL_OPERACION_NC_NO_CONFIRMADA');expect(await f.readIntent()).toBeNull()}
 else if(mode==='candidate-get-lost'||mode==='candidate-corrupt'){await expect(run()).rejects.toThrow('FISCAL_OPERACION_NC_NO_CONFIRMADA');expect(await f.readIntent()).not.toBeNull();expect(actions.filter(a=>a.includes('FECAESolicitar'))).toHaveLength(1);expect(actions.filter(a=>a.includes('FECompConsultar'))).toHaveLength(0);if(mode==='candidate-get-lost'){loseCandidateRead=false;api.flags.ARCA_HOMO_CREDIT_SEND_ENABLED='false';expect((await run()).estado).toBe('CAE_NC_REGISTRADO_NO_APLICADO');expect(actions.filter(a=>a.includes('FECAESolicitar'))).toHaveLength(1)}}
 else{const result=await run();expect(result.estado).toBe(['query-lost','second-auth','durable-get-lost'].includes(mode)?'ENVIO_INCIERTO':['intent-ack-lost','sendflag-closes'].includes(mode)?'CONSULTA_NC_REGISTRADA':'CAE_NC_REGISTRADO_NO_APLICADO');expect(result).toMatchObject({emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false})
  if(mode==='normal'){expect((await run()).estado).toBe('CAE_NC_REGISTRADO_NO_APLICADO');expect(actions.filter(a=>a.includes('FECAESolicitar'))).toHaveLength(1)}
  if(mode==='durable-get-lost'){loseDurableRead=false;api.flags.ARCA_HOMO_CREDIT_SEND_ENABLED='false';api.flags.ARCA_HOMO_CREDIT_CONSULT_ENABLED='false';await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');const count=fetcher.mock.calls.length;expect((await run()).estado).toBe('CAE_NC_REGISTRADO_NO_APLICADO');expect(fetcher).toHaveBeenCalledTimes(count);expect(actions.filter(a=>a.includes('FECAESolicitar'))).toHaveLength(1)}
 }
 if(['history','existing-uncertain','gateclosed','body-changed'].includes(mode))expect(sendWsaa).not.toHaveBeenCalled()
 if(mode==='history'){expect(keys.active).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()}
 if(['intent-ack-lost','sendflag-closes','guard-revoked','gateclosed','body-changed','history','existing-uncertain'].includes(mode))expect(actions.filter(a=>a.includes('FECAESolicitar'))).toHaveLength(0)
 expect(api.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor||args.p_actor===actor)).toBe(true);expect(await preparationEffects()).toEqual(before)
})

async function creditSendResponseFixture(){
 const f=await creditConflictFixture();await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/049_fiscal_credit_send_responses.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
 const response={intento_id:f.attempt,solicitud_sha256:f.body.sha256,recibido_en:new Date().toISOString(),resultado:{estado:'APROBACION_RECIBIDA',codigos:[100,101],puedeReenviar:false},emision_habilitada:false}
 const recordResponse=async(data:unknown=response)=>(await db.query<{data:Record<string,unknown>}>('SELECT registrar_respuesta_envio_nc_homologacion($1,$2,$3,$4,$5,$6::jsonb) data',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,JSON.stringify(data)])).rows[0].data
 const loadResponse=async(who=actor)=>(await db.query<{data:Record<string,unknown>|null}>('SELECT cargar_respuesta_envio_nc_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])).rows[0].data
 return{...f,response,recordResponse,loadResponse}
}
it.each(['APROBACION_RECIBIDA','RECHAZO_RECIBIDO','SIN_CONFIRMACION'])('049 candidato%s no acredita CAE ni efectos y replay conserva respuesta',async estado=>{
 const f=await creditSendResponseFixture(),before=await preparationEffects();expect(await f.loadResponse()).toBeNull();const data={...f.response,resultado:{...f.response.resultado,estado}},receipt=await f.recordResponse(data)
 expect(receipt).toMatchObject({estado:'RESPUESTA_NC_REGISTRADA_NO_CONFIRMADA',observacion:data,emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false});expect(await f.loadResponse()).toEqual(receipt);expect(await f.recordResponse(data)).toEqual(receipt)
 await denied(()=>f.recordResponse({...data,resultado:{...data.resultado,codigos:[999]}}));expect(await f.loadResponse()).toEqual(receipt);expect(await f.readAuthorization()).toBeNull();expect(await preparationEffects()).toEqual(before)
})
it('049 recuperación/replay independiente de custodia/permiso y rollback sin respuesta fantasma',async()=>{
 const f=await creditSendResponseFixture();await db.exec('SAVEPOINT send_response_rollback');await f.recordResponse();await db.exec('ROLLBACK TO SAVEPOINT send_response_rollback; RELEASE SAVEPOINT send_response_rollback');expect(await f.loadResponse()).toBeNull()
 const receipt=await f.recordResponse();await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit]);expect(await f.loadResponse()).toEqual(receipt);expect(await f.recordResponse()).toEqual(receipt)
})
it.each(['intento','hash','infinito','old','futuro','extra','codes-string','codes-zero','codes-fraction','codes-many','cae','reenviar','flags'])('049 rechaza dato%s sin insertar evidencia falsa',async reason=>{
 const f=await creditSendResponseFixture(),data:Record<string,unknown>=structuredClone(f.response),result:Record<string,unknown>={...f.response.resultado};data.resultado=result
 if(reason==='intento')data.intento_id=crypto.randomUUID();if(reason==='hash')data.solicitud_sha256='f'.repeat(64);if(reason==='infinito')data.recibido_en='infinity';if(reason==='old')data.recibido_en='2000-01-01T00:00:00Z';if(reason==='futuro')data.recibido_en='2999-01-01T00:00:00Z';if(reason==='extra')data.xml='SYNTHETIC_PRIVATE';if(reason==='codes-string')result.codigos=['100'];if(reason==='codes-zero')result.codigos=[0];if(reason==='codes-fraction')result.codigos=[1.1];if(reason==='codes-many')result.codigos=Array.from({length:201},()=>1);if(reason==='cae')result.cae='11111111111111';if(reason==='reenviar')result.puedeReenviar=true;if(reason==='flags')data.emision_habilitada=true
 await denied(()=>f.recordResponse(data));expect(await f.loadResponse()).toBeNull();expect(await f.readAuthorization()).toBeNull()
})
it.each(['anon','authenticated','service_role'])('049 tabla/columnas privadas para%s',async role=>{
 const f=await creditSendResponseFixture();await f.recordResponse();await db.exec('RESET ROLE; SET ROLE '+role);await denied(()=>db.query('SELECT datos FROM fiscal_nc_respuestas_envio_homologacion'));await denied(()=>db.query('DELETE FROM fiscal_nc_respuestas_envio_homologacion'))
 if(role!=='service_role'){await denied(()=>f.loadResponse());await denied(()=>f.recordResponse())}
})
it('049 respuesta inmutable y otro actor no accede',async()=>{
 const f=await creditSendResponseFixture();await f.recordResponse();await denied(()=>f.loadResponse(crypto.randomUUID()));await db.exec('RESET ROLE');await denied(()=>db.query("UPDATE fiscal_nc_respuestas_envio_homologacion SET datos='{}'"));await denied(()=>db.query('DELETE FROM fiscal_nc_respuestas_envio_homologacion'))
})

it('049 ausencia de intención no permite registrar ni confunde null con envío ausente',async()=>{
 const f=await creditSendSourceFixture();await f.seed();await db.exec('RESET ROLE');await db.exec(readFileSync('supabase/pilot-fiscal/049_fiscal_credit_send_responses.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''));await db.exec('SET ROLE service_role');const before=await preparationEffects(),args=[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256]
 await denied(()=>db.query('SELECT cargar_respuesta_envio_nc_homologacion($1,$2,$3,$4,$5)',args));await denied(()=>db.query("SELECT registrar_respuesta_envio_nc_homologacion($1,$2,$3,$4,$5,'{}'::jsonb)",args));expect(await f.readIntent()).toBeNull();expect(await preparationEffects()).toEqual(before)
})

async function creditAuthorizedResolutionFixture(){
 const f=await creditSendResponseFixture();await db.exec('RESET ROLE');const sql=readFileSync('supabase/pilot-fiscal/050_fiscal_credit_authorized_resolution.sql','utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
 const loadResolution=async(who=actor)=>(await db.query<{data:Record<string,unknown>|null}>('SELECT cargar_resolucion_nc_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])).rows[0].data
 const resolve=async(who=actor)=>(await db.query<{data:Record<string,unknown>}>('SELECT registrar_resolucion_nc_autorizada_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])).rows[0].data
 return{...f,loadResolution,resolve}
}
it('050 resolución exige CAE047, no candidato049, y no aplica negocio',async()=>{
 const f=await creditAuthorizedResolutionFixture(),before=await preparationEffects();expect(await f.loadResolution()).toBeNull();await denied(()=>f.resolve());await f.recordResponse();await denied(()=>f.resolve())
 await f.write();const result=await f.resolve();expect(result).toMatchObject({estado:'RESOLUCION_NC_REGISTRADA_NO_APLICADA',solicitud_id:f.proposal.datos.solicitud_id,cae:'11111111111111',numero:23,emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false});expect(await f.loadResolution()).toEqual(result);expect(await f.resolve()).toEqual(result);expect(await preparationEffects()).toEqual(before)
})
it.each(['RECHAZO_RECIBIDO','SIN_CONFIRMACION'])('050 respuesta%s y consulta602 no resuelven numeración',async estado=>{
 const f=await creditAuthorizedResolutionFixture();await f.recordResponse({...f.response,resultado:{...f.response.resultado,estado}});await f.write({...f.received,resultado:{estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false}});await denied(()=>f.resolve());expect(await f.loadResolution()).toBeNull()
})
it('050 conflicto bloquea resolución; conflicto posterior conserva marcador pero bloquea permiso/gate',async()=>{
 const f=await creditAuthorizedResolutionFixture();await f.write();await db.exec('SAVEPOINT resolution_conflict');await f.write(f.conflict,crypto.randomUUID());await denied(()=>f.resolve());expect(await f.loadResolution()).toBeNull();await db.exec('ROLLBACK TO SAVEPOINT resolution_conflict; RELEASE SAVEPOINT resolution_conflict')
 const marker=await f.resolve();await f.write(f.conflict,crypto.randomUUID());expect(await f.loadResolution()).toEqual(marker);expect(await f.resolve()).toEqual(marker);await denied(()=>f.gate());await denied(()=>db.query('SELECT verificar_permiso_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8)',[actor,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,f.body.sha256,f.reviewId,f.permit]))
})
it('050 rollback no deja resolución fantasma; recuperación admite custodia/permiso cerrados',async()=>{
 const f=await creditAuthorizedResolutionFixture();await f.write();await db.exec('SAVEPOINT resolution_rollback');await f.resolve();await db.exec('ROLLBACK TO SAVEPOINT resolution_rollback; RELEASE SAVEPOINT resolution_rollback');expect(await f.loadResolution()).toBeNull()
 const result=await f.resolve();await admin('UPDATE fiscal_emisores_homologacion SET habilitado=false');await admin("INSERT INTO fiscal_nc_permisos_revocados_homologacion(permiso_id,motivo) VALUES($1,'Ensayo')",[f.permit]);expect(await f.loadResolution()).toEqual(result);expect(await f.resolve()).toEqual(result)
})
it.each(['anon','authenticated','service_role'])('050 ACL de resolución/helper para%s',async role=>{
 const f=await creditAuthorizedResolutionFixture();await f.write();await f.resolve();await db.exec('RESET ROLE; SET ROLE '+role);await denied(()=>db.query('SELECT cae FROM fiscal_nc_resoluciones_homologacion'));await denied(()=>db.query("SELECT fiscal_nc_exigir_serie_sin_conflictos('20123456786',7,13)"));if(role!=='service_role'){await denied(()=>f.resolve());await denied(()=>f.loadResolution())}
})
it('050 otro Auth e inmutabilidad de marcador',async()=>{
 const f=await creditAuthorizedResolutionFixture();await f.write();await f.resolve();await denied(()=>f.loadResolution(crypto.randomUUID()));await denied(()=>f.resolve(crypto.randomUUID()));await db.exec('RESET ROLE');await denied(()=>db.query('DELETE FROM fiscal_nc_resoluciones_homologacion'));await denied(()=>db.query('UPDATE fiscal_nc_resoluciones_homologacion SET numero=24'))
})

it('050 dos casos parciales avanzan sólo tras CAE resuelto y numeración vigente; conflicto histórico bloquea siguiente permiso',async()=>{
 const f=await boundCreditFixture(true,true);await installCreditBinding();await installCreditContext();await seedCreditCatalog();await installCreditContextSource();await installCreditPreparation();await installCreditNumbers()
 const {validateFiscalCreditContext}=await import('../../supabase/functions/_shared/fiscalCreditContext'),{prepareFiscalCreditPreparation}=await import('../../supabase/functions/_shared/fiscalCreditPreparation'),entry={servicioDesde:null,servicioHasta:null,vencimientoPago:null},prepared:{id:string;sha:string;dataSha:string;reservation:string}[]=[]
 for(let n=0;n<2;n++){
  const proposal=await f.make({...f.draft,solicitud_id:crypto.randomUUID(),lineas:[{...f.draft.lineas[0],cantidad:'0.250',importe:'62.00'}],importes:{...f.draft.importes,total:'62.00',neto:'62.00'}});await f.write(proposal)
  const raw=(await db.query<{data:unknown}>('SELECT cargar_contexto_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,proposal.datos.solicitud_id,proposal.sha256])).rows[0].data,context=await validateFiscalCreditContext(raw,f.source,proposal),data=await prepareFiscalCreditPreparation(f.source,proposal,context,entry)
  await db.query('SELECT guardar_preparacion_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,sale,op,proposal.datos.solicitud_id,proposal.sha256,data.datos.contexto_sha256,JSON.stringify(entry)])
  prepared.push({id:proposal.datos.solicitud_id,sha:proposal.sha256,dataSha:data.sha256,reservation:crypto.randomUUID()})
 }
 const reserve=async(n:number,last:number)=>(await db.query<{data:Record<string,unknown>}>('SELECT reservar_cuerpo_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()) data',[actor,sale,op,prepared[n].id,prepared[n].sha,prepared[n].dataSha,prepared[n].reservation,last])).rows[0].data
 await reserve(0,22)
 await db.exec('RESET ROLE');for(const name of readdirSync('supabase/pilot-fiscal').filter(name=>/^0(3[7-9]|4[0-9]|50)_/.test(name)).sort()){const sql=readFileSync('supabase/pilot-fiscal/'+name,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql)}await db.exec('SET ROLE service_role')
 const approve=async(n:number)=>{
  const p=prepared[n],review=crypto.randomUUID(),permit=crypto.randomUUID(),attempt=crypto.randomUUID(),packet=(await db.query<{data:{cuerpo:{sha256:string}}}>('SELECT cargar_fuente_cuerpo_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,p.id,p.sha])).rows[0].data
  await db.query('SELECT aprobar_revision_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8)',[actor,sale,op,p.id,p.sha,review,packet.cuerpo.sha256,p.dataSha])
  await admin('INSERT INTO fiscal_nc_permisos_homologacion(id,solicitud_id,reserva_id,revision_id,actor_auth_id,solicitud_sha256,preparacion_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,creado_en,vence_en) SELECT $1,$2,$3,$4,$5,$6,$7,e.credencial_id,e.certificado_sha256,e.revision,true,clock_timestamp(),r.vence_en FROM fiscal_emisores_homologacion e,fiscal_nc_revisiones_homologacion r WHERE e.kiosco_id=$8 AND r.id=$4',[permit,p.id,p.reservation,review,actor,packet.cuerpo.sha256,p.dataSha,kid])
  return{review,permit,attempt,bodySha:packet.cuerpo.sha256}
 }
 const a=await approve(0),p=prepared[0],before=await preparationEffects();await db.query('SELECT registrar_intencion_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8,$9,22,clock_timestamp())',[actor,sale,op,p.id,p.sha,a.bodySha,a.review,a.permit,a.attempt])
 const response={intento_id:a.attempt,solicitud_sha256:a.bodySha,consultado_en:new Date().toISOString(),resultado:{estado:'AUTORIZACION_NC_COINCIDENTE',cae:'11111111111111',vencimiento:f.draft.fecha,procesadoEn:f.draft.fecha,solicitudSha256:a.bodySha,puedeReenviar:false},emision_habilitada:false}
 await db.query('SELECT registrar_consulta_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,sale,op,p.id,p.sha,crypto.randomUUID(),JSON.stringify(response)])
 await denied(()=>reserve(1,23));await db.query('SELECT registrar_resolucion_nc_autorizada_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,p.id,p.sha]);await denied(()=>reserve(1,22));expect(await reserve(1,23)).toMatchObject({numero:24});expect(await reserve(1,22)).toMatchObject({numero:24})
 const b=await approve(1),other=prepared[1];await db.query('SELECT verificar_permiso_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8)',[actor,sale,op,other.id,other.sha,b.bodySha,b.review,b.permit])
 await db.query('SELECT registrar_consulta_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,sale,op,p.id,p.sha,crypto.randomUUID(),JSON.stringify({...response,resultado:{...response.resultado,cae:'22222222222222'}})])
 await denied(()=>db.query('SELECT verificar_permiso_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8)',[actor,sale,op,other.id,other.sha,b.bodySha,b.review,b.permit]));expect(await preparationEffects()).toEqual(before)
})

async function creditCommercialPlanFixture(resolved=true){
 const f=await creditAuthorizedResolutionFixture();await f.write();if(resolved)await f.resolve();await db.exec('RESET ROLE')
 for(const file of ['supabase/bootstrap/commercial/001_commercial_subscription.sql','supabase/bootstrap/commercial/002_commercial_write_gate.sql','supabase/bootstrap/pilot-operations/001_capabilities.sql','supabase/pilot-fiscal/051_fiscal_credit_commercial_plan.sql']){const sql=readFileSync(file,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql)}
 const planId=crypto.randomUUID();await db.query("INSERT INTO planes(id,nombre,precio_mensual,max_usuarios) VALUES($1,'Ensayo NC',0,3)",[planId]);await db.query("INSERT INTO suscripciones(kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado) VALUES($1,$2,comercial_hoy(),comercial_hoy()+30,'ACTIVA')",[kid,planId]);await db.query('INSERT INTO piloto_operaciones_capacidades(kiosco_id,devoluciones_efectivo) VALUES($1,true)',[kid]);await db.exec('SET ROLE service_role')
 const plan=async(caja=f.cash,who=actor)=>(await db.query<{data:Record<string,unknown>}>('SELECT preparar_aplicacion_comercial_nc_homologacion($1,$2,$3,$4,$5,$6) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,caja])).rows[0].data
 return{...f,plan}
}
it('051 plan comercial deriva importe/receta originales bajo gates sin mutaciones',async()=>{
 const f=await creditCommercialPlanFixture(),before=await preparationEffects();const plan=await f.plan()
 expect(plan).toMatchObject({estado:'PLAN_NC_SIN_APLICAR',importe:'124.00',sesion_caja_id:f.cash,actor_auth_id:actor,usuario_id:owner,emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false,detalles:[{cantidad:'1.000',importe:'124.00',reingresa_stock:true}],fisicos:[{producto_id:product,cantidad:'1.000',stock_antes:'9.000'}]});expect(await f.plan()).toEqual(plan);expect(await preparationEffects()).toEqual(before)
})
it.each(['suspendido','capacidad','caja-cerrada','caja-ajena','auth','conflicto','unidad','virtual','stock-invalido'])('051 plan niega%s sin tocar negocio',async reason=>{
 const f=await creditCommercialPlanFixture(),before=await preparationEffects()
 if(reason==='suspendido')await admin("UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id=$1",[kid]);if(reason==='capacidad')await admin('UPDATE piloto_operaciones_capacidades SET devoluciones_efectivo=false WHERE kiosco_id=$1',[kid]);if(reason==='caja-cerrada')await admin("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=now() WHERE id=$1",[f.cash]);if(reason==='conflicto')await f.write(f.conflict,crypto.randomUUID());if(reason==='unidad')await admin("UPDATE productos SET es_pesable=true,unidad_medida='KG' WHERE id=$1",[product]);if(reason==='virtual')await admin('UPDATE productos SET es_combo=true WHERE id=$1',[product]);if(reason==='stock-invalido')await admin('UPDATE productos SET stock_actual=9.013 WHERE id=$1',[product])
 await denied(()=>f.plan(reason==='caja-ajena'?crypto.randomUUID():f.cash,reason==='auth'?crypto.randomUUID():actor));expect(await preparationEffects()).toEqual(before)
})
it.each(['anon','authenticated'])('051 plan privado deniega%s',async role=>{
 const f=await creditCommercialPlanFixture();await db.exec('RESET ROLE; SET ROLE '+role);await denied(()=>f.plan())
})

it('051 caja original cerrada admite otra caja de reintegro y conserva precio histórico',async()=>{
 const f=await creditCommercialPlanFixture(),refund=crypto.randomUUID();await admin("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=clock_timestamp() WHERE id=$1",[f.cash]);await admin('INSERT INTO sesiones_caja(id,kiosco_id,usuario_id) VALUES($1,$2,$3)',[refund,kid,owner]);await admin('UPDATE productos SET precio_venta=999 WHERE id=$1',[product]);await denied(()=>f.plan());const before=await preparationEffects()
 expect(await f.plan(refund)).toMatchObject({estado:'PLAN_NC_SIN_APLICAR',sesion_caja_id:refund,importe:'124.00',fisicos:[{producto_id:product,cantidad:'1.000'}]});expect(await preparationEffects()).toEqual(before)
})

async function creditCommercialApplicationFixture(resolved=true){
 const f=await creditCommercialPlanFixture(resolved);await db.exec('RESET ROLE')
 for(const file of ['supabase_fase_devolucion_registro_privado.sql','supabase_fase_devolucion_calculo_historico.sql','supabase_fase_devolucion_preparacion_privada.sql','supabase/bootstrap/returns/001_atomic_cash_return.sql','supabase/bootstrap/returns/003_whole_unit_quantities.sql','supabase/pilot-fiscal/052_fiscal_credit_commercial_application.sql']){const sql=readFileSync(file,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql)}await db.exec('SET ROLE service_role')
 const apply=async(caja=f.cash,who=actor)=>(await db.query<{data:Record<string,unknown>}>('SELECT aplicar_comercial_nc_homologacion($1,$2,$3,$4,$5,$6) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256,caja])).rows[0].data
 const readApplication=async(who=actor)=>(await db.query<{data:Record<string,unknown>|null}>('SELECT cargar_aplicacion_comercial_nc_homologacion($1,$2,$3,$4,$5) data',[who,sale,op,f.proposal.datos.solicitud_id,f.proposal.sha256])).rows[0].data
 return{...f,apply,readApplication}
}
it('052 aplica una salida de caja/stock/historia, ACK perdido recupera sin duplicar',async()=>{
 const f=await creditCommercialApplicationFixture();expect(await f.readApplication()).toBeNull();const result=await f.apply();expect(result).toMatchObject({estado:'APLICACION_NC_REGISTRADA',id:f.proposal.datos.solicitud_id,importe:'124.00',stock:[{producto_id:product,stock_actual:10}],nuevo_reintegro:false})
 expect(await f.readApplication()).toEqual(result);expect(await f.apply()).toEqual(result);await db.exec('SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED')
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>("SELECT count(*)::int n FROM movimientos_caja WHERE id=$1 AND tipo='EGRESO' AND monto=124",[f.proposal.datos.solicitud_id])).rows[0].n).toBe(1);expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_nc_reposiciones_homologacion')).rows[0].n).toBe(1);expect((await db.query<{n:number}>('SELECT count(*)::int n FROM detalles_devolucion')).rows[0].n).toBe(1);await db.exec('SET ROLE service_role')
 expect(await f.readIntent()).not.toBeNull();expect(await f.readAuthorization()).not.toBeNull();expect(await f.loadResolution()).not.toBeNull()
})
it('052 recuperación no exige caja abierta/capacidad/comercio vigentes ni admite cambiar caja',async()=>{
 const f=await creditCommercialApplicationFixture(),result=await f.apply();await admin("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=clock_timestamp() WHERE id=$1",[f.cash]);await admin('UPDATE piloto_operaciones_capacidades SET devoluciones_efectivo=false WHERE kiosco_id=$1',[kid]);await admin("UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id=$1",[kid])
 expect(await f.readApplication()).toEqual(result);expect(await f.apply()).toEqual(result);await denied(()=>f.apply(crypto.randomUUID()))
})
it('052 rollback revierte stock/caja/journal/cabecera y permite una aplicación posterior',async()=>{
 const f=await creditCommercialApplicationFixture(),before=await preparationEffects();await db.exec('SAVEPOINT apply_rollback');await f.apply();await db.exec('ROLLBACK TO SAVEPOINT apply_rollback; RELEASE SAVEPOINT apply_rollback');expect(await f.readApplication()).toBeNull();expect(await preparationEffects()).toEqual(before);expect(await f.apply()).toMatchObject({estado:'APLICACION_NC_REGISTRADA'})
})
it.each(['capacidad','conflicto','caja','costo-ausente'])('052 error%s no deja cambios parciales',async reason=>{
 const f=await creditCommercialApplicationFixture();if(reason==='capacidad')await admin('UPDATE piloto_operaciones_capacidades SET devoluciones_efectivo=false WHERE kiosco_id=$1',[kid]);if(reason==='conflicto')await f.write(f.conflict,crypto.randomUUID());if(reason==='caja')await admin("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=clock_timestamp() WHERE id=$1",[f.cash]);if(reason==='costo-ausente')await admin("DELETE FROM movimiento_stock_costos WHERE movimiento_id IN(SELECT id FROM movimientos_stock WHERE motivo='VENTA')")
 const before=await preparationEffects();await denied(()=>f.apply());expect(await f.readApplication()).toBeNull();expect(await preparationEffects()).toEqual(before);await db.exec('RESET ROLE');expect((await db.query<{stock:string}>('SELECT stock_actual::text stock FROM productos WHERE id=$1',[product])).rows[0].stock).toBe('9.000')
})
it.each(['anon','authenticated','service_role'])('052 diarios/helper sin acceso directo para%s',async role=>{
 const f=await creditCommercialApplicationFixture();await f.apply();await db.exec('RESET ROLE; SET ROLE '+role);await denied(()=>db.query('SELECT resultado FROM fiscal_nc_aplicaciones_homologacion'));await denied(()=>db.query('SELECT cantidad FROM fiscal_nc_reposiciones_homologacion'));await denied(()=>db.query("SELECT aplicar_reposicion_historica_piloto($1,$2,$3,$4,'[]'::jsonb)",[crypto.randomUUID(),sale,kid,owner]));if(role!=='service_role'){await denied(()=>f.apply());await denied(()=>f.readApplication())}
})

it('052 falla tardía de caja revierte también reposición y permite recuperar una sola aplicación',async()=>{
 const f=await creditCommercialApplicationFixture(),before=await preparationEffects()
 await admin("CREATE FUNCTION fallo_caja_nc_052() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.motivo='DEVOLUCION_VENTA' THEN RETURN NULL; END IF; RETURN NEW; END $$");await admin("CREATE TRIGGER fallo_caja_nc_052 BEFORE INSERT ON movimientos_caja FOR EACH ROW EXECUTE FUNCTION fallo_caja_nc_052()")
 await denied(()=>f.apply());expect(await f.readApplication()).toBeNull();expect(await preparationEffects()).toEqual(before)
 await db.exec('RESET ROLE');expect((await db.query<{stock:string}>('SELECT stock_actual::text stock FROM productos WHERE id=$1',[product])).rows[0]).toEqual({stock:'9.000'});await db.exec('SET ROLE service_role')
 await admin('DROP TRIGGER fallo_caja_nc_052 ON movimientos_caja');await admin('DROP FUNCTION fallo_caja_nc_052()')
 const result=await f.apply();expect(await f.apply()).toEqual(result)
})
it('052 recuperación exige el Dueño Auth original activo, aun con ACK durable',async()=>{
 const f=await creditCommercialApplicationFixture(),result=await f.apply()
 await denied(()=>f.readApplication(crypto.randomUUID()))
 await admin('UPDATE usuarios SET activo=false WHERE id=$1',[owner]);await denied(()=>f.readApplication());await denied(()=>f.apply())
 await admin('UPDATE usuarios SET activo=true WHERE id=$1',[owner]);expect(await f.readApplication()).toEqual(result)
})
it('052 repone con el costo histórico aunque el costo actual haya cambiado',async()=>{
 const f=await creditCommercialApplicationFixture()
 await admin('UPDATE producto_costos SET precio_costo=999 WHERE producto_id=$1',[product])
 await f.apply();await db.exec('RESET ROLE')
 expect((await db.query<{costo:string}>("SELECT c.precio_costo::text costo FROM movimiento_stock_costos c JOIN movimientos_stock m ON m.id=c.movimiento_id WHERE m.tipo='INGRESO' AND m.notas=$1",['Devolución atómica '+f.proposal.datos.solicitud_id])).rows).toEqual([{costo:'40.00'}])
 expect((await db.query<{costo:string}>('SELECT costo_unitario::text costo FROM fiscal_nc_reposiciones_homologacion WHERE solicitud_id=$1',[f.proposal.datos.solicitud_id])).rows).toEqual([{costo:'40.00'}])
})
it('052 diario y cabecera aplicados no se pueden modificar ni eliminar',async()=>{
 const f=await creditCommercialApplicationFixture();await f.apply();await db.exec('RESET ROLE')
 await denied(()=>db.query('DELETE FROM fiscal_nc_aplicaciones_homologacion'))
 await denied(()=>db.query('UPDATE fiscal_nc_aplicaciones_homologacion SET importe=1'))
 await denied(()=>db.query('DELETE FROM fiscal_nc_reposiciones_homologacion'))
 await denied(()=>db.query('DELETE FROM devoluciones_venta WHERE id=$1',[f.proposal.datos.solicitud_id]))
 await denied(()=>db.query('UPDATE devoluciones_venta SET monto_total=1 WHERE id=$1',[f.proposal.datos.solicitud_id]))
})
it('052 helper repone fracción en lote histórico agotado y conserva costo original',async()=>{
 const f=await creditCommercialApplicationFixture(),physical=crypto.randomUUID(),lot=crypto.randomUUID(),movement=crypto.randomUUID(),application=crypto.randomUUID()
 await admin("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta,stock_actual,es_pesable,unidad_medida) VALUES($1,$2,'Fracción lote sintético',100,0,true,'KG')",[physical,kid])
 await admin('INSERT INTO producto_costos(producto_id,kiosco_id,precio_costo) VALUES($1,$2,40) ON CONFLICT(producto_id) DO UPDATE SET precio_costo=40',[physical,kid])
 await admin("INSERT INTO lotes_producto(id,kiosco_id,producto_id,fecha_vencimiento,cantidad_inicial,cantidad_actual,activo) VALUES($1,$2,$3,current_date+30,0.5,0,false)",[lot,kid,physical])
 await admin("INSERT INTO movimientos_stock(id,kiosco_id,producto_id,tipo,cantidad,motivo,notas,usuario_id,lote_producto_id) VALUES($1,$2,$3,'EGRESO',0.5,'VENTA',$4,$5,$6)",[movement,kid,physical,'Checkout manual '+sale,owner,lot])
 await admin('UPDATE producto_costos SET precio_costo=999 WHERE producto_id=$1',[physical])
 await db.exec('RESET ROLE')
 const result=(await db.query<{data:{stock:unknown;reposiciones:unknown}}>("SELECT aplicar_reposicion_historica_piloto($1,$2,$3,$4,$5::jsonb) data",[application,sale,kid,owner,JSON.stringify([{producto_id:physical,cantidad:0.125}])])).rows[0].data
 expect(result.stock).toEqual([{producto_id:physical,stock_actual:0.125}])
 expect(result.reposiciones).toMatchObject([{movimiento_id:movement,cantidad:0.125,costo_unitario:40}])
 expect((await db.query('SELECT cantidad_actual::text cantidad,activo FROM lotes_producto WHERE id=$1',[lot])).rows[0]).toEqual({cantidad:'0.125',activo:true})
 expect((await db.query("SELECT c.precio_costo::text costo,m.lote_producto_id FROM movimientos_stock m JOIN movimiento_stock_costos c ON c.movimiento_id=m.id WHERE m.notas=$1",['Devolución atómica '+application])).rows[0]).toEqual({costo:'40.00',lote_producto_id:lot})
 expect(await f.readApplication()).toBeNull()
})
it('052 dos NC parciales aplicadas conservan saldo/historia y reponen exactamente la venta ponderada',async()=>{
 const f=await boundCreditFixture(true,true);await installCreditBinding();await installCreditContext();await seedCreditCatalog();await installCreditContextSource();await installCreditPreparation();await installCreditNumbers()
 const {validateFiscalCreditContext}=await import('../../supabase/functions/_shared/fiscalCreditContext'),{prepareFiscalCreditPreparation}=await import('../../supabase/functions/_shared/fiscalCreditPreparation'),entry={servicioDesde:null,servicioHasta:null,vencimientoPago:null},prepared:{id:string;sha:string;dataSha:string;reservation:string}[]=[]
 for(let n=0;n<2;n++){
  const proposal=await f.make({...f.draft,solicitud_id:crypto.randomUUID(),lineas:[{...f.draft.lineas[0],cantidad:'0.250',importe:'62.00'}],importes:{...f.draft.importes,total:'62.00',neto:'62.00'}});await f.write(proposal)
  const raw=(await db.query<{data:unknown}>('SELECT cargar_contexto_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,proposal.datos.solicitud_id,proposal.sha256])).rows[0].data,context=await validateFiscalCreditContext(raw,f.source,proposal),data=await prepareFiscalCreditPreparation(f.source,proposal,context,entry)
  await db.query('SELECT guardar_preparacion_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,sale,op,proposal.datos.solicitud_id,proposal.sha256,data.datos.contexto_sha256,JSON.stringify(entry)])
  prepared.push({id:proposal.datos.solicitud_id,sha:proposal.sha256,dataSha:data.sha256,reservation:crypto.randomUUID()})
 }
 const reserve=async(n:number,last:number)=>(await db.query<{data:Record<string,unknown>}>('SELECT reservar_cuerpo_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8,clock_timestamp()) data',[actor,sale,op,prepared[n].id,prepared[n].sha,prepared[n].dataSha,prepared[n].reservation,last])).rows[0].data
 await reserve(0,22)
 await db.exec('RESET ROLE');for(const name of readdirSync('supabase/pilot-fiscal').filter(name=>/^0(3[7-9]|4[0-9]|50)_/.test(name)).sort()){const sql=readFileSync('supabase/pilot-fiscal/'+name,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,'');await db.exec(sql);await db.exec(sql)}await db.exec('SET ROLE service_role')
 const approve=async(n:number)=>{
  const p=prepared[n],review=crypto.randomUUID(),permit=crypto.randomUUID(),attempt=crypto.randomUUID(),packet=(await db.query<{data:{cuerpo:{sha256:string}}}>('SELECT cargar_fuente_cuerpo_nc_homologacion($1,$2,$3,$4,$5) data',[actor,sale,op,p.id,p.sha])).rows[0].data
  await db.query('SELECT aprobar_revision_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8)',[actor,sale,op,p.id,p.sha,review,packet.cuerpo.sha256,p.dataSha])
  await admin('INSERT INTO fiscal_nc_permisos_homologacion(id,solicitud_id,reserva_id,revision_id,actor_auth_id,solicitud_sha256,preparacion_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,creado_en,vence_en) SELECT $1,$2,$3,$4,$5,$6,$7,e.credencial_id,e.certificado_sha256,e.revision,true,clock_timestamp(),r.vence_en FROM fiscal_emisores_homologacion e,fiscal_nc_revisiones_homologacion r WHERE e.kiosco_id=$8 AND r.id=$4',[permit,p.id,p.reservation,review,actor,packet.cuerpo.sha256,p.dataSha,kid])
  return{review,permit,attempt,bodySha:packet.cuerpo.sha256}
 }
 await db.exec('RESET ROLE')
 for(const file of ['supabase/bootstrap/commercial/001_commercial_subscription.sql','supabase/bootstrap/commercial/002_commercial_write_gate.sql','supabase/bootstrap/pilot-operations/001_capabilities.sql','supabase_fase_devolucion_registro_privado.sql','supabase_fase_devolucion_calculo_historico.sql','supabase_fase_devolucion_preparacion_privada.sql','supabase/bootstrap/returns/001_atomic_cash_return.sql','supabase/bootstrap/returns/003_whole_unit_quantities.sql','supabase/pilot-fiscal/051_fiscal_credit_commercial_plan.sql','supabase/pilot-fiscal/052_fiscal_credit_commercial_application.sql'])await db.exec(readFileSync(file,'utf8').replace(/^BEGIN;$/m,'').replace(/^COMMIT;$/m,''))
 const commercialPlan=crypto.randomUUID();await db.query("INSERT INTO planes(id,nombre,precio_mensual,max_usuarios) VALUES($1,'Parciales NC',0,3)",[commercialPlan]);await db.query("INSERT INTO suscripciones(kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado) VALUES($1,$2,comercial_hoy(),comercial_hoy()+30,'ACTIVA')",[kid,commercialPlan]);await db.query('INSERT INTO piloto_operaciones_capacidades(kiosco_id,devoluciones_efectivo) VALUES($1,true)',[kid]);await db.exec('SET ROLE service_role')
 for(let n=0;n<2;n++){
  if(n===1)expect(await reserve(n,23)).toMatchObject({numero:24})
  const p=prepared[n],approved=await approve(n)
  await db.query('SELECT registrar_intencion_nc_homologacion($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,clock_timestamp())',[actor,sale,op,p.id,p.sha,approved.bodySha,approved.review,approved.permit,approved.attempt,22+n])
  const response={intento_id:approved.attempt,solicitud_sha256:approved.bodySha,consultado_en:new Date().toISOString(),resultado:{estado:'AUTORIZACION_NC_COINCIDENTE',cae:n===0?'11111111111111':'22222222222222',vencimiento:f.draft.fecha,procesadoEn:f.draft.fecha,solicitudSha256:approved.bodySha,puedeReenviar:false},emision_habilitada:false}
  await db.query('SELECT registrar_consulta_nc_homologacion($1,$2,$3,$4,$5,$6,$7::jsonb)',[actor,sale,op,p.id,p.sha,crypto.randomUUID(),JSON.stringify(response)])
  await db.query('SELECT registrar_resolucion_nc_autorizada_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,p.id,p.sha])
  const apply=async()=>(await db.query<{data:unknown}>('SELECT aplicar_comercial_nc_homologacion($1,$2,$3,$4,$5,$6) data',[actor,sale,op,p.id,p.sha,f.cash])).rows[0].data
  const result=await apply();expect(result).toMatchObject({importe:'62.00',stock:[{producto_id:product,stock_actual:n===0?9.75:10}]});expect(await apply()).toEqual(result)
 }
 await db.exec('RESET ROLE')
 expect((await db.query('SELECT sum(importe)::text total,count(*)::int n FROM fiscal_nc_aplicaciones_homologacion')).rows[0]).toEqual({total:'124.00',n:2})
 expect((await db.query('SELECT sum(cantidad)::text cantidad FROM fiscal_nc_reposiciones_homologacion')).rows[0]).toEqual({cantidad:'0.500'})
 await db.exec('SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED')
})
it.each(['normal','ack-resolucion-perdido','ack-aplicacion-perdido','ack-aplicacion-error','get-final-perdido','flag-cerrado','flag-tras-resolucion','conflicto','auth-ajeno','recuperacion-suspendida','resolucion-alterada','aplicacion-alterada'] as const)('servicio052 integrado %s recupera verdad durable sin red ARCA',async mode=>{
 const f=await creditCommercialApplicationFixture(false),w=workerFixture(),{applyFiscalCreditCommercialOperation}=await import('../../supabase/functions/_shared/fiscalCreditCommercialWorker')
 w.flags.ARCA_HOMO_CREDIT_APPLY_ENABLED='true'
 const scope={saleId:sale,operationId:op,requestId:f.proposal.datos.solicitud_id,sha256:f.proposal.sha256},before=await preparationEffects();let applied=false,loseGet=true
 const client:FiscalAuthClient={auth:w.admin.auth,rpc:async(name,args)=>{
  if(name==='cargar_aplicacion_comercial_nc_homologacion'&&applied&&mode==='get-final-perdido'&&loseGet){loseGet=false;return{data:null,error:new Error('LOST_GET')}}
  const result=await w.rpc(name,args)
  if(name==='cargar_resolucion_nc_homologacion'&&mode==='resolucion-alterada'&&result.data&&typeof result.data==='object')return{data:{...result.data,numero:999},error:null}
  if(name==='cargar_aplicacion_comercial_nc_homologacion'&&applied&&mode==='aplicacion-alterada'&&loseGet&&result.data&&typeof result.data==='object'){loseGet=false;return{data:{...result.data,importe:'999.00'},error:null}}
  if(name==='registrar_resolucion_nc_autorizada_homologacion'&&!result.error){if(mode==='ack-resolucion-perdido')throw new Error('LOST_ACK');if(mode==='flag-tras-resolucion')w.flags.ARCA_HOMO_CREDIT_APPLY_ENABLED='false'}
  if(name==='aplicar_comercial_nc_homologacion'&&!result.error){applied=true;if(mode==='ack-aplicacion-perdido')throw new Error('LOST_ACK');if(mode==='ack-aplicacion-error')return{data:null,error:new Error('LOST_ACK')}}
  return result
 }}
 if(mode==='flag-cerrado')w.flags.ARCA_HOMO_CREDIT_APPLY_ENABLED='false'
 if(mode==='conflicto')await f.write(f.conflict,crypto.randomUUID())
 if(mode==='auth-ajeno')w.getUser.mockResolvedValue({data:{user:{id:crypto.randomUUID()}},error:null})
 const deps={admin:client,readSecret:w.deps.readSecret},run=()=>applyFiscalCreditCommercialOperation(deps,'SYNTHETIC_JWT',scope,f.cash)
 if(['flag-cerrado','flag-tras-resolucion','conflicto','auth-ajeno','resolucion-alterada'].includes(mode)){
  await expect(run()).rejects.toThrow('FISCAL_APLICACION_NC_NO_CONFIRMADA');expect(await f.readApplication()).toBeNull();expect(await preparationEffects()).toEqual(before)
 }else{
  if(mode==='get-final-perdido'||mode==='aplicacion-alterada')await expect(run()).rejects.toThrow('FISCAL_APLICACION_NC_NO_CONFIRMADA')
  const result=await run();expect(result).toMatchObject({estado:'APLICACION_NC_REGISTRADA',importe:'124.00',nuevo_reintegro:false});expect(await run()).toEqual(result)
  if(mode==='recuperacion-suspendida'){
   w.flags.ARCA_HOMO_CREDIT_APPLY_ENABLED='false';await admin("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=clock_timestamp() WHERE id=$1",[f.cash]);await admin("UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id=$1",[kid]);w.rpc.mockClear();expect(await run()).toEqual(result);expect(w.rpc.mock.calls.map(([name])=>name)).toEqual(['cargar_aplicacion_comercial_nc_homologacion'])
  }
  await db.exec('RESET ROLE');expect((await db.query('SELECT count(*)::int n FROM movimientos_caja WHERE id=$1',[scope.requestId])).rows[0]).toEqual({n:1});await db.exec('SET ROLE service_role')
 }
 expect(w.load).not.toHaveBeenCalled();expect(w.fetcher).not.toHaveBeenCalled()
})