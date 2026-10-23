// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp'
import type { FiscalAuthClient, FiscalWorkerBinding } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { FISCAL_STAGING_URL } from '../../supabase/functions/_shared/fiscalSupabaseAdmin'
import { freezeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import { wsfeSample } from './fixtures/fiscalWsfe'
import { prepareFiscalData } from '../../supabase/functions/_shared/fiscalPreparation'

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
function preparationFixture(){
 const f=fixture(),sale=crypto.randomUUID(),actor=crypto.randomUUID()
 const context={version:1,venta_id:sale,total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,incluye_recepcion_envases:false,revision_parametros:1,condiciones:[{id:5,descripcion:'Ensayo',comprobantes:[11]}],alicuotas:[]}
 const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,numero:_n,...data}=wsfeSample
 const {total:_t,...importes}=data.importes
 const entrada={condicionEmisor:'MONOTRIBUTO',datos:{...data,importes}}
 f.getUser.mockResolvedValue({data:{user:{id:actor}},error:null})
 f.rpc.mockImplementation(async(name,args)=>({data:name==='resolver_preparacion_fiscal_homologacion'
  ?{venta_id:sale,estado:'SIN_PREPARACION',operacion_id:null,preparacion_sha256:null,emision_habilitada:false}
  :name==='cargar_datos_preparacion_homologacion'?context
  :{venta_id:sale,operacion_id:args.p_operacion_id,preparacion_sha256:args.p_sha,estado:'DATOS_PREPARADOS',emision_habilitada:false},error:null}))
 return {...f,sale,actor,entrada}
}
it.each(['RESOLVER_VENTA','DATOS_FISCALES_VENTA'])('HTTP %s usa venta y Auth real sin custodia ni ARCA',async accion=>{
 const f=preparationFixture(),response=await f.handler(request(JSON.stringify({accion,venta_id:f.sale})))
 expect(response.status).toBe(200);expect(f.getUser).toHaveBeenCalledTimes(1)
 expect(f.rpc).toHaveBeenCalledExactlyOnceWith(accion==='RESOLVER_VENTA'?'resolver_preparacion_fiscal_homologacion':'cargar_datos_preparacion_homologacion',{p_actor_auth_id:f.actor,p_venta_id:f.sale})
 expect(f.fetcher).not.toHaveBeenCalled();expect(f.read.mock.calls.some(([key])=>/CUSTODY|CREDENTIAL|TICKET|KEYRING/.test(key))).toBe(false)
})
it('HTTP guarda datos anidados y devuelve sólo ACK, sin reservar ni emitir',async()=>{
 const f=preparationFixture(),response=await f.handler(request(JSON.stringify({accion:'GUARDAR_DATOS_FISCALES',venta_id:f.sale,operacion_id:op,entrada:f.entrada})))
 expect(response.status).toBe(200);expect((await response.json()).resultado).toMatchObject({estado:'DATOS_PREPARADOS',operacion_id:op,emision_habilitada:false})
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.rpc.mock.calls.map(([name])=>name)).toEqual(['cargar_datos_preparacion_homologacion','guardar_datos_preparacion_homologacion'])
 expect(f.fetcher).not.toHaveBeenCalled()
})
it('HTTP admite detalle válido de preparación mayor a 2KiB con límite propio de 64KiB',async()=>{
 const f=preparationFixture(),entrada={...f.entrada,datos:{...f.entrada.datos,tributos:Array.from({length:25},(_,i)=>({id:1,descripcion:'Tributo sintético '+i,base:'0.00',alicuota:'0.0000',importe:'0.00'}))}}
 const body=JSON.stringify({accion:'GUARDAR_DATOS_FISCALES',venta_id:f.sale,operacion_id:op,entrada})
 expect(new TextEncoder().encode(body).length).toBeGreaterThan(2048)
 expect((await f.handler(request(body))).status).toBe(200)
})
it.each(['"fecha":"20261021","fecha":"20261022"','"fecha":"20261021","\\u0066echa":"20261022"'])('HTTP rechaza claves anidadas duplicadas antes de Auth: %s',duplicate=>{
 const f=preparationFixture(),body=`{"accion":"GUARDAR_DATOS_FISCALES","venta_id":"${f.sale}","operacion_id":"${op}","entrada":{"datos":{${duplicate}}}}`
 return f.handler(request(body)).then(response=>{expect(response.status).toBe(400);expect(f.factory).not.toHaveBeenCalled();expect(f.getUser).not.toHaveBeenCalled()})
})
it('HTTP rechaza tamaño/profundidad excesivos y metadatos fuera del DTO antes de Auth',async()=>{
 for(const body of [' '.repeat(65537),JSON.stringify({accion:'RESOLVER_VENTA',venta_id:crypto.randomUUID(),actor_auth_id:crypto.randomUUID()}),`{"accion":"GUARDAR_DATOS_FISCALES","entrada":${'['.repeat(20)}0${']'.repeat(20)}}`]){
  const f=preparationFixture();expect((await f.handler(request(body))).status).toBe(400);expect(f.factory).not.toHaveBeenCalled()
 }
})
async function reviewFixture(){
  const f=fixture(),frozen=await freezeFiscalRequest(wsfeSample),id=crypto.randomUUID(),actorAuthId=crypto.randomUUID()
  f.getUser.mockResolvedValue({data:{user:{id:actorAuthId}},error:null})
  const ctx={operacion_id:op,estado:'RESERVADA',revision:1,solicitud:frozen,aprobacion:null}
  const ack={id,operacion_id:op,solicitud_sha256:frozen.sha256,revision:1,aprobada:true,vence_en:new Date(Date.now()+600000).toISOString(),emision_habilitada:false}
  f.rpc.mockImplementation(async name=>({data:name==='autorizar_consulta_fiscal_homologacion'?binding:name==='cargar_revision_fiscal_homologacion'?ctx:ack,error:null}))
  return {...f,ctx,ack,actorAuthId,body:{accion:'APROBAR_REVISION',operacion_id:op,revision_id:id,solicitud_sha256:frozen.sha256,revision:1}}
}
it('PREPARAR_COMPROBANTE recupera cuerpo existente sin gate de consulta, TA ni red',async()=>{
 const f=await reviewFixture()
 f.rpc.mockImplementation(async name=>({data:name==='autorizar_consulta_fiscal_homologacion'?binding:name==='cargar_fuente_preparacion_homologacion'
  ?{operacion_id:op,estado:'CUERPO_EXISTENTE',contexto:null,canonico:null,preparacion_sha256:null}:f.ctx,error:null}))
 const response=await f.handler(request(JSON.stringify({accion:'PREPARAR_COMPROBANTE',operacion_id:op})))
 expect(response.status).toBe(200);expect((await response.json()).resultado.solicitud.sha256).toBe(f.ctx.solicitud.sha256)
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.fetcher).not.toHaveBeenCalled()
 expect(f.read.mock.calls.some(([key])=>/CUSTODY|KEYRING|TICKET_KEYS/.test(key))).toBe(false)
})
it('PREPARAR_COMPROBANTE nuevo exige gate privado antes de instanciar custodia',async()=>{
 const f=await reviewFixture(),context={version:1 as const,venta_id:crypto.randomUUID(),total:'123.45',cuit_emisor:binding.cuit_emisor,punto_venta:binding.punto_venta,incluye_recepcion_envases:false,revision_parametros:1,condiciones:[{id:5,descripcion:'Ensayo',comprobantes:[11]}],alicuotas:[]}
 const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,numero:_n,...data}=wsfeSample
 const {total:_t,...importes}=data.importes
 const prepared=await prepareFiscalData(context,{condicionEmisor:'MONOTRIBUTO',datos:{...data,importes}})
 f.rpc.mockImplementation(async name=>({data:name==='autorizar_consulta_fiscal_homologacion'?binding:{operacion_id:op,estado:'DATOS_PREPARADOS',contexto:context,canonico:prepared.canonico,preparacion_sha256:prepared.sha256},error:null}))
 const response=await f.handler(request(JSON.stringify({accion:'PREPARAR_COMPROBANTE',operacion_id:op})))
 expect(response.status).toBe(503);expect((await response.json()).codigo).toBe('PREPARACION_CUERPO_NO_HABILITADA')
 expect(f.fetcher).not.toHaveBeenCalled();expect(f.read.mock.calls.some(([key])=>/CUSTODY|KEYRING|TICKET_KEYS/.test(key))).toBe(false)
})
it('revisión devuelve cuerpo validado sin credenciales, TA ni consultas a ARCA',async()=>{
  const f=await reviewFixture(),r=await f.handler(request(JSON.stringify({accion:'REVISAR_COMPROBANTE',operacion_id:op})))
  expect(r.status).toBe(200);expect((await r.json()).resultado).toEqual(f.ctx)
  expect(f.rpc).toHaveBeenLastCalledWith('cargar_revision_fiscal_homologacion',{p_operacion_id:op,p_actor_auth_id:f.actorAuthId})
  expect(f.fetcher).not.toHaveBeenCalled();expect(f.read.mock.calls.map(c=>c[0])).toEqual(['SUPABASE_URL','ARCA_HOMO_BACKEND_ENABLED'])
})
it('aprobar envía hash/revisión/identidad originales y no habilita emisión',async()=>{
  const f=await reviewFixture(),r=await f.handler(request(JSON.stringify(f.body)))
  expect(r.status).toBe(200);expect((await r.json()).resultado).toEqual(f.ack)
  expect(f.rpc).toHaveBeenLastCalledWith('aprobar_revision_fiscal_homologacion',{p_operacion_id:op,p_actor_auth_id:f.actorAuthId,p_id:f.ack.id,p_sha:f.ack.solicitud_sha256,p_revision:1})
  expect(f.getUser).toHaveBeenCalledOnce();expect(f.fetcher).not.toHaveBeenCalled();expect(f.read).toHaveBeenCalledTimes(2)
})
it('hash del formulario cambiado no llega a aprobar SQL',async()=>{
  const f=await reviewFixture(),r=await f.handler(request(JSON.stringify({...f.body,solicitud_sha256:'0'.repeat(64)})))
  expect(r.status).toBe(409);expect(f.rpc).toHaveBeenCalledTimes(2);expect(f.fetcher).not.toHaveBeenCalled()
})
it.each(['campo_privado','hash','emisor','revision'])('respuesta de revisión alterada en %s no se devuelve al navegador',async mode=>{
  const f=await reviewFixture(),ctx:Record<string,unknown>={...f.ctx}
  if(mode==='campo_privado')ctx.secreto='SYNTHETIC_PRIVATE'
  if(mode==='hash')ctx.solicitud={...f.ctx.solicitud,sha256:'0'.repeat(64)}
  if(mode==='emisor')ctx.solicitud=await freezeFiscalRequest({...wsfeSample,puntoVenta:3})
  if(mode==='revision')ctx.revision=2
  f.rpc.mockImplementation(async name=>({data:name==='autorizar_consulta_fiscal_homologacion'?binding:ctx,error:null}))
  const r=await f.handler(request(JSON.stringify({accion:'REVISAR_COMPROBANTE',operacion_id:op})))
  expect(r.status).toBe(409);expect(await r.text()).not.toContain('SYNTHETIC');expect(f.fetcher).not.toHaveBeenCalled()
})
it.each(['identidad','emision','extra'])('ACK de aprobación alterado en %s se rechaza',async mode=>{
  const f=await reviewFixture(),ack={...f.ack,...(mode==='identidad'?{id:crypto.randomUUID()}:mode==='emision'?{emision_habilitada:true}:{secreto:'SYNTHETIC_PRIVATE'})}
  f.rpc.mockImplementation(async name=>({data:name==='autorizar_consulta_fiscal_homologacion'?binding:name==='cargar_revision_fiscal_homologacion'?f.ctx:ack,error:null}))
  const r=await f.handler(request(JSON.stringify(f.body)));expect(r.status).toBe(409);expect(await r.text()).not.toContain('SYNTHETIC');expect(f.fetcher).not.toHaveBeenCalled()
})
it.each([{revision_id:'no-uuid'},{revision:0},{revision:1.1},{solicitud_sha256:'B'.repeat(64)},{usuario_id:crypto.randomUUID()}])('aprobación mal formada %# falla antes de Auth',async change=>{
  const f=await reviewFixture(),r=await f.handler(request(JSON.stringify({...f.body,...change})))
  expect(r.status).toBe(400);expect(f.getUser).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
})
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

