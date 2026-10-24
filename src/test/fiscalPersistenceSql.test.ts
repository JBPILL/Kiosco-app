// @vitest-environment node
// PostgreSQL embebido: no acredita permisos JWT ni concurrencia hospedados.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest'
import { freezeFiscalRequest, serializeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import { reconcilePersistedFiscalVoucher } from '../../supabase/functions/_shared/fiscalPersistence'
import type { FiscalRpc } from '../../supabase/functions/_shared/fiscalPersistence'
import { reconcileAuthorizedFiscalVoucher } from '../../supabase/functions/_shared/fiscalAuthorizedReconciliation'
import { createFiscalTicketCache } from '../../supabase/functions/_shared/fiscalTicketCache'
import type { WsaaTicketLoader } from '../../supabase/functions/_shared/fiscalTicketCache'
import { createSharedFiscalTicketLoader } from '../../supabase/functions/_shared/fiscalSharedTickets'
import { authorizeFiscalWorker } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import type { GuardedWsaaTicketLoader } from '../../supabase/functions/_shared/fiscalWsaa'
import { createWsaaTicketSource } from '../../supabase/functions/_shared/fiscalWsaa'
import { syntheticEncryptedCustody } from './fixtures/fiscalEncryptedCustody'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp'
import { createFiscalSupabaseAdmin, FISCAL_STAGING_URL } from '../../supabase/functions/_shared/fiscalSupabaseAdmin'
import { createPrivateFiscalCustody, createPrivateFiscalTicketKeys } from '../../supabase/functions/_shared/fiscalPrivateCustody'

const db = new PGlite()
const kid=randomUUID(), auth=randomUUID(), owner=randomUUID(), sale=randomUUID(), op=randomUUID(), attempt=randomUUID()
const context={version:1,cuit_emisor:'20123456786',punto_venta:2,tipo_comprobante:11,tipo_doc_receptor:99,nro_doc_receptor:'0'}
const sample={version:1,entorno:'HOMOLOGACION',cuitEmisor:'20123456786',puntoVenta:2,tipoComprobante:11,numero:1,
  concepto:1,tipoDocumento:99,numeroDocumento:'0',condicionIvaReceptor:5,fecha:'20261021',
  servicioDesde:null,servicioHasta:null,vencimientoPago:null,moneda:'PES',cotizacion:'1',
  importes:{total:'123.45',neto:'123.45',iva:'0',noGravado:'0',exento:'0',tributos:'0'},iva:[],tributos:[]}
let canonical: string, digest: string
beforeAll(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  const root='supabase/bootstrap'
  for(const file of [join(root,'001_domain.sql'),join(root,'002_identity_helpers.sql'),
    ...readdirSync(join(root,'steps')).sort().map(name=>join(root,'steps',name)),join(root,'900_final_security.sql')]) {
    await db.exec(readFileSync(file,'utf8'))
  }
  for(const file of ['001_fiscal_journal.sql','002_fiscal_reservations.sql','003_fiscal_requests.sql','004_fiscal_reconciliation.sql','005_fiscal_worker_authorization.sql','006_fiscal_shared_tickets.sql','007_fiscal_ticket_recovery.sql','008_fiscal_ticket_ownership.sql','020_fiscal_reconciliation_actor.sql']) {
    const sql=readFileSync(join('supabase/pilot-fiscal',file),'utf8')
    await db.exec(sql); await db.exec(sql)
  }
  await db.query('INSERT INTO auth.users VALUES($1)',[auth])
  await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Ensayo fiscal')",[kid])
  await db.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Dueño','DUEÑO')",[owner,auth,kid])
  await db.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45)',[sale,kid,owner])
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[auth])
  const frozen=await freezeFiscalRequest(sample)
  canonical=await serializeFiscalRequest(frozen); digest=frozen.sha256
},120_000)
beforeEach(async()=>{
  await db.exec('BEGIN; SET ROLE authenticated')
  await db.query('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb)',[op,kid,sale,JSON.stringify(context)])
  await db.exec("RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true)")
})
afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE')})
afterAll(async()=>{await db.close()})
async function persist(body=canonical,hash=digest) {
  return (await db.query<{ack:Record<string,unknown>}>(`SELECT persistir_solicitud_fiscal_homologacion($1,$2,$3,0,clock_timestamp()) ack`,[op,body,hash])).rows[0].ack
}
async function intent(id=attempt) {
  return (await db.query<{ack:Record<string,unknown>}>('SELECT registrar_intento_fiscal_homologacion($1,$2) ack',[op,id])).rows[0].ack
}
async function denied(action:()=>Promise<unknown>) {
  await db.exec('SAVEPOINT denied'); await expect(action()).rejects.toThrow()
  await db.exec('ROLLBACK TO SAVEPOINT denied; RELEASE SAVEPOINT denied')
}
function hash(text:string) {return createHash('sha256').update(text).digest('hex')}
it('persiste cuerpo y reserva atómicos con SHA nativo compatible con el contrato',async()=>{
  expect(hash(canonical)).toBe(digest)
  const ack=await persist()
  expect(ack).toMatchObject({operacion_id:op,numero:1,estado:'RESERVADA',solicitud_sha256:digest,revision:1,emision_habilitada:false})
  expect(await persist()).toEqual(ack)
  await db.exec('RESET ROLE')
  expect((await db.query('SELECT cuerpo_canonico,solicitud_sha256 FROM fiscal_solicitudes_homologacion')).rows)
    .toEqual([{cuerpo_canonico:canonical,solicitud_sha256:digest}])
  for(const table of ['pagos_venta','movimientos_stock','movimientos_caja','checkout_manuales']) {
    expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  }
})
it('requiere cuerpo durable antes de registrar intención y conserva un único intento',async()=>{
  await denied(()=>intent())
  await persist()
  expect(await intent()).toMatchObject({nuevo_intento:true,solicitud_sha256:digest,revision:1})
  expect(await intent()).toMatchObject({nuevo_intento:false,requiere_conciliacion:true})
  await denied(()=>intent(randomUUID()))
})
it('rechaza sustitución del cuerpo incluso con hash correcto',async()=>{
  await persist()
  const other=canonical.replace('20261021','20261020')
  await denied(()=>persist(other,hash(other)))
  expect((await persist()).solicitud_sha256).toBe(digest)
})
it.each(['hash','numero','total','contexto','fecha','extra','decimal','iva','tipoTexto'])('rechaza %s sin reservar número',async mode=>{
  const body=JSON.parse(canonical)
  if(mode==='numero')body.numero=2
  if(mode==='total'){body.importes.total='124.45';body.importes.neto='124.45'}
  if(mode==='contexto')body.puntoVenta=3
  if(mode==='fecha')body.fecha='20260230'
  if(mode==='extra')body.token='no-admitido'
  if(mode==='decimal')body.importes.total='123,45'
  if(mode==='iva')body.importes.iva='1.00'
  if(mode==='tipoTexto')body.numeroDocumento=0
  const text=JSON.stringify(body)
  await denied(()=>persist(text,mode==='hash'?'0'.repeat(64):hash(text)))
  await db.exec('RESET ROLE')
  for(const table of ['fiscal_series_homologacion','fiscal_reservas_homologacion','fiscal_solicitudes_homologacion']) {
    expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  }
})
it('el replay tras perder el ACK conserva cuerpo, hash y número',async()=>{
  const first=await persist()
  await intent()
  // El consumidor perdió ambas respuestas: recupera la misma identidad durable.
  expect(await persist()).toMatchObject({...first,estado:'ENVIO_INCIERTO'})
  expect(await intent()).toMatchObject({nuevo_intento:false,requiere_conciliacion:true})
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_solicitudes_homologacion')).rows[0].n).toBe(1)
  expect((await db.query<{ultimo_observado:number}>('SELECT ultimo_observado FROM fiscal_series_homologacion')).rows[0].ultimo_observado).toBe(0)
})
it('no confunde claim de servicio con permiso SQL de ejecución',async()=>{
  await db.exec('RESET ROLE; SET ROLE authenticated')
  await denied(()=>persist())
  await db.exec("RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claim.role','authenticated',true)")
  await denied(()=>persist())
})
it('conserva la operación al iniciar otra transacción después del commit',async()=>{
  await persist(); await intent(); await db.exec('COMMIT; RESET ROLE')
  // Nueva transacción representa otra conexión del trabajador; PGlite es monoconexión.
  await db.exec("BEGIN; SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true)")
  expect(await intent()).toMatchObject({nuevo_intento:false,requiere_conciliacion:true,solicitud_sha256:digest})
  // Limpieza explícita del único caso que confirmó datos fuera del rollback por prueba.
  await db.exec('RESET ROLE')
  await db.query('DELETE FROM fiscal_solicitudes_homologacion WHERE operacion_id=$1',[op])
  await db.query('DELETE FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[op])
  await db.exec('DELETE FROM fiscal_series_homologacion')
  await db.query('DELETE FROM fiscal_operaciones_homologacion WHERE id=$1',[op])
  await db.exec('COMMIT; BEGIN')
})
it.each(['anon','authenticated','service_role'])('no permite lectura ni escritura directa a %s',async role=>{
  await persist()
  await db.exec(`RESET ROLE; SET ROLE ${role}`)
  await denied(()=>db.exec('SELECT * FROM fiscal_solicitudes_homologacion'))
  await denied(()=>db.exec('DELETE FROM fiscal_solicitudes_homologacion'))
  if(role!=='service_role')await denied(()=>persist())
})
it('el CHECK rechaza explícitamente un intento sin hash aunque lo escriba el propietario SQL',async()=>{
  await persist(); await intent(); await db.exec('RESET ROLE')
  await denied(()=>db.exec('UPDATE fiscal_reservas_homologacion SET solicitud_sha256=NULL'))
})
it.each(['solicitud','vinculo'])('revierte todo si un trigger omite %s',async mode=>{
  await db.exec('RESET ROLE')
  await db.exec(`CREATE FUNCTION omitir_fiscal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir BEFORE ${mode==='solicitud'?'INSERT ON fiscal_solicitudes_homologacion':'UPDATE ON fiscal_reservas_homologacion'}
    FOR EACH ROW EXECUTE FUNCTION omitir_fiscal(); SET ROLE service_role`)
  await denied(()=>persist())
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(0)
})

const positive=()=>({estado:'AUTORIZACION_COINCIDENTE',cae:'11111111111111',vencimiento:'20261031',procesadoEn:'20261021120000',solicitudSha256:digest,puedeReenviar:false})
const pending={estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false}
async function reconcile(decision:unknown=positive(),id=randomUUID(),revision=1,sha=digest,intento=attempt) {
  return (await db.query<{ack:Record<string,unknown>}>(
    'SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,$5,$6::jsonb) ack',
    [id,op,intento,sha,revision,JSON.stringify(decision)])).rows[0].ack
}
it('guarda CAE una vez, conserva reserva histórica y no repite efectos comerciales',async()=>{
  await persist(); await intent()
  const id=randomUUID(),ack=await reconcile(positive(),id)
  expect(ack).toMatchObject({estado:'AUTORIZADA',numero:1,revision:2,cae:'11111111111111',solicitud_sha256:digest,emision_habilitada:false})
  expect(await reconcile(positive(),id)).toEqual(ack)
  expect(await reconcile()).toEqual(ack)
  expect(await reconcile(pending)).toEqual(ack)
  expect(await persist()).toMatchObject({estado:'AUTORIZADA',revision:2})
  await denied(()=>intent())
  await denied(()=>reconcile({...positive(),cae:'22222222222222'}))
  await db.exec('RESET ROLE')
  expect((await db.query<{ultimo_observado:number}>('SELECT ultimo_observado FROM fiscal_series_homologacion')).rows[0].ultimo_observado).toBe(1)
  expect((await db.query<{estado:string}>('SELECT estado FROM fiscal_reservas_homologacion')).rows[0].estado).toBe('AUTORIZADA')
  for(const table of ['pagos_venta','movimientos_stock','movimientos_caja'])expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  await denied(()=>db.query('UPDATE ventas SET total=999 WHERE id=$1',[sale]))
})
it('una respuesta incierta no libera la serie y el replay conserva su resultado histórico',async()=>{
  await persist(); await intent()
  const id=randomUUID(),ack=await reconcile(pending,id)
  expect(ack).toMatchObject({estado:'PENDIENTE_CONCILIACION',revision:1})
  await denied(()=>reconcile(positive(),id))
  await reconcile()
  expect(await reconcile(pending,id)).toEqual(ack)
})
it('después de autorización durable la próxima venta reserva el siguiente número',async()=>{
  await persist(); await intent(); await reconcile()
  await db.exec('RESET ROLE')
  const nextSale=randomUUID(),nextOp=randomUUID()
  await db.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45)',[nextSale,kid,owner])
  await db.exec('SET ROLE authenticated')
  await db.query('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb)',[nextOp,kid,nextSale,JSON.stringify(context)])
  await db.exec('RESET ROLE; SET ROLE service_role')
  const text=await serializeFiscalRequest(await freezeFiscalRequest({...sample,numero:2}))
  const result=await db.query<{ack:{numero:number}}>('SELECT persistir_solicitud_fiscal_homologacion($1,$2,$3,1,clock_timestamp()) ack',[nextOp,text,hash(text)])
  expect(result.rows[0].ack.numero).toBe(2)
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(2)
})
it.each(['hash','intento','revision','cae','fecha','proceso','extra','reenviar','codigo'])('rechaza conciliación %s',async mode=>{
  await persist(); await intent()
  const decision:Record<string,unknown>=positive()
  if(mode==='cae')decision.cae='00000000000000'
  if(mode==='fecha')decision.vencimiento='20260230'
  if(mode==='proceso')decision.procesadoEn='20261021256000'
  if(mode==='extra')decision.token='no-admitido'
  if(mode==='reenviar')decision.puedeReenviar=true
  if(mode==='codigo'){decision.estado='CONCILIAR';decision.codigo='no-admitido'}
  await denied(()=>reconcile(decision,randomUUID(),mode==='revision'?2:1,mode==='hash'?'0'.repeat(64):digest,mode==='intento'?randomUUID():attempt))
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_autorizaciones_homologacion')).rows[0].n).toBe(0)
})
it.each(['anon','authenticated','service_role'])('protege evidencia de conciliación de lectura/DML %s',async role=>{
  await persist(); await intent(); await reconcile()
  await db.exec(`RESET ROLE; SET ROLE ${role}`)
  for(const table of ['fiscal_autorizaciones_homologacion','fiscal_reconciliaciones_homologacion']) {
    await denied(()=>db.exec(`SELECT * FROM ${table}`)); await denied(()=>db.exec(`DELETE FROM ${table}`))
  }
  if(role!=='service_role')await denied(()=>reconcile())
})
it.each(['fiscal_autorizaciones_homologacion','fiscal_series_homologacion','fiscal_reservas_homologacion','fiscal_solicitudes_homologacion','fiscal_reconciliaciones_homologacion'])('revierte cierre completo si se omite escritura en %s',async table=>{
  await persist(); await intent(); await db.exec('RESET ROLE')
  const event=table==='fiscal_autorizaciones_homologacion'||table==='fiscal_reconciliaciones_homologacion'?'INSERT':'UPDATE'
  await db.exec(`CREATE FUNCTION omitir_cierre() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir BEFORE ${event} ON ${table} FOR EACH ROW EXECUTE FUNCTION omitir_cierre(); SET ROLE service_role`)
  await denied(()=>reconcile())
  await db.exec('RESET ROLE')
  expect((await db.query<{estado:string}>('SELECT estado FROM fiscal_reservas_homologacion')).rows[0].estado).toBe('ENVIO_INCIERTO')
  expect((await db.query<{revision:number}>('SELECT revision FROM fiscal_solicitudes_homologacion')).rows[0].revision).toBe(1)
  expect((await db.query<{ultimo_observado:number}>('SELECT ultimo_observado FROM fiscal_series_homologacion')).rows[0].ultimo_observado).toBe(0)
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_autorizaciones_homologacion')).rows[0].n).toBe(0)
})

