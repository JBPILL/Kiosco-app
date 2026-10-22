// @vitest-environment node
// SQL real embebido; Auth/TA/transporte simulados. No acredita JWT hospedado.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterAll, afterEach, expect, it, vi } from 'vitest'
import { freezeFiscalRequest, serializeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import { emitAuthorizedFiscalVoucher } from '../../supabase/functions/_shared/fiscalEmissionWorker'
import { createFiscalTicketCache } from '../../supabase/functions/_shared/fiscalTicketCache'
import type { WsaaTicketLoader } from '../../supabase/functions/_shared/fiscalTicketCache'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { wsfeSample, wsfeLast, wsfeReceipt, wsfeConsult, wsfeSoap } from './fixtures/fiscalWsfe'

const db=new PGlite(),kid=crypto.randomUUID(),actor=crypto.randomUUID(),owner=crypto.randomUUID(),sale=crypto.randomUUID(),op=crypto.randomUUID(),credential=crypto.randomUUID(),permission=crypto.randomUUID()
let hash:string,canonical:string
beforeAll(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  const root='supabase/bootstrap'
  for(const file of [join(root,'001_domain.sql'),join(root,'002_identity_helpers.sql'),...readdirSync(join(root,'steps')).sort().map(n=>join(root,'steps',n)),join(root,'900_final_security.sql')])await db.exec(readFileSync(file,'utf8'))
  for(const file of readdirSync('supabase/pilot-fiscal').filter(n=>/^\d{3}_.*\.sql$/.test(n)).sort()){
    const sql=readFileSync(join('supabase/pilot-fiscal',file),'utf8');await db.exec(sql);await db.exec(sql)
  }
  await db.query('INSERT INTO auth.users VALUES($1)',[actor]);await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Emisión sintética')",[kid])
  await db.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Dueño sintético','DUEÑO')",[owner,actor,kid])
  await db.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45)',[sale,kid,owner]);await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor])
  const frozen=await freezeFiscalRequest(wsfeSample);hash=frozen.sha256;canonical=await serializeFiscalRequest(frozen)
},120000)
beforeEach(async()=>{
  await db.exec('BEGIN; SET ROLE authenticated')
  await db.query('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb)',[op,kid,sale,JSON.stringify({version:1,cuit_emisor:wsfeSample.cuitEmisor,punto_venta:2,tipo_comprobante:11,tipo_doc_receptor:99,nro_doc_receptor:'0'})])
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado) VALUES($1,$2,2,$3,$4,true)`,[kid,wsfeSample.cuitEmisor,credential,'a'.repeat(64)])
  await db.exec("SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true)")
  await db.query('SELECT persistir_solicitud_fiscal_homologacion($1,$2,$3,0,clock_timestamp())',[op,canonical,hash])
})
afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE')})
afterAll(async()=>{await db.close()})
async function allow(mode='ok',reviewed=true) {
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,creado_en,vence_en)
    VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()-($8::int*interval '1 minute'),clock_timestamp()+($9::int*interval '1 minute'))`,
    [op,permission,mode==='hash'?'0'.repeat(64):hash,mode==='credencial'?crypto.randomUUID():credential,mode==='huella'?'b'.repeat(64):'a'.repeat(64),mode==='revision'?2:1,mode!=='deshabilitado',mode==='futuro'?-120:mode==='vencido'?120:0,mode==='futuro'?150:mode==='vencido'?-90:30])
  await db.exec('SET ROLE service_role')
  if(reviewed)await db.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[op,actor,crypto.randomUUID(),hash])
}
const mapping:Record<string,string[]>={
  autorizar_consulta_fiscal_homologacion:['p_actor_auth_id','p_operacion_id'],cargar_preparacion_envio_homologacion:['p_operacion_id'],
  cargar_revision_fiscal_homologacion:['p_operacion_id','p_actor_auth_id'],aprobar_revision_fiscal_homologacion:['p_operacion_id','p_actor_auth_id','p_id','p_sha','p_revision'],
  registrar_envio_revisado_homologacion:['p_actor_auth_id','p_operacion_id','p_intento_id','p_sha','p_autorizacion_id','p_ultimo_autorizado','p_consultado_en'],
  consultar_reconciliacion_homologacion:['p_operacion_id','p_id'],cargar_contexto_conciliacion_homologacion:['p_operacion_id'],
  registrar_reconciliacion_fiscal_homologacion:['p_id','p_operacion_id','p_intento_id','p_sha','p_revision','p_decision'],
}
function fixture(){
  const flags:Record<string,string>={SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',ARCA_HOMO_BACKEND_ENABLED:'true',ARCA_HOMO_EMISSION_ENABLED:'true'}
  const rpc=vi.fn<FiscalAuthClient['rpc']>(async(name,args)=>{
    const names=mapping[name];if(!names)throw new Error('SYNTHETIC_UNEXPECTED_RPC')
    await db.exec('SAVEPOINT rpc_call')
    try {const r=await db.query<{data:unknown}>(`SELECT ${name}(${names.map((k,i)=>'$'+(i+1)+(k==='p_decision'?'::jsonb':'')).join(',')}) data`,names.map(k=>k==='p_decision'?JSON.stringify(args[k]):args[k]));await db.exec('RELEASE SAVEPOINT rpc_call');return {data:r.rows[0].data,error:null}}
    catch{await db.exec('ROLLBACK TO SAVEPOINT rpc_call; RELEASE SAVEPOINT rpc_call');return {data:null,error:new Error('SYNTHETIC_SQL_REJECTED')}}
  })
  const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:actor}},error:null}))
  const load=vi.fn<WsaaTicketLoader>(async b=>({entorno:'HOMOLOGACION',servicio:'wsfe',cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_TOKEN',sign:'SYNTHETIC_SIGN',expiresAt:Date.now()+120000}))
  const fetcher=vi.fn<typeof fetch>(async input=>{
    const action=(input as Request).headers.get('SOAPAction')
    return new Response(action?.includes('FECompUltimoAutorizado')?wsfeLast():action?.includes('FECAESolicitar')?wsfeReceipt():wsfeConsult(),{headers:{'Content-Type':'text/xml'}})
  })
  const deps={admin:{auth:{getUser},rpc},readSecret:(n:string)=>flags[n],cache:createFiscalTicketCache(),load,fetcher}
  return {flags,deps,getUser,rpc,load,fetcher,run:(attempt=crypto.randomUUID(),observation=crypto.randomUUID())=>emitAuthorizedFiscalVoucher(deps,'SYNTHETIC_JWT',op,attempt,observation)}
}
async function state(){await db.exec('RESET ROLE');const r=await db.query<{estado:string;usado_por_intento:string|null}>(`SELECT r.estado,p.usado_por_intento FROM fiscal_reservas_homologacion r LEFT JOIN fiscal_permisos_emision_homologacion p USING(operacion_id)`);await db.exec('SET ROLE service_role');return r.rows[0]}
it('sin permiso privado no lee TA ni llama ARCA',async()=>{
  const f=fixture();await expect(f.run()).rejects.toThrow();expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect((await state()).estado).toBe('RESERVADA')
})
it.each(['hash','credencial','huella','revision','deshabilitado','vencido','futuro'])('permiso %s no habilita ni numeración ni envío',async mode=>{
  await allow(mode);const f=fixture();await expect(f.run()).rejects.toThrow();expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect((await state()).usado_por_intento).toBeNull()
})
it('flags privados/proyecto/actor cierran antes de transporte',async()=>{
  await allow()
  for(const patch of [{SUPABASE_URL:'https://lllkjnqpltnwvxzphncr.supabase.co'},{ARCA_HOMO_BACKEND_ENABLED:'false'},{ARCA_HOMO_EMISSION_ENABLED:'false'}]){
    const f=fixture();Object.assign(f.flags,patch);await expect(f.run()).rejects.toThrow();expect(f.fetcher).not.toHaveBeenCalled();expect(f.load).not.toHaveBeenCalled()
  }
  const f=fixture();f.getUser.mockResolvedValue({data:{user:{id:crypto.randomUUID()}},error:null});await expect(f.run()).rejects.toThrow();expect(f.load).not.toHaveBeenCalled()
})
it('emite una vez y cierra sólo tras FECompConsultar; replay no toca red ni negocio',async()=>{
  await allow();const f=fixture(),attempt=crypto.randomUUID(),observation=crypto.randomUUID(),ack=await f.run(attempt,observation)
  expect(ack.estado).toBe('AUTORIZADA');expect(ack.emision_habilitada).toBe(false)
  expect(f.fetcher.mock.calls.map(c=>(c[0] as Request).headers.get('SOAPAction'))).toEqual(['"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"','"http://ar.gov.afip.dif.FEV1/FECAESolicitar"','"http://ar.gov.afip.dif.FEV1/FECompConsultar"'])
  f.flags.ARCA_HOMO_EMISSION_ENABLED='false';expect(await f.run()).toEqual(ack);expect(f.fetcher).toHaveBeenCalledTimes(3)
  expect(await state()).toEqual({estado:'AUTORIZADA',usado_por_intento:attempt})
  await db.exec('RESET ROLE')
  expect((await db.query<{usuario_id:string}>(`SELECT r.usuario_id FROM fiscal_permisos_emision_homologacion p
    JOIN fiscal_revisiones_homologacion r ON r.id=p.revision_aprobada_id WHERE p.operacion_id=$1`,[op])).rows).toEqual([{usuario_id:owner}])
  expect((await db.query<{total:string;estado:string}>('SELECT total::text,estado FROM ventas')).rows[0]).toEqual({total:'123.45',estado:'COMPLETADA'})
  for(const table of ['movimientos_stock','movimientos_caja'])expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
})
it('ACK de FECAESolicitar perdido se recupera por consulta sin otro envío',async()=>{
  await allow();const f=fixture(),normal=f.fetcher.getMockImplementation()!
  f.fetcher.mockImplementation(async(input,init)=>{if((input as Request).headers.get('SOAPAction')?.includes('FECAESolicitar'))throw new Error('SYNTHETIC_ACK_LOST');return normal(input,init)})
  expect((await f.run()).estado).toBe('AUTORIZADA');expect(f.fetcher).toHaveBeenCalledTimes(3)
})
it('CAE recibido con consulta distinta permanece pendiente y no se reenvía',async()=>{
  await allow();const f=fixture(),normal=f.fetcher.getMockImplementation()!
  f.fetcher.mockImplementation(async(input,init)=>(input as Request).headers.get('SOAPAction')?.includes('FECompConsultar')?new Response(wsfeConsult().replace('<ImpTotal>123.45','<ImpTotal>124.45'),{headers:{'Content-Type':'text/xml'}}):normal(input,init))
  const attempt=crypto.randomUUID(),observation=crypto.randomUUID(),ack=await f.run(attempt,observation)
  expect(ack.estado).toBe('PENDIENTE_CONCILIACION');expect(await f.run(attempt,observation)).toEqual(ack);expect(f.fetcher).toHaveBeenCalledTimes(3)
  expect((await state()).estado).toBe('ENVIO_INCIERTO')
})
it('ACK de intención perdido no manda la factura, y retry sólo concilia',async()=>{
  await allow();const f=fixture(),base=f.rpc.getMockImplementation()!
  f.rpc.mockImplementation(async(name,args)=>{const r=await base(name,args);return name==='registrar_envio_revisado_homologacion'?{data:null,error:new Error('SYNTHETIC_ACK_LOST')}:r})
  await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1);expect((await state()).estado).toBe('ENVIO_INCIERTO')
  f.fetcher.mockResolvedValue(new Response(wsfeSoap('FECompConsultar','<Errors><Err><Code>602</Code><Msg>SYNTHETIC_NOT_FOUND</Msg></Err></Errors>'),{headers:{'Content-Type':'text/xml'}}))
  expect((await f.run()).estado).toBe('PENDIENTE_CONCILIACION');expect(f.fetcher).toHaveBeenCalledTimes(2)
})
it('numeración externa ya ocupada no se atribuye a esta operación sin intento',async()=>{
  await allow();const f=fixture();f.fetcher.mockResolvedValue(new Response(wsfeLast(1),{headers:{'Content-Type':'text/xml'}}))
  await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1);expect((await state()).estado).toBe('RESERVADA')
})
it('revocar permiso entre consulta y envío impide el POST',async()=>{
  await allow();const f=fixture(),base=f.fetcher.getMockImplementation()!
  f.fetcher.mockImplementation(async(input,init)=>{const r=await base(input,init);await db.exec('RESET ROLE');await db.exec('UPDATE fiscal_permisos_emision_homologacion SET habilitado=false');await db.exec('SET ROLE service_role');return r})
  await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1);expect((await state()).usado_por_intento).toBeNull()
})
it.each(['anon','authenticated','service_role'])('tabla de permisos no admite lectura/escritura directa por %s',async role=>{
  await allow();await db.exec(`RESET ROLE; SET ROLE ${role}; SAVEPOINT denied`)
  await expect(db.query('SELECT * FROM fiscal_permisos_emision_homologacion')).rejects.toThrow();await db.exec('ROLLBACK TO SAVEPOINT denied')
  await expect(db.query('UPDATE fiscal_permisos_emision_homologacion SET habilitado=true')).rejects.toThrow();await db.exec('ROLLBACK TO SAVEPOINT denied')
})

