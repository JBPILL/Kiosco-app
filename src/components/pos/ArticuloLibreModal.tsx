import { useState } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { useCartStore } from '../../stores/cartStore'
import toast from 'react-hot-toast'

interface ArticuloLibreModalProps {
  isOpen: boolean
  onClose: () => void
}

export function ArticuloLibreModal({ isOpen, onClose }: ArticuloLibreModalProps) {
  const { agregarItemLibre } = useCartStore()
  const [descripcion, setDescripcion] = useState('Varios')
  const [precio, setPrecio] = useState('')
  const [cantidad, setCantidad] = useState('1')

  const montosRapidos = [100, 200, 500, 1000, 2000, 5000]

  const limpiar = () => {
    setDescripcion('Varios')
    setPrecio('')
    setCantidad('1')
  }

  const handleCerrar = () => {
    limpiar()
    onClose()
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const desc = descripcion.trim() || 'Varios'
    const precioNum = parseInt(precio.replace(/[^0-9]/g, ''), 10) || 0
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

          {/* Botones de montos rápidos */}
          <div className="flex flex-wrap gap-1.5 mt-2">
            {montosRapidos.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setPrecio(m.toString())}
                className="px-2.5 py-1 text-xs font-semibold rounded-md border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-indigo-500 hover:text-indigo-600 active:scale-95 transition-all"
              >
                ${m.toLocaleString('es-AR')}
              </button>
            ))}
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
