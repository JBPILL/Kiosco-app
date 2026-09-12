import { useCartStore } from '../../stores/cartStore'
import { formatPrecio } from '../../lib/utils'
import { Button } from '../ui/Button'

interface CartPanelProps {
  onCobrar: () => void
}

export function CartPanel({ onCobrar }: CartPanelProps) {
  const { items, actualizarCantidad, quitarProducto, totalMonto, vaciarCarrito } = useCartStore()
  const total = totalMonto()

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
        <h2 className="font-semibold text-gray-900 dark:text-gray-100">Ticket</h2>
        {items.length > 0 && (
          <button
            onClick={vaciarCarrito}
            className="text-xs text-red-500 hover:text-red-700 dark:hover:text-red-400"
          >
            Vaciar
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <p className="text-lg font-medium mb-2">Sin productos</p>
            <p className="text-sm">Agregá productos para empezar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.producto.id} className="flex items-center gap-2 py-2 border-b border-gray-50 dark:border-gray-700">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {item.producto.descripcion}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatPrecio(item.producto.precio_venta)} c/u
                  </p>
                </div>

                {/* Controles de cantidad táctiles */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    onClick={() => actualizarCantidad(item.producto.id, item.cantidad - 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-90 text-gray-700 dark:text-gray-300 font-bold text-base transition-transform"
                    aria-label="Restar uno"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-sm font-bold dark:text-gray-100">{item.cantidad}</span>
                  <button
                    onClick={() => actualizarCantidad(item.producto.id, item.cantidad + 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-90 text-gray-700 dark:text-gray-300 font-bold text-base transition-transform"
                    aria-label="Sumar uno"
                  >
                    +
                  </button>
                </div>

                {/* Subtotal */}
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100 w-16 sm:w-20 text-right flex-shrink-0">
                  {formatPrecio(item.subtotal)}
                </span>

                {/* Eliminar */}
                <button
                  onClick={() => quitarProducto(item.producto.id)}
                  className="w-8 h-8 flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 active:scale-90 text-base flex-shrink-0 transition-transform"
                  aria-label="Eliminar producto"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer con total y botón cobrar */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100">TOTAL</span>
          <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{formatPrecio(total)}</span>
        </div>
        <Button
          size="lg"
          fullWidth
          variant="success"
          onClick={onCobrar}
          disabled={items.length === 0}
        >
          COBRAR {total > 0 ? formatPrecio(total) : ''}
        </Button>
      </div>
    </div>
  )
}
