import { useState, useRef, useEffect } from 'react'
import { useCartStore } from '../../stores/cartStore'
import type { TipoAjuste } from '../../stores/cartStore'
import { formatPrecio } from '../../lib/utils'
import { playScanSound } from '../../lib/sound'
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

  // Referencias para navegación por teclado
  const cartItemRefs = useRef<(HTMLDivElement | null)[]>([])
  const descuentoBtnRef = useRef<HTMLButtonElement | HTMLDivElement | null>(null)
  const cobrarBtnRef = useRef<HTMLButtonElement | null>(null)
  const pendingFocusIndex = useRef<number | null>(null)

  const subtotal = subtotalMonto()
  const ajuste = montoAjuste()
  const total = totalMonto()
  const tieneAjuste = tipoAjuste !== 'NINGUNO'

  // Escuchar atajo F6 / Alt + T para entrar al Ticket
  useEffect(() => {
    const handleFocusTicket = () => {
      if (items.length > 0) {
        cartItemRefs.current[0]?.focus()
      } else if (cobrarBtnRef.current) {
        cobrarBtnRef.current.focus()
      }
    }
    window.addEventListener('pos-focus-ticket', handleFocusTicket)
    return () => window.removeEventListener('pos-focus-ticket', handleFocusTicket)
  }, [items.length])

  // Mantener el foco si se elimina un elemento del ticket
  useEffect(() => {
    if (pendingFocusIndex.current !== null) {
      const targetIdx = pendingFocusIndex.current
      pendingFocusIndex.current = null
      if (items.length > 0) {
        const validIdx = Math.max(0, Math.min(targetIdx, items.length - 1))
        cartItemRefs.current[validIdx]?.focus()
      } else {
        window.dispatchEvent(new CustomEvent('pos-focus-search'))
      }
    }
  }, [items])

  const handleItemKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    itemId: string,
    cantidad: number
  ) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (index < items.length - 1) {
        cartItemRefs.current[index + 1]?.focus()
      } else {
        if (descuentoBtnRef.current) {
          descuentoBtnRef.current.focus()
        } else if (cobrarBtnRef.current) {
          cobrarBtnRef.current.focus()
        }
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (index > 0) {
        cartItemRefs.current[index - 1]?.focus()
      } else {
        // En el primer item, subir el foco al buscador
        window.dispatchEvent(new CustomEvent('pos-focus-search'))
      }
    } else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd' || e.key === 'Enter') {
      e.preventDefault()
      actualizarCantidad(itemId, cantidad + 1)
      playScanSound('success')
    } else if (e.key === '-' || e.code === 'NumpadSubtract') {
      e.preventDefault()
      if (cantidad > 1) {
        actualizarCantidad(itemId, cantidad - 1)
      } else {
        pendingFocusIndex.current = Math.max(0, index - 1)
        quitarProducto(itemId)
        toast('Producto quitado del ticket', { duration: 1500 })
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace' || e.key.toLowerCase() === 'd') {
      e.preventDefault()
      pendingFocusIndex.current = Math.min(index, items.length - 2)
      quitarProducto(itemId)
      toast('Producto quitado del ticket', { duration: 1500 })
    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('pos-focus-grid'))
    }
  }

  const handleDescuentoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (items.length > 0) {
        cartItemRefs.current[items.length - 1]?.focus()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      cobrarBtnRef.current?.focus()
    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('pos-focus-grid'))
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (tieneAjuste) {
        e.preventDefault()
        quitarAjuste()
        toast.success('Ajuste eliminado')
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      handleAbrirAjuste()
    }
  }

  const handleCobrarKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (descuentoBtnRef.current) {
        descuentoBtnRef.current.focus()
      } else if (items.length > 0) {
        cartItemRefs.current[items.length - 1]?.focus()
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('pos-focus-grid'))
    }
  }

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
          <div className="space-y-1">
            {items.map((item, idx) => (
              <div
                key={item.producto.id}
                ref={(el) => { cartItemRefs.current[idx] = el }}
                tabIndex={0}
                role="row"
                onKeyDown={(e) => handleItemKeyDown(e, idx, item.producto.id, item.cantidad)}
                className="group flex items-center gap-2 py-2 px-2.5 rounded-xl border border-transparent hover:border-gray-200 dark:hover:border-gray-700 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400 focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-indigo-50/90 dark:focus:bg-gray-700/80 transition-all cursor-pointer select-none"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate group-focus:font-semibold">
                    {item.producto.descripcion}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span>{formatPrecio(item.producto.precio_venta)} c/u</span>
                    <span className="hidden group-focus:inline-flex items-center text-[10px] text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                      (+/- Cant · Supr)
                    </span>
                  </div>
                </div>

                {/* Controles de cantidad táctiles */}
                <div className="flex items-center gap-1.5 flex-shrink-0">
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => actualizarCantidad(item.producto.id, item.cantidad - 1)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-90 text-gray-700 dark:text-gray-300 font-bold text-base transition-transform"
                    aria-label="Restar uno"
                  >
                    −
                  </button>
                  <span className="w-7 text-center text-sm font-bold dark:text-gray-100">{item.cantidad}</span>
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => {
                      actualizarCantidad(item.producto.id, item.cantidad + 1)
                      playScanSound('success')
                    }}
                    className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 active:scale-90 text-gray-700 dark:text-gray-300 font-bold text-base transition-transform"
                    aria-label="Sumar uno"
                  >
                    +
                  </button>
                </div>

                {/* Subtotal */}
                <span className="text-sm font-bold text-gray-900 dark:text-gray-100 w-16 sm:w-20 text-right flex-shrink-0 group-focus:text-indigo-900 dark:group-focus:text-white">
                  {formatPrecio(item.subtotal)}
                </span>

                {/* Eliminar */}
                <button
                  type="button"
                  tabIndex={-1}
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
      <div className="border-t border-gray-200 dark:border-gray-700 px-4 py-3.5 space-y-3 flex-shrink-0 bg-gray-50 dark:bg-gray-900 rounded-b-xl">
        {/* Desglose si hay productos */}
        {items.length > 0 && (
          <div>
            {tieneAjuste ? (
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between text-gray-500 dark:text-gray-400 font-medium">
                  <span>Subtotal</span>
                  <span className="font-semibold text-gray-800 dark:text-gray-200">{formatPrecio(subtotal)}</span>
                </div>
                <div
                  ref={descuentoBtnRef as any}
                  tabIndex={0}
                  role="button"
                  onClick={handleAbrirAjuste}
                  onKeyDown={handleDescuentoKeyDown}
                  className={`flex justify-between items-center px-2.5 py-1.5 rounded-lg border text-xs font-semibold cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400 ${
                    tipoAjuste.startsWith('DESCUENTO')
                      ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800/60 text-emerald-700 dark:text-emerald-300'
                      : 'bg-blue-50 dark:bg-blue-950/50 border-blue-200 dark:border-blue-800/60 text-blue-700 dark:text-blue-300'
                  }`}
                  title="Presioná Enter para modificar, Supr para quitar"
                >
                  <span>{descripcionAjuste()}</span>
                  <div className="flex items-center gap-2">
                    <span className="font-bold">
                      {tipoAjuste.startsWith('DESCUENTO') ? `-${formatPrecio(ajuste)}` : `+${formatPrecio(ajuste)}`}
                    </span>
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation()
                        quitarAjuste()
                      }}
                      className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 font-bold px-1"
                      title="Quitar ajuste"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between text-xs">
                <span className="text-gray-500 dark:text-gray-400 font-medium">
                  {items.reduce((acc, it) => acc + it.cantidad, 0)} {items.reduce((acc, it) => acc + it.cantidad, 0) === 1 ? 'artículo' : 'artículos'}
                </span>
                <button
                  ref={descuentoBtnRef as any}
                  type="button"
                  onClick={handleAbrirAjuste}
                  onKeyDown={handleDescuentoKeyDown}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 focus:outline-hidden focus:ring-2 focus:ring-inset focus:ring-indigo-500 dark:focus:ring-indigo-400 transition-colors"
                >
                  + Descuento / Recargo
                </button>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-between items-baseline pt-1 border-t border-gray-200 dark:border-gray-700/80">
          <span className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400">TOTAL</span>
          <span className="text-3xl font-black text-gray-900 dark:text-white tracking-tight">
            {formatPrecio(total)}
          </span>
        </div>

        <Button
          ref={cobrarBtnRef}
          size="lg"
          fullWidth
          variant="success"
          onClick={onCobrar}
          onKeyDown={handleCobrarKeyDown}
          disabled={items.length === 0}
          className="min-h-[50px] text-base font-bold shadow-md bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white active:scale-98 transition-all focus:outline-hidden focus:ring-4 focus:ring-emerald-400 dark:focus:ring-emerald-500"
        >
          COBRAR {total > 0 ? formatPrecio(total) : ''} [F4]
        </Button>

        {/* Guía rápida de atajos de teclado para Ticket */}
        <div className="text-[11px] text-gray-400 dark:text-gray-500 text-center font-medium hidden sm:block">
          Atajos: F6 Ticket · ↑/↓ Moverse · +/- Cantidad · Supr Quitar
        </div>
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
