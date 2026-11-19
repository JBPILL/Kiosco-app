// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createFiscalClient } from '../lib/fiscalClient'
import { freezeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import { wsfeSample } from './fixtures/fiscalWsfe'
import type { FiscalOwnerReview } from '../../supabase/functions/_shared/fiscalOwnerReview'
const scope={authId:crypto.randomUUID(),kioskId:crypto.randomUUID(),saleId:crypto.randomUUID()}
const context={version:1 as const,venta_id:scope.saleId,total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,incluye_recepcion_envases:false,revision_parametros:1,condiciones:[{id:5,descripcion:'Ensayo',comprobantes:[11]}],alicuotas:[]}
const envelope=(resultado:unknown)=>({version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado})
function input(){
 const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,numero:_n,...data}=wsfeSample
 const {total:_t,...importes}=data.importes
 return {condicionEmisor:'MONOTRIBUTO' as const,datos:{...data,importes}}
}
function fixture(){
 const map=new Map<string,string>(),storage={getItem:(key:string)=>map.get(key)??null,setItem:(key:string,value:string)=>{map.set(key,value)}}
 const send=vi.fn(async(cmd:Record<string,unknown>)=>envelope({venta_id:scope.saleId,operacion_id:cmd.operacion_id,preparacion_sha256:'a'.repeat(64),estado:'DATOS_PREPARADOS',emision_habilitada:false}))
 return {map,storage,send,client:createFiscalClient(scope,{storage,send})}
}
async function review():Promise<FiscalOwnerReview>{return {operacion_id:crypto.randomUUID(),estado:'RESERVADA',revision:1,solicitud:await freezeFiscalRequest(wsfeSample),aprobacion:null}}
it('conserva UUID y datos antes de enviar, elimina datos del receptor después de ACK',async()=>{
 const f=fixture(),implementation=f.send.getMockImplementation()!
 f.send.mockImplementation(async cmd=>{expect(f.client.pending()?.operationId).toBe(cmd.operacion_id);expect(f.client.pending()?.input).toEqual(input());return implementation(cmd)})
 await f.client.save(input(),context);expect(f.client.pending()?.input).toBeNull();expect([...f.map.values()].join('')).not.toContain('numeroDocumento')
})
it('ACK perdido y reinicio del cliente recuperan el mismo cuerpo y UUID',async()=>{
 const f=fixture();f.send.mockRejectedValueOnce(new Error('lost'));await expect(f.client.save(input(),context)).rejects.toThrow()
 const recovered=createFiscalClient(scope,{storage:f.storage,send:f.send})
 await recovered.save(input(),context);expect(f.send.mock.calls[0]).toEqual(f.send.mock.calls[1])
})
it('no reemplaza datos pendientes ni crea un UUID nuevo al cambiar datos',async()=>{
 const f=fixture();f.send.mockRejectedValue(new Error('lost'));await expect(f.client.save(input(),context)).rejects.toThrow()
 const changed=input();changed.datos.fecha='20261022';await expect(f.client.save(changed,context)).rejects.toThrow('FISCAL_CLIENTE_NO_CONFIRMADO')
 expect(f.send).toHaveBeenCalledTimes(1)
})
it('sin escritura local confirmada no manda la preparación',async()=>{
 for(const storage of [{getItem:()=>null,setItem:()=>{throw new Error('quota')}},{getItem:()=>null,setItem:()=>{}}]){
  const send=vi.fn(),client=createFiscalClient(scope,{storage,send});await expect(client.save(input(),context)).rejects.toThrow();expect(send).not.toHaveBeenCalled()
 }
})
it('otro Auth, comercio o venta no recupera el pendiente local',async()=>{
 const f=fixture();f.send.mockRejectedValue(new Error('lost'));await expect(f.client.save(input(),context)).rejects.toThrow()
 for(const key of ['authId','kioskId','saleId'] as const)expect(createFiscalClient({...scope,[key]:crypto.randomUUID()},{storage:f.storage,send:f.send}).pending()).toBeNull()
})
it('no acepta ACK de otra operación ni habilitación de emisión',async()=>{
 const f=fixture();f.send.mockResolvedValue(envelope({venta_id:scope.saleId,operacion_id:crypto.randomUUID(),preparacion_sha256:'a'.repeat(64),estado:'DATOS_PREPARADOS',emision_habilitada:false}))
 await expect(f.client.save(input(),context)).rejects.toThrow();expect(f.client.pending()?.input).toEqual(input())
})
it('aprobación conserva su UUID antes del POST y valida hash/revisión originales',async()=>{
 const f=fixture(),r=await review(),id=f.client.approvalId(r)
 f.send.mockRejectedValueOnce(new Error('lost'))
 await expect(f.client.approve(r,id)).rejects.toThrow()
 const recovered=createFiscalClient(scope,{storage:f.storage,send:f.send});expect(recovered.approvalId(r)).toBe(id)
 f.send.mockResolvedValue(envelope({id,operacion_id:r.operacion_id,solicitud_sha256:r.solicitud.sha256,revision:1,aprobada:true,vence_en:new Date(Date.now()+600000).toISOString(),emision_habilitada:false}))
 await recovered.approve(r,id);expect(f.send.mock.calls[0]).toEqual(f.send.mock.calls[1])
})
it('un hash cambiado no reutiliza la aprobación anterior',async()=>{
 const f=fixture(),r=await review(),id=f.client.approvalId(r)
 expect(f.client.approvalId({...r,solicitud:{...r.solicitud,sha256:'b'.repeat(64)}})).not.toBe(id)
})
it('un estado de venta ajena no se interpreta como sin preparación',async()=>{
 const f=fixture();f.send.mockResolvedValue(envelope({venta_id:crypto.randomUUID(),estado:'SIN_PREPARACION',operacion_id:null,preparacion_sha256:null,emision_habilitada:false}))
 await expect(f.client.resolve()).rejects.toThrow()
})
it('recuperar el guardado tras ACK perdido retira datos locales del receptor, conservando UUID',async()=>{
 const f=fixture();f.send.mockRejectedValueOnce(new Error('lost'));await expect(f.client.save(input(),context)).rejects.toThrow()
 const id=f.client.pending()!.operationId
 f.send.mockResolvedValue(envelope({venta_id:scope.saleId,operacion_id:id,preparacion_sha256:'a'.repeat(64),estado:'DATOS_PREPARADOS',emision_habilitada:false}))
 await f.client.resolve();expect(f.client.pending()).toEqual({version:1,operationId:id,input:null})
})
it.each(['suma','receptor','limite_tributo'])('rechazo local de %s permite corregir sin pendiente ni POST previo',async cause=>{
 const f=fixture(),bad=input()
 if(cause==='suma')bad.datos.importes.neto='1.00'
 if(cause==='receptor')bad.datos.numeroDocumento='42'
 if(cause==='limite_tributo')bad.datos.tributos=[{id:1,descripcion:'x'.repeat(81),base:'0.00',alicuota:'0.0000',importe:'0.00'}]
 await expect(f.client.save(bad,context)).rejects.toThrow()
 expect(f.client.pending()).toBeNull();expect(f.send).not.toHaveBeenCalled()
 await f.client.save(input(),context);expect(f.send).toHaveBeenCalledTimes(1)
})
it('no crea identidad sin contexto de esta venta',async()=>{
 const f=fixture();await expect(f.client.save(input())).rejects.toThrow()
 await expect(f.client.save(input(),{...context,venta_id:crypto.randomUUID()})).rejects.toThrow()
 expect(f.client.pending()).toBeNull();expect(f.send).not.toHaveBeenCalled()
})
it('dos guardados simultáneos no escriben otro UUID ni envían un POST paralelo',async()=>{
 const f=fixture(),implementation=f.send.getMockImplementation()!
 let release!:()=>void;const gate=new Promise<void>(done=>{release=done})
 f.send.mockImplementation(async cmd=>{await gate;return implementation(cmd)})
 const first=f.client.save(input(),context),second=f.client.save(input(),context)
 const results=Promise.allSettled([first,second])
 await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(1));release()
 const completed=await results
 expect(completed.map(result=>result.status)).toEqual(['fulfilled','rejected'])
 expect(f.send).toHaveBeenCalledTimes(1);expect(f.client.pending()?.operationId).toBe(f.send.mock.calls[0][0].operacion_id)
})
it('el llamador no puede cambiar datos mientras se valida la copia',async()=>{
 const f=fixture(),data=input(),run=f.client.save(data,context)
 data.datos.importes.neto='1.00'
 await run;expect(f.send.mock.calls[0][0].entrada).toEqual(input())
})
it('preparar cuerpo conserva operación y valida la revisión pública recibida',async()=>{
 const f=fixture(),r=await review();f.send.mockResolvedValue(envelope(r))
 expect(await f.client.prepare(r.operacion_id)).toEqual(r)
 expect(f.send).toHaveBeenCalledExactlyOnceWith({accion:'PREPARAR_COMPROBANTE',operacion_id:r.operacion_id})
 f.send.mockResolvedValue(envelope({...r,operacion_id:crypto.randomUUID()}))
 await expect(f.client.prepare(r.operacion_id)).rejects.toThrow()
})

