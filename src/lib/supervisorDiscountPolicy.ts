export interface PoliticaDescuentoSupervisor { umbralPorcentaje: number; revision: number }

export function leerPoliticaDescuentoSupervisor(valor: unknown): PoliticaDescuentoSupervisor {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Política de descuento inválida')
  const fila = valor as Record<string, unknown>
  if (Object.keys(fila).length !== 2 || typeof fila.umbralPorcentaje !== 'number'
    || !Number.isFinite(fila.umbralPorcentaje) || fila.umbralPorcentaje < 0 || fila.umbralPorcentaje > 100
    || Math.abs(fila.umbralPorcentaje * 100 - Math.round(fila.umbralPorcentaje * 100)) > 0.000001
    || typeof fila.revision !== 'number' || !Number.isSafeInteger(fila.revision) || fila.revision < 0) {
    throw new Error('Política de descuento inválida')
  }
  return { umbralPorcentaje: fila.umbralPorcentaje, revision: fila.revision }
}
