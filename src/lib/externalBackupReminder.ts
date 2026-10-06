export type FormatoRespaldoExterno = 'JSON' | 'EXCEL'
export interface DescargaRespaldoExterno {
  fecha: string
  formato: FormatoRespaldoExterno
}
export const EVENTO_RESPALDO_EXTERNO = 'kioskopos:respaldo-externo'
export const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000
const clave = (kioscoId: string): string => `kioskopos_respaldo_externo_v1_${kioscoId}`

export function leerDescargaRespaldoExterno(kioscoId: string): DescargaRespaldoExterno | null {
  if (!kioscoId) return null
  try {
    const dato: unknown = JSON.parse(localStorage.getItem(clave(kioscoId)) ?? 'null')
    if (!dato || typeof dato !== 'object' || Array.isArray(dato)) return null
    const registro = dato as Record<string, unknown>
    if (typeof registro.fecha !== 'string' || !Number.isFinite(Date.parse(registro.fecha))
      || (registro.formato !== 'JSON' && registro.formato !== 'EXCEL')) return null
    return { fecha: registro.fecha, formato: registro.formato }
  } catch { return null }
}

/** Registra sólo la solicitud de descarga completada por la API del navegador. */
export function registrarDescargaRespaldoExterno(
  kioscoId: string, formato: FormatoRespaldoExterno, ahora: number = Date.now(),
): boolean {
  if (!kioscoId || !Number.isFinite(ahora)) return false
  try {
    localStorage.setItem(clave(kioscoId), JSON.stringify({ fecha: new Date(ahora).toISOString(), formato }))
    window.dispatchEvent(new Event(EVENTO_RESPALDO_EXTERNO))
    return true
  } catch { return false }
}

export function necesitaRecordatorioRespaldo(
  descarga: DescargaRespaldoExterno | null, fechaCreacion?: string, ahora: number = Date.now(),
): boolean {
  const referencia = Date.parse(descarga?.fecha ?? fechaCreacion ?? '')
  // Una fecha futura o inválida nunca certifica que existe una copia reciente.
  if (!Number.isFinite(referencia) || referencia > ahora) return true
  return ahora - referencia > SIETE_DIAS_MS
}
