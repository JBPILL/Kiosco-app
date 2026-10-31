import { fiscalCreditContextFixture } from './fiscalCreditContext'
import { validateFiscalCreditContext } from '../../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../../supabase/functions/_shared/fiscalCreditPreparation'
import { prepareFiscalCreditRequest } from '../../../supabase/functions/_shared/fiscalCreditRequest'
import type { FiscalCreditReservation } from '../../../supabase/functions/_shared/fiscalCreditRequest'
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
async function recordFixture(invoice:1|6|11=11,concept:1|2|3=1) {
  const f = await fixture(invoice,concept), request = await prepareFiscalCreditRequest(f.source, f.proposal, f.wire, f.reservation)
  const packet = { preparacion: { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, estado: f.wire.estado, preparacion: f.wire.preparacion, contexto: f.wire.contexto,
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false },
    reserva: f.reservation, cuerpo: { canonico: request.canonico, sha256: request.sha256 } }
  return { ...f, packet, request }
}
export async function fiscalCreditSendFixture(invoice:1|6|11=11,concept:1|2|3=1){
 const f=await recordFixture(invoice,concept),revision=crypto.randomUUID(),permit=crypto.randomUUID()
 const binding={version:1,entorno:'HOMOLOGACION',servicio:'wsfe',finalidad:'ENVIO_NC',venta_id:f.sale,operacion_origen_id:f.operation,solicitud_id:f.input.solicitud_id,propuesta_sha256:f.proposal.sha256,preparacion_sha256:f.prepared.sha256,solicitud_sha256:f.request.sha256,reserva_id:f.reservation.reserva_id,revision_id:revision,permiso_id:permit,kiosco_id:f.scope.kioskId,usuario_id:crypto.randomUUID(),actor_auth_id:f.actor,cuit_emisor:f.context.cuit_emisor,punto_venta:f.context.punto_venta,tipo_comprobante:f.context.tipo_nota_credito,numero:23,credencial_id:crypto.randomUUID(),certificado_sha256:'e'.repeat(64),revision_emisor:1,revision_parametros:1,emision_habilitada:false}
 const permission={version:1,estado:'PERMISO_NC_VERIFICADO',solicitud_id:binding.solicitud_id,reserva_id:binding.reserva_id,solicitud_sha256:binding.solicitud_sha256,preparacion_sha256:binding.preparacion_sha256,revision_id:revision,permiso_id:permit,actor_auth_id:f.actor,vence_en:'2026-10-25T02:00:00Z',emision_habilitada:false}
 return{...f,packet:{cuerpo:f.packet,permiso:permission,binding}}
}
