import { useState, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getCachedProductos, saveCachedProductos } from '../../lib/utils'
import { playScanSound } from '../../lib/sound'
import { useBarcodeGun } from '../../hooks/useBarcodeGun'
import { useLoteStore } from '../../stores/loteStore'
import type { Producto } from '../../types/database'
import toast from 'react-hot-toast'

interface ItemAuditoria {
  producto: Producto
  stockTeorico: number
  stockContado: number
}

interface AuditoriaInventarioModalProps {
  isOpen: boolean
  onClose: () => void
  productos: Producto[]
  onInventarioAplicado: () => void
}

export function AuditoriaInventarioModal({
  isOpen,
  onClose,
  productos,
  onInventarioAplicado,
}: AuditoriaInventarioModalProps) {
  const { usuario, kiosco } = useAuthStore()
  const [itemsAuditados, setItemsAuditados] = useState<ItemAuditoria[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [procesando, setProcesando] = useState(false)

  // Escaneo directo con pistola de código de barras
  useBarcodeGun({
    enabled: isOpen,
    onScan: (barcode) => {
      const clean = barcode.trim()
      const prod = productos.find(
        (p) => p.codigo_barras?.trim() === clean || p.id === clean
      )
      if (prod) {
        agregarOIncrementar(prod)
        playScanSound('success')
        toast.success(`Contado: ${prod.descripcion}`, { id: 'scan-audit', duration: 1500 })
      } else {
        playScanSound('error')
        toast.error(`Código no encontrado: ${clean}`, { id: 'scan-audit-err' })
      }
    },
  })

  const agregarOIncrementar = (prod: Producto, incremento = 1) => {
    setItemsAuditados((prev) => {
      const index = prev.findIndex((i) => i.producto.id === prod.id)
      if (index >= 0) {
        const copia = [...prev]
        const actual = copia[index]
        copia[index] = {
          ...actual,
          stockContado: Number((actual.stockContado + incremento).toFixed(3)),
        }
        return copia
      } else {
        return [
          {
            producto: prod,
            stockTeorico: prod.stock_actual || 0,
            stockContado: incremento,
          },
          ...prev,
        ]
      }
    })
  }

  const actualizarConteoManual = (productoId: string, valorStr: string) => {
    const val = parseFloat(valorStr)
    const cant = isNaN(val) || val < 0 ? 0 : val
    setItemsAuditados((prev) =>
      prev.map((i) =>
        i.producto.id === productoId ? { ...i, stockContado: cant } : i
      )
    )
  }

  const eliminarDeAuditoria = (productoId: string) => {
    setItemsAuditados((prev) => prev.filter((i) => i.producto.id !== productoId))
  }

  // Resultados de búsqueda manual
  const sugerencias = useMemo(() => {
    if (!busqueda.trim() || busqueda.trim().length < 2) return []
    const q = busqueda.toLowerCase().trim()
    return productos
      .filter(
        (p) =>
          p.descripcion.toLowerCase().includes(q) ||
          p.codigo_barras?.toLowerCase().includes(q)
      )
      .slice(0, 6)
  }, [busqueda, productos])

  // Métricas de la auditoría
  const metricas = useMemo(() => {
    let conDiferencia = 0
    let totalSobrante = 0
    let totalFaltante = 0

    for (const it of itemsAuditados) {
      const rawDiff = it.stockContado - it.stockTeorico
      const diff = Math.abs(rawDiff) < 0.0001 ? 0 : Number(rawDiff.toFixed(3))
      if (diff !== 0) conDiferencia++
      if (diff > 0) totalSobrante += diff
      else if (diff < 0) totalFaltante += Math.abs(diff)
    }

    return {
      totalItems: itemsAuditados.length,
      conDiferencia,
      totalSobrante: Number(totalSobrante.toFixed(3)) || 0,
      totalFaltante: Number(totalFaltante.toFixed(3)) || 0,
    }
  }, [itemsAuditados])

  // Aplicar ajustes en lote
  const handleAplicarAjustes = async () => {
    if (itemsAuditados.length === 0) {
      toast.error('No hay productos auditados para aplicar')
      return
    }

    const itemsConDiferencia = itemsAuditados.filter(
      (i) => i.stockContado !== i.stockTeorico
    )

    if (itemsConDiferencia.length === 0) {
      toast.success('Todos los productos contados coinciden con el sistema. Inventario exacto.')
      onClose()
      return
    }

    const confirmar = window.confirm(
      `¿Desea aplicar los ajustes de inventario para ${itemsConDiferencia.length} producto(s)?\n\nEl stock de cada producto en el sistema se actualizará a la cantidad contada físicamente.`
    )
    if (!confirmar) return

    setProcesando(true)
    const kid = usuario?.kiosco_id || kiosco?.id
    const ahora = new Date().toISOString()
    let ajustados = 0

    try {
      for (const item of itemsConDiferencia) {
        const delta = Number((item.stockContado - item.stockTeorico).toFixed(3))

        // 1. Actualizar tabla productos
        const { error: errProd } = await supabase
          .from('productos')
          .update({
            stock_actual: item.stockContado,
            fecha_actualizacion: ahora,
          })
          .eq('id', item.producto.id)

        if (!errProd) {
          // 2. Registrar movimiento de stock
          await supabase.from('movimientos_stock').insert({
            producto_id: item.producto.id,
            kiosco_id: kid,
            tipo: 'AJUSTE',
            cantidad: delta,
            motivo: 'CONTEO',
            notas: `Auditoría física de inventario (Teórico: ${item.stockTeorico} → Físico: ${item.stockContado})`,
            usuario_id: usuario?.id || null,
            fecha: ahora,
          })

          // BUG-26: Si hubo faltante (merma/rotura no registrada), alinear lotes de vencimiento por FEFO
          if (delta < 0) {
            try {
              await useLoteStore.getState().descontarStockFEFO(item.producto.id, Math.abs(delta))
            } catch (errLote) {
              console.warn('Aviso sincronizando lotes en auditoría:', errLote)
            }
          }

          ajustados++
        }
      }

      // 3. Sincronizar caché local
      if (kid) {
        const cached = getCachedProductos(kid)
        if (cached && cached.length > 0) {
          const mapaAuditados = new Map(
            itemsConDiferencia.map((i) => [i.producto.id, i.stockContado])
          )
          const actualizados = cached.map((p) => {
            const nuevo = mapaAuditados.get(p.id)
            return nuevo !== undefined ? { ...p, stock_actual: nuevo, fecha_actualizacion: ahora } : p
          })
          saveCachedProductos(actualizados, kid)
        }
      }

      playScanSound('success')
      toast.success(`Inventario actualizado (${ajustados} productos ajustados)`, {
        duration: 4000,
      })
      onInventarioAplicado()
      onClose()
    } catch (e: any) {
      console.error('Error aplicando ajustes de inventario:', e)
      toast.error('Ocurrió un error al aplicar los ajustes: ' + (e?.message || ''))
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Conteo Físico y Auditoría de Stock"
      size="xl"
    >
      <div className="space-y-3">
        {/* Barra superior: Buscador con autocompletado + Indicador de Lector */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por código de barras o descripción..."
              className="w-full text-xs py-2 px-3 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
            />
            {busqueda && (
              <button
                type="button"
                onClick={() => setBusqueda('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs font-bold"
              >
                ✕
              </button>
            )}

            {/* Menú de sugerencias flotante */}
            {sugerencias.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
                {sugerencias.map((prod) => (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => {
                      agregarOIncrementar(prod)
                      setBusqueda('')
                    }}
                    className="w-full px-3 py-2 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/40 flex items-center justify-between text-xs transition-colors cursor-pointer"
                  >
                    <div>
                      <p className="font-semibold text-gray-900 dark:text-gray-100">{prod.descripcion}</p>
                      <p className="text-[11px] text-gray-400">{prod.codigo_barras || 'Sin código'}</p>
                    </div>
                    <span className="font-medium text-gray-600 dark:text-gray-300">
                      Stock: {prod.stock_actual}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-300 text-xs font-semibold whitespace-nowrap">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Lector Activo</span>
          </div>
        </div>

        {/* Resumen compacto de métricas en 1 fila */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs py-2 px-3 rounded-lg bg-gray-50 dark:bg-gray-800/60 border border-gray-200 dark:border-gray-700">
          <div>
            <span className="text-[10px] text-gray-500 uppercase font-bold block">Auditados</span>
            <span className="font-extrabold text-gray-900 dark:text-gray-100">{metricas.totalItems}</span>
          </div>
          <div>
            <span className="text-[10px] text-amber-600 dark:text-amber-400 uppercase font-bold block">Con Desvío</span>
            <span className={`font-extrabold ${metricas.conDiferencia > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-gray-700 dark:text-gray-300'}`}>
              {metricas.conDiferencia}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase font-bold block">Sobrantes</span>
            <span className={`font-extrabold ${metricas.totalSobrante > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-700 dark:text-gray-300'}`}>
              {metricas.totalSobrante > 0 ? `+${metricas.totalSobrante}` : '0'}
            </span>
          </div>
          <div>
            <span className="text-[10px] text-red-600 dark:text-red-400 uppercase font-bold block">Faltantes</span>
            <span className={`font-extrabold ${metricas.totalFaltante > 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-700 dark:text-gray-300'}`}>
              {metricas.totalFaltante > 0 ? `-${metricas.totalFaltante}` : '0'}
            </span>
          </div>
        </div>

        {/* Tabla de conteo físico */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
          <div className="max-h-64 overflow-y-auto">
            {itemsAuditados.length === 0 ? (
              <div className="py-8 text-center text-xs text-gray-400">
                Escaneá productos con la pistola o buscalos arriba para iniciar el recuento.
              </div>
            ) : (
              <table className="w-full text-left text-xs divide-y divide-gray-200 dark:divide-gray-700">
                <thead className="bg-gray-50 dark:bg-gray-800 text-gray-600 dark:text-gray-300 font-semibold sticky top-0 z-10">
                  <tr>
                    <th className="px-3 py-2">Producto</th>
                    <th className="px-2 py-2 text-center w-16">Sistema</th>
                    <th className="px-2 py-2 text-center w-28">Físico</th>
                    <th className="px-2 py-2 text-center w-24">Diferencia</th>
                    <th className="px-2 py-2 text-center w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {itemsAuditados.map((it) => {
                    const rawDiff = it.stockContado - it.stockTeorico
                    const diff = Math.abs(rawDiff) < 0.0001 ? 0 : Number(rawDiff.toFixed(3))
                    return (
                      <tr key={it.producto.id} className="hover:bg-gray-50/70 dark:hover:bg-gray-800/40">
                        <td className="px-3 py-1.5">
                          <p className="font-semibold text-gray-900 dark:text-gray-100 truncate max-w-[200px] sm:max-w-xs">{it.producto.descripcion}</p>
                          <p className="text-[10px] text-gray-400">{it.producto.codigo_barras || 'Sin código'}</p>
                        </td>
                        <td className="px-2 py-1.5 text-center font-bold text-gray-600 dark:text-gray-300">
                          {it.stockTeorico}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <div className="inline-flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => agregarOIncrementar(it.producto, -1)}
                              className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold flex items-center justify-center cursor-pointer transition-colors"
                            >
                              -
                            </button>
                            <input
                              type="number"
                              step={it.producto.es_pesable ? '0.001' : '1'}
                              value={it.stockContado}
                              onChange={(e) => actualizarConteoManual(it.producto.id, e.target.value)}
                              className="w-12 text-center border border-gray-300 dark:border-gray-600 rounded py-0.5 text-xs font-bold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                            />
                            <button
                              type="button"
                              onClick={() => agregarOIncrementar(it.producto, 1)}
                              className="w-5 h-5 rounded bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-bold flex items-center justify-center cursor-pointer transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-center whitespace-nowrap">
                          {diff === 0 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                              Exacto
                            </span>
                          ) : diff > 0 ? (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                              +{diff}
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300">
                              {diff}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => eliminarDeAuditoria(it.producto.id)}
                            className="text-gray-400 hover:text-red-500 font-bold text-xs cursor-pointer transition-colors"
                            title="Quitar"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Acciones del pie */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setItemsAuditados([])}
            disabled={itemsAuditados.length === 0 || procesando}
            className="text-xs"
          >
            Limpiar lista
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={procesando} className="text-xs">
              Cerrar
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleAplicarAjustes}
              disabled={itemsAuditados.length === 0 || procesando}
              className="text-xs font-bold"
            >
              {procesando ? 'Aplicando ajustes...' : `Aplicar Ajustes (${metricas.conDiferencia})`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
