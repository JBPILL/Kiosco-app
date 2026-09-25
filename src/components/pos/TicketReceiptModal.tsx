import { useState, useEffect, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatPrecio, formatFecha } from '../../lib/utils'
import { generarImagenQRAFIP } from '../../lib/afipQR'
import { imprimirTicketEscPosDirecto, isWebSerialSupported } from '../../lib/escposPrinter'
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
  puntosFidelidad?: {
    ganados: number
    canjeados?: number
    saldoTotal?: number
  } | null
}

interface TicketReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  ticket: TicketData | null
}

function formatearTelefonoWhatsApp(tel: string): string {
  let limpio = tel.replace(/\D/g, '')
  if (!limpio) return ''
  // Si empieza con 0 (ej: 011...), sacarle el 0 inicial
  if (limpio.startsWith('0')) limpio = limpio.slice(1)
  // Si tiene el '15' en celulares de Argentina (ej: 11 15 2345 6789 -> 111523456789)
  if (limpio.length === 12 && (limpio.startsWith('1115') || limpio.slice(2, 4) === '15')) {
    limpio = limpio.slice(0, 2) + limpio.slice(4)
  }
  // Si tiene 10 dígitos (ej: 1123456789 o 3412345678)
  if (limpio.length === 10) {
    limpio = '549' + limpio
  } else if (limpio.length === 12 && limpio.startsWith('54') && !limpio.startsWith('549')) {
    limpio = '549' + limpio.slice(2)
  }
  return limpio
}

