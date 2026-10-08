import { useState, useEffect, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { prepararContenedoresImpresion } from '../../lib/ticketPrintAncestors'
import { formatPrecio, formatFecha, formatNumero, formatearPromoTicket } from '../../lib/utils'
import { generarImagenQRAFIP } from '../../lib/afipQR'
import { imprimirTicketEscPosDirecto, isWebSerialSupported } from '../../lib/escposPrinter'
import { exportarTicketVentaPDF, compartirTicketVentaWhatsApp } from '../../lib/pdfVentaUtils'
import { getAnchoTicketGuardado, guardarAnchoTicket, type AnchoPapelTicket } from '../../lib/ticketPreferences'
import { BarcodeSvg } from '../../lib/barcodeSvg'
import { IconExportar } from '../ui/Icons'
import toast from 'react-hot-toast'

export interface TicketItem {
  descripcion: string
  cantidad: number
  precioUnitario: number
  subtotal: number
  descuentoPromo?: number
  promoNombre?: string
}

export interface TicketData {
  ventaId: string
  fecha: string
  items: TicketItem[]
  subtotal: number
  ajuste?: {
    descripcion: string
    monto: number
    esDescuento: boolean
  } | null
  total: number
  medioPago: string
  pagos?: { medioPago: string; monto: number }[]
  pagaCon?: number
  vuelto?: number
  kioscoNombre?: string
  kioscoDireccion?: string | null
  kioscoTelefono?: string | null
  cajeroNombre?: string | null
  clienteNombre?: string | null
  clienteTelefono?: string | null
  notas?: string | null
  // Datos fiscales AFIP (si el comprobante fue emitido electrónicamente)
  afip?: {
    cae: string
    vtoCae: string
    tipoComprobante: number
    letra: 'C' | 'B' | 'A'
    puntoVenta: number
    nroComprobante: number
    cuitEmisor?: string
    iibb?: string | null
    condicionIva?: string
    inicioActividades?: string | null
    qrUrl?: string
    tipoDocCliente?: number
    nroDocCliente?: string
    tipoComprobanteNombre?: string
  } | null
}

interface TicketReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  ticket: TicketData | null
}



