import { emitFiscalCreditOperation } from '../../supabase/functions/_shared/fiscalCreditEmissionWorker'
import { reconcileFiscalCreditOperation } from '../../supabase/functions/_shared/fiscalCreditConsultWorker'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { prepareFiscalCreditRequest,validateFiscalCreditRequestRecord } from '../../supabase/functions/_shared/fiscalCreditRequest'
import type { FiscalCreditReservation } from '../../supabase/functions/_shared/fiscalCreditRequest'
import { validateFiscalCreditIntentRecord,validateFiscalCreditConsultation } from '../../supabase/functions/_shared/fiscalCreditConsultation'
async function fixture(invoice: 1 | 6 | 11 = 11, concept: 1 | 2 | 3 = 1) {
  const f = await fiscalCreditContextFixture(invoice, concept), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const entry = concept === 1 ? { servicioDesde: null, servicioHasta: null, vencimientoPago: null }
    : { servicioDesde: '20261002', servicioHasta: '20261019', vencimientoPago: '20261027' }
  const prepared = await prepareFiscalCreditPreparation(f.source, f.proposal, context, entry)
  const wire = { version: 1, estado: 'DATOS_NC_PREPARADOS', contexto: context, preparacion: { canonico: prepared.canonico, sha256: prepared.sha256 },
    emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  const reservation: FiscalCreditReservation = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, preparacion_sha256: prepared.sha256, reserva_id: crypto.randomUUID(),
    cuit_emisor: context.cuit_emisor, punto_venta: context.punto_venta, tipo_comprobante: context.tipo_nota_credito, numero: 23, estado: 'RESERVADA', emision_habilitada: false }
  return { ...f, entry, prepared, wire, reservation }
}
async function recordFixture() {
  const f = await fixture(), request = await prepareFiscalCreditRequest(f.source, f.proposal, f.wire, f.reservation)
  const packet = { preparacion: { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, estado: f.wire.estado, preparacion: f.wire.preparacion, contexto: f.wire.contexto,
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false },
    reserva: f.reservation, cuerpo: { canonico: request.canonico, sha256: request.sha256 } }
  return { ...f, packet, request }
}
async function journalFixture(){
 const f=await recordFixture(),body=await validateFiscalCreditRequestRecord(f.packet,f.source,f.proposal),query=crypto.randomUUID()
 const rawIntent={version:1,estado:'ENVIO_INCIERTO',solicitud_id:f.input.solicitud_id,operacion_origen_id:f.operation,intento_id:crypto.randomUUID(),permiso_id:crypto.randomUUID(),revision_id:crypto.randomUUID(),reserva_id:f.reservation.reserva_id,propuesta_sha256:f.proposal.sha256,preparacion_sha256:f.prepared.sha256,solicitud_sha256:body.sha256,actor_auth_id:f.actor,nuevo_envio:false,emision_habilitada:false}
 const intent=validateFiscalCreditIntentRecord(rawIntent,body,f.actor),observation={intento_id:intent.intento_id,solicitud_sha256:body.sha256,consultado_en:'2026-10-25T12:00:00Z',resultado:{estado:'AUTORIZACION_NC_COINCIDENTE',cae:'11111111111111',vencimiento:'20261130',procesadoEn:'20261025123456',solicitudSha256:body.sha256,puedeReenviar:false},emision_habilitada:false}
 const receipt={version:1,consulta_id:query,solicitud_id:f.input.solicitud_id,intento_id:intent.intento_id,solicitud_sha256:body.sha256,estado:'CAE_NC_REGISTRADO_NO_APLICADO',observacion:observation,emision_habilitada:false,reintegro_habilitado:false,reposicion_habilitada:false}
 return{...f,body,query,rawIntent,intent,receipt}
}
it('receipt privado se reconstruye/congela y nunca habilita negocio',async()=>{
 const f=await journalFixture(),value=validateFiscalCreditConsultation(f.receipt,f.body,f.intent,f.query)
 expect(value).toEqual(f.receipt);expect(Object.isFrozen(value)).toBe(true);expect(Object.isFrozen(value.observacion.resultado)).toBe(true)
 const review={...f.receipt,estado:'CONSULTA_NC_REGISTRADA',observacion:{...f.receipt.observacion,resultado:{estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false}}}
 expect(validateFiscalCreditConsultation(review,f.body,f.intent).estado).toBe('CONSULTA_NC_REGISTRADA')
})
it.each(['consulta_id','solicitud_id','intento_id','solicitud_sha256','estado','emision_habilitada','reintegro_habilitado','reposicion_habilitada','extra'])('receipt alterado %s se rechaza',async key=>{
 const f=await journalFixture(),raw:Record<string,unknown>={...f.receipt};raw[key]=key.endsWith('habilitado')||key==='emision_habilitada'?true:'INVALIDO'
 expect(()=>validateFiscalCreditConsultation(raw,f.body,f.intent,f.query)).toThrow('FISCAL_DIARIO_NC_NO_CONFIRMADO')
})
it.each(['cae','vencimiento','procesadoEn','solicitudSha256','puedeReenviar','extra'])('clasificación alterada %s no se recupera como CAE',async key=>{
 const f=await journalFixture(),result:Record<string,unknown>={...f.receipt.observacion.resultado};result[key]=key==='puedeReenviar'?true:'INVALIDO'
 expect(()=>validateFiscalCreditConsultation({...f.receipt,observacion:{...f.receipt.observacion,resultado:result}},f.body,f.intent)).toThrow()
})
it('otro UUID válido/otro actor no se adoptan',async()=>{
 const f=await journalFixture();expect(()=>validateFiscalCreditConsultation(f.receipt,f.body,f.intent,crypto.randomUUID())).toThrow()
 expect(()=>validateFiscalCreditIntentRecord(f.rawIntent,f.body,crypto.randomUUID())).toThrow()
 expect(()=>validateFiscalCreditIntentRecord({...f.rawIntent,nuevo_envio:true},f.body,f.actor)).toThrow()
})

