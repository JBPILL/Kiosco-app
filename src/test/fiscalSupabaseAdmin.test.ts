// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { createFiscalSupabaseAdmin, FISCAL_STAGING_URL } from '../../supabase/functions/_shared/fiscalSupabaseAdmin'

const secret='SYNTHETIC_PRIVATE_SERVICE_SECRET',actor=crypto.randomUUID()
afterEach(()=>vi.useRealTimers())
it('SDK verifica JWT en Auth remoto sin conservarlo como credencial de RPC',async()=>{
  const requests:Request[]=[]
  const fetcher=vi.fn<typeof fetch>(async input=>{
    const r=input as Request;requests.push(r)
    return Response.json(r.url.endsWith('/auth/v1/user')?{id:actor,aud:'authenticated'}:{estado:'PREPARADA'})
  })
  const admin=createFiscalSupabaseAdmin(FISCAL_STAGING_URL,secret,fetcher)
  expect((await admin.auth.getUser('SYNTHETIC_JWT_A')).data.user?.id).toBe(actor)
  await admin.auth.getUser('SYNTHETIC_JWT_B')
  await admin.rpc('consultar_preparacion_ta_homologacion',{})
  expect(requests.map(r=>r.headers.get('authorization'))).toEqual(['Bearer SYNTHETIC_JWT_A','Bearer SYNTHETIC_JWT_B','Bearer '+secret])
  expect(requests.every(r=>r.redirect==='error'&&new URL(r.url).origin===FISCAL_STAGING_URL)).toBe(true)
  expect(requests.map(r=>r.method)).toEqual(['GET','GET','POST'])
})
it.each(['https://lllkjnqpltnwvxzphncr.supabase.co',FISCAL_STAGING_URL+'/',FISCAL_STAGING_URL+'.evil.invalid'])('destino %s falla antes de red',url=>{
  const fetcher=vi.fn<typeof fetch>();expect(()=>createFiscalSupabaseAdmin(url,secret,fetcher)).toThrow('FISCAL_SERVICIO_PRIVADO_NO_DISPONIBLE');expect(fetcher).not.toHaveBeenCalled()
})
it.each(['FECAESolicitar','confirmar_checkout_envases','usuarios','consultar_preparacion_ta_homologacion?x=1'])('RPC %s no está permitida',async name=>{
  const fetcher=vi.fn<typeof fetch>(),admin=createFiscalSupabaseAdmin(FISCAL_STAGING_URL,secret,fetcher)
  await expect(admin.rpc(name,{})).rejects.toThrow('FISCAL_SERVICIO_PRIVADO_NO_DISPONIBLE');expect(fetcher).not.toHaveBeenCalled()
})
it('errores transitorios de Auth/RPC no disparan reintentos automáticos',async()=>{
  const fetcher=vi.fn<typeof fetch>(async()=>Response.json({message:'SYNTHETIC_REMOTE_ERROR'},{status:520}))
  const admin=createFiscalSupabaseAdmin(FISCAL_STAGING_URL,secret,fetcher)
  expect((await admin.auth.getUser('SYNTHETIC_JWT')).error).not.toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(1)
  expect((await admin.rpc('consultar_preparacion_ta_homologacion',{})).error).not.toBeNull()
  expect(fetcher).toHaveBeenCalledTimes(2)
})
it.each(['redirect','grande'])('respuesta %s no produce un resultado utilizable',async mode=>{
  const fetcher:typeof fetch=async()=>{
    const r=Response.json(mode==='grande'?{large:'x'.repeat(2097152)}:{estado:'PREPARADA'})
    if(mode==='redirect')Object.defineProperty(r,'redirected',{value:true})
    return r
  }
  const result=await createFiscalSupabaseAdmin(FISCAL_STAGING_URL,secret,fetcher).rpc('consultar_preparacion_ta_homologacion',{})
  expect(result.data).toBeNull();expect(result.error).not.toBeNull()
})
it('timeout cubre también un cuerpo detenido y aborta una única solicitud',async()=>{
  vi.useFakeTimers()
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'application/json'}}))
  const promise=createFiscalSupabaseAdmin(FISCAL_STAGING_URL,secret,fetcher).rpc('consultar_preparacion_ta_homologacion',{})
  await vi.advanceTimersByTimeAsync(15000)
  expect((await promise).error).not.toBeNull();expect(fetcher).toHaveBeenCalledTimes(1)
  expect((fetcher.mock.calls[0][0] as Request).signal.aborted).toBe(true)
})
