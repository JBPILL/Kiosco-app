import { useState, useEffect } from 'react'
import type { Producto, Categoria } from '../../types/database'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

interface ProductFormProps {
  isOpen: boolean
  onClose: () => void
  categorias: Categoria[]
  producto?: Producto | null
  onGuardar: (data: ProductFormData) => Promise<boolean>
}

export interface ProductFormData {
  descripcion: string
  precio_costo: number
  precio_venta: number
  stock_actual: number
  stock_minimo: number
  categoria_id: string | null
  codigo_barras: string | null
}

export function ProductForm({ isOpen, onClose, categorias, producto, onGuardar }: ProductFormProps) {
  const [form, setForm] = useState<ProductFormData>({
    descripcion: '',
    precio_costo: 0,
    precio_venta: 0,
    stock_actual: 0,
    stock_minimo: 5,
    categoria_id: null,
    codigo_barras: null,
  })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    if (producto) {
      setForm({
        descripcion: producto.descripcion,
        precio_costo: producto.precio_costo,
        precio_venta: producto.precio_venta,
        stock_actual: producto.stock_actual,
        stock_minimo: producto.stock_minimo,
        categoria_id: producto.categoria_id,
        codigo_barras: producto.codigo_barras,
      })
    } else {
      setForm({
        descripcion: '',
        precio_costo: 0,
        precio_venta: 0,
        stock_actual: 0,
        stock_minimo: 5,
        categoria_id: null,
        codigo_barras: null,
      })
    }
  }, [producto, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setGuardando(true)
    const ok = await onGuardar(form)
    setGuardando(false)
    if (ok) onClose()
  }

  const margen = form.precio_venta - form.precio_costo
  const margenPct = form.precio_costo > 0 ? ((margen / form.precio_costo) * 100).toFixed(1) : '—'

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={producto ? 'Editar producto' : 'Nuevo producto'} size="lg">
      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Descripción *"
          placeholder="Ej: Coca Cola 500ml"
          value={form.descripcion}
          onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
          required
          autoFocus
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Precio costo"
            type="number"
            step="0.01"
            min="0"
            value={form.precio_costo || ''}
            onChange={(e) => setForm({ ...form, precio_costo: parseFloat(e.target.value) || 0 })}
          />
          <Input
            label="Precio venta *"
            type="number"
            step="0.01"
            min="0"
            value={form.precio_venta || ''}
            onChange={(e) => setForm({ ...form, precio_venta: parseFloat(e.target.value) || 0 })}
            required
          />
        </div>

        {/* Indicador de margen */}
        {form.precio_costo > 0 && (
          <div className={`text-sm px-3 py-2 rounded-lg ${margen >= 0 ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'}`}>
            Margen: ${margen.toFixed(2)} ({margenPct}%)
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Stock actual"
            type="number"
            min="0"
            value={form.stock_actual || ''}
            onChange={(e) => setForm({ ...form, stock_actual: parseInt(e.target.value) || 0 })}
          />
          <Input
            label="Stock mínimo"
            type="number"
            min="0"
            value={form.stock_minimo || ''}
            onChange={(e) => setForm({ ...form, stock_minimo: parseInt(e.target.value) || 0 })}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
          <select
            className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2.5 text-base focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 dark:focus:ring-indigo-900 transition-colors duration-150"
            value={form.categoria_id || ''}
            onChange={(e) => setForm({ ...form, categoria_id: e.target.value || null })}
          >
            <option value="">Sin categoría</option>
            {categorias.map((cat) => (
              <option key={cat.id} value={cat.id}>{cat.nombre}</option>
            ))}
          </select>
        </div>

        <Input
          label="Código de barras (opcional)"
          placeholder="Escanear o escribir"
          value={form.codigo_barras || ''}
          onChange={(e) => setForm({ ...form, codigo_barras: e.target.value || null })}
        />

        <div className="flex gap-2 pt-2">
          <Button type="submit" fullWidth loading={guardando}>
            {producto ? 'Guardar cambios' : 'Crear producto'}
          </Button>
          <Button type="button" variant="secondary" onClick={onClose} fullWidth>
            Cancelar
          </Button>
        </div>
      </form>
    </Modal>
  )
}
