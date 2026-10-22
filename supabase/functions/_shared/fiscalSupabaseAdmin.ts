import { createClient } from '@supabase/supabase-js'
import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import { withFiscalDeadline } from './fiscalVoucherXml.ts'

export const FISCAL_STAGING_URL='https://acoyfwwmhaeruciyedri.supabase.co'
const rpcNames=new Set([
  'autorizar_consulta_fiscal_homologacion','consultar_reconciliacion_homologacion',
  'cargar_contexto_conciliacion_homologacion','registrar_reconciliacion_fiscal_homologacion',
  'solicitar_ta_homologacion','iniciar_envio_ta_homologacion','confirmar_ta_homologacion',
  'cancelar_preparacion_ta_homologacion','consultar_preparacion_ta_homologacion',
  'cargar_preparacion_envio_homologacion','registrar_envio_revisado_homologacion',
  'cargar_revision_fiscal_homologacion','aprobar_revision_fiscal_homologacion',
])
const fail=():never=>{throw new Error('FISCAL_SERVICIO_PRIVADO_NO_DISPONIBLE')}

/** Cliente exclusivamente servidor. JWT se verifica mediante Auth.getUser;
 * no usa sesión local. No permite tablas, emisión ni destinos alternativos. */
export function createFiscalSupabaseAdmin(url:string,secret:string,fetcher:typeof fetch):FiscalAuthClient {
  if(url!==FISCAL_STAGING_URL||typeof secret!=='string'||secret.length<16||secret.length>16384||/\s/.test(secret))return fail()
  const bounded:typeof fetch=async(input,init)=>{
    const controller=new AbortController()
    let timer:ReturnType<typeof setTimeout>|undefined,request:Request|undefined,response:Response|undefined
    const abort=()=>controller.abort()
    try {
      request=new Request(input,init)
      const target=new URL(request.url),rpc=target.pathname.slice('/rest/v1/rpc/'.length)
      if(target.origin!==FISCAL_STAGING_URL||target.username||target.password||target.search||target.hash
        ||!((request.method==='GET'&&target.pathname==='/auth/v1/user')
        ||(request.method==='POST'&&target.pathname.startsWith('/rest/v1/rpc/')&&rpcNames.has(rpc))))return fail()
      if(request.signal.aborted)return fail()
      request.signal.addEventListener('abort',abort,{once:true});timer=setTimeout(abort,15000)
      response=await withFiscalDeadline(fetcher(new Request(request,{redirect:'error',signal:controller.signal})),controller.signal)
      if(response.redirected)return fail()
      const reader=response.body?.getReader(),chunks:Uint8Array[]=[];let size=0
      if(reader)try {
        while(true){const part=await withFiscalDeadline(reader.read(),controller.signal);if(part.done)break
          size+=part.value.length;if(size>2097152)return fail();chunks.push(part.value)}
      }finally{void reader.cancel().catch(()=>{});reader.releaseLock()}
      const body=new Uint8Array(size);let offset=0
      for(const chunk of chunks){body.set(chunk,offset);offset+=chunk.length}
      const headers=new Headers(response.headers);headers.delete('content-encoding');headers.delete('content-length')
      return new Response([204,205,304].includes(response.status)?null:body,{status:response.status,headers})
    }catch{return fail()}finally{
      if(timer)clearTimeout(timer);controller.abort();request?.signal.removeEventListener('abort',abort)
      if(response?.body&&!response.body.locked)void response.body.cancel().catch(()=>{})
    }
  }
  const client=createClient(url,secret,{
    auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},
    db:{retry:false,timeout:10000},global:{fetch:bounded},
  })
  return {
    auth:{async getUser(token){
      try{const {data,error}=await client.auth.getUser(token);return {data:{user:data.user?{id:data.user.id}:null},error}}
      catch{return {data:{user:null},error:new Error('FISCAL_SESION_NO_CONFIRMADA')}}
    }},
    async rpc(name,args){
      if(!rpcNames.has(name))return fail()
      try{const {data,error}=await client.rpc(name,args).retry(false);return {data,error}}
      catch{return {data:null,error:new Error('FISCAL_RPC_NO_CONFIRMADA')}}
    },
  }
}
