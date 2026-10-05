import { useMemo } from 'react'
import type { MovimientoStock } from '../../types/database'
import { resumirBajasStock } from '../../lib/stockLossSummary'
import { formatPrecio } from '../../lib/utils'

interface Props {
  movimientos: MovimientoStock[]
  autorizado: boolean
  hayMas: boolean
}

const ETIQUETAS = {
  MERMA: 'Merma', PERDIDA: 'Pérdida', ROTURA: 'Rotura',
  VENCIMIENTO: 'Vencimiento', ROBO: 'Robo', CONSUMO_INTERNO: 'Consumo interno',
}

export function ResumenBajasStock({ movimientos, autorizado, hayMas }: Props) {
  const resumen = useMemo(() => autorizado ? resumirBajasStock(movimientos) : [], [movimientos, autorizado])
  if (!autorizado) return null

  return (
    <section aria-label="Resumen de bajas de inventario" className="p-4 border-b border-gray-200 dark:border-gray-700">
      <h3 className="font-semibold text-sm text-gray-900 dark:text-gray-100">Bajas de inventario · estimación a costo histórico</h3>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Basado en {movimientos.length} movimientos cargados que coinciden con los filtros.
        {hayMas && ' Hay más movimientos sin cargar.'} No modifica el balance fiscal.
      </p>
      {resumen.length === 0 ? (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-3">No hay bajas identificadas en estos movimientos.</p>
      ) : (
        <div className="overflow-x-auto mt-3">
          <table className="w-full text-xs text-left">
            <caption className="sr-only">Estimación por motivo de los movimientos cargados</caption>
            <thead className="text-gray-500 dark:text-gray-400">
              <tr><th scope="col" className="py-2">Motivo</th><th scope="col">Movimientos</th><th scope="col">Sin costo conocido</th><th scope="col">Estimación conocida</th></tr>
            </thead>
            <tbody className="text-gray-700 dark:text-gray-200">
              {resumen.map((fila) => (
                <tr key={fila.motivo}>
                  <th scope="row" className="py-2 font-medium">{ETIQUETAS[fila.motivo]}</th>
                  <td>{fila.movimientos}</td><td>{fila.sinCosto}</td>
                  <td>{fila.estimacion === null ? 'No disponible' : formatPrecio(fila.estimacion)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {resumen.some((fila) => fila.sinCosto > 0) && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mt-2">La estimación es parcial: excluye los movimientos sin costo histórico conocido.</p>
      )}
    </section>
  )
}