it('cuerpo de wire no soportado falla antes de pedir TA o numeración',async()=>{
  await allow();const f=fixture(),base=f.rpc.getMockImplementation()!,invalid=await freezeFiscalRequest({...wsfeSample,condicionIvaReceptor:100})
  f.rpc.mockImplementation(async(name,args)=>{const r=await base(name,args);return name==='cargar_preparacion_envio_homologacion'?{data:{...(r.data as Record<string,unknown>),solicitud:invalid},error:null}:r})
  await expect(f.run()).rejects.toThrow();expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
})
it('actualización omitida del permiso revierte también la intención fiscal',async()=>{
  await allow();await db.exec(`RESET ROLE; CREATE FUNCTION omitir_uso_permiso() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir_uso BEFORE UPDATE ON fiscal_permisos_emision_homologacion FOR EACH ROW EXECUTE FUNCTION omitir_uso_permiso(); SET ROLE service_role`)
  const f=fixture();await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1)
  expect(await state()).toEqual({estado:'RESERVADA',usado_por_intento:null})
})

it('si el permiso vence dentro del registro, revierte intención y no envía',async()=>{
  await allow();await db.exec(`RESET ROLE; CREATE FUNCTION vencer_permiso_en_intento() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    UPDATE fiscal_permisos_emision_homologacion SET creado_en=clock_timestamp()-interval '2 hours',vence_en=clock_timestamp()-interval '90 minutes'; RETURN NEW; END $$;
    CREATE TRIGGER vencer_permiso BEFORE UPDATE ON fiscal_reservas_homologacion FOR EACH ROW EXECUTE FUNCTION vencer_permiso_en_intento(); SET ROLE service_role`)
  const f=fixture();await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1)
  expect(await state()).toEqual({estado:'RESERVADA',usado_por_intento:null})
})

