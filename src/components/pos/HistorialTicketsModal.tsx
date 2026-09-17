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

const MEDIOS_FILTRO = [
  { valor: 'TODOS', label: 'Todos' },
  { valor: 'EFECTIVO', label: 'Efectivo' },
  { valor: 'MERCADOPAGO', label: 'Mercado Pago' },
  { valor: 'TRANSFERENCIA', label: 'Transferencia' },
  { valor: 'TARJETA', label: 'Tarjeta' },
  { valor: 'CUENTA_CORRIENTE', label: 'Cta. Cte.' },
] as const

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
        <div className="space-y-4">
          {/* Fila 1: Buscador amplio + Botón Actualizar destacado */}
          <div className="flex items-center gap-2.5">
            <div className="flex-1">
              <SearchInput
                placeholder="Buscar por N° ticket (ej: BACFC93B), cliente o artículo..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onClear={() => setBusqueda('')}
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={cargarVentas}
              loading={cargando}
              title="Recargar listado de comprobantes desde la base de datos"
              className="text-xs px-4 whitespace-nowrap flex items-center gap-2 font-semibold shadow-xs"
            >
              <svg
                className={`w-3.5 h-3.5 ${cargando ? 'animate-spin' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
              </svg>
              <span>Actualizar</span>
            </Button>
          </div>

          {/* Fila 2: Filtros de medio de pago y contador de comprobantes */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5 pb-1 border-b border-gray-100 dark:border-gray-800">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider mr-1">
                Pago:
              </span>
              {MEDIOS_FILTRO.map((m) => (
                <button
                  key={m.valor}
                  type="button"
                  onClick={() => setFiltroMedio(m.valor)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                    filtroMedio === m.valor
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {m.label}
                </button>
              ))}
            </div>

            <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
              {ventasFiltradas.length} {ventasFiltradas.length === 1 ? 'comprobante' : 'comprobantes'}
            </span>
          </div>

          {/* Listado de comprobantes con tarjetas refinadas */}
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
                  ? 'Intentá limpiar la búsqueda o seleccionar otro medio de pago.'
                  : 'Aún no se han registrado ventas en esta sucursal.'}
              </p>
            </div>
          ) : (
            <div className="space-y-3 max-h-[58vh] overflow-y-auto pr-1">
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
                  .join(' · ')

                return (
                  <div
                    key={v.id}
                    className={`p-3.5 rounded-xl border transition-all space-y-2.5 ${
                      esAnulada
                        ? 'border-red-200 dark:border-red-900/40 bg-red-50/20 dark:bg-red-950/15 opacity-75'
                        : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/90 hover:border-indigo-400 dark:hover:border-indigo-500 shadow-2xs'
                    }`}
                  >
                    {/* Encabezado de la tarjeta: Ticket, Fecha, Medio de pago y Total */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className={`font-mono font-bold text-xs px-2.5 py-1 rounded-md ${
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

                        <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800/60 px-2 py-0.5 rounded-md">
                          {mediosStr}
                        </span>

                        {esAnulada && (
                          <span className="text-[10px] font-bold text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/50 px-2 py-0.5 rounded-md uppercase tracking-wider">
                            Anulada
                          </span>
                        )}

                        {v.usuario?.nombre && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            · {v.usuario.nombre}
                          </span>
                        )}
                      </div>

                      <div className="text-left sm:text-right">
                        <span
                          className={`font-mono font-black text-lg ${
                            esAnulada
                              ? 'text-gray-400 dark:text-gray-500 line-through'
                              : 'text-gray-900 dark:text-gray-100'
                          }`}
                        >
                          {formatPrecio(v.total)}
                        </span>
                      </div>
                    </div>

                    {/* Detalle de productos vendidos */}
                    <div className="p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-800 text-xs">
                      <div className="flex items-baseline gap-2">
                        <span className="font-bold text-gray-700 dark:text-gray-300 flex-shrink-0">
                          {cantArticulos} {cantArticulos === 1 ? 'artículo' : 'artículos'}:
                        </span>
                        <p className="text-gray-600 dark:text-gray-300 line-clamp-2">
                          {itemsResumen || 'Sin detalle de productos'}
                        </p>
                      </div>
                      {v.cliente && (
                        <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 mt-1">
                          Cliente vinculado: {v.cliente.nombre} {v.cliente.telefono ? `(${v.cliente.telefono})` : ''}
                        </p>
                      )}
                    </div>

                    {/* Botones de acción inferiores */}
                    <div className="flex items-center justify-between pt-1 border-t border-gray-100 dark:border-gray-800">
                      <div className="text-[11px] text-gray-400">
                        {v.notas ? <span className="italic">Nota: {v.notas}</span> : <span>Venta en mostrador</span>}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setTicketSeleccionado(ventaToTicketData(v, kiosco))}
                          className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 6 2 18 2 18 9"/>
                            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                            <rect x="6" y="14" width="12" height="8"/>
                          </svg>
                          <span>Ver / Reimprimir</span>
                        </button>

                        {!esAnulada && onIniciarDevolucion && (
                          <button
                            type="button"
                            onClick={() => {
                              onClose()
                              onIniciarDevolucion(v)
                            }}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-red-300 dark:border-red-800/80 bg-red-50/60 hover:bg-red-100 dark:bg-red-950/30 text-red-700 dark:text-red-300 transition-all cursor-pointer"
                            title="Iniciar devolución o cambio para este comprobante"
                          >
                            Hacer Devolución
                          </button>
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
