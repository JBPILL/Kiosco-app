import type { TipoComprobanteAFIP } from '../types/afip'

export interface DesgloseImportesAFIP {
  importeTotal: number
  importeNeto: number
  importeIva: number
  importeTributos: number
  importeOperacionesExentas: number
  importeNoGravado: number
  alicuotaCodigo: number
  alicuotaIva: number
}

/**
 * Calcula los importes netos, IVA y códigos de alícuotas reglamentarios según AFIP / ARCA (WSFEv1).
 * 
 * - Factura C (tipo 11): Emitida por Monotributistas. No discrimina IVA. Neto = Total, IVA = 0.
 * - Factura B (tipo 6) y Factura A (tipo 1): Emitidas por Responsables Inscriptos.
 *   Calcula el importe neto desglosando la alícuota correspondiente (por defecto 21%, código 5).
 */
export function calcularImportesAFIP(params: {
  total: number
  tipoComprobante: TipoComprobanteAFIP | number
  alicuotaIva?: number
}): DesgloseImportesAFIP {
  const { total, tipoComprobante, alicuotaIva = 21 } = params

  const totalSeguro = Math.max(0, Number(Number(total || 0).toFixed(2)))

  // Factura C (Código 11): Monotributo no discrimina IVA
  if (Number(tipoComprobante) === 11) {
    return {
      importeTotal: totalSeguro,
      importeNeto: totalSeguro,
      importeIva: 0,
      importeTributos: 0,
      importeOperacionesExentas: 0,
      importeNoGravado: 0,
      alicuotaCodigo: 3, // Código AFIP para 0%
      alicuotaIva: 0,
    }
  }

  // Factura A (1) o B (6): Responsable Inscripto
  const alicuota = Number.isFinite(alicuotaIva) && alicuotaIva > 0 ? alicuotaIva : 21

  // Determinar código de alícuota según tabla AFIP
  let alicuotaCodigo = 5 // 21% por defecto
  if (Math.abs(alicuota - 10.5) < 0.1) alicuotaCodigo = 4
  else if (Math.abs(alicuota - 27) < 0.1) alicuotaCodigo = 6
  else if (Math.abs(alicuota - 5) < 0.1) alicuotaCodigo = 8
  else if (Math.abs(alicuota - 2.5) < 0.1) alicuotaCodigo = 9
  else if (alicuota === 0) alicuotaCodigo = 3

  const neto = Number((totalSeguro / (1 + alicuota / 100)).toFixed(2))
  const iva = Number((totalSeguro - neto).toFixed(2))

  return {
    importeTotal: totalSeguro,
    importeNeto: neto,
    importeIva: iva,
    importeTributos: 0,
    importeOperacionesExentas: 0,
    importeNoGravado: 0,
    alicuotaCodigo,
    alicuotaIva: alicuota,
  }
}
