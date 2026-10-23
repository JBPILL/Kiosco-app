// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { createFiscalClient } from '../lib/fiscalClient'
import { prepareFiscalPresentationFacts } from '../../supabase/functions/_shared/fiscalPresentation'
import { freezeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import { wsfeSample } from './fixtures/fiscalWsfe'
async function fixture(){
 const scope={authId:crypto.randomUUID(),kioskId:crypto.randomUUID(),saleId:crypto.randomUUID()},operation=crypto.randomUUID(),detail=crypto.randomUUID(),frozen=await freezeFiscalRequest(wsfeSample)
 const review={operacion_id:operation,estado:'RESERVADA' as const,revision:1,solicitud:frozen,aprobacion:null}
 const context={venta_id:scope.saleId,operacion_id:operation,solicitud_sha256:frozen.sha256,lineas:[{detalle_id:detail,cantidad:'1.000',precio_unitario:'123.45',subtotal:'123.45'}]}
 const facts={version:1,emisor:{razon_social:'Nombre histórico',domicilio_comercial:'Calle 1',ingresos_brutos:'Exento',inicio_actividades:'20200101'},receptor:{nombre:'Receptor histórico',domicilio:'Calle 2'},lineas:[{detalle_id:detail,descripcion:'Descripción histórica'}],otros_impuestos_nacionales_indirectos:'0.00'}
 const proposal=await prepareFiscalPresentationFacts(facts),wire={operacion_id:operation,venta_id:scope.saleId,solicitud_sha256:frozen.sha256,presentacion_sha256:proposal.sha256,estado:'DATOS_REPRESENTACION_GUARDADOS',emision_habilitada:false,canonico:proposal.canonico}
 const map=new Map<string,string>(),wrap=(resultado:unknown)=>({version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado})
 const send=vi.fn(async(command:Record<string,unknown>)=>wrap(command.accion==='DATOS_REPRESENTACION'?wire:{fake:true}))
 const api=createFiscalClient(scope,{storage:{getItem:k=>map.get(k)??null,setItem:(k,v)=>{map.set(k,v)},removeItem:k=>{map.delete(k)}},send})
 return {api,scope,review,context,facts,wire,send,map,wrap}
}
it.each(['date','tax','line','body'])('client rejects inconsistent representation %s before POST',async kind=>{
 const f=await fixture()
 if(kind==='date')f.facts.emisor.inicio_actividades='20990101'
 if(kind==='tax')f.facts.otros_impuestos_nacionales_indirectos='999999.00'
 if(kind==='line')f.facts.lineas[0].detalle_id=crypto.randomUUID()
 if(kind==='body')f.context.solicitud_sha256='c'.repeat(64)
 await expect(f.api.savePresentation(f.review,f.context,f.facts)).rejects.toThrow();expect(f.send).not.toHaveBeenCalled();expect(f.map.size).toBe(0)
})
it('fake save ACK cannot confirm a missing historical record',async()=>{
 const f=await fixture();f.send.mockImplementation(async command=>f.wrap(command.accion==='DATOS_REPRESENTACION'?null:f.wire))
 await expect(f.api.savePresentation(f.review,f.context,f.facts)).rejects.toThrow()
 expect(f.map.size).toBe(0)
})
it('lost save response recovers exact facts without persisting receiver data',async()=>{
 const f=await fixture();f.send.mockImplementation(async command=>{if(command.accion==='GUARDAR_REPRESENTACION')throw new Error('LOST');return f.wrap(f.wire)})
 const record=await f.api.savePresentation(f.review,f.context,f.facts)
 expect(record.datos.receptor.nombre).toBe(f.facts.receptor.nombre);expect(f.map.size).toBe(0);expect(f.send).toHaveBeenCalledTimes(2)
})
it('source and facts are captured before asynchronous hashing',async()=>{
 const f=await fixture(),task=f.api.savePresentation(f.review,f.context,f.facts)
 f.context.lineas[0].detalle_id=crypto.randomUUID();f.facts.receptor.nombre='Changed during hashing'
 const record=await task;expect(record.datos.receptor.nombre).toBe('Receptor histórico')
})
