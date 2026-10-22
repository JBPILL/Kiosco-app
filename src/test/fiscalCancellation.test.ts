// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { validateFiscalPreparationCancellation } from '../../supabase/functions/_shared/fiscalCancellation'
import { cancelFiscalPreparation, loadFiscalPreparationCancellation } from '../../supabase/functions/_shared/fiscalCancellationService'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'

const sale=crypto.randomUUID(),op=crypto.randomUUID(),actor=crypto.randomUUID()
const ack={operacion_id:op,venta_id:sale,estado:'CANCELADA',emision_habilitada:false}
function fixture(){
 const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:actor}},error:null}))
 const rpc=vi.fn<FiscalAuthClient['rpc']>(async()=>({data:ack,error:null}))
 const admin={auth:{getUser},rpc};return {admin,getUser,rpc,run:()=>cancelFiscalPreparation(admin,'SYNTHETIC_SESSION',sale,op)}
}
it('valida DTO cerrado vinculado a venta/operación',()=>{
 expect(validateFiscalPreparationCancellation(ack,sale,op)).toEqual(ack);expect(Object.isFrozen(validateFiscalPreparationCancellation(ack,sale,op))).toBe(true)
})
it.each([null,{}, {...ack,venta_id:crypto.randomUUID()},{...ack,operacion_id:crypto.randomUUID()},{...ack,estado:'RESERVADA'},{...ack,emision_habilitada:true},{...ack,token:'fixture'}])('rechaza ACK falso/ajeno/ampliado %#',value=>{
 expect(()=>validateFiscalPreparationCancellation(value,sale,op)).toThrow()
})
it.each(['ok','error','throw'])('recupera mismo cierre durable después de escritura %s usando Auth una sola vez',async mode=>{
 const f=fixture();f.rpc.mockImplementation(async name=>{
  if(name.startsWith('cancelar')&&mode==='throw')throw new Error('SYNTHETIC_ACK_LOST')
  return name.startsWith('cancelar')&&mode==='error'?{data:null,error:new Error('SYNTHETIC_ACK_LOST')}:{data:ack,error:null}
 })
 expect(await f.run()).toEqual(ack);expect(f.getUser).toHaveBeenCalledTimes(1)
 expect(f.rpc.mock.calls).toEqual(['cancelar_preparacion_fiscal_homologacion','consultar_cancelacion_preparacion_homologacion'].map(name=>[name,{p_actor_auth_id:actor,p_venta_id:sale,p_operacion_id:op}]))
})
it('ACK positivo sin cierre durable no confirma cancelación',async()=>{
 const f=fixture();f.rpc.mockImplementation(async name=>({data:name.startsWith('consultar')?null:ack,error:null}))
 await expect(f.run()).rejects.toThrow('FISCAL_CANCELACION_NO_CONFIRMADA')
})
it('lookup sin registro devuelve null, error con datos aparentemente válidos se rechaza',async()=>{
 const f=fixture();f.rpc.mockResolvedValue({data:null,error:null});expect(await loadFiscalPreparationCancellation(f.admin,'SYNTHETIC_SESSION',sale,op)).toBeNull()
 f.rpc.mockResolvedValue({data:ack,error:new Error('PRIVATE')});await expect(f.run()).rejects.toThrow('FISCAL_CANCELACION_NO_CONFIRMADA')
})
it('sesión inválida o UUID mal formado no llaman RPC',async()=>{
 const f=fixture();f.getUser.mockResolvedValue({data:{user:null},error:new Error('PRIVATE')});await expect(f.run()).rejects.toThrow();expect(f.rpc).not.toHaveBeenCalled()
 f.getUser.mockClear();await expect(cancelFiscalPreparation(f.admin,'SYNTHETIC_SESSION',sale,'otra')).rejects.toThrow();expect(f.getUser).not.toHaveBeenCalled()
})
