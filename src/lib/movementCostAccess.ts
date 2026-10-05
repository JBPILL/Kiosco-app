interface CostoPrivadoMovimiento { precio_costo: number | string | null }
interface MovimientoConCostoPrivado {
  costo_privado?: CostoPrivadoMovimiento | CostoPrivadoMovimiento[] | null
  costo_unitario_referencia?: number | null
}

/** Nunca toma el snapshot de la columna pública ni reemplaza desconocido por cero. */
export function adjuntarCostosHistoricos<T extends MovimientoConCostoPrivado>(movimientos: T[], autorizado: boolean) {
  return movimientos.map(({ costo_privado, ...movimiento }) => {
    const privado = Array.isArray(costo_privado) ? costo_privado[0] : costo_privado
    const costo = autorizado && privado?.precio_costo != null ? Number(privado.precio_costo) : null
    return { ...movimiento, costo_unitario_referencia: costo !== null && Number.isFinite(costo) ? costo : null }
  })
}