it('cliente recupera constancia vinculada a venta/operación sin persistir datos fiscales',async()=>{
 const f=fixture(),operationId=crypto.randomUUID(),receipt={version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',operacion_id:operationId,venta_id:scope.saleId,solicitud:await freezeFiscalRequest(wsfeSample),autorizacion:{cae:'11111111111111',vencimiento:'20261031',procesado_en:null}}
 f.send.mockResolvedValue(envelope(receipt));expect(await f.client.receipt(operationId)).toEqual(receipt)
 expect(f.send).toHaveBeenCalledExactlyOnceWith({accion:'CONSTANCIA_COMPROBANTE',operacion_id:operationId,venta_id:scope.saleId});expect(f.map.size).toBe(0)
 f.send.mockResolvedValue(envelope({...receipt,venta_id:crypto.randomUUID()}));await expect(f.client.receipt(operationId)).rejects.toThrow()
 f.send.mockResolvedValue(envelope({...receipt,operacion_id:crypto.randomUUID()}));await expect(f.client.receipt(operationId)).rejects.toThrow()
})

it('cliente consulta diagnóstico por venta/operación sin persistirlo y rechaza otro scope',async()=>{
 const f=fixture(),operationId=crypto.randomUUID(),diagnosis={version:1,entorno:'HOMOLOGACION',operacion_id:operationId,venta_id:scope.saleId,solicitud_sha256:'a'.repeat(64),estado:'ENVIO_INCIERTO',recepcion:null,ultima_consulta:null,puedeReenviar:false}
 f.send.mockResolvedValue(envelope(diagnosis));expect(await f.client.diagnosis(operationId)).toEqual(diagnosis)
 expect(f.send).toHaveBeenCalledExactlyOnceWith({accion:'DIAGNOSTICO_COMPROBANTE',operacion_id:operationId,venta_id:scope.saleId});expect(f.map.size).toBe(0)
 f.send.mockResolvedValue(envelope({...diagnosis,venta_id:crypto.randomUUID()}));await expect(f.client.diagnosis(operationId)).rejects.toThrow()
 f.send.mockResolvedValue(envelope({...diagnosis,operacion_id:crypto.randomUUID()}));await expect(f.client.diagnosis(operationId)).rejects.toThrow()
})

it('cliente cancela mismo UUID, recupera ACK perdido y retira datos del receptor sólo tras lectura durable',async()=>{
 const f=fixture();f.send.mockRejectedValueOnce(new Error('lost'));await expect(f.client.save(input(),context)).rejects.toThrow();const original=f.client.pending()!.operationId
 f.send.mockImplementation(async cmd=>{if(cmd.accion==='CANCELAR_PREPARACION_FISCAL')throw new Error('SYNTHETIC_ACK_LOST');return envelope({operacion_id:original,venta_id:scope.saleId,estado:'CANCELADA',emision_habilitada:false})})
 expect(await f.client.cancel(original)).toMatchObject({operacion_id:original,estado:'CANCELADA'});expect(f.client.pending()).toBeNull();expect([...f.map.values()].join('')).not.toContain('numeroDocumento')
 expect(f.send.mock.calls.slice(-2).map(([cmd])=>[cmd.accion,cmd.operacion_id])).toEqual([['CANCELAR_PREPARACION_FISCAL',original],['CANCELACION_PREPARACION_FISCAL',original]])
})
it('cancelación sin registro durable o con identidad ajena conserva pendiente exacto',async()=>{
 const f=fixture();f.send.mockRejectedValueOnce(new Error('lost'));await expect(f.client.save(input(),context)).rejects.toThrow();const before=f.client.pending()!
 for(const result of [null,{operacion_id:crypto.randomUUID(),venta_id:scope.saleId,estado:'CANCELADA',emision_habilitada:false}]){
  f.send.mockResolvedValue(envelope(result));await expect(f.client.cancel(before.operationId)).rejects.toThrow();expect(f.client.pending()).toEqual(before)
 }
})
it('resolve tras reinicio recupera cancelación del mismo pendiente antes de permitir datos nuevos',async()=>{
 const f=fixture();f.send.mockRejectedValueOnce(new Error('lost'));await expect(f.client.save(input(),context)).rejects.toThrow();const original=f.client.pending()!.operationId
 f.send.mockImplementation(async cmd=>envelope(cmd.accion==='RESOLVER_VENTA'?{venta_id:scope.saleId,estado:'SIN_PREPARACION',operacion_id:null,preparacion_sha256:null,emision_habilitada:false}:{operacion_id:original,venta_id:scope.saleId,estado:'CANCELADA',emision_habilitada:false}))
 const recovered=createFiscalClient(scope,{storage:f.storage,send:f.send});expect((await recovered.resolve()).estado).toBe('SIN_PREPARACION');expect(recovered.pending()).toBeNull()
 f.send.mockImplementation(async cmd=>envelope({venta_id:scope.saleId,operacion_id:cmd.operacion_id,preparacion_sha256:'a'.repeat(64),estado:'DATOS_PREPARADOS',emision_habilitada:false}))
 await recovered.save(input(),context);expect(recovered.pending()!.operationId).not.toBe(original)
})
it('cancelar otro intento confirmado no retira el pendiente local actual',async()=>{
 const f=fixture();f.send.mockRejectedValueOnce(new Error('lost'));await expect(f.client.save(input(),context)).rejects.toThrow();const before=f.client.pending()!,other=crypto.randomUUID()
 f.send.mockResolvedValue(envelope({operacion_id:other,venta_id:scope.saleId,estado:'CANCELADA',emision_habilitada:false}));await f.client.cancel(other);expect(f.client.pending()).toEqual(before)
})
it('dos instancias no dejan que cancelación tardía borre la identidad nueva de una corrección',async()=>{
 const f=fixture();f.send.mockRejectedValueOnce(new Error('lost'));await expect(f.client.save(input(),context)).rejects.toThrow();const old=f.client.pending()!.operationId
 let release!:()=>void;const gate=new Promise<void>(done=>{release=done})
 const other=createFiscalClient(scope,{storage:f.storage,send:f.send})
 f.send.mockImplementation(async cmd=>{
  if(cmd.accion==='CANCELAR_PREPARACION_FISCAL'){await gate;return envelope({operacion_id:old,venta_id:scope.saleId,estado:'CANCELADA',emision_habilitada:false})}
  if(cmd.accion==='CANCELACION_PREPARACION_FISCAL')return envelope({operacion_id:old,venta_id:scope.saleId,estado:'CANCELADA',emision_habilitada:false})
  return envelope({venta_id:scope.saleId,operacion_id:cmd.operacion_id,preparacion_sha256:'a'.repeat(64),estado:'DATOS_PREPARADOS',emision_habilitada:false})
 })
 const cancelling=f.client.cancel(old);await vi.waitFor(()=>expect(f.send.mock.calls.at(-1)?.[0].accion).toBe('CANCELAR_PREPARACION_FISCAL'))
 const saving=other.save(input(),context);await Promise.resolve();expect(f.client.pending()?.operationId).toBe(old);release()
 await Promise.all([cancelling,saving]);const current=f.client.pending()!.operationId;expect(current).not.toBe(old)
 await f.client.cancel(old);expect(f.client.pending()?.operationId).toBe(current)
})
it('fallo al retirar datos locales no habilita una identidad nueva hasta recuperar cierre',async()=>{
 const f=fixture();f.send.mockRejectedValueOnce(new Error('lost'));await expect(f.client.save(input(),context)).rejects.toThrow();const before=f.client.pending()!
 f.send.mockResolvedValue(envelope({operacion_id:before.operationId,venta_id:scope.saleId,estado:'CANCELADA',emision_habilitada:false}))
 const badStorage={getItem:f.storage.getItem,setItem:()=>{throw new Error('quota')}}
 await expect(createFiscalClient(scope,{storage:badStorage,send:f.send}).cancel(before.operationId)).rejects.toThrow();expect(f.client.pending()).toEqual(before)
})

async function replacementFixture(kind: 'RESERVA' | 'RECHAZO' = 'RESERVA'){
 const f=fixture(),r=await review(),flags={commit:true,loseWrite:false,loseRead:false,wrongRead:false}
 r.solicitud=await freezeFiscalRequest({...wsfeSample,puntoVenta:context.punto_venta})
 if(kind==='RECHAZO')r.estado='ENVIO_INCIERTO'
 const cancelled=new Set<string>()
 let saved:Record<string,unknown>|null=null
 f.send.mockImplementation(async cmd=>{
  if(cmd.accion===(kind==='RECHAZO'?'CORREGIR_RECHAZO_FISCAL':'SUSTITUIR_PREPARACION_FISCAL')){
   const proposal=cmd.propuesta as {sha256:string}
   if(flags.commit)saved={operacion_id:r.operacion_id,sucesora_id:cmd.sucesora_id,venta_id:scope.saleId,anterior_sha256:r.solicitud.sha256,
    preparacion_sha256:proposal.sha256,sucesora_sha256:'b'.repeat(64),numero:r.solicitud.solicitud.numero,estado:kind==='RECHAZO'?'RECHAZO_CORREGIDO':'SUSTITUIDA',emision_habilitada:false}
   if(flags.loseWrite)throw new Error('SYNTHETIC_ACK_LOST')
   return envelope(saved)
  }
  if(cmd.accion==='SUSTITUCION_PREPARACION_FISCAL'||cmd.accion==='CORRECCION_RECHAZO_FISCAL'){
   if(cmd.accion!==(kind==='RECHAZO'?'CORRECCION_RECHAZO_FISCAL':'SUSTITUCION_PREPARACION_FISCAL'))return envelope(null)
   if(flags.loseRead)throw new Error('SYNTHETIC_READ_LOST')
   return envelope(saved&&cmd.operacion_id===r.operacion_id?(flags.wrongRead?{...saved,preparacion_sha256:'c'.repeat(64)}:saved):null)
  }
  if(cmd.accion==='CANCELAR_PREPARACION_FISCAL'){
   if(saved?.sucesora_id===cmd.operacion_id)throw new Error('BODY_RESERVED')
   cancelled.add(String(cmd.operacion_id));return envelope(null)
  }
  if(cmd.accion==='CANCELACION_PREPARACION_FISCAL')return envelope(cancelled.has(String(cmd.operacion_id))?{operacion_id:cmd.operacion_id,venta_id:scope.saleId,estado:'CANCELADA',emision_habilitada:false}:null)
  if(cmd.accion==='RESOLVER_VENTA')return envelope({venta_id:scope.saleId,operacion_id:saved?.sucesora_id??r.operacion_id,preparacion_sha256:'a'.repeat(64),estado:'RESERVADA',emision_habilitada:false})
  throw new Error('UNEXPECTED_COMMAND')
 })
 return {...f,r,flags,replace:()=>f.client.replace(r,input(),context,kind)}
}
it('sustitución guarda propuesta/UUID antes del POST y retira datos sólo después de lectura',async()=>{
 const f=await replacementFixture(),impl=f.send.getMockImplementation()!
 f.send.mockImplementation(async cmd=>{
  if(cmd.accion==='SUSTITUIR_PREPARACION_FISCAL'){
   const stored=f.client.pendingReplacement();expect(stored?.successorId).toBe(cmd.sucesora_id);expect(stored?.proposal).toEqual(cmd.propuesta)
   expect(f.client.pending()).toBeNull()
  }
  return impl(cmd)
 })
 const ack=await f.replace();expect(f.client.pendingReplacement()).toBeNull();expect(f.client.pending()).toEqual({version:1,operationId:ack.sucesora_id,input:null})
 expect([...f.map.values()].join('')).not.toContain('numeroDocumento')
})
it('respuesta de escritura perdida recupera cierre sin duplicar preparación',async()=>{
 const f=await replacementFixture();f.flags.loseWrite=true
 const ack=await f.replace();expect(ack.estado).toBe('SUSTITUIDA');expect(f.client.pendingReplacement()).toBeNull()
 expect(f.send.mock.calls.filter(([cmd])=>cmd.accion==='SUSTITUIR_PREPARACION_FISCAL')).toHaveLength(1)
})
it('reinicio consulta sustitución confirmada y retira propuesta sin otro POST',async()=>{
 const f=await replacementFixture();f.flags.loseRead=true;await expect(f.replace()).rejects.toThrow()
 const stored=f.client.pendingReplacement();expect(stored).not.toBeNull();f.flags.loseRead=false
 const api=createFiscalClient(scope,{storage:f.storage,send:f.send}),state=await api.resolve()
 expect(state.operacion_id).toBe(stored?.successorId);expect(api.pendingReplacement()).toBeNull();expect(api.pending()?.input).toBeNull()
 expect(f.send.mock.calls.filter(([cmd])=>cmd.accion==='SUSTITUIR_PREPARACION_FISCAL')).toHaveLength(1)
})
it('reintento de propuesta no confirmada conserva canónico y UUID tras reinicio',async()=>{
 const f=await replacementFixture();f.flags.commit=false;await expect(f.replace()).rejects.toThrow()
 const first=f.send.mock.calls[0][0],api=createFiscalClient(scope,{storage:f.storage,send:f.send});f.flags.commit=true
 await api.retryReplacement()
 const writes=f.send.mock.calls.filter(([cmd])=>cmd.accion==='SUSTITUIR_PREPARACION_FISCAL');expect(writes).toHaveLength(2);expect(writes[1][0]).toEqual(first)
})
it('otra propuesta o revisión no reemplaza un intento incierto',async()=>{
 const f=await replacementFixture();f.flags.commit=false;await expect(f.replace()).rejects.toThrow()
 const changed=input();changed.datos.fecha='20261023'
 await expect(f.client.replace(f.r,changed,context)).rejects.toThrow();await expect(f.client.replace({...f.r,operacion_id:crypto.randomUUID()},input(),context)).rejects.toThrow()
 expect(f.send.mock.calls.filter(([cmd])=>cmd.accion==='SUSTITUIR_PREPARACION_FISCAL')).toHaveLength(1)
})
it('dos instancias coordinadas crean una sola sucesora y la revisión anterior no se aprueba',async()=>{
 const f=await replacementFixture(),other=createFiscalClient(scope,{storage:f.storage,send:f.send}),approval=f.client.approvalId(f.r)
 const results=await Promise.allSettled([f.replace(),other.replace(f.r,input(),context)])
 expect(results.filter(v=>v.status==='fulfilled')).toHaveLength(1);expect(f.send.mock.calls.filter(([cmd])=>cmd.accion==='SUSTITUIR_PREPARACION_FISCAL')).toHaveLength(1)
 await expect(other.approve(f.r,approval)).rejects.toThrow();expect(f.send.mock.calls.some(([cmd])=>cmd.accion==='APROBAR_REVISION')).toBe(false)
})
it('propuesta incierta bloquea guardar, preparar, cancelar y aprobar el cuerpo previo',async()=>{
 const f=await replacementFixture(),approval=f.client.approvalId(f.r);f.flags.commit=false;await expect(f.replace()).rejects.toThrow();f.send.mockClear()
 await expect(f.client.save(input(),context)).rejects.toThrow();await expect(f.client.prepare(f.r.operacion_id)).rejects.toThrow()
 await expect(f.client.cancel(f.r.operacion_id)).rejects.toThrow();await expect(f.client.approve(f.r,approval)).rejects.toThrow()
 expect(f.send).not.toHaveBeenCalled()
})
it('sin almacenamiento confirmado no envía y datos inválidos no crean propuesta',async()=>{
 const f=await replacementFixture();await expect(f.client.replace(f.r,{...input(),datos:{...input().datos,fecha:'INVALID'}},context)).rejects.toThrow()
 expect(f.client.pendingReplacement()).toBeNull();f.storage.setItem=()=>{throw new Error('QUOTA')};await expect(f.replace()).rejects.toThrow();expect(f.send).not.toHaveBeenCalled()
})
it('lectura con hash ajeno no elimina la propuesta ni declara éxito',async()=>{
 const f=await replacementFixture();f.flags.wrongRead=true;await expect(f.replace()).rejects.toThrow();expect(f.client.pendingReplacement()).not.toBeNull();expect(f.client.pending()).toBeNull()
})
it('fallo al retirar propuesta mantiene recuperación con la misma identidad',async()=>{
 const f=await replacementFixture(),set=f.storage.setItem
 f.storage.setItem=(key,value)=>{if(key.endsWith(':replacement')&&value==='null')throw new Error('QUOTA');set(key,value)}
 await expect(f.replace()).rejects.toThrow();const next=f.client.pending()?.operationId;expect(next).toBe(f.client.pendingReplacement()?.successorId)
 f.storage.setItem=set;await f.client.resolve();expect(f.client.pendingReplacement()).toBeNull();expect(f.client.pending()?.operationId).toBe(next)
})
it('propuesta y contexto se copian antes de esperar el lock',async()=>{
 const f=await replacementFixture(),candidate=input(),ctx={...context},promise=f.client.replace(f.r,candidate,ctx)
 candidate.datos.fecha='INVALID';ctx.total='1.00';await promise
 const cmd=f.send.mock.calls[0][0],p=cmd.propuesta as {canonico:string};expect(JSON.parse(p.canonico).datos.importes.total).toBe('123.45')
})

it('descarta sólo UUID sucesor no creado y permite nueva propuesta sin liberar número',async()=>{
 const f=await replacementFixture();f.flags.commit=false;await expect(f.replace()).rejects.toThrow()
 const previous=f.client.pendingReplacement()!;expect(await f.client.cancelReplacement()).toBe('DESCARTADA');expect(f.client.pendingReplacement()).toBeNull()
 const command=f.send.mock.calls.find(([cmd])=>cmd.accion==='CANCELAR_PREPARACION_FISCAL')![0]
 expect(command.operacion_id).toBe(previous.successorId);expect(command.operacion_id).not.toBe(f.r.operacion_id)
 f.flags.commit=true;const next=await f.replace();expect(next.sucesora_id).not.toBe(previous.successorId);expect(next.numero).toBe(previous.numero)
})
it('si sustitución ganó el descarte, recupera su cierre sin cancelar cuerpo/número',async()=>{
 const f=await replacementFixture();f.flags.loseRead=true;await expect(f.replace()).rejects.toThrow();f.flags.loseRead=false
 expect(await f.client.cancelReplacement()).toBe('RECUPERADA');expect(f.client.pendingReplacement()).toBeNull()
 expect(f.send.mock.calls.some(([cmd])=>cmd.accion==='CANCELAR_PREPARACION_FISCAL')).toBe(false)
})
it('otra serie se rechaza localmente antes de crear pendiente o enviar',async()=>{
 const f=await replacementFixture();await expect(f.client.replace(f.r,input(),{...context,punto_venta:8})).rejects.toThrow()
 expect(f.client.pendingReplacement()).toBeNull();expect(f.send).not.toHaveBeenCalled()
})
it('respuesta tardía de sustitución no borra una propuesta/identidad nueva del almacenamiento',async()=>{
 const f=await replacementFixture();f.flags.loseRead=true;await expect(f.replace()).rejects.toThrow();f.flags.loseRead=false
 const old=f.client.pendingReplacement()!,third=crypto.randomUUID(),newer={...old,operationId:third,successorId:crypto.randomUUID()},impl=f.send.getMockImplementation()!
 f.send.mockImplementation(async cmd=>{
  const answer=await impl(cmd)
  if(cmd.accion==='SUSTITUCION_PREPARACION_FISCAL'){
   const correctionKey=[...f.map.keys()].find(key=>key.endsWith(':replacement'))!
   f.map.set(correctionKey,JSON.stringify(newer));f.map.set(correctionKey.slice(0,-':replacement'.length),JSON.stringify({version:1,operationId:third,input:null}))
  }
  return answer
 })
 await expect(f.client.retryReplacement()).rejects.toThrow();expect(f.client.pendingReplacement()).toEqual(newer);expect(f.client.pending()?.operationId).toBe(third)
})
it('otra terminal ganó: conserva propuesta ajena al ACK y permite descartar sólo UUID local',async()=>{
 const f=await replacementFixture();f.flags.commit=false;await expect(f.replace()).rejects.toThrow();const local=f.client.pendingReplacement()!,winner=crypto.randomUUID(),impl=f.send.getMockImplementation()!
 const winning={operacion_id:f.r.operacion_id,sucesora_id:winner,venta_id:scope.saleId,anterior_sha256:local.previousHash,preparacion_sha256:'d'.repeat(64),sucesora_sha256:'e'.repeat(64),numero:local.numero,estado:'SUSTITUIDA',emision_habilitada:false}
 f.send.mockImplementation(async cmd=>{
  if(cmd.accion==='RESOLVER_VENTA')return envelope({venta_id:scope.saleId,operacion_id:winner,preparacion_sha256:'d'.repeat(64),estado:'RESERVADA',emision_habilitada:false})
  if(cmd.accion==='SUSTITUCION_PREPARACION_FISCAL'&&cmd.operacion_id===f.r.operacion_id)return envelope(winning)
  return impl(cmd)
 })
 expect((await f.client.resolve()).operacion_id).toBe(winner);expect(f.client.pendingReplacement()).toEqual(local)
 expect(await f.client.cancelReplacement()).toBe('DESCARTADA');expect(f.client.pendingReplacement()).toBeNull()
 const cancel=f.send.mock.calls.find(([cmd])=>cmd.accion==='CANCELAR_PREPARACION_FISCAL')![0]
 expect(cancel.operacion_id).toBe(local.successorId);expect(cancel.operacion_id).not.toBe(winner)
 expect((await f.client.resolve()).operacion_id).toBe(winner)
})

it('consulta corrección R durable con venta capturada, sin modificar datos pendientes',async()=>{
 const f=fixture(),operation=crypto.randomUUID(),key='kioskopos:fiscal:v1:'+scope.authId+':'+scope.kioskId+':'+scope.saleId
 f.map.set(key,JSON.stringify({version:1,operationId:operation,input:input()}))
 const before=[...f.map.entries()]
 const result={operacion_id:operation,sucesora_id:crypto.randomUUID(),venta_id:scope.saleId,anterior_sha256:'a'.repeat(64),preparacion_sha256:'b'.repeat(64),sucesora_sha256:'c'.repeat(64),numero:1,estado:'RECHAZO_CORREGIDO',emision_habilitada:false}
 f.send.mockResolvedValue(envelope(result))
 expect(await f.client.rejectedCorrection(operation)).toEqual(result)
 expect(f.send).toHaveBeenCalledExactlyOnceWith({accion:'CORRECCION_RECHAZO_FISCAL',venta_id:scope.saleId,operacion_id:operation})
 expect([...f.map.entries()]).toEqual(before)
})
it('ausencia R y respuesta perdida no descartan ninguna propuesta local',async()=>{
 const f=fixture(),operation=crypto.randomUUID();f.map.set('sentinel','original')
 f.send.mockResolvedValueOnce(envelope(null));expect(await f.client.rejectedCorrection(operation)).toBeNull()
 f.send.mockRejectedValueOnce(new Error('offline'));await expect(f.client.rejectedCorrection(operation)).rejects.toThrow('offline')
 expect([...f.map.entries()]).toEqual([['sentinel','original']]);expect(f.send).toHaveBeenCalledTimes(2)
})
it('consulta R inválida no envía y respuesta de otra venta no modifica almacenamiento',async()=>{
 const f=fixture();await expect(f.client.rejectedCorrection('invalid')).rejects.toThrow();expect(f.send).not.toHaveBeenCalled()
 f.send.mockResolvedValue(envelope({operacion_id:crypto.randomUUID(),venta_id:crypto.randomUUID()}))
 await expect(f.client.rejectedCorrection(crypto.randomUUID())).rejects.toThrow();expect(f.map.size).toBe(0)
})

it('rechazo guarda propuesta v2 explícita antes de POST y nunca usa la ruta de reserva',async()=>{
 const f=await replacementFixture('RECHAZO'),impl=f.send.getMockImplementation()!
 f.send.mockImplementation(async cmd=>{
  if(cmd.accion==='CORREGIR_RECHAZO_FISCAL')expect(f.client.pendingReplacement()).toMatchObject({version:2,kind:'RECHAZO',successorId:cmd.sucesora_id,proposal:cmd.propuesta})
  return impl(cmd)
 })
 const ack=await f.replace();expect(ack.estado).toBe('RECHAZO_CORREGIDO');expect(f.client.pendingReplacement()).toBeNull()
 expect(f.send.mock.calls.map(([c])=>c.accion)).toEqual(['CORRECCION_RECHAZO_FISCAL','CORREGIR_RECHAZO_FISCAL','CORRECCION_RECHAZO_FISCAL'])
 expect(f.client.pending()?.operationId).toBe(ack.sucesora_id)
})
it('rechazo ACK perdido se recupera al reabrir sin POST ni nuevas consultas fiscales',async()=>{
 const f=await replacementFixture('RECHAZO');f.flags.loseWrite=true
 const impl=f.send.getMockImplementation()!;let written=false
 f.send.mockImplementation(async cmd=>{if(cmd.accion==='CORREGIR_RECHAZO_FISCAL'){written=true;return impl(cmd)}if(written&&cmd.accion==='CORRECCION_RECHAZO_FISCAL')throw new Error('lost read');return impl(cmd)})
 await expect(f.replace()).rejects.toThrow();const original=f.client.pendingReplacement()!
 f.send.mockImplementation(impl);f.send.mockClear()
 const reopened=createFiscalClient(scope,{storage:f.storage,send:f.send});await reopened.resolve()
 expect(reopened.pending()?.operationId).toBe(original.successorId);expect(reopened.pendingReplacement()).toBeNull()
 expect(f.send.mock.calls.some(([c])=>c.accion==='CORREGIR_RECHAZO_FISCAL')).toBe(false)
})
it('rechazo no confirmado conserva la misma propuesta y UUID al reintentar explícitamente',async()=>{
 const f=await replacementFixture('RECHAZO');f.flags.commit=false
 await expect(f.replace()).rejects.toThrow();const before=f.client.pendingReplacement()!
 const reopened=createFiscalClient(scope,{storage:f.storage,send:f.send});f.flags.commit=true
 const ack=await reopened.retryReplacement();expect(ack.sucesora_id).toBe(before.successorId)
 const writes=f.send.mock.calls.filter(([c])=>c.accion==='CORREGIR_RECHAZO_FISCAL');expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1])
})
it('descarte de rechazo cierra sólo la sucesora no creada, conservando cuerpo original',async()=>{
 const f=await replacementFixture('RECHAZO');f.flags.commit=false
 await expect(f.replace()).rejects.toThrow();const record=f.client.pendingReplacement()!
 expect(await f.client.cancelReplacement()).toBe('DESCARTADA');expect(f.client.pendingReplacement()).toBeNull()
 const writes=f.send.mock.calls.filter(([c])=>c.accion==='CANCELAR_PREPARACION_FISCAL')
 expect(writes).toHaveLength(1);expect(writes[0][0].operacion_id).toBe(record.successorId)
 expect(writes[0][0].operacion_id).not.toBe(f.r.operacion_id)
})
it('propuesta R impide aprobar, preparar, guardar, cancelar y convertirla en reserva',async()=>{
 const f=await replacementFixture('RECHAZO');f.flags.commit=false;await expect(f.replace()).rejects.toThrow()
 const record=f.client.pendingReplacement()!,count=f.send.mock.calls.length
 await expect(f.client.save(input(),context)).rejects.toThrow();await expect(f.client.prepare(f.r.operacion_id)).rejects.toThrow()
 await expect(f.client.cancel(f.r.operacion_id)).rejects.toThrow();await expect(f.client.replace({...f.r,estado:'RESERVADA'},input(),context)).rejects.toThrow()
 await expect(f.client.approve(f.r,crypto.randomUUID())).rejects.toThrow()
 expect(f.send.mock.calls.length).toBe(count);expect(f.client.pendingReplacement()).toEqual(record)
})
it('versión desconocida o v2 sin clase explícita no ejecuta POST',async()=>{
 const f=await replacementFixture('RECHAZO');f.flags.commit=false;await expect(f.replace()).rejects.toThrow()
 const entry=[...f.map.entries()].find(([key])=>key.endsWith(':replacement'))!
 for(const bad of [{...f.client.pendingReplacement(),version:3},{...f.client.pendingReplacement(),kind:undefined}]){
  f.map.set(entry[0],JSON.stringify(bad));f.send.mockClear();await expect(f.client.retryReplacement()).rejects.toThrow();expect(f.send).not.toHaveBeenCalled()
  f.map.set(entry[0],entry[1])
 }
})

