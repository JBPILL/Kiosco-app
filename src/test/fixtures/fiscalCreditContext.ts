import { fiscalCreditFixture } from './fiscalCredit'
export async function fiscalCreditContextFixture() {
  const f = await fiscalCreditFixture()
  const context = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.proposal.datos.solicitud_id,
    propuesta_sha256: f.proposal.sha256, checkout_sha256: 'c'.repeat(64), fuente_comercial_sha256: 'b'.repeat(64), unidades_sha256: 'd'.repeat(64),
    cuit_emisor: f.proposal.datos.origen.cuit, punto_venta: 7, revision_emisor: 1, revision_parametros: 1, tipo_nota_credito: 13,
    condiciones: [{ id: 5, descripcion: 'Condición sintética', comprobantes: [13] }], alicuotas: [], emision_habilitada: false }
  return { ...f, context }
}
