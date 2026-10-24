import { fiscalCreditFixture } from './fiscalCredit'
export async function fiscalCreditContextFixture(invoice: 1 | 6 | 11 = 11, concept: 1 | 2 | 3 = 1) {
  const f = await fiscalCreditFixture(invoice, concept), types: number[] = [f.proposal.datos.tipo_nota_credito]
  const context = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.proposal.datos.solicitud_id,
    propuesta_sha256: f.proposal.sha256, checkout_sha256: 'c'.repeat(64), fuente_comercial_sha256: 'b'.repeat(64), unidades_sha256: 'd'.repeat(64),
    cuit_emisor: f.proposal.datos.origen.cuit, punto_venta: 7, revision_emisor: 1, revision_parametros: 1, tipo_nota_credito: f.proposal.datos.tipo_nota_credito,
    condiciones: [{ id: 5, descripcion: 'Condición sintética', comprobantes: types }], alicuotas: f.input.iva.map(row => ({ id: row.id, descripcion: 'Alícuota sintética' })), emision_habilitada: false }
  return { ...f, context }
}
