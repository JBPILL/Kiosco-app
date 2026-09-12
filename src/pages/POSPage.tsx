import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCartStore } from '../stores/cartStore'
import { useCajaStore } from '../stores/cajaStore'
import { formatPrecio } from '../lib/utils'
import { ProductSearch } from '../components/pos/ProductSearch'
import { FavoritesGrid } from '../components/pos/FavoritesGrid'
import { CartPanel } from '../components/pos/CartPanel'
import { PaymentModal } from '../components/pos/PaymentModal'
import { Modal } from '../components/ui/Modal'
import type { Producto, Categoria } from '../types/database'

export function POSPage() {
  const navigate = useNavigate()
  const { sesionActiva, verificarSesionActiva } = useCajaStore()
  const [favoritos, setFavoritos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [productosCategoria, setProductosCategoria] = useState<Producto[]>([])
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [cartModalOpen, setCartModalOpen] = useState(false)

  const { agregarProducto, totalItems, totalMonto } = useCartStore()
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

  const handleSeleccion = (producto: Producto) => {
    agregarProducto(producto)
  }

  const handleVentaCompletada = () => {
    cargarFavoritos() // Refrescar stock
    verificarSesionActiva()
    setCartModalOpen(false)
  }

  return (
    <div className="h-full flex flex-col gap-2.5 max-w-6xl mx-auto pb-16 lg:pb-0">
      {/* Banner compacto de estado de caja */}
      {!sesionActiva ? (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg text-amber-800 dark:text-amber-300 text-xs">
          <span className="truncate">
            <strong>Caja cerrada:</strong> No hay turno iniciado.
          </span>
          <button
            onClick={() => navigate('/caja')}
            className="px-2.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold flex-shrink-0 active:scale-95 transition-all"
          >
            Abrir turno
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-lg text-emerald-800 dark:text-emerald-300 text-xs">
          <span className="truncate">
            <strong>Turno activo</strong> · Fondo: ${sesionActiva.monto_inicial.toLocaleString('es-AR')}
          </span>
          <button
            onClick={() => navigate('/caja')}
            className="font-medium underline hover:text-emerald-900 dark:hover:text-emerald-200 flex-shrink-0"
          >
            Arqueo / Cierre
          </button>
        </div>
      )}

      {/* Contenedor principal */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0">
        {/* Columna de productos */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Buscador compacto */}
          <div className="mb-2">
            <ProductSearch onSelect={handleSeleccion} />
          </div>

          {/* Categorías deslizables */}
          <div className="flex gap-1.5 mb-2.5 overflow-x-auto pb-1 scrollbar-hide">
            <button
              onClick={() => setCategoriaActiva(null)}
              className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[32px] transition-colors ${
                !categoriaActiva
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Favoritos
            </button>
            {categorias.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoriaActiva(cat.id)}
                className={`px-3 py-1 rounded-lg text-xs font-medium whitespace-nowrap min-h-[32px] transition-colors border ${
                  categoriaActiva === cat.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {cat.nombre}
              </button>
            ))}
          </div>

          {/* Grilla compacta de productos */}
          <div className="flex-1 overflow-y-auto pr-0.5">
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
        <div className="fixed bottom-0 left-0 right-0 p-2.5 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 shadow-xl lg:hidden pb-[max(10px,env(safe-area-inset-bottom))] z-30 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
            <button
              onClick={() => setCartModalOpen(true)}
              className="flex flex-col text-left py-0.5"
            >
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400">
                Ticket ({cantItems} {cantItems === 1 ? 'item' : 'items'}) ↗
              </span>
              <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
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
        <div className="h-[60dvh] -mx-2">
          <CartPanel
            onCobrar={() => {
              setCartModalOpen(false)
              setPaymentOpen(true)
            }}
          />
        </div>
      </Modal>

      {/* Modal de cobro */}
      <PaymentModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onVentaCompletada={handleVentaCompletada}
      />
    </div>
  )
}