const persistedRpc: FiscalRpc={async rpc(name,args){
  const allowed:Record<string,string[]>={
    autorizar_consulta_fiscal_homologacion:['p_actor_auth_id','p_operacion_id'],
    autorizar_conciliacion_revisada_homologacion:['p_actor_auth_id','p_operacion_id'],
    registrar_conciliacion_revisada_homologacion:['p_actor_auth_id','p_binding','p_id','p_operacion_id','p_intento_id','p_sha','p_revision','p_decision'],
    solicitar_ta_homologacion:['p_operacion_id','p_credencial_id','p_huella','p_revision','p_intento_id'],
    iniciar_envio_ta_homologacion:['p_operacion_id','p_credencial_id','p_huella','p_revision','p_intento_id','p_generacion'],
    cancelar_preparacion_ta_homologacion:['p_operacion_id','p_credencial_id','p_huella','p_revision','p_intento_id','p_generacion'],
    consultar_preparacion_ta_homologacion:['p_operacion_id','p_credencial_id','p_huella','p_revision'],
    confirmar_ta_homologacion:['p_operacion_id','p_credencial_id','p_huella','p_revision','p_intento_id','p_generacion','p_cifrado'],
    consultar_reconciliacion_homologacion:['p_operacion_id','p_id'],
    cargar_contexto_conciliacion_homologacion:['p_operacion_id'],
    registrar_reconciliacion_fiscal_homologacion:['p_id','p_operacion_id','p_intento_id','p_sha','p_revision','p_decision'],
  }
  const keys=allowed[name]; if(!keys)throw new Error('RPC no permitida en fixture')
  const isJson=(key:string)=>key==='p_decision'||key==='p_cifrado'||key==='p_binding'
  const values=keys.map(key=>isJson(key)?JSON.stringify(args[key]):args[key])
  const placeholders=keys.map((key,index)=>'$'+(index+1)+(isJson(key)?'::jsonb':''))
  const result=await db.query<{ack:unknown}>(`SELECT ${name}(${placeholders.join(',')}) ack`,values)
  return {data:result.rows[0].ack,error:null}
}}
const ticket=()=>({token:'SYNTHETIC_TOKEN',sign:'SYNTHETIC_SIGN',expiresAt:Date.now()+120000})
function fiscalXml() {
  const values={Concepto:1,DocTipo:99,DocNro:0,CbteDesde:1,CbteHasta:1,CbteFch:'20261021',
    ImpTotal:'123.45',ImpTotConc:0,ImpNeto:'123.45',ImpOpEx:0,ImpTrib:0,ImpIVA:0,
    FchServDesde:'',FchServHasta:'',FchVtoPago:'',MonId:'PES',MonCotiz:1,CanMisMonExt:'N',CondicionIVAReceptorId:5,
    Resultado:'A',CodAutorizacion:'11111111111111',EmisionTipo:'CAE',FchVto:'20261031',FchProceso:'20261021120000',PtoVta:2,CbteTipo:11}
  return '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult><ResultGet>'+
    Object.entries(values).map(([key,value])=>`<${key}>${value}</${key}>`).join('')+
    '</ResultGet></FECompConsultarResult></FECompConsultarResponse></s:Body></s:Envelope>'
}
it('integra SOAP mock, comparación y SQL: recuperar ACK perdido no consulta otra vez',async()=>{
  await persist(); await intent()
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(fiscalXml(),{headers:{'Content-Type':'text/xml'}}))
  let lost=true
  const connection: FiscalRpc={async rpc(name,args){
    const result=await persistedRpc.rpc(name,args)
    if(name==='registrar_reconciliacion_fiscal_homologacion' && lost){lost=false;throw new Error('SYNTHETIC_ACK_LOST')}
    return result
  }}
  const id=randomUUID()
  const ack=await reconcilePersistedFiscalVoucher(connection,op,id,ticket(),fetcher)
  expect(await reconcilePersistedFiscalVoucher(connection,op,id,ticket(),fetcher)).toEqual(ack)
  expect(ack.estado).toBe('AUTORIZADA');expect(fetcher).toHaveBeenCalledTimes(1)
  expect(await reconcilePersistedFiscalVoucher(connection,op,randomUUID(),ticket(),fetcher)).toEqual(ack)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('integra fallo de transporte: persiste pendiente, replay sin red y nueva observación permite consultar',async()=>{
  await persist(); await intent()
  const fetcher=vi.fn<typeof fetch>(async()=>{throw new Error('SYNTHETIC_NETWORK')})
  const id=randomUUID()
  const ack=await reconcilePersistedFiscalVoucher(persistedRpc,op,id,ticket(),fetcher)
  expect(ack.estado).toBe('PENDIENTE_CONCILIACION')
  expect(await reconcilePersistedFiscalVoucher(persistedRpc,op,id,ticket(),fetcher)).toEqual(ack)
  expect(fetcher).toHaveBeenCalledTimes(1)
  await reconcilePersistedFiscalVoucher(persistedRpc,op,randomUUID(),ticket(),fetcher)
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it('el orquestador rechaza ACK de otra operación y errores sin filtrar contenido',async()=>{
  const fetcher=vi.fn<typeof fetch>()
  const bad: FiscalRpc={async rpc(){return {data:{operacion_id:randomUUID()},error:null}}}
  await expect(reconcilePersistedFiscalVoucher(bad,op,randomUUID(),ticket(),fetcher)).rejects.toThrow('FISCAL_PERSISTENCIA_NO_CONFIRMADA')
  const unavailable: FiscalRpc={async rpc(){throw new Error('SYNTHETIC_PRIVATE_CONTENT')}}
  await expect(reconcilePersistedFiscalVoucher(unavailable,op,randomUUID(),ticket(),fetcher)).rejects.toThrow('FISCAL_PERSISTENCIA_NO_CONFIRMADA')
  expect(fetcher).not.toHaveBeenCalled()
})
it.each(['anon','authenticated'])('getters privados no exponen cuerpo fiscal a %s',async role=>{
  await persist(); await intent();await db.exec(`RESET ROLE; SET ROLE ${role}`)
  await denied(()=>db.query('SELECT cargar_contexto_conciliacion_homologacion($1)',[op]))
  await denied(()=>db.query('SELECT consultar_reconciliacion_homologacion($1,$2)',[op,randomUUID()]))
})

it.each(['fiscal_autorizaciones_homologacion','fiscal_reconciliaciones_homologacion'])('rechaza confirmación falsa si trigger cambia datos de %s',async table=>{
  await persist(); await intent(); await db.exec('RESET ROLE')
  const mutation=table==='fiscal_autorizaciones_homologacion'?"NEW.cae:='22222222222222';":"NEW.solicitud_sha256:=repeat('0',64);"
  await db.exec(`CREATE FUNCTION cambiar_cierre() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN ${mutation} RETURN NEW; END $$;
    CREATE TRIGGER cambiar BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION cambiar_cierre(); SET ROLE service_role`)
  await denied(()=>reconcile())
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_autorizaciones_homologacion')).rows[0].n).toBe(0)
})
it('no confirma sin intención y rechaza campos obligatorios ausentes',async()=>{
  await persist();await denied(()=>reconcile());await intent()
  const missing={...positive()} as Record<string,unknown>;delete missing.procesadoEn
  await denied(()=>reconcile(missing))
})

async function provisionEmitter(fingerprint='a'.repeat(64)) {
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado)
    VALUES($1,'20123456786',2,$2,$3,true)`,[kid,randomUUID(),fingerprint])
  await db.exec('SET ROLE service_role')
}
async function authorize(actor=auth,operation=op) {
  return (await db.query<{ack:Record<string,unknown>}>('SELECT autorizar_consulta_fiscal_homologacion($1,$2) ack',[actor,operation])).rows[0].ack
}
it('requiere emisor privado: configuración propuesta no concede acceso a credenciales',async()=>{
  await denied(()=>authorize())
  await provisionEmitter()
  expect(await authorize()).toMatchObject({version:1,entorno:'HOMOLOGACION',servicio:'wsfe',operacion_id:op,kiosco_id:kid,usuario_id:owner,cuit_emisor:'20123456786',punto_venta:2,revision:1})
})
it.each(['punto','cuit','deshabilitado','rol','superadmin','inactivo','suspendido','otro_actor','otra_operacion'])('rechaza gate privado %s',async mode=>{
  await provisionEmitter();await db.exec('RESET ROLE')
  if(mode==='punto')await db.exec('UPDATE fiscal_emisores_homologacion SET punto_venta=3')
  if(mode==='cuit')await db.exec("UPDATE fiscal_emisores_homologacion SET cuit_emisor='30123456789'")
  if(mode==='deshabilitado')await db.exec('UPDATE fiscal_emisores_homologacion SET habilitado=false')
  if(mode==='rol')await db.query("UPDATE usuarios SET rol='CAJERO' WHERE id=$1",[owner])
  if(mode==='superadmin')await db.query('UPDATE usuarios SET es_superadmin=true,kiosco_id=NULL WHERE id=$1',[owner])
  if(mode==='inactivo')await db.query('UPDATE usuarios SET activo=false WHERE id=$1',[owner])
  if(mode==='suspendido')await db.query("UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id=$1",[kid])
  await db.exec('SET ROLE service_role')
  await denied(()=>authorize(mode==='otro_actor'?randomUUID():auth,mode==='otra_operacion'?randomUUID():op))
})
it.each(['anon','authenticated','service_role'])('metadatos del emisor privados para %s',async role=>{
  await provisionEmitter();await db.exec(`RESET ROLE; SET ROLE ${role}`)
  await denied(()=>db.exec('SELECT * FROM fiscal_emisores_homologacion'))
  await denied(()=>db.exec('UPDATE fiscal_emisores_homologacion SET habilitado=true'))
  if(role!=='service_role')await denied(()=>authorize())
})

it('composición privada verifica actor/emisor antes de custodia y no renueva TA al recuperar ACK',async()=>{
  await persist();await intent()
  const admin={...persistedRpc,auth:{async getUser(){return {data:{user:{id:auth}},error:null}}}}
  const load=vi.fn<WsaaTicketLoader>(async b=>({entorno:'HOMOLOGACION',servicio:'wsfe',cuitEmisor:b.cuit_emisor,
    credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_TOKEN',sign:'SYNTHETIC_SIGN',expiresAt:Date.now()+120000}))
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(fiscalXml(),{headers:{'Content-Type':'text/xml'}}))
  const cache=createFiscalTicketCache(),id=randomUUID()
  await denied(()=>reconcileAuthorizedFiscalVoucher(admin,'SYNTHETIC_JWT',op,id,cache,load,fetcher))
  expect(load).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()
  await provisionEmitter()
  const ack=await reconcileAuthorizedFiscalVoucher(admin,'SYNTHETIC_JWT',op,id,cache,load,fetcher)
  expect(ack.estado).toBe('AUTORIZADA')
  expect(await reconcileAuthorizedFiscalVoucher(admin,'SYNTHETIC_JWT',op,id,cache,load,fetcher)).toEqual(ack)
  expect(load).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(1)
  expect(JSON.stringify(ack)).not.toContain('SYNTHETIC')
})

it('comparte sólo TA cifrado entre dos cachés y recupera ACK perdido sin renovar WSAA',async()=>{
  await provisionEmitter()
  const admin={...persistedRpc,auth:{async getUser(){return {data:{user:{id:auth}},error:null}}}}
  const binding=await authorizeFiscalWorker(admin,'SYNTHETIC_JWT',op)
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),keyId=randomUUID()
  const keys={async active(){return {id:keyId,key}},async read(id:string){expect(id).toBe(keyId);return key}}
  const source=vi.fn<GuardedWsaaTicketLoader>(async(b,_signal,send)=>{await send();return {entorno:'HOMOLOGACION',servicio:'wsfe',cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,
    certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_SHARED_TOKEN',sign:'SYNTHETIC_SHARED_SIGN',expiresAt:Date.now()+120000}})
  let lose=true
  const dbLost: FiscalRpc={async rpc(name,args){const result=await persistedRpc.rpc(name,args)
    if(name==='confirmar_ta_homologacion'&&lose){lose=false;throw new Error('SYNTHETIC_ACK_LOST')}return result}}
  await expect(createFiscalTicketCache().get(binding,createSharedFiscalTicketLoader(dbLost,keys,source)))
    .rejects.toThrow('FISCAL_TICKET_NO_DISPONIBLE')
  const loaded=await createFiscalTicketCache().get(binding,createSharedFiscalTicketLoader(persistedRpc,keys,source))
  expect(loaded.token).toBe('SYNTHETIC_SHARED_TOKEN');expect(source).toHaveBeenCalledTimes(1)
  await db.exec('RESET ROLE')
  const rows=(await db.query<{cifrado:unknown}>('SELECT cifrado FROM fiscal_ta_homologacion')).rows
  expect(JSON.stringify(rows)).not.toContain('SYNTHETIC_SHARED')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_ta_intentos_homologacion')).rows[0].n).toBe(1)
})
it('renovación incierta no se libera por otro trabajador ni por reintento',async()=>{
  await provisionEmitter()
  const admin={...persistedRpc,auth:{async getUser(){return {data:{user:{id:auth}},error:null}}}}
  const binding=await authorizeFiscalWorker(admin,'SYNTHETIC_JWT',op)
  const source=vi.fn<GuardedWsaaTicketLoader>(async(_b,_signal,send)=>{await send();throw new Error('SYNTHETIC_WSAA_TIMEOUT')})
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),keyId=randomUUID()
  const keys={async active(){return {id:keyId,key}},async read(){return key}}
  const loader=createSharedFiscalTicketLoader(persistedRpc,keys,source)
  await expect(createFiscalTicketCache().get(binding,loader)).rejects.toThrow('FISCAL_TICKET_NO_DISPONIBLE')
  await expect(createFiscalTicketCache().get(binding,loader)).rejects.toThrow('FISCAL_TICKET_NO_DISPONIBLE')
  expect(source).toHaveBeenCalledTimes(1)
})
it.each(['anon','authenticated','service_role'])('TA compartido sin acceso directo para %s',async role=>{
  await db.exec(`RESET ROLE; SET ROLE ${role}`)
  for(const table of ['fiscal_ta_homologacion','fiscal_ta_intentos_homologacion']){
    await denied(()=>db.exec(`SELECT * FROM ${table}`));await denied(()=>db.exec(`DELETE FROM ${table}`))
  }
})

it('cifra y conserva un TA válido recibido después de abort del consumidor',async()=>{
  await provisionEmitter()
  const admin={...persistedRpc,auth:{async getUser(){return {data:{user:{id:auth}},error:null}}}}
  const binding=await authorizeFiscalWorker(admin,'SYNTHETIC_JWT',op),controller=new AbortController()
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),keyId=randomUUID()
  const keys={async active(){return {id:keyId,key}},async read(){return key}}
  const source=vi.fn<GuardedWsaaTicketLoader>(async(b,_signal,send)=>{await send();controller.abort();return {entorno:'HOMOLOGACION',servicio:'wsfe',cuitEmisor:b.cuit_emisor,
    credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_LATE',sign:'SYNTHETIC_LATE',expiresAt:Date.now()+120000}})
  const loader=createSharedFiscalTicketLoader(persistedRpc,keys,source)
  await loader(binding,controller.signal)
  expect((await loader(binding,new AbortController().signal)).token).toBe('SYNTHETIC_LATE')
  expect(source).toHaveBeenCalledTimes(1)
})
it('no llama WSAA si la clave de cifrado no está disponible',async()=>{
  await provisionEmitter()
  const admin={...persistedRpc,auth:{async getUser(){return {data:{user:{id:auth}},error:null}}}}
  const binding=await authorizeFiscalWorker(admin,'SYNTHETIC_JWT',op),source=vi.fn<GuardedWsaaTicketLoader>()
  const keys={async active():Promise<{id:string;key:CryptoKey}>{throw new Error('SYNTHETIC_KEY_UNAVAILABLE')},async read():Promise<CryptoKey>{throw new Error('SYNTHETIC_KEY_UNAVAILABLE')}}
  await expect(createSharedFiscalTicketLoader(persistedRpc,keys,source)(binding,new AbortController().signal)).rejects.toThrow('FISCAL_TICKET_COMPARTIDO_NO_CONFIRMADO')
  expect(source).not.toHaveBeenCalled()
})
it.each(['fiscal_ta_homologacion','fiscal_ta_intentos_homologacion'])('no concede renovación si se omite escritura en %s',async table=>{
  await provisionEmitter();const binding=await authorize();await db.exec('RESET ROLE')
  await db.exec(`CREATE FUNCTION omitir_ta() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir BEFORE ${table==='fiscal_ta_homologacion'?'UPDATE':'INSERT'} ON ${table} FOR EACH ROW EXECUTE FUNCTION omitir_ta(); SET ROLE service_role`)
  await denied(()=>db.query('SELECT solicitar_ta_homologacion($1,$2,$3,1,$4)',[op,binding.credencial_id,'a'.repeat(64),randomUUID()]))
})

async function syntheticFiscalResponse(request:Request):Promise<Response> {
    if(request.url==='https://wsaahomo.afip.gov.ar/ws/services/LoginCms'){
      const {ContentInfo,SignedData}=await import('pkijs'),body=await request.text(),cms=body.match(/<in0>([^<]+)<\/in0>/)![1]
      const info=ContentInfo.fromBER(Uint8Array.from(atob(cms),c=>c.charCodeAt(0))),signed=new SignedData({schema:info.content})
      const tra=new TextDecoder().decode(signed.encapContentInfo.eContent!.getValue()),id=tra.match(/<uniqueId>(\d+)<\/uniqueId>/)![1]
      const ticket=`<loginTicketResponse version="1.0"><header><source>CN=wsaa,O=AFIP,C=AR,SERIALNUMBER=CUIT 33693450239</source><destination>CN=Kiosko Synthetic,SERIALNUMBER=CUIT 20123456786</destination><uniqueId>${id}</uniqueId><generationTime>${new Date(Date.now()-1000).toISOString()}</generationTime><expirationTime>${new Date(Date.now()+3600000).toISOString()}</expirationTime></header><credentials><token>SYNTHETIC_FULL_TOKEN</token><sign>SYNTHETIC_FULL_SIGN</sign></credentials></loginTicketResponse>`
      const escaped=ticket.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      return new Response(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><w:loginCmsResponse xmlns:w="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escaped}</loginCmsReturn></w:loginCmsResponse></s:Body></s:Envelope>`,{headers:{'Content-Type':'text/xml'}})
    }
    expect(request.url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx')
    return new Response(fiscalXml(),{headers:{'Content-Type':'text/xml'}})
}

it('integra Auth mock, SQL, custodia PKCS8 cifrada, CMS real, WSAA mock y conciliación sin duplicar',async()=>{
  const protectedFixture=await syntheticEncryptedCustody()
  await provisionEmitter(protectedFixture.binding.certificado_sha256)
  await db.exec('RESET ROLE')
  await db.query('UPDATE fiscal_emisores_homologacion SET credencial_id=$1 WHERE kiosco_id=$2',[protectedFixture.binding.credencial_id,kid])
  await db.exec('SET ROLE service_role');await persist();await intent()
  const admin={...persistedRpc,auth:{async getUser(){return {data:{user:{id:auth}},error:null}}}}
  const keyId=randomUUID(),raw=crypto.getRandomValues(new Uint8Array(32))
  protectedFixture.secrets.ARCA_HOMO_TA_ACTIVE_KEY_ID=keyId
  protectedFixture.secrets['ARCA_HOMO_TA_KEY_'+keyId.replace(/-/g,'').toUpperCase()]=btoa(String.fromCharCode(...raw));raw.fill(0)
  const read=(name:string)=>protectedFixture.secrets[name],keys=createPrivateFiscalTicketKeys(read)
  const fetcher=vi.fn<typeof fetch>(async input=>syntheticFiscalResponse(input as Request))
  const custody=vi.fn(createPrivateFiscalCustody(read)),source=createWsaaTicketSource(custody,fetcher)
  const shared=createSharedFiscalTicketLoader(persistedRpc,keys,source),id=randomUUID()
  const ack=await reconcileAuthorizedFiscalVoucher(admin,'SYNTHETIC_JWT',op,id,createFiscalTicketCache(),shared,fetcher)
  expect(ack.estado).toBe('AUTORIZADA')
  expect(await reconcileAuthorizedFiscalVoucher(admin,'SYNTHETIC_JWT',op,id,createFiscalTicketCache(),shared,fetcher)).toEqual(ack)
  const binding=await authorizeFiscalWorker(admin,'SYNTHETIC_JWT',op)
  expect((await createFiscalTicketCache().get(binding,shared)).token).toBe('SYNTHETIC_FULL_TOKEN')
  expect(custody).toHaveBeenCalledTimes(1);expect(fetcher).toHaveBeenCalledTimes(2)
  await db.exec('RESET ROLE')
  expect(JSON.stringify((await db.query('SELECT cifrado FROM fiscal_ta_homologacion')).rows)).not.toContain('SYNTHETIC_FULL')
})

async function typedTaBinding() {
  return authorizeFiscalWorker({...persistedRpc,auth:{async getUser(){return {data:{user:{id:auth}},error:null}}}},'SYNTHETIC_JWT',op)
}
async function taFixture() {
  await provisionEmitter()
  const binding=await typedTaBinding(),id=randomUUID()
  const args={p_operacion_id:op,p_credencial_id:binding.credencial_id,p_huella:binding.certificado_sha256,p_revision:1}
  const lease=(await persistedRpc.rpc('solicitar_ta_homologacion',{...args,p_intento_id:id})).data as Record<string,unknown>
  return {binding,args,lease:{...args,p_intento_id:id,p_generacion:lease.revision}}
}
it('reserva TA recuperable tras ACK perdido sin convertir preparación en envío',async()=>{
  const {args,lease}=await taFixture()
  const state=(await persistedRpc.rpc('consultar_preparacion_ta_homologacion',args)).data
  expect(state).toEqual({estado:'PREPARADA',intento_id:lease.p_intento_id,revision:1})
  expect(JSON.stringify(state)).not.toMatch(/token|sign|cifrado/i)
  await db.exec('RESET ROLE')
  await db.exec(readFileSync('supabase/pilot-fiscal/007_fiscal_ticket_recovery.sql','utf8').replace(/^BEGIN;$/m,'SAVEPOINT migration;').replace(/^COMMIT;$/m,'RELEASE SAVEPOINT migration;'))
  await db.exec('SET ROLE service_role')
  expect((await persistedRpc.rpc('consultar_preparacion_ta_homologacion',args)).data).toEqual(state)
})
it('cancelar antes de enviar conserva historial y permite otra generación, no revive el intento viejo',async()=>{
  const {args,lease}=await taFixture()
  const ack=(await persistedRpc.rpc('cancelar_preparacion_ta_homologacion',lease)).data
  expect(ack).toMatchObject({estado:'CANCELADA',revision:1})
  const next=(await persistedRpc.rpc('solicitar_ta_homologacion',{...args,p_intento_id:randomUUID()})).data
  expect(next).toMatchObject({nuevo_intento:true,revision:2})
  expect((await persistedRpc.rpc('cancelar_preparacion_ta_homologacion',lease)).data).toEqual(ack)
  await denied(()=>persistedRpc.rpc('iniciar_envio_ta_homologacion',lease))
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_ta_intentos_homologacion')).rows[0].n).toBe(2)
  const first=(await db.query<{cancelado_en:unknown;envio_iniciado_en:unknown}>('SELECT cancelado_en,envio_iniciado_en FROM fiscal_ta_intentos_homologacion WHERE id=$1',[lease.p_intento_id])).rows[0]
  expect(first.cancelado_en).not.toBeNull();expect(first.envio_iniciado_en).toBeNull()
})
it('sólo el primer ACK de intención concede envío; replay y cancelación posterior nunca lo conceden',async()=>{
  const {args,lease}=await taFixture()
  expect((await persistedRpc.rpc('iniciar_envio_ta_homologacion',lease)).data).toMatchObject({nuevo_envio:true,estado:'ENVIO_INCIERTO'})
  expect((await persistedRpc.rpc('iniciar_envio_ta_homologacion',lease)).data).toMatchObject({nuevo_envio:false,estado:'ENVIO_INCIERTO'})
  await denied(()=>persistedRpc.rpc('cancelar_preparacion_ta_homologacion',lease))
  expect((await persistedRpc.rpc('solicitar_ta_homologacion',{...args,p_intento_id:randomUUID()})).data).toMatchObject({nuevo_intento:false,estado:'RENOVACION_PENDIENTE'})
})
it.each(['iniciar_envio_ta_homologacion','cancelar_preparacion_ta_homologacion'])('%s rechaza intento/generación ajenos y nulos',async name=>{
  const {lease}=await taFixture()
  for(const patch of [{p_intento_id:randomUUID()},{p_generacion:2},{p_generacion:null},{p_huella:'b'.repeat(64)},{p_revision:2}])
    await denied(()=>persistedRpc.rpc(name,{...lease,...patch}))
})
it.each(['iniciar_envio_ta_homologacion','cancelar_preparacion_ta_homologacion'])('%s no confirma escritura omitida en ninguna tabla',async name=>{
  const {lease}=await taFixture()
  for(const table of ['fiscal_ta_homologacion','fiscal_ta_intentos_homologacion']){
    await db.exec('RESET ROLE; SAVEPOINT trigger_test')
    await db.exec(`CREATE FUNCTION omitir_frontera() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
      CREATE TRIGGER omitir_frontera BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION omitir_frontera(); SET ROLE service_role`)
    await denied(()=>persistedRpc.rpc(name,lease))
    await db.exec('ROLLBACK TO SAVEPOINT trigger_test; RELEASE SAVEPOINT trigger_test; SET ROLE service_role')
  }
})
it.each(['anon','authenticated'])('fronteras TA no accesibles por %s ni por columnas nuevas',async role=>{
  const {args,lease}=await taFixture()
  await db.exec(`RESET ROLE; SET ROLE ${role}`)
  await denied(()=>persistedRpc.rpc('iniciar_envio_ta_homologacion',lease))
  await denied(()=>persistedRpc.rpc('cancelar_preparacion_ta_homologacion',lease))
  await denied(()=>persistedRpc.rpc('consultar_preparacion_ta_homologacion',args))
  await denied(()=>db.query('SELECT envio_iniciado_en,cancelado_en FROM fiscal_ta_intentos_homologacion'))
})
it('no confirma un sobre antes de obtener permiso de envío',async()=>{
  const {lease}=await taFixture()
  await denied(()=>persistedRpc.rpc('confirmar_ta_homologacion',{...lease,p_cifrado:{version:1,keyId:randomUUID(),nonce:'0'.repeat(24),ciphertext:'0'.repeat(32),expiresAt:Date.now()+120000}}))
})
it.each(['custodia','keyring'])('fallo previo de %s libera preparación con auditoría y permite corregir configuración',async mode=>{
  await provisionEmitter();const binding=await typedTaBinding()
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt']),id=randomUUID()
  const keys={async active(){if(mode==='keyring')throw new Error('SYNTHETIC_KEY');return {id,key}},async read(){return key}}
  const source=vi.fn<GuardedWsaaTicketLoader>(async()=>{throw new Error('SYNTHETIC_CUSTODY')})
  const loader=createSharedFiscalTicketLoader(persistedRpc,keys,source)
  await expect(loader(binding,new AbortController().signal)).rejects.toThrow('FISCAL_TICKET_COMPARTIDO_NO_CONFIRMADO')
  await expect(loader(binding,new AbortController().signal)).rejects.toThrow('FISCAL_TICKET_COMPARTIDO_NO_CONFIRMADO')
  expect(source).toHaveBeenCalledTimes(mode==='keyring'?0:2)
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_ta_intentos_homologacion WHERE cancelado_en IS NOT NULL AND envio_iniciado_en IS NULL')).rows[0].n).toBe(2)
})
it('ACK de intención perdido conserva incertidumbre y no vuelve a llamar a la fuente',async()=>{
  await provisionEmitter();const binding=await typedTaBinding()
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])
  const keys={async active(){return {id:randomUUID(),key}},async read(){return key}}
  const network=vi.fn(),source=vi.fn<GuardedWsaaTicketLoader>(async(b,_signal,send)=>{await send();network();return {entorno:b.entorno,servicio:b.servicio,cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,...ticket()}})
  const lost: FiscalRpc={async rpc(name,args){const result=await persistedRpc.rpc(name,args);if(name==='iniciar_envio_ta_homologacion')throw new Error('SYNTHETIC_ACK_LOST');return result}}
  const loader=createSharedFiscalTicketLoader(lost,keys,source)
  await expect(loader(binding,new AbortController().signal)).rejects.toThrow()
  await expect(loader(binding,new AbortController().signal)).rejects.toThrow()
  expect(source).toHaveBeenCalledTimes(1);expect(network).not.toHaveBeenCalled()
  await db.exec('RESET ROLE')
  expect((await db.query<{estado:string}>('SELECT estado FROM fiscal_ta_homologacion')).rows[0].estado).toBe('ENVIO_INCIERTO')
})
it('fuente que omite el permiso durable no entrega un TA utilizable',async()=>{
  await provisionEmitter();const binding=await typedTaBinding()
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])
  const source:GuardedWsaaTicketLoader=async b=>({entorno:b.entorno,servicio:b.servicio,cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,...ticket()})
  await expect(createSharedFiscalTicketLoader(persistedRpc,{async active(){return {id:randomUUID(),key}},async read(){return key}},source)(binding,new AbortController().signal)).rejects.toThrow()
  await db.exec('RESET ROLE')
  expect((await db.query<{estado:string}>('SELECT estado FROM fiscal_ta_homologacion')).rows[0].estado).toBe('VACIO')
})

