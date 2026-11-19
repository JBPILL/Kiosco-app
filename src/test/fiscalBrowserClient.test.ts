import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({url:'https://acoyfwwmhaeruciyedri.supabase.co',session:vi.fn(),invoke:vi.fn(),lock:vi.fn()}))
vi.mock('../lib/supabase',()=>({get supabaseUrl(){return mocks.url},supabase:{auth:{getSession:mocks.session},functions:{invoke:mocks.invoke}}}))
import { createFiscalBrowserClient } from '../lib/fiscalBrowserClient'
const scope={authId:'11111111-1111-4111-8111-111111111111',kioskId:'22222222-2222-4222-8222-222222222222',saleId:'33333333-3333-4333-8333-333333333333'}
const originalLocks=Object.getOwnPropertyDescriptor(navigator,'locks')
beforeEach(()=>{
 vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE','true');vi.stubEnv('VITE_KIOSKO_ARCA_REVISION_HOMO','true')
 mocks.url='https://acoyfwwmhaeruciyedri.supabase.co';mocks.session.mockReset();mocks.invoke.mockReset();localStorage.clear()
 mocks.session.mockResolvedValue({data:{session:{user:{id:scope.authId},access_token:'SYNTHETIC_BROWSER_SESSION'}},error:null})
 mocks.invoke.mockResolvedValue({data:{version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:{venta_id:scope.saleId,estado:'SIN_PREPARACION',operacion_id:null,preparacion_sha256:null,emision_habilitada:false}},error:null})
 mocks.lock.mockReset();mocks.lock.mockImplementation(async(_name:string,_options:LockOptions,task:()=>Promise<unknown>)=>task())
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:mocks.lock}})
})
afterEach(()=>{vi.unstubAllEnvs();if(originalLocks)Object.defineProperty(navigator,'locks',originalLocks);else Reflect.deleteProperty(navigator,'locks')})
it('requiere flag explícito antes de crear cualquier transporte',()=>{
 vi.stubEnv('VITE_KIOSKO_ARCA_REVISION_HOMO','false')
 expect(()=>createFiscalBrowserClient(scope)).toThrow();expect(mocks.session).not.toHaveBeenCalled();expect(mocks.invoke).not.toHaveBeenCalled()
})
it('rechaza otro proyecto antes de consultar sesión',()=>{
 mocks.url='https://otro-proyecto.example';expect(()=>createFiscalBrowserClient(scope)).toThrow();expect(mocks.session).not.toHaveBeenCalled()
})
it('sesión cambiada no envía una acción del Dueño anterior',async()=>{
 mocks.session.mockResolvedValue({data:{session:{user:{id:'44444444-4444-4444-8444-444444444444'}}},error:null})
 await expect(createFiscalBrowserClient(scope).resolve()).rejects.toThrow('FISCAL_SESION_CAMBIO');expect(mocks.invoke).not.toHaveBeenCalled()
})
it('invoca sólo el endpoint nuevo con timeout y sin usar adaptador fiscal heredado',async()=>{
 const state=await createFiscalBrowserClient(scope).resolve();expect(state.estado).toBe('SIN_PREPARACION')
 expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('arca-homologacion',{body:{accion:'RESOLVER_VENTA',venta_id:scope.saleId},timeout:15000,headers:{Authorization:'Bearer SYNTHETIC_BROWSER_SESSION'}})
})
it('falla remota no se presenta como sin preparación',async()=>{
 mocks.invoke.mockResolvedValue({data:null,error:new Error('PRIVATE_RESPONSE')})
 await expect(createFiscalBrowserClient(scope).resolve()).rejects.toThrow('FISCAL_RESPUESTA_NO_CONFIRMADA')
})
it('no deja al SDK elegir credenciales si falta el token de la sesión comprobada',async()=>{
 mocks.session.mockResolvedValue({data:{session:{user:{id:scope.authId}}},error:null})
 await expect(createFiscalBrowserClient(scope).resolve()).rejects.toThrow('FISCAL_SESION_CAMBIO');expect(mocks.invoke).not.toHaveBeenCalled()
})
it('preparar cuerpo usa timeout acotado mayor y la misma sesión fijada',async()=>{
 // La fixture devuelve estado de venta, no revisión: debe rechazarse ese DTO.
 await expect(createFiscalBrowserClient(scope).prepare(scope.saleId)).rejects.toThrow()
 expect(mocks.invoke).toHaveBeenCalledExactlyOnceWith('arca-homologacion',{body:{accion:'PREPARAR_COMPROBANTE',operacion_id:scope.saleId},timeout:40000,headers:{Authorization:'Bearer SYNTHETIC_BROWSER_SESSION'}})
})

