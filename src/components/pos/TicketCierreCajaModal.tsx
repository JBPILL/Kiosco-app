import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatPrecio, formatFecha } from '../../lib/utils'
import { isWebSerialSupported, imprimirCierreCajaEscPosDirecto } from '../../lib/escposPrinter'
import { useAuthStore } from '../../stores/authStore'
import { getWhatsAppReportConfig, formatearAvisoCierreWhatsAppPDF } from '../../lib/whatsappReport'
import { exportarComprobanteCierrePDF, compartirComprobanteCierreWhatsApp } from '../../lib/pdfCierreUtils'
import { getAnchoTicketGuardado, guardarAnchoTicket, type AnchoPapelTicket } from '../../lib/ticketPreferences'
import { BarcodeSvg } from '../../lib/barcodeSvg'
import toast from 'react-hot-toast'

export interface DatosCierreCaja {
  sesionId?: string
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
  // Inicialización síncrona con el ancho térmico guardado en el sistema (evita saltos o renders en 80mm)
  const [anchoPapel, setAnchoPapel] = useState<AnchoPapelTicket>(getAnchoTicketGuardado)
  const [imprimiendoSerial, setImprimiendoSerial] = useState(false)
  const [enviandoWhatsApp, setEnviandoWhatsApp] = useState(false)
  const [generandoPdf, setGenerandoPdf] = useState(false)
  const [copiandoTexto, setCopiandoTexto] = useState(false)

  // Sincronizar en tiempo real si el ancho cambia en otra ventana o al abrir el modal
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

  const cambiarAnchoPapel = (ancho: AnchoPapelTicket) => {
    setAnchoPapel(ancho)
    guardarAnchoTicket(ancho)
  }

  if (!datos) return null

  const handleImprimir = () => {
    try {
      window.print()
    } catch (e: any) {
      console.warn('Error al ejecutar window.print():', e)
      toast.error('No se pudo abrir la impresión: ' + (e?.message || 'Error'))
    }
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

  const handleEnviarPDFWhatsApp = async () => {
    if (!datos) return
    setEnviandoWhatsApp(true)
    try {
      const kioscoId = useAuthStore.getState().usuario?.kiosco_id || useAuthStore.getState().kiosco?.id
      const config = getWhatsAppReportConfig(kioscoId)
      await compartirComprobanteCierreWhatsApp(datos, config.whatsappDueno, anchoPapel)
    } catch (e: any) {
      toast.error('Error al procesar el envío de WhatsApp: ' + (e?.message || 'Error'))
    } finally {
      setEnviandoWhatsApp(false)
    }
  }

  const handleExportarPDF = () => {
    if (!datos) return
    setGenerandoPdf(true)
    try {
      const ok = exportarComprobanteCierrePDF(datos, anchoPapel)
      if (ok) {
        toast.success(`Comprobante PDF (${anchoPapel}) descargado`)
      } else {
        toast.error('Error al generar el comprobante PDF')
      }
    } catch (e: any) {
      toast.error('Error al generar PDF: ' + (e?.message || 'Error'))
    } finally {
      setGenerandoPdf(false)
    }
  }

  const handleCopiarResumen = async () => {
    if (!datos) return
    setCopiandoTexto(true)
    try {
      const texto = formatearAvisoCierreWhatsAppPDF(datos)
      await navigator.clipboard.writeText(texto)
      toast.success('Resumen oficial copiado al portapapeles')
    } catch {
      toast.error('No se pudo copiar automáticamente')
    } finally {
      setTimeout(() => setCopiandoTexto(false), 2000)
    }
  }

  const ventasSeguras = datos.ventasPorMedio || []
  const ingresosExtra = datos.ingresosExtra || 0
  const egresosExtra = datos.egresosExtra || 0
  const totalVentas = datos.totalVentas || 0
  const cantidadVentas = datos.cantidadVentas || 0
  const efectivoEsperado = datos.efectivoEsperado || 0
  const efectivoContado = datos.efectivoContado || 0
  const diferencia = datos.diferencia || 0

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={datos.esParcial ? 'Ticket de Arqueo Parcial (X)' : 'Ticket de Cierre de Caja (Arqueo Z)'}
      size="md"
      footer={
        <div className="w-full space-y-2">
          {/* Fila 1: Resguardo en PDF y Envío a WhatsApp */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleEnviarPDFWhatsApp}
              loading={enviandoWhatsApp}
              disabled={enviandoWhatsApp}
              className="w-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs flex items-center justify-center gap-1.5"
              title="Descarga el comprobante PDF y abre WhatsApp listo para enviarlo"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z" />
              </svg>
              <span>{enviandoWhatsApp ? 'Procesando...' : 'Enviar PDF a WhatsApp'}</span>
            </Button>

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleExportarPDF}
              loading={generandoPdf}
              disabled={generandoPdf}
              className="w-full text-xs font-semibold shadow-xs"
              title="Descargar comprobante en formato PDF"
            >
              <span>{generandoPdf ? 'Generando PDF...' : 'Descargar PDF'}</span>
            </Button>
          </div>

          {/* Fila 2: Impresión Física e Impresora Térmica */}
          <div className={isWebSerialSupported() ? 'grid grid-cols-1 sm:grid-cols-3 gap-2' : 'grid grid-cols-1 sm:grid-cols-2 gap-2'}>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleImprimir}
              className="w-full text-xs font-semibold shadow-xs"
              title="Abrir ventana de impresión del sistema"
            >
              <span>Imprimir Ticket</span>
            </Button>

