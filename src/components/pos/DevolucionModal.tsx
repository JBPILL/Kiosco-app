import { useState, useEffect, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatPrecio, formatFecha, labelMedioPago } from '../../lib/utils'
import { useDevolucionStore, type VentaConDetalles } from '../../stores/devolucionStore'
import { useAuthStore } from '../../stores/authStore'
import { useCajaStore } from '../../stores/cajaStore'
import { TicketReceiptModal, type TicketData } from './TicketReceiptModal'
import { ventaToTicketData } from '../../lib/ticketUtils'
import type { MetodoReintegro, MotivoDevolucion } from '../../types/database'
import { useBarcodeGun } from '../../hooks/useBarcodeGun'
import { playScanSound } from '../../lib/sound'
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
  esPesable?: boolean
  unidadMedida?: string
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

  const seleccionarVenta = useCallback((ventaEncontrada: VentaConDetalles) => {
    if (ventaEncontrada.estado === 'ANULADA') {
      toast.error('Esta venta se encuentra ANULADA y no puede ser devuelta.')
      return
    }

    setVenta(ventaEncontrada)
    setItems(
      (ventaEncontrada.detalles || [])
        .filter((d) => (d.precio_unitario || 0) > 0) // Excluir devoluciones de envases o créditos virtuales
        .map((d) => {
          const esPesable = Boolean(d.producto?.es_pesable)
          const cantReal = esPesable
            ? Number(Number(d.cantidad || 0).toFixed(3))
            : Math.max(1, Math.floor(d.cantidad))
          return {
            productoId: d.producto_id,
            descripcion: d.producto?.descripcion || 'Artículo',
            cantidadOriginal: cantReal,
            cantidadDevolver: cantReal,
            precioUnitario: d.precio_unitario,
            reingresaStock: true,
            seleccionado: true,
            esPesable,
            unidadMedida: d.producto?.unidad_medida || 'UN',
          }
        })
    )

    const fueCC = ventaEncontrada.pagos?.some((p) => p.medio_pago === 'CUENTA_CORRIENTE')
    const tieneEfectivo = ventaEncontrada.pagos?.some((p) => p.medio_pago === 'EFECTIVO')
    if (fueCC && ventaEncontrada.cliente) {
      setMetodoReintegro('CUENTA_CORRIENTE')
    } else if (tieneEfectivo || !ventaEncontrada.pagos || ventaEncontrada.pagos.length === 0) {
      setMetodoReintegro('EFECTIVO_CAJA')
    } else {
      setMetodoReintegro('OTRO')
    }
  }, [])

  const reiniciar = () => {
    setVenta(null)
    setItems([])
    setCriterioBusqueda('')
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
  }, [isOpen, ventaInicial, usuario?.kiosco_id, kiosco?.id, seleccionarVenta, obtenerUltimasVentas])

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

  // Escaneo con pistola lectora directo en el modal de devoluciones
  useBarcodeGun({
    onScan: async (code) => {
      const limpio = code.trim()
      if (!limpio) return
      playScanSound()
      setCriterioBusqueda(limpio)
      setBuscando(true)
      const ventaEncontrada = await buscarVentaParaDevolucion(
        limpio,
        usuario?.kiosco_id || kiosco?.id || undefined
      )
      setBuscando(false)
      if (ventaEncontrada) {
        playScanSound('success')
        seleccionarVenta(ventaEncontrada)
        toast.success(`Ticket #${ventaEncontrada.id.slice(0, 8).toUpperCase()} cargado`)
      } else {
        playScanSound('error')
        toast.error(`No se encontró ninguna venta con el código ${limpio}`)
      }
    },
    enabled: isOpen && !guardando && !ticketParaVer,
  })

  // Alternar selección de un producto
  const toggleSeleccionItem = (prodId: string) => {
    setItems((prev) =>
      prev.map((it) => (it.productoId === prodId ? { ...it, seleccionado: !it.seleccionado } : it))
    )
  }

  // Marcar o desmarcar todos los ítems
  const marcarTodos = (marcar: boolean) => {
    setItems((prev) => prev.map((it) => ({ ...it, seleccionado: marcar })))
  }

  // Modificar cantidad a devolver (números flotantes para pesables, enteros para unitarios)
  const actualizarCantidadDevolver = (prodId: string, cantidad: number) => {
    setItems((prev) =>
      prev.map((it) => {
        if (it.productoId === prodId) {
          if (it.esPesable) {
            const num = Number(Number(cantidad).toFixed(3))
            const val = isNaN(num) || num <= 0 ? 0.001 : Math.min(num, it.cantidadOriginal)
            return { ...it, cantidadDevolver: Number(val.toFixed(3)) }
          }
          const maxVal = Math.max(1, Math.floor(it.cantidadOriginal))
          const entero = Math.floor(Number(cantidad))
          const val = isNaN(entero) || entero < 1 ? 1 : Math.min(entero, maxVal)
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

  // Establecer estado de stock para un ítem
  const setReingresaStock = (prodId: string, valor: boolean) => {
    setItems((prev) =>
      prev.map((it) =>
        it.productoId === prodId ? { ...it, reingresaStock: valor } : it
      )
    )
  }

  // Cálculo del monto total a reintegrar
  const itemsSeleccionados = items.filter((i) => i.seleccionado)
  const totalReintegro = itemsSeleccionados.reduce(
    (acc, it) => acc + Math.round(it.cantidadDevolver * it.precioUnitario),
    0
  )
  const stockVuelveCount = itemsSeleccionados.filter((i) => i.reingresaStock).length
  const stockMermaCount = itemsSeleccionados.filter((i) => !i.reingresaStock).length

  const handleConfirmarDevolucion = async () => {
    if (!venta || guardando) return
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

  const esPagoDigitalPuro = Boolean(
    venta &&
    venta.pagos &&
    venta.pagos.length > 0 &&
    venta.pagos.every((p) => p.medio_pago === 'MERCADOPAGO' || p.medio_pago === 'TRANSFERENCIA' || p.medio_pago === 'TARJETA') &&
    !venta.pagos.some((p) => p.medio_pago === 'EFECTIVO' || p.medio_pago === 'CUENTA_CORRIENTE')
  )

  // Pie fijo del modal cuando hay venta cargada
  const modalFooter = venta ? (
    <div className="w-full space-y-2.5">
      <div className="p-2.5 sm:p-3 bg-red-50/90 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl flex items-center justify-between shadow-2xs">
        <div className="min-w-0 pr-2">
          <span className="text-xs font-bold text-red-900 dark:text-red-300 block">
            Total a Reintegrar:
          </span>
          <span className="text-[11px] text-red-700 dark:text-red-400">
            {itemsSeleccionados.length} producto(s) marcado(s)
            {stockVuelveCount > 0 ? ` · ${stockVuelveCount} vuelven a stock` : ''}
            {stockMermaCount > 0 ? ` · ${stockMermaCount} a merma/baja` : ''}
          </span>
        </div>
        <span className="text-xl sm:text-2xl font-black text-red-700 dark:text-red-400 font-mono flex-shrink-0">
          {formatPrecio(totalReintegro)}
        </span>
      </div>

      <div className="flex gap-2">
        <Button
          type="button"
          fullWidth
          variant="danger"
          loading={guardando}
          disabled={totalReintegro <= 0 || itemsSeleccionados.length === 0}
          onClick={handleConfirmarDevolucion}
          className="font-bold shadow-xs py-2.5 sm:py-3 text-xs sm:text-sm"
        >
          Confirmar Devolución ({formatPrecio(totalReintegro)})
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={() => {
            reiniciar()
            onClose()
          }}
          className="py-2.5 sm:py-3 text-xs sm:text-sm px-4"
        >
          Cancelar
        </Button>
      </div>
    </div>
  ) : undefined

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={() => {
          reiniciar()
          onClose()
        }}
        title="Devolución y Reintegro de Venta"
        size="2xl"
        footer={modalFooter}
      >
        <div className="flex flex-col flex-1 min-h-0">
          {/* ==================================================== */}
          {/* PANTALLA 1: BÚSQUEDA DEL TICKET O COMPROBANTE ORIGINAL */}
          {/* ==================================================== */}
          {!venta ? (
            <div className="space-y-4">
              {/* Caja instructiva de búsqueda */}
              <div className="p-3 sm:p-4 rounded-xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-lg">🔍</span>
                  <h3 className="text-xs sm:text-sm font-bold text-indigo-950 dark:text-indigo-200">
                    Búsqueda de Ticket o Factura
                  </h3>
                </div>
                <p className="text-xs text-gray-600 dark:text-gray-300">
                  Podés escanear el código del ticket directamente con la pistola lectora o escribir el número del comprobante (ej: <span className="font-mono font-bold">BACFC93B</span>, <span className="font-mono font-bold">T-BACFC93B</span> o el ID).
                </p>

                <form onSubmit={handleBuscar} className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={criterioBusqueda}
                    onChange={(e) => setCriterioBusqueda(e.target.value)}
                    placeholder="Número de ticket o código..."
                    className="flex-1 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none focus:border-indigo-500 font-mono font-semibold"
                    autoFocus
                  />
                  <Button type="submit" loading={buscando} className="text-xs sm:text-sm whitespace-nowrap">
                    Buscar Ticket
                  </Button>
                </form>
              </div>

              {/* Listado de comprobantes recientes para selección en 1 clic */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                    <span>⏱️</span>
                    <span>Últimos comprobantes emitidos:</span>
                  </label>
                  <span className="text-[11px] text-gray-400">
                    Seleccioná para iniciar la devolución
                  </span>
                </div>

                {cargandoRecientes ? (
                  <div className="py-12 text-center text-xs text-gray-400">
                    Cargando comprobantes recientes...
                  </div>
                ) : ultimasVentas.length === 0 ? (
                  <div className="py-8 text-center text-xs text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                    No hay ventas registradas recientemente para este kiosco
                  </div>
                ) : (
                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
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
                          className="p-3 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-600 bg-white dark:bg-gray-800/80 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shadow-2xs hover:shadow-xs"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono font-bold text-xs text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md">
                                {ticketCod}
                              </span>
                              <span className="text-[11px] text-gray-500 dark:text-gray-400">
                                {formatFecha(v.fecha_hora)}
                              </span>
                              <span className="text-[10px] uppercase font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/60 px-1.5 py-0.5 rounded">
                                {medio}
                              </span>
                              {v.estado === 'ANULADA' && (
                                <span className="text-[10px] uppercase font-bold text-red-700 dark:text-red-300 bg-red-100 dark:bg-red-950/60 px-1.5 py-0.5 rounded border border-red-200 dark:border-red-800">
                                  Anulada
                                </span>
                              )}
                              {v.cliente && (
                                <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                  👤 {v.cliente.nombre}
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-600 dark:text-gray-300 truncate mt-1">
                              {itemsResumen}
                              {masItems}
                            </p>
                          </div>

                          <div className="flex items-center justify-between sm:justify-end gap-2.5 flex-shrink-0 pt-1 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-700/50">
                            <span className="font-mono font-bold text-sm text-gray-900 dark:text-gray-100">
                              {formatPrecio(v.total)}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => setTicketParaVer(ventaToTicketData(v, kiosco))}
                                className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 transition-colors cursor-pointer"
                                title="Ver comprobante"
                              >
                                Ver
                              </button>
                              <button
                                type="button"
                                onClick={() => seleccionarVenta(v)}
                                disabled={v.estado === 'ANULADA'}
                                className={`px-3 py-1 text-xs font-bold rounded-lg transition-all shadow-xs ${
                                  v.estado === 'ANULADA'
                                    ? 'bg-gray-200 dark:bg-gray-700 text-gray-400 dark:text-gray-500 cursor-not-allowed'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-95'
                                }`}
                                title={v.estado === 'ANULADA' ? 'Esta venta fue anulada' : 'Seleccionar para devolver'}
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
            /* ==================================================== */
            /* PANTALLA 2: DEVOLUCIÓN DE LA VENTA SELECCIONADA      */
            /* ==================================================== */
            <div className="space-y-4">
              {/* Cabecera del ticket cargado con botón para cambiar */}
              <div className="p-3 bg-slate-50 dark:bg-gray-900/60 border border-slate-200 dark:border-gray-700 rounded-xl flex items-center justify-between flex-wrap gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-xs bg-indigo-100 text-indigo-800 dark:bg-indigo-950/70 dark:text-indigo-300 px-2 py-0.5 rounded-md">
                      Ticket #{venta.id.slice(0, 8).toUpperCase()}
                    </span>
                    <span className="text-[11px] text-gray-500 dark:text-gray-400">
                      {formatFecha(venta.fecha_hora)}
                    </span>
                    <span className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-400">
                      Total: {formatPrecio(venta.total)}
                    </span>
                    {venta.cliente && (
                      <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">
                        👤 {venta.cliente.nombre}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTicketParaVer(ventaToTicketData(venta, kiosco))}
                    className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                  >
                    Ver comprobante
                  </button>
                  <span className="text-gray-300 dark:text-gray-600">·</span>
                  <button
                    type="button"
                    onClick={reiniciar}
                    className="text-xs text-gray-500 hover:text-indigo-600 underline cursor-pointer"
                  >
                    Buscar otro
                  </button>
                </div>
              </div>

              {/* Alerta didáctica si el cobro original fue digital */}
              {esPagoDigitalPuro && (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/60 rounded-xl text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5">
                  <span className="text-base flex-shrink-0 mt-0.5">⚠️</span>
                  <div>
                    <strong className="block font-semibold">
                      Cobro originalmente digital ({venta.pagos?.map((p) => labelMedioPago(p.medio_pago)).join(', ') || 'Medio digital'})
                    </strong>
                    <p className="text-[11px] text-amber-800 dark:text-amber-300 mt-0.5">
                      Si vas a retirar dinero físico de la caja, tené en cuenta que egresará efectivo de la sesión actual. También podés optar por "Cambio Directo" o saldo en Cuenta Corriente.
                    </p>
                  </div>
                </div>
              )}

              {/* ---------------------------------------------------- */}
              {/* PASO 1: SELECCIÓN DE ARTÍCULOS A DEVOLVER            */}
              {/* ---------------------------------------------------- */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                      1
                    </span>
                    <label className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200">
                      ¿Qué artículos devuelve el cliente? ({itemsSeleccionados.length} de {items.length} marcados)
                    </label>
                  </div>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => marcarTodos(true)}
                      className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold cursor-pointer"
                    >
                      Marcar todos
                    </button>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <button
                      type="button"
                      onClick={() => marcarTodos(false)}
                      className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 underline cursor-pointer"
                    >
                      Desmarcar
                    </button>
                  </div>
                </div>

                {/* VISTA MÓVIL: Tarjetas táctiles individuales (evita deformación de columnas en celular) */}
                <div className="block sm:hidden space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {items.map((it) => (
                    <div
                      key={it.productoId}
                      className={`p-3 rounded-xl border transition-all ${
                        it.seleccionado
                          ? 'border-indigo-400 dark:border-indigo-600 bg-indigo-50/20 dark:bg-indigo-950/20 shadow-2xs ring-1 ring-indigo-400/20'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 opacity-60'
                      }`}
                    >
                      {/* Fila superior: Checkbox + Título y datos de compra */}
                      <div className="flex items-start gap-2.5">
                        <input
                          type="checkbox"
                          checked={it.seleccionado}
                          onChange={() => toggleSeleccionItem(it.productoId)}
                          className="w-5 h-5 rounded text-indigo-600 border-gray-300 dark:border-gray-600 mt-0.5 cursor-pointer flex-shrink-0"
                        />
                        <div
                          className="flex-1 min-w-0 cursor-pointer"
                          onClick={() => toggleSeleccionItem(it.productoId)}
                        >
                          <h5 className="text-xs font-bold text-gray-900 dark:text-gray-100 leading-snug">
                            {it.descripcion}
                          </h5>
                          <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                            Original: <strong className="text-gray-700 dark:text-gray-300">{it.cantidadOriginal} {it.esPesable ? (it.unidadMedida || 'KG') : 'un.'}</strong> · {formatPrecio(it.precioUnitario)} c/u
                          </p>
                        </div>
                      </div>

                      {/* Configuración del ítem cuando está tildado */}
                      {it.seleccionado && (
                        <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/60 space-y-2.5">
                          {/* Stepper y subtotal */}
                          <div className="flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-300">
                              Cantidad a devolver:
                            </span>
                            <div className="flex items-center gap-1.5">
                              <div className="inline-flex items-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-2xs">
                                <button
                                  type="button"
                                  disabled={it.esPesable ? it.cantidadDevolver <= 0.01 : it.cantidadDevolver <= 1}
                                  onClick={() => {
                                    const paso = it.esPesable ? 0.1 : 1
                                    actualizarCantidadDevolver(it.productoId, Number((it.cantidadDevolver - paso).toFixed(3)))
                                  }}
                                  className="w-8 h-8 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-base transition-colors"
                                >
                                  -
                                </button>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={it.cantidadDevolver}
                                  onKeyDown={(e) => {
                                    if (it.esPesable) {
                                      if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault()
                                    } else {
                                      if (['-', '+', '.', ',', 'e', 'E'].includes(e.key)) e.preventDefault()
                                    }
                                  }}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(it.esPesable ? /[^0-9.,]/g : /[^0-9]/g, '')
                                    if (raw === '' || raw === '.' || raw === ',') {
                                      actualizarCantidadDevolver(it.productoId, it.esPesable ? 0.01 : 1)
                                      return
                                    }
                                    const parsed = it.esPesable ? parseFloat(raw.replace(',', '.')) : parseInt(raw, 10)
                                    actualizarCantidadDevolver(it.productoId, isNaN(parsed) ? (it.esPesable ? 0.01 : 1) : parsed)
                                  }}
                                  className={`${it.esPesable ? 'w-16' : 'w-10'} text-center text-xs py-1 px-0.5 bg-transparent text-gray-900 dark:text-gray-100 font-bold outline-none`}
                                />
                                <button
                                  type="button"
                                  disabled={it.cantidadDevolver >= it.cantidadOriginal}
                                  onClick={() => {
                                    const paso = it.esPesable ? 0.1 : 1
                                    actualizarCantidadDevolver(it.productoId, Number((it.cantidadDevolver + paso).toFixed(3)))
                                  }}
                                  className="w-8 h-8 flex items-center justify-center text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-base transition-colors"
                                >
                                  +
                                </button>
                              </div>
                              <span className="text-xs font-mono font-bold text-indigo-700 dark:text-indigo-300 ml-1">
                                = {formatPrecio(Math.round(it.cantidadDevolver * it.precioUnitario))}
                              </span>
                            </div>
                          </div>

                          {/* Toggle didáctico de Stock en móvil */}
                          <div className="flex items-center justify-between pt-1">
                            <span className="text-[11px] text-gray-500 dark:text-gray-400">
                              Destino del artículo:
                            </span>
                            <button
                              type="button"
                              onClick={() => toggleReingresaStock(it.productoId)}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs ${
                                it.reingresaStock
                                  ? 'bg-emerald-50 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800'
                                  : 'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                              }`}
                            >
                              {it.reingresaStock ? (
                                <span>Vuelve a Stock (Apto)</span>
                              ) : (
                                <span>Descartar / Merma (Roto)</span>
                              )}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* VISTA ESCRITORIO: Tabla espaciosa y didáctica */}
                <div className="hidden sm:block border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden shadow-2xs">
                  <div className="max-h-[220px] overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-semibold sticky top-0 z-10">
                        <tr>
                          <th className="px-3 py-2 text-center w-10">Sel.</th>
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-2 py-2 text-center w-28">Cant. Dev.</th>
                          <th className="px-2 py-2 text-right w-24">P. Unit.</th>
                          <th className="px-2 py-2 text-right w-24">Subtotal</th>
                          <th className="px-3 py-2 text-center w-44">Destino en Stock</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {items.map((it) => (
                          <tr
                            key={it.productoId}
                            className={`transition-colors ${
                              it.seleccionado ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : 'opacity-50'
                            }`}
                          >
                            <td className="px-3 py-2.5 text-center">
                              <input
                                type="checkbox"
                                checked={it.seleccionado}
                                onChange={() => toggleSeleccionItem(it.productoId)}
                                className="w-4 h-4 rounded text-indigo-600 border-gray-300 cursor-pointer"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <p className="font-semibold text-gray-900 dark:text-gray-100">
                                {it.descripcion}
                              </p>
                              <p className="text-[10px] text-gray-400">
                                Original: {it.cantidadOriginal} {it.esPesable ? (it.unidadMedida || 'KG') : 'un.'}
                              </p>
                            </td>
                            <td className="px-2 py-2.5 text-center whitespace-nowrap">
                              <div className="inline-flex items-center justify-center border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden bg-white dark:bg-gray-800 shadow-2xs">
                                <button
                                  type="button"
                                  disabled={!it.seleccionado || (it.esPesable ? it.cantidadDevolver <= 0.01 : it.cantidadDevolver <= 1)}
                                  onClick={() => {
                                    const paso = it.esPesable ? 0.1 : 1
                                    actualizarCantidadDevolver(it.productoId, Number((it.cantidadDevolver - paso).toFixed(3)))
                                  }}
                                  className="px-2 py-1 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-xs transition-colors"
                                  title={it.esPesable ? 'Restar 0.1 kg' : 'Restar 1 unidad'}
                                >
                                  -
                                </button>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  disabled={!it.seleccionado}
                                  value={it.cantidadDevolver}
                                  onKeyDown={(e) => {
                                    if (it.esPesable) {
                                      if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault()
                                    } else {
                                      if (['-', '+', '.', ',', 'e', 'E'].includes(e.key)) e.preventDefault()
                                    }
                                  }}
                                  onChange={(e) => {
                                    const raw = e.target.value.replace(it.esPesable ? /[^0-9.,]/g : /[^0-9]/g, '')
                                    if (raw === '' || raw === '.' || raw === ',') {
                                      actualizarCantidadDevolver(it.productoId, it.esPesable ? 0.01 : 1)
                                      return
                                    }
                                    const parsed = it.esPesable
                                      ? parseFloat(raw.replace(',', '.'))
                                      : parseInt(raw, 10)
                                    actualizarCantidadDevolver(it.productoId, isNaN(parsed) ? (it.esPesable ? 0.01 : 1) : parsed)
                                  }}
                                  className={`${it.esPesable ? 'w-14' : 'w-9'} text-center text-xs py-1 px-0.5 bg-transparent text-gray-900 dark:text-gray-100 font-bold outline-none`}
                                />
                                <button
                                  type="button"
                                  disabled={!it.seleccionado || it.cantidadDevolver >= it.cantidadOriginal}
                                  onClick={() => {
                                    const paso = it.esPesable ? 0.1 : 1
                                    actualizarCantidadDevolver(it.productoId, Number((it.cantidadDevolver + paso).toFixed(3)))
                                  }}
                                  className="px-2 py-1 text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed font-bold text-xs transition-colors"
                                  title={it.esPesable ? 'Sumar 0.1 kg' : 'Sumar 1 unidad'}
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono text-gray-600 dark:text-gray-300 whitespace-nowrap">
                              {formatPrecio(it.precioUnitario)}
                            </td>
                            <td className="px-2 py-2.5 text-right font-mono font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                              {formatPrecio(Math.round(it.cantidadDevolver * it.precioUnitario))}
                            </td>
                            <td className="px-3 py-2.5 text-center whitespace-nowrap">
                              <div className="inline-flex rounded-lg p-0.5 bg-gray-100 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-[10px]">
                                <button
                                  type="button"
                                  disabled={!it.seleccionado}
                                  onClick={() => setReingresaStock(it.productoId, true)}
                                  className={`px-2 py-1 rounded-md font-bold transition-all cursor-pointer ${
                                    it.reingresaStock
                                      ? 'bg-emerald-600 text-white shadow-2xs'
                                      : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                                  }`}
                                  title="El producto vuelve a ingresar al inventario para su venta"
                                >
                                  Apto (Stock)
                                </button>
                                <button
                                  type="button"
                                  disabled={!it.seleccionado}
                                  onClick={() => setReingresaStock(it.productoId, false)}
                                  className={`px-2 py-1 rounded-md font-bold transition-all cursor-pointer ${
                                    !it.reingresaStock
                                      ? 'bg-amber-600 text-white shadow-2xs'
                                      : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                                  }`}
                                  title="El producto NO reingresa a stock (se registra como merma/rotura)"
                                >
                                  Merma / Baja
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* ---------------------------------------------------- */}
              {/* PASO 2: MÉTODO DE REINTEGRO & DESTINO DEL DINERO     */}
              {/* ---------------------------------------------------- */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                    2
                  </span>
                  <label className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200">
                    ¿Cómo se compensa o devuelve el dinero?
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {/* Opción 1: Efectivo en Caja */}
                  <div
                    onClick={() => setMetodoReintegro('EFECTIVO_CAJA')}
                    className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      metodoReintegro === 'EFECTIVO_CAJA'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h5 className="text-xs font-bold text-gray-900 dark:text-gray-100">
                          Efectivo de Caja
                        </h5>
                        {metodoReintegro === 'EFECTIVO_CAJA' && (
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full">
                            Seleccionado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                        Egresa dinero de la caja física y se computa en el arqueo del turno actual.
                      </p>
                    </div>
                    {!sesionActiva && (
                      <span className="text-[10px] text-amber-600 font-bold mt-2">
                        Sin turno de caja abierto
                      </span>
                    )}
                  </div>

                  {/* Opción 2: Cuenta Corriente (Saldo a Favor) */}
                  <div
                    onClick={() => {
                      if (venta.cliente) setMetodoReintegro('CUENTA_CORRIENTE')
                    }}
                    className={`p-3 rounded-xl border-2 transition-all flex flex-col justify-between ${
                      !venta.cliente
                        ? 'opacity-40 cursor-not-allowed bg-gray-50 dark:bg-gray-900 border-dashed border-gray-200 dark:border-gray-700'
                        : metodoReintegro === 'CUENTA_CORRIENTE'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs cursor-pointer'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 hover:border-gray-300 cursor-pointer'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h5 className="text-xs font-bold text-gray-900 dark:text-gray-100">
                          Cuenta Corriente
                        </h5>
                        {metodoReintegro === 'CUENTA_CORRIENTE' && (
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full">
                            Seleccionado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                        {venta.cliente
                          ? `Acredita saldo a favor de ${venta.cliente.nombre} o amortiza deuda.`
                          : 'No disponible (esta venta no se asoció a ningún cliente).'}
                      </p>
                    </div>
                    {venta.cliente && (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold mt-2 truncate">
                        Cliente: {venta.cliente.nombre}
                      </span>
                    )}
                  </div>

                  {/* Opción 3: Cambio Directo */}
                  <div
                    onClick={() => setMetodoReintegro('OTRO')}
                    className={`p-3 rounded-xl border-2 transition-all cursor-pointer flex flex-col justify-between ${
                      metodoReintegro === 'OTRO'
                        ? 'border-indigo-600 bg-indigo-50/70 dark:bg-indigo-950/40 shadow-xs'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 hover:border-gray-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <h5 className="text-xs font-bold text-gray-900 dark:text-gray-100">
                          Cambio Directo
                        </h5>
                        {metodoReintegro === 'OTRO' && (
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/60 px-2 py-0.5 rounded-full">
                            Seleccionado
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-snug">
                        Sin movimiento de dinero. El cliente se lleva otra mercadería por el mismo valor.
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* ---------------------------------------------------- */}
              {/* PASO 3: MOTIVO DE LA DEVOLUCIÓN & AUDITORÍA          */}
              {/* ---------------------------------------------------- */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <span className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold">
                    3
                  </span>
                  <label className="text-xs sm:text-sm font-bold text-gray-800 dark:text-gray-200">
                    Motivo y Registro
                  </label>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Causa principal:
                    </label>
                    <select
                      value={motivo}
                      onChange={(e) => setMotivo(e.target.value as MotivoDevolucion)}
                      className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none font-semibold focus:border-indigo-500"
                    >
                      <option value="CAMBIO_PRODUCTO">Cambio de producto (gusto / modelo)</option>
                      <option value="FALLA_ROTURA">Mercadería fallada, rota o defectuosa</option>
                      <option value="VENCIDO">Producto vencido / fuera de término</option>
                      <option value="ERROR_COBRO">Error de cobro o tipeo en caja</option>
                      <option value="OTRO">Otro motivo / especial</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                      Observaciones / Notas (opcional):
                    </label>
                    <input
                      type="text"
                      value={notas}
                      onChange={(e) => setNotas(e.target.value)}
                      placeholder="Ej: Cliente trajo envoltorio cerrado, comprobante ok..."
                      className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none focus:border-indigo-500"
                    />
                  </div>
                </div>
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
