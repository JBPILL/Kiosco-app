import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useCartStore } from '../../stores/cartStore'
import { formatPrecio } from '../../lib/utils'
import toast from 'react-hot-toast'

interface ArticuloLibreModalProps {
  isOpen: boolean
  onClose: () => void
}

const MONTOS_RAPIDOS = [1000, 2000, 5000, 10000, 20000, 50000]

export function ArticuloLibreModal({ isOpen, onClose }: ArticuloLibreModalProps) {
  const { agregarItemLibre } = useCartStore()
  const [descripcion, setDescripcion] = useState('Varios')
  const [precio, setPrecio] = useState('')
  const [cantidad, setCantidad] = useState('1')

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
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Agregá un concepto rápido al ticket sin necesidad de crearlo previamente en el catálogo.
        </p>

        <div>
          <Input
            label="Concepto o descripción *"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
            placeholder="Ej: Fotocopias, Hielo, Varios..."
            required
            autoFocus
          />
        </div>

        <div>
          <Input
            label="Precio unitario en pesos ($) *"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={precio}
            onChange={(e) => setPrecio(e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="Ingresá el importe (ej: 500)"
            required
          />

          {/* Botones de montos rápidos / billetes (mismo diseño que Retiro de Efectivo) */}
          <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-2 w-full">
            {MONTOS_RAPIDOS.map((m) => {
              const estaSeleccionado = precioNum === m
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPrecio(m.toString())}
                  className={`w-full py-2.5 px-2 text-xs sm:text-sm font-bold rounded-xl border transition-all cursor-pointer text-center flex items-center justify-center min-h-[42px] select-none active:scale-95 ${
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

        <div className="w-1/2">
          <Input
            label="Cantidad"
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value.replace(/[^0-9]/g, '') || '1')}
          />
        </div>

        <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
          <Button type="button" variant="secondary" onClick={handleCerrar}>
            Cancelar
          </Button>
          <Button type="submit" variant="primary" className="bg-indigo-600 hover:bg-indigo-700 text-white">
            Agregar al Ticket
          </Button>
        </div>
      </form>
    </Modal>
  )
}
