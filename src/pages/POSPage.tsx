import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCartStore } from '../stores/cartStore'
import { useCajaStore } from '../stores/cajaStore'
import { ProductSearch } from '../components/pos/ProductSearch'
import { FavoritesGrid } from '../components/pos/FavoritesGrid'
import { CartPanel } from '../components/pos/CartPanel'
import { PaymentModal } from '../components/pos/PaymentModal'
import type { Producto, Categoria } from '../types/database'

export function POSPage() {
  const navigate = useNavigate()
  const { sesionActiva, verificarSesionActiva } = useCajaStore()
  const [favoritos, setFavoritos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [productosCategoria, setProductosCategoria] = useState<Producto[]>([])
  const [paymentOpen, setPaymentOpen] = useState(false)
  const { agregarProducto } = useCartStore()

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
    cargarFavoritos() // Refresh stock data
    verificarSesionActiva()
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {/* Aviso de estado de caja */}
      {!sesionActiva ? (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-xl text-amber-800 dark:text-amber-300 text-xs sm:text-sm">
          <div>
            <span className="font-bold">Caja cerrada:</span> No iniciaste turno. Podés vender pero las operaciones no quedarán vinculadas a un arqueo.
          </div>
          <button
            onClick={() => navigate('/caja')}
            className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-semibold self-start sm:self-auto transition-colors"
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

      <div className="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
        {/* Columna izquierda: búsqueda + productos */}
        <div className="flex-1 flex flex-col min-h-0">
          {/* Buscador */}
          <div className="mb-4">
            <ProductSearch onSelect={handleSeleccion} />
          </div>

        {/* Tabs: Favoritos / Categorías */}
        <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
          <button
            onClick={() => setCategoriaActiva(null)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              !categoriaActiva
                ? 'bg-indigo-600 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            }`}
          >
            Favoritos
          </button>
          {categorias.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setCategoriaActiva(cat.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                categoriaActiva === cat.id
                  ? 'text-white'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
              style={categoriaActiva === cat.id ? { backgroundColor: cat.color } : {}}
            >
              {cat.nombre}
            </button>
          ))}
        </div>

        {/* Grilla de productos */}
        <div className="flex-1 overflow-y-auto pr-1">
          {!categoriaActiva ? (
            <FavoritesGrid productos={favoritos} onSelect={handleSeleccion} />
          ) : (
            <FavoritesGrid productos={productosCategoria} onSelect={handleSeleccion} />
          )}
        </div>
      </div>

      {/* Columna derecha: carrito */}
      <div className="w-full lg:w-96 flex-shrink-0">
        <CartPanel onCobrar={() => setPaymentOpen(true)} />
      </div>

      {/* Modal de cobro */}
      <PaymentModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onVentaCompletada={handleVentaCompletada}
      />
      </div>
    </div>
  )
}
