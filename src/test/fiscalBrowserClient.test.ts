import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks=vi.hoisted(()=>({url:'https://acoyfwwmhaeruciyedri.supabase.co',session:vi.fn(),invoke:vi.fn()}))
vi.mock('../lib/supabase',()=>({get supabaseUrl(){return mocks.url},supabase:{auth:{getSession:mocks.session},functions:{invoke:mocks.invoke}}}))
import { createFiscalBrowserClient } from '../lib/fiscalBrowserClient'
const scope={authId:'11111111-1111-4111-8111-111111111111',kioskId:'22222222-2222-4222-8222-222222222222',saleId:'33333333-3333-4333-8333-333333333333'}
beforeEach(()=>{
 vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE','true');vi.stubEnv('VITE_KIOSKO_ARCA_REVISION_HOMO','true')
 mocks.url='https://acoyfwwmhaeruciyedri.supabase.co';mocks.session.mockReset();mocks.invoke.mockReset();localStorage.clear()
 mocks.session.mockResolvedValue({data:{session:{user:{id:scope.authId},access_token:'SYNTHETIC_BROWSER_SESSION'}},error:null})
 mocks.invoke.mockResolvedValue({data:{version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:{venta_id:scope.saleId,estado:'SIN_PREPARACION',operacion_id:null,preparacion_sha256:null,emision_habilitada:false}},error:null})
})
afterEach(()=>vi.unstubAllEnvs())
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
