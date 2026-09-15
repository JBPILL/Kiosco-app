import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { formatPrecio, formatFecha } from '../../lib/utils'

export interface DatosCierreCaja {
  kioscoNombre?: string
  cajeroNombre?: string
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
}

interface TicketCierreCajaModalProps {
  isOpen: boolean
  onClose: () => void
  datos: DatosCierreCaja | null
}

export function TicketCierreCajaModal({ isOpen, onClose, datos }: TicketCierreCajaModalProps) {
  const [anchoPapel, setAnchoPapel] = useState<'58mm' | '80mm'>('58mm')

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('kioskopos_ancho_ticket')
      if (saved === '58mm' || saved === '80mm') setAnchoPapel(saved)
    }
  }, [isOpen])

  if (!datos) return null

  const handleImprimir = () => {
    window.print()
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ticket de Cierre de Caja (Arqueo Z)" size="md">
      <div className="space-y-4">
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
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
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
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all ${
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
        <div className="flex justify-center p-3 bg-gray-100 dark:bg-gray-900/60 rounded-xl overflow-x-auto">
          <div
            id="printable-cierre"
            className={`bg-white text-gray-950 p-4 rounded shadow-sm font-mono text-xs leading-tight select-text ${
              anchoPapel === '58mm' ? 'w-[260px]' : 'w-[340px]'
            }`}
          >
            {/* Encabezado */}
            <div className="text-center space-y-1 pb-2 border-b border-dashed border-gray-400">
              <p className="font-bold text-sm tracking-wide uppercase">
                {datos.kioscoNombre || 'KIOSKOPOS'}
              </p>
              <p className="font-bold text-[11px] uppercase tracking-wider bg-gray-100 py-0.5 rounded">
                *** CIERRE DE CAJA (ARQUEO) ***
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

        {/* Botones de acción */}
        <div className="flex gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
          <Button variant="primary" fullWidth onClick={handleImprimir} className="bg-indigo-600 hover:bg-indigo-700 text-white">
            Imprimir Arqueo
          </Button>
          <Button variant="secondary" fullWidth onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </div>

      {/* Estilos aislados para impresión térmica del arqueo */}
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
