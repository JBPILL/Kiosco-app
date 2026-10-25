import { expect, it } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { prepareFiscalCreditRequest } from '../../supabase/functions/_shared/fiscalCreditRequest'
import type { FiscalCreditReservation } from '../../supabase/functions/_shared/fiscalCreditRequest'
import { validateFiscalCreditSendSource, validateFiscalCreditSendBinding } from '../../supabase/functions/_shared/fiscalCreditSendSource'
import { validateFiscalWorkerBinding } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { validateFiscalCreditNumberBinding } from '../../supabase/functions/_shared/fiscalCreditNumberSource'
async function fixture(invoice: 1 | 6 | 11 = 11, concept: 1 | 2 | 3 = 1) {
  const f = await fiscalCreditContextFixture(invoice, concept), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const entry = concept === 1 ? { servicioDesde: null, servicioHasta: null, vencimientoPago: null }
    : { servicioDesde: '20261002', servicioHasta: '20261019', vencimientoPago: '20261027' }
  const prepared = await prepareFiscalCreditPreparation(f.source, f.proposal, context, entry)
  const wire = { version: 1, estado: 'DATOS_NC_PREPARADOS', contexto: context, preparacion: { canonico: prepared.canonico, sha256: prepared.sha256 },
    emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  const reservation: FiscalCreditReservation = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, preparacion_sha256: prepared.sha256, reserva_id: crypto.randomUUID(),
    cuit_emisor: context.cuit_emisor, punto_venta: context.punto_venta, tipo_comprobante: context.tipo_nota_credito, numero: 23, estado: 'RESERVADA', emision_habilitada: false }
  return { ...f, entry, prepared, wire, reservation }
}
async function recordFixture() {
  const f = await fixture(), request = await prepareFiscalCreditRequest(f.source, f.proposal, f.wire, f.reservation)
  const packet = { preparacion: { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, estado: f.wire.estado, preparacion: f.wire.preparacion, contexto: f.wire.contexto,
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false },
    reserva: f.reservation, cuerpo: { canonico: request.canonico, sha256: request.sha256 } }
  return { ...f, packet, request }
}
async function sendFixture(){
 const f=await recordFixture(),revision=crypto.randomUUID(),permit=crypto.randomUUID()
 const binding={version:1,entorno:'HOMOLOGACION',servicio:'wsfe',finalidad:'ENVIO_NC',venta_id:f.sale,operacion_origen_id:f.operation,solicitud_id:f.input.solicitud_id,propuesta_sha256:f.proposal.sha256,preparacion_sha256:f.prepared.sha256,solicitud_sha256:f.request.sha256,reserva_id:f.reservation.reserva_id,revision_id:revision,permiso_id:permit,kiosco_id:f.scope.kioskId,usuario_id:crypto.randomUUID(),actor_auth_id:f.actor,cuit_emisor:f.context.cuit_emisor,punto_venta:f.context.punto_venta,tipo_comprobante:f.context.tipo_nota_credito,numero:23,credencial_id:crypto.randomUUID(),certificado_sha256:'e'.repeat(64),revision_emisor:1,revision_parametros:1,emision_habilitada:false}
 const permission={version:1,estado:'PERMISO_NC_VERIFICADO',solicitud_id:binding.solicitud_id,reserva_id:binding.reserva_id,solicitud_sha256:binding.solicitud_sha256,preparacion_sha256:binding.preparacion_sha256,revision_id:revision,permiso_id:permit,actor_auth_id:f.actor,vence_en:'2026-10-25T02:00:00Z',emision_habilitada:false}
 return{...f,packet:{cuerpo:f.packet,permiso:permission,binding}}
}
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
 const f=await sendFixture();f.packet.binding[key]=key==='tipo_comprobante'?8:f.packet.binding[key]+1
 await expect(validateFiscalCreditSendSource(f.packet,f.source,f.proposal,f.actor)).rejects.toThrow()
})
it('no acepta finalidad de consulta o numeración como envío NC',async()=>{
 const f=await sendFixture()
 for(const finalidad of ['NUMERACION_NC','CONSULTA_NC','EMISION'])expect(()=>validateFiscalCreditSendBinding({...f.packet.binding,finalidad})).toThrow()
})
