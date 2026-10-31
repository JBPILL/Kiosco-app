// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { prepareFiscalPresentationFacts } from '../../supabase/functions/_shared/fiscalPresentation'
import { loadFiscalPresentation,saveFiscalPresentation } from '../../supabase/functions/_shared/fiscalPresentationService'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
const actor=crypto.randomUUID(),sale=crypto.randomUUID(),op=crypto.randomUUID(),body='a'.repeat(64)
async function fixture(){
 const p=await prepareFiscalPresentationFacts({version:1,emisor:{razon_social:'Ensayo',domicilio_comercial:'Calle 1',ingresos_brutos:'Exento',inicio_actividades:'20200101'},receptor:{nombre:'Consumidor final',domicilio:'Sin identificar'},lineas:[{detalle_id:crypto.randomUUID(),descripcion:'Artículo'}],otros_impuestos_nacionales_indirectos:'0.00'})
 const record={operacion_id:op,venta_id:sale,solicitud_sha256:body,presentacion_sha256:p.sha256,estado:'DATOS_REPRESENTACION_GUARDADOS',emision_habilitada:false,canonico:p.canonico}
 const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:actor}},error:null}))
 let durable:unknown=record
 const rpc=vi.fn<FiscalAuthClient['rpc']>(async name=>({data:name==='cargar_presentacion_fiscal_homologacion'?durable:{fake:true},error:null}))
 return {p,record,rpc,getUser,admin:{auth:{getUser},rpc},set:(v:unknown)=>{durable=v}}
}
it('presentation service ignores write ACK and reads exact durable facts using captured Auth once',async()=>{
 const f=await fixture();const result=await saveFiscalPresentation(f.admin,'SYNTHETIC_JWT',sale,op,body,{canonico:f.p.canonico,sha256:f.p.sha256})
 expect(result.presentacion_sha256).toBe(f.p.sha256);expect(f.getUser).toHaveBeenCalledTimes(1)
 expect(f.rpc.mock.calls.map(([name])=>name)).toEqual(['guardar_presentacion_fiscal_homologacion','cargar_presentacion_fiscal_homologacion'])
 expect(f.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===actor)).toBe(true)
})
it('presentation service recovers lost write ACK without repeating mutation',async()=>{
 const f=await fixture(),base=f.rpc.getMockImplementation()!
 f.rpc.mockImplementation(async(name,args)=>{if(name==='guardar_presentacion_fiscal_homologacion')throw new Error('PRIVATE_SECRET');return base(name,args)})
 expect((await saveFiscalPresentation(f.admin,'SYNTHETIC_JWT',sale,op,body,{canonico:f.p.canonico,sha256:f.p.sha256})).canonico).toBe(f.p.canonico)
 expect(f.rpc).toHaveBeenCalledTimes(2)
})
it.each(['missing','hash','body','scope','enabled'])('presentation service rejects unconfirmed durable state %s',async kind=>{
 const f=await fixture();f.set(kind==='missing'?null:{...f.record,...(kind==='hash'?{presentacion_sha256:'b'.repeat(64)}:kind==='body'?{solicitud_sha256:'b'.repeat(64)}:kind==='scope'?{venta_id:op}:{emision_habilitada:true})})
 await expect(saveFiscalPresentation(f.admin,'SYNTHETIC_JWT',sale,op,body,{canonico:f.p.canonico,sha256:f.p.sha256})).rejects.toThrow('FISCAL_PRESENTACION_NO_CONFIRMADA')
})
it('presentation read returns absent facts without fabricating defaults',async()=>{
 const f=await fixture();f.set(null);expect(await loadFiscalPresentation(f.admin,'SYNTHETIC_JWT',sale,op)).toBeNull()
 expect(f.rpc).toHaveBeenCalledTimes(1)
})
it('presentation Auth failure sanitizes private error and performs no RPC',async()=>{
 const f=await fixture();f.getUser.mockRejectedValue(new Error('PRIVATE_SECRET'))
 await expect(loadFiscalPresentation(f.admin,'SYNTHETIC_JWT',sale,op)).rejects.toThrow('FISCAL_PRESENTACION_NO_CONFIRMADA')
 expect(f.rpc).not.toHaveBeenCalled()
})
