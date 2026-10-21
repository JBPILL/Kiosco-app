// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp'
import type { FiscalAuthClient, FiscalWorkerBinding } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { FISCAL_STAGING_URL } from '../../supabase/functions/_shared/fiscalSupabaseAdmin'

const op=crypto.randomUUID(),attempt=crypto.randomUUID(),observation=crypto.randomUUID()
const binding:FiscalWorkerBinding={version:1,entorno:'HOMOLOGACION',servicio:'wsfe',operacion_id:op,kiosco_id:crypto.randomUUID(),usuario_id:crypto.randomUUID(),
  cuit_emisor:'20123456786',punto_venta:2,credencial_id:crypto.randomUUID(),certificado_sha256:'a'.repeat(64),revision:1}
const origin='https://kiosco-app-staging.vercel.app',url='https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion'
const pending={version:1,operacion_id:op,numero:1,estado:'PENDIENTE_CONCILIACION',solicitud_sha256:'b'.repeat(64),revision:1,emision_habilitada:false}
function fixture(overrides:Record<string,string|undefined>={}) {
  const secrets:Record<string,string|undefined>={SUPABASE_URL:FISCAL_STAGING_URL,ARCA_HOMO_BACKEND_ENABLED:'true',...overrides}
  const read=vi.fn((name:string)=>secrets[name]),fetcher=vi.fn<typeof fetch>()
  const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:crypto.randomUUID()}},error:null}))
  const rpc=vi.fn<FiscalAuthClient['rpc']>(async name=>({data:name==='autorizar_consulta_fiscal_homologacion'?binding:
    name==='consultar_reconciliacion_homologacion'?pending:{estado:'PREPARADA',intento_id:attempt,revision:1},error:null}))
  const factory=vi.fn(()=>({auth:{getUser},rpc})),handler=createFiscalHttpHandler({readSecret:read,createAdmin:factory,fetcher})
  return {handler,read,factory,getUser,rpc,fetcher}
}
function request(body:BodyInit=JSON.stringify({accion:'ESTADO_TA',operacion_id:op}),headers:Record<string,string>={},method='POST'):Request {
  const init:RequestInit & {duplex:'half'}={method,duplex:'half',headers:{origin,authorization:'Bearer SYNTHETIC_JWT','content-type':'application/json',...headers}}
  if(method==='POST')init.body=body
  return new Request(url,init)
}
afterEach(()=>vi.useRealTimers())
it('preflight permitido no lee configuración, Auth ni credenciales y nunca usa wildcard',async()=>{
  const f=fixture(),r=await f.handler(request('',{},'OPTIONS'))
  expect(r.status).toBe(204);expect(r.headers.get('access-control-allow-origin')).toBe(origin)
  expect(r.headers.get('cache-control')).toBe('no-store');expect(f.read).not.toHaveBeenCalled();expect(f.factory).not.toHaveBeenCalled()
})
it.each(['','https://kiosco-app.vercel.app','https://kiosco-app-staging.vercel.app.evil.invalid','null'])('origen %s no llega a secretos ni al cliente',async value=>{
  const f=fixture(),r=await f.handler(request(undefined,{origin:value}))
  expect(r.status).toBe(403);expect(r.headers.get('access-control-allow-origin')).toBeNull()
  expect(f.read).not.toHaveBeenCalled();expect(f.factory).not.toHaveBeenCalled()
})
it('métodos distintos de POST no llegan a configuración privada',async()=>{
  const f=fixture();expect((await f.handler(request('',{},'GET'))).status).toBe(405);expect(f.read).not.toHaveBeenCalled()
})
it.each([undefined,'false','TRUE'])('flag privado %s mantiene cerrado el endpoint',async flag=>{
  const f=fixture({ARCA_HOMO_BACKEND_ENABLED:flag})
  expect((await f.handler(request())).status).toBe(503);expect(f.factory).not.toHaveBeenCalled()
})
it.each(['https://lllkjnqpltnwvxzphncr.supabase.co','https://acoyfwwmhaeruciyedri.supabase.co.evil.invalid',FISCAL_STAGING_URL+'/'])('configuración %s falla antes de Auth',async target=>{
  const f=fixture({SUPABASE_URL:target});expect((await f.handler(request())).status).toBe(503)
  expect(f.factory).not.toHaveBeenCalled();expect(f.read.mock.calls.map(c=>c[0])).toEqual(['SUPABASE_URL'])
})
it.each(['','Basic SYNTHETIC','Bearer','Bearer dos tokens','Bearer '+'a'.repeat(16400)])('cabecera de sesión inválida %# se rechaza antes de crear cliente',async authorization=>{
  const f=fixture();expect((await f.handler(request(undefined,{authorization}))).status).toBe(401);expect(f.factory).not.toHaveBeenCalled()
})
it.each([
  '{}','null','[]','{','{"accion":"EMITIR","operacion_id":"'+op+'"}',
  JSON.stringify({accion:'ESTADO_TA',operacion_id:'no-uuid'}),
  JSON.stringify({accion:'ESTADO_TA',operacion_id:op,token:'SYNTHETIC_PRIVATE'}),
  JSON.stringify({accion:'CONCILIAR',operacion_id:op,observacion_id:observation,solicitud:{total:1}}),
  JSON.stringify({accion:'CANCELAR_PREPARACION_TA',operacion_id:op,intento_id:attempt,revision:0}),
  JSON.stringify({accion:'CANCELAR_PREPARACION_TA',operacion_id:op,intento_id:attempt,revision:1.5}),
  JSON.stringify({accion:'CANCELAR_PREPARACION_TA',operacion_id:op,intento_id:attempt,revision:Number.MAX_SAFE_INTEGER+1}),
  '{"accion":"ESTADO_TA","operacion_id":"'+op+'","operacion_id":"'+op+'"}',
  '{"accion":"ESTADO_TA","operacion_id":"'+op+'","operacion_\\u0069d":"'+op+'"}',
])('rechaza cuerpo ambiguo o fuera del contrato %# sin Auth ni secretos',async body=>{
  const f=fixture(),r=await f.handler(request(body));expect(r.status).toBe(400);expect(f.factory).not.toHaveBeenCalled()
  expect(await r.text()).not.toContain('SYNTHETIC')
})
it.each(['text/plain','application/json; charset=utf-16','application/javascript'])('tipo %s no se procesa',async type=>{
  const f=fixture();expect((await f.handler(request(undefined,{'content-type':type}))).status).toBe(400);expect(f.factory).not.toHaveBeenCalled()
})
it('limita longitud declarada y real, rechaza UTF-8 inválido y codificación comprimida',async()=>{
  const f=fixture()
  for(const r of [request(undefined,{'content-length':'2049'}),request(' '.repeat(2049)),request(new Uint8Array([255,254])),request(undefined,{'content-encoding':'gzip'})])
    expect((await f.handler(r)).status).toBe(400)
  expect(f.factory).not.toHaveBeenCalled()
})
it('un cuerpo detenido se cancela tras el límite sin iniciar Auth',async()=>{
  vi.useFakeTimers();const f=fixture(),cancel=vi.fn(),stream=new ReadableStream({cancel})
  const response=f.handler(request(stream));await vi.advanceTimersByTimeAsync(3000)
  expect((await response).status).toBe(400);expect(cancel).toHaveBeenCalledOnce();expect(f.factory).not.toHaveBeenCalled()
})
it('Auth inválido no llega a RPC, TA ni red fiscal',async()=>{
  const f=fixture();f.getUser.mockResolvedValue({data:{user:null},error:new Error('SYNTHETIC_PRIVATE_AUTH')})
  const r=await f.handler(request());expect(r.status).toBe(403);expect(f.rpc).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
  expect(await r.text()).not.toContain('SYNTHETIC');expect(f.read.mock.calls.map(c=>c[0])).toEqual(['SUPABASE_URL','ARCA_HOMO_BACKEND_ENABLED'])
})
it('actor/comercio rechazado en SQL no llega a custodia',async()=>{
  const f=fixture();f.rpc.mockResolvedValue({data:null,error:{message:'SYNTHETIC_PRIVATE_SQL'}})
  const r=await f.handler(request(JSON.stringify({accion:'CONCILIAR',operacion_id:op,observacion_id:observation})))
  expect(r.status).toBe(403);expect(f.rpc).toHaveBeenCalledTimes(1);expect(f.fetcher).not.toHaveBeenCalled()
  expect(f.read.mock.calls.map(c=>c[0])).toEqual(['SUPABASE_URL','ARCA_HOMO_BACKEND_ENABLED'])
})
it('estado TA sólo devuelve metadata validada y usa el binding privado, sin WSAA',async()=>{
  const f=fixture(),r=await f.handler(request())
  expect(r.status).toBe(200);expect(await r.json()).toEqual({version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:{estado:'PREPARADA',intento_id:attempt,revision:1}})
  expect(f.getUser).toHaveBeenCalledWith('SYNTHETIC_JWT')
  expect(f.rpc).toHaveBeenLastCalledWith('consultar_preparacion_ta_homologacion',{p_operacion_id:op,p_credencial_id:binding.credencial_id,p_huella:binding.certificado_sha256,p_revision:1})
  expect(f.fetcher).not.toHaveBeenCalled();expect(f.read).toHaveBeenCalledTimes(2)
})
it('cancelar requiere intento/revisión originales y nunca reintenta al fallar',async()=>{
  const f=fixture();f.rpc.mockImplementation(async name=>({data:name==='autorizar_consulta_fiscal_homologacion'?binding:{estado:'CANCELADA',intento_id:attempt,revision:3},error:null}))
  const body=JSON.stringify({accion:'CANCELAR_PREPARACION_TA',operacion_id:op,intento_id:attempt,revision:3})
  expect((await f.handler(request(body))).status).toBe(200)
  expect(f.rpc).toHaveBeenLastCalledWith('cancelar_preparacion_ta_homologacion',{p_operacion_id:op,p_credencial_id:binding.credencial_id,p_huella:binding.certificado_sha256,p_revision:1,p_intento_id:attempt,p_generacion:3})
  f.rpc.mockClear();f.rpc.mockImplementation(async name=>({data:name==='autorizar_consulta_fiscal_homologacion'?binding:null,error:name==='autorizar_consulta_fiscal_homologacion'?null:{message:'SYNTHETIC_SECRET'}}))
  const r=await f.handler(request(body));expect(r.status).toBe(409);expect(f.rpc).toHaveBeenCalledTimes(2);expect(await r.text()).not.toContain('SYNTHETIC');expect(f.fetcher).not.toHaveBeenCalled()
})
it.each([{estado:'PREPARADA',intento_id:attempt,revision:1,token:'SYNTHETIC_PRIVATE'}, {estado:'VACIO',intento_id:attempt,revision:1},{estado:'PREPARADA',intento_id:null,revision:1}])('respuesta TA inválida %# no se refleja',async result=>{
  const f=fixture();f.rpc.mockImplementation(async name=>({data:name==='autorizar_consulta_fiscal_homologacion'?binding:result,error:null}))
  const r=await f.handler(request());expect(r.status).toBe(409);expect(await r.text()).not.toContain('SYNTHETIC')
})
it('replay conciliado no lee secretos ni consulta ARCA, y mantiene emisión deshabilitada',async()=>{
  const f=fixture(),body=JSON.stringify({accion:'CONCILIAR',operacion_id:op.toUpperCase(),observacion_id:observation.toUpperCase()})
  const r=await f.handler(request(body));expect(r.status).toBe(200)
  expect(await r.json()).toEqual({version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:pending})
  expect(f.rpc).toHaveBeenLastCalledWith('consultar_reconciliacion_homologacion',{p_operacion_id:op,p_id:observation})
  expect(f.fetcher).not.toHaveBeenCalled();expect(f.read).toHaveBeenCalledTimes(2)
})

it('estado compartido no contiene identificador ni revisión de otra operación',async()=>{
  const f=fixture();f.rpc.mockImplementation(async name=>({data:name==='autorizar_consulta_fiscal_homologacion'?binding:{estado:'COMPARTIDA',intento_id:null,revision:0},error:null}))
  const r=await f.handler(request());expect(r.status).toBe(200)
  expect((await r.json()).resultado).toEqual({estado:'COMPARTIDA',intento_id:null,revision:0})
})