it('sin revisión humana vigente no pide TA ni consulta numeración',async()=>{
  await allow('ok',false);const f=fixture();await expect(f.run()).rejects.toThrow()
  expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
})
async function review(id=crypto.randomUUID(),sha=hash,revision=1,actorId=actor) {
  return (await db.query<{ack:Record<string,unknown>}>('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,$5) ack',[op,actorId,id,sha,revision])).rows[0].ack
}
async function readReview(actorId=actor) {
  return (await db.query<{ctx:Record<string,unknown>}>('SELECT cargar_revision_fiscal_homologacion($1,$2) ctx',[op,actorId])).rows[0].ctx
}
async function deniedSql(action:()=>Promise<unknown>,message:RegExp) {
  await db.exec('SAVEPOINT review_denied')
  try {await expect(action()).rejects.toThrow(message)}finally{await db.exec('ROLLBACK TO SAVEPOINT review_denied; RELEASE SAVEPOINT review_denied')}
}
it('revisión recuperable conserva identidad, vencimiento e historia sin otorgar permiso privado',async()=>{
  expect((await readReview()).aprobacion).toBeNull()
  const id=crypto.randomUUID(),ack=await review(id)
  expect(await review(id)).toEqual(ack);expect((await readReview()).aprobacion).toEqual(ack)
  expect(ack.emision_habilitada).toBe(false)
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_revisiones_homologacion')).rows[0].n).toBe(1)
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_permisos_emision_homologacion')).rows[0].n).toBe(0)
  const publicJson=JSON.stringify(ack);for(const secret of [credential,'certificado_sha256','emisor_revision','SYNTHETIC_TOKEN'])expect(publicJson).not.toContain(secret)
})
it.each(['hash','revision'])('rechaza revisión de %s distinto sin crear auditoría',async mode=>{
  await deniedSql(()=>review(crypto.randomUUID(),mode==='hash'?'b'.repeat(64):hash,mode==='revision'?2:1),/Cambió|no admite/)
  expect((await readReview()).aprobacion).toBeNull()
})
it('un usuario distinto no puede consultar ni aprobar la operación original',async()=>{
  await deniedSql(()=>db.query('SELECT cargar_revision_fiscal_homologacion($1,$2)',[op,crypto.randomUUID()]),/no autorizada/)
})
it.each(['anon','authenticated','service_role'])('no expone tabla de revisiones a %s',async role=>{
  await db.exec(`RESET ROLE; SET ROLE ${role}`)
  await deniedSql(()=>db.query('SELECT * FROM fiscal_revisiones_homologacion'),/permission denied/)
  await deniedSql(()=>db.query('DELETE FROM fiscal_revisiones_homologacion'),/permission denied/)
  if(role!=='service_role')await deniedSql(()=>readReview(),/permission denied/)
})
it('una aprobación no se modifica ni elimina para prolongar su vigencia',async()=>{
  await review();await db.exec('RESET ROLE')
  await deniedSql(()=>db.query("UPDATE fiscal_revisiones_homologacion SET vence_en=vence_en+interval '1 second'"),/auditoría inmutable/)
  await deniedSql(()=>db.query('DELETE FROM fiscal_revisiones_homologacion'),/auditoría inmutable/)
})
it.each(['vencida','futura'])('revisión %s no autoriza TA aunque exista permiso privado',async mode=>{
  await allow('ok',false);await db.exec('RESET ROLE')
  await db.query(`WITH instante AS MATERIALIZED (SELECT clock_timestamp() t)
    INSERT INTO fiscal_revisiones_homologacion(id,operacion_id,usuario_id,solicitud_sha256,solicitud_revision,credencial_id,certificado_sha256,emisor_revision,creado_en,vence_en,actor_auth_id)
    SELECT $1,$2,$3,$4,1,$5,$6,1,t+($7::int*interval '1 minute'),t+($8::int*interval '1 minute'),$9 FROM instante`,
    [crypto.randomUUID(),op,owner,hash,credential,'a'.repeat(64),mode==='vencida'?-20:20,mode==='vencida'?-10:30,actor])
  await db.exec('SET ROLE service_role');const f=fixture();await expect(f.run()).rejects.toThrow()
  expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
})
it('cambiar emisor después de leer revisión impide consumo y revierte intención',async()=>{
  await allow();const f=fixture(),base=f.fetcher.getMockImplementation()!
  f.fetcher.mockImplementation(async(input,init)=>{
    const result=await base(input,init);await db.exec('RESET ROLE; UPDATE fiscal_emisores_homologacion SET revision=2; UPDATE fiscal_permisos_emision_homologacion SET emisor_revision=2; SET ROLE service_role')
    return result
  })
  await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1)
  expect(await state()).toEqual({estado:'RESERVADA',usado_por_intento:null})
})
it('rotar el emisor no reinterpreta un ACK de revisión anterior como aprobación nueva',async()=>{
  const id=crypto.randomUUID();await review(id);await db.exec('RESET ROLE; UPDATE fiscal_emisores_homologacion SET revision=2; SET ROLE service_role')
  expect((await readReview()).aprobacion).toBeNull()
  await deniedSql(()=>review(id),/Identidad de revisión/)
  expect((await review()).aprobada).toBe(true)
})
it('reasignar Auth del perfil no conserva como vigente la aprobación de otra identidad',async()=>{
  const id=crypto.randomUUID();await review(id);await db.exec('RESET ROLE')
  const replacement=crypto.randomUUID();await db.query('INSERT INTO auth.users VALUES($1)',[replacement])
  await db.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[replacement,owner]);await db.exec('SET ROLE service_role')
  await deniedSql(()=>readReview(),/no autorizada/)
  expect((await readReview(replacement)).aprobacion).toBeNull()
  await deniedSql(()=>review(id,hash,1,replacement),/Identidad de revisión/)
  expect((await review(crypto.randomUUID(),hash,1,replacement)).aprobada).toBe(true)
})
async function reassignAuth() {
  const replacement=crypto.randomUUID();await db.exec('RESET ROLE');await db.query('INSERT INTO auth.users VALUES($1)',[replacement])
  await db.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[replacement,owner]);await db.exec('SET ROLE service_role')
  return replacement
}
it('reasignación entre Auth y revisión no atribuye la petición anterior al nuevo acceso',async()=>{
  await allow();const f=fixture(),base=f.rpc.getMockImplementation()!
  f.rpc.mockImplementation(async(name,args)=>{const result=await base(name,args);if(name==='autorizar_consulta_fiscal_homologacion')await reassignAuth();return result})
  await expect(f.run()).rejects.toThrow();expect(f.getUser).toHaveBeenCalledTimes(1)
  expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
})
it('reasignación antes del envío no usa la aprobación válida de la cuenta nueva para la petición vieja',async()=>{
  await allow();const f=fixture(),base=f.fetcher.getMockImplementation()!
  f.fetcher.mockImplementation(async(input,init)=>{
    const result=await base(input,init),replacement=await reassignAuth()
    await review(crypto.randomUUID(),hash,1,replacement);return result
  })
  await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1)
  expect(await state()).toEqual({estado:'RESERVADA',usado_por_intento:null})
})
it('service_role no puede saltar el actor usando la entrada anterior de envío',async()=>{
  await allow()
  await deniedSql(()=>db.query('SELECT registrar_envio_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[op,crypto.randomUUID(),hash,permission]),/permission denied/)
})
