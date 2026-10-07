import { useEffect, useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { useCartStore } from '../../stores/cartStore'
import { formatPrecio } from '../../lib/utils'
import toast from 'react-hot-toast'

interface ArticuloLibreModalProps {
  isOpen: boolean
  onClose: () => void
  descripcionInicial?: string
}

const MONTOS_RAPIDOS = [1000, 2000, 5000, 10000, 20000, 50000]

export function ArticuloLibreModal({ isOpen, onClose, descripcionInicial }: ArticuloLibreModalProps) {
  const { agregarItemLibre } = useCartStore()
  const [descripcion, setDescripcion] = useState('Varios')
  const [precio, setPrecio] = useState('')
  const [cantidad, setCantidad] = useState('1')

  // Cada acceso rápido abre un cobro nuevo con su concepto, sin conservar el anterior.
  useEffect(() => {
    if (isOpen) setDescripcion(descripcionInicial || 'Varios')
  }, [isOpen, descripcionInicial])

  const limpiar = () => {
    setDescripcion('Varios')
    setPrecio('')
    setCantidad('1')
  }

  const handleCerrar = () => {
    limpiar()
    onClose()
  }

  const precioNum = parseInt(precio.replace(/[^0-9]/g, ''), 10) || 0

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const desc = descripcion.trim() || 'Varios'
    const cantNum = parseInt(cantidad.replace(/[^0-9]/g, ''), 10) || 1

    if (precioNum <= 0) {
      toast.error('Ingresá un precio mayor a $0')
      return
    }

    agregarItemLibre(desc, precioNum, cantNum)
    handleCerrar()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleCerrar} title="Cobro de Artículo Libre / Varios" size="md">
      <form onSubmit={handleSubmit} className="space-y-4">

        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4 space-y-4 shadow-sm">

        {/* Concepto o descripción */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Concepto o descripción *
          </label>
          <input
            aria-label="Concepto o descripción"
            type="text"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Fotocopias, Hielo, Varios..."
            required
            autoFocus
            className="w-full px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-400"
          />
        </div>

        {/* Precio unitario con prefijo $ y fuente idéntica a Retiro de Efectivo */}
        <div className="space-y-2">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Precio unitario en pesos ($) *
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base font-bold text-gray-400">$</span>
            <input
              type="text"
              aria-label="Precio unitario en pesos"
              inputMode="numeric"
              pattern="[0-9]*"
              value={precio}
              onChange={(e) => setPrecio(e.target.value.replace(/[^0-9]/g, ''))}
              placeholder="0"
              required
              className="w-full pl-8 pr-4 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-lg font-black tracking-tight focus:ring-2 focus:ring-indigo-500 outline-none transition-all placeholder:text-gray-400"
            />
          </div>

          {/* Botones de montos rápidos idénticos a RetiroCajaModal */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-1 w-full">
            {MONTOS_RAPIDOS.map((m) => {
              const estaSeleccionado = precioNum === m
              return (
                <button
                  key={m}
                  type="button"
                  aria-pressed={estaSeleccionado}
                  onClick={() => setPrecio(m.toString())}
                  className={`w-full py-2 px-2 text-xs sm:text-sm font-bold rounded-xl border transition-all cursor-pointer text-center flex items-center justify-center min-h-[42px] select-none active:scale-95 ${
                    estaSeleccionado
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 shadow-xs ring-1 ring-indigo-500/40'
                      : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                  }`}
                >
                  <span className="truncate">{formatPrecio(m)}</span>
                </button>
              )
            })}
          </div>
        </div>

        </section>
        <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4 shadow-sm">
        {/* Cantidad con stepper amplio y números nítidos */}
        <div className="space-y-1.5">
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
            Cantidad de unidades
          </label>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setCantidad(String(Math.max(1, (parseInt(cantidad) || 1) - 1)))}
              className="w-9 h-9 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-black text-lg flex items-center justify-center cursor-pointer transition-transform active:scale-95 select-none"
            >
              -
            </button>
            <input
              type="number"
              aria-label="Cantidad de unidades"
              min="1"
              value={cantidad}
              onChange={(e) => setCantidad(e.target.value.replace(/[^0-9]/g, '') || '1')}
              className="w-20 text-center py-1.5 font-black text-base rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 focus:border-indigo-500 outline-none shadow-2xs"
            />
            <button
              type="button"
              onClick={() => setCantidad(String((parseInt(cantidad) || 1) + 1))}
              className="w-9 h-9 rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-800 dark:text-gray-200 font-black text-lg flex items-center justify-center cursor-pointer transition-transform active:scale-95 select-none"
            >
              +
            </button>
          </div>
        </div>

        </section>
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/30 p-4 shadow-sm">
          <div><p className="text-sm font-bold text-emerald-800 dark:text-emerald-300">Total a agregar al ticket</p><p className="mt-1 text-xs text-emerald-700 dark:text-emerald-400">{parseInt(cantidad.replace(/[^0-9]/g, ''), 10) || 1} unidad(es) × {formatPrecio(precioNum)}</p></div>
          <output aria-live="polite" className="text-xl font-extrabold tabular-nums text-emerald-700 dark:text-emerald-300">{formatPrecio(precioNum * (parseInt(cantidad.replace(/[^0-9]/g, ''), 10) || 1))}</output>
        </div>
        {/* Botones de acción consistentes */}
        <div className="flex flex-col sm:flex-row gap-2.5 pt-3 border-t border-gray-200 dark:border-gray-700">
          <Button
            type="button"
            variant="secondary"
            onClick={handleCerrar}
            className="order-2 sm:order-1 sm:w-1/3 py-2.5 text-sm font-semibold"
          >
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="primary"
            className="order-1 sm:order-2 sm:w-2/3 py-2.5 text-sm font-bold shadow-md"
          >
            Agregar al Ticket
          </Button>
        </div>
      </form>
    </Modal>
  )
}
