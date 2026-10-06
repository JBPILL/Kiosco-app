/** Distribuye el total en pesos enteros sin perder el resto del redondeo. */
export function distribuirTotalVenta(subtotales: readonly number[], total: number): number[] {
  if (!Number.isSafeInteger(total) || total < 0 || subtotales.length === 0
    || subtotales.some((importe) => !Number.isFinite(importe))) {
    throw new Error('Importes de venta inválidos')
  }
  const base = subtotales.reduce((suma, importe) => suma + importe, 0)
  if (!Number.isFinite(base) || base <= 0) throw new Error('Subtotal de venta inválido')
  if (total === 0) return subtotales.map(() => 0)
  const cuotas = subtotales.map((importe) => importe / base * total)
  const resultado = cuotas.map(Math.floor)
  if (resultado.some((importe) => !Number.isSafeInteger(importe))) throw new Error('Importe fuera de rango')
  const resto = total - resultado.reduce((suma, importe) => suma + importe, 0)
  if (!Number.isSafeInteger(resto) || resto < 0 || resto > resultado.length) {
    throw new Error('No se pudo distribuir el total')
  }
  const orden = cuotas.map((importe, indice) => ({ indice, fraccion: importe - resultado[indice] }))
    .sort((a, b) => b.fraccion - a.fraccion || a.indice - b.indice)
  for (let i = 0; i < resto; i++) resultado[orden[i].indice] += 1
  return resultado
}
