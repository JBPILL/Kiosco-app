import { useState, useEffect, useMemo } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { SearchInput } from '../ui/SearchInput'
import { formatPrecio, formatFecha, labelMedioPago } from '../../lib/utils'
import { useDevolucionStore, type VentaConDetalles, limpiarCodigoTicket } from '../../stores/devolucionStore'
import { useAuthStore } from '../../stores/authStore'
import { TicketReceiptModal, type TicketData } from './TicketReceiptModal'
import { ventaToTicketData } from '../../lib/ticketUtils'

interface HistorialTicketsModalProps {
  isOpen: boolean
  onClose: () => void
  onIniciarDevolucion?: (venta: VentaConDetalles) => void
}

export function HistorialTicketsModal({
  isOpen,
  onClose,
  onIniciarDevolucion,
}: HistorialTicketsModalProps) {
  const { usuario, kiosco } = useAuthStore()
  const { obtenerUltimasVentas } = useDevolucionStore()

  const [ventas, setVentas] = useState<VentaConDetalles[]>([])
  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroMedio, setFiltroMedio] = useState<string>('TODOS')
  const [ticketSeleccionado, setTicketSeleccionado] = useState<TicketData | null>(null)

  const cargarVentas = async () => {
    setCargando(true)
    const kid = usuario?.kiosco_id || kiosco?.id || undefined
    const data = await obtenerUltimasVentas(kid, 50)
    setVentas(data)
    setCargando(false)
  }

  useEffect(() => {
    if (isOpen) {
      cargarVentas()
      setBusqueda('')
      setFiltroMedio('TODOS')
    }
  }, [isOpen, usuario?.kiosco_id, kiosco?.id])

  const ventasFiltradas = useMemo(() => {
    let list = ventas
    const qLimpio = limpiarCodigoTicket(busqueda)
    const qTexto = busqueda.trim().toLowerCase()

    if (qTexto) {
      list = list.filter((v) => {
        const vId = v.id.toLowerCase()
        const ticketShort = v.id.slice(0, 8).toLowerCase()
        const afipNro = v.afip_nro_comprobante ? String(v.afip_nro_comprobante) : ''
        const cajero = v.usuario?.nombre?.toLowerCase() || ''
        const cliente = v.cliente?.nombre?.toLowerCase() || ''
        const notas = v.notas?.toLowerCase() || ''

        // Coincidencia por código de ticket limpio
        if (qLimpio && (ticketShort.startsWith(qLimpio) || vId.startsWith(qLimpio) || afipNro === qLimpio)) {
          return true
        }

        // Coincidencia general de texto (cajero, cliente, notas, productos)
        if (cajero.includes(qTexto) || cliente.includes(qTexto) || notas.includes(qTexto)) {
          return true
        }

        const matchProducto = (v.detalles || []).some((d) =>
          d.producto?.descripcion?.toLowerCase().includes(qTexto)
        )
        return matchProducto
      })
    }

    if (filtroMedio !== 'TODOS') {
      list = list.filter((v) =>
        v.pagos?.some((p) => p.medio_pago === filtroMedio)
      )
    }

    return list
  }, [ventas, busqueda, filtroMedio])

  return (
    <>
      <Modal isOpen={isOpen} onClose={onClose} title="Historial de Comprobantes y Tickets" size="xl">
        <div className="space-y-3.5">
          {/* Barra de búsqueda y filtros */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="flex-1 max-w-sm">
              <SearchInput
                placeholder="Buscar por N° ticket, cliente, producto..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onClear={() => setBusqueda('')}
              />
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
              {(
                [
                  { valor: 'TODOS', label: 'Todos' },
                  { valor: 'EFECTIVO', label: 'Efectivo' },
                  { valor: 'MERCADOPAGO', label: 'Mercado Pago' },
                  { valor: 'TRANSFERENCIA', label: 'Transferencia' },
                  { valor: 'TARJETA', label: 'Tarjeta' },
                  { valor: 'CUENTA_CORRIENTE', label: 'Cta. Cte.' },
                ] as const
              ).map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  onClick={() => setFiltroMedio(m.valor)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    filtroMedio === m.valor
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}

              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={cargarVentas}
                loading={cargando}
                title="Refrescar lista de comprobantes"
                className="text-xs px-2.5 ml-1"
              >
                Actualizar
              </Button>
            </div>
          </div>

          {/* Listado de comprobantes */}
          {cargando ? (
            <div className="py-16 text-center text-gray-400">
              <div className="animate-spin h-6 w-6 border-2 border-indigo-600 border-t-transparent rounded-full mx-auto mb-2" />
              <p className="text-xs">Cargando comprobantes...</p>
            </div>
          ) : ventasFiltradas.length === 0 ? (
            <div className="py-14 text-center text-gray-400 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-700 space-y-1">
              <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
                No se encontraron comprobantes
              </p>
              <p className="text-xs text-gray-400">
                {busqueda || filtroMedio !== 'TODOS'
                  ? 'Intentá limpiar la búsqueda o cambiar el filtro de pago.'
                  : 'Aún no se han registrado ventas en esta sucursal.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[58vh] overflow-y-auto pr-1">
              {ventasFiltradas.map((v) => {
                const esAnulada = v.estado === 'ANULADA'
                const ticketCod = v.afip_nro_comprobante
                  ? `Factura N° ${v.afip_nro_comprobante}`
                  : `T-${v.id.slice(0, 8).toUpperCase()}`

                const mediosStr =
                  v.pagos && v.pagos.length > 0
                    ? v.pagos.map((p) => labelMedioPago(p.medio_pago)).join(', ')
                    : 'Efectivo'

                const cantArticulos = (v.detalles || []).reduce((sum, d) => sum + d.cantidad, 0)
                const itemsResumen = (v.detalles || [])
                  .map((d) => `${d.cantidad}x ${d.producto?.descripcion || 'Artículo'}`)
                  .slice(0, 3)
                  .join(', ')
                const masItems =
                  (v.detalles || []).length > 3 ? ` y ${(v.detalles || []).length - 3} más` : ''

                return (
                  <div
                    key={v.id}
                    className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      esAnulada
                        ? 'border-red-200 dark:border-red-900/40 bg-red-50/30 dark:bg-red-950/15 opacity-80'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/90 hover:border-indigo-400 dark:hover:border-indigo-500 shadow-2xs'
                    }`}
                  >
                    {/* Información del comprobante */}
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md ${
                            esAnulada
                              ? 'bg-red-100 dark:bg-red-900/40 text-red-800 dark:text-red-300 line-through'
                              : 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                          }`}
                        >
                          {ticketCod}
                        </span>

                        <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">
                          {formatFecha(v.fecha_hora)}
                        </span>

                        <span className="text-[10px] uppercase font-bold text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-gray-700/60 px-2 py-0.5 rounded">
                          {mediosStr}
                        </span>

                        {esAnulada && (
                          <span className="text-[10px] font-bold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/50 px-1.5 py-0.5 rounded">
                            Anulada
                          </span>
                        )}

                        {v.cliente && (
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            Cliente: {v.cliente.nombre}
                          </span>
                        )}

                        {v.usuario?.nombre && (
                          <span className="text-[11px] text-gray-400">
                            Cajero: {v.usuario.nombre}
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-gray-600 dark:text-gray-300 truncate">
                        <span className="font-semibold text-gray-700 dark:text-gray-200">
                          {cantArticulos} {cantArticulos === 1 ? 'artículo' : 'artículos'}:
                        </span>{' '}
                        {itemsResumen}
                        {masItems}
                      </p>
                    </div>

                    {/* Importe y Acciones */}
                    <div className="flex items-center justify-between sm:justify-end gap-3 flex-shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-gray-700">
                      <div className="text-right">
                        <span
                          className={`font-mono font-bold text-base block ${
                            esAnulada
                              ? 'text-gray-400 dark:text-gray-500 line-through'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          {formatPrecio(v.total)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setTicketSeleccionado(ventaToTicketData(v, kiosco))}
                          className="text-xs px-3 py-1.5 font-semibold"
                        >
                          Ver Ticket
                        </Button>

                        {!esAnulada && onIniciarDevolucion && (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => {
                              onClose()
                              onIniciarDevolucion(v)
                            }}
                            className="text-xs px-2.5 py-1.5 font-semibold"
                            title="Hacer devolución o cambio de productos de esta venta"
                          >
                            Devolver
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pie informativo */}
          <div className="pt-2 border-t border-gray-100 dark:border-gray-800 flex items-center justify-between text-xs text-gray-400">
            <span>Mostrando hasta 50 comprobantes recientes</span>
            <Button type="button" variant="secondary" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Visor de comprobante para impresión térmica y WhatsApp */}
      <TicketReceiptModal
        isOpen={Boolean(ticketSeleccionado)}
        onClose={() => setTicketSeleccionado(null)}
        ticket={ticketSeleccionado}
      />
    </>
  )
}
