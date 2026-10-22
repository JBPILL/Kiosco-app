// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { validateFiscalEmissionReceipt } from '../../supabase/functions/_shared/fiscalEmissionReceipt'
import { persistFiscalEmissionReceipt } from '../../supabase/functions/_shared/fiscalEmissionReceiptPersistence'
import type { FiscalRpc } from '../../supabase/functions/_shared/fiscalPersistence'

const actor=crypto.randomUUID(),op=crypto.randomUUID(),attempt=crypto.randomUUID(),hash='a'.repeat(64)
const receipt={estado:'RECHAZO_RECIBIDO',codigos:[10017,10017],puedeReenviar:false}
const stored={operacion_id:op,intento_id:attempt,solicitud_sha256:hash,respuesta:receipt,registrada:true}
const run=(rpc:FiscalRpc['rpc'],input:unknown=receipt)=>persistFiscalEmissionReceipt({rpc},actor,op,attempt,hash,input)

it('conserva códigos en orden y copia inmutable, sin convertir recepción en autorización',()=>{
 const input=structuredClone(receipt),result=validateFiscalEmissionReceipt(input)
 input.codigos.push(42);expect(result.codigos).toEqual([10017,10017]);expect(Object.isFrozen(result.codigos)).toBe(true)
 expect(result.puedeReenviar).toBe(false);expect(result).not.toHaveProperty('cae')
})
it.each([null,[],{}, {...receipt,puedeReenviar:true},{...receipt,estado:'AUTORIZADA'}, {...receipt,estado:{toString:()=>receipt.estado}}, {...receipt,token:'fixture'}, {...receipt,cae:'11111111111111'}, {...receipt,codigos:new Array(1)}])('rechaza recepción no cerrada %# antes de RPC',async input=>{
 const rpc=vi.fn<FiscalRpc['rpc']>();await expect(run(rpc,input)).rejects.toThrow();expect(rpc).not.toHaveBeenCalled()
})
it.each([0,-1,1.2,2147483648,'10017',null,NaN])('rechaza código no válido %s',code=>{
 expect(()=>validateFiscalEmissionReceipt({...receipt,codigos:[code]})).toThrow()
})
it('admite hasta 200 códigos (errores y observaciones) y rechaza excesos',()=>{
 expect(validateFiscalEmissionReceipt({...receipt,codigos:Array(200).fill(2147483647)}).codigos).toHaveLength(200)
 expect(()=>validateFiscalEmissionReceipt({...receipt,codigos:Array(201).fill(1)})).toThrow()
})
it.each(['error','throw','ack'])('recupera registro durable tras escritura %s sin repetirla',async mode=>{
 const rpc=vi.fn<FiscalRpc['rpc']>(async name=>{
  if(name==='cargar_respuesta_emision_homologacion')return {data:stored,error:null}
  if(mode==='throw')throw new Error('SYNTHETIC_ACK_LOST')
  return mode==='error'?{data:null,error:new Error('SYNTHETIC_ACK_LOST')}:{data:stored,error:null}
 })
 await expect(run(rpc)).resolves.toBeUndefined();expect(rpc.mock.calls.map(([name])=>name)).toEqual(['registrar_respuesta_emision_homologacion','cargar_respuesta_emision_homologacion'])
})
it('un ACK positivo sin registro no confirma auditoría',async()=>{
 const rpc=vi.fn<FiscalRpc['rpc']>(async name=>({data:name.startsWith('registrar')?stored:null,error:null}))
 await expect(run(rpc)).rejects.toThrow('FISCAL_RESPUESTA_NO_CONFIRMADA')
})
it.each([{...stored,operacion_id:crypto.randomUUID()},{...stored,intento_id:crypto.randomUUID()},{...stored,solicitud_sha256:'b'.repeat(64)},
 {...stored,respuesta:{...receipt,codigos:[10017]}},{...stored,respuesta:{...receipt,estado:'APROBACION_RECIBIDA'}},{...stored,registrada:false},{...stored,sign:'fixture'}])('no atribuye lectura distinta a la recepción original %#',async value=>{
 const rpc=vi.fn<FiscalRpc['rpc']>(async()=>({data:value,error:null}));await expect(run(rpc)).rejects.toThrow()
})

it('error de lectura no acepta datos aparentemente válidos',async()=>{
 const rpc=vi.fn<FiscalRpc['rpc']>(async name=>({data:stored,error:name.startsWith('cargar')?new Error('SYNTHETIC_READ_ERROR'):null}))
 await expect(run(rpc)).rejects.toThrow('FISCAL_RESPUESTA_NO_CONFIRMADA')
})
