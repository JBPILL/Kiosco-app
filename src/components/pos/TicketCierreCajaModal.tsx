import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatPrecio, formatFecha } from '../../lib/utils'
import { isWebSerialSupported, imprimirCierreCajaEscPosDirecto } from '../../lib/escposPrinter'
import { useAuthStore } from '../../stores/authStore'
import {
  getWhatsAppReportConfig,
  formatearReporteCierreTexto,
  generarEnlaceWhatsApp,
} from '../../lib/whatsappReport'
import toast from 'react-hot-toast'

export interface DatosCierreCaja {
  kioscoNombre?: string | null
  kioscoDireccion?: string | null
  kioscoTelefono?: string | null
  cajeroNombre?: string | null
  fechaApertura: string
  fechaCierre: string
  montoInicial: number
  ventasPorMedio: { medio: string; total: number; cantidad?: number }[]
  totalVentas: number
  cantidadVentas?: number
  ingresosExtra: number
  egresosExtra: number
  efectivoEsperado: number
  efectivoContado: number
  diferencia: number
  esParcial?: boolean
}

interface TicketCierreCajaModalProps {
  isOpen: boolean
  onClose: () => void
  datos: DatosCierreCaja | null
}

export function TicketCierreCajaModal({ isOpen, onClose, datos }: TicketCierreCajaModalProps) {
  const [anchoPapel, setAnchoPapel] = useState<'58mm' | '80mm'>('58mm')
  const [imprimiendoSerial, setImprimiendoSerial] = useState(false)

  // Restaurar preferencia de ancho de papel guardada
  useEffect(() => {
    if (isOpen && typeof window !== 'undefined') {
      const saved = localStorage.getItem('kioskopos_ancho_ticket')
      if (saved === '58mm' || saved === '80mm') setAnchoPapel(saved)
    }
  }, [isOpen])

  // BUG-08: Inyectar estilos de impresión en el <head> del documento para garantizar
  // que @media print funcione correctamente en todos los navegadores, independientemente
  // de si Modal usa un portal de React o no.
  useEffect(() => {
    if (!isOpen) return
    const styleId = 'kioskopos-print-cierre'
    let el = document.getElementById(styleId) as HTMLStyleElement | null
    if (!el) {
      el = document.createElement('style')
      el.id = styleId
      document.head.appendChild(el)
    }
    el.textContent = `
      @media print {
        body * { visibility: hidden !important; }
        #printable-cierre, #printable-cierre * { visibility: visible !important; }
        #printable-cierre {
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
    `
    return () => {
      // Limpiar el estilo cuando el modal se cierra
      document.getElementById(styleId)?.remove()
    }
  }, [isOpen, anchoPapel])

  if (!datos) return null

  const handleImprimir = () => {
    window.print()
  }

  const handleImprimirEscPos = async () => {
    if (!datos) return
    setImprimiendoSerial(true)
    try {
      const res = await imprimirCierreCajaEscPosDirecto(datos, anchoPapel)
      if (res.ok) {
        toast.success(res.mensaje)
      } else {
        toast.error(res.mensaje)
      }
    } catch (e: any) {
      toast.error('Error al imprimir por USB: ' + (e?.message || 'Error desconocido'))
    } finally {
      setImprimiendoSerial(false)
    }
  }

  const [copiandoTexto, setCopiandoTexto] = useState(false)

  const handleEnviarWhatsApp = () => {
    if (!datos) return
    const kioscoId = useAuthStore.getState().usuario?.kiosco_id || useAuthStore.getState().kiosco?.id
    const config = getWhatsAppReportConfig(kioscoId)
    const texto = formatearReporteCierreTexto(datos)
    const url = generarEnlaceWhatsApp(config.whatsappDueno, texto)
    window.open(url, '_blank')
  }

  const handleCopiarTexto = async () => {
    if (!datos) return
    setCopiandoTexto(true)
    try {
      const texto = formatearReporteCierreTexto(datos)
      await navigator.clipboard.writeText(texto)
      toast.success('Resumen de caja copiado al portapapeles', { icon: '📋' })
    } catch {
      toast.error('No se pudo copiar automáticamente')
    } finally {
      setTimeout(() => setCopiandoTexto(false), 2000)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={datos.esParcial ? 'Ticket de Arqueo Parcial (X)' : 'Ticket de Cierre de Caja (Arqueo Z)'}
      size="md"
      footer={
        <div className="w-full space-y-2">
          {/* Acciones Digitales: WhatsApp y Copiar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleEnviarWhatsApp}
              className="w-full text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center justify-center gap-1.5"
              title="Abrir WhatsApp con el reporte formateado para el dueño"
            >
              <span>📲 Enviar a WhatsApp</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopiarTexto}
              className="w-full text-xs sm:text-sm font-semibold shadow-xs flex items-center justify-center gap-1.5"
              title="Copiar el texto del cierre al portapapeles"
            >
              <span>{copiandoTexto ? '✅ Copiado' : '📋 Copiar Texto'}</span>
            </Button>
          </div>

          {/* Acciones de Impresión Física */}
          <div className={isWebSerialSupported() ? "grid grid-cols-1 sm:grid-cols-2 gap-2" : "w-full"}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleImprimir}
              className="w-full text-xs sm:text-sm font-semibold shadow-xs"
              title="Abrir ventana de impresión del sistema o guardar como PDF"
            >
              <span>🖨️ Imprimir (PDF)</span>
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
                <span>{imprimiendoSerial ? 'Imprimiendo...' : '⚡ Ticket USB'}</span>
              </Button>
            )}
          </div>
          <Button variant="secondary" size="sm" fullWidth onClick={onClose}>
            Cerrar
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Controles superiores */}
        <div className="flex items-center justify-between px-1 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Formato térmico:</span>
          <div className="inline-flex rounded-lg border border-gray-200 dark:border-gray-700 p-0.5 bg-gray-100 dark:bg-gray-800">
            <button
              type="button"
              onClick={() => {
                setAnchoPapel('58mm')
                localStorage.setItem('kioskopos_ancho_ticket', '58mm')
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                anchoPapel === '58mm'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              58 mm
            </button>
            <button
              type="button"
              onClick={() => {
                setAnchoPapel('80mm')
                localStorage.setItem('kioskopos_ancho_ticket', '80mm')
              }}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                anchoPapel === '80mm'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-500 hover:text-gray-800 dark:hover:text-gray-200'
              }`}
            >
              80 mm
            </button>
          </div>
        </div>

        {/* Vista previa térmica imprimible */}
        <div className="w-full p-2.5 sm:p-4 bg-gray-100 dark:bg-gray-900/60 rounded-xl overflow-y-auto max-h-[min(54vh,460px)]">
          <div
            id="printable-cierre"
            className={`mx-auto bg-white text-gray-950 p-4 pb-5 rounded-lg shadow-sm font-mono text-xs leading-tight select-text block ${
              anchoPapel === '58mm' ? 'w-[260px]' : 'w-[340px]'
            }`}
          >
            {/* Encabezado */}
            <div className="text-center space-y-1 pb-2 border-b border-dashed border-gray-400">
              <p className="font-bold text-sm tracking-wide uppercase">
                {datos.kioscoNombre || 'KIOSKOPOS'}
              </p>
              {datos.kioscoDireccion && (
                <p className="text-[10px] text-gray-600">{datos.kioscoDireccion}</p>
              )}
              {datos.kioscoTelefono && (
                <p className="text-[10px] text-gray-600">Tel: {datos.kioscoTelefono}</p>
              )}
              <p className="font-bold text-[11px] uppercase tracking-wider bg-gray-100 py-0.5 rounded">
                *** {datos.esParcial ? 'ARQUEO PARCIAL (X)' : 'CIERRE DE CAJA (ARQUEO Z)'} ***
              </p>
              <div className="text-[10px] text-gray-700 text-left pt-1 space-y-0.5">
                <p>Apertura: {formatFecha(datos.fechaApertura)}</p>
                <p>Cierre:   {formatFecha(datos.fechaCierre)}</p>
                {datos.cajeroNombre && <p>Cajero:   {datos.cajeroNombre}</p>}
              </div>
            </div>

            {/* Fondo Inicial */}
            <div className="py-2 border-b border-dashed border-gray-300 flex justify-between font-semibold">
              <span>Fondo Inicial:</span>
              <span>{formatPrecio(datos.montoInicial)}</span>
            </div>

            {/* Ventas por Medio de Pago */}
            <div className="py-2 border-b border-dashed border-gray-300 space-y-1">
              <p className="font-bold text-[11px] text-gray-800">VENTAS POR MEDIO:</p>
              {datos.ventasPorMedio.length === 0 ? (
                <p className="text-gray-500 text-[10px]">Sin ventas registradas</p>
              ) : (
                datos.ventasPorMedio.map((m) => (
                  <div key={m.medio} className="flex justify-between text-[11px]">
                    <span className="truncate max-w-[140px]">
                      {m.medio}{m.cantidad ? ` (${m.cantidad})` : ''}:
                    </span>
                    <span>{formatPrecio(m.total)}</span>
                  </div>
                ))
              )}
              <div className="flex justify-between font-bold pt-1 border-t border-dotted border-gray-300">
                <span>TOTAL VENTAS{datos.cantidadVentas ? ` (${datos.cantidadVentas})` : ''}:</span>
                <span>{formatPrecio(datos.totalVentas)}</span>
              </div>
            </div>

            {/* Movimientos de Efectivo en Turno */}
            {(datos.ingresosExtra > 0 || datos.egresosExtra > 0) && (
              <div className="py-2 border-b border-dashed border-gray-300 space-y-1 text-[11px]">
                <p className="font-bold text-[11px] text-gray-800">MOVIMIENTOS DE CAJA:</p>
                {datos.ingresosExtra > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>(+) Ingresos Extra:</span>
                    <span>+{formatPrecio(datos.ingresosExtra)}</span>
                  </div>
                )}
                {datos.egresosExtra > 0 && (
                  <div className="flex justify-between text-red-700">
                    <span>(-) Retiros / Gastos:</span>
                    <span>-{formatPrecio(datos.egresosExtra)}</span>
                  </div>
                )}
              </div>
            )}

            {/* Balance de Arqueo */}
            <div className="py-2 border-b border-dashed border-gray-400 space-y-1.5">
              <p className="font-bold text-[11px] text-gray-800">ARQUEO DE EFECTIVO:</p>
              <div className="flex justify-between text-gray-700">
                <span>Esperado en caja:</span>
                <span className="font-bold">{formatPrecio(datos.efectivoEsperado)}</span>
              </div>
              <div className="flex justify-between text-gray-700">
                <span>Contado en mano:</span>
                <span className="font-bold">{formatPrecio(datos.efectivoContado)}</span>
              </div>
              <div className="flex justify-between text-xs font-bold pt-1 border-t border-dotted border-gray-400">
                <span>Diferencia:</span>
                <span
                  className={
                    datos.diferencia === 0
                      ? 'text-emerald-700'
                      : datos.diferencia > 0
                      ? 'text-blue-700'
                      : 'text-red-700'
                  }
                >
                  {datos.diferencia === 0
                    ? '$0 (Exacto)'
                    : datos.diferencia > 0
                    ? `+${formatPrecio(datos.diferencia)} (Sobrante)`
                    : `${formatPrecio(datos.diferencia)} (Faltante)`}
                </span>
              </div>
            </div>

            {/* Firmas */}
            <div className="pt-8 text-center text-[10px] text-gray-600 space-y-4">
              <div>
                <p className="border-t border-gray-400 w-3/4 mx-auto pt-1">Firma Cajero / Turno</p>
              </div>
              <div>
                <p className="border-t border-gray-400 w-3/4 mx-auto pt-1">Firma Encargado / Dueño</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Los estilos de impresión se inyectan en el <head> mediante useEffect (BUG-08) */}
    </Modal>
  )
}
