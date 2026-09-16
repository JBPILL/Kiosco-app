import { useState, useEffect } from 'react'
import type { Producto, Categoria } from '../../types/database'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { BarcodeCaptureModal } from '../ui/BarcodeCaptureModal'
import { useBarcodeGun } from '../../hooks/useBarcodeGun'
import { playScanSound } from '../../lib/sound'
import toast from 'react-hot-toast'

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
  requiere_vencimiento?: boolean
  dias_alerta_vencimiento?: number
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
    requiere_vencimiento: false,
    dias_alerta_vencimiento: 15,
  })
  const [guardando, setGuardando] = useState(false)
  const [scannerCamaraOpen, setScannerCamaraOpen] = useState(false)

  // Soporte para pistolas lectoras físicas USB / Bluetooth en el formulario
  useBarcodeGun({
    enabled: isOpen && !scannerCamaraOpen,
    onScan: (code) => {
      setForm((prev) => ({ ...prev, codigo_barras: code }))
      playScanSound('success')
      toast.success(`Código de barras leído: ${code}`)
    },
  })

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
        requiere_vencimiento: producto.requiere_vencimiento || false,
        dias_alerta_vencimiento: producto.dias_alerta_vencimiento || 15,
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
        requiere_vencimiento: false,
        dias_alerta_vencimiento: 15,
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

  const handleBarcodeCaptured = (code: string) => {
    setForm((prev) => ({ ...prev, codigo_barras: code }))
    toast.success(`Código capturado: ${code}`)
  }

  const margen = form.precio_venta - form.precio_costo
  const margenPct = form.precio_costo > 0 ? ((margen / form.precio_costo) * 100).toFixed(1) : '—'

  return (
    <>
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

          {/* Campo de Código de barras con botón de Escanear con cámara y soporte de lector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Código de barras (opcional)
            </label>
            <div className="flex gap-2 items-center">
              <div className="flex-1 relative">
                <Input
                  placeholder="Escanear con cámara/lector o escribir"
                  value={form.codigo_barras || ''}
                  onChange={(e) => setForm({ ...form, codigo_barras: e.target.value || null })}
                />
                {form.codigo_barras && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, codigo_barras: null })}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-500 text-xs font-semibold px-1 py-0.5 rounded cursor-pointer"
                    title="Borrar código de barras"
                  >
                    ✕
                  </button>
                )}
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setScannerCamaraOpen(true)}
                className="flex items-center gap-1.5 px-3 sm:px-4 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer flex-shrink-0 h-[42px]"
                title="Escanear código con la cámara del celular o PC"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Cámara</span>
              </Button>
            </div>
            <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1">
              Podés usar la cámara del celular o disparar directamente con un lector de barras físico USB / Bluetooth.
            </p>
          </div>

          {/* Opciones de Perecedero / Vencimiento */}
          <div className="p-3 bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-700 rounded-xl space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.requiere_vencimiento || false}
                onChange={(e) => setForm({ ...form, requiere_vencimiento: e.target.checked })}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600"
              />
              <span className="text-xs font-semibold text-gray-800 dark:text-gray-200">
                Producto perecedero (Controlar fechas de vencimiento y lotes)
              </span>
            </label>

            {form.requiere_vencimiento && (
              <div className="pt-1 pl-6">
                <label className="block text-[11px] font-medium text-gray-500 dark:text-gray-400 mb-1">
                  Días de anticipación para alerta preventiva:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="180"
                    value={form.dias_alerta_vencimiento || 15}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        dias_alerta_vencimiento: parseInt(e.target.value, 10) || 15,
                      })
                    }
                    className="w-24 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2.5 py-1.5 outline-none focus:border-indigo-500 font-bold"
                  />
                  <span className="text-xs text-gray-400">días antes de caducar</span>
                </div>
              </div>
            )}
          </div>

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

      {/* Modal de escaneo por cámara para capturar código de barras */}
      <BarcodeCaptureModal
        isOpen={scannerCamaraOpen}
        onClose={() => setScannerCamaraOpen(false)}
        onBarcodeCaptured={handleBarcodeCaptured}
        title="Escanear Código de Barras"
      />
    </>
  )
}
