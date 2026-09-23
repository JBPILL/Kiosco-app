import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useCajaStore } from '../../stores/cajaStore'
import { useAuthStore } from '../../stores/authStore'
import { formatPrecio } from '../../lib/utils'
import type { MotivoMovimientoCaja } from '../../types/database'
import toast from 'react-hot-toast'

interface RetiroCajaModalProps {
  isOpen: boolean
  onClose: () => void
}

const MOTIVOS_RETIRO: { valor: MotivoMovimientoCaja; label: string; desc: string }[] = [
  { valor: 'PROVEEDOR', label: 'Pago a Proveedor / Repartidor', desc: 'Mercadería, gaseosas, panadería, etc.' },
  { valor: 'GASTO_GENERAL', label: 'Gasto Menor / Insumos', desc: 'Bolsas, limpieza, librería, etc.' },
  { valor: 'RETIRO_DUENO', label: 'Retiro de Dueño / Seguridad', desc: 'Extracción periódica o sangría de caja' },
  { valor: 'OTRO', label: 'Otro Egreso', desc: 'Cualquier otra salida no contemplada' },
]

const MONTOS_RAPIDOS = [1000, 2000, 5000, 10000, 20000, 50000]

export function RetiroCajaModal({ isOpen, onClose }: RetiroCajaModalProps) {
  const { usuario } = useAuthStore()
  const {
    sesionActiva,
    resumenActivo,
    registrarMovimientoCaja,
    cargarResumenSesion,
    arqueoCiegoObligatorio,
  } = useCajaStore()

  const esDueno = usuario?.rol === 'DUEÑO'
  const modoCiego = !esDueno && arqueoCiegoObligatorio

  const [monto, setMonto] = useState('')
  const [motivo, setMotivo] = useState<MotivoMovimientoCaja>('PROVEEDOR')
  const [descripcion, setDescripcion] = useState('')
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (isOpen) {
      setMonto('')
      setMotivo('PROVEEDOR')
      setDescripcion('')
      if (sesionActiva?.id) {
        cargarResumenSesion(sesionActiva.id)
      }
    }
  }, [isOpen, sesionActiva?.id, cargarResumenSesion])

  const montoNum = parseFloat(monto) || 0
  const efectivoEnCaja = resumenActivo?.efectivo_esperado_en_caja ?? (sesionActiva?.monto_inicial || 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!sesionActiva) {
      toast.error('No hay una caja abierta para registrar el retiro')
      return
    }

    if (montoNum <= 0) {
      toast.error('Por favor ingresá un monto mayor a $0')
      return
    }

    if (montoNum > efectivoEnCaja) {
      toast.error(
        modoCiego
          ? 'El monto solicitado supera el efectivo disponible en caja'
          : `El monto supera el efectivo en caja (${formatPrecio(efectivoEnCaja)})`
      )
      return
    }

    setGuardando(true)
    try {
      const notaFinal = descripcion.trim()
        ? `${MOTIVOS_RETIRO.find((m) => m.valor === motivo)?.label}: ${descripcion.trim()}`
        : MOTIVOS_RETIRO.find((m) => m.valor === motivo)?.label || 'Retiro de mostrador'

      const ok = await registrarMovimientoCaja('EGRESO', motivo, montoNum, notaFinal)
      if (ok) {
        toast.success(`Retiro registrado: -${formatPrecio(montoNum)}`)
        onClose()
      }
    } catch (err: any) {
      toast.error(`Error al registrar retiro: ${err?.message || 'Error desconocido'}`)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Retiro de Efectivo / Sangría de Caja"
      size="md"
    >
      {!sesionActiva ? (
        <div className="text-center py-6 space-y-3">
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">
            No hay un turno de caja abierto actualmente.
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Para registrar egresos o pagos en efectivo, primero debés abrir el turno desde la sección Caja y Arqueo.
          </p>
          <Button type="button" variant="secondary" onClick={onClose}>
            Entendido
          </Button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Resumen de caja actual */}
          <div className="p-3 bg-gray-50/80 dark:bg-gray-800/60 rounded-xl border border-gray-300 dark:border-gray-700 flex justify-between items-center text-xs">
            <div>
              <span className="text-gray-500 dark:text-gray-400 block">Cajero en turno:</span>
              <span className="font-bold text-gray-900 dark:text-gray-100">
                {sesionActiva.usuario?.nombre || usuario?.nombre || 'Personal'}
              </span>
            </div>
            {!modoCiego ? (
              <div className="text-right">
                <span className="text-gray-500 dark:text-gray-400 block">Efectivo en cajón:</span>
                <span className="font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                  {formatPrecio(efectivoEnCaja)}
                </span>
              </div>
            ) : (
              <div className="text-right">
                <span className="text-gray-500 dark:text-gray-400 block">Control de turno:</span>
                <span className="text-[11px] font-semibold text-gray-500 dark:text-gray-400">
                  Arqueo Ciego
                </span>
              </div>
            )}
          </div>

          {/* Monto a extraer */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Monto a extraer del cajón *
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-gray-400">$</span>
              <input
                type="number"
                min="1"
                step="100"
                autoFocus
                value={monto}
                onChange={(e) => setMonto(e.target.value)}
                placeholder="0"
                className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-lg font-black tracking-tight focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-400"
                required
              />
            </div>

            {/* Botones de montos rápidos / billetes */}
            <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-1 w-full">
              {MONTOS_RAPIDOS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMonto(m.toString())}
                  className={`w-full py-2 px-2 text-xs sm:text-sm font-bold rounded-xl border transition-all cursor-pointer text-center flex items-center justify-center min-h-[42px] select-none active:scale-95 ${
                    montoNum === m
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 shadow-xs ring-1 ring-indigo-500/40'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                  }`}
                >
                  <span className="truncate">{formatPrecio(m)}</span>
                </button>
              ))}
            </div>

            {montoNum > efectivoEnCaja && (
              <div className="p-2.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-300 font-medium">
                {modoCiego
                  ? 'Atención: El monto a retirar supera el efectivo disponible en caja.'
                  : `Atención: El monto a retirar (${formatPrecio(montoNum)}) supera el efectivo disponible en caja (${formatPrecio(efectivoEnCaja)}).`}
              </div>
            )}
          </div>

          {/* Motivo de la salida */}
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
              Motivo del retiro *
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MOTIVOS_RETIRO.map((mot) => (
                <button
                  key={mot.valor}
                  type="button"
                  onClick={() => setMotivo(mot.valor)}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    motivo === mot.valor
                      ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-500/40 shadow-xs'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                  }`}
                >
                  <p className="text-xs font-bold">{mot.label}</p>
                  <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 leading-tight">{mot.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Descripción / Detalle / Factura */}
          <div className="space-y-1">
            <Input
              label="Detalle / Comprobante / Proveedor (opcional)"
              type="text"
              placeholder="Ej: Repartidor Coca-Cola, Factura N° 124, etc."
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
            />
          </div>

          {/* Botones inferiores */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-800">
            <Button
              type="button"
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={guardando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="md"
              loading={guardando}
              disabled={montoNum <= 0 || montoNum > efectivoEnCaja}
            >
              Confirmar Retiro
            </Button>
          </div>
        </form>
      )}
    </Modal>
  )
}