it('HTTP recupera constancia con Auth original y sin custodia/TA/red fiscal',async()=>{
 const f=fixture(),sale=crypto.randomUUID(),actor=crypto.randomUUID(),solicitud=await freezeFiscalRequest(wsfeSample)
 const receipt={version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',operacion_id:op,venta_id:sale,solicitud,autorizacion:{cae:'11111111111111',vencimiento:'20261031',procesado_en:null}}
 f.getUser.mockResolvedValue({data:{user:{id:actor}},error:null});f.rpc.mockResolvedValue({data:receipt,error:null})
 const response=await f.handler(request(JSON.stringify({accion:'CONSTANCIA_COMPROBANTE',venta_id:sale,operacion_id:op})))
 expect(response.status).toBe(200);expect((await response.json()).resultado).toEqual(receipt)
 expect(f.getUser).toHaveBeenCalledTimes(1)
 expect(f.rpc).toHaveBeenCalledExactlyOnceWith('cargar_constancia_fiscal_homologacion',{p_actor_auth_id:actor,p_venta_id:sale,p_operacion_id:op})
 expect(f.fetcher).not.toHaveBeenCalled();expect(f.read.mock.calls.some(([key])=>/CUSTODY|CREDENTIAL|TICKET|KEYRING/.test(key))).toBe(false)
})
it('HTTP constancia no entrega datos de otra venta ni errores privados',async()=>{
 const f=fixture(),sale=crypto.randomUUID()
 f.rpc.mockResolvedValue({data:{venta_id:crypto.randomUUID(),estado:'AUTORIZADA'},error:null})
 const response=await f.handler(request(JSON.stringify({accion:'CONSTANCIA_COMPROBANTE',venta_id:sale,operacion_id:op})))
 expect(response.status).toBe(409);expect((await response.json()).codigo).toBe('OPERACION_NO_CONFIRMADA');expect(f.fetcher).not.toHaveBeenCalled()
})
it('HTTP constancia rechaza sesión inválida antes de leer ledger',async()=>{
 const f=fixture();f.getUser.mockResolvedValue({data:{user:null},error:new Error('private')})
 expect((await f.handler(request(JSON.stringify({accion:'CONSTANCIA_COMPROBANTE',venta_id:crypto.randomUUID(),operacion_id:op})))).status).toBe(409)
 expect(f.rpc).not.toHaveBeenCalled()
})

it('HTTP constancia rechaza un cuerpo con hash ajeno y nunca devuelve CAE parcial',async()=>{
 const f=fixture(),sale=crypto.randomUUID(),solicitud=await freezeFiscalRequest(wsfeSample)
 f.rpc.mockResolvedValue({data:{version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',operacion_id:op,venta_id:sale,solicitud:{...solicitud,sha256:'a'.repeat(64)},autorizacion:{cae:'11111111111111',vencimiento:'20261031',procesado_en:null}},error:null})
 const response=await f.handler(request(JSON.stringify({accion:'CONSTANCIA_COMPROBANTE',venta_id:sale,operacion_id:op})))
 expect(response.status).toBe(409);expect(await response.text()).not.toContain('11111111111111');expect(f.fetcher).not.toHaveBeenCalled()
})
it('HTTP constancia no confunde error de RPC con resultado autorizado',async()=>{
 const f=fixture();f.rpc.mockResolvedValue({data:{estado:'AUTORIZADA'},error:new Error('PRIVATE_LEDGER_ERROR')})
 const response=await f.handler(request(JSON.stringify({accion:'CONSTANCIA_COMPROBANTE',venta_id:crypto.randomUUID(),operacion_id:op})))
 expect(response.status).toBe(409);expect(await response.text()).not.toContain('PRIVATE_LEDGER_ERROR')
})

it('HTTP diagnóstico usa Auth real y getter activo, sin TA/ARCA ni auditoría histórica directa',async()=>{
 const f=fixture(),sale=crypto.randomUUID(),actor=crypto.randomUUID(),diagnosis={version:1,entorno:'HOMOLOGACION',operacion_id:op,venta_id:sale,solicitud_sha256:'a'.repeat(64),estado:'ENVIO_INCIERTO',recepcion:null,ultima_consulta:null,puedeReenviar:false}
 f.getUser.mockResolvedValue({data:{user:{id:actor}},error:null});f.rpc.mockResolvedValue({data:diagnosis,error:null})
 const response=await f.handler(request(JSON.stringify({accion:'DIAGNOSTICO_COMPROBANTE',venta_id:sale,operacion_id:op})))
 expect(response.status).toBe(200);expect((await response.json()).resultado).toEqual(diagnosis);expect(f.getUser).toHaveBeenCalledTimes(1)
 expect(f.rpc).toHaveBeenCalledExactlyOnceWith('cargar_diagnostico_fiscal_homologacion',{p_actor_auth_id:actor,p_venta_id:sale,p_operacion_id:op})
 expect(f.fetcher).not.toHaveBeenCalled();expect(f.read.mock.calls.some(([key])=>/CUSTODY|CREDENTIAL|TICKET|KEYRING/.test(key))).toBe(false)
})
it('HTTP diagnóstico no expone campos privados ni respuestas parciales',async()=>{
 const f=fixture(),sale=crypto.randomUUID();f.rpc.mockResolvedValue({data:{estado:'ENVIO_INCIERTO',token:'PRIVATE_SENTINEL'},error:null})
 const response=await f.handler(request(JSON.stringify({accion:'DIAGNOSTICO_COMPROBANTE',venta_id:sale,operacion_id:op})))
 expect(response.status).toBe(409);expect(await response.text()).not.toContain('PRIVATE_SENTINEL')
})
it('HTTP diagnóstico exige sesión y contrato cerrado antes de acceder',async()=>{
 const f=fixture(),sale=crypto.randomUUID()
 expect((await f.handler(request(JSON.stringify({accion:'DIAGNOSTICO_COMPROBANTE',venta_id:sale,operacion_id:op,extra:true})))).status).toBe(400)
 expect(f.getUser).not.toHaveBeenCalled();f.getUser.mockResolvedValue({data:{user:null},error:new Error('private')})
 expect((await f.handler(request(JSON.stringify({accion:'DIAGNOSTICO_COMPROBANTE',venta_id:sale,operacion_id:op})))).status).toBe(409);expect(f.rpc).not.toHaveBeenCalled()
})

it('HTTP cancela preparación y confirma por getter con el mismo Auth, sin TA ni ARCA',async()=>{
 const f=fixture(),sale=crypto.randomUUID(),actor=crypto.randomUUID(),ack={operacion_id:op,venta_id:sale,estado:'CANCELADA',emision_habilitada:false}
 f.getUser.mockResolvedValue({data:{user:{id:actor}},error:null});f.rpc.mockImplementation(async name=>name.startsWith('cancelar')?{data:null,error:new Error('SYNTHETIC_ACK_LOST')}:{data:ack,error:null})
 const response=await f.handler(request(JSON.stringify({accion:'CANCELAR_PREPARACION_FISCAL',venta_id:sale,operacion_id:op})))
 expect(response.status).toBe(200);expect((await response.json()).resultado).toEqual(ack);expect(f.getUser).toHaveBeenCalledTimes(1)
 expect(f.rpc.mock.calls).toEqual(['cancelar_preparacion_fiscal_homologacion','consultar_cancelacion_preparacion_homologacion'].map(name=>[name,{p_actor_auth_id:actor,p_venta_id:sale,p_operacion_id:op}]))
 expect(f.fetcher).not.toHaveBeenCalled();expect(f.read.mock.calls.some(([key])=>/CUSTODY|CREDENTIAL|TICKET|KEYRING/.test(key))).toBe(false)
})
it('HTTP lookup de cancelación inexistente devuelve null sin proponer cancelación',async()=>{
 const f=fixture();f.rpc.mockResolvedValue({data:null,error:null})
 const response=await f.handler(request(JSON.stringify({accion:'CANCELACION_PREPARACION_FISCAL',venta_id:crypto.randomUUID(),operacion_id:op})))
 expect(response.status).toBe(200);expect((await response.json()).resultado).toBeNull();expect(f.rpc).toHaveBeenCalledTimes(1);expect(f.fetcher).not.toHaveBeenCalled()
})
it('HTTP ACK sin cancelación durable o con sesión inválida nunca declara cierre',async()=>{
 const f=fixture(),sale=crypto.randomUUID();f.rpc.mockImplementation(async name=>({data:name.startsWith('cancelar')?{estado:'CANCELADA'}:null,error:null}))
 expect((await f.handler(request(JSON.stringify({accion:'CANCELAR_PREPARACION_FISCAL',venta_id:sale,operacion_id:op})))).status).toBe(409)
 f.rpc.mockClear();f.getUser.mockResolvedValue({data:{user:null},error:new Error('private')})
 expect((await f.handler(request(JSON.stringify({accion:'CANCELAR_PREPARACION_FISCAL',venta_id:sale,operacion_id:op})))).status).toBe(409);expect(f.rpc).not.toHaveBeenCalled()
})

async function replacementHttpFixture(){
 const f=preparationFixture(),successor=crypto.randomUUID()
 const c={version:1 as const,venta_id:f.sale,total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,incluye_recepcion_envases:false,revision_parametros:1,condiciones:[{id:5,descripcion:'Ensayo',comprobantes:[11]}],alicuotas:[]}
 const p=await prepareFiscalData(c,f.entrada),proposal={canonico:p.canonico,sha256:p.sha256}
 const ack={operacion_id:op,sucesora_id:successor,venta_id:f.sale,anterior_sha256:'a'.repeat(64),preparacion_sha256:p.sha256,sucesora_sha256:'b'.repeat(64),numero:1,estado:'SUSTITUIDA',emision_habilitada:false}
 const command={accion:'SUSTITUIR_PREPARACION_FISCAL',venta_id:f.sale,operacion_id:op,sucesora_id:successor,anterior_sha256:'a'.repeat(64),propuesta:proposal}
 f.rpc.mockImplementation(async()=>({data:ack,error:null}))
 return {...f,ack,command}
}
it('HTTP sustituye con lectura durable y un Auth, sin TA/ARCA/permiso automático',async()=>{
 const f=await replacementHttpFixture();f.rpc.mockResolvedValueOnce({data:null,error:new Error('SYNTHETIC_ACK_LOST')})
 const response=await f.handler(request(JSON.stringify(f.command)))
 expect(response.status).toBe(200);expect((await response.json()).resultado).toEqual(f.ack)
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.rpc.mock.calls.map(([name])=>name)).toEqual(['sustituir_reserva_fiscal_homologacion','consultar_sustitucion_fiscal_homologacion'])
 for(const [,args] of f.rpc.mock.calls)expect(args.p_actor_auth_id).toBe(f.actor)
 expect(f.fetcher).not.toHaveBeenCalled();expect(f.read.mock.calls.some(([key])=>/CUSTODY|CREDENTIAL|TICKET|KEYRING/.test(key))).toBe(false)
})
it('HTTP consulta sustitución inexistente sin escribir',async()=>{
 const f=await replacementHttpFixture();f.rpc.mockResolvedValue({data:null,error:null})
 const response=await f.handler(request(JSON.stringify({accion:'SUSTITUCION_PREPARACION_FISCAL',venta_id:f.sale,operacion_id:op})))
 expect(response.status).toBe(200);expect((await response.json()).resultado).toBeNull()
 expect(f.rpc).toHaveBeenCalledExactlyOnceWith('consultar_sustitucion_fiscal_homologacion',{p_actor_auth_id:f.actor,p_venta_id:f.sale,p_operacion_id:op})
})
it.each(['extra','misma-identidad','hash','identidad','propuesta','demasiado-grande'])('HTTP rechaza DTO de sustitución %s antes de Auth',async mode=>{
 const f=await replacementHttpFixture(),cmd:Record<string,unknown>={...f.command}
 if(mode==='extra')cmd.binding={credencial:'PRIVATE'}
 if(mode==='misma-identidad')cmd.sucesora_id=op
 if(mode==='hash')cmd.anterior_sha256='INVALID'
 if(mode==='identidad')cmd.operacion_id='INVALID'
 if(mode==='propuesta')cmd.propuesta=[]
 if(mode==='demasiado-grande')cmd.propuesta={canonico:'a'.repeat(65536),sha256:'a'.repeat(64)}
 expect((await f.handler(request(JSON.stringify(cmd)))).status).toBe(400);expect(f.getUser).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled()
})
it('HTTP propuesta con duplicados internos o ACK sin registro devuelve error genérico sin filtrar texto privado',async()=>{
 const f=await replacementHttpFixture();f.command.propuesta.canonico=f.command.propuesta.canonico.replace('"version":1','"version":1,"version":1')
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(f.command.propuesta.canonico)))
 f.command.propuesta.sha256=[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('')
 expect((await f.handler(request(JSON.stringify(f.command)))).status).toBe(409);expect(f.getUser).not.toHaveBeenCalled()
 const g=await replacementHttpFixture();g.rpc.mockResolvedValueOnce({data:g.ack,error:null}).mockResolvedValueOnce({data:null,error:new Error('PRIVATE_TOKEN')})
 const response=await g.handler(request(JSON.stringify(g.command)));expect(response.status).toBe(409);expect(await response.text()).not.toContain('PRIVATE_TOKEN')
})
