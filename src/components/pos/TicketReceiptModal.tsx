import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatPrecio, formatFecha } from '../../lib/utils'

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
  notas?: string | null
}

interface TicketReceiptModalProps {
  isOpen: boolean
  onClose: () => void
  ticket: TicketData | null
}

export function TicketReceiptModal({ isOpen, onClose, ticket }: TicketReceiptModalProps) {
  const [anchoPapel, setAnchoPapel] = useState<'58mm' | '80mm'>('58mm')
  const [telefonoWhatsApp, setTelefonoWhatsApp] = useState('')
  const [mostrarInputTelefono, setMostrarInputTelefono] = useState(false)

  if (!ticket) return null

  const handleImprimir = () => {
    window.print()
  }

  const generarTextoWhatsApp = () => {
    let msg = `*${ticket.kioscoNombre || 'Kiosko'}*\n`
    if (ticket.kioscoDireccion) msg += `${ticket.kioscoDireccion}\n`
    if (ticket.kioscoTelefono) msg += `Tel: ${ticket.kioscoTelefono}\n`
    msg += `Ticket #${ticket.ventaId.slice(0, 8).toUpperCase()}\n`
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
    msg += `--------------------------------\n`
    msg += `¡Muchas gracias por su compra!`
    return encodeURIComponent(msg)
  }

  const handleCompartirWhatsApp = () => {
    const texto = generarTextoWhatsApp()
    const telLimpio = telefonoWhatsApp.replace(/\D/g, '')
    const url = telLimpio
      ? `https://api.whatsapp.com/send?phone=${telLimpio}&text=${texto}`
      : `https://api.whatsapp.com/send?text=${texto}`
    window.open(url, '_blank')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comprobante de Venta" size="md">
      <div className="space-y-4">
        {/* Controles superiores */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span>Ancho:</span>
            <button
              type="button"
              onClick={() => setAnchoPapel('58mm')}
              className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                anchoPapel === '58mm'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 text-indigo-700 dark:text-indigo-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              58 mm
            </button>
            <button
              type="button"
              onClick={() => setAnchoPapel('80mm')}
              className={`px-2 py-0.5 rounded text-xs font-semibold border ${
                anchoPapel === '80mm'
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 text-indigo-700 dark:text-indigo-400'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              80 mm
            </button>
          </div>

          <button
            type="button"
            onClick={() => setMostrarInputTelefono(!mostrarInputTelefono)}
            className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
          >
            {mostrarInputTelefono ? 'Ocultar WhatsApp' : 'Enviar por WhatsApp'}
          </button>
        </div>

        {/* Input opcional de teléfono cliente */}
        {mostrarInputTelefono && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-lg space-y-2">
            <label className="block text-xs font-medium text-emerald-800 dark:text-emerald-300">
              Teléfono de WhatsApp del cliente (opcional con código de área)
            </label>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="Ej: 5491122334455"
                value={telefonoWhatsApp}
                onChange={(e) => setTelefonoWhatsApp(e.target.value)}
                className="flex-1 px-3 py-1.5 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <Button
                size="sm"
                variant="primary"
                onClick={handleCompartirWhatsApp}
                className="bg-emerald-600 hover:bg-emerald-700 text-xs text-white"
              >
                Enviar
              </Button>
            </div>
          </div>
        )}

        {/* Vista previa del ticket estilo papel térmico */}
        <div className="flex justify-center p-3 bg-gray-100 dark:bg-gray-900/60 rounded-xl overflow-x-auto">
          <div
            id="printable-ticket"
            className={`bg-white text-gray-950 p-4 rounded shadow-sm font-mono text-xs leading-tight select-text ${
              anchoPapel === '58mm' ? 'w-[260px]' : 'w-[340px]'
            }`}
          >
            {/* Encabezado */}
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
            <div className="pt-2 text-center text-[10px] text-gray-500 space-y-0.5">
              <p className="font-semibold">¡Muchas gracias por su compra!</p>
              <p>Comprobante no válido como factura</p>
            </div>
          </div>
        </div>

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
          {!mostrarInputTelefono && (
            <Button
              variant="secondary"
              fullWidth
              onClick={handleCompartirWhatsApp}
            >
              WhatsApp
            </Button>
          )}
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
