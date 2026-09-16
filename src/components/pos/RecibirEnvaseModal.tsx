import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useCartStore } from '../../stores/cartStore'
import { useCajaStore } from '../../stores/cajaStore'
import { formatPrecio } from '../../lib/utils'
import toast from 'react-hot-toast'

interface RecibirEnvaseModalProps {
  isOpen: boolean
  onClose: () => void
}

interface EnvasePredefinido {
  nombre: string
  precio: number
}

const ENVASES_PREDEFINIDOS: EnvasePredefinido[] = [
  { nombre: 'Cerveza 1L Vidrio', precio: 1500 },
  { nombre: 'Gaseosa 1.25L / 1.5L Vidrio', precio: 1500 },
  { nombre: 'Gaseosa 2L / 2.25L Retornable', precio: 2000 },
  { nombre: 'Sifón de soda', precio: 2500 },
]

export function RecibirEnvaseModal({ isOpen, onClose }: RecibirEnvaseModalProps) {
  const { agregarDevolucionEnvase } = useCartStore()
  const { sesionActiva, registrarMovimientoCaja } = useCajaStore()

  const [nombreEnvase, setNombreEnvase] = useState('Cerveza 1L Vidrio')
  const [precioUnitario, setPrecioUnitario] = useState('1500')
  const [cantidad, setCantidad] = useState('1')
  const [procesando, setProcesando] = useState(false)

  const cantNum = Math.max(1, parseInt(cantidad.replace(/[^0-9]/g, ''), 10) || 1)
  const precioNum = Math.max(0, parseFloat(precioUnitario.replace(/[^0-9.]/g, '')) || 0)
  const totalReconocimiento = cantNum * precioNum

  const handleSeleccionarPredefinido = (env: EnvasePredefinido) => {
    setNombreEnvase(env.nombre)
    setPrecioUnitario(env.precio.toString())
  }

  const handleCerrar = () => {
    setNombreEnvase('Cerveza 1L Vidrio')
    setPrecioUnitario('1500')
    setCantidad('1')
    setProcesando(false)
    onClose()
  }

  // Opción 1: Sumar crédito a favor en el ticket actual
  const handleAgregarAlTicket = (e: React.FormEvent) => {
    e.preventDefault()
    if (precioNum <= 0) {
      toast.error('Ingresá un valor válido para el envase')
      return
    }

    agregarDevolucionEnvase(nombreEnvase.trim() || 'Envase retornable', precioNum, cantNum)
    handleCerrar()
  }

  // Opción 2: Pagar en efectivo desde la caja registradora
  const handlePagarEfectivo = async () => {
    if (precioNum <= 0) {
      toast.error('Ingresá un valor válido para el envase')
      return
    }

    if (!sesionActiva) {
      toast.error('No hay una caja abierta para registrar el egreso de efectivo. Agregalo al ticket o abrí turno de caja.')
      return
    }

    setProcesando(true)
    try {
      const ok = await registrarMovimientoCaja(
        'EGRESO',
        'DEVOLUCION_VENTA',
        totalReconocimiento,
        `Recepción de envases: ${cantNum}x ${nombreEnvase.trim() || 'Envases retornables'}`
      )

      if (ok) {
        toast.success(`Efectivo entregado al cliente: ${formatPrecio(totalReconocimiento)}`)
        handleCerrar()
      }
    } catch {
      toast.error('Error al registrar salida de dinero en caja')
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={handleCerrar} title="Recibir Envases Retornables" size="md">
      <div className="space-y-4">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Registrá envases vacíos entregados por el cliente para descontar del ticket o abonar en efectivo.
        </p>

        {/* Accesos rápidos de envases habituales */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Tipos de envases frecuentes:
          </label>
          <div className="grid grid-cols-2 gap-2">
            {ENVASES_PREDEFINIDOS.map((env) => {
              const seleccionado = nombreEnvase === env.nombre && precioNum === env.precio
              return (
                <button
                  key={env.nombre}
                  type="button"
                  onClick={() => handleSeleccionarPredefinido(env)}
                  className={`p-2 rounded-lg text-left border transition-all text-xs cursor-pointer ${
                    seleccionado
                      ? 'border-indigo-500 bg-indigo-50/70 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-semibold'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <p className="font-medium truncate">{env.nombre}</p>
                  <p className="text-gray-500 dark:text-gray-400 font-mono mt-0.5">{formatPrecio(env.precio)}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Datos del envase */}
        <div className="space-y-3">
          <Input
            label="Descripción o tipo de envase *"
            value={nombreEnvase}
            onChange={(e) => setNombreEnvase(e.target.value)}
            placeholder="Ej: Cerveza 1L Vidrio"
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Input
                label="Precio unitario ($) *"
                type="number"
                min="0"
                step="50"
                value={precioUnitario}
                onChange={(e) => setPrecioUnitario(e.target.value)}
                placeholder="1500"
                required
              />
            </div>
            <div>
              <Input
                label="Cantidad de envases *"
                type="number"
                min="1"
                step="1"
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                required
              />
            </div>
          </div>
        </div>

        {/* Resumen total a devolver */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
              Total a reconocer al cliente:
            </span>
            <span className="text-[11px] text-gray-500 dark:text-gray-400">
              {cantNum} {cantNum === 1 ? 'unidad' : 'unidades'} x {formatPrecio(precioNum)}
            </span>
          </div>
          <span className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatPrecio(totalReconocimiento)}
          </span>
        </div>

        {/* Acciones */}
        <div className="space-y-2 pt-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={handleAgregarAlTicket}
              fullWidth
              disabled={procesando || precioNum <= 0}
            >
              Descontar en ticket actual
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handlePagarEfectivo}
              fullWidth
              loading={procesando}
              disabled={precioNum <= 0}
              className="border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
            >
              Pagar en efectivo de caja
            </Button>
          </div>
          <Button type="button" variant="secondary" onClick={handleCerrar} fullWidth>
            Cancelar
          </Button>
        </div>
      </div>
    </Modal>
  )
}
