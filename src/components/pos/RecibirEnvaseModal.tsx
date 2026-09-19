import { useState, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useCartStore } from '../../stores/cartStore'
import { useCajaStore } from '../../stores/cajaStore'
import { useAuthStore } from '../../stores/authStore'
import { useEnvasesStore, type TipoEnvase } from '../../stores/envasesStore'
import { formatPrecio } from '../../lib/utils'
import toast from 'react-hot-toast'

interface RecibirEnvaseModalProps {
  isOpen: boolean
  onClose: () => void
}

export function RecibirEnvaseModal({ isOpen, onClose }: RecibirEnvaseModalProps) {
  const { agregarDevolucionEnvase } = useCartStore()
  const { sesionActiva, registrarMovimientoCaja } = useCajaStore()
  const { usuario } = useAuthStore()
  const { tiposEnvases, cargarTiposEnvases, ajustarStockVacios } = useEnvasesStore()

  const [tipoSeleccionado, setTipoSeleccionado] = useState<TipoEnvase | null>(null)
  const [cantidad, setCantidad] = useState<number>(1)
  const [procesando, setProcesando] = useState(false)

  // Cargar tipos al abrir y seleccionar el primero por defecto
  useEffect(() => {
    if (isOpen) {
      cargarTiposEnvases(usuario?.kiosco_id || undefined)
    }
  }, [isOpen, usuario?.kiosco_id, cargarTiposEnvases])

  useEffect(() => {
    if (tiposEnvases.length > 0 && !tipoSeleccionado) {
      setTipoSeleccionado(tiposEnvases[0])
    }
  }, [tiposEnvases, tipoSeleccionado])

  const precioUnitario = tipoSeleccionado?.precio || 0
  const totalReconocimiento = Math.max(1, cantidad) * precioUnitario

  const handleCerrar = () => {
    setCantidad(1)
    setProcesando(false)
    onClose()
  }

  const handleCambiarCantidad = (delta: number) => {
    setCantidad((prev) => Math.max(1, prev + delta))
  }

  // Opción 1: Sumar crédito a favor en el ticket actual
  const handleAgregarAlTicket = (e: React.FormEvent) => {
    e.preventDefault()
    if (!tipoSeleccionado || precioUnitario <= 0) {
      toast.error('Seleccioná un tipo de envase con precio configurado')
      return
    }

    const cant = Math.max(1, cantidad)
    agregarDevolucionEnvase(
      tipoSeleccionado.nombre,
      precioUnitario,
      cant
    )
    ajustarStockVacios(
      tipoSeleccionado.id,
      cant,
      'INGRESO_MOSTRADOR',
      usuario?.kiosco_id || undefined,
      usuario?.nombre || undefined,
      `Recepción ticket (+${cant} ${tipoSeleccionado.nombre})`
    )
    toast.success(`Envase ${tipoSeleccionado.nombre} agregado al ticket (+${cant} al depósito de vacíos)`)
    handleCerrar()
  }

  // Opción 2: Pagar en efectivo desde la caja registradora
  const handlePagarEfectivo = async () => {
    if (!tipoSeleccionado || precioUnitario <= 0) {
      toast.error('Seleccioná un tipo de envase con precio configurado')
      return
    }

    if (!sesionActiva) {
      toast.error('No hay una caja abierta para egresar efectivo. Agregalo al ticket o abrí turno de caja.')
      return
    }

    setProcesando(true)
    try {
      const cant = Math.max(1, cantidad)
      const ok = await registrarMovimientoCaja(
        'EGRESO',
        'DEVOLUCION_VENTA',
        totalReconocimiento,
        `Recepción de envases: ${cant}x ${tipoSeleccionado.nombre}`
      )

      if (ok) {
        ajustarStockVacios(
          tipoSeleccionado.id,
          cant,
          'INGRESO_MOSTRADOR',
          usuario?.kiosco_id || undefined,
          usuario?.nombre || undefined,
          `Recepción en efectivo (+${cant} ${tipoSeleccionado.nombre})`
        )
        toast.success(`Efectivo entregado: ${formatPrecio(totalReconocimiento)} (+${cant} al depósito)`)
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
          Seleccioná el tipo de envase y la cantidad devuelta para descontar del ticket o abonar en efectivo al cliente.
        </p>

        {/* Tipos de envases predefinidos (Precios Fijos) */}
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            Tipo de envase:
          </label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tiposEnvases.map((env) => {
              const seleccionado = tipoSeleccionado?.id === env.id
              return (
                <button
                  key={env.id}
                  type="button"
                  onClick={() => setTipoSeleccionado(env)}
                  className={`p-2.5 rounded-xl text-left border transition-all cursor-pointer ${
                    seleccionado
                      ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 ring-2 ring-indigo-500 shadow-xs'
                      : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                  }`}
                >
                  <p className="font-bold text-xs truncate">{env.nombre}</p>
                  <p className="text-indigo-600 dark:text-indigo-400 font-bold font-mono text-sm mt-0.5">
                    {formatPrecio(env.precio)}
                  </p>
                  {env.descripcion && (
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate mt-0.5">
                      {env.descripcion}
                    </p>
                  )}
                </button>
              )
            })}
          </div>
        </div>

        {/* Panel de Precio Fijo y Cantidad Ajustable */}
        <div className="p-3.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
          <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-2.5">
            <div>
              <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block">
                Precio unitario asignado:
              </span>
              <span className="text-[11px] text-gray-400">
                Valor fijo para {tipoSeleccionado?.nombre || 'este envase'}
              </span>
            </div>
            <span className="text-base font-bold font-mono text-gray-900 dark:text-gray-100">
              {formatPrecio(precioUnitario)}
            </span>
          </div>

          {/* Selector de cantidad con stepper y atajos rápidos */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
              Cantidad de envases:
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleCambiarCantidad(-1)}
                disabled={cantidad <= 1}
                className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95"
              >
                -
              </button>

              <input
                type="number"
                min="1"
                step="1"
                value={cantidad || ''}
                onChange={(e) => {
                  const val = parseInt(e.target.value.replace(/[^0-9]/g, ''), 10)
                  setCantidad(isNaN(val) ? 1 : Math.max(1, val))
                }}
                className="flex-1 h-10 text-center text-lg font-bold font-mono rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-indigo-500"
              />

              <button
                type="button"
                onClick={() => handleCambiarCantidad(1)}
                className="w-10 h-10 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold text-lg flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 transition-all active:scale-95"
              >
                +
              </button>
            </div>

            {/* Accesos rápidos a cantidades habituales */}
            <div className="flex gap-1.5 mt-2">
              {[1, 2, 3, 4, 5, 6].map((q) => (
                <button
                  key={q}
                  type="button"
                  onClick={() => setCantidad(q)}
                  className={`flex-1 py-1 text-xs font-semibold rounded-md border transition-all ${
                    cantidad === q
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Resumen total a devolver */}
        <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex items-center justify-between">
          <div>
            <span className="text-xs font-bold text-emerald-900 dark:text-emerald-200 block">
              Total a reconocer al cliente:
            </span>
            <span className="text-[11px] text-emerald-700 dark:text-emerald-300">
              {cantidad} {cantidad === 1 ? 'unidad' : 'unidades'} x {formatPrecio(precioUnitario)}
            </span>
          </div>
          <span className="text-xl font-black font-mono text-emerald-700 dark:text-emerald-300">
            {formatPrecio(totalReconocimiento)}
          </span>
        </div>

        {/* Acciones */}
        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              type="button"
              onClick={handleAgregarAlTicket}
              fullWidth
              disabled={procesando || precioUnitario <= 0}
            >
              Descontar en ticket actual
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handlePagarEfectivo}
              fullWidth
              loading={procesando}
              disabled={precioUnitario <= 0}
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
