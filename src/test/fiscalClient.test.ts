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
it('dos validaciones simultáneas conservan un solo UUID antes del ACK',async()=>{
 const f=fixture(),implementation=f.send.getMockImplementation()!
 let release!:()=>void;const gate=new Promise<void>(done=>{release=done})
 f.send.mockImplementation(async cmd=>{await gate;return implementation(cmd)})
 const first=f.client.save(input(),context),second=f.client.save(input(),context)
 await vi.waitFor(()=>expect(f.send).toHaveBeenCalledTimes(2));release()
 await Promise.all([first,second])
 expect(f.send.mock.calls[0][0]).toEqual(f.send.mock.calls[1][0])
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
