import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatPrecio, formatFecha } from '../../lib/utils'
import type { PagoProveedor } from '../../types/database'
import toast from 'react-hot-toast'

interface ComprobantePagoModalProps {
  isOpen: boolean
  onClose: () => void
  pago: PagoProveedor | null
  nombreKiosco?: string
  telefonoKiosco?: string | null
}

export function ComprobantePagoModal({
  isOpen,
  onClose,
  pago,
  nombreKiosco = 'AlPaso POS',
  telefonoKiosco,
}: ComprobantePagoModalProps) {
  const [anchoPapel, setAnchoPapel] = useState<'58mm' | '80mm'>('58mm')
  const [telefonoWhatsApp, setTelefonoWhatsApp] = useState(
    pago?.proveedor?.telefono ? pago.proveedor.telefono.replace(/\D/g, '') : ''
  )
  const [mostrarInputTelefono, setMostrarInputTelefono] = useState(false)

  if (!pago) return null

  const handleImprimir = () => {
    window.print()
  }

  const generarTextoWhatsApp = () => {
    let msg = `*CONSTANCIA DE PAGO A PROVEEDOR*\n`
    msg += `Emisor: *${nombreKiosco}*\n`
    if (telefonoKiosco) msg += `Tel: ${telefonoKiosco}\n`
    msg += `--------------------------------\n`
    msg += `Proveedor: *${pago.proveedor?.nombre || 'Proveedor'}*\n`
    if (pago.proveedor?.cuit) msg += `CUIT: ${pago.proveedor.cuit}\n`
    msg += `Fecha: ${formatFecha(pago.fecha)}\n`
    msg += `Medio de Pago: ${pago.medio_pago}\n`
    if (pago.comprobante_ref) msg += `Ref / Comprobante: ${pago.comprobante_ref}\n`
    msg += `--------------------------------\n`
    msg += `Saldo Anterior: ${formatPrecio(pago.saldo_anterior)}\n`
    msg += `*MONTO ABONADO: ${formatPrecio(pago.monto)}*\n`
    msg += `*SALDO RESTANTE: ${formatPrecio(pago.saldo_nuevo)}*\n`
    if (pago.notas) msg += `Detalle / Notas: ${pago.notas}\n`
    msg += `--------------------------------\n`
    msg += `Comprobante de pago generado por ${nombreKiosco}.`
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

  const handleCopiarTexto = () => {
    let textoPlano = `CONSTANCIA DE PAGO A PROVEEDOR\n`
    textoPlano += `Emisor: ${nombreKiosco}\n`
    textoPlano += `Proveedor: ${pago.proveedor?.nombre || 'Proveedor'}\n`
    textoPlano += `Fecha: ${formatFecha(pago.fecha)}\n`
    textoPlano += `Medio de Pago: ${pago.medio_pago}\n`
    textoPlano += `Saldo Anterior: ${formatPrecio(pago.saldo_anterior)}\n`
    textoPlano += `Monto Abonado: ${formatPrecio(pago.monto)}\n`
    textoPlano += `Saldo Restante: ${formatPrecio(pago.saldo_nuevo)}\n`
    if (pago.notas) textoPlano += `Notas: ${pago.notas}\n`

    navigator.clipboard.writeText(textoPlano)
    toast.success('Constancia copiada al portapapeles')
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comprobante de Pago a Proveedor" size="md">
      <div className="space-y-4">
        {/* Controles superiores */}
        <div className="flex items-center justify-between gap-2 pb-2 border-b border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400">
            <span>Formato:</span>
            <button
              type="button"
              onClick={() => setAnchoPapel('58mm')}
              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                anchoPapel === '58mm'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              58mm
            </button>
            <button
              type="button"
              onClick={() => setAnchoPapel('80mm')}
              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                anchoPapel === '80mm'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
            >
              80mm
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setMostrarInputTelefono(!mostrarInputTelefono)}
              className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold"
            >
              {mostrarInputTelefono ? 'Ocultar N°' : 'Cambiar N° WhatsApp'}
            </button>
          </div>
        </div>

        {/* Input opcional de teléfono para WhatsApp */}
        {mostrarInputTelefono && (
          <div className="p-2.5 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg border border-emerald-200 dark:border-emerald-800 space-y-2">
            <label className="block text-xs font-medium text-emerald-900 dark:text-emerald-200">
              Número de WhatsApp del proveedor (con código de país/área):
            </label>
            <div className="flex gap-2">
              <input
                type="tel"
                placeholder="Ej: 5491123456789"
                value={telefonoWhatsApp}
                onChange={(e) => setTelefonoWhatsApp(e.target.value)}
                className="flex-1 py-1.5 px-3 text-xs rounded border border-emerald-300 dark:border-emerald-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <Button
                size="sm"
                onClick={handleCompartirWhatsApp}
                className="bg-emerald-600 hover:bg-emerald-700 text-xs text-white"
              >
                Enviar
              </Button>
            </div>
          </div>
        )}

        {/* Vista previa del comprobante estilo ticket */}
        <div className="flex justify-center p-3 bg-gray-100 dark:bg-gray-900/60 rounded-xl overflow-x-auto">
          <div
            id="printable-pago-ticket"
            className={`bg-white text-gray-950 p-4 rounded shadow-sm font-mono text-xs leading-tight select-text ${
              anchoPapel === '58mm' ? 'w-[260px]' : 'w-[340px]'
            }`}
          >
            {/* Encabezado */}
            <div className="text-center space-y-0.5 pb-2 border-b border-dashed border-gray-400">
              <p className="font-bold text-sm tracking-wide uppercase">
                {nombreKiosco}
              </p>
              {telefonoKiosco && (
                <p className="text-[11px] text-gray-600">Tel: {telefonoKiosco}</p>
              )}
              <div className="pt-1.5 text-[10px] text-gray-600 font-bold uppercase tracking-wider">
                COMPROBANTE DE PAGO
              </div>
              <div className="text-[10px] text-gray-500">
                <p>N° #{pago.id.slice(0, 8).toUpperCase()}</p>
                <p>{formatFecha(pago.fecha)}</p>
              </div>
            </div>

            {/* Datos del Proveedor */}
            <div className="py-2 border-b border-dashed border-gray-400 space-y-0.5 text-[11px]">
              <div>
                <span className="text-gray-500">Proveedor: </span>
                <span className="font-bold uppercase">{pago.proveedor?.nombre || 'Proveedor'}</span>
              </div>
              {pago.proveedor?.contacto_nombre && (
                <div>
                  <span className="text-gray-500">Contacto: </span>
                  <span>{pago.proveedor.contacto_nombre}</span>
                </div>
              )}
              {pago.proveedor?.cuit && (
                <div>
                  <span className="text-gray-500">CUIT: </span>
                  <span>{pago.proveedor.cuit}</span>
                </div>
              )}
              {pago.comprobante_ref && (
                <div>
                  <span className="text-gray-500">Comprobante / Ref: </span>
                  <span className="font-semibold">{pago.comprobante_ref}</span>
                </div>
              )}
            </div>

            {/* Importes y Saldos */}
            <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1.5 text-[11px]">
              <div className="flex justify-between text-gray-600">
                <span>Saldo Anterior:</span>
                <span>{formatPrecio(pago.saldo_anterior)}</span>
              </div>

              <div className="flex justify-between items-center py-1 px-1.5 bg-gray-100 rounded text-sm font-black border border-gray-200">
                <span>MONTO ABONADO:</span>
                <span className="text-indigo-900">{formatPrecio(pago.monto)}</span>
              </div>

              <div className="flex justify-between font-bold text-[12px] pt-0.5">
                <span>SALDO RESTANTE:</span>
                <span className={pago.saldo_nuevo > 0 ? 'text-amber-800' : 'text-emerald-700'}>
                  {formatPrecio(pago.saldo_nuevo)}
                </span>
              </div>
            </div>

            {/* Detalles del pago */}
            <div className="py-2 border-b border-dashed border-gray-400 space-y-0.5 text-[10px] text-gray-600">
              <div className="flex justify-between">
                <span>Medio de Pago:</span>
                <span className="font-semibold uppercase">{pago.medio_pago}</span>
              </div>
              {pago.pagado_en_caja && (
                <p className="text-emerald-700 font-semibold">* Registrado como egreso en caja</p>
              )}
              {pago.notas && (
                <p className="pt-1 text-gray-500 italic">Nota: {pago.notas}</p>
              )}
            </div>

            {/* Espacio para firmas */}
            <div className="pt-6 pb-2 grid grid-cols-2 gap-2 text-center text-[9px] text-gray-400">
              <div className="border-t border-gray-300 pt-1">
                Firma Entrega
              </div>
              <div className="border-t border-gray-300 pt-1">
                Firma Recepción
              </div>
            </div>

            {/* Pie */}
            <div className="pt-1 text-center text-[9px] text-gray-400">
              <p>Constancia de Pago Comercial</p>
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
          <Button
            variant="primary"
            onClick={handleImprimir}
            className="text-xs"
          >
            Imprimir
          </Button>
          <Button
            variant="success"
            onClick={handleCompartirWhatsApp}
            className="text-xs"
          >
            WhatsApp
          </Button>
          <Button
            variant="secondary"
            onClick={handleCopiarTexto}
            className="text-xs"
          >
            Copiar
          </Button>
          <Button
            variant="ghost"
            onClick={onClose}
            className="text-xs"
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
          #printable-pago-ticket, #printable-pago-ticket * {
            visibility: visible !important;
          }
          #printable-pago-ticket {
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
