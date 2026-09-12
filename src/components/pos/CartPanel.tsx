import { useState } from 'react'
import { useCartStore } from '../../stores/cartStore'
import type { TipoAjuste } from '../../stores/cartStore'
import { formatPrecio } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import toast from 'react-hot-toast'

interface CartPanelProps {
  onCobrar: () => void
}

export function CartPanel({ onCobrar }: CartPanelProps) {
  const {
    items,
    actualizarCantidad,
    quitarProducto,
    subtotalMonto,
    montoAjuste,
    totalMonto,
    vaciarCarrito,
    tipoAjuste,
    valorAjuste,
    aplicarAjuste,
    quitarAjuste,
    suspenderVentaActual,
    descripcionAjuste,
  } = useCartStore()

  const [modalAjusteOpen, setModalAjusteOpen] = useState(false)
  const [modalSuspenderOpen, setModalSuspenderOpen] = useState(false)
  const [notaSuspension, setNotaSuspension] = useState('')

  // Formulario de ajuste
  const [esDescuento, setEsDescuento] = useState(true)
  const [esPorcentaje, setEsPorcentaje] = useState(true)
  const [valorInput, setValorInput] = useState('')

  const subtotal = subtotalMonto()
  const ajuste = montoAjuste()
  const total = totalMonto()
  const tieneAjuste = tipoAjuste !== 'NINGUNO'

  const handleAbrirAjuste = () => {
    if (tieneAjuste) {
      setEsDescuento(tipoAjuste.startsWith('DESCUENTO'))
      setEsPorcentaje(tipoAjuste.includes('PORCENTAJE'))
      setValorInput(valorAjuste.toString())
    } else {
      setEsDescuento(true)
      setEsPorcentaje(true)
      setValorInput('10')
    }
    setModalAjusteOpen(true)
  }

  const handleGuardarAjuste = (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(valorInput) || 0
    if (val <= 0) {
      quitarAjuste()
      setModalAjusteOpen(false)
      return
    }

    let tipo: TipoAjuste
    if (esDescuento) {
      tipo = esPorcentaje ? 'DESCUENTO_PORCENTAJE' : 'DESCUENTO_FIJO'
    } else {
      tipo = esPorcentaje ? 'RECARGO_PORCENTAJE' : 'RECARGO_FIJO'
    }

    aplicarAjuste(tipo, val)
    setModalAjusteOpen(false)
    toast.success(esDescuento ? 'Descuento aplicado' : 'Recargo aplicado')
  }

  const handleSuspender = (e: React.FormEvent) => {
    e.preventDefault()
    const ok = suspenderVentaActual(notaSuspension)
    if (ok) {
      toast.success('Venta puesta en espera')
      setModalSuspenderOpen(false)
      setNotaSuspension('')
    }
  }

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base">Ticket</h2>
        {items.length > 0 && (
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => setModalSuspenderOpen(true)}
              className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold"
            >
              En espera
            </button>
            <button
              onClick={vaciarCarrito}
              className="text-red-500 dark:text-red-400 hover:underline font-medium"
            >
              Vaciar
            </button>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto px-4 py-2">
        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500">
            <p className="text-sm font-medium">Ticket vacío</p>
            <p className="text-xs mt-1">Seleccioná o buscá productos para comenzar</p>
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

      {/* Footer con subtotal, ajuste y botón cobrar */}
      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3 space-y-2.5 flex-shrink-0 bg-gray-50/50 dark:bg-gray-850/50 rounded-b-xl">
        {/* Desglose si hay productos */}
        {items.length > 0 && (
          <div className="space-y-1 text-xs">
            {tieneAjuste && (
              <div className="flex justify-between text-gray-500 dark:text-gray-400">
                <span>Subtotal</span>
                <span>{formatPrecio(subtotal)}</span>
              </div>
            )}

            {/* Fila de ajuste (descuento o recargo) */}
            {tieneAjuste ? (
              <div className="flex justify-between items-center text-xs font-semibold">
                <span className={tipoAjuste.startsWith('DESCUENTO') ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}>
                  {descripcionAjuste()}
                </span>
                <div className="flex items-center gap-2">
                  <span className={tipoAjuste.startsWith('DESCUENTO') ? 'text-emerald-600 dark:text-emerald-400' : 'text-blue-600 dark:text-blue-400'}>
                    {tipoAjuste.startsWith('DESCUENTO') ? `-${formatPrecio(ajuste)}` : `+${formatPrecio(ajuste)}`}
                  </span>
                  <button
                    onClick={quitarAjuste}
                    className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 font-bold"
                    title="Quitar ajuste"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-right">
                <button
                  type="button"
                  onClick={handleAbrirAjuste}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  + Descuento / Recargo
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-center pt-1 border-t border-gray-200/60 dark:border-gray-700/60">
          <span className="text-base font-bold text-gray-900 dark:text-gray-100">TOTAL</span>
          <span className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{formatPrecio(total)}</span>
        </div>

        <Button
          size="lg"
          fullWidth
          variant="success"
          onClick={onCobrar}
          disabled={items.length === 0}
          className="min-h-[48px] text-base font-bold shadow-sm active:scale-98"
        >
          COBRAR {total > 0 ? formatPrecio(total) : ''}
        </Button>
      </div>

      {/* Modal Descuento / Recargo */}
      <Modal
        isOpen={modalAjusteOpen}
        onClose={() => setModalAjusteOpen(false)}
        title="Descuento o Recargo"
        size="sm"
      >
        <form onSubmit={handleGuardarAjuste} className="space-y-4">
          {/* Tipo: Descuento o Recargo */}
          <div className="grid grid-cols-2 gap-2 p-1 bg-gray-100 dark:bg-gray-700 rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setEsDescuento(true)}
              className={`py-2 rounded-lg transition-colors ${
                esDescuento
                  ? 'bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              Descuento (-)
            </button>
            <button
              type="button"
              onClick={() => setEsDescuento(false)}
              className={`py-2 rounded-lg transition-colors ${
                !esDescuento
                  ? 'bg-white dark:bg-gray-800 text-blue-600 dark:text-blue-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-300'
              }`}
            >
              Recargo (+)
            </button>
          </div>

          {/* Modalidad: Porcentaje o Fijo */}
          <div className="grid grid-cols-2 gap-2 text-xs font-medium">
            <button
              type="button"
              onClick={() => setEsPorcentaje(true)}
              className={`py-1.5 rounded-lg border transition-colors ${
                esPorcentaje
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              Porcentaje (%)
            </button>
            <button
              type="button"
              onClick={() => setEsPorcentaje(false)}
              className={`py-1.5 rounded-lg border transition-colors ${
                !esPorcentaje
                  ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                  : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
              }`}
            >
              Monto fijo ($)
            </button>
          </div>

          {/* Atajos rápidos */}
          <div className="flex gap-2">
            {esPorcentaje
              ? [5, 10, 15, 20].map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setValorInput(p.toString())}
                    className="flex-1 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    {p}%
                  </button>
                ))
              : [500, 1000, 2000].map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setValorInput(f.toString())}
                    className="flex-1 py-1 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    ${f}
                  </button>
                ))}
          </div>

          <Input
            label={esPorcentaje ? 'Porcentaje (%)' : 'Monto en pesos ($)'}
            type="number"
            min="0"
            step={esPorcentaje ? '1' : '10'}
            value={valorInput}
            onChange={(e) => setValorInput(e.target.value)}
            placeholder={esPorcentaje ? 'Ej: 10' : 'Ej: 500'}
            required
            autoFocus
          />

          <div className="flex gap-2 pt-2">
            <Button type="submit" fullWidth>
              Aplicar
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setModalAjusteOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Suspender Venta */}
      <Modal
        isOpen={modalSuspenderOpen}
        onClose={() => setModalSuspenderOpen(false)}
        title="Poner Venta en Espera"
        size="sm"
      >
        <form onSubmit={handleSuspender} className="space-y-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Los productos se guardarán temporalmente para que puedas atender a otro cliente. Podrás recuperar este ticket en cualquier momento.
          </p>

          <Input
            label="Nota o referencia (opcional)"
            placeholder="Ej: Cliente buzo azul / Mostrador"
            value={notaSuspension}
            onChange={(e) => setNotaSuspension(e.target.value)}
            autoFocus
          />

          <div className="flex gap-2 pt-2">
            <Button type="submit" fullWidth>
              Poner en espera
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              onClick={() => setModalSuspenderOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
