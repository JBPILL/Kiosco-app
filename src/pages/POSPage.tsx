import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCartStore } from '../stores/cartStore'
import { useCajaStore } from '../stores/cajaStore'
import { formatPrecio, formatFecha } from '../lib/utils'
import { ProductSearch } from '../components/pos/ProductSearch'
import { FavoritesGrid } from '../components/pos/FavoritesGrid'
import { CartPanel } from '../components/pos/CartPanel'
import { PaymentModal } from '../components/pos/PaymentModal'
import { TicketReceiptModal, type TicketData } from '../components/pos/TicketReceiptModal'
import { BarcodeScannerModal } from '../components/pos/BarcodeScannerModal'
import { KeyboardShortcutsModal } from '../components/pos/KeyboardShortcutsModal'
import { ArticuloLibreModal } from '../components/pos/ArticuloLibreModal'
import { BalanzaManualModal } from '../components/pos/BalanzaManualModal'
import { DevolucionModal } from '../components/pos/DevolucionModal'
import { parsearCodigoBalanza, buscarProductoPorCodigoBalanza } from '../lib/barcodeParser'
import { useBarcodeGun } from '../hooks/useBarcodeGun'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { playScanSound } from '../lib/sound'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import type { Producto, Categoria } from '../types/database'
import toast from 'react-hot-toast'

