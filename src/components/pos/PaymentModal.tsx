import { useState, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../../lib/supabase'
import { useCartStore } from '../../stores/cartStore'
import { useCajaStore } from '../../stores/cajaStore'
import { useAuthStore } from '../../stores/authStore'
import { useClienteStore } from '../../stores/clienteStore'
import { formatPrecio } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import type { MedioPago } from '../../types/database'
import type { TicketData } from './TicketReceiptModal'
import { useAFIPStore } from '../../stores/afipStore'
import { useLoteStore } from '../../stores/loteStore'
import { useComboStore } from '../../stores/comboStore'
import type { TipoDocumentoAFIP } from '../../types/afip'
import toast from 'react-hot-toast'

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  onVentaCompletada: (ticket?: TicketData) => void
}

const MEDIOS_PAGO: { valor: MedioPago; label: string }[] = [
  { valor: 'EFECTIVO', label: 'Efectivo' },
  { valor: 'MERCADOPAGO', label: 'Mercado Pago' },
  { valor: 'TRANSFERENCIA', label: 'Transferencia' },
  { valor: 'TARJETA', label: 'Tarjeta' },
  { valor: 'CUENTA_CORRIENTE', label: 'Cuenta Corriente' },
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

  const { clientes, cargarClientes, imputarCargoVenta } = useClienteStore()
  const { config: afipConfig, emitirFacturaVenta, cargarConfiguracion } = useAFIPStore()
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState<string>('')
  const [busquedaCliente, setBusquedaCliente] = useState<string>('')

  const [emitirFiscal, setEmitirFiscal] = useState(false)
  const [tipoDocReceptor, setTipoDocReceptor] = useState<TipoDocumentoAFIP>(99)
  const [nroDocReceptor, setNroDocReceptor] = useState<string>('')

  const total = totalMonto()
  const subtotal = subtotalMonto()
  const ajuste = montoAjuste()
  const tieneAjuste = tipoAjuste !== 'NINGUNO'

  const [medioPago, setMedioPago] = useState<MedioPago>('EFECTIVO')
  const [pagaCon, setPagaCon] = useState<string>('')
  const [referencia, setReferencia] = useState('')
  const [procesando, setProcesando] = useState(false)

  useEffect(() => {
    if (isOpen) {
      cargarClientes()
      cargarConfiguracion()
    }
  }, [isOpen, cargarClientes, cargarConfiguracion])

  // Ajustar emisión fiscal por defecto según configuración
  useEffect(() => {
    if (isOpen && afipConfig) {
      if (afipConfig.habilitado) {
        const auto = afipConfig.facturar_automatico || (afipConfig.monto_minimo_auto > 0 && total >= afipConfig.monto_minimo_auto)
        setEmitirFiscal(Boolean(auto))
      } else {
        setEmitirFiscal(false)
      }
    }
  }, [isOpen, afipConfig, total])

  const clientesFiltrados = clientes.filter(
    (c) =>
      c.activo &&
      (c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
        (c.dni_cuit && c.dni_cuit.includes(busquedaCliente)))
  )

  const clienteSeleccionado = clientes.find((c) => c.id === clienteSeleccionadoId)

  // Si el cliente seleccionado tiene DNI o CUIT, precargar en AFIP
  useEffect(() => {
    if (clienteSeleccionado?.dni_cuit) {
      const raw = clienteSeleccionado.dni_cuit.replace(/\D/g, '')
      if (raw.length === 11) {
        setTipoDocReceptor(80)
        setNroDocReceptor(raw)
      } else if (raw.length >= 7 && raw.length <= 8) {
        setTipoDocReceptor(96)
        setNroDocReceptor(raw)
      } else {
        setNroDocReceptor(raw)
      }
    }
  }, [clienteSeleccionado])

  const pagaConNum = parseInt(pagaCon, 10) || 0
  const vuelto = medioPago === 'EFECTIVO' && pagaCon
    ? Math.max(0, pagaConNum - Math.round(total))
    : 0

  const handlePagaConChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo permitir números enteros (sin centavos flotantes como 0.5, 2000.5)
    const soloEnteros = e.target.value.replace(/[^0-9]/g, '')
    setPagaCon(soloEnteros)
  }

  const puedeConfirmar =
    medioPago === 'EFECTIVO'
      ? pagaConNum >= total
      : medioPago === 'CUENTA_CORRIENTE'
      ? !!clienteSeleccionadoId
      : true

  const confirmarVenta = async () => {
    if (!puedeConfirmar) return
    setProcesando(true)
    let ventaCreadaId: string | null = null

    try {
      const ventaId = uuidv4()
      const ahora = new Date().toISOString()
      const sesionActiva = useCajaStore.getState().sesionActiva
      const usuario = useAuthStore.getState().usuario
      const kiosco = useAuthStore.getState().kiosco
      const diasRestantes = useAuthStore.getState().diasRestantes
      const kioscoId = usuario?.kiosco_id || kiosco?.id

      if (!usuario?.es_superadmin && (kiosco?.estado_suscripcion === 'SOLO_LECTURA' || (diasRestantes !== null && diasRestantes < 0))) {
        toast.error('El sistema está en modo Solo Lectura por suscripción vencida. No es posible registrar nuevas ventas.')
        setProcesando(false)
        return
      }

      if (items.length === 0) {
        toast.error('El carrito no contiene productos')
        setProcesando(false)
        return
      }

      if (total < 0) {
        toast.error('El total a cobrar no puede ser negativo')
        setProcesando(false)
        return
      }

      if (!kioscoId) {
        throw new Error('No se encontró el identificador del kiosco para registrar la venta')
      }

      const descAjuste = descripcionAjuste()
      const clienteInfo =
        medioPago === 'CUENTA_CORRIENTE' && clienteSeleccionado
          ? `Cliente: ${clienteSeleccionado.nombre}`
          : null

      const notasBase = descAjuste
        ? (referencia ? `${descAjuste} · ${referencia}` : descAjuste)
        : (referencia || null)

      const notasFinal = clienteInfo
        ? (notasBase ? `${clienteInfo} · ${notasBase}` : clienteInfo)
        : notasBase

      // Advertencia en consola/log si algún producto tiene stock insuficiente
      const productosSinStock = items.filter(
        (it) => it.producto.activo !== false && it.cantidad > it.producto.stock_actual
      )
      if (productosSinStock.length > 0) {
        console.warn('Venta con stock negativo:', productosSinStock.map((it) => it.producto.descripcion))
      }

      // Si es Cuenta Corriente, validar límite de crédito
      if (medioPago === 'CUENTA_CORRIENTE') {
        if (!clienteSeleccionadoId || !clienteSeleccionado) {
          toast.error('Debes seleccionar un cliente para cuenta corriente')
          setProcesando(false)
          return
        }

        if (
          clienteSeleccionado.limite_credito > 0 &&
          clienteSeleccionado.saldo_deudor + total > clienteSeleccionado.limite_credito
        ) {
          const superaPor = formatPrecio(clienteSeleccionado.saldo_deudor + total - clienteSeleccionado.limite_credito)
          const confirmarExceso = window.confirm(
            `Atención: Esta venta superará el límite de crédito del cliente (${formatPrecio(clienteSeleccionado.limite_credito)}) por ${superaPor}.\n\n¿Desea autorizar la operación de todas formas?`
          )
          if (!confirmarExceso) {
            setProcesando(false)
            return
          }
        }
      }

      // 1. Insertar la venta
      const { error: ventaError } = await supabase.from('ventas').insert({
        id: ventaId,
        kiosco_id: kioscoId,
        usuario_id: usuario?.id || null,
        sesion_caja_id: sesionActiva?.id || null,
        fecha_hora: ahora,
        total,
        estado: 'COMPLETADA',
        notas: notasFinal,
        sincronizado: true,
      })

      if (ventaError) throw ventaError
      ventaCreadaId = ventaId

      // 1b. Si hay artículos libres ad-hoc, persistirlos en productos con activo: false
      const itemsLibres = items.filter((it) => it.producto.activo === false)
      if (itemsLibres.length > 0) {
        await supabase.from('productos').insert(
          itemsLibres.map((it) => ({
            id: it.producto.id,
            kiosco_id: kioscoId,
            descripcion: it.producto.descripcion,
            precio_costo: 0,
            precio_venta: it.producto.precio_venta,
            stock_actual: 99999,
            stock_minimo: 0,
            es_favorito: false,
            activo: false,
            fecha_creacion: ahora,
            fecha_actualizacion: ahora,
          }))
        )
      }

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

      // 4. Actualizar stock físico en catálogo y asentar egreso en movimientos_stock
      for (const it of items) {
        if (it.producto.activo === false) continue

        // Si es un COMBO / PACK, descontar los productos que lo integran (con FEFO)
        if (it.producto.es_combo) {
          try {
            await useComboStore.getState().descontarStockComponentesCombo(
              it.producto.id,
              it.cantidad,
              kioscoId,
              usuario?.id || null,
              ventaId
            )
          } catch (errCombo) {
            console.warn(`Error al descontar componentes del combo ${it.producto.descripcion}:`, errCombo)
          }
          continue
        }

        const nuevoStock = it.producto.stock_actual - it.cantidad
        try {
          await supabase
            .from('productos')
            .update({
              stock_actual: nuevoStock,
              fecha_actualizacion: ahora,
            })
            .eq('id', it.producto.id)

          await supabase.from('movimientos_stock').insert({
            kiosco_id: kioscoId,
            producto_id: it.producto.id,
            tipo: 'EGRESO',
            cantidad: -it.cantidad,
            motivo: 'VENTA',
            notas: `Venta #${ventaId.slice(0, 8).toUpperCase()}`,
            usuario_id: usuario?.id || null,
            fecha: ahora,
          })

          // Descontar por FEFO de los lotes de vencimiento si el producto tiene lotes activos
          try {
            await useLoteStore.getState().descontarStockFEFO(it.producto.id, it.cantidad)
          } catch (errLote) {
            console.warn(`Aviso: deducción de lote FEFO para ${it.producto.descripcion}:`, errLote)
          }
        } catch (errStock) {
          console.warn(`Error al actualizar stock para ${it.producto.descripcion}:`, errStock)
        }
      }

      // Sincronizar de inmediato el stock en la caché local (kiosko_cache_productos)
      try {
        const cachedRaw = localStorage.getItem('kiosko_cache_productos')
        if (cachedRaw) {
          const cachedProds: any[] = JSON.parse(cachedRaw)
          const itemsMap = new Map(items.map((i) => [i.producto.id, i.cantidad]))
          const actualizados = cachedProds.map((p) => {
            const qty = itemsMap.get(p.id)
            if (qty !== undefined) {
              return { ...p, stock_actual: (p.stock_actual || 0) - qty }
            }
            return p
          })
          localStorage.setItem('kiosko_cache_productos', JSON.stringify(actualizados))
        }
      } catch (cacheErr) {
        console.warn('Error sincronizando stock en memoria local:', cacheErr)
      }

      // 5. Si es Cuenta Corriente, imputar cargo a la ficha del cliente
      if (medioPago === 'CUENTA_CORRIENTE') {
        await imputarCargoVenta(clienteSeleccionadoId, ventaId, total, notasFinal || undefined)
      }

      // 5. Si AFIP está habilitado y se solicitó factura electrónica, emitirla
      let afipTicketData: TicketData['afip'] = undefined

      if (emitirFiscal && afipConfig?.habilitado) {
        try {
          const resAFIP = await emitirFacturaVenta({
            ventaId,
            total,
            tipoDocCliente: tipoDocReceptor,
            nroDocCliente: tipoDocReceptor !== 99 && nroDocReceptor ? nroDocReceptor.trim() : '0',
            nombreCliente: clienteSeleccionado?.nombre || undefined,
          })

          if (resAFIP) {
            afipTicketData = {
              tipoComprobante: resAFIP.tipo_comprobante,
              tipoComprobanteNombre: `Factura ${resAFIP.letra}`,
              letra: resAFIP.letra,
              puntoVenta: resAFIP.punto_venta,
              nroComprobante: resAFIP.nro_comprobante,
              cae: resAFIP.cae,
              vtoCae: resAFIP.vto_cae,
              qrUrl: resAFIP.qr_url,
              cuitEmisor: resAFIP.cuit_emisor,
              condicionIva: resAFIP.condicion_iva,
              iibb: resAFIP.iibb,
              inicioActividades: resAFIP.inicio_actividades,
              tipoDocCliente: resAFIP.tipo_doc_cliente,
              nroDocCliente: resAFIP.nro_doc_cliente && resAFIP.nro_doc_cliente !== '0' ? resAFIP.nro_doc_cliente : undefined,
            }
          }
        } catch (errAFIP) {
          console.error('Error emitiendo comprobante AFIP:', errAFIP)
          toast.error(`Venta guardada, pero ocurrió un problema con AFIP: ${errAFIP instanceof Error ? errAFIP.message : 'Error desconocido'}`)
        }
      }

      // 6. Armar datos de ticket para comprobante térmico / digital
      const ticketGenerado: TicketData = {
        ventaId,
        fecha: ahora,
        items: items.map((it) => ({
          descripcion: it.producto.descripcion,
          cantidad: it.cantidad,
          precioUnitario: it.producto.precio_venta,
          subtotal: it.subtotal,
          descuentoPromo: it.descuento_promo,
          promoNombre: it.promo_nombre,
        })),
        subtotal,
        ajuste: tieneAjuste
          ? {
              descripcion: descripcionAjuste() || 'Ajuste',
              monto: ajuste,
              esDescuento: tipoAjuste.startsWith('DESCUENTO'),
            }
          : null,
        total,
        medioPago: medioPago === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : medioPago,
        pagaCon: medioPago === 'EFECTIVO' ? pagaConNum : undefined,
        vuelto: medioPago === 'EFECTIVO' ? vuelto : undefined,
        kioscoNombre: kiosco?.nombre,
        kioscoDireccion: kiosco?.direccion,
        kioscoTelefono: kiosco?.telefono,
        cajeroNombre: usuario?.nombre,
        clienteNombre: clienteSeleccionado?.nombre || null,
        clienteTelefono: clienteSeleccionado?.telefono || null,
        notas: notasFinal,
        afip: afipTicketData,
      }

      toast.success(
        medioPago === 'CUENTA_CORRIENTE'
          ? `Venta a cuenta corriente registrada — ${formatPrecio(total)}`
          : `Venta registrada — ${formatPrecio(total)}`
      )
      if (medioPago === 'EFECTIVO' && vuelto > 0) {
        toast(`Vuelto: ${formatPrecio(vuelto)}`, { duration: 5000 })
      }

      vaciarCarrito()
      resetForm()
      onVentaCompletada(ticketGenerado)
      onClose()
    } catch (error) {
      console.error('Error al registrar venta:', error)
      // Rollback de venta incompleta para evitar datos huérfanos o corruptos
      if (ventaCreadaId) {
        try {
          await supabase.from('detalles_venta').delete().eq('venta_id', ventaCreadaId)
          await supabase.from('pagos_venta').delete().eq('venta_id', ventaCreadaId)
          await supabase.from('ventas').delete().eq('id', ventaCreadaId)
        } catch (cleanupErr) {
          console.warn('Error en rollback de venta fallida:', cleanupErr)
        }
      }
      let msg = 'No se pudo registrar la venta. Por favor verificá tu conexión e intentá de nuevo.'
      if (error instanceof Error) {
        const lower = error.message.toLowerCase()
        if (lower.includes('failed to fetch') || lower.includes('network') || lower.includes('conexión') || lower.includes('fetch')) {
          msg = 'Problema de conexión con el servidor. Verificá internet e intentá nuevamente.'
        } else {
          msg = error.message
        }
      }
      toast.error(msg, { duration: 6000 })
    } finally {
      setProcesando(false)
    }
  }

  const resetForm = () => {
    setMedioPago('EFECTIVO')
    setPagaCon('')
    setReferencia('')
    setClienteSeleccionadoId('')
    setBusquedaCliente('')
    setEmitirFiscal(false)
    setTipoDocReceptor(99)
    setNroDocReceptor('')
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
            <p className="text-xs uppercase tracking-wider text-indigo-700 dark:text-indigo-300 font-bold">Total a cobrar</p>
            <p className="text-3xl font-black text-indigo-950 dark:text-white tracking-tight">{formatPrecio(total)}</p>
          </div>
        </div>

        {/* Medio de pago */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Medio de pago</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {MEDIOS_PAGO.map((mp) => (
              <button
                key={mp.valor}
                type="button"
                onClick={() => setMedioPago(mp.valor)}
                className={`flex items-center justify-center p-3 rounded-xl border-2 text-sm font-semibold min-h-[46px] active:scale-95 transition-all ${
                  mp.valor === 'CUENTA_CORRIENTE' ? 'col-span-2 sm:col-span-1' : ''
                } ${
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

        {/* Cuenta Corriente: Selección de cliente */}
        {medioPago === 'CUENTA_CORRIENTE' && (
          <div className="space-y-3 p-3.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl">
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Seleccionar Cliente para fiar / imputar deuda *
              </label>
              <input
                type="text"
                placeholder="Buscar cliente por nombre o DNI..."
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
            </div>

            {clientesFiltrados.length === 0 ? (
              <div className="text-center py-4 text-xs text-gray-400 dark:text-gray-500">
                {clientes.length === 0
                  ? 'Aún no hay clientes registrados. Podés dar de alta clientes en la sección Clientes.'
                  : 'No se encontraron clientes coincidentes con la búsqueda.'}
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1.5 pr-0.5">
                {clientesFiltrados.map((cli) => {
                  const isSelected = cli.id === clienteSeleccionadoId
                  return (
                    <button
                      key={cli.id}
                      type="button"
                      onClick={() => setClienteSeleccionadoId(cli.id)}
                      className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between ${
                        isSelected
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 font-semibold shadow-xs'
                          : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`}
                    >
                      <div>
                        <p className="font-semibold text-gray-900 dark:text-gray-100">{cli.nombre}</p>
                        {cli.dni_cuit && <p className="text-[10px] text-gray-400">DNI/CUIT: {cli.dni_cuit}</p>}
                        {cli.telefono && <p className="text-[10px] text-gray-400">Tel: {cli.telefono}</p>}
                      </div>
                      <div className="text-right flex-shrink-0 ml-2">
                        <p
                          className={`font-bold ${
                            cli.saldo_deudor > 0
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          Debe: {formatPrecio(cli.saldo_deudor)}
                        </p>
                        {cli.limite_credito > 0 ? (
                          <p className="text-[10px] text-gray-400">Límite: {formatPrecio(cli.limite_credito)}</p>
                        ) : (
                          <p className="text-[10px] text-gray-400">Sin límite</p>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            )}

            {clienteSeleccionado && (
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Cliente elegido:</span>
                  <span className="font-bold text-gray-900 dark:text-gray-100">{clienteSeleccionado.nombre}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Saldo deudor actual:</span>
                  <span className="font-medium text-gray-800 dark:text-gray-200">
                    {formatPrecio(clienteSeleccionado.saldo_deudor)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500 dark:text-gray-400">Nuevo saldo estimado:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">
                    {formatPrecio(clienteSeleccionado.saldo_deudor + total)}
                  </span>
                </div>
                {clienteSeleccionado.limite_credito > 0 &&
                  clienteSeleccionado.saldo_deudor + total > clienteSeleccionado.limite_credito && (
                    <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                      Atención: El nuevo saldo superará el límite de crédito ({formatPrecio(clienteSeleccionado.limite_credito)}).
                    </div>
                  )}
              </div>
            )}
          </div>
        )}

        {/* Efectivo: calculadora de vuelto */}
        {medioPago === 'EFECTIVO' && (
          <div className="space-y-3">
            <Input
              label="El cliente paga con"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={pagaCon}
              onChange={handlePagaConChange}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && puedeConfirmar && !procesando) {
                  e.preventDefault()
                  confirmarVenta()
                }
              }}
              placeholder="Ingresá monto (ej: 2500) y tocá Enter"
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
                onClick={() => setPagaCon(Math.round(total).toString())}
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

        {/* Facturación Electrónica AFIP */}
        {afipConfig?.habilitado && (
          <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/60 dark:bg-blue-950/20 space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={emitirFiscal}
                  onChange={(e) => setEmitirFiscal(e.target.checked)}
                  className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                />
                <span className="text-xs font-bold text-blue-900 dark:text-blue-200">
                  Emitir Factura AFIP ({afipConfig.condicion_iva === 'MONOTRIBUTO' ? 'Factura C' : 'Factura B'})
                </span>
              </label>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                afipConfig.entorno === 'PRODUCCION'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
              }`}>
                {afipConfig.entorno === 'PRODUCCION' ? 'Producción' : 'Modo Prueba'}
              </span>
            </div>

            {emitirFiscal && (
              <div className="pt-2 border-t border-blue-200/60 dark:border-blue-800/40 grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div>
                  <label className="block text-[11px] font-medium text-blue-900 dark:text-blue-300 mb-1">
                    Tipo de Identificación
                  </label>
                  <select
                    value={tipoDocReceptor}
                    onChange={(e) => setTipoDocReceptor(Number(e.target.value) as TipoDocumentoAFIP)}
                    className="w-full px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs"
                  >
                    <option value={99}>Consumidor Final (Sin DNI)</option>
                    <option value={96}>DNI</option>
                    <option value={80}>CUIT</option>
                  </select>
                </div>
                {tipoDocReceptor !== 99 && (
                  <div>
                    <label className="block text-[11px] font-medium text-blue-900 dark:text-blue-300 mb-1">
                      Número de {tipoDocReceptor === 96 ? 'DNI' : 'CUIT'}
                    </label>
                    <input
                      type="text"
                      value={nroDocReceptor}
                      onChange={(e) => setNroDocReceptor(e.target.value)}
                      placeholder={tipoDocReceptor === 96 ? 'Ej: 35123456' : 'Ej: 20351234568'}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-blue-200 dark:border-blue-800 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
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
