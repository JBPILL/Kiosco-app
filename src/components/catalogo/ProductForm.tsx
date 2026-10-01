import { useState, useEffect } from 'react'
import type { Producto, Categoria } from '../../types/database'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import { BarcodeCaptureModal } from '../ui/BarcodeCaptureModal'
import { useBarcodeGun } from '../../hooks/useBarcodeGun'
import { playScanSound } from '../../lib/sound'
import { useEnvasesStore } from '../../stores/envasesStore'
import { useProveedorStore } from '../../stores/proveedorStore'
import { useTenantConfig } from '../../hooks/useTenantConfig'
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
  proveedor_id?: string | null
  codigo_barras: string | null
  requiere_vencimiento?: boolean
  dias_alerta_vencimiento?: number
  es_pesable?: boolean
  unidad_medida?: 'UN' | 'KG' | 'GR' | 'LT'
  plu_balanza?: string | null
  es_retornable?: boolean
  precio_envase?: number
  nombre_envase?: string
}

interface FormState {
  descripcion: string
  precio_costo: string
  precio_venta: string
  stock_actual: string
  stock_minimo: string
  categoria_id: string | null
  proveedor_id: string | null
  codigo_barras: string | null
  requiere_vencimiento: boolean
  dias_alerta_vencimiento: number
  es_pesable: boolean
  unidad_medida: 'UN' | 'KG' | 'GR' | 'LT'
  plu_balanza: string | null
  es_retornable: boolean
  precio_envase: string
  nombre_envase: string
}

