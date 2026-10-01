import { useState } from 'react'
import { useProducts } from '../hooks/useProducts'
import { CategoryManager } from '../components/catalogo/CategoryManager'
import { ProductTable } from '../components/catalogo/ProductTable'
import { ProductForm } from '../components/catalogo/ProductForm'
import { ImportarCatalogoModal } from '../components/catalogo/ImportarCatalogoModal'
import { SiembraCatalogoModal } from '../components/catalogo/SiembraCatalogoModal'
import { AumentoPreciosModal } from '../components/catalogo/AumentoPreciosModal'
import { PreciosEnvasesModal } from '../components/catalogo/PreciosEnvasesModal'
import { EtiquetasGondolaModal } from '../components/catalogo/EtiquetasGondolaModal'
import { exportarCatalogoExcel } from '../lib/exportUtils'
import { clearCachedProductos } from '../lib/utils'
import { useAuthStore } from '../stores/authStore'
import { useTenantConfig } from '../hooks/useTenantConfig'
import toast from 'react-hot-toast'
import type { Producto } from '../types/database'
import type { ProductFormData } from '../components/catalogo/ProductForm'

export function CatalogoPage() {
  const { kiosco } = useAuthStore()
  const { tieneEnvases } = useTenantConfig()
  const {
    productos,
    categorias,
    cargando,
    busqueda,
    setBusqueda,
    categoriaFiltro,
    setCategoriaFiltro,
    cargarProductos,
    cargarCategorias,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    purgarProductosHuerfanos,
    toggleFavorito,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
  } = useProducts()

  const [formOpen, setFormOpen] = useState(false)
  const [importarOpen, setImportarOpen] = useState(false)
  const [siembraOpen, setSiembraOpen] = useState(false)
  const [aumentoOpen, setAumentoOpen] = useState(false)
  const [envasesOpen, setEnvasesOpen] = useState(false)
  const [etiquetasOpen, setEtiquetasOpen] = useState(false)
  const [productoEditar, setProductoEditar] = useState<Producto | null>(null)
  const [categoriasOpen, setCategoriasOpen] = useState(false)

  const handleNuevo = () => {
    setProductoEditar(null)
    setFormOpen(true)
  }

  const handleEditar = (producto: Producto) => {
    setProductoEditar(producto)
    setFormOpen(true)
  }

  const handleGuardar = async (data: ProductFormData): Promise<boolean> => {
    if (productoEditar) {
      return actualizarProducto(productoEditar.id, data)
    }
    const res = await crearProducto(data as Omit<Producto, 'id' | 'kiosco_id' | 'fecha_creacion' | 'fecha_actualizacion' | 'activo'>)
    return Boolean(res)
  }

  const handleSincronizar = async () => {
    try {
      clearCachedProductos(kiosco?.id)
      localStorage.removeItem('kiosko_cache_categorias')
      if (kiosco?.id) {
        localStorage.removeItem(`kiosko_cache_categorias_${kiosco.id}`)
      }
    } catch {}
    await Promise.all([cargarCategorias(), cargarProductos()])
    toast.success('Catálogo sincronizado con el servidor')
  }

  return (
    <div className="max-w-6xl mx-auto space-y-3.5">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 sm:gap-4">
        <div className="shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Catálogo de Productos</h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">Administrá tus productos, precios y categorías</p>
        </div>
        {/* Grupos de botones adaptables para que nunca desborden en pantallas medianas ni con zoom */}
        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5 max-w-full py-0.5">
          {/* Bloque 1: Precios y Góndola */}
          <div className="flex items-center flex-nowrap bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setAumentoOpen(true)}
              className="h-8 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center justify-center"
            >
              Subir Precios en %
            </button>
            {tieneEnvases && (
              <button
                type="button"
                onClick={() => setEnvasesOpen(true)}
                className="h-8 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center justify-center"
              >
                Precios de Envases
              </button>
            )}
            <button
              type="button"
              onClick={() => setEtiquetasOpen(true)}
              className="h-8 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center justify-center"
              title="Imprimir etiquetas de góndola y códigos de barras"
            >
              Etiquetas de Precios
            </button>
          </div>

          {/* Bloque 2: Importar / Exportar / Catálogo Kiosco */}
          <div className="flex items-center flex-nowrap bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setSiembraOpen(true)}
              className="h-8 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center justify-center"
              title="Cargar catálogo precargado de kiosco argentino con códigos de barras oficiales y precios sugeridos"
            >
              <svg className="w-3.5 h-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 10a6 6 0 0 0-6-6H3v2a6 6 0 0 0 6 6h3" />
                <path d="M12 14a6 6 0 0 1 6-6h3v2a6 6 0 0 1-6 6h-3" />
                <line x1="12" y1="10" x2="12" y2="21" />
              </svg>
              <span>Catálogo Kiosco</span>
            </button>
            <button
              type="button"
              onClick={() => setImportarOpen(true)}
              className="h-8 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center justify-center"
              title="Importar productos desde archivo Excel (.xlsx) o CSV"
            >
              Importar
            </button>
            <button
              type="button"
              onClick={() => exportarCatalogoExcel(productos, categorias, kiosco?.nombre)}
              className="h-8 px-3 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0 inline-flex items-center justify-center"
              title="Descargar catálogo completo y valuación en formato Excel corporativo (.xlsx)"
            >
              Exportar
            </button>
          </div>
        </div>
      </div>

      {/* Gestión de categorías colapsable */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        <button
          type="button"
          onClick={() => setCategoriasOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100/70 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
        >
          <span>Gestionar Categorías</span>
          <span className="text-gray-400 text-xs">{categoriasOpen ? '▲ Ocultar' : '▼ Ver'}</span>
        </button>
        {categoriasOpen && (
          <div className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
            <CategoryManager
              categorias={categorias}
              onCrear={crearCategoria}
              onActualizar={actualizarCategoria}
              onEliminar={eliminarCategoria}
            />
          </div>
        )}
      </div>

      {/* Tabla y lista de productos */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
        <ProductTable
          productos={productos}
          categorias={categorias}
          busqueda={busqueda}
          onBusquedaChange={setBusqueda}
          categoriaFiltro={categoriaFiltro}
          onCategoriaChange={setCategoriaFiltro}
          onEditar={handleEditar}
          onEliminar={eliminarProducto}
          onToggleFavorito={toggleFavorito}
          onNuevo={handleNuevo}
          cargando={cargando}
          onPurgarHuerfanos={purgarProductosHuerfanos}
          onSincronizar={handleSincronizar}
        />
      </div>

      {/* Modal de producto */}
      <ProductForm
        isOpen={formOpen}
        onClose={() => setFormOpen(false)}
        categorias={categorias}
        producto={productoEditar}
        onGuardar={handleGuardar}
      />

      {/* Modal de importación masiva CSV */}
      <ImportarCatalogoModal
        isOpen={importarOpen}
        onClose={() => setImportarOpen(false)}
        onImportCompletado={async () => {
          await cargarCategorias()
          await cargarProductos()
        }}
        categorias={categorias}
      />

      {/* Modal de aumento masivo de precios */}
      <AumentoPreciosModal
        isOpen={aumentoOpen}
        onClose={() => setAumentoOpen(false)}
        categorias={categorias}
        productos={productos}
        onAumentoAplicado={async () => {
          await cargarProductos()
        }}
      />

      {/* Modal de modificación de precios de envases retornables */}
      {tieneEnvases && (
        <PreciosEnvasesModal
          isOpen={envasesOpen}
          onClose={() => setEnvasesOpen(false)}
          productos={productos}
          onActualizarProducto={actualizarProducto}
          onRecargarProductos={cargarProductos}
        />
      )}

      {/* Modal de impresión de etiquetas de góndola */}
      <EtiquetasGondolaModal
        isOpen={etiquetasOpen}
        onClose={() => setEtiquetasOpen(false)}
        productos={productos}
        categorias={categorias}
        kioscoNombre={kiosco?.nombre}
      />

      {/* Modal de siembra masiva de catálogo semilla argentino */}
      <SiembraCatalogoModal
        isOpen={siembraOpen}
        onClose={() => setSiembraOpen(false)}
        categoriasExistentes={categorias}
        onSiembraCompletada={async () => {
          await cargarCategorias()
          await cargarProductos()
        }}
      />
    </div>
  )
}
