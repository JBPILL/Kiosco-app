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
