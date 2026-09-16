import { useState, useEffect } from 'react'
import { useProducts } from '../hooks/useProducts'
import { CategoryManager } from '../components/catalogo/CategoryManager'
import { ProductTable } from '../components/catalogo/ProductTable'
import { ProductForm } from '../components/catalogo/ProductForm'
import { ComboBuilderModal } from '../components/catalogo/ComboBuilderModal'
import { ImportarCatalogoModal } from '../components/catalogo/ImportarCatalogoModal'
import { AumentoPreciosModal } from '../components/catalogo/AumentoPreciosModal'
import { exportarCatalogoCSV } from '../lib/exportUtils'
import { useAuthStore } from '../stores/authStore'
import { useComboStore } from '../stores/comboStore'
import { Button } from '../components/ui/Button'
import type { Producto } from '../types/database'
import type { ProductFormData } from '../components/catalogo/ProductForm'

export function CatalogoPage() {
  const { kiosco, usuario } = useAuthStore()
  const { cargarCombos } = useComboStore()
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
  const [productoEditar, setProductoEditar] = useState<Producto | null>(null)
  const [comboBuilderOpen, setComboBuilderOpen] = useState(false)
  const [comboAEditar, setComboAEditar] = useState<Producto | null>(null)

  useEffect(() => {
    cargarCombos(usuario?.kiosco_id || kiosco?.id || undefined)
  }, [cargarCombos, usuario?.kiosco_id, kiosco?.id])

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

  const handleConfigurarCombo = (producto: Producto) => {
    setComboAEditar(producto)
    setComboBuilderOpen(true)
  }

  return (
    <div className="max-w-4xl mx-auto space-y-3.5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100">Catálogo de Productos</h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400">Administrá tus productos, precios y categorías</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAumentoOpen(true)}
            className="flex items-center gap-1.5 border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-950/30"
          >
            Aumento Masivo %
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => exportarCatalogoCSV(productos, categorias, kiosco?.nombre)}
            className="flex items-center gap-1.5 border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            Exportar (.CSV)
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setImportarOpen(true)}
            className="flex items-center gap-1.5 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/30"
          >
            Importar (.CSV)
          </Button>
          <Button size="sm" onClick={handleNuevo}>
            + Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Gestión de categorías compacta */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-3 sm:p-4">
        <CategoryManager
          categorias={categorias}
          onCrear={crearCategoria}
          onActualizar={actualizarCategoria}
          onEliminar={eliminarCategoria}
        />
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
          onConfigurarCombo={handleConfigurarCombo}
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

      {/* Modal para configurar combo y componentes */}
      <ComboBuilderModal
        isOpen={comboBuilderOpen}
        onClose={() => {
          setComboBuilderOpen(false)
          setComboAEditar(null)
        }}
        comboProducto={comboAEditar}
        todosLosProductos={productos}
        onGuardado={async () => {
          await cargarProductos()
          await cargarCombos(usuario?.kiosco_id || kiosco?.id || undefined)
        }}
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
    </div>
  )
}
