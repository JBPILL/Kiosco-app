export const ETIQUETAS_BAJAS = {
  MERMA: 'Merma', PERDIDA: 'Pérdida', ROTURA: 'Rotura',
  VENCIMIENTO: 'Vencimiento', ROBO: 'Robo', CONSUMO_INTERNO: 'Consumo interno',
}

export interface ReporteBajas {
  movimientos: number
  por_motivo: {
    motivo: keyof typeof ETIQUETAS_BAJAS
    movimientos: number
    sin_costo: number
    estimacion: number | null
  }[]
}

export function validarReporteBajas(valor: unknown): ReporteBajas {
  const invalido = () => new Error('Respuesta inválida del reporte de bajas. No se muestran totales incompletos.')
  if (!valor || typeof valor !== 'object') throw invalido()
  const objeto = valor as Record<string, unknown>
  if (typeof objeto.movimientos !== 'number' || !Number.isSafeInteger(objeto.movimientos) || objeto.movimientos < 0 || !Array.isArray(objeto.por_motivo)) throw invalido()
  const motivos = new Set<string>()
  const filas = objeto.por_motivo.map((fila: unknown) => {
    if (!fila || typeof fila !== 'object') throw invalido()
    const row = fila as Record<string, unknown>
    if (typeof row.motivo !== 'string' || !Object.hasOwn(ETIQUETAS_BAJAS, row.motivo) || motivos.has(row.motivo)
      || typeof row.movimientos !== 'number' || !Number.isSafeInteger(row.movimientos) || row.movimientos <= 0
      || typeof row.sin_costo !== 'number' || !Number.isSafeInteger(row.sin_costo) || row.sin_costo < 0 || row.sin_costo > row.movimientos
      || (row.estimacion !== null && (typeof row.estimacion !== 'number' || !Number.isFinite(row.estimacion) || row.estimacion < 0))
      || ((row.sin_costo === row.movimientos) !== (row.estimacion === null))) throw invalido()
    motivos.add(row.motivo)
    return {
      motivo: row.motivo as keyof typeof ETIQUETAS_BAJAS,
      movimientos: row.movimientos, sin_costo: row.sin_costo, estimacion: row.estimacion as number | null,
    }
  })
  if (filas.reduce((total, fila) => total + fila.movimientos, 0) !== objeto.movimientos) throw invalido()
  return { movimientos: objeto.movimientos, por_motivo: filas }
}