async function observationFixture(){
 const f=fixture(),r=await review();r.estado='ENVIO_INCIERTO'
 const flags={commit:true,loseWrite:false,loseReadAfterCommit:false};let stored:Record<string,unknown>|null=null
 f.send.mockImplementation(async cmd=>{
  if(cmd.accion==='CONCILIAR'){
   if(flags.commit)stored={version:1,operacion_id:r.operacion_id,numero:r.solicitud.solicitud.numero,estado:'PENDIENTE_CONCILIACION',solicitud_sha256:r.solicitud.sha256,revision:1,emision_habilitada:false}
   if(flags.loseWrite)throw new Error('SYNTHETIC_ACK_LOST')
   return envelope(stored)
  }
  if(cmd.accion==='CONSULTAR_CONCILIACION'){
   if(stored&&flags.loseReadAfterCommit)throw new Error('SYNTHETIC_READ_LOST')
   return envelope(stored)
  }
  if(cmd.accion==='RESOLVER_VENTA')return envelope({venta_id:scope.saleId,operacion_id:r.operacion_id,estado:'ENVIO_INCIERTO',preparacion_sha256:'a'.repeat(64),emision_habilitada:false})
  throw new Error('UNEXPECTED_OBSERVATION_COMMAND')
 })
 return {...f,r,flags,run:()=>f.client.reconcile(r)}
}
it('consulta guarda UUID/hash/número sin PII antes de POST y confirma sólo por GET',async()=>{
 const f=await observationFixture(),impl=f.send.getMockImplementation()!
 f.send.mockImplementation(async c=>{if(c.accion==='CONCILIAR')expect(f.client.pendingObservation()).toMatchObject({version:1,operationId:f.r.operacion_id,observationId:c.observacion_id,hash:f.r.solicitud.sha256,numero:1});return impl(c)})
 expect((await f.run()).estado).toBe('PENDIENTE_CONCILIACION');expect(f.client.pendingObservation()).toBeNull()
 expect(f.send.mock.calls.map(([c])=>c.accion)).toEqual(['CONSULTAR_CONCILIACION','CONCILIAR','CONSULTAR_CONCILIACION'])
 expect([...f.map.values()].join('')).not.toMatch(/numeroDocumento|canonico|cae/)
})
it('ACK perdido y lectura fallida conservan registro; reabrir sólo recupera GET del mismo UUID',async()=>{
 const f=await observationFixture();f.flags.loseWrite=true;f.flags.loseReadAfterCommit=true
 await expect(f.run()).rejects.toThrow();const pending=f.client.pendingObservation()!
 f.flags.loseReadAfterCommit=false;f.send.mockClear()
 const next=createFiscalClient(scope,{storage:f.storage,send:f.send});await next.resolve()
 expect(next.pendingObservation()).toBeNull();expect(f.send.mock.calls.some(([c])=>c.accion==='CONCILIAR')).toBe(false)
 expect(f.send.mock.calls.find(([c])=>c.accion==='CONSULTAR_CONCILIACION')![0].observacion_id).toBe(pending.observationId)
})
it('consulta sin commit mantiene UUID y reintento explícito usa exactamente el mismo intento',async()=>{
 const f=await observationFixture();f.flags.commit=false;await expect(f.run()).rejects.toThrow();const pending=f.client.pendingObservation()!
 await f.client.resolve();expect(f.client.pendingObservation()).toEqual(pending)
 expect(f.send.mock.calls.filter(([c])=>c.accion==='CONCILIAR')).toHaveLength(1)
 f.flags.commit=true;await f.client.retryReconciliation()
 const posts=f.send.mock.calls.filter(([c])=>c.accion==='CONCILIAR');expect(posts).toHaveLength(2);expect(posts[0]).toEqual(posts[1]);expect(f.client.pendingObservation()).toBeNull()
})
it('ACK positivo falso sin registro durable no borra observación',async()=>{
 const f=await observationFixture();f.flags.commit=false;const original=f.send.getMockImplementation()!
 f.send.mockImplementation(c=>c.accion==='CONCILIAR'?Promise.resolve(envelope({version:1,operacion_id:f.r.operacion_id,numero:1,estado:'AUTORIZADA',solicitud_sha256:f.r.solicitud.sha256,revision:2,cae:'11111111111111',vencimiento:'20261031',procesado_en:null,emision_habilitada:false})):original(c))
 await expect(f.run()).rejects.toThrow();expect(f.client.pendingObservation()).not.toBeNull()
})
it('lectura inicial incierta no dispara POST y registro local queda intacto',async()=>{
 const f=await observationFixture();f.send.mockRejectedValue(new Error('offline'))
 await expect(f.run()).rejects.toThrow('offline');const before=f.client.pendingObservation()
 await expect(f.client.retryReconciliation()).rejects.toThrow('offline');expect(f.client.pendingObservation()).toEqual(before)
 expect(f.send.mock.calls.every(([c])=>c.accion==='CONSULTAR_CONCILIACION')).toBe(true)
})
it.each(['hash','numero','privado','operacion'])('getter de observación %s incoherente no retira registro',async mode=>{
 const f=await observationFixture();f.flags.commit=false;await expect(f.run()).rejects.toThrow();const record=f.client.pendingObservation()!
 const data:Record<string,unknown>={version:1,operacion_id:record.operationId,numero:record.numero,estado:'PENDIENTE_CONCILIACION',solicitud_sha256:record.hash,revision:1,emision_habilitada:false}
 if(mode==='hash')data.solicitud_sha256='b'.repeat(64);if(mode==='numero')data.numero=2;if(mode==='privado')data.binding={key:'PRIVATE'};if(mode==='operacion')data.operacion_id=crypto.randomUUID()
 f.send.mockResolvedValue(envelope(data));await expect(f.client.retryReconciliation()).rejects.toThrow();expect(f.client.pendingObservation()).toEqual(record)
})
it('observación incierta bloquea corrección, guardado, aprobación y cancelación',async()=>{
 const f=await observationFixture();f.flags.commit=false;await expect(f.run()).rejects.toThrow();const record=f.client.pendingObservation(),count=f.send.mock.calls.length
 await expect(f.client.save(input(),context)).rejects.toThrow();await expect(f.client.prepare(f.r.operacion_id)).rejects.toThrow();await expect(f.client.cancel(f.r.operacion_id)).rejects.toThrow()
 await expect(f.client.replace(f.r,input(),context,'RECHAZO')).rejects.toThrow();await expect(f.client.approve(f.r,crypto.randomUUID())).rejects.toThrow()
 expect(f.send.mock.calls.length).toBe(count);expect(f.client.pendingObservation()).toEqual(record)
})
it('error de almacenamiento antes de consulta no envía nada',async()=>{
 const f=await observationFixture(),api=createFiscalClient(scope,{storage:{getItem:f.storage.getItem,setItem:()=>{throw new Error('quota')}},send:f.send})
 await expect(api.reconcile(f.r)).rejects.toThrow('quota');expect(f.send).not.toHaveBeenCalled()
})
it('constancia autorizada por otra consulta cierra intento local obsoleto sin atribuirle ejecución',async()=>{
 const f=await observationFixture();f.flags.commit=false;await expect(f.run()).rejects.toThrow();f.send.mockClear()
 f.send.mockImplementation(async c=>envelope(c.accion==='RESOLVER_VENTA'?{venta_id:scope.saleId,operacion_id:f.r.operacion_id,estado:'AUTORIZADA',preparacion_sha256:'a'.repeat(64),emision_habilitada:false}:c.accion==='CONSTANCIA_COMPROBANTE'?{version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',operacion_id:f.r.operacion_id,venta_id:scope.saleId,solicitud:f.r.solicitud,autorizacion:{cae:'11111111111111',vencimiento:'20261031',procesado_en:null}}:null))
 expect((await f.client.resolve()).estado).toBe('AUTORIZADA');expect(f.client.pendingObservation()).toBeNull();expect(f.send.mock.calls.some(([c])=>c.accion==='CONCILIAR')).toBe(false)
})
it('ACK atrasado no elimina otra observación guardada',async()=>{
 const f=await observationFixture();f.flags.commit=false;await expect(f.run()).rejects.toThrow();const record=f.client.pendingObservation()!,key=[...f.map.keys()].find(k=>k.endsWith(':reconciliation'))!
 const newer={...record,observationId:crypto.randomUUID()}
 f.send.mockImplementation(async()=>{f.map.set(key,JSON.stringify(newer));return envelope({version:1,operacion_id:record.operationId,numero:1,estado:'PENDIENTE_CONCILIACION',solicitud_sha256:record.hash,revision:1,emision_habilitada:false})})
 await expect(f.client.retryReconciliation()).rejects.toThrow();expect(f.client.pendingObservation()).toEqual(newer)
})
