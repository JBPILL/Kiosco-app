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
  for(const file of ['001_fiscal_journal.sql','002_fiscal_reservations.sql','003_fiscal_requests.sql','004_fiscal_reconciliation.sql']) {
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
    consultar_reconciliacion_homologacion:['p_operacion_id','p_id'],
    cargar_contexto_conciliacion_homologacion:['p_operacion_id'],
    registrar_reconciliacion_fiscal_homologacion:['p_id','p_operacion_id','p_intento_id','p_sha','p_revision','p_decision'],
  }
  const keys=allowed[name]; if(!keys)throw new Error('RPC no permitida en fixture')
  const values=keys.map(key=>key==='p_decision'?JSON.stringify(args[key]):args[key])
  const placeholders=keys.map((key,index)=>'$'+(index+1)+(key==='p_decision'?'::jsonb':''))
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
  await expect(reconcilePersistedFiscalVoucher(connection,op,id,ticket(),fetcher)).rejects.toThrow('FISCAL_PERSISTENCIA_NO_CONFIRMADA')
  const ack=await reconcilePersistedFiscalVoucher(connection,op,id,ticket(),fetcher)
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
