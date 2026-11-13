// @vitest-environment node
import { beforeAll, expect, it, vi } from 'vitest'
import { createPrivateCreditSendFiscalCustody } from '../../supabase/functions/_shared/fiscalPrivateCustody'
import type { FiscalCreditSendBinding } from '../../supabase/functions/_shared/fiscalCreditSendSource'
import { prepareWsaaRequest } from '../../supabase/functions/_shared/fiscalWsaaCms'
import { syntheticEncryptedCustody } from './fixtures/fiscalEncryptedCustody'
let fixture:Awaited<ReturnType<typeof syntheticEncryptedCustody>>
beforeAll(async()=>{fixture=await syntheticEncryptedCustody()})
function binding():FiscalCreditSendBinding {
 const b=fixture.binding
 return{version:1,entorno:'HOMOLOGACION',servicio:'wsfe',finalidad:'ENVIO_NC',venta_id:crypto.randomUUID(),operacion_origen_id:b.operacion_id,solicitud_id:crypto.randomUUID(),propuesta_sha256:'a'.repeat(64),preparacion_sha256:'b'.repeat(64),solicitud_sha256:'c'.repeat(64),reserva_id:crypto.randomUUID(),revision_id:crypto.randomUUID(),permiso_id:crypto.randomUUID(),kiosco_id:b.kiosco_id,usuario_id:b.usuario_id,actor_auth_id:crypto.randomUUID(),cuit_emisor:b.cuit_emisor,punto_venta:b.punto_venta,tipo_comprobante:13,numero:23,credencial_id:b.credencial_id,certificado_sha256:b.certificado_sha256,revision_emisor:b.revision,revision_parametros:1,emision_habilitada:false}
}
it('custodia ENVIO_NC verifica autoridad antes/después de descifrar y produce signer no exportable',async()=>{
 const b=binding(),order:string[]=[],read=vi.fn((name:string)=>{order.push('read');return fixture.secrets[name]}),guard=vi.fn(async(value:Readonly<FiscalCreditSendBinding>)=>{order.push('guard');expect(value).toEqual(b);expect(Object.isFrozen(value)).toBe(true)})
 const material=await createPrivateCreditSendFiscalCustody(read,guard)(b,new AbortController().signal)
 expect(order[0]).toBe('guard');expect(order.at(-1)).toBe('guard');expect(guard).toHaveBeenCalledTimes(2)
 expect(material.privateKey.extractable).toBe(false);await expect(crypto.subtle.exportKey('pkcs8',material.privateKey)).rejects.toThrow()
 expect((await prepareWsaaRequest(material,{credentialId:b.credencial_id,certificateSha256:b.certificado_sha256})).cmsDer.length).toBeGreaterThan(100)
 expect(JSON.stringify(material)).toEqual(JSON.stringify({credentialId:b.credencial_id}))
})
it('rechazo guard inicial impide leer secretos y sanea el error',async()=>{
 const read=vi.fn((name:string)=>fixture.secrets[name]),guard=vi.fn(async()=>{throw new Error('SYNTHETIC_PRIVATE_ERROR')})
 await expect(createPrivateCreditSendFiscalCustody(read,guard)(binding(),new AbortController().signal)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
 expect(read).not.toHaveBeenCalled()
})
it('revocación después de descifrar no entrega signer',async()=>{
 const guard=vi.fn(async()=>undefined).mockImplementationOnce(async()=>undefined).mockImplementationOnce(async()=>{throw new Error('SYNTHETIC_REVOKED')})
 await expect(createPrivateCreditSendFiscalCustody(name=>fixture.secrets[name],guard)(binding(),new AbortController().signal)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
 expect(guard).toHaveBeenCalledTimes(2)
})
it.each(['NUMERACION_NC','CONSULTA_NC','EMISION'])('no lee secretos para finalidad %s',async finalidad=>{
 const read=vi.fn((name:string)=>fixture.secrets[name]),guard=vi.fn(async()=>undefined),raw={...binding(),finalidad}
 // Entradas externas no tipadas deben fallar antes del lector privado.
 const adapter=createPrivateCreditSendFiscalCustody(read,guard)
 await expect(Reflect.apply(adapter,undefined,[raw,new AbortController().signal])).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
 expect(read).not.toHaveBeenCalled();expect(guard).not.toHaveBeenCalled()
})
it.each(['revision','huella','password','proyecto'] as const)('custodia ENVIO_NC rechaza %s',async reason=>{
 const b=binding(),secrets={...fixture.secrets}
 if(reason==='revision')b.revision_emisor++
 if(reason==='huella')b.certificado_sha256='e'.repeat(64)
 if(reason==='password')secrets[fixture.prefix+'_PASSWORD']='SYNTHETIC_WRONG_PASSWORD'
 if(reason==='proyecto')secrets.SUPABASE_URL='https://lllkjnqpltnwvxzphncr.supabase.co'
 await expect(createPrivateCreditSendFiscalCustody(name=>secrets[name],async()=>undefined)(b,new AbortController().signal)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
})
it('abort inicial impide guard y lectura',async()=>{
 const c=new AbortController();c.abort();const read=vi.fn((name:string)=>fixture.secrets[name]),guard=vi.fn(async()=>undefined)
 await expect(createPrivateCreditSendFiscalCustody(read,guard)(binding(),c.signal)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE');expect(read).not.toHaveBeenCalled();expect(guard).not.toHaveBeenCalled()
})
it('captura binding antes de guard asíncrono',async()=>{
 const b=binding(),expected=b.credencial_id,guard=vi.fn(async()=>{b.credencial_id=crypto.randomUUID()})
 const result=await createPrivateCreditSendFiscalCustody(name=>fixture.secrets[name],guard)(b,new AbortController().signal)
 expect(result.credentialId).toBe(expected)
})

it('guard ausente no se sustituye por autorización implícita',async()=>{
 const read=vi.fn((name:string)=>fixture.secrets[name]),adapter=Reflect.apply(createPrivateCreditSendFiscalCustody,undefined,[read,undefined])
 await expect(adapter(binding(),new AbortController().signal)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE');expect(read).not.toHaveBeenCalled()
})
it('abort durante guard pendiente finaliza sin leer secretos',async()=>{
 const c=new AbortController(),read=vi.fn((name:string)=>fixture.secrets[name]),guard=vi.fn(()=>new Promise<void>(()=>undefined))
 const pending=createPrivateCreditSendFiscalCustody(read,guard)(binding(),c.signal)
 c.abort();await expect(pending).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE');expect(read).not.toHaveBeenCalled()
})
