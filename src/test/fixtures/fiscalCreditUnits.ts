import { fiscalCreditCommercialFixture } from './fiscalCreditCommercial'

export function unitCanonical(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item
    const record = item as Record<string, unknown>
    return Object.fromEntries(Object.keys(record).sort().map(key => [key, record[key]]))
  })
}
export async function fiscalCreditUnitsFixture() {
  const f = await fiscalCreditCommercialFixture()
  const data = { version: 1, venta_id: f.sale, checkout_sha256: f.commercial.checkout_sha256,
    lineas: [{ detalle_id: f.commercial.lineas[0].detalle_id, producto_id: f.product, tipo: 'PRODUCTO',
      es_pesable: false, unidad_medida: 'UN', componentes: [{ producto_id: f.product, es_pesable: false, unidad_medida: 'UN' }] }] }
  const wrap = async (value: unknown) => {
    const canonico = unitCanonical(value)
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonico)))
    return { version: 1, venta_id: f.sale, operacion_origen_id: f.operation,
      solicitud_sha256: f.commercial.solicitud_sha256, checkout_sha256: f.commercial.checkout_sha256,
      estado: 'CAPTURADAS', unidades: { canonico, sha256: [...digest].map(byte => byte.toString(16).padStart(2, '0')).join('') },
      emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  }
  return { ...f, data, wrap, packet: await wrap(data) }
}
