import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatPrecio, formatFecha, labelMedioPago } from '../../lib/utils'
import { useDevolucionStore, type VentaConDetalles } from '../../stores/devolucionStore'
import { useAuthStore } from '../../stores/authStore'
import { useCajaStore } from '../../stores/cajaStore'
import { TicketReceiptModal, type TicketData } from './TicketReceiptModal'
import { ventaToTicketData } from '../../lib/ticketUtils'
import type { MetodoReintegro, MotivoDevolucion } from '../../types/database'
import toast from 'react-hot-toast'

interface DevolucionModalProps {
  isOpen: boolean
  onClose: () => void
  onDevolucionExitosa?: () => void
  ventaInicial?: VentaConDetalles | null
}

interface ItemDevolucionSeleccionado {
  productoId: string
  descripcion: string
  cantidadOriginal: number
  cantidadDevolver: number
  precioUnitario: number
  reingresaStock: boolean
  seleccionado: boolean
}

export function DevolucionModal({
  isOpen,
  onClose,
  onDevolucionExitosa,
  ventaInicial,
}: DevolucionModalProps) {
  const { usuario, kiosco } = useAuthStore()
  const { sesionActiva } = useCajaStore()
  const { buscarVentaParaDevolucion, procesarDevolucion, obtenerUltimasVentas } = useDevolucionStore()

  const [criterioBusqueda, setCriterioBusqueda] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [cargandoRecientes, setCargandoRecientes] = useState(false)
  const [ultimasVentas, setUltimasVentas] = useState<VentaConDetalles[]>([])
  const [venta, setVenta] = useState<VentaConDetalles | null>(null)
  const [items, setItems] = useState<ItemDevolucionSeleccionado[]>([])
  const [metodoReintegro, setMetodoReintegro] = useState<MetodoReintegro>('EFECTIVO_CAJA')
  const [motivo, setMotivo] = useState<MotivoDevolucion>('CAMBIO_PRODUCTO')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [ticketParaVer, setTicketParaVer] = useState<TicketData | null>(null)

  const seleccionarVenta = (ventaEncontrada: VentaConDetalles) => {
    setVenta(ventaEncontrada)
    setItems(
      (ventaEncontrada.detalles || []).map((d) => ({
        productoId: d.producto_id,
        descripcion: d.producto?.descripcion || 'Artículo',
        cantidadOriginal: d.cantidad,
        cantidadDevolver: d.cantidad,
        precioUnitario: d.precio_unitario,
        reingresaStock: true,
        seleccionado: true,
      }))
    )

    const fueCC = ventaEncontrada.pagos?.some((p) => p.medio_pago === 'CUENTA_CORRIENTE')
    if (fueCC && ventaEncontrada.cliente) {
      setMetodoReintegro('CUENTA_CORRIENTE')
    } else {
      setMetodoReintegro('EFECTIVO_CAJA')
    }
  }

  // Cargar ventas recientes al abrir si no hay venta seleccionada
  useEffect(() => {
    if (isOpen) {
      if (ventaInicial) {
        seleccionarVenta(ventaInicial)
      } else {
        const kid = usuario?.kiosco_id || kiosco?.id || undefined
        setCargandoRecientes(true)
        obtenerUltimasVentas(kid, 15)
          .then((ventas) => setUltimasVentas(ventas))
          .finally(() => setCargandoRecientes(false))
      }
    } else {
      reiniciar()
    }
  }, [isOpen, ventaInicial, usuario?.kiosco_id, kiosco?.id])

  const handleBuscar = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const limpio = criterioBusqueda.trim()
    if (!limpio) {
      toast.error('Ingresá el número de ticket o ID de venta')
      return
    }

    setBuscando(true)
    const ventaEncontrada = await buscarVentaParaDevolucion(
      limpio,
      usuario?.kiosco_id || kiosco?.id || undefined
    )
    setBuscando(false)

    if (!ventaEncontrada) {
      toast.error('No se encontró ninguna venta con ese número de ticket')
      setVenta(null)
      setItems([])
      return
    }

    seleccionarVenta(ventaEncontrada)
  }

  // Alternar selección de un producto
  const toggleSeleccionItem = (prodId: string) => {
    setItems((prev) =>
      prev.map((it) => (it.productoId === prodId ? { ...it, seleccionado: !it.seleccionado } : it))
    )
  }

  // Modificar cantidad a devolver
  const actualizarCantidadDevolver = (prodId: string, cantidad: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.productoId === prodId) {
          const val = Math.max(0.001, Math.min(cantidad, it.cantidadOriginal))
          return { ...it, cantidadDevolver: val }
        }
        return it
      })
    )
  }

  // Modificar reingreso a stock
  const toggleReingresaStock = (prodId: string) => {
    setItems((prev) =>
      prev.map((it) =>
        it.productoId === prodId ? { ...it, reingresaStock: !it.reingresaStock } : it
      )
    )
  }

  // Cálculo del monto total a reintegrar
  const itemsSeleccionados = items.filter((i) => i.seleccionado)
  const totalReintegro = itemsSeleccionados.reduce(
    (acc, it) => acc + Math.round(it.cantidadDevolver * it.precioUnitario),
    0
  )

  const handleConfirmarDevolucion = async () => {
    if (!venta) return
    if (itemsSeleccionados.length === 0) {
      toast.error('Debes tildar al menos un producto a devolver')
      return
    }

    if (metodoReintegro === 'EFECTIVO_CAJA' && !sesionActiva) {
      const confirmarSinCaja = window.confirm(
        'Atención: No hay una sesión de caja abierta en este momento. El egreso de efectivo no quedará computado en el arqueo actual.\n\n¿Deseas continuar?'
      )
      if (!confirmarSinCaja) return
    }

    setGuardando(true)
    const res = await procesarDevolucion({
      venta,
      itemsADevolver: itemsSeleccionados.map((i) => ({
        productoId: i.productoId,
        cantidad: i.cantidadDevolver,
        precioUnitario: i.precioUnitario,
        reingresaStock: i.reingresaStock,
      })),
      metodoReintegro,
      motivo,
      notas,
      kioscoId: usuario?.kiosco_id || kiosco?.id || venta.kiosco_id,
      usuarioId: usuario?.id || null,
      sesionCajaId: sesionActiva?.id || null,
      clienteId: venta.cliente?.id || null,
    })
    setGuardando(false)

    if (res.success) {
      if (onDevolucionExitosa) onDevolucionExitosa()
      onClose()
    } else {
      toast.error(res.error || 'No se pudo procesar la devolución')
    }
  }

  const reiniciar = () => {
    setVenta(null)
    setItems([])
    setCriterioBusqueda('')
  }

  return (
    <>
      <Modal
      isOpen={isOpen}
      onClose={() => {
        reiniciar()
        onClose()
      }}
      title="Devolución de Venta y Reintegro"
      size="lg"
    >
      <div className="space-y-4">
        {/* Formulario de búsqueda del ticket original */}
        {!venta ? (
          <div className="space-y-4">
            <form onSubmit={handleBuscar} className="space-y-3">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Ingresá el código del ticket en cualquier formato (ej: <span className="font-mono font-bold">BACFC93B</span>, <span className="font-mono font-bold">T-BACFC93B</span>, <span className="font-mono font-bold">#BACFC93B</span> o el ID completo) para cargar los productos facturados.
              </p>

              <div className="flex gap-2">
                <input
                  type="text"
                  value={criterioBusqueda}
                  onChange={(e) => setCriterioBusqueda(e.target.value)}
                  placeholder="N° de ticket (ej: BACFC93B, T-BACFC93B, #BACFC93B)..."
                  className="flex-1 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none focus:border-indigo-500 font-mono font-semibold"
                  autoFocus
                />
                <Button type="submit" loading={buscando}>
                  Buscar Ticket
                </Button>
              </div>
            </form>

            {/* Listado de comprobantes recientes para selección en 1 clic */}
            <div className="pt-1">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                  Últimos comprobantes emitidos:
                </label>
                <span className="text-[11px] text-gray-400">
                  Seleccioná uno para iniciar la devolución sin escribir
                </span>
              </div>

              {cargandoRecientes ? (
                <div className="py-8 text-center text-xs text-gray-400">
                  Cargando comprobantes recientes...
                </div>
              ) : ultimasVentas.length === 0 ? (
                <div className="py-6 text-center text-xs text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                  No hay ventas registradas recientemente para este kiosco
                </div>
              ) : (
                <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
                  {ultimasVentas.map((v) => {
                    const ticketCod = v.afip_nro_comprobante
                      ? `Factura N° ${v.afip_nro_comprobante}`
                      : `T-${v.id.slice(0, 8).toUpperCase()}`
                    const medio =
                      v.pagos && v.pagos[0] ? labelMedioPago(v.pagos[0].medio_pago) : 'Efectivo'
                    const itemsResumen = (v.detalles || [])
                      .map((d) => `${d.cantidad}x ${d.producto?.descripcion || 'Artículo'}`)
                      .slice(0, 3)
                      .join(', ')
                    const masItems =
                      (v.detalles || []).length > 3 ? ` y ${(v.detalles || []).length - 3} más` : ''

                    return (
                      <div
                        key={v.id}
                        className="p-2.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600 bg-white dark:bg-gray-800/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md">
                              {ticketCod}
                            </span>
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                              {formatFecha(v.fecha_hora)}
                            </span>
                            <span className="text-[10px] uppercase font-bold text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/60 px-1.5 py-0.5 rounded">
                              {medio}
                            </span>
                            {v.cliente && (
                              <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                                · {v.cliente.nombre}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-300 truncate mt-1">
                            {itemsResumen}
                            {masItems}
                          </p>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2 flex-shrink-0">
                          <span className="font-mono font-bold text-sm text-gray-900 dark:text-gray-100">
                            {formatPrecio(v.total)}
                          </span>
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setTicketParaVer(ventaToTicketData(v, kiosco))}
                              className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors"
                              title="Ver e imprimir ticket"
                            >
                              Ver
                            </button>
                            <button
                              type="button"
                              onClick={() => seleccionarVenta(v)}
                              className="px-3 py-1 text-xs font-bold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs"
                            >
                              Devolver
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Cabecera del ticket cargado */}
            <div className="p-3 bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-gray-100 font-mono">
                  Ticket #{venta.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Fecha: {formatFecha(venta.fecha_hora)} · Total Original: {formatPrecio(venta.total)}
                </p>
                {venta.cliente && (
                  <p className="text-[11px] text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">
                    Cliente: {venta.cliente.nombre}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setTicketParaVer(ventaToTicketData(venta, kiosco))}
                  className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer font-semibold"
                >
                  Ver Comprobante
                </button>
                <span className="text-gray-300 dark:text-gray-600">·</span>
                <button
                  type="button"
                  onClick={reiniciar}
                  className="text-xs text-gray-500 hover:text-indigo-600 underline cursor-pointer"
                >
                  Buscar otro ticket
                </button>
              </div>
            </div>

            {/* Lista de productos facturados para seleccionar qué devolver */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
                Seleccioná los artículos a restituir y su cantidad:
              </label>

              <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold">
                    <tr>
                      <th className="px-3 py-2 text-center w-10">Sel.</th>
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-2 py-2 text-center w-24">Cant. Dev.</th>
                      <th className="px-2 py-2 text-right">P. Unit.</th>
                      <th className="px-2 py-2 text-right">Subtotal</th>
                      <th className="px-2 py-2 text-center w-28">¿Vuelve a Stock?</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {items.map((it) => (
                      <tr
                        key={it.productoId}
                        className={`transition-colors ${
                          it.seleccionado ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : 'opacity-60'
                        }`}
                      >
                        <td className="px-3 py-2 text-center">
                          <input
                            type="checkbox"
                            checked={it.seleccionado}
                            onChange={() => toggleSeleccionItem(it.productoId)}
                            className="w-4 h-4 rounded text-indigo-600 border-gray-300"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <p className="font-semibold text-gray-900 dark:text-gray-100">
                            {it.descripcion}
                          </p>
                          <p className="text-[10px] text-gray-400">
                            Original en ticket: {it.cantidadOriginal} un.
                          </p>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="number"
                            min="0.001"
                            max={it.cantidadOriginal}
                            step={it.cantidadOriginal % 1 !== 0 ? '0.05' : '1'}
                            disabled={!it.seleccionado}
                            value={it.cantidadDevolver}
                            onChange={(e) =>
                              actualizarCantidadDevolver(it.productoId, parseFloat(e.target.value) || 1)
                            }
                            className="w-16 text-center text-xs py-1 px-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-bold outline-none"
                          />
                        </td>
                        <td className="px-2 py-2 text-right font-mono text-gray-600 dark:text-gray-300">
                          {formatPrecio(it.precioUnitario)}
                        </td>
                        <td className="px-2 py-2 text-right font-mono font-bold text-gray-900 dark:text-gray-100">
                          {formatPrecio(Math.round(it.cantidadDevolver * it.precioUnitario))}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <label className="inline-flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              disabled={!it.seleccionado}
                              checked={it.reingresaStock}
                              onChange={() => toggleReingresaStock(it.productoId)}
                              className="w-3.5 h-3.5 rounded text-emerald-600"
                            />
                            <span className="text-[10px] font-medium text-gray-600 dark:text-gray-400">
                              {it.reingresaStock ? 'Sí (Apto)' : 'No (Merma)'}
                            </span>
                          </label>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Opciones de reintegro y motivo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Método de Reintegro:
                </label>
                <select
                  value={metodoReintegro}
                  onChange={(e) => setMetodoReintegro(e.target.value as MetodoReintegro)}
                  className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none font-semibold"
                >
                  <option value="EFECTIVO_CAJA">Efectivo (Egreso de Caja actual)</option>
                  <option value="CUENTA_CORRIENTE" disabled={!venta.cliente}>
                    Crédito en Cuenta Corriente {venta.cliente ? `(${venta.cliente.nombre})` : '(Sin cliente)'}
                  </option>
                  <option value="OTRO">Otro / Cambio Directo</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Motivo de Devolución:
                </label>
                <select
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value as MotivoDevolucion)}
                  className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none font-semibold"
                >
                  <option value="CAMBIO_PRODUCTO">Cambio de producto</option>
                  <option value="FALLA_ROTURA">Mercadería fallada o rota</option>
                  <option value="VENCIDO">Producto vencido</option>
                  <option value="ERROR_COBRO">Error de tipeo o cobro</option>
                  <option value="OTRO">Otro motivo</option>
                </select>
              </div>
            </div>

            {/* Notas opcionales */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Observaciones / Notas (opcional):
              </label>
              <input
                type="text"
                value={notas}
                onChange={(e) => setNotas(e.target.value)}
                placeholder="Ej: Cliente trajo ticket, producto sin abrir..."
                className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none"
              />
            </div>

            {/* Resumen Total */}
            <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800/60 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-red-900 dark:text-red-300 block">
                  Total a Reintegrar:
                </span>
                <span className="text-[11px] text-red-700 dark:text-red-400">
                  {itemsSeleccionados.length} artículo(s) seleccionado(s)
                </span>
              </div>
              <span className="text-xl font-black text-red-700 dark:text-red-400 font-mono">
                {formatPrecio(totalReintegro)}
              </span>
            </div>

            {/* Acciones */}
            <div className="flex gap-2 pt-2">
              <Button
                type="button"
                fullWidth
                variant="danger"
                loading={guardando}
                disabled={totalReintegro <= 0}
                onClick={handleConfirmarDevolucion}
              >
                Confirmar Devolución ({formatPrecio(totalReintegro)})
              </Button>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                onClick={() => {
                  reiniciar()
                  onClose()
                }}
              >
                Cancelar
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>

    {/* Visualizador / reimpresor de comprobante */}
    <TicketReceiptModal
      isOpen={Boolean(ticketParaVer)}
      onClose={() => setTicketParaVer(null)}
      ticket={ticketParaVer}
    />
    </>
  )
}
