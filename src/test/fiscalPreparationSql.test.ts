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
 for(const file of readdirSync('supabase/pilot-fiscal').filter(n=>/^\d{3}_.*\.sql$/.test(n)).sort()){
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
 const flags:Record<string,string>={SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',ARCA_HOMO_BACKEND_ENABLED:'true',ARCA_HOMO_PREPARATION_ENABLED:'true'}
 const mapping:Record<string,string[]>={autorizar_consulta_fiscal_homologacion:['p_actor_auth_id','p_operacion_id'],cargar_fuente_preparacion_homologacion:['p_actor_auth_id','p_operacion_id'],cargar_revision_fiscal_homologacion:['p_operacion_id','p_actor_auth_id'],persistir_preparacion_fiscal_homologacion:['p_actor_auth_id','p_operacion_id','p_canonico','p_sha','p_ultimo_autorizado','p_consultado_en']}
 mapping.cargar_fuente_correccion_rechazo_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id'];mapping.corregir_rechazo_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_sucesora_id','p_intento_id','p_anterior_sha','p_canonico','p_sha','p_verificacion'];mapping.consultar_correccion_rechazo_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id']
 mapping.cargar_observacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_id'];mapping.cargar_constancia_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id']
 mapping.autorizar_conciliacion_revisada_homologacion=['p_actor_auth_id','p_operacion_id'];mapping.cargar_contexto_conciliacion_homologacion=['p_operacion_id'];mapping.consultar_reconciliacion_homologacion=['p_operacion_id','p_id'];mapping.registrar_conciliacion_revisada_homologacion=['p_actor_auth_id','p_binding','p_id','p_operacion_id','p_intento_id','p_sha','p_revision','p_decision']
 mapping.cargar_datos_preparacion_homologacion=['p_actor_auth_id','p_venta_id'];mapping.resolver_preparacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id']
 mapping.sustituir_reserva_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_sucesora_id','p_anterior_sha','p_canonico','p_sha'];mapping.consultar_sustitucion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id']
 mapping.cancelar_preparacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id'];mapping.consultar_cancelacion_preparacion_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id']
 mapping.cargar_contexto_presentacion_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id'];mapping.cargar_presentacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id'];mapping.guardar_presentacion_fiscal_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_solicitud_sha','p_canonico','p_sha'];mapping.cargar_revision_presentacion_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_revision_id'];mapping.aprobar_revision_presentacion_homologacion=['p_actor_auth_id','p_venta_id','p_operacion_id','p_revision_id','p_solicitud_sha','p_revision','p_presentacion_sha']
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

async function authorizeReceipt(finalize=true) {
 const p=await prepared();await save(p.canonico,p.sha256)
 const frozen=await requestFromPreparedFiscalData(p,1),canonical=await serializeFiscalRequest(frozen)
 await db.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[actor,op,canonical,frozen.sha256])
 const permission=crypto.randomUUID(),attempt=crypto.randomUUID()
 await admin(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,creado_en,vence_en)
 VALUES($1,$2,$3,$4,$5,1,true,clock_timestamp(),clock_timestamp()+interval '30 minutes')`,[op,permission,frozen.sha256,credential,'a'.repeat(64)])
 await db.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[op,actor,crypto.randomUUID(),frozen.sha256])
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
 await db.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[op,actor,crypto.randomUUID(),frozen.sha256])
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
 if(mode==='intento')await db.query('SELECT registrar_intento_fiscal_homologacion($1,$2)',[op,crypto.randomUUID()])
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
 await db.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[operationId,actor,crypto.randomUUID(),sha])
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