it('usa lock exclusivo por Auth/comercio/venta antes de modificar pendiente',async()=>{
 await createFiscalBrowserClient(scope).resolve();expect(mocks.lock).toHaveBeenCalledTimes(1)
 expect(mocks.lock.mock.calls[0][0]).toBe(`kioskopos:fiscal:v1:${scope.authId}:${scope.kioskId}:${scope.saleId}`);expect(mocks.lock.mock.calls[0][1]).toEqual({mode:'exclusive'})
})
it('sin Web Locks no envía ni modifica el flujo fiscal mutable',async()=>{
 Object.defineProperty(navigator,'locks',{configurable:true,value:undefined})
 await expect(createFiscalBrowserClient(scope).cancel(scope.saleId)).rejects.toThrow('FISCAL_COORDINACION_NO_DISPONIBLE')
 expect(mocks.invoke).not.toHaveBeenCalled();expect(mocks.session).not.toHaveBeenCalled();expect(localStorage.length).toBe(0)
})

it('cancelación confirmada borra sólo la clave local del intento bajo Web Lock',async()=>{
 const key=`kioskopos:fiscal:v1:${scope.authId}:${scope.kioskId}:${scope.saleId}`
 localStorage.setItem(key,JSON.stringify({version:1,operationId:scope.saleId,input:null}));localStorage.setItem('otro-dato','conservar')
 mocks.invoke.mockResolvedValue({data:{version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:{operacion_id:scope.saleId,venta_id:scope.saleId,estado:'CANCELADA',emision_habilitada:false}},error:null})
 await createFiscalBrowserClient(scope).cancel(scope.saleId);expect(localStorage.getItem(key)).toBeNull();expect(localStorage.getItem('otro-dato')).toBe('conservar');expect(mocks.lock).toHaveBeenCalledTimes(1)
 expect(mocks.invoke.mock.calls.map(([,args])=>args.body.accion)).toEqual(['CANCELAR_PREPARACION_FISCAL','CANCELACION_PREPARACION_FISCAL'])
})

it('mutar scope original no permite adoptar otra cuenta al esperar un lock',async()=>{
 const mutable={...scope},api=createFiscalBrowserClient(mutable),replacement='44444444-4444-4444-8444-444444444444'
 mutable.authId=replacement;mocks.session.mockResolvedValue({data:{session:{user:{id:replacement},access_token:'SYNTHETIC_BROWSER_SESSION'}},error:null})
 await expect(api.resolve()).rejects.toThrow('FISCAL_SESION_CAMBIO');expect(mocks.invoke).not.toHaveBeenCalled();expect(localStorage.length).toBe(0)
})

import { freezeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import { wsfeSample } from './fixtures/fiscalWsfe'
async function browserCorrection(){
 const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,numero:_n,...data}=wsfeSample
 const {total:_t,...importes}=data.importes
 return {review:{operacion_id:scope.saleId,estado:'RESERVADA' as const,revision:1,solicitud:await freezeFiscalRequest(wsfeSample),aprobacion:null},
  input:{condicionEmisor:'MONOTRIBUTO' as const,datos:{...data,importes}},
  context:{version:1 as const,venta_id:scope.saleId,total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:2,incluye_recepcion_envases:false,revision_parametros:1,condiciones:[{id:5,descripcion:'Ensayo',comprobantes:[11]}],alicuotas:[]}}
}
it('sustitución navegador usa Web Lock, token fijado y retiro real de datos tras lectura',async()=>{
 const f=await browserCorrection();let ack:Record<string,unknown>|null=null
 mocks.invoke.mockImplementation(async(_name,args)=>{
  const cmd=args.body;expect(args.headers.Authorization).toBe('Bearer SYNTHETIC_BROWSER_SESSION')
  if(cmd.accion==='SUSTITUIR_PREPARACION_FISCAL'){
   expect(localStorage.getItem(`kioskopos:fiscal:v1:${scope.authId}:${scope.kioskId}:${scope.saleId}:replacement`)).not.toBeNull()
   ack={operacion_id:cmd.operacion_id,sucesora_id:cmd.sucesora_id,venta_id:scope.saleId,anterior_sha256:cmd.anterior_sha256,preparacion_sha256:cmd.propuesta.sha256,sucesora_sha256:'b'.repeat(64),numero:1,estado:'SUSTITUIDA',emision_habilitada:false}
  }
  return {data:{version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:ack},error:null}
 })
 const client=createFiscalBrowserClient(scope),result=await client.replace(f.review,f.input,f.context)
 expect(mocks.lock).toHaveBeenCalledTimes(1);expect(mocks.invoke.mock.calls.map(([,args])=>args.body.accion)).toEqual(['SUSTITUIR_PREPARACION_FISCAL','SUSTITUCION_PREPARACION_FISCAL'])
 expect(client.pendingReplacement()).toBeNull();expect(client.pending()?.operationId).toBe(result.sucesora_id);expect([...Array(localStorage.length)].map((_,i)=>localStorage.getItem(localStorage.key(i)!)).join('')).not.toContain('numeroDocumento')
})
it('sustitución sin Web Locks o con flag revocado esperando no persiste ni envía',async()=>{
 const f=await browserCorrection(),client=createFiscalBrowserClient(scope)
 Object.defineProperty(navigator,'locks',{configurable:true,value:undefined})
 await expect(client.replace(f.review,f.input,f.context)).rejects.toThrow('FISCAL_COORDINACION_NO_DISPONIBLE');expect(localStorage.length).toBe(0)
 Object.defineProperty(navigator,'locks',{configurable:true,value:{request:mocks.lock}})
 mocks.lock.mockImplementation(async(_name,_options,task)=>{vi.stubEnv('VITE_KIOSKO_ARCA_REVISION_HOMO','false');return task()})
 await expect(client.replace(f.review,f.input,f.context)).rejects.toThrow('FISCAL_NO_HABILITADO');expect(localStorage.length).toBe(0);expect(mocks.session).not.toHaveBeenCalled();expect(mocks.invoke).not.toHaveBeenCalled()
})