            {isWebSerialSupported() && (
              <Button
                variant="warning"
                size="sm"
                onClick={handleImprimirEscPos}
                loading={imprimiendoSerial}
                disabled={imprimiendoSerial}
                className="w-full text-xs font-semibold shadow-xs"
                title="Impresión térmica directa por cable USB/COM sin ventana de diálogo"
              >
                <span>{imprimiendoSerial ? 'Imprimiendo...' : 'Ticket USB'}</span>
              </Button>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleCopiarResumen}
              className="w-full text-xs font-semibold shadow-xs"
              title="Copiar resumen del arqueo al portapapeles"
            >
              <span>{copiandoTexto ? 'Copiado' : 'Copiar Resumen'}</span>
            </Button>
          </div>

          <Button variant="secondary" size="sm" fullWidth onClick={onClose}>
            Cerrar
          </Button>
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

        {/* Vista previa del ticket estilo papel térmico continuo (idéntica a TicketReceiptModal) */}
        <div className="relative w-full rounded-2xl border border-gray-200/80 dark:border-gray-800 bg-gray-100/90 dark:bg-gray-900/80 overflow-hidden shadow-inner">
          <div className="w-full overflow-y-auto max-h-[min(56vh,480px)] p-3 sm:p-5 select-text">
            <div
              id="printable-cierre"
              className={`mx-auto bg-white text-gray-950 p-4 sm:p-5 pb-6 rounded-xl shadow-md border border-gray-200/90 font-mono text-xs leading-tight transition-all select-text block ${
                anchoPapel === '58mm' ? 'w-[270px]' : 'w-[350px]'
              }`}
            >
              {/* Encabezado */}
              <div className="text-center space-y-0.5 pb-2.5 border-b border-dashed border-gray-400">
                <p className="font-bold text-sm tracking-wide uppercase">
                  {datos.kioscoNombre || 'KIOSKOPOS'}
                </p>
                {datos.kioscoDireccion && (
                  <p className="text-[11px] text-gray-600">{datos.kioscoDireccion}</p>
                )}
                {datos.kioscoTelefono && (
                  <p className="text-[11px] text-gray-600">Tel: {datos.kioscoTelefono}</p>
                )}
                <div className="pt-1.5">
                  <p className="font-bold text-[11px] uppercase tracking-wider bg-gray-100 py-0.5 rounded border border-gray-200">
                    *** {datos.esParcial ? 'ARQUEO PARCIAL (X)' : 'CIERRE DE CAJA (ARQUEO Z)'} ***
                  </p>
                </div>
                <div className="text-[10px] text-gray-700 text-left pt-2 space-y-0.5 border-t border-dotted border-gray-300 mt-2">
                  <p>Fecha Emisión: {formatFecha(datos.fechaCierre)}</p>
                  <p>Apertura:      {formatFecha(datos.fechaApertura)}</p>
                  {datos.cajeroNombre && <p>Cajero:        {datos.cajeroNombre}</p>}
                </div>
              </div>

              {/* Fondo Inicial */}
              <div className="py-2.5 border-b border-dashed border-gray-300 flex justify-between font-semibold text-[11px]">
                <span>Fondo Inicial de Caja:</span>
                <span>{formatPrecio(datos.montoInicial || 0)}</span>
              </div>

              {/* Ventas por Medio de Pago */}
              <div className="py-2.5 border-b border-dashed border-gray-300 space-y-1">
                <div className="flex justify-between font-bold text-[10px] uppercase text-gray-500 pb-0.5">
                  <span>Medio de Pago</span>
                  <span>Subtotal</span>
                </div>
                {ventasSeguras.length === 0 ? (
                  <p className="text-gray-500 text-[10px] py-1">Sin ventas registradas en el turno</p>
                ) : (
                  ventasSeguras.map((m) => (
                    <div key={m.medio} className="flex justify-between text-[11px]">
                      <span className="truncate max-w-[170px]">
                        • {m.medio}{m.cantidad ? ` (${m.cantidad} op.)` : ''}:
                      </span>
                      <span className="font-semibold">{formatPrecio(m.total || 0)}</span>
                    </div>
                  ))
                )}
                <div className="flex justify-between items-baseline text-[11px] font-bold pt-1.5 border-t border-dotted border-gray-300 mt-1">
                  <span className="truncate pr-2">TOTAL FACTURADO{cantidadVentas ? ` (${cantidadVentas} op.)` : ''}:</span>
                  <span className="whitespace-nowrap">{formatPrecio(totalVentas)}</span>
                </div>
              </div>

              {/* Movimientos de Efectivo en Turno */}
              {(ingresosExtra > 0 || egresosExtra > 0) && (
                <div className="py-2.5 border-b border-dashed border-gray-300 space-y-1 text-[11px]">
                  <p className="font-bold text-[10px] uppercase text-gray-500 pb-0.5">MOVIMIENTOS DE CAJA:</p>
                  {ingresosExtra > 0 && (
                    <div className="flex justify-between text-emerald-700">
                      <span>(+) Ingresos Extra:</span>
                      <span className="font-semibold">+{formatPrecio(ingresosExtra)}</span>
                    </div>
                  )}
                  {egresosExtra > 0 && (
                    <div className="flex justify-between text-red-700">
                      <span>(-) Retiros / Gastos:</span>
                      <span className="font-semibold">-{formatPrecio(egresosExtra)}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Balance de Arqueo */}
              <div className="py-2.5 border-b border-dashed border-gray-400 space-y-1 text-[11px]">
                <p className="font-bold text-[10px] uppercase text-gray-500 pb-0.5">CONTROL DE ARQUEO:</p>
                <div className="flex justify-between text-gray-700">
                  <span>Efectivo esperado en caja:</span>
                  <span className="font-bold">{formatPrecio(efectivoEsperado)}</span>
                </div>
                <div className="flex justify-between text-gray-700">
                  <span>Efectivo contado físico:</span>
                  <span className="font-bold">{formatPrecio(efectivoContado)}</span>
                </div>
                <div className="flex justify-between items-baseline text-[11px] font-bold pt-1.5 border-t border-dotted border-gray-400 mt-1">
                  <span>Diferencia:</span>
                  <span
                    className={`whitespace-nowrap ${
                      Math.abs(diferencia) < 0.01
                        ? 'text-emerald-700'
                        : diferencia > 0
                        ? 'text-blue-700'
                        : 'text-red-700'
                    }`}
                  >
                    {Math.abs(diferencia) < 0.01
                      ? '$0 (Exacto)'
                      : diferencia > 0
                      ? `+${formatPrecio(diferencia)} (Sobrante)`
                      : `${formatPrecio(diferencia)} (Faltante)`}
                  </span>
                </div>
              </div>

              {/* Firmas de Control */}
              <div className="pt-8 text-center text-[10px] text-gray-600 space-y-4">
                <div>
                  <p className="border-t border-gray-400 w-3/4 mx-auto pt-1 font-sans">Firma Cajero / Responsable</p>
                </div>
                <div>
                  <p className="border-t border-gray-400 w-3/4 mx-auto pt-1 font-sans">Firma Encargado / Auditor</p>
                </div>
              </div>

              {/* Pie de ticket */}
              <div className="pt-3 text-center text-[10px] text-gray-500 space-y-0.5 border-t border-dashed border-gray-300 mt-4">
                {/* Código de barras del turno para auditoría y lector */}
                {datos.sesionId && (
                  <div className="pt-1 pb-1.5 flex flex-col items-center">
                    <BarcodeSvg
                      value={`${datos.esParcial ? 'X' : 'Z'}-${datos.sesionId.slice(0, 8).toUpperCase()}`}
                      height={36}
                      showText={true}
                      textLabel={`* ${datos.esParcial ? 'X' : 'Z'}-${datos.sesionId.slice(0, 8).toUpperCase()} *`}
                      className="w-full max-w-[210px]"
                    />
                  </div>
                )}
                <p className="font-semibold text-gray-700">Comprobante Oficial de Auditoría y Cierre</p>
                <p>Sistema AlPaso Kiosco POS</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Estilos aislados para impresión térmica de forma declarativa y segura en React */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #printable-cierre, #printable-cierre * {
            visibility: visible !important;
          }
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
      `}</style>
    </Modal>
  )
}
