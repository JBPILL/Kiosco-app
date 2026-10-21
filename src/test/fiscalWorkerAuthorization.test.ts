// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { authorizeFiscalWorker } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'

const op=randomUUID(),actor=randomUUID()
const binding={version:1,entorno:'HOMOLOGACION',servicio:'wsfe',operacion_id:op,kiosco_id:randomUUID(),usuario_id:randomUUID(),
  cuit_emisor:'20123456786',punto_venta:2,credencial_id:randomUUID(),certificado_sha256:'a'.repeat(64),revision:1}
function backend(data:unknown=binding) {
  return {auth:{getUser:vi.fn(async()=>({data:{user:{id:actor}},error:null}))},rpc:vi.fn(async()=>({data,error:null}))}
}
it('deriva actor de getUser verificado y pide autorización privada sin usar claims del cliente',async()=>{
  const admin=backend()
  const result=await authorizeFiscalWorker(admin,'SYNTHETIC_JWT',op)
  expect(admin.auth.getUser).toHaveBeenCalledWith('SYNTHETIC_JWT')
  expect(admin.rpc).toHaveBeenCalledWith('autorizar_consulta_fiscal_homologacion',{p_actor_auth_id:actor,p_operacion_id:op})
  expect(result).toEqual(binding);expect(Object.isFrozen(result)).toBe(true)
})
it.each([null,{},[],{...binding,entorno:'PRODUCCION'},{...binding,servicio:'otro'},{...binding,operacion_id:randomUUID()},
  {...binding,credencial_id:'invalid'},{...binding,certificado_sha256:'x'+'a'.repeat(64)},
  {...binding,punto_venta:0},{...binding,revision:0},{...binding,token:'not-admitted'}])('rechaza binding privado inválido %#',async value=>{
  await expect(authorizeFiscalWorker(backend(value),'SYNTHETIC_JWT',op)).rejects.toThrow('FISCAL_CONSULTA_NO_AUTORIZADA')
})
it('rechaza error Auth antes de la consulta privada y sanitiza excepciones',async()=>{
  const rpc=vi.fn()
  const admin: FiscalAuthClient={auth:{async getUser(){throw new Error('SYNTHETIC_PRIVATE_CONTENT')}},rpc}
  await expect(authorizeFiscalWorker(admin,'SYNTHETIC_JWT',op)).rejects.toThrow('FISCAL_CONSULTA_NO_AUTORIZADA')
  expect(rpc).not.toHaveBeenCalled()
})
it.each(['','with space','x'.repeat(16385)])('rechaza token mal formado antes de Auth %#',async token=>{
  const admin=backend()
  await expect(authorizeFiscalWorker(admin,token,op)).rejects.toThrow('FISCAL_CONSULTA_NO_AUTORIZADA')
  expect(admin.auth.getUser).not.toHaveBeenCalled()
})
it.each([true,false])('rechaza respuesta Auth sin usuario válido o con error %#',async withError=>{
  const rpc=vi.fn()
  const admin: FiscalAuthClient={auth:{async getUser(){return {data:{user:withError?{id:actor}:null},error:withError?{code:'SYNTHETIC_AUTH_ERROR'}:null}}},rpc}
  await expect(authorizeFiscalWorker(admin,'SYNTHETIC_JWT',op)).rejects.toThrow('FISCAL_CONSULTA_NO_AUTORIZADA')
  expect(rpc).not.toHaveBeenCalled()
})
