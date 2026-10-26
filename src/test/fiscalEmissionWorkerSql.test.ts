import { prepareFiscalData,requestFromPreparedFiscalData } from '../../supabase/functions/_shared/fiscalPreparation'
import { prepareFiscalPresentationFacts } from '../../supabase/functions/_shared/fiscalPresentation'
import type { FiscalPreparationContext } from '../../supabase/functions/_shared/fiscalPreparationContract'
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
let hash:string,canonical:string,presentationSha:string
beforeAll(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  const root='supabase/bootstrap'
  for(const file of [join(root,'001_domain.sql'),join(root,'002_identity_helpers.sql'),...readdirSync(join(root,'steps')).sort().map(n=>join(root,'steps',n)),join(root,'900_final_security.sql')])await db.exec(readFileSync(file,'utf8'))
  for(const file of ['commercial/001_commercial_subscription.sql','commercial/002_commercial_write_gate.sql','pilot-operations/001_capabilities.sql'])await db.exec(readFileSync(join(root,file),'utf8'))
  for(const file of readdirSync('supabase/pilot-fiscal').filter(n=>/^\d{3}_.*\.sql$/.test(n)).sort()){
    const sql=readFileSync(join('supabase/pilot-fiscal',file),'utf8');await db.exec(sql);await db.exec(sql)
  }
  await db.query('INSERT INTO auth.users VALUES($1)',[actor]);await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Emisión sintética')",[kid])
  const plan=crypto.randomUUID();await db.query("INSERT INTO planes(id,nombre,precio_mensual,max_usuarios) VALUES($1,'Ensayo fiscal',0,3)",[plan]);await db.query("INSERT INTO suscripciones(kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado) VALUES($1,$2,comercial_hoy(),comercial_hoy()+30,'ACTIVA')",[kid,plan])
  await db.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Dueño sintético','DUEÑO')",[owner,actor,kid])
  await db.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45)',[sale,kid,owner]);await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[actor])
  const product=crypto.randomUUID();await db.query('INSERT INTO productos(id,kiosco_id,descripcion,precio_venta) VALUES($1,$2,$3,123.45)',[product,kid,'Ensayo']);await db.query('INSERT INTO detalles_venta(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,1,123.45,123.45)',[sale,product])
},120000)
beforeEach(async()=>{
  await db.exec('BEGIN')
  await db.query(`INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado) VALUES($1,$2,2,$3,$4,true)`,[kid,wsfeSample.cuitEmisor,credential,'a'.repeat(64)])
  await db.exec(`INSERT INTO fiscal_parametros_homologacion(revision,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado)
   VALUES(1,'[{"id":5,"descripcion":"Ensayo","comprobantes":[11]}]','[]',repeat('b',64),clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true);
   SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true);`)
  const context=(await db.query<{data:FiscalPreparationContext}>('SELECT cargar_datos_preparacion_homologacion($1,$2) data',[actor,sale])).rows[0].data
  const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,numero:_n,...data}=wsfeSample
  const {total:_total,...importes}=data.importes
  const prepared=await prepareFiscalData(context,{condicionEmisor:'MONOTRIBUTO',datos:{...data,importes}})
  await db.query('SELECT guardar_datos_preparacion_homologacion($1,$2,$3,$4,$5)',[actor,sale,op,prepared.canonico,prepared.sha256])
  const frozen=await requestFromPreparedFiscalData(prepared,1);hash=frozen.sha256;canonical=await serializeFiscalRequest(frozen)
  await db.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[actor,op,canonical,hash])
  const source=(await db.query<{data:{lineas:{detalle_id:string}[]}}>('SELECT cargar_contexto_presentacion_homologacion($1,$2,$3) data',[actor,sale,op])).rows[0].data
  const facts=await prepareFiscalPresentationFacts({version:1,emisor:{razon_social:'Ensayo',domicilio_comercial:'Calle 1',ingresos_brutos:'Exento',inicio_actividades:'20200101'},receptor:{nombre:'Consumidor final',domicilio:'Sin identificar'},lineas:source.lineas.map(x=>({detalle_id:x.detalle_id,descripcion:'Ensayo'})),otros_impuestos_nacionales_indirectos:'0.00'})
  presentationSha=facts.sha256
  await db.query('SELECT guardar_presentacion_fiscal_homologacion($1,$2,$3,$4,$5,$6)',[actor,sale,op,hash,facts.canonico,facts.sha256])
})
afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE')})
afterAll(async()=>{await db.close()})
async function allow(mode='ok',reviewed=true) {
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,creado_en,vence_en)
    VALUES($1,$2,$3,$4,$5,$6,$7,clock_timestamp()-($8::int*interval '1 minute'),clock_timestamp()+($9::int*interval '1 minute'))`,
    [op,permission,mode==='hash'?'0'.repeat(64):hash,mode==='credencial'?crypto.randomUUID():credential,mode==='huella'?'b'.repeat(64):'a'.repeat(64),mode==='revision'?2:1,mode!=='deshabilitado',mode==='futuro'?-120:mode==='vencido'?120:0,mode==='futuro'?150:mode==='vencido'?-90:30])
  await db.exec('SET ROLE service_role')
  if(reviewed)await review()
}
const mapping:Record<string,string[]>={
  registrar_respuesta_emision_homologacion:['p_actor_auth_id','p_operacion_id','p_intento_id','p_sha','p_respuesta'],
  cargar_respuesta_emision_homologacion:['p_actor_auth_id','p_operacion_id','p_intento_id','p_sha'],
  autorizar_conciliacion_revisada_homologacion:['p_actor_auth_id','p_operacion_id'],
  registrar_conciliacion_revisada_homologacion:['p_actor_auth_id','p_binding','p_id','p_operacion_id','p_intento_id','p_sha','p_revision','p_decision'],
  autorizar_envio_presentado_homologacion:['p_actor_auth_id','p_operacion_id','p_sha','p_revision_id'],
  autorizar_consulta_fiscal_homologacion:['p_actor_auth_id','p_operacion_id'],cargar_preparacion_envio_homologacion:['p_operacion_id'],
  cargar_revision_fiscal_homologacion:['p_operacion_id','p_actor_auth_id'],aprobar_revision_fiscal_homologacion:['p_operacion_id','p_actor_auth_id','p_id','p_sha','p_revision'],
  registrar_envio_revisado_homologacion:['p_actor_auth_id','p_operacion_id','p_intento_id','p_sha','p_autorizacion_id','p_ultimo_autorizado','p_consultado_en'],
  consultar_reconciliacion_homologacion:['p_operacion_id','p_id'],cargar_contexto_conciliacion_homologacion:['p_operacion_id'],
  registrar_reconciliacion_fiscal_homologacion:['p_id','p_operacion_id','p_intento_id','p_sha','p_revision','p_decision'],
}
function fixture(){
  const flags:Record<string,string>={SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',ARCA_HOMO_BACKEND_ENABLED:'true',ARCA_HOMO_EMISSION_ENABLED:'true',ARCA_HOMO_RECONCILIATION_ENABLED:'true'}
  const rpc=vi.fn<FiscalAuthClient['rpc']>(async(name,args)=>{
    const names=mapping[name];if(!names)throw new Error('SYNTHETIC_UNEXPECTED_RPC')
    await db.exec('SAVEPOINT rpc_call')
    try {const r=await db.query<{data:unknown}>(`SELECT ${name}(${names.map((k,i)=>'$'+(i+1)+(['p_decision','p_respuesta','p_binding'].includes(k)?'::jsonb':'')).join(',')}) data`,names.map(k=>['p_decision','p_respuesta','p_binding'].includes(k)?JSON.stringify(args[k]):args[k]));await db.exec('RELEASE SAVEPOINT rpc_call');return {data:r.rows[0].data,error:null}}
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
  for(const patch of [{SUPABASE_URL:'https://lllkjnqpltnwvxzphncr.supabase.co'},{ARCA_HOMO_BACKEND_ENABLED:'false'},{ARCA_HOMO_EMISSION_ENABLED:'false'},{ARCA_HOMO_RECONCILIATION_ENABLED:'false'}]){
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
  return (await db.query<{ack:Record<string,unknown>}>('SELECT aprobar_revision_presentacion_homologacion($1,$2,$3,$4,$5,$6,$7) ack',[actorId,sale,op,id,sha,revision,presentationSha])).rows[0].ack
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
  expect(await review(id)).toEqual(ack);expect((await readReview()).aprobacion).toEqual((({presentacion_sha256:_sha,...base})=>base)(ack))
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
  await deniedSql(()=>review(id),/Identidad de revisión|Cambió el emisor/)
  await deniedSql(()=>review(),/Cambió el emisor/)
})
it('reasignar Auth del perfil no conserva como vigente la aprobación de otra identidad',async()=>{
  const id=crypto.randomUUID();await review(id);await db.exec('RESET ROLE')
  const replacement=crypto.randomUUID();await db.query('INSERT INTO auth.users VALUES($1)',[replacement])
  await db.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[replacement,owner]);await db.exec('SET ROLE service_role')
  await deniedSql(()=>readReview(),/no autorizada/)
  await deniedSql(()=>readReview(replacement),/Identidad de preparación/)
  await deniedSql(()=>review(id,hash,1,replacement),/Identidad de preparación|no autorizada/)
  await deniedSql(()=>review(crypto.randomUUID(),hash,1,replacement),/Identidad de preparación|no autorizada/)
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
it('reasignación antes del envío bloquea tanto aprobación nueva como petición vieja',async()=>{
  await allow();const f=fixture(),base=f.fetcher.getMockImplementation()!
  f.fetcher.mockImplementation(async(input,init)=>{
    const result=await base(input,init),replacement=await reassignAuth()
    await deniedSql(()=>review(crypto.randomUUID(),hash,1,replacement),/Identidad de preparación|no autorizada/);return result
  })
  await expect(f.run()).rejects.toThrow();expect(f.fetcher).toHaveBeenCalledTimes(1)
  expect(await state()).toEqual({estado:'RESERVADA',usado_por_intento:null})
})
it('service_role no puede saltar el actor usando la entrada anterior de envío',async()=>{
  await allow()
  await deniedSql(()=>db.query('SELECT registrar_envio_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[op,crypto.randomUUID(),hash,permission]),/permission denied/)
})

const auditRead=async(attempt:string,who=actor)=>(await db.query<{data:unknown}>('SELECT cargar_respuesta_emision_homologacion($1,$2,$3,$4) data',[who,op,attempt,hash])).rows[0].data
const auditWrite=async(attempt:string,response:unknown,who=actor,sha=hash)=>(await db.query<{data:unknown}>('SELECT registrar_respuesta_emision_homologacion($1,$2,$3,$4,$5::jsonb) data',[who,op,attempt,sha,JSON.stringify(response)])).rows[0].data
const rejection={estado:'RECHAZO_RECIBIDO',codigos:[10017],puedeReenviar:false}
async function intentOnly(attempt=crypto.randomUUID()){
 await allow();await db.query('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,0,clock_timestamp())',[actor,op,attempt,hash,permission]);return attempt
}
it('guarda recepción una sola vez y replay conserva auditoría sin liberar numeración',async()=>{
 const attempt=await intentOnly(),first=await auditWrite(attempt,rejection)
 expect(await auditWrite(attempt,rejection)).toEqual(first);expect(await auditRead(attempt)).toEqual(first)
 expect((await state()).estado).toBe('ENVIO_INCIERTO')
 await db.exec('RESET ROLE')
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_respuestas_emision_homologacion')).rows[0].n).toBe(1)
 for(const table of ['movimientos_stock','movimientos_caja'])expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
 await deniedSql(()=>db.query('UPDATE fiscal_respuestas_emision_homologacion SET respuesta=respuesta'),/inmutable/)
 await deniedSql(()=>db.query('DELETE FROM fiscal_respuestas_emision_homologacion'),/inmutable/)
})
it('respuesta contradictoria no reemplaza rechazo original',async()=>{
 const attempt=await intentOnly();await auditWrite(attempt,rejection)
 await deniedSql(()=>auditWrite(attempt,{...rejection,estado:'APROBACION_RECIBIDA'}),/contradictoria/)
 expect(await auditRead(attempt)).toMatchObject({respuesta:rejection})
})
it('sin intención consumida no se registra recepción y otro intento/hash/Auth no accede',async()=>{
 await allow();const attempt=crypto.randomUUID();await deniedSql(()=>auditWrite(attempt,rejection),/no autorizado/)
 await db.query('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,0,clock_timestamp())',[actor,op,attempt,hash,permission])
 await deniedSql(()=>auditWrite(crypto.randomUUID(),rejection),/no autorizado/)
 await deniedSql(()=>auditWrite(attempt,rejection,actor,'b'.repeat(64)),/no autorizado/)
 await deniedSql(()=>auditWrite(attempt,rejection,crypto.randomUUID()),/no autorizado/)
})
it.each(['anon','authenticated','service_role'])('tabla de recepción no admite acceso directo de %s',async role=>{
 const attempt=await intentOnly();await auditWrite(attempt,rejection);await db.exec(`RESET ROLE; SET ROLE ${role}`)
 await deniedSql(()=>db.query('SELECT * FROM fiscal_respuestas_emision_homologacion'),/permission denied/)
 await deniedSql(()=>db.query('UPDATE fiscal_respuestas_emision_homologacion SET respuesta=respuesta'),/permission denied/)
 if(role!=='service_role')await deniedSql(()=>auditRead(attempt),/permission denied/)
})
it.each([null,{}, {...rejection,puedeReenviar:true}, {...rejection,codigos:[0]}, {...rejection,codigos:[1.5]}, {...rejection,codigos:['10017']}, {...rejection,codigos:[2147483648]}, {...rejection,codigos:Array(201).fill(1)}, {...rejection,cae:'11111111111111'}])('SQL rechaza datos fuera del contrato de recepción %#',async response=>{
 const attempt=await intentOnly();await deniedSql(()=>auditWrite(attempt,response),/inválid|Demasiados/)
 expect(await auditRead(attempt)).toBeNull()
})
it('recepción tardía conserva Auth original aunque roten/revoquen emisor y perfil',async()=>{
 const attempt=await intentOnly(),replacement=await reassignAuth()
 await db.exec('RESET ROLE; UPDATE fiscal_emisores_homologacion SET habilitado=false,revision=2; UPDATE fiscal_permisos_emision_homologacion SET habilitado=false; SET ROLE service_role')
 expect(await auditWrite(attempt,rejection)).toMatchObject({respuesta:rejection})
 await deniedSql(()=>auditRead(attempt,replacement),/no autorizado/)
 expect((await state()).estado).toBe('ENVIO_INCIERTO')
})
it('worker conserva rechazo recibido y consulta completa sin permitir otro envío',async()=>{
 await allow();const f=fixture(),normal=f.fetcher.getMockImplementation()!,attempt=crypto.randomUUID()
 f.fetcher.mockImplementation(async(input,init)=>{
  const action=(input as Request).headers.get('SOAPAction')
  if(action?.includes('FECAESolicitar'))return new Response(wsfeReceipt('R').replace('</FECAEDetResponse>','<Observaciones><Obs><Code>10017</Code><Msg>SYNTHETIC_PRIVATE</Msg></Obs></Observaciones></FECAEDetResponse>'),{headers:{'Content-Type':'text/xml'}})
  if(action?.includes('FECompConsultar'))return new Response(wsfeSoap('FECompConsultar','<Errors><Err><Code>602</Code><Msg>Ensayo sin datos</Msg></Err></Errors>'),{headers:{'Content-Type':'text/xml'}})
  return normal(input,init)
 })
 const observation=crypto.randomUUID();expect((await f.run(attempt,observation)).estado).toBe('PENDIENTE_CONCILIACION')
 expect(await auditRead(attempt)).toMatchObject({respuesta:rejection});expect((await state()).estado).toBe('ENVIO_INCIERTO')
 await f.run(attempt,observation);expect(f.fetcher).toHaveBeenCalledTimes(3)
})
it('ACK de auditoría perdido recupera registro antes de confirmar resultado fiscal',async()=>{
 await allow();const f=fixture(),base=f.rpc.getMockImplementation()!,attempt=crypto.randomUUID()
 f.rpc.mockImplementation(async(name,args)=>{const r=await base(name,args);return name==='registrar_respuesta_emision_homologacion'?{data:null,error:new Error('SYNTHETIC_ACK_LOST')}:r})
 expect((await f.run(attempt)).estado).toBe('AUTORIZADA');expect(await auditRead(attempt)).toMatchObject({respuesta:{estado:'APROBACION_RECIBIDA'}})
 expect(f.fetcher).toHaveBeenCalledTimes(3)
})
it('ACK falso de auditoría no oculta la falta de registro, pero igual concilia CAE',async()=>{
 await allow();const f=fixture(),base=f.rpc.getMockImplementation()!,attempt=crypto.randomUUID()
 f.rpc.mockImplementation(async(name,args)=>name==='registrar_respuesta_emision_homologacion'?{data:{registrada:true},error:null}:base(name,args))
 await expect(f.run(attempt)).rejects.toThrow('FISCAL_RESPUESTA_NO_CONFIRMADA')
 expect((await state()).estado).toBe('AUTORIZADA');expect(f.fetcher).toHaveBeenCalledTimes(3);expect(await auditRead(attempt)).toBeNull()
})
it('timeout sin recepción no inventa rechazo ni aprobación, y concilia antes de continuar',async()=>{
 await allow();const f=fixture(),normal=f.fetcher.getMockImplementation()!,attempt=crypto.randomUUID()
 f.fetcher.mockImplementation((input,init)=>(input as Request).headers.get('SOAPAction')?.includes('FECAESolicitar')?Promise.reject(new Error('SYNTHETIC_LOST')):normal(input,init))
 expect((await f.run(attempt)).estado).toBe('AUTORIZADA');expect(await auditRead(attempt)).toBeNull()
 expect(f.fetcher).toHaveBeenCalledTimes(3)
})

it('recepción de rechazo y autorización posterior por consulta completa conservan ambas evidencias',async()=>{
 await allow();const f=fixture(),normal=f.fetcher.getMockImplementation()!,attempt=crypto.randomUUID()
 f.fetcher.mockImplementation((input,init)=>(input as Request).headers.get('SOAPAction')?.includes('FECAESolicitar')
  ?Promise.resolve(new Response(wsfeReceipt('R'),{headers:{'Content-Type':'text/xml'}})):normal(input,init))
 expect((await f.run(attempt)).estado).toBe('AUTORIZADA')
 expect(await auditRead(attempt)).toMatchObject({respuesta:{estado:'RECHAZO_RECIBIDO',codigos:[],puedeReenviar:false}})
 expect((await state()).estado).toBe('AUTORIZADA');expect(f.fetcher).toHaveBeenCalledTimes(3)
})

it.each(['actor','emisor'])('recuperación interna revalida %s después de TA sin emitir ni adoptar otra cuenta',async mode=>{
 const attempt=await intentOnly(),f=fixture(),load=f.load.getMockImplementation()!
 f.load.mockImplementation(async (b,signal)=>{
  const result=await load(b,signal)
  if(mode==='actor')await reassignAuth()
  else await db.exec('RESET ROLE; UPDATE fiscal_emisores_homologacion SET revision=2; SET ROLE service_role')
  return result
 })
 await expect(f.run(attempt)).rejects.toThrow('FISCAL_CONSULTA_NO_AUTORIZADA')
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.fetcher).not.toHaveBeenCalled();expect((await state()).estado).toBe('ENVIO_INCIERTO')
 for(const [name,args] of f.rpc.mock.calls)if(name==='autorizar_conciliacion_revisada_homologacion')expect(args.p_actor_auth_id).toBe(actor)
})
it('reasignación después del POST conserva respuesta del actor original y no concilia con la cuenta nueva',async()=>{
 await allow();const f=fixture(),original=f.fetcher.getMockImplementation()!,attempt=crypto.randomUUID()
 f.fetcher.mockImplementation(async(request,init)=>{
  const response=await original(request,init)
  if((request as Request).headers.get('SOAPAction')?.includes('FECAESolicitar'))await reassignAuth()
  return response
 })
 await expect(f.run(attempt)).rejects.toThrow('FISCAL_CONSULTA_NO_AUTORIZADA')
 expect(f.getUser).toHaveBeenCalledTimes(1)
 expect(f.fetcher.mock.calls.map(([r])=>(r as Request).headers.get('SOAPAction'))).toEqual(['"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"','"http://ar.gov.afip.dif.FEV1/FECAESolicitar"'])
 expect(await auditRead(attempt)).toMatchObject({respuesta:{estado:'APROBACION_RECIBIDA'}})
 expect((await state()).estado).toBe('ENVIO_INCIERTO')
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_autorizaciones_homologacion')).rows[0].n).toBe(0)
})
it('worker usa sólo registro ligado en conciliación y recupera ACK perdido sin otra consulta',async()=>{
 await allow();const f=fixture(),original=f.rpc.getMockImplementation()!,attempt=crypto.randomUUID(),observation=crypto.randomUUID()
 f.rpc.mockImplementation(async(name,args)=>{
  if(name==='registrar_reconciliacion_fiscal_homologacion')throw new Error('UNBOUND_WRITE_FORBIDDEN')
  const result=await original(name,args)
  return name==='registrar_conciliacion_revisada_homologacion'?{data:null,error:new Error('SYNTHETIC_ACK_LOST')}:result
 })
 const result=await f.run(attempt,observation);expect(result.estado).toBe('AUTORIZADA')
 const writes=f.rpc.mock.calls.filter(([name])=>name==='registrar_conciliacion_revisada_homologacion')
 expect(writes).toHaveLength(1);expect(writes[0][1]).toMatchObject({p_actor_auth_id:actor,p_id:observation,p_binding:{operacion_id:op,credencial_id:credential,revision:1}})
 f.flags.ARCA_HOMO_EMISSION_ENABLED='false';f.flags.ARCA_HOMO_RECONCILIATION_ENABLED='false'
 expect(await f.run(attempt,observation)).toEqual(result);expect(f.fetcher).toHaveBeenCalledTimes(3)
 expect(f.getUser).toHaveBeenCalledTimes(2)
})
it('recuperación interna con gate de consulta cerrado conserva intención y no lee TA',async()=>{
 const attempt=await intentOnly(),f=fixture();delete f.flags.ARCA_HOMO_RECONCILIATION_ENABLED
 await expect(f.run(attempt)).rejects.toThrow('FISCAL_CONCILIACION_NO_HABILITADA')
 expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled();expect((await state()).estado).toBe('ENVIO_INCIERTO')
})


it.each(['missing','extra','body','revision','error'])('guard previo a TA %s no permite transporte ni intención',async mode=>{
 await allow();const f=fixture(),base=f.rpc.getMockImplementation()!
 f.rpc.mockImplementation(async(name,args)=>{
  const r=await base(name,args);if(name!=='autorizar_envio_presentado_homologacion')return r
  const value=r.data as Record<string,unknown>
  return mode==='error'?{data:null,error:new Error('SYNTHETIC_GUARD_ERROR')}:{data:mode==='missing'?null:{...value,...(mode==='extra'?{extra:true}:mode==='body'?{solicitud_sha256:'b'.repeat(64)}:{revision_id:crypto.randomUUID()})},error:null}
 })
 await expect(f.run()).rejects.toThrow();expect(f.load).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
 expect(await state()).toEqual({estado:'RESERVADA',usado_por_intento:null})
})
