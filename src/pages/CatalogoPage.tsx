import { useState } from 'react'
import { useProducts } from '../hooks/useProducts'
import { CategoryManager } from '../components/catalogo/CategoryManager'
import { ProductTable } from '../components/catalogo/ProductTable'
import { ProductForm } from '../components/catalogo/ProductForm'
import { ImportarCatalogoModal } from '../components/catalogo/ImportarCatalogoModal'
import { AumentoPreciosModal } from '../components/catalogo/AumentoPreciosModal'
import { PreciosEnvasesModal } from '../components/catalogo/PreciosEnvasesModal'
import { EtiquetasGondolaModal } from '../components/catalogo/EtiquetasGondolaModal'
import { exportarCatalogoExcel } from '../lib/exportUtils'
import { useAuthStore } from '../stores/authStore'
import type { Producto } from '../types/database'
import type { ProductFormData } from '../components/catalogo/ProductForm'

export function CatalogoPage() {
  const { kiosco } = useAuthStore()
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
    toggleFavorito,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
  } = useProducts()

  const [formOpen, setFormOpen] = useState(false)
  const [importarOpen, setImportarOpen] = useState(false)
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

  return (
    <div className="max-w-6xl mx-auto space-y-3.5">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 sm:gap-4">
        <div className="shrink-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">Catálogo de Productos</h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">Administrá tus productos, precios y categorías</p>
        </div>
        {/* Grupos de botones en una sola fila en 2 bloques separados */}
        <div className="flex items-center flex-nowrap gap-2 sm:gap-2.5 overflow-x-auto scrollbar-hide max-w-full py-0.5 self-start lg:self-auto">
          {/* Bloque 1: Precios y Góndola */}
          <div className="flex items-center flex-nowrap bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setAumentoOpen(true)}
              className="px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0"
            >
              Subir Precios en %
            </button>
            <button
              type="button"
              onClick={() => setEnvasesOpen(true)}
              className="px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0"
            >
              Precios de Envases
            </button>
            <button
              type="button"
              onClick={() => setEtiquetasOpen(true)}
              className="px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              title="Imprimir etiquetas de góndola y códigos de barras"
            >
              Etiquetas de Precios
            </button>
          </div>

          {/* Bloque 2: Importar / Exportar */}
          <div className="flex items-center flex-nowrap bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setImportarOpen(true)}
              className="px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0"
              title="Importar productos desde archivo Excel (.xlsx) o CSV"
            >
              Importar
            </button>
            <button
              type="button"
              onClick={() => exportarCatalogoExcel(productos, categorias, kiosco?.nombre)}
              className="px-3 py-1.5 text-xs sm:text-sm font-semibold rounded-lg transition-all text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-700 hover:shadow-xs cursor-pointer whitespace-nowrap shrink-0"
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
      <PreciosEnvasesModal
        isOpen={envasesOpen}
        onClose={() => setEnvasesOpen(false)}
        productos={productos}
        onActualizarProducto={actualizarProducto}
        onRecargarProductos={cargarProductos}
      />

      {/* Modal de impresión de etiquetas de góndola */}
      <EtiquetasGondolaModal
        isOpen={etiquetasOpen}
        onClose={() => setEtiquetasOpen(false)}
        productos={productos}
        categorias={categorias}
        kioscoNombre={kiosco?.nombre}
      />
    </div>
  )
}
