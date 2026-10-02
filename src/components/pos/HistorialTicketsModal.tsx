import { useState, useEffect, useMemo, useCallback } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { SearchInput } from '../ui/SearchInput'
import { formatPrecio, formatFecha, labelMedioPago } from '../../lib/utils'
import { useDevolucionStore, type VentaConDetalles, limpiarCodigoTicket } from '../../stores/devolucionStore'
import { useAuthStore } from '../../stores/authStore'
import { TicketReceiptModal, type TicketData } from './TicketReceiptModal'
import { ventaToTicketData } from '../../lib/ticketUtils'
import { useAFIPStore, validarCUIT } from '../../stores/afipStore'
import type { TipoDocumentoAFIP } from '../../types/afip'
import toast from 'react-hot-toast'

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
  const { emitirFacturaVenta, config: afipConfig, cargarConfiguracion } = useAFIPStore()

  const [ventas, setVentas] = useState<VentaConDetalles[]>([])
  const [cargando, setCargando] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroMedio, setFiltroMedio] = useState<string>('TODOS')
  const [ticketSeleccionado, setTicketSeleccionado] = useState<TicketData | null>(null)

  // Estados para Facturación AFIP Diferida
  const [ventaParaFacturar, setVentaParaFacturar] = useState<VentaConDetalles | null>(null)
  const [tipoDocReceptor, setTipoDocReceptor] = useState<TipoDocumentoAFIP>(99)
  const [nroDocReceptor, setNroDocReceptor] = useState<string>('')
  const [nombreClienteReceptor, setNombreClienteReceptor] = useState<string>('')
  const [emitiendoAFIP, setEmitiendoAFIP] = useState<boolean>(false)

  useEffect(() => {
    if (isOpen) {
      cargarConfiguracion()
    }
  }, [isOpen, cargarConfiguracion])

  const abrirModalFacturar = (v: VentaConDetalles) => {
    if (!afipConfig?.habilitado) {
      toast.error('La facturación electrónica ARCA no está habilitada en la Configuración.', { id: 'arca-deshabilitada' })
      return
    }
    const cant = v.detalles?.length || 0
    if (cant === 0) {
      toast.error('No se puede facturar ante ARCA un comprobante sin artículos registrados')
      return
    }
    if (v.total <= 0) {
      toast.error('El total del comprobante debe ser mayor a 0 para emitir factura fiscal')
      return
    }
    setVentaParaFacturar(v)
    setNombreClienteReceptor(v.cliente?.nombre || '')
    if (v.cliente?.dni_cuit) {
      const raw = v.cliente.dni_cuit.replace(/\D/g, '')
      if (raw.length === 11) {
        setTipoDocReceptor(80)
        setNroDocReceptor(raw)
      } else if (raw.length >= 7 && raw.length <= 8) {
        setTipoDocReceptor(96)
        setNroDocReceptor(raw)
      } else {
        setTipoDocReceptor(99)
        setNroDocReceptor('')
      }
    } else {
      setTipoDocReceptor(99)
      setNroDocReceptor('')
    }
  }

  const handleEmitirFacturaDiferida = async () => {
    if (!ventaParaFacturar) return
    if (!afipConfig?.habilitado) {
      toast.error('La facturación electrónica ARCA no está habilitada en la Configuración.', { id: 'arca-deshabilitada' })
      return
    }
    if (tipoDocReceptor === 96) {
      const dniLimpio = nroDocReceptor.replace(/\D/g, '')
      if (!dniLimpio || dniLimpio.length < 7 || dniLimpio.length > 8) {
        toast.error('Por favor ingresá un número de DNI válido (7 u 8 dígitos)')
        return
      }
    } else if (tipoDocReceptor === 80) {
      const cuitLimpio = nroDocReceptor.replace(/\D/g, '')
      if (!cuitLimpio || !validarCUIT(cuitLimpio)) {
        toast.error('Por favor ingresá un CUIT válido de 11 dígitos verificados')
        return
      }
    }

    setEmitiendoAFIP(true)
    try {
      const res = await emitirFacturaVenta({
        ventaId: ventaParaFacturar.id,
        total: ventaParaFacturar.total,
        tipoDocCliente: tipoDocReceptor,
        nroDocCliente: tipoDocReceptor !== 99 && nroDocReceptor ? nroDocReceptor.trim() : '0',
        nombreCliente: nombreClienteReceptor || ventaParaFacturar.cliente?.nombre || undefined,
      })

      if (res) {
        toast.success(`Factura ARCA emitida correctamente — CAE: ${res.cae}`)
        const ventaActualizada: VentaConDetalles = {
          ...ventaParaFacturar,
          afip_cae: res.cae,
          afip_nro_comprobante: res.nro_comprobante,
          afip_tipo_comprobante: res.tipo_comprobante,
          afip_vto_cae: res.vto_cae,
          afip_qr_url: res.qr_url,
        }
        setVentas((prev) => prev.map((item) => (item.id === ventaParaFacturar.id ? ventaActualizada : item)))
        setVentaParaFacturar(null)
        setTicketSeleccionado(ventaToTicketData(ventaActualizada, kiosco))
      } else {
        toast.error('No se pudo emitir la factura electrónica. Verificá la configuración de ARCA.')
      }
    } catch (err: any) {
      toast.error(`Error emitiendo factura ARCA: ${err?.message || 'Error desconocido'}`)
    } finally {
      setEmitiendoAFIP(false)
    }
  }

  const cargarVentas = useCallback(async () => {
    setCargando(true)
    const kid = usuario?.kiosco_id || kiosco?.id || undefined
    const data = await obtenerUltimasVentas(kid, 50)
    setVentas(data)
    setCargando(false)
  }, [usuario?.kiosco_id, kiosco?.id, obtenerUltimasVentas])

  useEffect(() => {
    if (isOpen) {
      cargarVentas()
      setBusqueda('')
      setFiltroMedio('TODOS')
    }
  }, [isOpen, cargarVentas])

  const ventasFiltradas = useMemo(() => {
    // Descartar transacciones abortadas o zombi (sin ningún artículo y sin ningún pago)
    let list = ventas.filter((v) => {
      const tieneItems = Boolean(v.detalles && v.detalles.length > 0)
      const tienePagos = Boolean(v.pagos && v.pagos.length > 0)
      return tieneItems || tienePagos
    })
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
            <button
              type="button"
              onClick={cargarVentas}
              disabled={cargando}
              title="Recargar listado de comprobantes desde la base de datos"
              className="inline-flex items-center justify-center p-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all cursor-pointer shadow-2xs shrink-0"
            >
              <svg
                className={`w-4 h-4 ${cargando ? 'animate-spin text-indigo-600' : ''}`}
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
              </svg>
            </button>
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
                        : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800/90 hover:border-indigo-400 dark:hover:border-indigo-500 shadow-xs'
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

                        {v.afip_cae && (
                          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800/60 px-2 py-0.5 rounded-md">
                            ARCA CAE: {v.afip_cae}
                          </span>
                        )}

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
                        {/* Botón Facturar ARCA si no fue facturada aún y no está anulada */}
                        {!esAnulada && !v.afip_cae && (
                          <button
                            type="button"
                            disabled={!afipConfig?.habilitado || cantArticulos === 0}
                            onClick={() => abrirModalFacturar(v)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all flex items-center gap-1.5 shadow-2xs ${
                              !afipConfig?.habilitado || cantArticulos === 0
                                ? 'bg-gray-100 dark:bg-gray-800/60 text-gray-400 dark:text-gray-500 border border-gray-200 dark:border-gray-700/60 cursor-not-allowed opacity-60'
                                : 'bg-blue-50 dark:bg-blue-950/40 hover:bg-blue-100 dark:hover:bg-blue-900/60 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800 cursor-pointer'
                            }`}
                            title={
                              !afipConfig?.habilitado
                                ? 'Facturación electrónica ARCA deshabilitada en Configuración'
                                : cantArticulos === 0
                                ? 'No se puede facturar un comprobante sin artículos registrados'
                                : 'Emitir comprobante fiscal ARCA diferido con CAE'
                            }
                          >
                            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                              <line x1="16" y1="13" x2="8" y2="13"></line>
                              <line x1="16" y1="17" x2="8" y2="17"></line>
                              <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                            <span>Facturar ARCA</span>
                          </button>
                        )}

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

      {/* Modal de Facturación AFIP Diferida */}
      {ventaParaFacturar && (
        <Modal
          isOpen={Boolean(ventaParaFacturar)}
          onClose={() => !emitiendoAFIP && setVentaParaFacturar(null)}
          title="Facturación Electrónica ARCA Diferida"
          size="md"
        >
          <div className="space-y-4">
            <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl border border-blue-200 dark:border-blue-800/60 space-y-1">
              <div className="flex justify-between text-xs text-blue-900 dark:text-blue-200 font-semibold">
                <span>Ticket #{ventaParaFacturar.id.slice(0, 8).toUpperCase()}</span>
                <span>{formatFecha(ventaParaFacturar.fecha_hora)}</span>
              </div>
              <div className="flex justify-between items-baseline pt-1">
                <span className="text-xs text-gray-600 dark:text-gray-300">Total a facturar:</span>
                <span className="text-xl font-black text-blue-950 dark:text-white">
                  {formatPrecio(ventaParaFacturar.total)}
                </span>
              </div>
            </div>

            {/* Identificación del Receptor */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Tipo de Comprobante / Receptor
              </label>
              <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                <button
                  type="button"
                  onClick={() => {
                    setTipoDocReceptor(99)
                    setNroDocReceptor('')
                  }}
                  className={`py-1.5 px-2 rounded-md font-medium text-xs transition-all text-center cursor-pointer ${
                    tipoDocReceptor === 99
                      ? 'bg-blue-600 text-white shadow-xs font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700'
                  }`}
                >
                  Consumidor Final
                </button>
                <button
                  type="button"
                  onClick={() => setTipoDocReceptor(96)}
                  className={`py-1.5 px-2 rounded-md font-medium text-xs transition-all text-center cursor-pointer ${
                    tipoDocReceptor === 96
                      ? 'bg-blue-600 text-white shadow-xs font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700'
                  }`}
                >
                  DNI
                </button>
                <button
                  type="button"
                  onClick={() => setTipoDocReceptor(80)}
                  className={`py-1.5 px-2 rounded-md font-medium text-xs transition-all text-center cursor-pointer ${
                    tipoDocReceptor === 80
                      ? 'bg-blue-600 text-white shadow-xs font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700'
                  }`}
                >
                  CUIT
                </button>
              </div>
            </div>

            {tipoDocReceptor !== 99 && (
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Número de {tipoDocReceptor === 96 ? 'DNI (7 u 8 dígitos)' : 'CUIT (11 dígitos)'} *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  value={nroDocReceptor}
                  onChange={(e) => setNroDocReceptor(e.target.value.replace(/[^\d-]/g, ''))}
                  placeholder={tipoDocReceptor === 96 ? 'Ej: 35123456' : 'Ej: 20351234568'}
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Nombre o Razón Social del Cliente (opcional)
              </label>
              <input
                type="text"
                value={nombreClienteReceptor}
                onChange={(e) => setNombreClienteReceptor(e.target.value)}
                placeholder="Nombre o razón social"
                className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs focus:ring-2 focus:ring-blue-500 outline-none transition-all placeholder:text-gray-400"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => setVentaParaFacturar(null)}
                disabled={emitiendoAFIP}
              >
                Cancelar
              </Button>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleEmitirFacturaDiferida}
                loading={emitiendoAFIP}
              >
                Emitir Factura ARCA con CAE
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Visor de comprobante para impresión térmica y WhatsApp */}
      <TicketReceiptModal
        isOpen={Boolean(ticketSeleccionado)}
        onClose={() => setTicketSeleccionado(null)}
        ticket={ticketSeleccionado}
      />
    </>
  )
}
