import { IndicatorCard } from '../components/ui/IndicatorCard'
import { useState } from 'react'
import { useProducts } from '../hooks/useProducts'
import { CategoryManager } from '../components/catalogo/CategoryManager'
import { ProductTable } from '../components/catalogo/ProductTable'
import { ProductForm } from '../components/catalogo/ProductForm'
import { SiembraCatalogoModal } from '../components/catalogo/SiembraCatalogoModal'
import { AumentoPreciosModal } from '../components/catalogo/AumentoPreciosModal'
import { PreciosEnvasesModal } from '../components/catalogo/PreciosEnvasesModal'
import { EtiquetasGondolaModal } from '../components/catalogo/EtiquetasGondolaModal'
import { ImportarCatalogoModal } from '../components/catalogo/ImportarCatalogoModal'
import { exportarCatalogoExcel } from '../lib/exportUtils'
import { IconExportar, IconImportar } from '../components/ui/Icons'
import { clearCachedProductos } from '../lib/utils'
import { useAuthStore } from '../stores/authStore'
import { useTenantConfig } from '../hooks/useTenantConfig'
import toast from 'react-hot-toast'
import type { Producto } from '../types/database'
import type { ProductFormData } from '../components/catalogo/ProductForm'

export function CatalogoPage() {
  const { kiosco } = useAuthStore()
  const { tieneEnvases, esFotocopiadora } = useTenantConfig()
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
  const [siembraOpen, setSiembraOpen] = useState(false)
  const [importarOpen, setImportarOpen] = useState(false)
  const [exportando, setExportando] = useState(false)
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
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="space-y-6">
        <div className="shrink-0">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Catálogo de Productos</h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">Organizá los artículos del comercio, sus precios, categorías y accesos rápidos de venta</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <IndicatorCard label="Productos del catálogo" valor={productos.length} detalle="Artículos disponibles en la lista cargada" icono="caja" />
          <IndicatorCard label="Categorías" valor={categorias.length} detalle="Grupos para organizar la búsqueda en el punto de venta" icono="capas" tono="teal" />
          <IndicatorCard label="Favoritos" valor={productos.filter((p) => p.es_favorito).length} detalle="Accesos rápidos para los artículos más usados" icono="oferta" tono="purple" />
          <IndicatorCard label="Sin existencias" valor={productos.filter((p) => p.stock_actual <= 0).length} detalle="Artículos de la lista con stock en cero o negativo" icono="alerta" tono="amber" />
        </div>
        {/* Barra unificada de herramientas y acciones */}
        <div className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 shadow-md dark:shadow-black/20">
          <h2 className="text-base font-bold text-gray-900 dark:text-gray-100">Herramientas del catálogo</h2>
          <p className="mt-1 mb-4 text-xs leading-relaxed text-gray-500 dark:text-gray-400">Actualizá precios, prepará etiquetas o intercambiá listas con Excel. Para modificar un artículo individual, usá Editar en el listado.</p>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setAumentoOpen(true)}
              className="min-h-10 px-3 text-xs sm:text-sm font-semibold rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 transition-all text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-300 shadow-sm cursor-pointer whitespace-nowrap inline-flex items-center justify-center"
            >
              Subir Precios en %
            </button>
            {tieneEnvases && (
              <button
                type="button"
                onClick={() => setEnvasesOpen(true)}
                className="min-h-10 px-3 text-xs sm:text-sm font-semibold rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 transition-all text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-300 shadow-sm cursor-pointer whitespace-nowrap inline-flex items-center justify-center"
              >
                Precios de Envases
              </button>
            )}
            <button
              type="button"
              onClick={() => setEtiquetasOpen(true)}
              className="min-h-10 px-3 text-xs sm:text-sm font-semibold rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 transition-all text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-300 shadow-sm cursor-pointer whitespace-nowrap inline-flex items-center justify-center"
              title="Imprimir etiquetas de góndola y códigos de barras"
            >
              Etiquetas de Precios
            </button>
            <button
              type="button"
              onClick={() => setImportarOpen(true)}
              className="min-h-10 px-3 text-xs sm:text-sm font-semibold rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 transition-all text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-300 shadow-sm cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1.5"
              title="Importar lista de precios o catálogo desde archivo Excel (.xlsx) o CSV"
            >
              <IconImportar />
              <span>Importar</span>
            </button>
            <button
              type="button"
              onClick={async () => {
                if (productos.length === 0) {
                  toast.error('No hay productos en el catálogo para exportar')
                  return
                }
                setExportando(true)
                try {
                  await exportarCatalogoExcel(productos, categorias, kiosco?.nombre || 'Mi Comercio')
                  toast.success('Catálogo exportado a Excel')
                } catch (e: any) {
                  toast.error(`Error al exportar: ${e?.message || 'Error desconocido'}`)
                } finally {
                  setExportando(false)
                }
              }}
              disabled={exportando}
              className="min-h-10 px-3 text-xs sm:text-sm font-semibold rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 transition-all text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-300 shadow-sm cursor-pointer whitespace-nowrap inline-flex items-center justify-center gap-1.5"
              title="Descargar catálogo completo valorizado en Excel (.xlsx)"
            >
              <IconExportar />
              <span>{exportando ? 'Exportando...' : 'Exportar Excel'}</span>
            </button>
            <button
              type="button"
              onClick={() => setSiembraOpen(true)}
              className="min-h-10 px-3 text-xs sm:text-sm font-semibold rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/30 transition-all text-gray-700 dark:text-gray-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 hover:text-indigo-600 dark:hover:text-indigo-300 shadow-sm cursor-pointer whitespace-nowrap inline-flex items-center justify-center"
              title={
                esFotocopiadora
                  ? 'Cargar catálogo precargado de librería, fotocopias y papelería con precios sugeridos'
                  : 'Cargar catálogo precargado de kiosco argentino con códigos de barras oficiales y precios sugeridos'
              }
            >
              <svg className="w-3.5 h-3.5 mr-1.5 text-emerald-600 dark:text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 10a6 6 0 0 0-6-6H3v2a6 6 0 0 0 6 6h3" />
                <path d="M12 14a6 6 0 0 1 6-6h3v2a6 6 0 0 1-6 6h-3" />
                <line x1="12" y1="10" x2="12" y2="21" />
              </svg>
              <span>{esFotocopiadora ? 'Catálogo Librería' : 'Catálogo Kiosco'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Gestión de categorías colapsable */}
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 overflow-hidden">
        <button
          type="button"
          aria-expanded={categoriasOpen}
          aria-controls="catalogo-categorias"
          onClick={() => setCategoriasOpen((o) => !o)}
          className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-100/70 dark:hover:bg-gray-700/60 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
        >
          <span>Gestionar Categorías</span>
          <span className="text-gray-400 text-xs">{categoriasOpen ? '▲ Ocultar' : '▼ Ver'}</span>
        </button>
        {categoriasOpen && (
          <div id="catalogo-categorias" className="px-4 pb-4 border-t border-gray-100 dark:border-gray-700 pt-3">
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 p-3 sm:p-4">
        <div className="mb-5 border-b border-gray-100 dark:border-gray-700 pb-4">
          <span className="inline-flex rounded-lg bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-600 dark:text-indigo-300">Gestión de artículos</span>
          <h2 className="mt-2 text-lg font-bold text-gray-900 dark:text-gray-100">Productos y precios</h2>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Buscá por nombre o código, filtrá por categoría o proveedor y marcá tus favoritos.</p>
        </div>
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

      {/* Modal de importación de catálogo (Excel/CSV) */}
      <ImportarCatalogoModal
        isOpen={importarOpen}
        onClose={() => setImportarOpen(false)}
        categorias={categorias}
        onImportCompletado={async () => {
          await cargarCategorias()
          await cargarProductos()
        }}
      />
    </div>
  )
}
