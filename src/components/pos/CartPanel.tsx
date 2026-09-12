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
    <div className="flex flex-col h-full bg-white rounded-xl border border-gray-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
        <h2 className="font-semibold text-gray-900">🛒 Ticket</h2>
        {items.length > 0 && (
          <button
            onClick={vaciarCarrito}
            className="text-xs text-red-500 hover:text-red-700"
          >
            Vaciar
          </button>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-400">
            <p className="text-3xl mb-2">🛒</p>
            <p className="text-sm">Agregá productos para empezar</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div key={item.producto.id} className="flex items-center gap-2 py-2 border-b border-gray-50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {item.producto.descripcion}
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatPrecio(item.producto.precio_venta)} c/u
                  </p>
                </div>

                {/* Controles de cantidad */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => actualizarCantidad(item.producto.id, item.cantidad - 1)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-sm font-medium">{item.cantidad}</span>
                  <button
                    onClick={() => actualizarCantidad(item.producto.id, item.cantidad + 1)}
                    className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold text-sm"
                  >
                    +
                  </button>
                </div>

                {/* Subtotal */}
                <span className="text-sm font-bold text-gray-900 w-20 text-right">
                  {formatPrecio(item.subtotal)}
                </span>

                {/* Eliminar */}
                <button
                  onClick={() => quitarProducto(item.producto.id)}
                  className="text-gray-400 hover:text-red-500 text-sm"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer con total y botón cobrar */}
      <div className="border-t border-gray-200 px-4 py-3 space-y-3">
        <div className="flex justify-between items-center">
          <span className="text-lg font-bold text-gray-900">TOTAL</span>
          <span className="text-2xl font-bold text-indigo-600">{formatPrecio(total)}</span>
        </div>
        <Button
          size="lg"
          fullWidth
          variant="success"
          onClick={onCobrar}
          disabled={items.length === 0}
        >
          💵 COBRAR {total > 0 ? formatPrecio(total) : ''}
        </Button>
      </div>
    </div>
  )
}