it('ACK de reserva perdido se inspecciona y cancela explícitamente sin envío oculto',async()=>{
  await provisionEmitter();const binding=await typedTaBinding()
  const key=await crypto.subtle.generateKey({name:'AES-GCM',length:256},false,['encrypt','decrypt'])
  const keys={async active(){return {id:randomUUID(),key}},async read(){return key}},source=vi.fn<GuardedWsaaTicketLoader>()
  const lost:FiscalRpc={async rpc(name,args){const result=await persistedRpc.rpc(name,args);if(name==='solicitar_ta_homologacion')throw new Error('SYNTHETIC_LEASE_ACK_LOST');return result}}
  await expect(createSharedFiscalTicketLoader(lost,keys,source)(binding,new AbortController().signal)).rejects.toThrow()
  expect(source).not.toHaveBeenCalled()
  const args={p_operacion_id:op,p_credencial_id:binding.credencial_id,p_huella:binding.certificado_sha256,p_revision:1}
  const state=(await persistedRpc.rpc('consultar_preparacion_ta_homologacion',args)).data as Record<string,unknown>
  expect(state.estado).toBe('PREPARADA')
  expect((await persistedRpc.rpc('cancelar_preparacion_ta_homologacion',{...args,p_intento_id:state.intento_id,p_generacion:state.revision})).data).toMatchObject({estado:'CANCELADA'})
  expect((await persistedRpc.rpc('solicitar_ta_homologacion',{...args,p_intento_id:randomUUID()})).data).toMatchObject({revision:2,nuevo_intento:true})
})
it('migrar incertidumbre anterior no habilita preparación ni cancelación',async()=>{
  const {args,lease}=await taFixture()
  await persistedRpc.rpc('iniciar_envio_ta_homologacion',lease)
  await db.exec('RESET ROLE')
  await db.query('UPDATE fiscal_ta_intentos_homologacion SET envio_iniciado_en=NULL WHERE id=$1',[lease.p_intento_id])
  const sql=readFileSync('supabase/pilot-fiscal/007_fiscal_ticket_recovery.sql','utf8').replace(/^BEGIN;$/m,'SAVEPOINT migration;').replace(/^COMMIT;$/m,'RELEASE SAVEPOINT migration;')
  await db.exec(sql);await db.exec('SET ROLE service_role')
  expect((await persistedRpc.rpc('consultar_preparacion_ta_homologacion',args)).data).toMatchObject({estado:'ENVIO_INCIERTO',revision:1})
  await denied(()=>persistedRpc.rpc('cancelar_preparacion_ta_homologacion',lease))
  expect((await persistedRpc.rpc('iniciar_envio_ta_homologacion',lease)).data).toMatchObject({nuevo_envio:false})
})