export function TicketReceiptModal({ isOpen, onClose, ticket }: TicketReceiptModalProps) {
  const [anchoPapel, setAnchoPapel] = useState<'58mm' | '80mm'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kioskopos_ancho_ticket')
      if (saved === '58mm' || saved === '80mm') return saved
    }
    return '58mm'
  })
  const [telefonoWhatsApp, setTelefonoWhatsApp] = useState('')
  const [mostrarInputTelefono, setMostrarInputTelefono] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState<string>('')
  const [imprimiendoSerial, setImprimiendoSerial] = useState(false)
  const inputTelefonoRef = useRef<HTMLInputElement>(null)
  const ticketScrollRef = useRef<HTMLDivElement>(null)

  const [isDragging, setIsDragging] = useState(false)
  const [puedeHacerScroll, setPuedeHacerScroll] = useState(false)
  const [estaAlFinal, setEstaAlFinal] = useState(false)
  const startYRef = useRef(0)
  const startScrollTopRef = useRef(0)
  const isMouseDownRef = useRef(false)

  const verificarScroll = () => {
    if (ticketScrollRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = ticketScrollRef.current
      setPuedeHacerScroll(scrollHeight > clientHeight + 15)
      setEstaAlFinal(scrollTop + clientHeight >= scrollHeight - 25)
    }
  }

  const handleScroll = () => {
    verificarScroll()
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !ticketScrollRef.current) return
    isMouseDownRef.current = true
    setIsDragging(true)
    startYRef.current = e.pageY - ticketScrollRef.current.offsetTop
    startScrollTopRef.current = ticketScrollRef.current.scrollTop
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isMouseDownRef.current || !ticketScrollRef.current) return
    e.preventDefault()
    const y = e.pageY - ticketScrollRef.current.offsetTop
    const walk = y - startYRef.current
    ticketScrollRef.current.scrollTop = startScrollTopRef.current - walk
  }

  const handleMouseUp = () => {
    isMouseDownRef.current = false
    setIsDragging(false)
  }

  const handleToggleScroll = () => {
    if (!ticketScrollRef.current) return
    if (estaAlFinal) {
      ticketScrollRef.current.scrollTo({ top: 0, behavior: 'smooth' })
    } else {
      ticketScrollRef.current.scrollTo({
        top: ticketScrollRef.current.scrollHeight,
        behavior: 'smooth',
      })
    }
  }

  useEffect(() => {
    if (!isOpen) {
      setMostrarInputTelefono(false)
      setIsDragging(false)
      isMouseDownRef.current = false
    } else {
      if (ticketScrollRef.current) {
        ticketScrollRef.current.scrollTop = 0
      }
      const timer = setTimeout(() => {
        verificarScroll()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isOpen, ticket, anchoPapel, qrDataUrl])

  useEffect(() => {
    if (ticket?.clienteTelefono) {
      setTelefonoWhatsApp(ticket.clienteTelefono)
    } else {
      setTelefonoWhatsApp('')
    }
  }, [ticket?.clienteTelefono])

  const cambiarAnchoPapel = (ancho: '58mm' | '80mm') => {
    setAnchoPapel(ancho)
    try {
      localStorage.setItem('kioskopos_ancho_ticket', ancho)
    } catch (e) {
      console.warn('Error al guardar preferencia de ticket:', e)
    }
  }

  useEffect(() => {
    if (ticket?.afip?.qrUrl) {
      generarImagenQRAFIP(ticket.afip.qrUrl, 160).then(setQrDataUrl)
    } else {
      setQrDataUrl('')
    }
  }, [ticket?.afip?.qrUrl])

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

  const generarTextoWhatsApp = () => {
    let msg = `*${ticket.kioscoNombre || 'Kiosko'}*\n`
    if (ticket.kioscoDireccion) msg += `${ticket.kioscoDireccion}\n`
    if (ticket.kioscoTelefono) msg += `Tel: ${ticket.kioscoTelefono}\n`
    if (ticket.afip) {
      msg += `*FACTURA ${ticket.afip.letra} N° ${String(ticket.afip.puntoVenta).padStart(4, '0')}-${String(ticket.afip.nroComprobante).padStart(8, '0')}*\n`
    } else {
      msg += `Ticket #${ticket.ventaId.slice(0, 8).toUpperCase()}\n`
    }
    msg += `Fecha: ${formatFecha(ticket.fecha)}\n`
    msg += `--------------------------------\n`
    ticket.items.forEach((it) => {
      const cantStr = it.cantidad % 1 === 0 ? `${it.cantidad}x` : `${it.cantidad} kg x`
      msg += `${cantStr} ${it.descripcion} ($${it.precioUnitario.toLocaleString('es-AR')}) = $${it.subtotal.toLocaleString('es-AR')}\n`
      if (it.promoNombre) {
        msg += `   [${it.promoNombre}]\n`
      }
    })
    msg += `--------------------------------\n`
    if (ticket.ajuste) {
      msg += `Subtotal: $${ticket.subtotal.toLocaleString('es-AR')}\n`
      msg += `${ticket.ajuste.descripcion}: ${ticket.ajuste.esDescuento ? '-' : '+'}$${Math.abs(ticket.ajuste.monto).toLocaleString('es-AR')}\n`
    }
    msg += `*TOTAL: $${ticket.total.toLocaleString('es-AR')}*\n`
    msg += `Pago: ${ticket.medioPago}\n`
    if (ticket.clienteNombre) {
      msg += `Cliente: ${ticket.clienteNombre}\n`
    }
    if (ticket.pagaCon !== undefined && ticket.pagaCon > 0) {
      msg += `Abonó: $${ticket.pagaCon.toLocaleString('es-AR')} | Vuelto: $${(ticket.vuelto || 0).toLocaleString('es-AR')}\n`
    }
    if (ticket.notas) {
      msg += `Notas: ${ticket.notas}\n`
    }
    if (ticket.puntosFidelidad) {
      msg += `--------------------------------\n`
      if (ticket.puntosFidelidad.ganados > 0) {
        msg += `Puntos acumulados: +${ticket.puntosFidelidad.ganados} pts\n`
      }
      if (ticket.puntosFidelidad.canjeados && ticket.puntosFidelidad.canjeados > 0) {
        msg += `Puntos canjeados: -${ticket.puntosFidelidad.canjeados} pts\n`
      }
      if (ticket.puntosFidelidad.saldoTotal !== undefined) {
        msg += `Saldo total puntos: ${ticket.puntosFidelidad.saldoTotal} pts\n`
      }
    }
    if (ticket.afip) {
      msg += `--------------------------------\n`
      msg += `CAE: ${ticket.afip.cae} | Vto: ${ticket.afip.vtoCae}\n`
      if (ticket.afip.qrUrl) {
        msg += `Verificar en ARCA: ${ticket.afip.qrUrl}\n`
      }
    }
    msg += `--------------------------------\n`
    msg += `¡Muchas gracias por su compra!`
    return encodeURIComponent(msg)
  }

  const handleBotonWhatsApp = () => {
    if (!mostrarInputTelefono) {
      setMostrarInputTelefono(true)
      setTimeout(() => {
        inputTelefonoRef.current?.focus()
      }, 60)
    } else {
      handleCompartirWhatsApp()
    }
  }

  const handleCompartirWhatsApp = () => {
    const texto = generarTextoWhatsApp()
    const telLimpio = formatearTelefonoWhatsApp(telefonoWhatsApp || ticket.clienteTelefono || '')
    const url = telLimpio
      ? `https://api.whatsapp.com/send?phone=${telLimpio}&text=${texto}`
      : `https://api.whatsapp.com/send?text=${texto}`
    window.open(url, '_blank')
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Comprobante de Venta"
      size="lg"
      footer={
        <div className="w-full space-y-2">
          {/* Fila 1: Métodos de Impresión */}
          <div className={isWebSerialSupported() ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : "w-full"}>
            <Button
              variant="primary"
              size="sm"
              onClick={handleImprimir}
              className="w-full text-xs sm:text-sm font-semibold shadow-xs"
              title="Abrir ventana de impresión del sistema o guardar como PDF"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 6 2 18 2 18 9"/>
                <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/>
                <rect x="6" y="14" width="12" height="8"/>
              </svg>
              <span>Imprimir (Sistema / PDF)</span>
            </Button>

            {isWebSerialSupported() && (
              <Button
                variant="warning"
                size="sm"
                onClick={handleImprimirEscPos}
                loading={imprimiendoSerial}
                disabled={imprimiendoSerial}
                className="w-full text-xs sm:text-sm font-semibold shadow-xs"
                title="Impresión térmica directa por cable USB/COM sin ventana de diálogo"
              >
                <span>{imprimiendoSerial ? 'Imprimiendo...' : 'Imprimir Ticket USB'}</span>
              </Button>
            )}
          </div>

          {/* Fila 2: Canales Digitales y Cierre */}
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="success"
              size="sm"
              onClick={handleBotonWhatsApp}
              className="w-full text-xs sm:text-sm font-semibold shadow-xs"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
              </svg>
              <span>{mostrarInputTelefono ? 'Listo para Enviar' : 'WhatsApp'}</span>
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={onClose}
              className="w-full text-xs sm:text-sm font-semibold shadow-xs"
            >
              Cerrar
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Selector de ancho térmico */}
        <div className="flex items-center justify-between px-3 py-1.5 text-xs text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/60 rounded-xl border border-gray-200/80 dark:border-gray-700/80">
          <span className="font-semibold text-gray-700 dark:text-gray-300">Formato de papel:</span>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-200/60 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => cambiarAnchoPapel('58mm')}
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
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
              className={`px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
                anchoPapel === '80mm'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              80 mm
            </button>
          </div>
        </div>

        {/* Vista previa del ticket estilo papel térmico */}
        <div className="relative w-full rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-gray-100/90 dark:bg-gray-900/80 overflow-hidden shadow-inner">
          <div
            ref={ticketScrollRef}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onScroll={handleScroll}
            className={`w-full overflow-y-auto max-h-[min(58vh,520px)] p-3 sm:p-5 select-none touch-pan-y overscroll-contain transition-colors ${
              isDragging ? 'cursor-grabbing' : 'cursor-grab'
            }`}
            style={{ scrollbarWidth: 'thin' }}
          >
            <div
              id="printable-ticket"
              className={`mx-auto bg-white text-gray-950 p-4 sm:p-5 pb-6 rounded-xl shadow-md border border-gray-200/90 font-mono text-xs leading-tight transition-all select-none block ${
                anchoPapel === '58mm' ? 'w-[270px]' : 'w-[350px]'
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

                <p className="font-bold text-sm tracking-wide uppercase pt-1">
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
                <p className="font-bold text-sm tracking-wide uppercase">
                  {ticket.kioscoNombre || 'AlPaso POS'}
                </p>
                {ticket.kioscoDireccion && (
                  <p className="text-[11px] text-gray-600">{ticket.kioscoDireccion}</p>
                )}
                {ticket.kioscoTelefono && (
                  <p className="text-[11px] text-gray-600">Tel: {ticket.kioscoTelefono}</p>
                )}
                <div className="pt-1 text-[10px] text-gray-500">
                  <p>Ticket #{ticket.ventaId.slice(0, 8).toUpperCase()}</p>
                  <p>{formatFecha(ticket.fecha)}</p>
                </div>
              </div>
            )}

            {/* Detalle de productos */}
            <div className="py-2 border-b border-dashed border-gray-400 space-y-1">
              <div className="flex justify-between font-bold text-[10px] uppercase text-gray-500 pb-0.5">
                <span>Cant / Articulo</span>
                <span>Subtotal</span>
              </div>
              {ticket.items.map((it, idx) => (
                <div key={idx} className="space-y-0.5 text-[11px]">
                  <div className="flex justify-between items-start">
                    <div className="pr-2 truncate">
                      <span>{it.cantidad % 1 === 0 ? `${it.cantidad}x ` : `${it.cantidad} kg x `}</span>
                      <span>{it.descripcion}</span>
                    </div>
                    <span className="font-semibold whitespace-nowrap">
                      {it.subtotal < 0 ? `-${formatPrecio(Math.abs(it.subtotal))}` : formatPrecio(it.subtotal)}
                    </span>
                  </div>
                  {it.promoNombre && (
                    <div className="text-[9px] text-emerald-800 font-semibold pl-2">
                      {it.promoNombre}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Totales y Ajustes */}
            <div className="py-2 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
              {ticket.ajuste && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>Subtotal:</span>
                    <span>{formatPrecio(ticket.subtotal)}</span>
                  </div>
                  <div className="flex justify-between text-gray-700">
                    <span>{ticket.ajuste.descripcion}:</span>
                    <span>
                      {ticket.ajuste.esDescuento ? '-' : '+'}
                      {formatPrecio(Math.abs(ticket.ajuste.monto))}
                    </span>
                  </div>
                </>
              )}
              <div className="flex justify-between items-center text-sm font-bold pt-1 border-t border-dotted border-gray-300">
                <span>TOTAL:</span>
                <span>{formatPrecio(ticket.total)}</span>
              </div>
            </div>

            {/* Medio de pago y vuelto */}
            <div className="py-2 border-b border-dashed border-gray-400 space-y-0.5 text-[11px]">
              <div className="flex justify-between">
                <span>Medio de pago:</span>
                <span className="font-medium uppercase">{ticket.medioPago}</span>
              </div>
              {ticket.pagos && ticket.pagos.length > 1 && (
                <div className="pl-2 space-y-0.5 text-[10px] text-gray-700">
                  {ticket.pagos.map((p, idx) => (
                    <div key={idx} className="flex justify-between">
                      <span>• {p.medioPago}:</span>
                      <span className="font-semibold">{formatPrecio(p.monto)}</span>
                    </div>
                  ))}
                </div>
              )}
              {ticket.clienteNombre && (
                <div className="flex justify-between font-semibold text-gray-800">
                  <span>Cliente:</span>
                  <span>{ticket.clienteNombre}</span>
                </div>
              )}
              {ticket.pagaCon !== undefined && ticket.pagaCon > 0 && (
                <>
                  <div className="flex justify-between text-gray-600">
                    <span>Abonó con:</span>
                    <span>{formatPrecio(ticket.pagaCon)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-gray-900">
                    <span>Vuelto:</span>
                    <span>{formatPrecio(ticket.vuelto || 0)}</span>
                  </div>
                </>
              )}
              {ticket.notas && (
                <div className="pt-1 text-[10px] text-gray-500">
                  <span>Nota: {ticket.notas}</span>
                </div>
              )}
              {ticket.puntosFidelidad && (
                <div className="pt-1.5 mt-1 border-t border-dotted border-gray-300 text-[10px] space-y-0.5">
                  {ticket.puntosFidelidad.ganados > 0 && (
                    <div className="flex justify-between font-semibold text-indigo-900">
                      <span>Puntos sumados:</span>
                      <span>+{ticket.puntosFidelidad.ganados} pts</span>
                    </div>
                  )}
                  {ticket.puntosFidelidad.canjeados && ticket.puntosFidelidad.canjeados > 0 && (
                    <div className="flex justify-between text-emerald-800">
                      <span>Puntos canjeados:</span>
                      <span>-{ticket.puntosFidelidad.canjeados} pts</span>
                    </div>
                  )}
                  {ticket.puntosFidelidad.saldoTotal !== undefined && (
                    <div className="flex justify-between text-gray-700 font-bold">
                      <span>Saldo actual de puntos:</span>
                      <span>{ticket.puntosFidelidad.saldoTotal} pts</span>
                    </div>
                  )}
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
                      className="w-28 h-28 object-contain bg-white p-1 rounded pointer-events-none select-none"
                    />
                  </div>
                )}
                <div className="border-t border-dotted border-gray-400 pt-1 space-y-0.5">
                  <p className="font-bold text-[11px] text-gray-950">CAE: {ticket.afip.cae}</p>
                  <p className="text-gray-800">Vto. CAE: {ticket.afip.vtoCae}</p>
                </div>
                <p className="text-[9px] text-gray-600 italic pt-1">
                  Comprobante Autorizado por ARCA (RG 4892)
                </p>
                <p className="font-bold text-[10px] text-gray-950 pt-0.5">¡Muchas gracias por su compra!</p>
              </div>
            ) : (
              <div className="pt-2 text-center text-[10px] text-gray-600 space-y-0.5">
                <p className="font-semibold text-gray-800">¡Muchas gracias por su compra!</p>
                <p>Comprobante no válido como factura</p>
              </div>
            )}
            </div>
          </div>

          {/* Botón flotante para arrastrar o saltar al final/inicio */}
          {puedeHacerScroll && (
            <div className="absolute bottom-2.5 left-1/2 -translate-x-1/2 z-10 pointer-events-auto transition-all animate-in fade-in duration-200">
              <button
                type="button"
                onClick={handleToggleScroll}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-900/85 hover:bg-slate-950 dark:bg-slate-100/90 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-semibold shadow-lg backdrop-blur-xs transition-all active:scale-95 cursor-pointer"
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform duration-300 ${estaAlFinal ? 'rotate-180' : ''}`}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
                <span>{estaAlFinal ? 'Subir al inicio' : 'Arrastrá hacia abajo para ver completo'}</span>
              </button>
            </div>
          )}
        </div>

        {/* Panel para enviar por WhatsApp */}
        {mostrarInputTelefono && (
          <div className="p-3.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2.5 animate-in fade-in-50 duration-150">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-800 dark:text-gray-200">
                <svg className="w-4 h-4 text-emerald-600 dark:text-emerald-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                </svg>
                <span>Enviar comprobante por WhatsApp</span>
              </div>
              <button
                type="button"
                onClick={() => setMostrarInputTelefono(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-sm p-1 rounded-md transition-colors"
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
                className="flex-1 px-3 py-2 text-xs sm:text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 font-mono focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none transition-all"
              />
              <button
                type="button"
                onClick={handleCompartirWhatsApp}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 active:scale-95 transition-all shadow-xs"
              >
                <span>Enviar</span>
              </button>
            </div>
            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Ingresá el número celular del cliente con código de área (ej: 11...).
            </p>
          </div>
        )}
      </div>

      {/* Estilos aislados para impresión térmica */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-ticket, #printable-ticket * {
            visibility: visible !important;
          }
          #printable-ticket {
            position: fixed !important;
            left: 0 !important;
            top: 0 !important;
            width: ${anchoPapel} !important;
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
