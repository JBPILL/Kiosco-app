import { expect, it } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { prepareFiscalCreditRequest } from '../../supabase/functions/_shared/fiscalCreditRequest'
import type { FiscalCreditReservation } from '../../supabase/functions/_shared/fiscalCreditRequest'
import { validateFiscalCreditConsultSource, validateFiscalCreditConsultBinding } from '../../supabase/functions/_shared/fiscalCreditConsultSource'
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
import { validateFiscalCreditSendBinding } from '../../supabase/functions/_shared/fiscalCreditSendSource'
async function consultFixture(){
 const f=await recordFixture(),binding={version:1,entorno:'HOMOLOGACION',servicio:'wsfe',finalidad:'CONSULTA_NC',venta_id:f.sale,operacion_origen_id:f.operation,solicitud_id:f.input.solicitud_id,propuesta_sha256:f.proposal.sha256,preparacion_sha256:f.prepared.sha256,solicitud_sha256:f.request.sha256,reserva_id:f.reservation.reserva_id,revision_id:crypto.randomUUID(),permiso_id:crypto.randomUUID(),intento_id:crypto.randomUUID(),kiosco_id:f.scope.kioskId,usuario_id:crypto.randomUUID(),actor_auth_id:f.actor,cuit_emisor:f.context.cuit_emisor,punto_venta:f.context.punto_venta,tipo_comprobante:f.context.tipo_nota_credito,numero:23,credencial_id:crypto.randomUUID(),certificado_sha256:'e'.repeat(64),revision_emisor:1,revision_parametros:1,emision_habilitada:false}
 const intent={version:1,estado:'ENVIO_INCIERTO',solicitud_id:binding.solicitud_id,operacion_origen_id:f.operation,intento_id:binding.intento_id,permiso_id:binding.permiso_id,revision_id:binding.revision_id,reserva_id:binding.reserva_id,propuesta_sha256:binding.propuesta_sha256,preparacion_sha256:binding.preparacion_sha256,solicitud_sha256:binding.solicitud_sha256,actor_auth_id:f.actor,nuevo_envio:false,emision_habilitada:false}
 return{...f,packet:{cuerpo:f.packet,intencion:intent,binding}}
}
it('CONSULTA_NC reconstruye cuerpo y vincula intención histórica sin permitir envío',async()=>{
 const f=await consultFixture(),value=await validateFiscalCreditConsultSource(f.packet,f.source,f.proposal,f.actor)
 expect(value.binding).toEqual(f.packet.binding);expect(value.intencion).toEqual(f.packet.intencion);expect(value.cuerpo.sha256).toBe(f.request.sha256)
 expect(Object.isFrozen(value)).toBe(true);expect(Object.isFrozen(value.binding)).toBe(true);expect(Object.isFrozen(value.intencion)).toBe(true)
 expect(()=>validateFiscalCreditSendBinding(value.binding)).toThrow();expect(()=>validateFiscalCreditNumberBinding(value.binding)).toThrow();expect(()=>validateFiscalWorkerBinding(value.binding,f.operation)).toThrow()
})
it.each(['version','estado','solicitud_id','operacion_origen_id','intento_id','permiso_id','revision_id','reserva_id','propuesta_sha256','preparacion_sha256','solicitud_sha256','actor_auth_id','nuevo_envio','emision_habilitada','extra'])('intención alterada %s no concede consulta',async key=>{
 const f=await consultFixture(),intent:Record<string,unknown>={...f.packet.intencion};intent[key]=key==='nuevo_envio'||key==='emision_habilitada'?true:'INVALIDO'
 await expect(validateFiscalCreditConsultSource({...f.packet,intencion:intent},f.source,f.proposal,f.actor)).rejects.toThrow('FISCAL_FUENTE_CONSULTA_NC_INVALIDA')
})
it.each(['intento_id','permiso_id','revision_id','reserva_id','actor_auth_id','solicitud_sha256','credencial_id','certificado_sha256','finalidad','numero','revision_emisor','revision_parametros','extra'])('binding alterado %s no concede consulta',async key=>{
 const f=await consultFixture(),binding:Record<string,unknown>={...f.packet.binding};binding[key]=typeof binding[key]==='number'?Number(binding[key])+1:'INVALIDO'
 await expect(validateFiscalCreditConsultSource({...f.packet,binding},f.source,f.proposal,f.actor)).rejects.toThrow()
})
it.each(['reserva_id','solicitud_sha256','preparacion_sha256','propuesta_sha256'] as const)('mismo cambio válido en intención/binding %s no sustituye cuerpo original',async key=>{
 const f=await consultFixture(),value=key==='reserva_id'?crypto.randomUUID():'f'.repeat(64);f.packet.binding[key]=value;f.packet.intencion[key]=value
 await expect(validateFiscalCreditConsultSource(f.packet,f.source,f.proposal,f.actor)).rejects.toThrow()
})
it('cambio tardío del intento/credencial no modifica captura anterior al await',async()=>{
 const f=await consultFixture(),expected=structuredClone(f.packet),pending=validateFiscalCreditConsultSource(f.packet,f.source,f.proposal,f.actor)
 f.packet.binding.credencial_id=crypto.randomUUID();f.packet.intencion.intento_id=crypto.randomUUID()
 expect((await pending).binding).toEqual(expected.binding)
})
it('finalidad numeración/envío y dato extra no se aceptan como consulta',async()=>{
 const f=await consultFixture()
 for(const finalidad of ['NUMERACION_NC','ENVIO_NC','EMISION'])expect(()=>validateFiscalCreditConsultBinding({...f.packet.binding,finalidad})).toThrow()
 expect(()=>validateFiscalCreditConsultBinding({...f.packet.binding,token:'SYNTHETIC'})).toThrow()
})
