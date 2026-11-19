import { it,expect,vi } from 'vitest'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { applyFiscalCreditCommercialOperation } from '../../supabase/functions/_shared/fiscalCreditCommercialWorker'
import { FISCAL_STAGING_URL } from '../../supabase/functions/_shared/fiscalSupabaseAdmin'
const actor=crypto.randomUUID(),scope={saleId:crypto.randomUUID(),operationId:crypto.randomUUID(),requestId:crypto.randomUUID(),sha256:'a'.repeat(64)},cash=crypto.randomUUID()
function fixture(){const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:actor}},error:null})),rpc=vi.fn<FiscalAuthClient['rpc']>(async()=>({data:null,error:null})),flags:Record<string,string>={SUPABASE_URL:FISCAL_STAGING_URL,ARCA_HOMO_BACKEND_ENABLED:'true'};return{getUser,rpc,flags,deps:{admin:{auth:{getUser},rpc},readSecret:(name:string)=>flags[name]}}}
it.each(['url','backend','token','scope','cash'])('servicio052 entrada inválida %s no llama Auth/RPC',async kind=>{const f=fixture();if(kind==='url')f.flags.SUPABASE_URL='https://example.org';if(kind==='backend')f.flags.ARCA_HOMO_BACKEND_ENABLED='false';await expect(applyFiscalCreditCommercialOperation(f.deps,kind==='token'?'bad token':'SYNTHETIC_JWT',kind==='scope'?{...scope,sha256:'bad'}:scope,kind==='cash'?'bad':cash)).rejects.toThrow('FISCAL_APLICACION_NC_NO_CONFIRMADA');expect(f.getUser).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled()})
it('servicio052 abort previo y durante Auth nunca permite una mutación tardía',async()=>{
 const f=fixture(),controller=new AbortController();controller.abort();await expect(applyFiscalCreditCommercialOperation({...f.deps,signal:controller.signal},'SYNTHETIC_JWT',scope,cash)).rejects.toThrow();expect(f.getUser).not.toHaveBeenCalled()
 const running=new AbortController();let release:((value:Awaited<ReturnType<FiscalAuthClient['auth']['getUser']>>)=>void)|undefined
 f.getUser.mockImplementation(()=>new Promise(resolve=>{release=resolve}))
 const result=applyFiscalCreditCommercialOperation({...f.deps,signal:running.signal},'SYNTHETIC_JWT',scope,cash);running.abort();await expect(result).rejects.toThrow('FISCAL_APLICACION_NC_NO_CONFIRMADA');release?.({data:{user:{id:actor}},error:null});expect(f.rpc).not.toHaveBeenCalled()
})
it('servicio052 captura expectedActor antes de Auth y no acepta reasignarlo durante espera',async()=>{
 const f=fixture(),other=crypto.randomUUID(),deps={...f.deps,expectedActorAuthId:actor}
 f.getUser.mockImplementation(async()=>{deps.expectedActorAuthId=other;return{data:{user:{id:other}},error:null}})
 await expect(applyFiscalCreditCommercialOperation(deps,'SYNTHETIC_JWT',scope,cash)).rejects.toThrow('FISCAL_APLICACION_NC_NO_CONFIRMADA');expect(f.rpc).not.toHaveBeenCalled()
})
it('servicio052 captura scope antes de Auth y conserva error sanitizado',async()=>{
 const f=fixture(),mutable={...scope},original=mutable.requestId
 f.getUser.mockImplementation(async()=>{mutable.requestId=crypto.randomUUID();return{data:{user:{id:actor}},error:null}})
 f.rpc.mockImplementation(async(name,args)=>{expect(name).toBe('cargar_aplicacion_comercial_nc_homologacion');expect(args.p_caso).toBe(original);return{data:null,error:new Error('PRIVATE_DIAGNOSTIC')}})
 await expect(applyFiscalCreditCommercialOperation(f.deps,'SYNTHETIC_JWT',mutable,cash)).rejects.toThrow(/^FISCAL_APLICACION_NC_NO_CONFIRMADA$/)
})

it('servicio052 lectura ausente no consulta flag APPLY ni registra efectos',async()=>{
 const f=fixture(),{loadFiscalCreditCommercialOperation}=await import('../../supabase/functions/_shared/fiscalCreditCommercialWorker')
 const readSecret=vi.fn(f.deps.readSecret)
 expect(await loadFiscalCreditCommercialOperation({...f.deps,readSecret},'SYNTHETIC_JWT',scope)).toBeNull()
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.rpc).toHaveBeenCalledExactlyOnceWith('cargar_aplicacion_comercial_nc_homologacion',{p_actor:actor,p_venta:scope.saleId,p_operacion:scope.operationId,p_caso:scope.requestId,p_sha:scope.sha256});expect(readSecret.mock.calls.some(([key])=>key==='ARCA_HOMO_CREDIT_APPLY_ENABLED')).toBe(false)
})