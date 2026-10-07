import { useState, useRef, useEffect } from 'react'
import { useCartStore } from '../../stores/cartStore'
import { useAuthStore } from '../../stores/authStore'
import { useTenantConfig } from '../../hooks/useTenantConfig'
import type { TipoAjuste } from '../../stores/cartStore'
import { formatPrecio, formatearPromoTicket } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import toast from 'react-hot-toast'

interface CartPanelProps {
  onCobrar: () => void
}

export function CartPanel({ onCobrar }: CartPanelProps) {
  const { usuario, kiosco, diasRestantes } = useAuthStore()
  const { tieneEnvases } = useTenantConfig()
  const esSoloLectura = !usuario?.es_superadmin && (
    kiosco?.estado_suscripcion === 'SOLO_LECTURA' ||
    (diasRestantes !== null && diasRestantes < 0)
  )

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
    descripcionAjuste,
    totalAhorroPromociones,
    toggleEnvaseItem,
    tabs,
    tabActivaId,
    crearNuevaTab,
    cambiarTab,
    cerrarTab,
    suspenderVentaActual,
  } = useCartStore()

  const [modalAjusteOpen, setModalAjusteOpen] = useState(false)

  // Formulario de ajuste
  const [esDescuento, setEsDescuento] = useState(true)
  const [esPorcentaje, setEsPorcentaje] = useState(true)
  const [valorInput, setValorInput] = useState('')

  // Referencias para navegación por teclado
  const cartItemRefs = useRef<(HTMLDivElement | null)[]>([])
  const minusBtnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const plusBtnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const deleteBtnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const envaseBtnRefs = useRef<(HTMLButtonElement | null)[]>([])
  const descuentoBtnRef = useRef<HTMLButtonElement | HTMLDivElement | null>(null)
  const cobrarBtnRef = useRef<HTMLButtonElement | null>(null)
  const pendingFocusIndex = useRef<number | null>(null)
  const pendingFocusTarget = useRef<'item' | 'minus' | 'plus' | 'delete' | 'envase'>('item')

  const subtotal = subtotalMonto()
  const ajuste = montoAjuste()
  const total = totalMonto()
  const ahorroPromo = totalAhorroPromociones()
  const tieneAjuste = tipoAjuste !== 'NINGUNO'

  // Acciones de modificación con retención de foco
  const handleSumarCantidad = (
    itemId: string,
    cantidad: number,
    index?: number,
    targetButton: 'minus' | 'plus' | 'item' = 'plus',
    esTeclado = false
  ) => {
    const item = items.find((it) => it.producto.id === itemId)
    if (item && item.producto.stock_actual > 0 && cantidad >= item.producto.stock_actual) {
      toast.error(`Stock máximo alcanzado (${item.producto.stock_actual} disponibles)`)
      return
    }
    const paso = item?.producto.es_pesable ? 0.1 : 1
    const nueva = Number((cantidad + paso).toFixed(3))
    actualizarCantidad(itemId, nueva)
    if (esTeclado && index !== undefined) {
      pendingFocusIndex.current = index
      pendingFocusTarget.current = targetButton
    }
  }

  const handleRestarCantidad = (
    itemId: string,
    cantidad: number,
    index: number,
    targetButton: 'minus' | 'plus' | 'item' = 'minus',
    esTeclado = false
  ) => {
    const item = items.find((it) => it.producto.id === itemId)
    const paso = item?.producto.es_pesable ? 0.1 : 1
    if (cantidad > paso) {
      const nueva = Number((cantidad - paso).toFixed(3))
      actualizarCantidad(itemId, nueva)
      if (esTeclado) {
        pendingFocusIndex.current = index
        pendingFocusTarget.current = targetButton
      }
    } else {
      if (esTeclado) {
        pendingFocusIndex.current = Math.max(0, index - 1)
        pendingFocusTarget.current = 'item'
      } else {
        pendingFocusIndex.current = null
      }
      quitarProducto(itemId)
      toast('Producto quitado del ticket', { duration: 1500 })
    }
  }

  const handleQuitarItem = (itemId: string, index: number, esTeclado = false) => {
    if (esTeclado) {
      pendingFocusIndex.current = Math.min(index, items.length - 2)
      pendingFocusTarget.current = 'item'
    } else {
      pendingFocusIndex.current = null
    }
    quitarProducto(itemId)
    toast('Producto quitado del ticket', { duration: 1500 })
  }

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

  // Mantener el foco tras sumar, restar o eliminar un elemento del ticket
  useEffect(() => {
    if (pendingFocusIndex.current !== null) {
      const targetIdx = pendingFocusIndex.current
      const targetType = pendingFocusTarget.current
      pendingFocusIndex.current = null
      pendingFocusTarget.current = 'item'
      if (items.length > 0) {
        const validIdx = Math.max(0, Math.min(targetIdx, items.length - 1))
        if (targetType === 'minus') {
          minusBtnRefs.current[validIdx]?.focus()
        } else if (targetType === 'plus') {
          plusBtnRefs.current[validIdx]?.focus()
        } else if (targetType === 'envase') {
          envaseBtnRefs.current[validIdx]?.focus()
        } else {
          cartItemRefs.current[validIdx]?.focus()
        }
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
    const it = items[index]
    const tieneEnvase = Boolean(tieneEnvases && it && it.producto.es_retornable && !it.es_devolucion_envase)

    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        if (index > 0) {
          const prevIt = items[index - 1]
          if (prevIt && prevIt.producto.es_retornable && !prevIt.es_devolucion_envase && envaseBtnRefs.current[index - 1]) {
            envaseBtnRefs.current[index - 1]?.focus()
          } else {
            cartItemRefs.current[index - 1]?.focus()
          }
        } else {
          window.dispatchEvent(new CustomEvent('pos-focus-grid'))
        }
      } else {
        if (tieneEnvase && envaseBtnRefs.current[index]) {
          envaseBtnRefs.current[index]?.focus()
        } else if (index < items.length - 1) {
          cartItemRefs.current[index + 1]?.focus()
        } else if (descuentoBtnRef.current) {
          descuentoBtnRef.current.focus()
        } else if (cobrarBtnRef.current) {
          cobrarBtnRef.current.focus()
        }
      }
      return
    }

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
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      minusBtnRefs.current[index]?.focus()
    } else if (e.key.toLowerCase() === 'e') {
      if (tieneEnvase) {
        e.preventDefault()
        pendingFocusIndex.current = index
        pendingFocusTarget.current = 'item'
        toggleEnvaseItem(itemId)
        toast.success(it.sin_envase ? 'Con envase (mano a mano)' : 'Sin envase (con cargo de envase)')
      }
    } else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
      e.preventDefault()
      handleSumarCantidad(itemId, cantidad, index, 'item', true)
    } else if (e.key === '-' || e.code === 'NumpadSubtract') {
      e.preventDefault()
      handleRestarCantidad(itemId, cantidad, index, 'item', true)
    } else if (e.key === 'Delete' || e.key === 'Backspace' || e.key.toLowerCase() === 'd') {
      e.preventDefault()
      handleQuitarItem(itemId, index, true)
    } else if (e.key === 'ArrowLeft' || e.key === 'Escape') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('pos-focus-grid'))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (tieneEnvase && envaseBtnRefs.current[index]) {
        envaseBtnRefs.current[index]?.focus()
      } else {
        plusBtnRefs.current[index]?.focus()
      }
    }
  }

  const handleMinusKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    itemId: string,
    cantidad: number
  ) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) {
        cartItemRefs.current[index]?.focus()
      } else {
        const it = items[index]
        if (it && it.producto.es_retornable && !it.es_devolucion_envase && envaseBtnRefs.current[index]) {
          envaseBtnRefs.current[index]?.focus()
        } else if (index < items.length - 1) {
          cartItemRefs.current[index + 1]?.focus()
        } else if (descuentoBtnRef.current) {
          descuentoBtnRef.current.focus()
        } else if (cobrarBtnRef.current) {
          cobrarBtnRef.current.focus()
        }
      }
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      plusBtnRefs.current[index]?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      cartItemRefs.current[index]?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      if (index < items.length - 1) {
        minusBtnRefs.current[index + 1]?.focus()
      } else {
        if (descuentoBtnRef.current) descuentoBtnRef.current.focus()
        else if (cobrarBtnRef.current) cobrarBtnRef.current.focus()
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      if (index > 0) {
        minusBtnRefs.current[index - 1]?.focus()
      } else {
        window.dispatchEvent(new CustomEvent('pos-focus-search'))
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      handleRestarCantidad(itemId, cantidad, index, 'minus', true)
    } else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
      e.preventDefault()
      e.stopPropagation()
      handleSumarCantidad(itemId, cantidad, index, 'minus', true)
    } else if (e.key === '-' || e.code === 'NumpadSubtract') {
      e.preventDefault()
      e.stopPropagation()
      handleRestarCantidad(itemId, cantidad, index, 'minus', true)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopPropagation()
      handleQuitarItem(itemId, index, true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      window.dispatchEvent(new CustomEvent('pos-focus-grid'))
    }
  }

  const handlePlusKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    itemId: string,
    cantidad: number
  ) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) {
        cartItemRefs.current[index]?.focus()
      } else {
        const it = items[index]
        if (it && it.producto.es_retornable && !it.es_devolucion_envase && envaseBtnRefs.current[index]) {
          envaseBtnRefs.current[index]?.focus()
        } else if (index < items.length - 1) {
          cartItemRefs.current[index + 1]?.focus()
        } else if (descuentoBtnRef.current) {
          descuentoBtnRef.current.focus()
        } else if (cobrarBtnRef.current) {
          cobrarBtnRef.current.focus()
        }
      }
      return
    }

    if (e.key === 'ArrowRight') {
      e.preventDefault()
      e.stopPropagation()
      deleteBtnRefs.current[index]?.focus()
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      minusBtnRefs.current[index]?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      if (index < items.length - 1) {
        plusBtnRefs.current[index + 1]?.focus()
      } else {
        if (descuentoBtnRef.current) descuentoBtnRef.current.focus()
        else if (cobrarBtnRef.current) cobrarBtnRef.current.focus()
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      if (index > 0) {
        plusBtnRefs.current[index - 1]?.focus()
      } else {
        window.dispatchEvent(new CustomEvent('pos-focus-search'))
      }
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      handleSumarCantidad(itemId, cantidad, index, 'plus', true)
    } else if (e.key === '+' || e.key === '=' || e.code === 'NumpadAdd') {
      e.preventDefault()
      e.stopPropagation()
      handleSumarCantidad(itemId, cantidad, index, 'plus', true)
    } else if (e.key === '-' || e.code === 'NumpadSubtract') {
      e.preventDefault()
      e.stopPropagation()
      handleRestarCantidad(itemId, cantidad, index, 'plus', true)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopPropagation()
      handleQuitarItem(itemId, index, true)
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      window.dispatchEvent(new CustomEvent('pos-focus-grid'))
    }
  }

  const handleDeleteKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    itemId: string
  ) => {
    const it = items[index]
    const tieneEnvase = Boolean(tieneEnvases && it && it.producto.es_retornable && !it.es_devolucion_envase)

    if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) {
        cartItemRefs.current[index]?.focus()
      } else {
        if (tieneEnvase && envaseBtnRefs.current[index]) {
          envaseBtnRefs.current[index]?.focus()
        } else if (index < items.length - 1) {
          cartItemRefs.current[index + 1]?.focus()
        } else if (descuentoBtnRef.current) {
          descuentoBtnRef.current.focus()
        } else if (cobrarBtnRef.current) {
          cobrarBtnRef.current.focus()
        }
      }
      return
    }

    if (e.key === 'ArrowLeft') {
      e.preventDefault()
      e.stopPropagation()
      plusBtnRefs.current[index]?.focus()
    } else if (e.key === 'ArrowRight') {
      if (tieneEnvase && envaseBtnRefs.current[index]) {
        e.preventDefault()
        e.stopPropagation()
        envaseBtnRefs.current[index]?.focus()
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      if (tieneEnvase && envaseBtnRefs.current[index]) {
        envaseBtnRefs.current[index]?.focus()
      } else if (index < items.length - 1) {
        deleteBtnRefs.current[index + 1]?.focus()
      } else {
        if (descuentoBtnRef.current) descuentoBtnRef.current.focus()
        else if (cobrarBtnRef.current) cobrarBtnRef.current.focus()
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      if (index > 0) {
        deleteBtnRefs.current[index - 1]?.focus()
      } else {
        window.dispatchEvent(new CustomEvent('pos-focus-search'))
      }
    } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      e.stopPropagation()
      handleQuitarItem(itemId, index, true)
    } else if (e.key.toLowerCase() === 'e' && tieneEnvase) {
      e.preventDefault()
      e.stopPropagation()
      pendingFocusIndex.current = index
      pendingFocusTarget.current = 'envase'
      toggleEnvaseItem(itemId)
      toast.success(it.sin_envase ? 'Con envase (mano a mano)' : 'Sin envase (con cargo de envase)')
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      window.dispatchEvent(new CustomEvent('pos-focus-grid'))
    }
  }

  const handleEnvaseKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    itemId: string
  ) => {
    const it = items[index]
    if (e.key === 'Enter' || e.key === ' ' || e.key.toLowerCase() === 'e') {
      e.preventDefault()
      e.stopPropagation()
      pendingFocusIndex.current = index
      pendingFocusTarget.current = 'envase'
      toggleEnvaseItem(itemId)
      toast.success(it?.sin_envase ? 'Con envase (mano a mano)' : 'Sin envase (con cargo de envase)')
    } else if (e.key === 'Tab') {
      e.preventDefault()
      e.stopPropagation()
      if (e.shiftKey) {
        cartItemRefs.current[index]?.focus()
      } else {
        if (index < items.length - 1) {
          cartItemRefs.current[index + 1]?.focus()
        } else if (descuentoBtnRef.current) {
          descuentoBtnRef.current.focus()
        } else if (cobrarBtnRef.current) {
          cobrarBtnRef.current.focus()
        }
      }
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault()
      e.stopPropagation()
      cartItemRefs.current[index]?.focus()
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      e.stopPropagation()
      if (index < items.length - 1) {
        cartItemRefs.current[index + 1]?.focus()
      } else {
        if (descuentoBtnRef.current) descuentoBtnRef.current.focus()
        else if (cobrarBtnRef.current) cobrarBtnRef.current.focus()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      window.dispatchEvent(new CustomEvent('pos-focus-grid'))
    }
  }

  const handleDescuentoKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        if (items.length > 0) {
          const lastIdx = items.length - 1
          const lastIt = items[lastIdx]
          if (lastIt && lastIt.producto.es_retornable && !lastIt.es_devolucion_envase && envaseBtnRefs.current[lastIdx]) {
            envaseBtnRefs.current[lastIdx]?.focus()
          } else {
            cartItemRefs.current[lastIdx]?.focus()
          }
        } else {
          window.dispatchEvent(new CustomEvent('pos-focus-grid'))
        }
      } else {
        cobrarBtnRef.current?.focus()
      }
      return
    }

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
    if (e.key === 'Tab') {
      e.preventDefault()
      if (e.shiftKey) {
        if (descuentoBtnRef.current) {
          descuentoBtnRef.current.focus()
        } else if (items.length > 0) {
          const lastIdx = items.length - 1
          const lastIt = items[lastIdx]
          if (lastIt && lastIt.producto.es_retornable && !lastIt.es_devolucion_envase && envaseBtnRefs.current[lastIdx]) {
            envaseBtnRefs.current[lastIdx]?.focus()
          } else {
            cartItemRefs.current[lastIdx]?.focus()
          }
        } else {
          window.dispatchEvent(new CustomEvent('pos-focus-grid'))
        }
      } else {
        window.dispatchEvent(new CustomEvent('pos-focus-search'))
      }
      return
    }

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

  return (
    <div className="flex flex-col h-full bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-lg dark:shadow-black/30">
      {/* Pestañas de tickets en paralelo estilo Odoo POS */}
      <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-gray-200 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-900/60 rounded-t-2xl overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden flex-shrink-0">
        {tabs.map((tab) => {
          const esActiva = tab.id === tabActivaId
          const itemsTab = esActiva ? items : tab.items
          const cant = itemsTab.reduce((acc, it) => acc + (it.producto.es_pesable ? 1 : Math.round(it.cantidad)), 0)
          return (
            <div
              key={tab.id}
              onClick={() => cambiarTab(tab.id)}
              className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                esActiva
                  ? 'bg-white dark:bg-gray-800 text-indigo-600 dark:text-indigo-400 shadow-xs border border-gray-200 dark:border-gray-700'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 hover:bg-gray-200/50'
              }`}
            >
              <span className="truncate max-w-[85px]">{tab.nombre}</span>
              {cant > 0 && (
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    esActiva
                      ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300'
                      : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  {cant}
                </span>
              )}
              {tabs.length > 1 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    cerrarTab(tab.id)
                  }}
                  className="text-gray-400 hover:text-red-500 dark:hover:text-red-400 text-xs px-0.5 ml-0.5"
                  title="Cerrar pestaña"
                >
                  ✕
                </button>
              )}
            </div>
          )
        })}
        <button
          type="button"
          onClick={() => crearNuevaTab()}
          className="px-2 py-1 text-xs font-bold rounded-lg text-gray-500 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors cursor-pointer"
          title="Abrir nueva venta en paralelo [+]"
        >
          +
        </button>
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
        <h2 className="font-bold text-gray-900 dark:text-gray-100 text-sm sm:text-base">Venta actual</h2>
        {items.length > 0 && (
          <div className="flex items-center gap-2.5 text-xs">
            <button
              type="button"
              onClick={() => {
                const ok = suspenderVentaActual()
                if (ok) {
                  toast.success('Venta guardada en espera (podés recuperarla cuando vuelva el cliente)')
                }
              }}
              className="text-amber-600 dark:text-amber-400 hover:text-amber-700 font-semibold cursor-pointer transition-colors"
              title="Pausar esta venta para atender a otro cliente y recuperarla luego (F6)"
            >
              Pausar
            </button>
            <span className="text-gray-300 dark:text-gray-600 select-none">·</span>
            <button
              onClick={() => {
                if (items.length <= 1 || window.confirm(`¿Estás seguro de vaciar el ticket (${items.length} artículos)?`)) {
                  vaciarCarrito()
                  toast('Ticket vaciado', { duration: 2000 })
                }
              }}
              className="text-red-500 dark:text-red-400 hover:text-red-600 font-medium cursor-pointer transition-colors"
              title="Vaciar ticket completo"
            >
              Vaciar
            </button>
          </div>
        )}
      </div>

      {/* Items */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Encabezado fijo superior */}
        {items.length > 0 && (
          <div className="sticky top-0 z-10 bg-gray-50/95 dark:bg-gray-900/95 backdrop-blur-xs border-b border-gray-200 dark:border-gray-700 px-3 py-1.5 shadow-2xs">
            <div className="flex items-center justify-between text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider select-none">
              <span>Producto</span>
              <span>Subtotal</span>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 px-4">
            <p className="text-sm font-medium">Ticket vacío</p>
            <p className="text-xs mt-1">Seleccioná o buscá productos para comenzar</p>
          </div>
        ) : (
          <div className="p-3 space-y-3">
            {items.map((item, idx) => (
              <div
                key={item.producto.id}
                ref={(el) => { cartItemRefs.current[idx] = el }}
                tabIndex={0}
                role="row"
                onKeyDown={(e) => handleItemKeyDown(e, idx, item.producto.id, item.cantidad)}
                className="group flex flex-col p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-700 hover:bg-gray-50/80 dark:hover:bg-gray-800/70 focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500/50 dark:focus-visible:ring-indigo-400/50 focus-visible:border-indigo-500/60 dark:focus-visible:border-indigo-400/60 focus-visible:bg-gray-50/90 dark:focus-visible:bg-gray-800 transition-all cursor-pointer select-none gap-1.5 bg-gray-50 dark:bg-gray-900/30 shadow-sm"
              >
                {/* 1. Fila Superior: Nombre del producto y Subtotal */}
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <p
                    className="text-sm font-semibold text-gray-900 dark:text-gray-100 leading-snug line-clamp-2 min-w-0 flex-1"
                    title={item.producto.descripcion}
                  >
                    {item.producto.descripcion}
                  </p>

                  <div className="text-right shrink-0 whitespace-nowrap pt-0.5">
                    <span className={`text-base font-black tabular-nums whitespace-nowrap ${item.es_devolucion_envase || item.subtotal < 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-900 dark:text-gray-100'}`}>
                      {item.subtotal < 0 ? `-${formatPrecio(Math.abs(item.subtotal))}` : formatPrecio(item.subtotal)}
                    </span>
                    {item.descuento_promo !== undefined && item.descuento_promo > 0 && (
                      <span className="block text-[10px] text-gray-400 line-through whitespace-nowrap">
                        {formatPrecio(Math.round(item.cantidad * item.producto.precio_venta))}
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Fila Inferior: Detalles/Precio unitario a la izquierda y Controles de Cantidad + Borrar a la derecha */}
                <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-gray-800/80">
                  {/* Info unitario y stock */}
                  <div className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 min-w-0 flex-wrap">
                    <span className="font-medium text-gray-600 dark:text-gray-300 whitespace-nowrap">
                      {formatPrecio(item.producto.precio_venta)}
                      {item.producto.es_pesable ? `/${item.producto.unidad_medida || 'KG'}` : ' c/u'}
                    </span>
                    <span className="text-gray-300 dark:text-gray-600">·</span>
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 whitespace-nowrap">
                      Disp: {item.producto.stock_actual}
                    </span>
                    {item.producto.stock_actual > 0 && item.cantidad >= item.producto.stock_actual && (
                      <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-1 rounded whitespace-nowrap">
                        Máx
                      </span>
                    )}
                  </div>

                  {/* Controles de Cantidad + Botón Borrar */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Stepper Cantidad */}
                    <div className="flex items-center bg-gray-100 dark:bg-gray-800 rounded-lg p-0.5 border border-gray-200/60 dark:border-gray-700/60">
                      <button
                        ref={(el) => { minusBtnRefs.current[idx] = el }}
                        type="button"
                        tabIndex={-1}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleRestarCantidad(item.producto.id, item.cantidad, idx, 'minus', false)
                        }}
                        onKeyDown={(e) => handleMinusKeyDown(e, idx, item.producto.id, item.cantidad)}
                        className="w-7 h-7 flex items-center justify-center rounded-lg bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 active:scale-90 text-gray-700 dark:text-gray-200 font-bold text-xs shadow-2xs transition-all focus:outline-hidden focus:ring-2 focus:ring-indigo-500 cursor-pointer select-none"
                        aria-label="Restar uno"
                        title="Restar [Enter o -]"
                      >
                        −
                      </button>

                      <span className="px-2 min-w-[28px] text-center font-bold text-xs font-mono text-gray-900 dark:text-gray-100 select-none whitespace-nowrap">
                        {item.cantidad % 1 === 0 ? item.cantidad : Number(item.cantidad.toFixed(2))}
                      </span>

                      <button
                        ref={(el) => { plusBtnRefs.current[idx] = el }}
                        type="button"
                        tabIndex={-1}
                        disabled={item.producto.stock_actual > 0 && item.cantidad >= item.producto.stock_actual}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSumarCantidad(item.producto.id, item.cantidad)
                        }}
                        onKeyDown={(e) => handlePlusKeyDown(e, idx, item.producto.id, item.cantidad)}
                        className={`w-7 h-7 flex items-center justify-center rounded-lg font-bold text-xs shadow-2xs transition-all select-none ${
                          item.producto.stock_actual > 0 && item.cantidad >= item.producto.stock_actual
                            ? 'opacity-30 cursor-not-allowed bg-gray-200 dark:bg-gray-800 text-gray-400'
                            : 'bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 active:scale-90 text-gray-700 dark:text-gray-200 cursor-pointer focus:outline-hidden focus:ring-2 focus:ring-indigo-500'
                        }`}
                        aria-label="Sumar uno"
                        title={
                          item.producto.stock_actual > 0 && item.cantidad >= item.producto.stock_actual
                            ? `Stock máximo alcanzado (${item.producto.stock_actual})`
                            : 'Sumar uno [Enter o +]'
                        }
                      >
                        +
                      </button>
                    </div>

                    {/* Botón Borrar */}
                    <button
                      ref={(el) => { deleteBtnRefs.current[idx] = el }}
                      type="button"
                      tabIndex={-1}
                      onClick={(e) => {
                        e.stopPropagation()
                        handleQuitarItem(item.producto.id, idx, false)
                      }}
                      onKeyDown={(e) => handleDeleteKeyDown(e, idx, item.producto.id)}
                      className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-md transition-colors focus:outline-hidden focus:ring-2 focus:ring-red-500 cursor-pointer select-none text-xs"
                      aria-label="Eliminar producto"
                      title="Eliminar producto [Enter o Supr]"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                {/* 3. Fila Extra (si tiene promociones o envase) */}
                {(item.promo_nombre || item.es_devolucion_envase || (tieneEnvases && item.producto.es_retornable && !item.es_devolucion_envase)) && (
                  <div className="flex items-center gap-1.5 pt-0.5 flex-wrap">
                    {item.promo_nombre && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60">
                        {formatearPromoTicket(item.promo_nombre)}
                      </span>
                    )}
                    {item.es_devolucion_envase && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800/60">
                        Devolución envase
                      </span>
                    )}
                    {tieneEnvases && item.producto.es_retornable && !item.es_devolucion_envase && (
                      <button
                        ref={(el) => { envaseBtnRefs.current[idx] = el }}
                        type="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation()
                          pendingFocusIndex.current = idx
                          pendingFocusTarget.current = 'envase'
                          toggleEnvaseItem(item.producto.id)
                        }}
                        onKeyDown={(e) => handleEnvaseKeyDown(e, idx, item.producto.id)}
                        className={`px-2 py-0.5 rounded text-[10px] font-semibold border transition-all cursor-pointer select-none focus:outline-hidden focus-visible:ring-2 focus-visible:ring-indigo-500 dark:focus-visible:ring-indigo-400 ${
                          item.sin_envase
                            ? 'bg-amber-50 dark:bg-amber-950/50 border-amber-300 dark:border-amber-700 text-amber-800 dark:text-amber-300 focus-visible:bg-amber-100 dark:focus-visible:bg-amber-900/60'
                            : 'bg-gray-100 dark:bg-gray-700/60 border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 focus-visible:bg-gray-200 dark:focus-visible:bg-gray-600'
                        }`}
                        title="Hacé clic o presioná Enter para alternar si el cliente trajo o no el envase vacío [Enter o E]"
                        aria-label={`Envase: ${item.sin_envase ? 'Sin envase' : 'Con envase'}. Presioná Enter para alternar.`}
                      >
                        {item.sin_envase
                          ? `Sin envase (+${formatPrecio((item.precio_envase_unitario || item.producto.precio_envase || 0) * item.cantidad)})`
                          : 'Con envase (mano a mano)'}
                      </button>
                    )}
                  </div>
                )}
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
            {ahorroPromo > 0 && (
              <div className="flex justify-between items-center px-2.5 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800/60 text-xs font-semibold text-emerald-700 dark:text-emerald-300 mb-2">
                <span>Ahorro en Promociones:</span>
                <span className="font-bold">-{formatPrecio(ahorroPromo)}</span>
              </div>
            )}
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

        <div className="flex justify-between items-baseline pt-1 border-t border-gray-200 dark:border-gray-700/80 gap-2">
          <span className="text-xs uppercase tracking-wider font-bold text-gray-500 dark:text-gray-400 shrink-0">TOTAL</span>
          <span className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white tracking-tight whitespace-nowrap">
            {formatPrecio(total)}
          </span>
        </div>

        {esSoloLectura && (
          <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 text-xs text-red-700 dark:text-red-300 text-center font-medium">
            Suscripción vencida. Ventas deshabilitadas en modo Solo Lectura.
          </div>
        )}

        {total < 0 && (
          <div className="p-2.5 rounded-xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-300 font-medium text-center">
            Saldo a favor del cliente ({formatPrecio(Math.abs(total))}). Para devolver dinero en efectivo utilizá &quot;Recibir Envase &gt; Pagar en efectivo de caja&quot; o sumá más productos al ticket.
          </div>
        )}

        <Button
          ref={cobrarBtnRef}
          size="lg"
          fullWidth
          variant={esSoloLectura || total < 0 ? 'secondary' : 'success'}
          onClick={esSoloLectura || total < 0 ? undefined : onCobrar}
          onKeyDown={esSoloLectura || total < 0 ? undefined : handleCobrarKeyDown}
          disabled={items.length === 0 || esSoloLectura || total < 0}
          className={`min-h-[50px] text-base font-bold shadow-md active:scale-98 transition-all focus:outline-hidden focus:ring-4 disabled:opacity-50 disabled:cursor-not-allowed ${
            esSoloLectura || total < 0
              ? ''
              : 'bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white focus:ring-emerald-400 dark:focus:ring-emerald-500'
          }`}
        >
          {esSoloLectura
            ? 'SOLO LECTURA (VENTAS PAUSADAS)'
            : total < 0
            ? `SALDO A FAVOR DEL CLIENTE (-${formatPrecio(Math.abs(total))})`
            : `COBRAR ${total > 0 ? formatPrecio(total) : ''} [F4]`}
        </Button>

        {/* Guía rápida de atajos de teclado para Ticket */}
        <div className="text-[11px] text-gray-400 dark:text-gray-500 text-center font-medium hidden sm:block">
          Atajos: F6 Ticket · ↑/↓ Moverse · Enter en botón +/- · Supr Quitar
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
    </div>
  )
}
