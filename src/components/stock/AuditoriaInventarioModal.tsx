import { useState, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getCachedProductos, saveCachedProductos } from '../../lib/utils'
import { playScanSound } from '../../lib/sound'
import { useBarcodeGun } from '../../hooks/useBarcodeGun'
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
      .slice(0, 5)
  }, [busqueda, productos])

  // Métricas de la auditoría
  const metricas = useMemo(() => {
    let conDiferencia = 0
    let totalSobrante = 0
    let totalFaltante = 0

    for (const it of itemsAuditados) {
      const diff = Number((it.stockContado - it.stockTeorico).toFixed(3))
      if (diff !== 0) conDiferencia++
      if (diff > 0) totalSobrante += diff
      else if (diff < 0) totalFaltante += Math.abs(diff)
    }

    return {
      totalItems: itemsAuditados.length,
      conDiferencia,
      totalSobrante,
      totalFaltante,
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
      toast.success('Todos los productos contados coinciden con el sistema. ¡Inventario 100% exacto!')
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
            motivo: 'AJUSTE',
            notas: `Auditoría física de inventario (Teórico: ${item.stockTeorico} → Físico: ${item.stockContado})`,
            usuario_id: usuario?.id || null,
            fecha: ahora,
          })
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
      toast.success(`Inventario actualizado con éxito (${ajustados} productos ajustados)`, {
        duration: 5000,
        icon: '📋',
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
      title="Auditoría y Toma de Inventario Físico"
      size="2xl"
    >
      <div className="space-y-4">
        {/* Banner informativo de pistola / lector */}
        <div className="p-3 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2 text-indigo-900 dark:text-indigo-200">
            <span className="text-lg">🔫</span>
            <span>
              <strong>Pistola de código lista:</strong> Escaneá productos sucesivamente para sumar unidades contadas automáticamente.
            </span>
          </div>
          <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-white dark:bg-gray-800 px-2.5 py-1 rounded-md shadow-2xs">
            Modo Lector Activo
          </span>
        </div>

        {/* Búsqueda manual de productos */}
        <div className="relative">
          <Input
            label="Buscar producto por nombre o código para agregar manualmente"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Escribí nombre o código..."
          />

          {sugerencias.length > 0 && (
            <div className="absolute top-full left-0 right-0 z-30 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg overflow-hidden divide-y divide-gray-100 dark:divide-gray-700">
              {sugerencias.map((prod) => (
                <button
                  key={prod.id}
                  type="button"
                  onClick={() => {
                    agregarOIncrementar(prod)
                    setBusqueda('')
                  }}
                  className="w-full px-3 py-2 text-left hover:bg-indigo-50 dark:hover:bg-indigo-950/50 flex items-center justify-between text-xs transition-colors"
                >
                  <div>
                    <p className="font-semibold text-gray-900 dark:text-gray-100">{prod.descripcion}</p>
                    <p className="text-[11px] text-gray-500">{prod.codigo_barras || 'Sin código'}</p>
                  </div>
                  <span className="font-medium text-gray-600 dark:text-gray-300">
                    Stock sist.: {prod.stock_actual}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Resumen de Métricas de la Sesión de Auditoría */}
        <div className="grid grid-cols-4 gap-2 text-center text-xs">
          <div className="p-2 rounded-xl bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700">
            <span className="text-gray-500 block text-[10px] uppercase font-bold">Auditados</span>
            <span className="text-sm font-extrabold text-gray-900 dark:text-gray-100">{metricas.totalItems}</span>
          </div>
          <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
            <span className="text-amber-700 dark:text-amber-400 block text-[10px] uppercase font-bold">Con Desvío</span>
            <span className="text-sm font-extrabold text-amber-700 dark:text-amber-400">{metricas.conDiferencia}</span>
          </div>
          <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800">
            <span className="text-emerald-700 dark:text-emerald-400 block text-[10px] uppercase font-bold">Sobrantes</span>
            <span className="text-sm font-extrabold text-emerald-700 dark:text-emerald-400">+{metricas.totalSobrante}</span>
          </div>
          <div className="p-2 rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800">
            <span className="text-red-700 dark:text-red-400 block text-[10px] uppercase font-bold">Faltantes</span>
            <span className="text-sm font-extrabold text-red-700 dark:text-red-400">-{metricas.totalFaltante}</span>
          </div>
        </div>

        {/* Tabla de Productos Contados */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
          {itemsAuditados.length === 0 ? (
            <div className="p-8 text-center text-xs text-gray-400">
              Escaneá un producto o buscalo arriba para iniciar el recuento físico de inventario.
            </div>
          ) : (
            <table className="w-full text-left text-xs divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800/60 text-gray-500 font-semibold sticky top-0">
                <tr>
                  <th className="px-3 py-2">Producto</th>
                  <th className="px-3 py-2 text-center">Teórico</th>
                  <th className="px-3 py-2 text-center w-28">Físico</th>
                  <th className="px-3 py-2 text-center">Desvío</th>
                  <th className="px-2 py-2 text-center w-8"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {itemsAuditados.map((it) => {
                  const diff = Number((it.stockContado - it.stockTeorico).toFixed(3))
                  return (
                    <tr key={it.producto.id} className="hover:bg-gray-50/50 dark:hover:bg-gray-800/40">
                      <td className="px-3 py-2">
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{it.producto.descripcion}</p>
                        <p className="text-[10px] text-gray-400">{it.producto.codigo_barras || 'S/C'}</p>
                      </td>
                      <td className="px-3 py-2 text-center font-medium text-gray-600 dark:text-gray-300">
                        {it.stockTeorico}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            type="button"
                            onClick={() => agregarOIncrementar(it.producto, -1)}
                            className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-bold text-gray-700 dark:text-gray-300 flex items-center justify-center"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            step={it.producto.es_pesable ? '0.001' : '1'}
                            value={it.stockContado}
                            onChange={(e) => actualizarConteoManual(it.producto.id, e.target.value)}
                            className="w-14 text-center border border-gray-300 dark:border-gray-600 rounded py-0.5 text-xs font-bold text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800"
                          />
                          <button
                            type="button"
                            onClick={() => agregarOIncrementar(it.producto, 1)}
                            className="w-6 h-6 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 font-bold text-gray-700 dark:text-gray-300 flex items-center justify-center"
                          >
                            +
                          </button>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        {diff === 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                            Exacto
                          </span>
                        ) : diff > 0 ? (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300">
                            +{diff} Sobrante
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300">
                            {diff} Faltante
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2 text-center">
                        <button
                          type="button"
                          onClick={() => eliminarDeAuditoria(it.producto.id)}
                          className="text-gray-400 hover:text-red-500 font-bold text-sm"
                          title="Quitar"
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Acciones */}
        <div className="flex items-center justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setItemsAuditados([])}
            disabled={itemsAuditados.length === 0 || procesando}
          >
            Limpiar lista
          </Button>

          <div className="flex items-center gap-2">
            <Button type="button" variant="secondary" onClick={onClose} disabled={procesando}>
              Cerrar
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleAplicarAjustes}
              disabled={itemsAuditados.length === 0 || procesando}
            >
              {procesando ? 'Aplicando ajustes...' : `Aplicar Ajustes (${metricas.conDiferencia})`}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