export function POSPage() {
  const navigate = useNavigate()
  const { sesionActiva, verificarSesionActiva } = useCajaStore()
  const [favoritos, setFavoritos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [productosCategoria, setProductosCategoria] = useState<Producto[]>([])
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [cartModalOpen, setCartModalOpen] = useState(false)
  const [modalEsperaOpen, setModalEsperaOpen] = useState(false)
  const [modalScannerOpen, setModalScannerOpen] = useState(false)
  const [modalShortcutsOpen, setModalShortcutsOpen] = useState(false)
  const [modalLibreOpen, setModalLibreOpen] = useState(false)
  const [modalBalanzaOpen, setModalBalanzaOpen] = useState(false)
  const [modalDevolucionOpen, setModalDevolucionOpen] = useState(false)
  const [productoPesableModal, setProductoPesableModal] = useState<Producto | null>(null)
  const [ticketReciente, setTicketReciente] = useState<TicketData | null>(null)
  const [ticketModalOpen, setTicketModalOpen] = useState(false)

  const {
    agregarProducto,
    totalItems,
    totalMonto,
    ventasEnEspera,
    recuperarVenta,
    eliminarVentaEnEspera,
  } = useCartStore()

  const cantItems = totalItems()
  const total = totalMonto()

  // Cargar favoritos
  const cargarFavoritos = useCallback(async () => {
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .eq('es_favorito', true)
      .order('descripcion')
    setFavoritos(data || [])
  }, [])

  // Cargar categorías
  const cargarCategorias = useCallback(async () => {
    const { data } = await supabase
      .from('categorias')
      .select('*')
      .order('orden')
    setCategorias(data || [])
  }, [])

  // Cargar productos por categoría
  const cargarPorCategoria = useCallback(async (catId: string) => {
    const { data } = await supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .eq('categoria_id', catId)
      .order('descripcion')
    setProductosCategoria(data || [])
  }, [])

  useEffect(() => {
    cargarFavoritos()
    cargarCategorias()
    verificarSesionActiva()
  }, [cargarFavoritos, cargarCategorias, verificarSesionActiva])

  useEffect(() => {
    if (categoriaActiva) {
      cargarPorCategoria(categoriaActiva)
    }
  }, [categoriaActiva, cargarPorCategoria])

  const handleSeleccion = (producto: Producto, cantidad?: number) => {
    if (cantidad && cantidad > 0) {
      agregarProducto(producto, cantidad)
      return
    }
    if (producto.es_pesable) {
      setProductoPesableModal(producto)
      setModalBalanzaOpen(true)
      return
    }
    agregarProducto(producto)
  }

  const handleVentaCompletada = (ticket?: TicketData) => {
    cargarFavoritos() // Refrescar stock
    verificarSesionActiva()
    setCartModalOpen(false)
    if (ticket) {
      setTicketReciente(ticket)
      setTicketModalOpen(true)
    }
  }

  const handleRecuperar = (id: string) => {
    recuperarVenta(id)
    setModalEsperaOpen(false)
    toast.success('Venta recuperada en el ticket')
  }

  // Navegación por teclado en las pestañas de categorías
  const categoryRefs = useRef<(HTMLButtonElement | null)[]>([])
  const totalTabs = 1 + categorias.length

  useEffect(() => {
    const handleFocusCategory = () => {
      const activeIdx = categoriaActiva
        ? categorias.findIndex((c) => c.id === categoriaActiva) + 1
        : 0
      categoryRefs.current[activeIdx >= 0 ? activeIdx : 0]?.focus()
    }
    window.addEventListener('pos-focus-category', handleFocusCategory)
    return () => window.removeEventListener('pos-focus-category', handleFocusCategory)
  }, [categoriaActiva, categorias])

  const handleCategoryKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    catId: string | null
  ) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = (index + 1) % totalTabs
      categoryRefs.current[next]?.focus()
      setCategoriaActiva(next === 0 ? null : categorias[next - 1].id)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = (index - 1 + totalTabs) % totalTabs
      categoryRefs.current[prev]?.focus()
      setCategoriaActiva(prev === 0 ? null : categorias[prev - 1].id)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('pos-focus-grid'))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('pos-focus-search'))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setCategoriaActiva(catId)
    }
  }

  // Detección de escaneo desde pistola de código de barras USB / Bluetooth (Cache-First instantáneo)
  const handleBarcodeGunScan = useCallback(
    async (code: string) => {
      const codeTrim = code.trim()
      if (!codeTrim) return

      // 0. Comprobar si es código de balanza comercial argentina (EAN-13 con prefijo 20 o 02)
      const parsedBalanza = parsearCodigoBalanza(codeTrim)
      if (parsedBalanza) {
        let matchBalanza: { producto: Producto; pesoKg: number } | null = null
        try {
          const cachedRaw = localStorage.getItem('kiosko_cache_productos')
          if (cachedRaw) {
            const todos: Producto[] = JSON.parse(cachedRaw)
            matchBalanza = buscarProductoPorCodigoBalanza(codeTrim, todos)
          }
        } catch {}

        if (matchBalanza) {
          playScanSound('success')
          agregarProducto(matchBalanza.producto, matchBalanza.pesoKg)
          toast.success(`${matchBalanza.producto.descripcion} (${matchBalanza.pesoKg} kg) agregado`)
          return
        }

        // Si no estaba en caché local, buscar en Supabase por plu_balanza o codigo_barras
        try {
          const { data } = await supabase
            .from('productos')
            .select('*, categoria:categorias(nombre, color)')
            .eq('activo', true)
            .or(`plu_balanza.eq.${parsedBalanza.plu4},plu_balanza.eq.${parsedBalanza.pluCorto},plu_balanza.eq.${parsedBalanza.plu5},codigo_barras.eq.${parsedBalanza.plu4},codigo_barras.eq.${parsedBalanza.pluCorto}`)
            .maybeSingle()

          if (data) {
            playScanSound('success')
            agregarProducto(data, parsedBalanza.pesoKg)
            toast.success(`${data.descripcion} (${parsedBalanza.pesoKg} kg) agregado`)
            return
          }
        } catch (errBalanza) {
          console.warn('Error buscando producto de balanza en Supabase:', errBalanza)
        }
      }

      // 1. Buscar de inmediato en la caché local (< 2ms, sin lag de red)
      let productoEncontrado: Producto | null = null
      try {
        const cachedRaw = localStorage.getItem('kiosko_cache_productos')
        if (cachedRaw) {
          const todos: Producto[] = JSON.parse(cachedRaw)
          productoEncontrado = todos.find((p) => p.activo && p.codigo_barras === codeTrim) || null
        }
      } catch {
        // Ignorar error de parsing
      }

      if (productoEncontrado) {
        if (productoEncontrado.es_pesable) {
          setProductoPesableModal(productoEncontrado)
          setModalBalanzaOpen(true)
          return
        }
        playScanSound('success')
        agregarProducto(productoEncontrado)
        toast.success(`${productoEncontrado.descripcion} agregado`)
        return
      }

      // 2. Si no estaba en caché, buscar en Supabase
      try {
        const { data, error } = await supabase
          .from('productos')
          .select('*, categoria:categorias(nombre, color)')
          .eq('activo', true)
          .eq('codigo_barras', codeTrim)
          .maybeSingle()

        if (error) throw error

        if (data) {
          if (data.es_pesable) {
            setProductoPesableModal(data)
            setModalBalanzaOpen(true)
            return
          }
          playScanSound('success')
          agregarProducto(data)
          toast.success(`${data.descripcion} agregado`)

          // Actualizar caché local agregando el producto nuevo
          try {
            const cachedRaw = localStorage.getItem('kiosko_cache_productos')
            const list: Producto[] = cachedRaw ? JSON.parse(cachedRaw) : []
            if (!list.some((p) => p.id === data.id)) {
              localStorage.setItem('kiosko_cache_productos', JSON.stringify([data, ...list]))
            }
          } catch {}
        } else {
          playScanSound('warning')
          toast.error(`Código no encontrado: ${codeTrim}`)
        }
      } catch (err) {
        console.error('Error procesando código de pistola:', err)
        playScanSound('error')
        toast.error('No se pudo verificar el código de barras en la red')
      }
    },
    [agregarProducto]
  )

  useBarcodeGun({
    onScan: handleBarcodeGunScan,
    enabled: !paymentOpen && !cartModalOpen && !modalScannerOpen && !modalEsperaOpen && !ticketModalOpen && !modalBalanzaOpen && !modalDevolucionOpen,
  })

  // Atajos de teclado para PC de escritorio
  useKeyboardShortcuts(
    {
      onFocusSearch: () => {
        window.dispatchEvent(new CustomEvent('pos-focus-search'))
      },
      onFocusTicket: () => {
        window.dispatchEvent(new CustomEvent('pos-focus-ticket'))
      },
      onCobrar: () => {
        if (cantItems > 0 && !paymentOpen) {
          setPaymentOpen(true)
        }
      },
      onVentasEnEspera: () => {
        setModalEsperaOpen((prev) => !prev)
      },
      onOpenScanner: () => {
        setModalScannerOpen((prev) => !prev)
      },
      onOpenHelp: () => {
        setModalShortcutsOpen((prev) => !prev)
      },
      onEscape: () => {
        if (modalDevolucionOpen) setModalDevolucionOpen(false)
        else if (modalBalanzaOpen) setModalBalanzaOpen(false)
        else if (modalScannerOpen) setModalScannerOpen(false)
        else if (modalShortcutsOpen) setModalShortcutsOpen(false)
        else if (modalEsperaOpen) setModalEsperaOpen(false)
        else if (paymentOpen) setPaymentOpen(false)
        else if (cartModalOpen) setCartModalOpen(false)
        else if (ticketModalOpen) setTicketModalOpen(false)
      },
    },
    true
  )

  return (
    <div className="h-full flex flex-col gap-2.5 max-w-6xl mx-auto pb-28 lg:pb-0">
      {/* Banner compacto de estado de caja */}
      {!sesionActiva ? (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg text-amber-800 dark:text-amber-300 text-xs">
          <span className="truncate">
            <strong>Caja cerrada:</strong> No hay turno iniciado.
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate('/clientes')}
              className="px-2 py-0.5 font-medium text-xs text-amber-900 dark:text-amber-200 hover:underline"
            >
              Clientes
            </button>
            <button
              onClick={() => navigate('/caja')}
              className="px-2.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold active:scale-95 transition-all"
            >
              Abrir turno
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-emerald-800 dark:text-emerald-300 text-xs">
          <span className="truncate">
            <strong>Turno activo</strong> · Fondo: ${sesionActiva.monto_inicial.toLocaleString('es-AR')}
          </span>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => navigate('/clientes')}
              className="font-semibold text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Clientes
            </button>
            <span className="text-gray-300 dark:text-gray-600">·</span>
            <button
              onClick={() => navigate('/caja')}
              className="font-medium underline hover:text-emerald-900 dark:hover:text-emerald-200"
            >
              Arqueo
            </button>
          </div>
        </div>
      )}

      {/* Contenedor principal */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
        {/* Columna de productos */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Buscador compacto y botón de Ítem Libre */}
          <div className="flex items-center gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <ProductSearch
                onSelect={handleSeleccion}
                onOpenScanner={() => setModalScannerOpen(true)}
              />
            </div>
            <button
              type="button"
              onClick={() => setModalLibreOpen(true)}
              className="h-10 px-3.5 flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold whitespace-nowrap active:scale-95 transition-all shadow-xs flex-shrink-0"
              title="Cobrar concepto o monto libre sin código (Varios, fotocopias, etc.)"
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>Ítem Libre</span>
            </button>
            <button
              type="button"
              onClick={() => setModalDevolucionOpen(true)}
              className="h-10 px-3 flex items-center gap-1.5 rounded-xl border border-red-200 dark:border-red-800/80 bg-red-50/70 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/50 text-red-700 dark:text-red-300 text-xs font-bold whitespace-nowrap active:scale-95 transition-all shadow-xs flex-shrink-0"
              title="Registrar devolución de ticket o cambio de producto"
            >
              <span>Devolución</span>
            </button>
          </div>

          {/* Categorías deslizables + Botón Ventas en Espera */}
          <div className="flex items-center gap-1.5 mb-2.5 overflow-x-auto pb-1 scrollbar-hide">
            {/* Botón de ventas en espera si existen */}
            {ventasEnEspera.length > 0 && (
              <button
                onClick={() => setModalEsperaOpen(true)}
                className="px-3 py-1 rounded-lg text-xs font-bold whitespace-nowrap min-h-[32px] bg-amber-500 hover:bg-amber-600 text-white shadow-xs flex-shrink-0 animate-pulse active:scale-95 transition-all"
              >
                En espera ({ventasEnEspera.length})
              </button>
            )}

            <button
              ref={(el) => { categoryRefs.current[0] = el }}
              onClick={() => setCategoriaActiva(null)}
              onKeyDown={(e) => handleCategoryKeyDown(e, 0, null)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap min-h-[32px] transition-all focus:outline-hidden ${
                !categoriaActiva
                  ? 'bg-indigo-600 text-white shadow-xs focus:bg-indigo-700'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-indigo-50/80 dark:focus:bg-gray-700 focus:text-indigo-900 dark:focus:text-white'
              }`}
            >
              Favoritos
            </button>
            {categorias.map((cat, idx) => (
              <button
                key={cat.id}
                ref={(el) => { categoryRefs.current[idx + 1] = el }}
                onClick={() => setCategoriaActiva(cat.id)}
                onKeyDown={(e) => handleCategoryKeyDown(e, idx + 1, cat.id)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold whitespace-nowrap min-h-[32px] transition-all border focus:outline-hidden ${
                  categoriaActiva === cat.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold focus:border-indigo-600'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-indigo-50/80 dark:focus:bg-gray-700 focus:text-indigo-900 dark:focus:text-white'
                }`}
              >
                {cat.nombre}
              </button>
            ))}

            {/* Botón de ayuda de atajos para escritorio */}
            <button
              onClick={() => setModalShortcutsOpen(true)}
              className="px-2.5 py-1 rounded-lg text-xs font-semibold whitespace-nowrap min-h-[32px] bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 flex-shrink-0 active:scale-95 transition-all ml-auto hidden sm:block"
              title="Ver atajos de teclado [F1]"
            >
              Atajos [F1]
            </button>
          </div>

          {/* Grilla compacta de productos */}
          <div className="flex-1 overflow-y-auto p-1.5 pr-2">
            {!categoriaActiva ? (
              <FavoritesGrid productos={favoritos} onSelect={handleSeleccion} />
            ) : (
              <FavoritesGrid productos={productosCategoria} onSelect={handleSeleccion} />
            )}
          </div>
        </div>

        {/* Columna derecha: Ticket en Desktop / Pantallas grandes */}
        <div className="hidden lg:block w-80 lg:w-96 flex-shrink-0">
          <CartPanel onCobrar={() => setPaymentOpen(true)} />
        </div>
      </div>

      {/* ── BARRA INFERIOR DE COBRO PARA CELULARES (iPhone y Android) ── */}
      {cantItems > 0 && (
        <div className="fixed bottom-[calc(56px+env(safe-area-inset-bottom))] left-0 right-0 p-2.5 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 shadow-xl lg:hidden z-30 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
            <button
              onClick={() => setCartModalOpen(true)}
              className="flex flex-col text-left py-0.5"
            >
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
                Ticket ({cantItems} {cantItems === 1 ? 'item' : 'items'}) ↗
              </span>
              <span className="text-lg font-black text-gray-900 dark:text-white">
                {formatPrecio(total)}
              </span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCartModalOpen(true)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 font-medium text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 active:scale-95 transition-all"
              >
                Ver ticket
              </button>
              <button
                onClick={() => setPaymentOpen(true)}
                className="px-4 py-1.5 rounded-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm text-sm active:scale-95 transition-all"
              >
                Cobrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ticket para Celular */}
      <Modal
        isOpen={cartModalOpen}
        onClose={() => setCartModalOpen(false)}
        title="Ticket de Venta"
        size="md"
      >
        <div className="h-[65dvh] -mx-2">
          <CartPanel
            onCobrar={() => {
              setCartModalOpen(false)
              setPaymentOpen(true)
            }}
          />
        </div>
      </Modal>

      {/* Modal Ventas en Espera */}
      <Modal
        isOpen={modalEsperaOpen}
        onClose={() => setModalEsperaOpen(false)}
        title={`Ventas en Espera (${ventasEnEspera.length})`}
        size="md"
      >
        <div className="space-y-3">
          {ventasEnEspera.length === 0 ? (
            <p className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
              No hay ventas en espera actualmente.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {ventasEnEspera.map((v) => (
                <div
                  key={v.id}
                  className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900 dark:text-white">
                        {v.nota || 'Venta sin referencia'}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {formatFecha(v.fecha)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                      {v.items.map((i) => `${i.cantidad}x ${i.producto.descripcion}`).join(', ')}
                    </p>
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                      Total: {formatPrecio(v.total)} ({v.items.reduce((s, i) => s + i.cantidad, 0)} items)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleRecuperar(v.id)}
                      className="font-semibold shadow-xs"
                    >
                      Recuperar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 text-xs font-semibold"
                      onClick={() => eliminarVentaEnEspera(v.id)}
                    >
                      Descartar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2">
            <Button
              variant="secondary"
              fullWidth
              size="sm"
              onClick={() => setModalEsperaOpen(false)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de cobro */}
      <PaymentModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onVentaCompletada={handleVentaCompletada}
      />

      {/* Modal de comprobante térmico / WhatsApp */}
      <TicketReceiptModal
        isOpen={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        ticket={ticketReciente}
      />

      {/* Modal de escaneo por cámara */}
      <BarcodeScannerModal
        isOpen={modalScannerOpen}
        onClose={() => setModalScannerOpen(false)}
        onProductScanned={(producto) => {
          handleSeleccion(producto)
        }}
      />

      {/* Modal de ingreso de peso para artículos de balanza / fiambrería */}
      <BalanzaManualModal
        isOpen={modalBalanzaOpen}
        onClose={() => {
          setModalBalanzaOpen(false)
          setProductoPesableModal(null)
        }}
        producto={productoPesableModal}
        onConfirmar={(pesoKg) => {
          if (productoPesableModal) {
            agregarProducto(productoPesableModal, pesoKg)
            playScanSound('success')
            toast.success(`${productoPesableModal.descripcion} (${pesoKg} kg) agregado`)
          }
        }}
      />

      {/* Modal de ayuda con atajos de teclado */}
      <KeyboardShortcutsModal
        isOpen={modalShortcutsOpen}
        onClose={() => setModalShortcutsOpen(false)}
      />

      {/* Modal de cobro de ítem libre */}
      <ArticuloLibreModal
        isOpen={modalLibreOpen}
        onClose={() => setModalLibreOpen(false)}
      />

      {/* Modal de devoluciones y cambios de venta */}
      <DevolucionModal
        isOpen={modalDevolucionOpen}
        onClose={() => setModalDevolucionOpen(false)}
        onDevolucionExitosa={() => {
          cargarFavoritos()
          verificarSesionActiva()
        }}
      />
    </div>
  )
}
