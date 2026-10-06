export type MedioComplementarioPoint = 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA' | 'MERCADOPAGO' | 'CUENTA_CORRIENTE'

export interface PagoComplementarioPoint {
  id: string
  medio: MedioComplementarioPoint
  montoCentavos: number
}

export interface DivisionPagoPoint {
  montoPointCentavos: number
  pagosComplementarios: PagoComplementarioPoint[]
  montoCuentaCorrienteCentavos: number
}

/** Los importes representan aportes netos al ticket; no incluyen efectivo recibido ni vuelto. */
export function dividirPagoPoint(
  totalCentavos: number,
  pagos: PagoComplementarioPoint[],
  clienteId: string | null,
): DivisionPagoPoint {
  if (!Number.isSafeInteger(totalCentavos) || totalCentavos <= 0 || pagos.length > 20) {
    throw new Error('Total o cantidad de pagos inválidos')
  }
  const medios: MedioComplementarioPoint[] = ['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'MERCADOPAGO', 'CUENTA_CORRIENTE']
  const ids = new Set<string>()
  let suma = 0
  let cuentaCorriente = 0
  const complementarios = pagos.map((pago) => {
    if (!pago.id || ids.has(pago.id) || !medios.includes(pago.medio)
      || !Number.isSafeInteger(pago.montoCentavos) || pago.montoCentavos <= 0) {
      throw new Error('Pago complementario inválido')
    }
    ids.add(pago.id)
    suma += pago.montoCentavos
    if (!Number.isSafeInteger(suma) || suma >= totalCentavos) throw new Error('No queda saldo para Point')
    if (pago.medio === 'CUENTA_CORRIENTE') cuentaCorriente += pago.montoCentavos
    return { ...pago }
  })
  if (cuentaCorriente > 0 && !clienteId?.trim()) throw new Error('Cuenta corriente requiere cliente')
  return { montoPointCentavos: totalCentavos - suma,
    pagosComplementarios: complementarios, montoCuentaCorrienteCentavos: cuentaCorriente }
}
