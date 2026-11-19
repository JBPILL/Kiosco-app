import { fiscalCreditFixture } from './fiscalCredit'
export async function fiscalCreditCommercialFixture() {
  const f = await fiscalCreditFixture(), product = crypto.randomUUID()
  const commercial = { version: 1 as const, venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_sha256: f.source.constancia.solicitud.sha256, checkout_sha256: 'c'.repeat(64), total: '123.45',
    pago_integro_efectivo: true, unidades_historicas: 'NO_REGISTRADAS' as const,
    lineas: [{ detalle_id: f.source.contexto.lineas[0].detalle_id, producto_id: product, cantidad: '2.000', subtotal: '123.45',
      tipo: 'PRODUCTO' as const, componentes: [{ producto_id: product, cantidad: '1.000' }], sin_envase: false, precio_envase_unitario: '0.00' }],
    pagos: [{ medio: 'EFECTIVO' as const, importe: '123.45' }], emision_habilitada: false as const, reintegro_habilitado: false as const, reposicion_habilitada: false as const }
  return { ...f, product, commercial }
}
