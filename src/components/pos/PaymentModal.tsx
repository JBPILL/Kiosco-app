import { useState } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../../lib/supabase'
import { useCartStore } from '../../stores/cartStore'
import { useCajaStore } from '../../stores/cajaStore'
import { useAuthStore } from '../../stores/authStore'
import { formatPrecio, calcularVuelto } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import type { MedioPago } from '../../types/database'
import toast from 'react-hot-toast'

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onVentaCompletada: () => void
}

const MEDIOS_PAGO: { valor: MedioPago; label: string }[] = [
  { valor: 'EFECTIVO', label: 'Efectivo' },
  { valor: 'MERCADOPAGO', label: 'Mercado Pago' },
  { valor: 'TRANSFERENCIA', label: 'Transferencia' },
  { valor: 'TARJETA', label: 'Tarjeta' },
]

export function PaymentModal({ isOpen, onClose, onVentaCompletada }: PaymentModalProps) {
  const {
    items,
    totalMonto,
    subtotalMonto,
    montoAjuste,
    tipoAjuste,
    descripcionAjuste,
    vaciarCarrito,
  } = useCartStore()

  const total = totalMonto()
  const subtotal = subtotalMonto()
  const ajuste = montoAjuste()
  const tieneAjuste = tipoAjuste !== 'NINGUNO'

  const [medioPago, setMedioPago] = useState<MedioPago>('EFECTIVO')
  const [pagaCon, setPagaCon] = useState<string>('')
  const [referencia, setReferencia] = useState('')
  const [procesando, setProcesando] = useState(false)

  const vuelto = medioPago === 'EFECTIVO' && pagaCon
    ? calcularVuelto(total, parseFloat(pagaCon) || 0)
    : 0

  const pagaConNum = parseFloat(pagaCon) || 0
  const puedeConfirmar = medioPago === 'EFECTIVO'
    ? pagaConNum >= total
    : true

  const confirmarVenta = async () => {
    if (!puedeConfirmar) return
    setProcesando(true)

    try {
      const ventaId = uuidv4()
      const ahora = new Date().toISOString()
      const sesionActiva = useCajaStore.getState().sesionActiva
      const usuario = useAuthStore.getState().usuario
      const descAjuste = descripcionAjuste()
      const notasFinal = descAjuste
        ? (referencia ? `${descAjuste} · ${referencia}` : descAjuste)
        : (referencia || null)

      // 1. Insertar la venta
      const { error: ventaError } = await supabase.from('ventas').insert({
        id: ventaId,
        usuario_id: usuario?.id || null,
        sesion_caja_id: sesionActiva?.id || null,
        fecha_hora: ahora,
        total,
        estado: 'COMPLETADA',
        notas: notasFinal,
        sincronizado: true,
      })

      if (ventaError) throw ventaError

      // 2. Insertar detalles de venta
      const detalles = items.map((item) => ({
        id: uuidv4(),
        venta_id: ventaId,
        producto_id: item.producto.id,
        cantidad: item.cantidad,
        precio_unitario: item.producto.precio_venta,
        subtotal: item.subtotal,
      }))

      const { error: detalleError } = await supabase.from('detalles_venta').insert(detalles)
      if (detalleError) throw detalleError

      // 3. Insertar pago
      const { error: pagoError } = await supabase.from('pagos_venta').insert({
        venta_id: ventaId,
        medio_pago: medioPago,
        monto: total,
        referencia: referencia || null,
      })
      if (pagoError) throw pagoError

      // 4. Éxito
      toast.success(`Venta registrada — ${formatPrecio(total)}`)
      if (medioPago === 'EFECTIVO' && vuelto > 0) {
        toast(`Vuelto: ${formatPrecio(vuelto)}`, { duration: 5000 })
      }

      vaciarCarrito()
      resetForm()
      onVentaCompletada()
      onClose()
    } catch (error) {
      console.error('Error al registrar venta:', error)
      toast.error('Error al registrar la venta. Intentá de nuevo.')
    } finally {
      setProcesando(false)
    }
  }

  const resetForm = () => {
    setMedioPago('EFECTIVO')
    setPagaCon('')
    setReferencia('')
  }

  // Billetes rápidos para efectivo
  const billetesRapidos = [1000, 2000, 5000, 10000, 20000]

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Cobrar" size="md">
      <div className="space-y-5">
        {/* Total y Desglose */}
        <div className="py-3 bg-indigo-50 dark:bg-indigo-900/30 rounded-xl space-y-1">
          {tieneAjuste && (
            <div className="flex justify-between items-center px-4 text-xs text-gray-600 dark:text-gray-300 pb-1 border-b border-indigo-100 dark:border-indigo-800/40">
              <span>Subtotal: {formatPrecio(subtotal)}</span>
              <span className={tipoAjuste.startsWith('DESCUENTO') ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-blue-600 dark:text-blue-400 font-semibold'}>
                {descripcionAjuste()} ({tipoAjuste.startsWith('DESCUENTO') ? '-' : '+'}{formatPrecio(Math.abs(ajuste))})
              </span>
            </div>
          )}
          <div className="text-center pt-0.5">
            <p className="text-sm text-indigo-600 dark:text-indigo-400 font-medium">Total a cobrar</p>
            <p className="text-3xl font-bold text-indigo-700 dark:text-indigo-400">{formatPrecio(total)}</p>
          </div>
        </div>

        {/* Medio de pago */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Medio de pago</label>
          <div className="grid grid-cols-2 gap-2">
            {MEDIOS_PAGO.map((mp) => (
              <button
                key={mp.valor}
                type="button"
                onClick={() => setMedioPago(mp.valor)}
                className={`flex items-center justify-center p-3 rounded-xl border-2 text-sm font-semibold min-h-[46px] active:scale-95 transition-all ${
                  medioPago === mp.valor
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 shadow-xs'
                    : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600'
                }`}
              >
                {mp.label}
              </button>
            ))}
          </div>
        </div>

        {/* Efectivo: calculadora de vuelto */}
        {medioPago === 'EFECTIVO' && (
          <div className="space-y-3">
            <Input
              label="El cliente paga con"
              type="number"
              step="100"
              min={0}
              value={pagaCon}
              onChange={(e) => setPagaCon(e.target.value)}
              placeholder="Ingresá el monto"
              autoFocus={typeof window !== 'undefined' && window.innerWidth >= 1024}
            />

            {/* Billetes rápidos */}
            <div className="flex flex-wrap gap-2">
              {billetesRapidos.map((billete) => (
                <button
                  key={billete}
                  type="button"
                  onClick={() => setPagaCon(billete.toString())}
                  className={`px-3.5 py-2 min-h-[38px] rounded-xl border text-sm font-semibold active:scale-95 transition-all ${
                    pagaConNum === billete
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                      : 'border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-600 bg-white dark:bg-gray-800'
                  }`}
                >
                  {formatPrecio(billete)}
                </button>
              ))}
              {/* Monto exacto */}
              <button
                type="button"
                onClick={() => setPagaCon(total.toString())}
                className="px-4 py-2 min-h-[38px] rounded-xl border border-emerald-300 dark:border-emerald-700 text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 active:scale-95 transition-all"
              >
                Exacto
              </button>
            </div>

            {/* Vuelto */}
            {pagaConNum > 0 && (
              <div className={`text-center py-3 rounded-xl ${
                pagaConNum >= total
                  ? 'bg-emerald-50 dark:bg-emerald-900/30'
                  : 'bg-red-50 dark:bg-red-900/30'
              }`}>
                {pagaConNum >= total ? (
                  <>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">Vuelto</p>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{formatPrecio(vuelto)}</p>
                  </>
                ) : (
                  <p className="text-sm text-red-600 dark:text-red-400 font-medium">
                    Faltan {formatPrecio(total - pagaConNum)}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Otros medios: referencia opcional */}
        {medioPago !== 'EFECTIVO' && (
          <Input
            label="Referencia (opcional)"
            placeholder={medioPago === 'TARJETA' ? 'Últimos 4 dígitos' : 'Nro de operación'}
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
          />
        )}

        {/* Botón confirmar */}
        <Button
          size="lg"
          fullWidth
          variant="success"
          onClick={confirmarVenta}
          disabled={!puedeConfirmar}
          loading={procesando}
        >
          Confirmar Venta
        </Button>
      </div>
    </Modal>
  )
}
