import { useState, useEffect, useRef } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatPrecio, formatFecha } from '../../lib/utils'
import { generarImagenQRAFIP } from '../../lib/afipQR'

export interface TicketItem {
  descripcion: string
  cantidad: number
  precioUnitario: number
  subtotal: number
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
  const inputTelefonoRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!isOpen) {
      setMostrarInputTelefono(false)
    }
  }, [isOpen])

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
    if (ticket.cajeroNombre) msg += `Atendido por: ${ticket.cajeroNombre}\n`
    msg += `--------------------------------\n`
    ticket.items.forEach((it) => {
      msg += `${it.cantidad}x ${it.descripcion} ($${it.precioUnitario.toLocaleString('es-AR')}) = $${it.subtotal.toLocaleString('es-AR')}\n`
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
    if (ticket.afip) {
      msg += `--------------------------------\n`
      msg += `CAE: ${ticket.afip.cae} | Vto: ${ticket.afip.vtoCae}\n`
      if (ticket.afip.qrUrl) {
        msg += `Verificar en AFIP: ${ticket.afip.qrUrl}\n`
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
    <Modal isOpen={isOpen} onClose={onClose} title="Comprobante de Venta" size="md">
      <div className="space-y-4">
        {/* Selector de ancho térmico */}
        <div className="flex items-center justify-between px-1 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Formato térmico:</span>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-100 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => cambiarAnchoPapel('58mm')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                anchoPapel === '58mm'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              58 mm (Chico)
            </button>
            <button
              type="button"
              onClick={() => cambiarAnchoPapel('80mm')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                anchoPapel === '80mm'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              80 mm (Estándar)
            </button>
          </div>
        </div>

        {/* Vista previa del ticket estilo papel térmico */}
        <div className="flex justify-center p-3 bg-gray-100 dark:bg-gray-900/60 rounded-xl overflow-x-auto">
          <div
            id="printable-ticket"
            className={`bg-white text-gray-950 p-4 rounded shadow-sm font-mono text-xs leading-tight select-text ${
              anchoPapel === '58mm' ? 'w-[260px]' : 'w-[340px]'
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
                  {ticket.kioscoNombre || 'KioskoPOS'}
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
                  {ticket.kioscoNombre || 'KioskoPOS'}
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
                  {ticket.cajeroNombre && <p>Atendió: {ticket.cajeroNombre}</p>}
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
                <div key={idx} className="flex justify-between items-start text-[11px]">
                  <div className="pr-2 truncate">
                    <span>{it.cantidad}x </span>
                    <span>{it.descripcion}</span>
                  </div>
                  <span className="font-semibold whitespace-nowrap">
                    {formatPrecio(it.subtotal)}
                  </span>
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
            </div>

            {/* Pie de ticket */}
            {ticket.afip ? (
              <div className="pt-2 text-center text-[10px] text-gray-700 space-y-1">
                {qrDataUrl && (
                  <div className="flex justify-center py-1">
                    <img
                      src={qrDataUrl}
                      alt="Código QR AFIP"
                      className="w-28 h-28 object-contain"
                    />
                  </div>
                )}
                <div className="border-t border-dotted border-gray-300 pt-1 space-y-0.5">
                  <p className="font-bold text-[11px]">CAE: {ticket.afip.cae}</p>
                  <p>Vto. CAE: {ticket.afip.vtoCae}</p>
                </div>
                <p className="text-[9px] text-gray-500 italic pt-1">
                  Comprobante Autorizado por AFIP (RG 4892)
                </p>
                <p className="font-semibold text-[10px] pt-0.5">¡Muchas gracias por su compra!</p>
              </div>
            ) : (
              <div className="pt-2 text-center text-[10px] text-gray-500 space-y-0.5">
                <p className="font-semibold">¡Muchas gracias por su compra!</p>
                <p>Comprobante no válido como factura</p>
              </div>
            )}
          </div>
        </div>

        {/* Panel para discar número de WhatsApp del cliente */}
        {mostrarInputTelefono && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold text-emerald-800 dark:text-emerald-300">
                Discar número de celular del cliente
              </label>
              <button
                type="button"
                onClick={() => setMostrarInputTelefono(false)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 font-medium"
              >
                Cancelar
              </button>
            </div>
            <div className="flex gap-2">
              <input
                ref={inputTelefonoRef}
                type="tel"
                placeholder="Ej: 11 2345 6789 (o 54911...)"
                value={telefonoWhatsApp}
                onChange={(e) => setTelefonoWhatsApp(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCompartirWhatsApp()
                  if (e.key === 'Escape') setMostrarInputTelefono(false)
                }}
                className="flex-1 px-3 py-1.5 text-xs sm:text-sm rounded-lg border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-mono focus:ring-2 focus:ring-emerald-500"
              />
              <Button
                variant="success"
                size="sm"
                onClick={handleCompartirWhatsApp}
                className="text-xs font-bold px-4"
              >
                Enviar
              </Button>
            </div>
            <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
              Podés ingresar el celular con código de área (ej: 11...). Al presionar Enviar se abrirá el chat con el ticket.
            </p>
          </div>
        )}

        {/* Botones de acción */}
        <div className="flex flex-col sm:flex-row gap-2 pt-2">
          <Button
            variant="primary"
            fullWidth
            onClick={handleImprimir}
            className="flex items-center justify-center gap-1.5"
          >
            Imprimir Ticket
          </Button>
          <Button
            variant="success"
            fullWidth
            onClick={handleBotonWhatsApp}
          >
            {mostrarInputTelefono ? 'Enviar a WhatsApp' : 'WhatsApp'}
          </Button>
          <Button
            variant="secondary"
            fullWidth
            onClick={onClose}
          >
            Cerrar
          </Button>
        </div>
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