const httpOrigin='https://kiosco-app-staging.vercel.app',httpServiceSecret='SYNTHETIC_PRIVATE_SERVICE_SECRET'
async function syntheticHttpNetwork(request:Request):Promise<Response> {
  const url=new URL(request.url)
  if(url.origin===FISCAL_STAGING_URL&&url.pathname==='/auth/v1/user'){
    expect(request.headers.get('authorization')).toBe('Bearer SYNTHETIC_JWT')
    return Response.json({id:auth,aud:'authenticated'})
  }
  if(url.origin===FISCAL_STAGING_URL&&url.pathname.startsWith('/rest/v1/rpc/')){
    expect(request.headers.get('authorization')).toBe('Bearer '+httpServiceSecret)
    const args:Record<string,unknown>=await request.json()
    await db.exec('SAVEPOINT http_rpc')
    try {const result=await persistedRpc.rpc(url.pathname.split('/').at(-1)!,args);await db.exec('RELEASE SAVEPOINT http_rpc');return Response.json(result.data)}
    catch {await db.exec('ROLLBACK TO SAVEPOINT http_rpc; RELEASE SAVEPOINT http_rpc');return Response.json({code:'40001',message:'SYNTHETIC_SQL_REJECTED'},{status:409})}
  }
  return syntheticFiscalResponse(request)
}
function httpRequest(body:Record<string,unknown>):Request {
  return new Request(FISCAL_STAGING_URL+'/functions/v1/arca-homologacion',{method:'POST',headers:{origin:httpOrigin,authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json'},body:JSON.stringify(body)})
}
it('HTTP + SDK real + SQL + CMS/PKCS8: autoriza consulta existente, replay no duplica ni filtra TA',async()=>{
  const protectedFixture=await syntheticEncryptedCustody();await provisionEmitter(protectedFixture.binding.certificado_sha256)
  await db.exec('RESET ROLE');await db.query('UPDATE fiscal_emisores_homologacion SET credencial_id=$1 WHERE kiosco_id=$2',[protectedFixture.binding.credencial_id,kid])
  await db.exec('SET ROLE service_role');await persist();await intent()
  const keyId=randomUUID(),raw=crypto.getRandomValues(new Uint8Array(32))
  protectedFixture.secrets.ARCA_HOMO_TA_ACTIVE_KEY_ID=keyId
  protectedFixture.secrets.ARCA_HOMO_BACKEND_ENABLED='true'
  protectedFixture.secrets.ARCA_HOMO_RECONCILIATION_ENABLED='true'
  protectedFixture.secrets['ARCA_HOMO_TA_KEY_'+keyId.replace(/-/g,'').toUpperCase()]=btoa(String.fromCharCode(...raw));raw.fill(0)
  const read=vi.fn((name:string)=>protectedFixture.secrets[name]),fetcher=vi.fn<typeof fetch>(async input=>syntheticHttpNetwork(input as Request))
  const handler=createFiscalHttpHandler({readSecret:read,createAdmin:url=>createFiscalSupabaseAdmin(url,httpServiceSecret,fetcher),fetcher})
  const cmd={accion:'CONCILIAR',operacion_id:op,observacion_id:randomUUID()}
  const first=await handler(httpRequest(cmd));expect(first.status).toBe(200)
  const result=await first.json();expect(result.resultado.estado).toBe('AUTORIZADA');expect(result.emision_habilitada).toBe(false)
  const replay=await handler(httpRequest(cmd));expect(replay.status).toBe(200);expect(await replay.json()).toEqual(result)
  const state=await handler(httpRequest({accion:'ESTADO_TA',operacion_id:op}));expect(state.status).toBe(200)
  expect((await state.json()).resultado.estado).toBe('DISPONIBLE')
  const requests=fetcher.mock.calls.map(c=>c[0] as Request)
  expect(requests.filter(r=>r.url.endsWith('/auth/v1/user'))).toHaveLength(3)
  expect(requests.filter(r=>r.url==='https://wsaahomo.afip.gov.ar/ws/services/LoginCms')).toHaveLength(1)
  expect(requests.filter(r=>r.url==='https://wswhomo.afip.gov.ar/wsfev1/service.asmx')).toHaveLength(1)
  expect(requests.filter(r=>r.url.endsWith('/iniciar_envio_ta_homologacion'))).toHaveLength(1)
  expect(JSON.stringify(result)).not.toContain('SYNTHETIC')
  expect(read.mock.calls.filter(c=>c[0].endsWith('_KEY_PEM'))).toHaveLength(1)
  await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_autorizaciones_homologacion')).rows[0].n).toBe(1)
})
it('HTTP recupera/cancela preparación por CAS; reenvío de cancelación no libera generación nueva ni envío incierto',async()=>{
  const {args,lease}=await taFixture(),fetcher=vi.fn<typeof fetch>(async input=>syntheticHttpNetwork(input as Request))
  const read=vi.fn((name:string)=>name==='SUPABASE_URL'?FISCAL_STAGING_URL:name==='ARCA_HOMO_BACKEND_ENABLED'?'true':undefined)
  const handler=createFiscalHttpHandler({readSecret:read,createAdmin:url=>createFiscalSupabaseAdmin(url,httpServiceSecret,fetcher),fetcher})
  const state=await handler(httpRequest({accion:'ESTADO_TA',operacion_id:op}));expect((await state.json()).resultado.estado).toBe('PREPARADA')
  const cmd={accion:'CANCELAR_PREPARACION_TA',operacion_id:op,intento_id:lease.p_intento_id,revision:lease.p_generacion}
  expect((await handler(httpRequest(cmd))).status).toBe(200)
  const nextId=randomUUID(),next=(await persistedRpc.rpc('solicitar_ta_homologacion',{...args,p_intento_id:nextId})).data as Record<string,unknown>
  expect(next.revision).toBe(2);expect((await handler(httpRequest(cmd))).status).toBe(200)
  await persistedRpc.rpc('iniciar_envio_ta_homologacion',{...args,p_intento_id:nextId,p_generacion:next.revision})
  const reject=await handler(httpRequest({...cmd,intento_id:nextId,revision:next.revision}));expect(reject.status).toBe(409)
  expect(await reject.text()).not.toContain('SYNTHETIC')
  expect(fetcher.mock.calls.every(c=>new URL((c[0] as Request).url).origin===FISCAL_STAGING_URL)).toBe(true)
  expect(read.mock.calls.every(c=>['SUPABASE_URL','ARCA_HOMO_BACKEND_ENABLED'].includes(c[0]))).toBe(true)
})

async function foreignTaOperation() {
  const fk=randomUUID(),fa=randomUUID(),fu=randomUUID(),fsale=randomUUID(),fop=randomUUID(),credential=randomUUID()
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO auth.users VALUES($1)',[fa])
  await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Segundo comercio sintético')",[fk])
  await db.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Otro Dueño','DUEÑO')",[fu,fa,fk])
  await db.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45)',[fsale,fk,fu])
  await db.exec('SET ROLE authenticated');await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[fa])
  await db.query('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb)',[fop,fk,fsale,JSON.stringify(context)])
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado)
    VALUES($1,'20123456786',2,$2,$3,true)`,[fk,credential,'a'.repeat(64)])
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[auth]);await db.exec('SET ROLE service_role')
  return {actor:fa,args:{p_operacion_id:fop,p_credencial_id:credential,p_huella:'a'.repeat(64),p_revision:1}}
}
it('certificado compartido no expone ni concede cancelación/envío/confirmación de preparación ajena',async()=>{
  const {lease,args}=await taFixture(),foreign=await foreignTaOperation()
  const foreignLease={...foreign.args,p_intento_id:lease.p_intento_id,p_generacion:lease.p_generacion}
  expect((await persistedRpc.rpc('consultar_preparacion_ta_homologacion',foreign.args)).data).toEqual({estado:'COMPARTIDA',intento_id:null,revision:0})
  for(const name of ['cancelar_preparacion_ta_homologacion','iniciar_envio_ta_homologacion'])await denied(()=>persistedRpc.rpc(name,foreignLease))
  const cipher={version:1,keyId:randomUUID(),nonce:'0'.repeat(24),ciphertext:'0'.repeat(32),expiresAt:Date.now()+120000}
  await persistedRpc.rpc('iniciar_envio_ta_homologacion',lease)
  await denied(()=>persistedRpc.rpc('confirmar_ta_homologacion',{...foreignLease,p_cifrado:cipher}))
  await persistedRpc.rpc('confirmar_ta_homologacion',{...lease,p_cifrado:cipher})
  expect((await persistedRpc.rpc('solicitar_ta_homologacion',{...foreign.args,p_intento_id:randomUUID()})).data).toMatchObject({estado:'DISPONIBLE',nuevo_intento:false,cifrado:cipher})
  expect((await persistedRpc.rpc('consultar_preparacion_ta_homologacion',args)).data).toMatchObject({estado:'DISPONIBLE',intento_id:lease.p_intento_id})
  await db.exec('RESET ROLE')
  expect((await db.query<{operacion_origen_id:string}>('SELECT operacion_origen_id FROM fiscal_ta_intentos_homologacion')).rows[0].operacion_origen_id).toBe(op)
})
it('HTTP de otro Dueño sólo ve estado compartido y no puede cancelar aunque conozca intento/revisión',async()=>{
  const {lease}=await taFixture(),foreign=await foreignTaOperation()
  const fetcher=vi.fn<typeof fetch>(async input=>{
    const req=input as Request
    if(req.url.endsWith('/auth/v1/user')){expect(req.headers.get('authorization')).toBe('Bearer SYNTHETIC_FOREIGN');return Response.json({id:foreign.actor,aud:'authenticated'})}
    return syntheticHttpNetwork(req)
  })
  const handler=createFiscalHttpHandler({readSecret:name=>name==='SUPABASE_URL'?FISCAL_STAGING_URL:name==='ARCA_HOMO_BACKEND_ENABLED'?'true':undefined,
    createAdmin:url=>createFiscalSupabaseAdmin(url,httpServiceSecret,fetcher),fetcher})
  const foreignRequest=(body:Record<string,unknown>)=>{
    const req=httpRequest(body),headers=new Headers(req.headers);headers.set('authorization','Bearer SYNTHETIC_FOREIGN');return new Request(req,{headers})
  }
  const state=await handler(foreignRequest({accion:'ESTADO_TA',operacion_id:foreign.args.p_operacion_id}))
  expect(state.status).toBe(200);expect((await state.json()).resultado).toEqual({estado:'COMPARTIDA',intento_id:null,revision:0})
  const cancel=await handler(foreignRequest({accion:'CANCELAR_PREPARACION_TA',operacion_id:foreign.args.p_operacion_id,intento_id:lease.p_intento_id,revision:lease.p_generacion}))
  expect(cancel.status).toBe(409);expect(await cancel.text()).not.toContain(op)
  expect((await persistedRpc.rpc('iniciar_envio_ta_homologacion',lease)).data).toMatchObject({nuevo_envio:true})
})
it('historia sin origen no se reasigna durante migración/replay ni habilita cancelación',async()=>{
  const {args,lease}=await taFixture();await db.exec('RESET ROLE')
  await db.query('UPDATE fiscal_ta_intentos_homologacion SET operacion_origen_id=NULL WHERE id=$1',[lease.p_intento_id])
  const sql=readFileSync('supabase/pilot-fiscal/008_fiscal_ticket_ownership.sql','utf8').replace(/^BEGIN;$/m,'SAVEPOINT migrate_owner;').replace(/^COMMIT;$/m,'RELEASE SAVEPOINT migrate_owner;')
  await db.exec(sql);await db.exec(sql);await db.exec('SET ROLE service_role')
  expect((await persistedRpc.rpc('consultar_preparacion_ta_homologacion',args)).data).toEqual({estado:'COMPARTIDA',intento_id:null,revision:0})
  await denied(()=>persistedRpc.rpc('cancelar_preparacion_ta_homologacion',lease));await denied(()=>persistedRpc.rpc('iniciar_envio_ta_homologacion',lease))
  await db.exec('RESET ROLE')
  expect((await db.query<{operacion_origen_id:null}>('SELECT operacion_origen_id FROM fiscal_ta_intentos_homologacion')).rows[0].operacion_origen_id).toBeNull()
})

it('ACK de conciliación sin commit o getter fallido no confirma autorización',async()=>{
 await persist();await intent();const fetcher=vi.fn<typeof fetch>(async()=>new Response(fiscalXml(),{headers:{'content-type':'text/xml'}})),id=randomUUID()
 const falseAck:FiscalRpc={async rpc(name,args){if(name==='registrar_reconciliacion_fiscal_homologacion')return {data:{version:1,operacion_id:op,numero:1,estado:'AUTORIZADA',solicitud_sha256:digest,revision:2,cae:'11111111111111',vencimiento:'20261031',procesado_en:null,emision_habilitada:false},error:null};return persistedRpc.rpc(name,args)}}
 await expect(reconcilePersistedFiscalVoucher(falseAck,op,id,ticket(),fetcher)).rejects.toThrow('FISCAL_PERSISTENCIA_NO_CONFIRMADA')
 let reads=0
 const unreadable:FiscalRpc={async rpc(name,args){if(name==='consultar_reconciliacion_homologacion'&&++reads>1)throw new Error('PRIVATE_READ_DETAIL');return persistedRpc.rpc(name,args)}}
 await expect(reconcilePersistedFiscalVoucher(unreadable,op,id,ticket(),fetcher)).rejects.toThrow('FISCAL_PERSISTENCIA_NO_CONFIRMADA')
 const recovered=await reconcilePersistedFiscalVoucher(persistedRpc,op,id,ticket(),fetcher)
 expect(recovered.estado).toBe('AUTORIZADA');expect(fetcher).toHaveBeenCalledTimes(2)
})
it.each(['emisor','actor'])('revalida %s después de esperar TA sin consultar ni adoptar otra identidad',async mode=>{
 await persist();await intent();await provisionEmitter()
 const getUser=vi.fn(async()=>({data:{user:{id:auth}},error:null})),rpc=vi.fn(persistedRpc.rpc.bind(persistedRpc)),admin={auth:{getUser},rpc}
 const load=vi.fn<WsaaTicketLoader>(async b=>{
  await db.exec('RESET ROLE')
  if(mode==='emisor')await db.exec('UPDATE fiscal_emisores_homologacion SET revision=revision+1')
  else {const other=randomUUID();await db.query('INSERT INTO auth.users VALUES($1)',[other]);await db.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])}
  await db.exec('SET ROLE service_role')
  return {entorno:'HOMOLOGACION',servicio:'wsfe',cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_TOKEN',sign:'SYNTHETIC_SIGN',expiresAt:Date.now()+120000}
 })
 const fetcher=vi.fn<typeof fetch>()
 await denied(()=>reconcileAuthorizedFiscalVoucher(admin,'SYNTHETIC_JWT',op,randomUUID(),createFiscalTicketCache(),load,fetcher))
 expect(load).toHaveBeenCalledTimes(1);expect(fetcher).not.toHaveBeenCalled();expect(getUser).toHaveBeenCalledTimes(1)
 for(const [name,args] of rpc.mock.calls)if(name==='autorizar_conciliacion_revisada_homologacion')expect(args.p_actor_auth_id).toBe(auth)
})
it('emisor cambia después de consulta: no confirma ledger y conserva el intento',async()=>{
 await persist();await intent();await provisionEmitter()
 const admin={...persistedRpc,auth:{getUser:vi.fn(async()=>({data:{user:{id:auth}},error:null}))}}
 const load:WsaaTicketLoader=async b=>({entorno:'HOMOLOGACION',servicio:'wsfe',cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_TOKEN',sign:'SYNTHETIC_SIGN',expiresAt:Date.now()+120000})
 const fetcher=vi.fn<typeof fetch>(async()=>{await db.exec('RESET ROLE; UPDATE fiscal_emisores_homologacion SET revision=revision+1; SET ROLE service_role');return new Response(fiscalXml(),{headers:{'content-type':'text/xml'}})})
 await expect(reconcileAuthorizedFiscalVoucher(admin,'SYNTHETIC_JWT',op,randomUUID(),createFiscalTicketCache(),load,fetcher)).rejects.toThrow('FISCAL_CONSULTA_NO_AUTORIZADA')
 await db.exec('RESET ROLE')
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_autorizaciones_homologacion')).rows[0].n).toBe(0)
 expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reconciliaciones_homologacion')).rows[0].n).toBe(0)
 expect((await db.query<{estado:string}>('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[op])).rows[0].estado).toBe('ENVIO_INCIERTO')
})
