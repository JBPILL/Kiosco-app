import { useState } from 'react'
import { useProducts } from '../hooks/useProducts'
import { CategoryManager } from '../components/catalogo/CategoryManager'
import { ProductTable } from '../components/catalogo/ProductTable'
import { ProductForm } from '../components/catalogo/ProductForm'
import type { Producto } from '../types/database'
import type { ProductFormData } from '../components/catalogo/ProductForm'

export function CatalogoPage() {
  const {
    productos,
    categorias,
    cargando,
    busqueda,
    setBusqueda,
    categoriaFiltro,
    setCategoriaFiltro,
    crearProducto,
    actualizarProducto,
    eliminarProducto,
    toggleFavorito,
    crearCategoria,
    actualizarCategoria,
    eliminarCategoria,
  } = useProducts()

  const [formOpen, setFormOpen] = useState(false)
  const [productoEditar, setProductoEditar] = useState<Producto | null>(null)

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
    return crearProducto(data as Omit<Producto, 'id' | 'kiosco_id' | 'fecha_creacion' | 'fecha_actualizacion' | 'activo'>)
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Catálogo de Productos</h1>

      {/* Gestión de categorías */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <CategoryManager
          categorias={categorias}
          onCrear={crearCategoria}
          onActualizar={actualizarCategoria}
          onEliminar={eliminarCategoria}
        />
      </div>

      {/* Tabla de productos */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
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
    </div>
  )
}