it('navegador conserva propuesta R bajo Web Lock, timeout acotado y token original',async()=>{
 const f=await browserCorrection();let ack:Record<string,unknown>|null=null
 mocks.invoke.mockImplementation(async(_name,args)=>{
  const cmd=args.body;expect(args.headers.Authorization).toBe('Bearer SYNTHETIC_BROWSER_SESSION')
  if(cmd.accion==='CORREGIR_RECHAZO_FISCAL'){
   expect(args.timeout).toBe(40000)
   expect(JSON.parse(localStorage.getItem(`kioskopos:fiscal:v1:${scope.authId}:${scope.kioskId}:${scope.saleId}:replacement`)!)).toMatchObject({version:2,kind:'RECHAZO'})
   ack={operacion_id:cmd.operacion_id,sucesora_id:cmd.sucesora_id,venta_id:scope.saleId,anterior_sha256:cmd.anterior_sha256,preparacion_sha256:cmd.propuesta.sha256,sucesora_sha256:'b'.repeat(64),numero:1,estado:'RECHAZO_CORREGIDO',emision_habilitada:false}
  }else expect(args.timeout).toBe(15000)
  return {data:{version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:ack},error:null}
 })
 const api=createFiscalBrowserClient(scope),result=await api.replace({...f.review,estado:'ENVIO_INCIERTO'},f.input,f.context,'RECHAZO')
 expect(mocks.lock).toHaveBeenCalledTimes(1);expect(api.pendingReplacement()).toBeNull();expect(api.pending()?.operationId).toBe(result.sucesora_id)
 expect(mocks.invoke.mock.calls.map(([,args])=>args.body.accion)).toEqual(['CORRECCION_RECHAZO_FISCAL','CORREGIR_RECHAZO_FISCAL','CORRECCION_RECHAZO_FISCAL'])
})

it('consulta navegador usa mismo Web Lock, token original y timeout por acción',async()=>{
 const f=await browserCorrection();let ack:Record<string,unknown>|null=null
 mocks.invoke.mockImplementation(async(_name,args)=>{
  const cmd=args.body;expect(args.headers.Authorization).toBe('Bearer SYNTHETIC_BROWSER_SESSION')
  if(cmd.accion==='CONCILIAR'){
   expect(args.timeout).toBe(40000);expect(localStorage.getItem(`kioskopos:fiscal:v1:${scope.authId}:${scope.kioskId}:${scope.saleId}:reconciliation`)).not.toBeNull()
   ack={version:1,operacion_id:cmd.operacion_id,numero:1,estado:'PENDIENTE_CONCILIACION',solicitud_sha256:f.review.solicitud.sha256,revision:1,emision_habilitada:false}
  }else expect(args.timeout).toBe(15000)
  return {data:{version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:ack},error:null}
 })
 const api=createFiscalBrowserClient(scope);await api.reconcile({...f.review,estado:'ENVIO_INCIERTO'})
 expect(api.pendingObservation()).toBeNull();expect(mocks.lock).toHaveBeenCalledTimes(1)
 expect(mocks.invoke.mock.calls.map(([,args])=>args.body.accion)).toEqual(['CONSULTAR_CONCILIACION','CONCILIAR','CONSULTAR_CONCILIACION'])
})
