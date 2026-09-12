import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { formatFecha } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import type { Producto, MovimientoStock } from '../types/database'
import toast from 'react-hot-toast'

export function StockPage() {
  const [movimientos, setMovimientos] = useState<(MovimientoStock & { producto?: Producto })[]>([])
  const [productos, setProductos] = useState<Producto[]>([])
  const [cargando, setCargando] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [tipoMovimiento, setTipoMovimiento] = useState<'INGRESO' | 'EGRESO' | 'AJUSTE'>('INGRESO')
  const [productoId, setProductoId] = useState('')
  const [cantidad, setCantidad] = useState('')
  const [motivo, setMotivo] = useState('COMPRA')
  const [notas, setNotas] = useState('')
  const [guardando, setGuardando] = useState(false)

  const cargarMovimientos = useCallback(async () => {
    setCargando(true)
    const { data } = await supabase
      .from('movimientos_stock')
      .select('*, producto:productos(id, descripcion, stock_actual)')
      .order('fecha', { ascending: false })
      .limit(50)

    setMovimientos((data as (MovimientoStock & { producto?: Producto })[]) || [])
    setCargando(false)
  }, [])

  const cargarProductos = useCallback(async () => {
    const { data } = await supabase
      .from('productos')
      .select('id, descripcion, stock_actual')
      .eq('activo', true)
      .order('descripcion')
    setProductos((data as Producto[]) || [])
  }, [])

  useEffect(() => {
    cargarMovimientos()
    cargarProductos()
  }, [cargarMovimientos, cargarProductos])

  const registrarMovimiento = async () => {
    if (!productoId || !cantidad) return
    setGuardando(true)

    const cantidadNum = parseInt(cantidad)
    const cantidadFinal = tipoMovimiento === 'EGRESO' ? -Math.abs(cantidadNum) : Math.abs(cantidadNum)

    // Insertar movimiento
    const { error: movError } = await supabase.from('movimientos_stock').insert({
      producto_id: productoId,
      tipo: tipoMovimiento,
      cantidad: cantidadFinal,
      motivo,
      notas: notas || null,
    })

    if (movError) {
      toast.error('Error al registrar movimiento')
      setGuardando(false)
      return
    }

    // Actualizar stock del producto
    const producto = productos.find(p => p.id === productoId)
    if (producto) {
      const nuevoStock = tipoMovimiento === 'AJUSTE'
        ? Math.abs(cantidadNum)
        : producto.stock_actual + cantidadFinal

      await supabase
        .from('productos')
        .update({ stock_actual: nuevoStock, fecha_actualizacion: new Date().toISOString() })
        .eq('id', productoId)
    }

    toast.success('Movimiento registrado')
    setGuardando(false)
    setModalOpen(false)
    setProductoId('')
    setCantidad('')
    setNotas('')
    cargarMovimientos()
    cargarProductos()
  }

  const motivosPorTipo = {
    INGRESO: [{ value: 'COMPRA', label: 'Compra a proveedor' }, { value: 'DEVOLUCION', label: 'Devolución' }],
    EGRESO: [{ value: 'PERDIDA', label: 'Pérdida' }, { value: 'ROTURA', label: 'Rotura' }, { value: 'VENCIMIENTO', label: 'Vencimiento' }],
    AJUSTE: [{ value: 'CONTEO', label: 'Conteo físico' }],
  }

  const tipoColors = {
    INGRESO: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
    EGRESO: 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30',
    AJUSTE: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
  }

  // Productos con stock bajo
  const stockBajo = productos.filter(p => p.stock_actual <= (p.stock_minimo ?? 5))

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Gestión de Stock</h1>
        <Button onClick={() => setModalOpen(true)}>+ Registrar movimiento</Button>
      </div>

      {/* Alertas de stock bajo */}
      {stockBajo.length > 0 && (
        <div className="bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-700/50 rounded-xl p-4">
          <h3 className="font-semibold text-amber-800 dark:text-amber-400 mb-2">Productos con stock bajo ({stockBajo.length})</h3>
          <div className="flex flex-wrap gap-2">
            {stockBajo.map((p) => (
              <span key={p.id} className="px-2 py-1 bg-amber-100 dark:bg-amber-800/50 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                {p.descripcion}: <strong>{p.stock_actual}</strong>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Historial de movimientos */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mb-3">Últimos movimientos</h3>
        {cargando ? (
          <div className="text-center py-8">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-600 dark:border-indigo-400 border-t-transparent rounded-full mx-auto" />
          </div>
        ) : movimientos.length === 0 ? (
          <p className="text-center text-gray-400 dark:text-gray-500 py-8">No hay movimientos registrados</p>
        ) : (
          <div className="space-y-2">
            {movimientos.map((mov) => (
              <div key={mov.id} className="flex items-center justify-between py-2 border-b border-gray-50 dark:border-gray-700">
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tipoColors[mov.tipo]}`}>
                    {mov.tipo}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {mov.producto?.descripcion || 'Producto eliminado'}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500">
                      {formatFecha(mov.fecha)} · {mov.motivo}
                      {mov.notas && ` · ${mov.notas}`}
                    </p>
                  </div>
                </div>
                <span className={`font-bold text-sm ${mov.cantidad >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>
                  {mov.cantidad >= 0 ? '+' : ''}{mov.cantidad}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de registro */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Registrar movimiento de stock" size="md">
        <div className="space-y-4">
          {/* Tipo de movimiento */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Tipo</label>
            <div className="flex gap-2">
              {(['INGRESO', 'EGRESO', 'AJUSTE'] as const).map((tipo) => (
                <button
                  key={tipo}
                  onClick={() => { setTipoMovimiento(tipo); setMotivo(motivosPorTipo[tipo][0].value) }}
                  className={`flex-1 py-2 rounded-lg text-sm font-medium border-2 transition-colors ${
                    tipoMovimiento === tipo
                      ? tipo === 'INGRESO' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
                        : tipo === 'EGRESO' ? 'border-red-500 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400'
                        : 'border-amber-500 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400'
                  }`}
                >
                  {tipo === 'INGRESO' ? 'Ingreso' : tipo === 'EGRESO' ? 'Egreso' : 'Ajuste'}
                </button>
              ))}
            </div>
          </div>

          {/* Producto */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Producto</label>
            <select
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2.5 text-base focus:border-indigo-500"
              value={productoId}
              onChange={(e) => setProductoId(e.target.value)}
            >
              <option value="">Seleccionar producto...</option>
              {productos.map((p) => (
                <option key={p.id} value={p.id}>{p.descripcion} (stock: {p.stock_actual})</option>
              ))}
            </select>
          </div>

          {/* Cantidad */}
          <Input
            label={tipoMovimiento === 'AJUSTE' ? 'Stock real (conteo)' : 'Cantidad'}
            type="number"
            min="1"
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder={tipoMovimiento === 'AJUSTE' ? 'Cantidad contada' : 'Unidades'}
          />

          {/* Motivo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Motivo</label>
            <select
              className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2.5 text-base focus:border-indigo-500"
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
            >
              {motivosPorTipo[tipoMovimiento].map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Notas */}
          <Input
            label="Notas (opcional)"
            placeholder="Detalle adicional"
            value={notas}
            onChange={(e) => setNotas(e.target.value)}
          />

          <Button onClick={registrarMovimiento} fullWidth loading={guardando} disabled={!productoId || !cantidad}>
            Registrar movimiento
          </Button>
        </div>
      </Modal>
    </div>
  )
}