export function ProductForm({ isOpen, onClose, categorias, producto, onGuardar }: ProductFormProps) {
  const { tieneEnvases, tieneBalanza, tieneVencimientos } = useTenantConfig()
  const mostrarBloqueEspeciales = tieneVencimientos || tieneBalanza || tieneEnvases

  const [form, setForm] = useState<FormState>({
    descripcion: '',
    precio_costo: '',
    precio_venta: '',
    stock_actual: '0',
    stock_minimo: '5',
    categoria_id: null,
    codigo_barras: null,
    requiere_vencimiento: false,
    dias_alerta_vencimiento: 15,
    es_pesable: false,
    unidad_medida: 'UN',
    plu_balanza: null,
    es_retornable: false,
    precio_envase: '',
    nombre_envase: '',
    proveedor_id: null,
  })
  const [guardando, setGuardando] = useState(false)
  const [scannerCamaraOpen, setScannerCamaraOpen] = useState(false)
  const { tiposEnvases, cargarTiposEnvases } = useEnvasesStore()
  const { proveedores, cargarProveedores } = useProveedorStore()

  useEffect(() => {
    if (isOpen) {
      cargarProveedores()
      cargarTiposEnvases()
    }
  }, [isOpen, cargarProveedores, cargarTiposEnvases])

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
        descripcion: producto.descripcion || '',
        precio_costo: producto.precio_costo ? String(producto.precio_costo) : '',
        precio_venta: producto.precio_venta ? String(producto.precio_venta) : '',
        stock_actual: String(producto.stock_actual ?? 0),
        stock_minimo: String(producto.stock_minimo ?? 5),
        categoria_id: producto.categoria_id,
        proveedor_id: producto.proveedor_id || null,
        codigo_barras: producto.codigo_barras || null,
        requiere_vencimiento: Boolean(producto.requiere_vencimiento),
        dias_alerta_vencimiento: producto.dias_alerta_vencimiento || 15,
        es_pesable: Boolean(producto.es_pesable),
        unidad_medida: producto.unidad_medida || 'UN',
        plu_balanza: producto.plu_balanza || null,
        es_retornable: Boolean(producto.es_retornable),
        precio_envase: producto.precio_envase ? String(producto.precio_envase) : '',
        nombre_envase: producto.nombre_envase || '',
      })
    } else {
      setForm({
        descripcion: '',
        precio_costo: '',
        precio_venta: '',
        stock_actual: '0',
        stock_minimo: '5',
        categoria_id: null,
        proveedor_id: null,
        codigo_barras: null,
        requiere_vencimiento: false,
        dias_alerta_vencimiento: 15,
        es_pesable: false,
        unidad_medida: 'UN',
        plu_balanza: null,
        es_retornable: false,
        precio_envase: '',
        nombre_envase: '',
      })
    }
  }, [producto, isOpen])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (guardando) return

    const descripcionLimpia = form.descripcion.trim()
    if (!descripcionLimpia) {
      toast.error('La descripción o nombre del producto es obligatoria')
      return
    }

    const ventaNum = parseFloat(form.precio_venta)
    if (isNaN(ventaNum) || ventaNum <= 0) {
      toast.error('El precio de venta debe ser un monto mayor a $0')
      return
    }

    const costoNum = parseFloat(form.precio_costo) || 0
    if (costoNum < 0) {
      toast.error('El precio de costo no puede ser negativo')
      return
    }

    const stockActualNum = form.es_pesable
      ? parseFloat(form.stock_actual) || 0
      : parseInt(form.stock_actual, 10) || 0

    const stockMinimoNum = form.es_pesable
      ? parseFloat(form.stock_minimo) || 0
      : parseInt(form.stock_minimo, 10) || 0

    if (stockActualNum < 0) {
      toast.error('El stock inicial no puede ser negativo')
      return
    }

    if (stockMinimoNum < 0) {
      toast.error('El stock mínimo no puede ser negativo')
      return
    }

    setGuardando(true)
    const dataToSend: ProductFormData = {
      descripcion: descripcionLimpia,
      precio_costo: costoNum,
      precio_venta: ventaNum,
      stock_actual: stockActualNum,
      stock_minimo: stockMinimoNum,
      categoria_id: form.categoria_id,
      proveedor_id: form.proveedor_id,
      codigo_barras: form.codigo_barras?.trim() || null,
      requiere_vencimiento: form.requiere_vencimiento,
      dias_alerta_vencimiento: form.dias_alerta_vencimiento,
      es_pesable: form.es_pesable,
      unidad_medida: form.unidad_medida,
      plu_balanza: form.plu_balanza?.trim() || null,
      es_retornable: form.es_retornable,
      precio_envase: parseFloat(form.precio_envase) || 0,
      nombre_envase: form.nombre_envase.trim() || undefined,
    }

    const ok = await onGuardar(dataToSend)
    setGuardando(false)
    if (ok) onClose()
  }

  const handleBarcodeCaptured = (code: string) => {
    setForm((prev) => ({ ...prev, codigo_barras: code }))
    toast.success(`Código capturado: ${code}`)
  }

  const costoNum = parseFloat(form.precio_costo) || 0
  const ventaNum = parseFloat(form.precio_venta) || 0
  const margen = ventaNum - costoNum
  const margenPct = costoNum > 0 ? ((margen / costoNum) * 100).toFixed(1) : '—'

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={producto ? 'Modificar Datos del Producto' : 'Registrar Nuevo Producto'}
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row gap-2.5 w-full">
            <Button
              type="button"
              variant="secondary"
              disabled={guardando}
              onClick={onClose}
              className="order-2 sm:order-1 sm:w-1/3 py-2.5 text-sm font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="product-form"
              variant="primary"
              loading={guardando}
              className="order-1 sm:order-2 sm:w-2/3 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              {producto ? 'Guardar Cambios' : 'Crear Producto'}
            </Button>
          </div>
        }
      >
        <form id="product-form" onSubmit={handleSubmit} className="space-y-4">
          {/* Banner de Ayuda Rápida / Guía */}
          <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center gap-3 text-xs text-indigo-950 dark:text-indigo-200">
            <span className="font-bold uppercase text-[10px] tracking-wider px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 border border-indigo-300 dark:border-indigo-700 shrink-0">
              Guía
            </span>
            <p className="leading-relaxed font-medium">
              {producto
                ? 'Modificá precios, stock o características del producto. Los cambios se actualizarán de inmediato en el mostrador.'
                : 'Completá los datos del producto. Podés escanear el código de barras directamente con la lectora USB o Bluetooth para agilizar la carga.'}
            </p>
          </div>

          {/* Bloque 1: Identificación y Precios */}
          <div className="space-y-3 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              1. Identificación y Precios
            </p>
            <div>
              <Input
                label="Descripción o Nombre del Producto *"
                placeholder="Ej: Coca Cola 500ml, Alfajor Jorgito Blanco..."
                value={form.descripcion}
                onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
                required
                autoFocus
              />
              <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                Nombre claro para identificarlo rápidamente en el mostrador y en los comprobantes.
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Input
                  label="Precio costo ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.precio_costo}
                  onChange={(e) => setForm({ ...form, precio_costo: e.target.value })}
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                  Costo de compra al distribuidor (opcional).
                </span>
              </div>
              <div>
                <Input
                  label="Precio venta al público * ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={form.precio_venta}
                  onChange={(e) => setForm({ ...form, precio_venta: e.target.value })}
                  required
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                  Precio final que se cobrará al cliente en caja.
                </span>
              </div>
            </div>

            {/* Indicador de margen en tiempo real */}
            {costoNum > 0 && ventaNum > 0 && (
              <div className={`text-xs font-semibold px-3 py-2 rounded-lg flex items-center justify-between border ${
                margen >= 0
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/40 text-red-800 dark:text-red-300 border-red-200 dark:border-red-800'
              }`}>
                <span>Ganancia bruta: <strong>${margen.toFixed(2)}</strong></span>
                <span>Margen sobre costo: <strong>{margenPct}%</strong></span>
              </div>
            )}
          </div>

          {/* Bloque 2: Stock, Categoría y Código */}
          <div className="space-y-3 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              2. Stock y Clasificación
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Input
                  label={`Stock actual ${form.es_pesable ? `(${form.unidad_medida || 'KG'})` : '(unidades)'}`}
                  type="number"
                  min="0"
                  step={form.es_pesable ? '0.001' : '1'}
                  value={form.stock_actual}
                  placeholder="0"
                  onChange={(e) => setForm({ ...form, stock_actual: e.target.value })}
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                  Cantidad física real en el negocio.
                </span>
              </div>
              <div>
                <Input
                  label={`Stock mínimo de alerta ${form.es_pesable ? `(${form.unidad_medida || 'KG'})` : '(unidades)'}`}
                  type="number"
                  min="0"
                  step={form.es_pesable ? '0.001' : '1'}
                  value={form.stock_minimo}
                  placeholder="5"
                  onChange={(e) => setForm({ ...form, stock_minimo: e.target.value })}
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                  Avisa cuando falte mercadería para reponer.
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">Categoría</label>
                <select
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-xs sm:text-sm focus:border-indigo-500"
                  value={form.categoria_id || ''}
                  onChange={(e) => setForm({ ...form, categoria_id: e.target.value || null })}
                >
                  <option value="">Sin categoría (—)</option>
                  {categorias.map((cat) => (
                    <option key={cat.id} value={cat.id}>{cat.nombre}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Proveedor Habitual (Opcional)
                </label>
                <select
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 text-xs sm:text-sm focus:border-indigo-500"
                  value={form.proveedor_id || ''}
                  onChange={(e) => setForm({ ...form, proveedor_id: e.target.value || null })}
                >
                  <option value="">Sin proveedor asignado</option>
                  {proveedores.filter((p) => p.activo).map((prov) => (
                    <option key={prov.id} value={prov.id}>{prov.nombre}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Campo de Código de barras con botón de Escanear con cámara y soporte de lector */}
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Código de barras (opcional)
              </label>
              <div className="flex gap-2 items-center">
                <div className="flex-1 relative">
                  <Input
                    placeholder="Escanear con lectora o escribir código..."
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
                  className="sm:hidden flex items-center gap-1.5 px-3 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 cursor-pointer flex-shrink-0 h-[38px]"
                  title="Escanear código con la cámara del celular"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                  <span>Cámara</span>
                </Button>
              </div>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                Podés disparar directamente con un lector de barras físico USB / Bluetooth o escribir el código.
              </span>
            </div>
          </div>

          {/* Bloque 3: Propiedades Especiales */}
          {mostrarBloqueEspeciales && (
            <div className="space-y-3 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                3. Propiedades Especiales
              </p>

              {tieneVencimientos && (
                <div className="p-3.5 bg-gray-50/80 dark:bg-gray-900/40 border border-gray-300 dark:border-gray-700 rounded-xl space-y-2">
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
              )}

              {/* Opciones de Balanza y Pesables */}
              {tieneBalanza && (
                <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/30 border border-amber-300 dark:border-amber-800/60 rounded-xl space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.es_pesable || false}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          es_pesable: e.target.checked,
                          unidad_medida: e.target.checked
                            ? form.unidad_medida === 'UN'
                              ? 'KG'
                              : form.unidad_medida
                            : 'UN',
                        })
                      }
                      className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-xs font-semibold text-amber-950 dark:text-amber-200">
                      Producto fraccionable / por peso (Fiambrería, Verdulería, Balanza)
                    </span>
                  </label>

                  {form.es_pesable && (
                    <div className="pt-1 pl-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                          Unidad de medida:
                        </label>
                        <select
                          value={form.unidad_medida || 'KG'}
                          onChange={(e) => setForm({ ...form, unidad_medida: e.target.value as any })}
                          className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2.5 py-1.5 outline-none focus:border-amber-500 font-bold"
                        >
                          <option value="KG">Kilogramos (KG)</option>
                          <option value="GR">Gramos (GR)</option>
                          <option value="LT">Litros (LT)</option>
                          <option value="UN">Unidades (UN)</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                          Código PLU Balanza (4 o 5 dígitos):
                        </label>
                        <input
                          type="text"
                          maxLength={5}
                          placeholder="Ej: 0123"
                          value={form.plu_balanza || ''}
                          onChange={(e) => setForm({ ...form, plu_balanza: e.target.value.trim() || null })}
                          className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2.5 py-1.5 outline-none focus:border-amber-500 font-mono font-bold"
                        />
                        <p className="text-[10px] text-gray-400 mt-0.5">
                          Permite escanear etiquetas de balanzas Systel / Kretz (prefijo 20).
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Envases Retornables */}
              {tieneEnvases && (
                <div className="p-3.5 bg-gray-50/80 dark:bg-gray-800/60 border border-gray-300 dark:border-gray-700 rounded-xl space-y-2.5">
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={form.es_retornable || false}
                      onChange={(e) => {
                        const checked = e.target.checked
                        let tipoSugerido = tiposEnvases[0]
                        const desc = (form.descripcion || '').toLowerCase()
                        if (desc.includes('1.5') || desc.includes('1,5') || desc.includes('1 1/2')) {
                          tipoSugerido = tiposEnvases.find((t) => t.id === '1.5lts') || tipoSugerido
                        } else if (desc.includes('2.25') || desc.includes('2,25')) {
                          tipoSugerido = tiposEnvases.find((t) => t.id === '2.25lts') || tipoSugerido
                        } else if (desc.includes('2l') || desc.includes('2 l') || desc.includes('2 lt') || desc.includes('2lt')) {
                          tipoSugerido = tiposEnvases.find((t) => t.id === '2lts') || tipoSugerido
                        } else if (desc.includes('sifon') || desc.includes('sifón') || desc.includes('soda')) {
                          tipoSugerido = tiposEnvases.find((t) => t.id === 'sifon') || tipoSugerido
                        } else if (desc.includes('bidon') || desc.includes('bidón') || desc.includes('20')) {
                          tipoSugerido = tiposEnvases.find((t) => t.id === 'bidon20l') || tipoSugerido
                        } else if (desc.includes('1l') || desc.includes('1 l') || desc.includes('1lt') || desc.includes('litro')) {
                          tipoSugerido = tiposEnvases.find((t) => t.id === '1lt') || tipoSugerido
                        }

                        setForm({
                          ...form,
                          es_retornable: checked,
                          nombre_envase: checked ? form.nombre_envase || tipoSugerido?.nombre || '1lt' : '',
                          precio_envase: checked ? form.precio_envase || String(tipoSugerido?.precio || 1500) : '',
                        })
                      }}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600"
                    />
                    <span className="text-xs font-semibold text-gray-900 dark:text-gray-100">
                      Producto con envase retornable (cervezas, gaseosas de vidrio, sifones)
                    </span>
                  </label>

                  {form.es_retornable && (
                    <div className="pt-1 pl-6 space-y-2.5">
                      {/* Selector rápido de Tipos Oficiales */}
                      <div>
                        <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                          Tipo de envase estándar:
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {tiposEnvases.map((tipo) => {
                            const activo = form.nombre_envase === tipo.nombre
                            return (
                              <button
                                key={tipo.id}
                                type="button"
                                onClick={() =>
                                  setForm({
                                    ...form,
                                    nombre_envase: tipo.nombre,
                                    precio_envase: String(tipo.precio),
                                  })
                                }
                                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border cursor-pointer ${
                                  activo
                                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-300 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700'
                                }`}
                              >
                                {tipo.nombre} (${tipo.precio.toLocaleString('es-AR')})
                              </button>
                            )
                          })}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                            Precio unitario del envase ($):
                          </label>
                          <input
                            type="number"
                            min="0"
                            step="50"
                            placeholder="Ej: 1500"
                            value={form.precio_envase}
                            onChange={(e) => setForm({ ...form, precio_envase: e.target.value })}
                            className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2.5 py-1.5 outline-none focus:border-indigo-500 font-bold tabular-nums"
                          />
                          <p className="text-[10px] text-gray-400 mt-0.5">
                            Monto a sumar si el cliente no trae la botella vacía.
                          </p>
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-gray-600 dark:text-gray-300 mb-1">
                            Nombre o tipo asignado:
                          </label>
                          <input
                            type="text"
                            placeholder="Ej: 1lt"
                            value={form.nombre_envase || ''}
                            onChange={(e) => setForm({ ...form, nombre_envase: e.target.value || '' })}
                            className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2.5 py-1.5 outline-none focus:border-indigo-500 font-medium"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
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
