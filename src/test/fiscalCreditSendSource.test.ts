import { fiscalCreditSendFixture } from './fixtures/fiscalCreditSend'
import { expect, it } from 'vitest'
import { validateFiscalCreditSendSource, validateFiscalCreditSendBinding } from '../../supabase/functions/_shared/fiscalCreditSendSource'
import { validateFiscalWorkerBinding } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { validateFiscalCreditNumberBinding } from '../../supabase/functions/_shared/fiscalCreditNumberSource'
const sendFixture=()=>fiscalCreditSendFixture()
it('contrato ENVIO_NC reconstruye cuerpo y congela evidencia; no es autoridad ni binding de factura/numeración',async()=>{
 const f=await sendFixture(),result=await validateFiscalCreditSendSource(f.packet,f.source,f.proposal,f.actor)
 expect(result.binding).toEqual(f.packet.binding);expect(result.cuerpo.sha256).toBe(f.request.sha256)
 expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.binding)).toBe(true);expect(Object.isFrozen(result.permiso)).toBe(true)
 expect(()=>validateFiscalWorkerBinding(result.binding,f.operation)).toThrow();expect(()=>validateFiscalCreditNumberBinding(result.binding)).toThrow()
 // Una fecha histórica válida no acredita permiso vigente; SQL vuelve a verificar.
 expect(result.permiso.vence_en).toBe(f.packet.permiso.vence_en)
})
it.each(['venta_id','operacion_origen_id','solicitud_id','reserva_id','revision_id','permiso_id','actor_auth_id','propuesta_sha256','preparacion_sha256','solicitud_sha256','cuit_emisor','punto_venta','tipo_comprobante','numero','revision_emisor','revision_parametros','finalidad','entorno','emision_habilitada','credencial_id','certificado_sha256','extra'])('rechaza binding alterado %s',async key=>{
 const f=await sendFixture(),packet:{cuerpo:unknown;permiso:unknown;binding:Record<string,unknown>}=structuredClone(f.packet)
 packet.binding[key]=key==='extra'?'extra':typeof packet.binding[key]==='number'?Number(packet.binding[key])+1:typeof packet.binding[key]==='boolean'?true:'INVALIDO'
 await expect(validateFiscalCreditSendSource(packet,f.source,f.proposal,f.actor)).rejects.toThrow('FISCAL_FUENTE_ENVIO_NC_INVALIDA')
})
it.each(['solicitud_id','reserva_id','revision_id','permiso_id','actor_auth_id','solicitud_sha256','preparacion_sha256','vence_en','estado','extra'])('rechaza permiso alterado %s',async key=>{
 const f=await sendFixture(),packet:{cuerpo:unknown;permiso:Record<string,unknown>;binding:unknown}=structuredClone(f.packet)
 packet.permiso[key]='INVALIDO'
 await expect(validateFiscalCreditSendSource(packet,f.source,f.proposal,f.actor)).rejects.toThrow('FISCAL_FUENTE_ENVIO_NC_INVALIDA')
})
it('cambio UUID/hash válido y coincidente en permiso/binding sigue rechazado contra cuerpo',async()=>{
 const f=await sendFixture();f.packet.binding.reserva_id=crypto.randomUUID();f.packet.permiso.reserva_id=f.packet.binding.reserva_id
 await expect(validateFiscalCreditSendSource(f.packet,f.source,f.proposal,f.actor)).rejects.toThrow()
})
it('canónico/hash alterados no pasan aunque metadata externa coincida',async()=>{
 const f=await sendFixture();f.packet.cuerpo.cuerpo.canonico+=' '
 await expect(validateFiscalCreditSendSource(f.packet,f.source,f.proposal,f.actor)).rejects.toThrow()
})
it('captura antes de await y no incorpora cambios tardíos en credencial/permiso',async()=>{
 const f=await sendFixture(),expected=structuredClone(f.packet),pending=validateFiscalCreditSendSource(f.packet,f.source,f.proposal,f.actor)
 f.packet.binding.credencial_id=crypto.randomUUID();f.packet.permiso.vence_en='INVALIDO'
 expect((await pending).binding).toEqual(expected.binding)
})

it.each(['numero','punto_venta','tipo_comprobante','revision_emisor','revision_parametros'] as const)('valores numéricos válidos pero distintos %s no sustituyen cuerpo',async key=>{
 const f=await sendFixture(),binding:Record<string,unknown>={...f.packet.binding}
 binding[key]=key==='tipo_comprobante'?8:f.packet.binding[key]+1
 await expect(validateFiscalCreditSendSource({...f.packet,binding},f.source,f.proposal,f.actor)).rejects.toThrow()
})
it('no acepta finalidad de consulta o numeración como envío NC',async()=>{
 const f=await sendFixture()
 for(const finalidad of ['NUMERACION_NC','CONSULTA_NC','EMISION'])expect(()=>validateFiscalCreditSendBinding({...f.packet.binding,finalidad})).toThrow()
})
