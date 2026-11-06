// @vitest-environment node
import { expect,it } from 'vitest'
import { validateFiscalReconciliationAck } from '../../supabase/functions/_shared/fiscalReconciliationContract'
const op=crypto.randomUUID(),pending={version:1,operacion_id:op,numero:1,estado:'PENDIENTE_CONCILIACION',solicitud_sha256:'a'.repeat(64),revision:1,emision_habilitada:false}
const approved={...pending,estado:'AUTORIZADA',revision:2,cae:'11111111111111',vencimiento:'20261031',procesado_en:null}
it('ACK público cerrado conserva hash/número y no otorga reenvío',()=>{
 expect(validateFiscalReconciliationAck(pending,op,'a'.repeat(64))).toEqual(pending)
 expect(Object.isFrozen(validateFiscalReconciliationAck(approved,op))).toBe(true)
})
it.each([{vencimiento:'20260230'},{vencimiento:'00000101'},{procesado_en:'20261021246000'},{procesado_en:'20260230120000'},{cae:'00000000000000'},{token:'PRIVATE'},{revision:1},{emision_habilitada:true}])('ACK autorizado inválido no confirma resultado: %j',patch=>{
 expect(()=>validateFiscalReconciliationAck({...approved,...patch},op)).toThrow('FISCAL_PERSISTENCIA_NO_CONFIRMADA')
})
it('pendiente no acepta CAE candidato ni identidad/hash de otro cuerpo',()=>{
 expect(()=>validateFiscalReconciliationAck({...pending,cae:'11111111111111'},op)).toThrow()
 expect(()=>validateFiscalReconciliationAck(pending,crypto.randomUUID())).toThrow()
 expect(()=>validateFiscalReconciliationAck(pending,op,'b'.repeat(64))).toThrow()
})