export function TicketReceiptModal({ isOpen, onClose, ticket }: TicketReceiptModalProps) {
  const [anchoPapel, setAnchoPapel] = useState<AnchoPapelTicket>(getAnchoTicketGuardado)
  const [telefonoWhatsApp, setTelefonoWhatsApp] = useState('')
  const [mostrarInputTelefono, setMostrarInputTelefono] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [imprimiendoSerial, setImprimiendoSerial] = useState(false)
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const inputTelefonoRef = useRef<HTMLInputElement>(null)
  const ticketScrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isOpen) {
      setMostrarInputTelefono(false)
      setTelefonoWhatsApp('')
      setEnviandoWhatsApp(false)
    } else {
      setTelefonoWhatsApp(ticket?.clienteTelefono || '')
      setMostrarInputTelefono(false)
      setEnviandoWhatsApp(false)
      if (ticketScrollRef.current) {
        ticketScrollRef.current.scrollTop = 0
      }
    }
  }, [isOpen, ticket?.ventaId, ticket?.clienteTelefono])

  const cambiarAnchoPapel = (ancho: AnchoPapelTicket) => {
    setAnchoPapel(ancho)
    guardarAnchoTicket(ancho)
  }

  // Sincronizar en tiempo real con cambios de formato realizados en otros modales (ej. Cierre de Caja)
  useEffect(() => {
    if (isOpen) {
      const saved = getAnchoTicketGuardado()
      if (saved !== anchoPapel) {
        setAnchoPapel(saved)
      }
    }
  }, [isOpen])

  useEffect(() => {
    const handleCambio = (e: Event) => {
      const nuevo = (e as CustomEvent<AnchoPapelTicket>).detail
      if (nuevo === '58mm' || nuevo === '80mm') {
        setAnchoPapel(nuevo)
      }
    }
    window.addEventListener('kioskopos_ancho_ticket_change', handleCambio)
    return () => window.removeEventListener('kioskopos_ancho_ticket_change', handleCambio)
  }, [])

  useEffect(() => {
    if (ticket?.afip?.qrUrl) {
      generarImagenQRAFIP(ticket.afip.qrUrl, 160).then(setQrDataUrl)
    } else {
      setQrDataUrl('')
    }
  }, [ticket?.afip?.qrUrl])

  useEffect(() => {
    if (!isOpen || !ticket) return
    let limpiar: (() => void) | undefined
    const antes = () => {
      limpiar?.()
      const elemento = document.getElementById('printable-ticket')
      if (elemento) limpiar = prepararContenedoresImpresion(elemento)
    }
    const despues = () => { limpiar?.(); limpiar = undefined }
    window.addEventListener('beforeprint', antes)
    window.addEventListener('afterprint', despues)
    return () => {
      window.removeEventListener('beforeprint', antes)
      window.removeEventListener('afterprint', despues)
      despues()
    }
  }, [isOpen, ticket])

  if (!ticket) return null

  const handleImprimir = () => {
    window.print()
  }

  const handleImprimirEscPos = async () => {
    if (!ticket) return
    setImprimiendoSerial(true)
    try {
      const res = await imprimirTicketEscPosDirecto(ticket, anchoPapel)
      if (res.ok) {
        toast.success(res.mensaje)
      } else {
        toast.error(res.mensaje)
      }
    } catch (e: unknown) {
      toast.error('Error al imprimir por puerto serie: ' + ((e as Error).message || ''))
    } finally {
      setImprimiendoSerial(false)
    }
  }

  const handleExportarPDF = async () => {
    if (!ticket) return
    setGenerandoPdf(true)
    try {
      const ok = await exportarTicketVentaPDF(ticket, anchoPapel)
      if (ok) {
        toast.success(`Ticket PDF (${anchoPapel}) descargado`)
      } else {
        toast.error('No se pudo generar el comprobante PDF')
      }
    } catch (e: any) {
      toast.error('Error al generar PDF: ' + (e?.message || 'Error'))
    } finally {
      setGenerandoPdf(false)
    }
  }

  const handleBotonWhatsApp = () => {
    if (!mostrarInputTelefono) {
      setMostrarInputTelefono(true)
      setTimeout(() => {
        inputTelefonoRef.current?.focus()
        inputTelefonoRef.current?.select()
      }, 60)
      return
    }
    handleCompartirWhatsApp()
  }

  const handleCompartirWhatsApp = async () => {
    if (!ticket) return
    const tel = telefonoWhatsApp.trim()
    if (!tel) {
      toast.error('Por favor ingresá el número de celular del cliente')
      setMostrarInputTelefono(true)
      setTimeout(() => {
        inputTelefonoRef.current?.focus()
      }, 60)
      return
    }
    setEnviandoWhatsApp(true)
    try {
      await compartirTicketVentaWhatsApp(ticket, tel, anchoPapel)
      setMostrarInputTelefono(false)
    } catch (e: any) {
      toast.error('Error al enviar ticket por WhatsApp: ' + (e?.message || 'Error'))
    } finally {
      setEnviandoWhatsApp(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Comprobante de Venta"
      size="lg"
      footer={
        <div className="w-full space-y-2.5">
          {/* Panel para ingresar / confirmar teléfono de WhatsApp */}
          {mostrarInputTelefono && (
            <div className="p-3 bg-emerald-50/95 dark:bg-emerald-950/50 border border-emerald-300 dark:border-emerald-800 rounded-xl space-y-2 animate-in fade-in-50 duration-150 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                  <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                  </svg>
                  <span>Enviar comprobante PDF por WhatsApp</span>
                </div>
                <button
                  type="button"
                  onClick={() => setMostrarInputTelefono(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-xs px-1.5 py-0.5 rounded-md transition-colors cursor-pointer"
                  title="Cerrar panel"
                >
                  ✕
                </button>
              </div>
              <div className="flex gap-2">
                <input
                  ref={inputTelefonoRef}
                  type="tel"
                  placeholder="Ej: 11 2345 6789"
                  value={telefonoWhatsApp}
                  onChange={(e) => setTelefonoWhatsApp(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCompartirWhatsApp()
                    if (e.key === 'Escape') setMostrarInputTelefono(false)
                  }}
                  className="flex-1 px-3 py-2 text-xs sm:text-sm rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all shadow-2xs"
                />
                <button
                  type="button"
                  onClick={handleCompartirWhatsApp}
                  disabled={enviandoWhatsApp}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs disabled:opacity-50 cursor-pointer shrink-0"
                >
                  <span>{enviandoWhatsApp ? 'Enviando...' : 'Enviar PDF'}</span>
                </button>
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Ingresá el número celular del cliente con código de área (ej: 11...).
              </p>
            </div>
          )}

          {/* Fila 1: Métodos de Entrega Principales (Imprimir Ticket + WhatsApp PDF) */}
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleImprimir}
              className="h-10 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
              title="Abrir ventana de impresión del sistema"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              <span>Imprimir Ticket</span>
            </button>

            <button
              type="button"
              onClick={handleBotonWhatsApp}
              disabled={enviandoWhatsApp}
              className={`h-10 px-3 py-2 text-white rounded-xl text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-xs active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap ${
                mostrarInputTelefono
                  ? 'bg-emerald-700 ring-2 ring-emerald-400 dark:ring-emerald-500'
                  : 'bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800'
              }`}
              title="Enviar ticket de venta en formato PDF por WhatsApp"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
              </svg>
              <span>{enviandoWhatsApp ? 'Enviando...' : 'WhatsApp (PDF)'}</span>
            </button>
          </div>

          {/* Fila 2: Descarga, Hardware y Cierre */}
          <div className={isWebSerialSupported() ? "grid grid-cols-3 gap-2" : "grid grid-cols-2 gap-2"}>
            <button
              type="button"
              onClick={handleExportarPDF}
              disabled={generandoPdf}
              className="h-9 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 dark:bg-gray-700/80 dark:hover:bg-gray-700 dark:active:bg-gray-600 text-gray-700 dark:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
              title="Descargar comprobante en formato PDF"
            >
              <IconExportar />
              <span>{generandoPdf ? 'Generando...' : 'Descargar PDF'}</span>
            </button>

            {isWebSerialSupported() && (
              <button
                type="button"
                onClick={handleImprimirEscPos}
                disabled={imprimiendoSerial}
                className="h-9 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 active:bg-amber-200 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 dark:active:bg-amber-900/70 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700/80 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98] transition-all cursor-pointer disabled:opacity-50 whitespace-nowrap"
                title="Impresión térmica directa por cable USB/COM sin ventana de diálogo"
              >
                <svg className="w-3.5 h-3.5 shrink-0 text-amber-600 dark:text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                </svg>
                <span>{imprimiendoSerial ? 'Imprimiendo...' : 'Ticket USB'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 active:bg-gray-300 dark:bg-gray-700/80 dark:hover:bg-gray-700 dark:active:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 shadow-2xs active:scale-[0.98] transition-all cursor-pointer whitespace-nowrap"
              title="Cerrar ventana de comprobante"
            >
              <span>Cerrar</span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Barra superior de controles del comprobante */}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs bg-gray-50 dark:bg-gray-800/80 rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <span className="font-bold text-gray-900 dark:text-gray-100">
              {ticket.afip ? `Factura ${ticket.afip.letra}` : 'Ticket'} #{ticket.ventaId.slice(0, 8).toUpperCase()}
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300">
              {formatPrecio(ticket.total)}
            </span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto">
            <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">Ancho:</span>
            <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-200/70 dark:bg-gray-800">
              <button
                type="button"
                onClick={() => cambiarAnchoPapel('58mm')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  anchoPapel === '58mm'
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                58 mm
              </button>
              <button
                type="button"
                onClick={() => cambiarAnchoPapel('80mm')}
                className={`px-2.5 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                  anchoPapel === '80mm'
                    ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
                }`}
              >
                80 mm
              </button>
            </div>
          </div>
        </div>

        {/* Vista previa del ticket estilo papel térmico con scroll nativo y ancho responsivo */}
        <div className="relative w-full rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-100/90 dark:bg-gray-900/80 p-2 sm:p-4 overflow-hidden">
          <div
            ref={ticketScrollRef}
            className="w-full overflow-y-auto max-h-[min(62vh,540px)] scrollbar-thin px-0.5 py-1"
          >
            <div
              id="printable-ticket"
              className={`mx-auto bg-white text-gray-950 p-4 sm:p-5 pb-6 rounded-xl shadow-md border border-gray-300 font-mono text-xs leading-tight transition-all select-text block box-border ${
                anchoPapel === '58mm' ? 'w-full max-w-[280px]' : 'w-full max-w-[360px]'
              }`}
            >
              {/* Encabezado */}
              {ticket.afip ? (
                <div className="text-center space-y-1 pb-2 border-b border-dashed border-gray-400">
                  {/* Cuadro de letra comprobante tipo C/B/A */}
                  <div className="flex justify-center items-center gap-2">
                    <div className="border-2 border-black px-2 py-0.5 font-bold text-base leading-none">
                      {ticket.afip.letra}
                    </div>
                    <div className="text-left text-[9px] leading-tight">
                      <p className="font-bold">
                        {(ticket.afip.tipoComprobanteNombre || `Factura ${ticket.afip.letra}`).toUpperCase()}
                      </p>
                      <p>COD. {String(ticket.afip.tipoComprobante).padStart(3, '0')}</p>
                    </div>
                  </div>

                  <p className="font-bold text-sm tracking-wide uppercase pt-1 text-gray-950">
                    {ticket.kioscoNombre || 'AlPaso POS'}
                  </p>
                  {ticket.kioscoDireccion && (
                    <p className="text-[10px] text-gray-600">{ticket.kioscoDireccion}</p>
                  )}
                  {ticket.kioscoTelefono && (
                    <p className="text-[10px] text-gray-600">Tel: {ticket.kioscoTelefono}</p>
                  )}

                  <div className="text-[10px] text-gray-700 pt-1 space-y-0.5 text-left border-t border-dotted border-gray-300">
                    <div className="flex justify-between">
                      <span>P.V.: {String(ticket.afip.puntoVenta).padStart(4, '0')}</span>
                      <span className="font-bold">N°: {String(ticket.afip.nroComprobante).padStart(8, '0')}</span>
                    </div>
                    <p>Fecha: {formatFecha(ticket.fecha)}</p>
                    {ticket.afip.cuitEmisor && <p>CUIT: {ticket.afip.cuitEmisor}</p>}
                    {ticket.afip.condicionIva && <p>Cond. IVA: {ticket.afip.condicionIva}</p>}
                    {ticket.afip.iibb && <p>Ing. Brutos: {ticket.afip.iibb}</p>}
                    {ticket.afip.inicioActividades && <p>Ini. Act.: {ticket.afip.inicioActividades}</p>}
                  </div>

                  {/* Datos Receptor */}
                  <div className="text-[10px] text-gray-700 pt-1 border-t border-dotted border-gray-300 text-left">
                    <p className="font-semibold text-gray-800">A CONSUMIDOR FINAL</p>
                    {ticket.afip.nroDocCliente && ticket.afip.nroDocCliente !== '0' && (
                      <p>
                        Doc: {ticket.afip.tipoDocCliente === 80 ? 'CUIT' : ticket.afip.tipoDocCliente === 96 ? 'DNI' : 'Doc'}: {ticket.afip.nroDocCliente}
                      </p>
                    )}
                    {ticket.clienteNombre && <p>Nombre: {ticket.clienteNombre}</p>}
                  </div>
                </div>
              ) : (
                <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-gray-400">
                  <p className="font-bold text-sm tracking-wide uppercase text-gray-950">
                    {ticket.kioscoNombre || 'AlPaso POS'}
                  </p>
                  {ticket.kioscoDireccion && (
                    <p className="text-[11px] text-gray-600">{ticket.kioscoDireccion}</p>
                  )}
                  {ticket.kioscoTelefono && (
                    <p className="text-[11px] text-gray-600">Tel: {ticket.kioscoTelefono}</p>
                  )}
                  <div className="pt-1 text-[10px] text-gray-600">
                    <p className="font-bold">Ticket #{ticket.ventaId.slice(0, 8).toUpperCase()}</p>
                    <p>{formatFecha(ticket.fecha)}</p>
                    {ticket.cajeroNombre && <p>Cajero: {ticket.cajeroNombre}</p>}
                  </div>
                </div>
              )}

              {/* Detalle de productos con ajuste de texto sin cortes y columna de montos alineada */}
              <div className="py-2 border-b border-dashed border-gray-400 space-y-2 font-mono text-gray-950">
                <div className="flex justify-between font-bold text-[10px] uppercase text-gray-500 pb-0.5 border-b border-dotted border-gray-200">
                  <span>Descripción / cant. × precio</span>
                  <span className="shrink-0 text-right">Importe</span>
                </div>
                {ticket.items.map((it, idx) => (
                  <div key={idx} className="space-y-0.5 text-[11px]">
                    <div className="break-words uppercase leading-tight">{it.descripcion}</div>
                    <div className="flex justify-between items-baseline gap-2 tabular-nums leading-tight">
                      <span className="text-[10px]">
                        {formatNumero(it.cantidad)} × $ {formatNumero(it.precioUnitario)}
                      </span>
                      <span className="shrink-0 font-bold whitespace-nowrap">
                        {it.subtotal < 0 ? '-$' : '$'} {formatNumero(Math.abs(it.subtotal))}
                      </span>
                    </div>
                    {it.promoNombre && (
                      <div className="text-[9px] text-gray-700 uppercase leading-tight">
                        Promo: {formatearPromoTicket(it.promoNombre)}
                      </div>
                    )}
                  </div>
                ))}
              </div>

              {/* Totales y Ajustes con posición fija de $ */}
              <div className="py-2 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
                {ticket.ajuste && (
                  <>
                    <div className="flex justify-between items-baseline text-gray-600">
                      <span>Subtotal:</span>
                      <div className="w-[80px] shrink-0 flex justify-between items-baseline tabular-nums">
                        <span>{ticket.subtotal < 0 ? '-$' : '$'}</span>
                        <span className="text-right">{formatNumero(Math.abs(ticket.subtotal))}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-baseline text-gray-700">
                      <span>{ticket.ajuste.descripcion}:</span>
                      <div className="w-[80px] shrink-0 flex justify-between items-baseline tabular-nums">
                        <span>{ticket.ajuste.esDescuento ? '-$' : '+$'}</span>
                        <span className="text-right">{formatNumero(Math.abs(ticket.ajuste.monto))}</span>
                      </div>
                    </div>
                  </>
                )}
                <div className="flex justify-between items-baseline text-sm font-extrabold pt-1 border-t border-dotted border-gray-300 text-gray-950">
                  <span>TOTAL:</span>
                  <div className="w-[80px] shrink-0 flex justify-between items-baseline tabular-nums text-sm sm:text-base font-extrabold text-gray-950">
                    <span>{ticket.total < 0 ? '-$' : '$'}</span>
                    <span className="text-right">{formatNumero(Math.abs(ticket.total))}</span>
                  </div>
                </div>
              </div>

              {/* Medio de pago y vuelto con posición fija de $ */}
              <div className="py-2 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
                <div className="flex justify-between items-baseline">
                  <span className="text-gray-600">Medio de pago:</span>
                  <span className="font-bold uppercase text-gray-900">{ticket.medioPago}</span>
                </div>
                {ticket.pagos && ticket.pagos.length > 1 && (
                  <div className="pl-2 space-y-0.5 text-[10px] text-gray-700">
                    {ticket.pagos.map((p, idx) => (
                      <div key={idx} className="flex justify-between items-baseline">
                        <span>• {p.medioPago}:</span>
                        <div className="w-[80px] shrink-0 flex justify-between items-baseline tabular-nums font-semibold">
                          <span>$</span>
                          <span className="text-right">{formatNumero(p.monto)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {ticket.clienteNombre && (
                  <div className="flex justify-between items-baseline font-semibold text-gray-800">
                    <span>Cliente:</span>
                    <span>{ticket.clienteNombre}</span>
                  </div>
                )}
                {ticket.pagaCon !== undefined && ticket.pagaCon > 0 && (
                  <>
                    <div className="flex justify-between items-baseline text-gray-600">
                      <span>Abonó con:</span>
                      <div className="w-[80px] shrink-0 flex justify-between items-baseline tabular-nums">
                        <span>$</span>
                        <span className="text-right">{formatNumero(ticket.pagaCon)}</span>
                      </div>
                    </div>
                    <div className="flex justify-between items-baseline font-bold text-gray-900">
                      <span>Vuelto:</span>
                      <div className="w-[80px] shrink-0 flex justify-between items-baseline tabular-nums font-bold text-gray-900">
                        <span>$</span>
                        <span className="text-right">{formatNumero(ticket.vuelto || 0)}</span>
                      </div>
                    </div>
                  </>
                )}
                {ticket.notas && (
                  <div className="pt-1 text-[10px] text-gray-500">
                    <span>Nota: {ticket.notas}</span>
                  </div>
                )}
              </div>

              {/* Pie de ticket */}
              {ticket.afip ? (
                <div className="pt-2 text-center text-[10px] text-gray-800 space-y-1">
                  {qrDataUrl && (
                    <div className="flex justify-center py-1">
                      <img
                        src={qrDataUrl}
                        alt="Código QR ARCA"
                        draggable={false}
                        className="w-28 h-28 object-contain bg-white p-1 rounded select-none border border-gray-200"
                      />
                    </div>
                  )}
                  <div className="border border-dotted border-gray-400 rounded-lg p-1.5 bg-gray-50 text-center space-y-0.5">
                    <p className="font-bold text-[11px] text-gray-950">CAE: {ticket.afip.cae}</p>
                    <p className="text-gray-800">Vto. CAE: {ticket.afip.vtoCae}</p>
                  </div>
                  <p className="text-[9px] text-gray-600 italic pt-1">
                    Comprobante Autorizado por ARCA (RG 4892)
                  </p>

                  {/* Código de barras del comprobante para auditoría y devoluciones */}
                  <div className="pt-2 pb-1 flex flex-col items-center">
                    <BarcodeSvg
                      value={`T-${ticket.ventaId.slice(0, 8).toUpperCase()}`}
                      height={38}
                      showText={true}
                      textLabel={`* T-${ticket.ventaId.slice(0, 8).toUpperCase()} *`}
                      className="w-full max-w-[210px]"
                    />
                  </div>

                  <p className="font-bold text-[10px] text-gray-950 pt-0.5">¡Muchas gracias por su compra!</p>
                </div>
              ) : (
                <div className="pt-2 text-center text-[10px] text-gray-600 space-y-1">
                  {/* Código de barras del comprobante para auditoría y devoluciones */}
                  <div className="pt-1 pb-1 flex flex-col items-center">
                    <BarcodeSvg
                      value={`T-${ticket.ventaId.slice(0, 8).toUpperCase()}`}
                      height={38}
                      showText={true}
                      textLabel={`* T-${ticket.ventaId.slice(0, 8).toUpperCase()} *`}
                      className="w-full max-w-[210px]"
                    />
                  </div>

                  <p className="font-semibold text-gray-800">¡Muchas gracias por su compra!</p>
                  <p className="text-[9px] text-gray-400">Comprobante no válido como factura</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Estilos aislados para impresión térmica */}
      <style>{`
        @media print {
          .ticket-print-ancestor {
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
            position: static !important;
            transform: none !important;
            filter: none !important;
            backdrop-filter: none !important;
          }
          body * {
            visibility: hidden !important;
          }
          #printable-ticket, #printable-ticket * {
            visibility: visible !important;
          }
          #printable-ticket {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: ${anchoPapel} !important;
            max-width: none !important;
            margin: 0 !important;
            padding: 4mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            background: white !important;
            color: black !important;
          }
        }
      `}</style>
    </Modal>
  )
}