it('worker aborta Auth sin respuesta a los45s sin leer TA ni consultar ARCA',async()=>{
 vi.useFakeTimers()
 try{
  const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(()=>new Promise(()=>undefined)),rpc=vi.fn<FiscalAuthClient['rpc']>(),fetcher=vi.fn<typeof fetch>()
  const keys={active:vi.fn(async()=>{throw new Error('UNEXPECTED_KEY')}),read:vi.fn(async()=>{throw new Error('UNEXPECTED_KEY')})},createWsaa=vi.fn(()=>{throw new Error('UNEXPECTED_WSAA')})
  const flags:Record<string,string>={SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',ARCA_HOMO_BACKEND_ENABLED:'true'}
  const pending=reconcileFiscalCreditOperation({admin:{auth:{getUser},rpc},readSecret:name=>flags[name],keys,createWsaa,fetcher},'SYNTHETIC_JWT',{saleId:crypto.randomUUID(),operationId:crypto.randomUUID(),requestId:crypto.randomUUID(),sha256:'a'.repeat(64)},crypto.randomUUID()).catch((e:unknown)=>e instanceof Error?e.message:'UNKNOWN')
  await vi.advanceTimersByTimeAsync(45000);expect(await pending).toBe('FISCAL_CONCILIACION_NC_NO_CONFIRMADA')
  expect(getUser).toHaveBeenCalledTimes(1);expect(rpc).not.toHaveBeenCalled();expect(keys.active).not.toHaveBeenCalled();expect(createWsaa).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()
 }finally{vi.useRealTimers()}
})

it('receipt de conflicto conserva evidencia pero nunca habilita aplicación',async()=>{
 const f=await journalFixture(),raw={...f.receipt,estado:'CONFLICTO_NC_NO_APLICAR'}
 expect(validateFiscalCreditConsultation(raw,f.body,f.intent)).toMatchObject({estado:'CONFLICTO_NC_NO_APLICAR',reintegro_habilitado:false,reposicion_habilitada:false})
 for(const codigo of ['SIN_CONFIRMACION','RESPUESTA_INVALIDA','ASOCIACION_INCOMPLETA','DATOS_DISTINTOS']){
  const value={...raw,observacion:{...raw.observacion,resultado:{estado:'CONCILIAR',codigo,puedeReenviar:false}}}
  if(codigo==='DATOS_DISTINTOS')expect(validateFiscalCreditConsultation(value,f.body,f.intent).estado).toBe('CONFLICTO_NC_NO_APLICAR')
  else expect(()=>validateFiscalCreditConsultation(value,f.body,f.intent)).toThrow()
 }
})

it('worker NC acota Auth60s sin acceder RPC/claves/red',async()=>{
 vi.useFakeTimers()
 try{
  const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(()=>new Promise(()=>{})),rpc=vi.fn<FiscalAuthClient['rpc']>(),fetcher=vi.fn<typeof fetch>(),keys={active:vi.fn(async()=>{throw new Error('UNEXPECTED_KEY')}),read:vi.fn(async()=>{throw new Error('UNEXPECTED_KEY')})},createSendWsaa=vi.fn(()=>{throw new Error('UNEXPECTED_WSAA')}),createConsultWsaa=vi.fn(()=>{throw new Error('UNEXPECTED_WSAA')})
  const flags:Record<string,string>={SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',ARCA_HOMO_BACKEND_ENABLED:'true'}
  const pending=emitFiscalCreditOperation({admin:{auth:{getUser},rpc},readSecret:name=>flags[name],keys,createSendWsaa,createConsultWsaa,fetcher},'SYNTHETIC_JWT',{saleId:crypto.randomUUID(),operationId:crypto.randomUUID(),requestId:crypto.randomUUID(),sha256:'a'.repeat(64)},crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID(),crypto.randomUUID()).catch((e:unknown)=>e instanceof Error?e.message:'UNKNOWN')
  await vi.advanceTimersByTimeAsync(60000);expect(await pending).toBe('FISCAL_OPERACION_NC_NO_CONFIRMADA');expect(getUser).toHaveBeenCalledTimes(1);expect(rpc).not.toHaveBeenCalled();expect(keys.active).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()
 }finally{vi.useRealTimers()}
})
it('consulta encadenada captura actor esperado antes de Auth y no admite cambiarlo durante espera',async()=>{
 const actor=crypto.randomUUID(),expected=crypto.randomUUID(),rpc=vi.fn<FiscalAuthClient['rpc']>(),fetcher=vi.fn<typeof fetch>(),keys={active:vi.fn(async()=>{throw new Error('UNEXPECTED_KEY')}),read:vi.fn(async()=>{throw new Error('UNEXPECTED_KEY')})},createWsaa=vi.fn(()=>{throw new Error('UNEXPECTED_WSAA')})
 let resolveAuth:((v:Awaited<ReturnType<FiscalAuthClient['auth']['getUser']>>)=>void)|undefined
 const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(()=>new Promise(resolve=>{resolveAuth=resolve})),flags:Record<string,string>={SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',ARCA_HOMO_BACKEND_ENABLED:'true'}
 const deps={expectedActorAuthId:expected,admin:{auth:{getUser},rpc},readSecret:(name:string)=>flags[name],keys,createWsaa,fetcher}
 const pending=reconcileFiscalCreditOperation(deps,'SYNTHETIC_JWT',{saleId:crypto.randomUUID(),operationId:crypto.randomUUID(),requestId:crypto.randomUUID(),sha256:'a'.repeat(64)},crypto.randomUUID())
 deps.expectedActorAuthId=actor;resolveAuth?.({data:{user:{id:actor}},error:null})
 await expect(pending).rejects.toThrow('FISCAL_CONCILIACION_NC_NO_CONFIRMADA');expect(rpc).not.toHaveBeenCalled();expect(keys.active).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()
})

it('cancelación del padre aborta Auth de consulta encadenada sin RPC ni red',async()=>{
 const controller=new AbortController(),getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(()=>new Promise(()=>{})),rpc=vi.fn<FiscalAuthClient['rpc']>(),fetcher=vi.fn<typeof fetch>(),keys={active:vi.fn(async()=>{throw new Error('UNEXPECTED_KEY')}),read:vi.fn(async()=>{throw new Error('UNEXPECTED_KEY')})},createWsaa=vi.fn(()=>{throw new Error('UNEXPECTED_WSAA')})
 const flags:Record<string,string>={SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',ARCA_HOMO_BACKEND_ENABLED:'true'}
 const pending=reconcileFiscalCreditOperation({signal:controller.signal,admin:{auth:{getUser},rpc},readSecret:name=>flags[name],keys,createWsaa,fetcher},'SYNTHETIC_JWT',{saleId:crypto.randomUUID(),operationId:crypto.randomUUID(),requestId:crypto.randomUUID(),sha256:'a'.repeat(64)},crypto.randomUUID())
 controller.abort();await expect(pending).rejects.toThrow('FISCAL_CONCILIACION_NC_NO_CONFIRMADA');expect(rpc).not.toHaveBeenCalled();expect(keys.active).not.toHaveBeenCalled();expect(fetcher).not.toHaveBeenCalled()
})
