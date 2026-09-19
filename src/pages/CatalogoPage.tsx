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
import { Button } from '../components/ui/Button'
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Catálogo de Productos</h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Administrá tus productos, precios y categorías</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="success"
            size="sm"
            onClick={() => setAumentoOpen(true)}
            className="flex items-center gap-1.5 shadow-xs font-semibold"
          >
            Aumento Masivo %
          </Button>
          <Button
            variant="success"
            size="sm"
            onClick={() => setEnvasesOpen(true)}
            className="flex items-center gap-1.5 shadow-xs font-semibold"
          >
            Precios de Envases
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setEtiquetasOpen(true)}
            className="flex items-center gap-1.5 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/30 font-semibold"
            title="Imprimir etiquetas de góndola y códigos de barras"
          >
            Etiquetas Góndola
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setImportarOpen(true)}
            className="flex items-center gap-1.5 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
          >
            Importar (.XLSX / .CSV)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exportarCatalogoExcel(productos, categorias, kiosco?.nombre)}
            className="flex items-center gap-1.5 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
            title="Descargar catálogo completo y valuación en formato Excel corporativo (.xlsx)"
          >
            Exportar (.XLSX)
          </Button>
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
