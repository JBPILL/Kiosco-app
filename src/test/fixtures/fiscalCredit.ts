import { fiscalRepresentationFixture } from './fiscalRepresentation'
import { validateFiscalRepresentation } from '../../../supabase/functions/_shared/fiscalRepresentation'
import { prepareFiscalCreditDraft } from '../../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditDraftInput } from '../../../supabase/functions/_shared/fiscalCreditDraft'
export async function fiscalCreditFixture() {
  const f = await fiscalRepresentationFixture(), source = await validateFiscalRepresentation(f.wire, f.sale, f.operation)
  const input: FiscalCreditDraftInput = { version: 1, solicitud_id: crypto.randomUUID(), fecha: '20261023', motivo: 'Devolución sintética', condicion_iva_receptor: 5,
    lineas: [{ detalle_id: source.contexto.lineas[0].detalle_id, cantidad: '2.000', importe: '123.45', reingresa_stock: true }],
    importes: structuredClone(source.constancia.solicitud.solicitud.importes), iva: [], tributos: [] }
  const proposal = await prepareFiscalCreditDraft(source, input, input.fecha)
  const scope = { authId: f.actor, kioskId: crypto.randomUUID(), saleId: f.sale }
  const ack = { version: 1 as const, entorno: 'HOMOLOGACION' as const, solicitud_id: input.solicitud_id, venta_id: f.sale, operacion_origen_id: f.operation,
    propuesta_sha256: proposal.sha256, estado: 'SALDO_RESERVADO_NO_EMITIR' as const, emision_habilitada: false as const, reintegro_habilitado: false as const, reposicion_habilitada: false as const }
  const entry = { secuencia: 1, acuse: ack, propuesta: { canonico: proposal.canonico, sha256: proposal.sha256 } }
  const page = { version: 1, venta_id: f.sale, operacion_origen_id: f.operation, despues: 0, casos: [entry], continuar_desde: null as number | null }
  return { ...f, source, input, proposal, scope, ack, entry, page }
}
