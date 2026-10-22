// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { loadFiscalPreparation, saveFiscalPreparation } from '../../supabase/functions/_shared/fiscalPreparationService'
import type { FiscalPreparationContext } from '../../supabase/functions/_shared/fiscalPreparationContract'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { wsfeSample } from './fixtures/fiscalWsfe'
import { createFiscalSupabaseAdmin, FISCAL_STAGING_URL } from '../../supabase/functions/_shared/fiscalSupabaseAdmin'
const sale=crypto.randomUUID(),actor=crypto.randomUUID(),operation=crypto.randomUUID()
const context:FiscalPreparationContext={version:1,venta_id:sale,total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,incluye_recepcion_envases:false,revision_parametros:3,condiciones:[{id:5,descripcion:'Ensayo',comprobantes:[11]}],alicuotas:[]}
function input(){
 const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,numero:_n,...data}=wsfeSample
 const {total:_t,...importes}=data.importes
 return {condicionEmisor:'MONOTRIBUTO',datos:{...data,importes}}
}
function fixture(){
 const flags:Record<string,string>={SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',ARCA_HOMO_BACKEND_ENABLED:'true'}
 const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>().mockResolvedValue({data:{user:{id:actor}},error:null})
 const rpc=vi.fn<FiscalAuthClient['rpc']>(async(name,args)=>({data:name==='cargar_datos_preparacion_homologacion'?context:{operacion_id:args.p_operacion_id,venta_id:args.p_venta_id,preparacion_sha256:args.p_sha,estado:'DATOS_PREPARADOS',emision_habilitada:false},error:null}))
 const deps={admin:{auth:{getUser},rpc},readSecret:(name:string)=>flags[name]}
 return {deps,flags,getUser,rpc,save:()=>saveFiscalPreparation(deps,'SYNTHETIC_JWT',sale,operation,input())}
}
it('propaga Auth verificado una vez y nunca infiere identidad desde un perfil',async()=>{
 const f=fixture(),ack=await f.save()
 expect(f.getUser).toHaveBeenCalledExactlyOnceWith('SYNTHETIC_JWT')
 expect(f.rpc.mock.calls.map(([name])=>name)).toEqual(['cargar_datos_preparacion_homologacion','guardar_datos_preparacion_homologacion'])
 for(const [,args] of f.rpc.mock.calls)expect(args.p_actor_auth_id).toBe(actor)
 expect(ack).toMatchObject({operacion_id:operation,venta_id:sale,estado:'DATOS_PREPARADOS',emision_habilitada:false})
 const args=f.rpc.mock.calls[1][1],body=JSON.parse(String(args.p_canonico))
 expect(body.datos.puntoVenta).toBe(7);expect(body.revision_parametros).toBe(3);expect(body.datos).not.toHaveProperty('numero')
})
it.each(['SUPABASE_URL','ARCA_HOMO_BACKEND_ENABLED'])('gate %s cierra antes de Auth y DB',async name=>{
 const f=fixture();f.flags[name]='disabled';await expect(f.save()).rejects.toThrow('FISCAL_PREPARACION_NO_CONFIRMADA')
 expect(f.getUser).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled()
})
it('JWT no confirmado no consulta una venta',async()=>{
 const f=fixture();f.getUser.mockResolvedValue({data:{user:null},error:new Error('private')})
 await expect(f.save()).rejects.toThrow('FISCAL_PREPARACION_NO_CONFIRMADA');expect(f.rpc).not.toHaveBeenCalled()
})
it('contexto ajeno o con metadatos privados no llega a escritura',async()=>{
 for(const data of [{...context,venta_id:crypto.randomUUID()},{...context,credencial_id:crypto.randomUUID()}]){
  const f=fixture();f.rpc.mockResolvedValueOnce({data,error:null});await expect(f.save()).rejects.toThrow();expect(f.rpc).toHaveBeenCalledTimes(1)
 }
})
it('datos incompletos/envases bloquean antes de persistir',async()=>{
 const f=fixture();await expect(saveFiscalPreparation(f.deps,'SYNTHETIC_JWT',sale,operation,{})).rejects.toThrow();expect(f.rpc).toHaveBeenCalledTimes(1)
 const g=fixture();g.rpc.mockResolvedValueOnce({data:{...context,incluye_recepcion_envases:true},error:null});await expect(g.save()).rejects.toThrow();expect(g.rpc).toHaveBeenCalledTimes(1)
})
it('fallo/ACK perdido conserva UUID y cuerpo exactos al reintentar',async()=>{
 const f=fixture();let first=true
 const implementation=f.rpc.getMockImplementation()!
 f.rpc.mockImplementation(async(name,args)=>{if(name==='guardar_datos_preparacion_homologacion'&&first){first=false;return {data:null,error:new Error('lost')}}return implementation(name,args)})
 await expect(f.save()).rejects.toThrow();await f.save()
 const writes=f.rpc.mock.calls.filter(([name])=>name==='guardar_datos_preparacion_homologacion')
 expect(writes).toHaveLength(2);expect(writes[0]).toEqual(writes[1])
})
it.each(['operacion_id','preparacion_sha256','emision_habilitada'])('ACK con %s distinto no da éxito',async field=>{
 const f=fixture();f.rpc.mockResolvedValueOnce({data:context,error:null}).mockResolvedValueOnce({data:{operacion_id:operation,venta_id:sale,preparacion_sha256:'a'.repeat(64),estado:'DATOS_PREPARADOS',emision_habilitada:false,[field]:'wrong'},error:null})
 await expect(f.save()).rejects.toThrow('FISCAL_PREPARACION_NO_CONFIRMADA')
})
it('carga contexto público sin preparación, TA ni emisión',async()=>{
 const f=fixture();expect(await loadFiscalPreparation(f.deps,'SYNTHETIC_JWT',sale)).toEqual(context);expect(f.rpc).toHaveBeenCalledTimes(1)
})
it('compone SDK real con Auth/contexto/guardado mock, sólo destinos permitidos y sin red fiscal',async()=>{
 const paths:string[]=[]
 const fetcher=vi.fn<typeof fetch>(async input=>{
  const request=new Request(input),path=new URL(request.url).pathname;paths.push(path)
  expect(new URL(request.url).origin).toBe(FISCAL_STAGING_URL);expect(request.redirect).toBe('error')
  if(path==='/auth/v1/user')return new Response(JSON.stringify({id:actor}),{headers:{'content-type':'application/json'}})
  if(path.endsWith('/cargar_datos_preparacion_homologacion'))return new Response(JSON.stringify(context),{headers:{'content-type':'application/json'}})
  expect(path).toBe('/rest/v1/rpc/guardar_datos_preparacion_homologacion')
  const args=await request.json() as Record<string,unknown>
  return new Response(JSON.stringify({operacion_id:args.p_operacion_id,venta_id:args.p_venta_id,preparacion_sha256:args.p_sha,estado:'DATOS_PREPARADOS',emision_habilitada:false}),{headers:{'content-type':'application/json'}})
 })
 const f=fixture(),deps={...f.deps,admin:createFiscalSupabaseAdmin(FISCAL_STAGING_URL,'SYNTHETIC_PRIVATE_SERVICE_VALUE',fetcher)}
 expect((await saveFiscalPreparation(deps,'SYNTHETIC_JWT',sale,operation,input())).operacion_id).toBe(operation)
 expect(paths).toEqual(['/auth/v1/user','/rest/v1/rpc/cargar_datos_preparacion_homologacion','/rest/v1/rpc/guardar_datos_preparacion_homologacion'])
})
