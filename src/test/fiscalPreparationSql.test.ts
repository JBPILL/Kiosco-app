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
 const rpc=vi.fn<FiscalAuthClient['rpc']>(async(name,args)=>{
  const keys=mapping[name];if(!keys)throw new Error('UNEXPECTED_PRIVATE_RPC')
  await db.exec('SAVEPOINT worker_rpc')
  try{const result=await db.query<{data:unknown}>(`SELECT ${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) data`,keys.map(key=>args[key]));await db.exec('RELEASE SAVEPOINT worker_rpc');return {data:result.rows[0].data,error:null}}
  catch{await db.exec('ROLLBACK TO SAVEPOINT worker_rpc; RELEASE SAVEPOINT worker_rpc');return {data:null,error:new Error('SQL_DENIED')}}
 })
 const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:actor}},error:null}))
 const load=vi.fn<WsaaTicketLoader>(async binding=>({entorno:'HOMOLOGACION',servicio:'wsfe',cuitEmisor:binding.cuit_emisor,credencialId:binding.credencial_id,certificadoSha256:binding.certificado_sha256,token:'SYNTHETIC_TA',sign:'SYNTHETIC_SIGN',expiresAt:Date.now()+120000}))
 const fetcher=vi.fn<typeof fetch>(async request=>{
  expect((request as Request).headers.get('SOAPAction')).toContain('FECompUltimoAutorizado')
  return new Response('<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompUltimoAutorizadoResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompUltimoAutorizadoResult><PtoVta>7</PtoVta><CbteTipo>11</CbteTipo><CbteNro>0</CbteNro></FECompUltimoAutorizadoResult></FECompUltimoAutorizadoResponse></s:Body></s:Envelope>',{headers:{'content-type':'text/xml'}})
 })
 const deps={admin:{auth:{getUser},rpc},readSecret:(key:string)=>flags[key],cache:createFiscalTicketCache(),load,fetcher}
 return {flags,rpc,getUser,load,fetcher,run:()=>prepareFiscalVoucher(deps,'SYNTHETIC_JWT',op)}
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
 expect(result.estado).toBe('ENVIO_INCIERTO');expect(JSON.stringify(result)).not.toMatch(/credencial|certificado|actor_auth|token|sign|intento_id|cae/)
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
