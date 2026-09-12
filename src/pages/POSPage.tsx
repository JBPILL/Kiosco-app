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
    <div className="h-full flex flex-col gap-3 pb-20 lg:pb-0">
      {/* Aviso de estado de caja */}
      {!sesionActiva ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-amber-800 dark:text-amber-300 text-xs sm:text-sm">
          <div>
            <span className="font-bold">Caja cerrada:</span> No iniciaste turno. Podés vender pero las operaciones no quedarán vinculadas a un arqueo.
          </div>
          <button
            onClick={() => navigate('/caja')}
            className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold self-start sm:self-auto active:scale-95 transition-all"
          >
            Abrir turno de caja
          </button>
        </div>
      ) : (
        <div className="flex items-center justify-between px-3 py-2 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 rounded-xl text-emerald-800 dark:text-emerald-300 text-xs">
          <div>
            <span className="font-semibold">Turno de caja activo</span> · Fondo inicial: ${sesionActiva.monto_inicial.toLocaleString('es-AR')}
          </div>
          <button
            onClick={() => navigate('/caja')}
            className="font-medium underline hover:text-emerald-900 dark:hover:text-emerald-200"
          >
            Ver arqueo / Cerrar
          </button>
        </div>
      )}

      {/* Contenedor principal responsive */}
      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* Columna izquierda: buscador y grilla de productos */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Buscador */}
          <div className="mb-3">
            <ProductSearch onSelect={handleSeleccion} />
          </div>

          {/* Categorías deslizables horizontalmente */}
          <div className="flex gap-2 mb-3 overflow-x-auto pb-1.5 scrollbar-hide -mx-1 px-1">
            <button
              onClick={() => setCategoriaActiva(null)}
              className={`px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap min-h-[38px] transition-colors ${
                !categoriaActiva
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
              }`}
            >
              Favoritos
            </button>
            {categorias.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setCategoriaActiva(cat.id)}
                className={`px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap min-h-[38px] transition-colors border ${
                  categoriaActiva === cat.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-semibold shadow-sm'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {cat.nombre}
              </button>
            ))}
          </div>

          {/* Grilla de productos con scroll suave */}
          <div className="flex-1 overflow-y-auto pr-0.5">
            {!categoriaActiva ? (
              <FavoritesGrid productos={favoritos} onSelect={handleSeleccion} />
            ) : (
              <FavoritesGrid productos={productosCategoria} onSelect={handleSeleccion} />
            )}
          </div>
        </div>

        {/* Columna derecha: Ticket en Pantallas Grandes (Desktop / Tablet) */}
        <div className="hidden lg:block w-96 flex-shrink-0">
          <CartPanel onCobrar={() => setPaymentOpen(true)} />
        </div>
      </div>

      {/* ── BARRA FLOTANTE DE COBRO EN CELULARES (iPhone 16/17 y modernos) ── */}
      {cantItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 shadow-2xl lg:hidden pb-[max(12px,env(safe-area-inset-bottom))] z-30 animate-in slide-in-from-bottom-3 duration-150">
          <div className="flex items-center justify-between gap-3 max-w-lg mx-auto">
            <button
              onClick={() => setCartModalOpen(true)}
              className="flex flex-col text-left py-0.5"
            >
              <span className="text-xs font-semibold text-indigo-600 dark:text-indigo-400">
                Ver ticket ({cantItems} {cantItems === 1 ? 'item' : 'items'}) ↗
              </span>
              <span className="text-xl font-bold text-gray-900 dark:text-gray-100">
                {formatPrecio(total)}
              </span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCartModalOpen(true)}
                className="px-3.5 py-2.5 rounded-xl border border-gray-300 dark:border-gray-600 font-semibold text-xs text-gray-700 dark:text-gray-200 bg-gray-50 dark:bg-gray-700 active:scale-95 transition-all"
              >
                Modificar
              </button>
              <button
                onClick={() => setPaymentOpen(true)}
                className="px-5 py-2.5 rounded-xl font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md text-sm active:scale-95 transition-all"
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

      {/* Modal de cobro */}
      <PaymentModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onVentaCompletada={handleVentaCompletada}
      />
    </div>
  )
}
