import { useState, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../../lib/supabase'
import { useCartStore } from '../../stores/cartStore'
import { useCajaStore } from '../../stores/cajaStore'
import { useAuthStore } from '../../stores/authStore'
import { useClienteStore } from '../../stores/clienteStore'
import { formatPrecio, getCachedProductos, saveCachedProductos } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'
import type { MedioPago } from '../../types/database'
import type { TicketData } from './TicketReceiptModal'
import { useAFIPStore, validarCUIT } from '../../stores/afipStore'
import { useLoteStore } from '../../stores/loteStore'
import { useComboStore } from '../../stores/comboStore'
import { useOfflineSyncStore } from '../../stores/offlineSyncStore'
import type { TipoDocumentoAFIP } from '../../types/afip'
import toast from 'react-hot-toast'

export interface LineaPagoMixto {
  id: string
  medio_pago: MedioPago
  monto: number
}

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
  { valor: 'CUENTA_CORRIENTE', label: 'Fiar / Cuenta' },
]

export function PaymentModal({ isOpen, onClose, onVentaCompletada }: PaymentModalProps) {
  const {
    items,
    totalMonto,
    subtotalMonto,
    montoAjuste,
    tipoAjuste,
    descripcionAjuste,
    completarVentaTabActiva,
  } = useCartStore()

  const {
    clientes,
    cargarClientes,
    imputarCargoVenta,
  } = useClienteStore()
  const { config: afipConfig, emitirFacturaVenta, cargarConfiguracion } = useAFIPStore()
  const [clienteSeleccionadoId, setClienteSeleccionadoId] = useState<string>('')
  const [busquedaCliente, setBusquedaCliente] = useState<string>('')
  const [emitirFiscal, setEmitirFiscal] = useState(false)
  const [tipoDocReceptor, setTipoDocReceptor] = useState<TipoDocumentoAFIP>(99)
  const [nroDocReceptor, setNroDocReceptor] = useState<string>('')

  const totalBase = totalMonto()
  const subtotal = subtotalMonto()
  const ajuste = montoAjuste()
  const tieneAjuste = tipoAjuste !== 'NINGUNO'

  const clienteSeleccionado = clientes.find((c) => c.id === clienteSeleccionadoId)
  const total = totalBase

  const [medioPago, setMedioPago] = useState<MedioPago>('EFECTIVO')
  const [pagaCon, setPagaCon] = useState<string>('')
  const [referencia, setReferencia] = useState('')
  const [procesando, setProcesando] = useState(false)
  const procesandoRef = useRef(false)

  // ── Estados para Pago Mixto / Dividido ─────────────────────────────────────
  const [esPagoMixto, setEsPagoMixto] = useState<boolean>(false)
  const [pagosMixtos, setPagosMixtos] = useState<LineaPagoMixto[]>([])

  const totalPagosMixtos = Math.round(pagosMixtos.reduce((acc, p) => acc + (Number(p.monto) || 0), 0))
  const saldoRestanteMixto = Math.round(total) - totalPagosMixtos
  const tieneCuentaCorrienteEnMixto = esPagoMixto && pagosMixtos.some((p) => p.medio_pago === 'CUENTA_CORRIENTE')

  const activarPagoMixto = () => {
    setEsPagoMixto(true)
    if (pagosMixtos.length === 0) {
      const mitad = Math.round(total / 2)
      setPagosMixtos([
        { id: uuidv4(), medio_pago: 'EFECTIVO', monto: mitad },
        { id: uuidv4(), medio_pago: 'MERCADOPAGO', monto: Math.round(total) - mitad },
      ])
    }
  }

  const agregarLineaPagoMixto = () => {
    if (pagosMixtos.length >= 4) return
    const faltante = Math.max(0, saldoRestanteMixto)
    setPagosMixtos((prev) => [
      ...prev,
      { id: uuidv4(), medio_pago: 'TRANSFERENCIA', monto: faltante },
    ])
  }

  const eliminarLineaPagoMixto = (id: string) => {
    setPagosMixtos((prev) => prev.filter((l) => l.id !== id))
  }

  const actualizarLineaPagoMixto = (id: string, campo: 'medio_pago' | 'monto', valor: any) => {
    setPagosMixtos((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l
        if (campo === 'monto') {
          const num = Math.max(0, parseInt(valor, 10) || 0)
          return { ...l, monto: num }
        }
        return { ...l, [campo]: valor }
      })
    )
  }

  const llenarSaldoRestanteEnLinea = (id: string) => {
    setPagosMixtos((prev) => {
      const sumaOtros = prev.filter((l) => l.id !== id).reduce((acc, l) => acc + (l.monto || 0), 0)
      const nuevoMonto = Math.max(0, Math.round(total) - sumaOtros)
      return prev.map((l) => (l.id === id ? { ...l, monto: nuevoMonto } : l))
    })
  }

  useEffect(() => {
    if (isOpen) {
      cargarClientes()
      cargarConfiguracion()
      setEsPagoMixto(false)
      setPagosMixtos([])
      setMedioPago('EFECTIVO')
      setPagaCon('')
      setReferencia('')
    }
  }, [isOpen, cargarClientes, cargarConfiguracion])

  // Emisión fiscal: siempre inicia en false para control manual total del cajero
  useEffect(() => {
    if (isOpen) {
      setEmitirFiscal(false)
      setTipoDocReceptor(99)
      setNroDocReceptor('')
    }
  }, [isOpen])

  // Navegación rápida con flechas izquierda / derecha para alternar medios de pago
  useEffect(() => {
    if (!isOpen) return
    const handleModalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return

      const activeEl = document.activeElement as HTMLElement | null
      const isInput = activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA')

      // Flechas Izquierda / Derecha para cambiar medio de pago si no está navegando texto
      if (!esPagoMixto && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        // Solo prevenir si no está en un input o si el input está vacío
        if (!isInput || (activeEl as HTMLInputElement).value === '') {
          const order: MedioPago[] = ['EFECTIVO', 'MERCADOPAGO', 'TRANSFERENCIA', 'TARJETA', 'CUENTA_CORRIENTE']
          const currIdx = order.indexOf(medioPago)
          if (currIdx !== -1) {
            e.preventDefault()
            const nextIdx =
              e.key === 'ArrowRight'
                ? (currIdx + 1) % order.length
                : (currIdx - 1 + order.length) % order.length
            setMedioPago(order[nextIdx])
          }
        }
      }
    }
    window.addEventListener('keydown', handleModalKeyDown)
    return () => window.removeEventListener('keydown', handleModalKeyDown)
  }, [isOpen, esPagoMixto, medioPago])

  const clientesFiltrados = clientes.filter(
    (c) =>
      c.activo &&
      (c.nombre.toLowerCase().includes(busquedaCliente.toLowerCase()) ||
        (c.dni_cuit && c.dni_cuit.includes(busquedaCliente)))
  )

  // Si el cliente seleccionado tiene DNI o CUIT, precargar en ARCA
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
  const vuelto = !esPagoMixto && medioPago === 'EFECTIVO' && pagaCon
    ? Math.max(0, pagaConNum - Math.round(total))
    : 0

  const handlePagaConChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Solo permitir números enteros (sin centavos flotantes como 0.5, 2000.5)
    const soloEnteros = e.target.value.replace(/[^0-9]/g, '')
    setPagaCon(soloEnteros)
  }

  const puedeConfirmar = esPagoMixto
    ? totalPagosMixtos === Math.round(total) &&
      pagosMixtos.length > 0 &&
      pagosMixtos.every((p) => p.monto > 0) &&
      (!tieneCuentaCorrienteEnMixto || !!clienteSeleccionadoId)
    : medioPago === 'EFECTIVO'
    ? (pagaCon === '' || pagaConNum >= total)
    : medioPago === 'CUENTA_CORRIENTE'
    ? !!clienteSeleccionadoId
    : true

  const confirmarVenta = async () => {
    if (procesandoRef.current || !puedeConfirmar) return
    procesandoRef.current = true
    setProcesando(true)
    let ventaCreadaId: string | null = null
    let registrarVentaEnModoOffline: (() => Promise<void>) | null = null

    try {
      const ventaId = uuidv4()
      const ahora = new Date().toISOString()
      const sesionActiva = useCajaStore.getState().sesionActiva
      const usuario = useAuthStore.getState().usuario
      const kiosco = useAuthStore.getState().kiosco
      const diasRestantes = useAuthStore.getState().diasRestantes
      const kioscoId = usuario?.kiosco_id || kiosco?.id

      if (!sesionActiva?.id) {
        toast.error('No hay una caja abierta. Por favor, abrí el turno de caja antes de registrar ventas.')
        procesandoRef.current = false
        setProcesando(false)
        return
      }

      if (!usuario?.es_superadmin && (kiosco?.estado_suscripcion === 'SOLO_LECTURA' || (diasRestantes !== null && diasRestantes < 0))) {
        toast.error('El sistema está en modo Solo Lectura por suscripción vencida. No es posible registrar nuevas ventas.')
        procesandoRef.current = false
        setProcesando(false)
        return
      }

      if (items.length === 0) {
        toast.error('El carrito no contiene productos')
        procesandoRef.current = false
        setProcesando(false)
        return
      }

      if (totalBase < 0 || total < 0) {
        toast.error('El ticket tiene saldo a favor del cliente. Reintegrá el dinero desde "Recibir Envases > Pagar en efectivo" o agregá más productos.')
        procesandoRef.current = false
        setProcesando(false)
        return
      }

      if (!kioscoId) {
        throw new Error('No se encontró el identificador del kiosco para registrar la venta')
      }

      // Validación de consistencia fiscal ante ARCA
      if (emitirFiscal) {
        if (!afipConfig?.habilitado) {
          toast.error('La facturación electrónica ARCA no está habilitada en la Configuración.', { id: 'arca-deshabilitada' })
          procesandoRef.current = false
          setProcesando(false)
          return
        }

        if (tipoDocReceptor === 96) {
          const dniLimpio = nroDocReceptor.replace(/\D/g, '')
          if (!dniLimpio || dniLimpio.length < 7 || dniLimpio.length > 8) {
            toast.error('Por favor ingresá un número de DNI válido (7 u 8 dígitos) o seleccioná Consumidor Final')
            procesandoRef.current = false
            setProcesando(false)
            return
          }
        } else if (tipoDocReceptor === 80) {
          const cuitLimpio = nroDocReceptor.replace(/\D/g, '')
          if (!cuitLimpio || !validarCUIT(cuitLimpio)) {
            toast.error('Por favor ingresá un número de CUIT válido (11 dígitos verificados) o seleccioná Consumidor Final')
            procesandoRef.current = false
            setProcesando(false)
            return
          }
        }
      }

      const descAjuste = descripcionAjuste()
      const clienteInfo = clienteSeleccionado ? `Cliente: ${clienteSeleccionado.nombre}` : null

      const notasBase = [descAjuste, referencia].filter(Boolean).join(' · ')
      const notasFinal = [clienteInfo, notasBase].filter(Boolean).join(' · ') || null

      // Advertencia en consola/log si algún producto tiene stock insuficiente
      const productosSinStock = items.filter(
        (it) => it.producto.activo !== false && it.cantidad > it.producto.stock_actual
      )
      if (productosSinStock.length > 0) {
        console.warn('Venta con stock negativo:', productosSinStock.map((it) => it.producto.descripcion))
      }

      // Si hay saldo a Cuenta Corriente, validar límite de crédito
      const montoCuentaCorriente = esPagoMixto
        ? pagosMixtos.filter((p) => p.medio_pago === 'CUENTA_CORRIENTE').reduce((acc, p) => acc + p.monto, 0)
        : (medioPago === 'CUENTA_CORRIENTE' ? total : 0)

      if (montoCuentaCorriente > 0) {
        if (!clienteSeleccionadoId || !clienteSeleccionado) {
          toast.error('Debes seleccionar un cliente para imputar a cuenta corriente')
          procesandoRef.current = false
          setProcesando(false)
          return
        }

        const saldoDeudor = clienteSeleccionado.saldo_deudor || 0
        const limiteCredito = clienteSeleccionado.limite_credito || 0
        if (
          limiteCredito > 0 &&
          saldoDeudor + montoCuentaCorriente > limiteCredito
        ) {
          const superaPor = formatPrecio(saldoDeudor + montoCuentaCorriente - limiteCredito)
          const confirmarExceso = window.confirm(
            `Atención: Esta venta superará el límite de crédito del cliente (${formatPrecio(limiteCredito)}) por ${superaPor}.\n\n¿Desea autorizar la operación de todas formas?`
          )
          if (!confirmarExceso) {
            procesandoRef.current = false
            setProcesando(false)
            return
          }
        }
      }

      // Función auxiliar para registrar la venta en cola offline local si no hay red
      registrarVentaEnModoOffline = async () => {
        useOfflineSyncStore.getState().encolarVenta({
          id: ventaId,
          kiosco_id: kioscoId,
          usuario_id: usuario?.id || null,
          sesion_caja_id: sesionActiva?.id || null,
          fecha_hora: ahora,
          total,
          estado: 'COMPLETADA',
          notas: notasFinal ? `${notasFinal} (Guardado Offline)` : '(Guardado Offline)',
          detalles: items.map((item) => ({
            id: uuidv4(),
            producto_id: item.producto.id,
            cantidad: Math.max(0.001, Number(item.cantidad) || 1),
            precio_unitario: Math.round(
              Number(
                item.sin_envase
                  ? item.producto.precio_venta + (item.precio_envase_unitario || item.producto.precio_envase || 0)
                  : item.producto.precio_venta
              ) || 0
            ),
            subtotal: Math.round(Number(item.subtotal) || 0),
            sin_envase: Boolean(item.sin_envase),
            precio_envase_unitario: Number(item.precio_envase_unitario || 0),
            es_devolucion_envase: Boolean(item.es_devolucion_envase),
          })),
          pagos: esPagoMixto
            ? pagosMixtos.map((p) => ({ medio_pago: p.medio_pago, monto: Math.round(Number(p.monto) || 0), referencia: referencia || null }))
            : [{ medio_pago: medioPago, monto: total, referencia: referencia || null }],
          cliente_id: clienteSeleccionadoId || null,
          fecha_encolado: ahora,
        })

        // Descontar de lotes por FEFO localmente (manejando combos y productos estándar)
        for (const it of items) {
          if (it.producto.es_combo) {
            const componentes = useComboStore.getState().obtenerComponentesDeCombo(it.producto.id)
            for (const comp of componentes) {
              const cantComp = comp.cantidad * it.cantidad
              try {
                await useLoteStore.getState().descontarStockFEFO(comp.componente_producto_id, cantComp)
              } catch (e) {
                console.warn('Aviso lote FEFO combo offline:', e)
              }
            }
          } else {
            try {
              await useLoteStore.getState().descontarStockFEFO(it.producto.id, it.cantidad)
            } catch (e) {
              console.warn('Aviso lote FEFO offline:', e)
            }
          }
        }

        // Descontar stock local en memoria (componentes físicos de combos y productos estándar)
        try {
          const cachedProds = getCachedProductos(kioscoId)
          if (cachedProds && cachedProds.length > 0) {
            const itemsMap = new Map<string, number>()
            for (const it of items) {
              if (it.producto.es_combo) {
                const componentes = useComboStore.getState().obtenerComponentesDeCombo(it.producto.id)
                for (const comp of componentes) {
                  const actual = itemsMap.get(comp.componente_producto_id) || 0
                  itemsMap.set(comp.componente_producto_id, actual + comp.cantidad * it.cantidad)
                }
              } else {
                const actual = itemsMap.get(it.producto.id) || 0
                itemsMap.set(it.producto.id, actual + it.cantidad)
              }
            }

            const actualizados = cachedProds.map((p) => {
              const qty = itemsMap.get(p.id)
              if (qty !== undefined) {
                return { ...p, stock_actual: Number(((p.stock_actual || 0) - qty).toFixed(3)) }
              }
              return p
            })
            saveCachedProductos(actualizados, kioscoId)
          }
        } catch (e) {
          console.warn('Error stock local offline:', e)
        }

        // Generar comprobante / ticket
        const pagosTicket = esPagoMixto
          ? pagosMixtos.map((p) => ({ medioPago: p.medio_pago, monto: p.monto }))
          : [{ medioPago: medioPago === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : medioPago, monto: total }]

        const ticketGenerado: TicketData = {
          ventaId,
          fecha: ahora,
          items: items.map((it) => {
            let desc = it.producto.descripcion
            if (it.sin_envase) desc = `${it.producto.descripcion} (Sin envase)`
            const precioUnit = it.sin_envase
              ? it.producto.precio_venta + (it.precio_envase_unitario || it.producto.precio_envase || 0)
              : it.producto.precio_venta
            return {
              descripcion: desc,
              cantidad: it.cantidad,
              precioUnitario: precioUnit,
              subtotal: it.subtotal,
            }
          }),
          subtotal: Math.round(items.reduce((acc, it) => acc + it.subtotal, 0)),
          ajuste: ajuste !== 0 ? { descripcion: descAjuste || 'Ajuste', monto: ajuste, esDescuento: tipoAjuste.startsWith('DESCUENTO') } : null,
          total,
          medioPago: esPagoMixto ? 'Pago Mixto' : (medioPago === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : medioPago),
          pagos: pagosTicket,
          pagaCon: !esPagoMixto && medioPago === 'EFECTIVO' ? (pagaCon === '' ? total : pagaConNum) : undefined,
          vuelto: !esPagoMixto && medioPago === 'EFECTIVO' ? (pagaCon === '' ? 0 : vuelto) : undefined,
          kioscoNombre: kiosco?.nombre,
          kioscoDireccion: kiosco?.direccion,
          kioscoTelefono: kiosco?.telefono,
          cajeroNombre: usuario?.nombre,
          clienteNombre: clienteSeleccionado?.nombre || null,
          clienteTelefono: clienteSeleccionado?.telefono || null,
          notas: notasFinal ? `${notasFinal} [GUARDADO OFFLINE]` : '[GUARDADO OFFLINE]',
        }

        toast.success(`Venta guardada offline — ${formatPrecio(total)}. Se sincronizará automáticamente cuando vuelva internet.`, { icon: '💾', duration: 5000 })
        if (!esPagoMixto && medioPago === 'EFECTIVO' && pagaCon !== '' && vuelto > 0) {
          toast(`Vuelto: ${formatPrecio(vuelto)}`, { duration: 5000 })
        }

        completarVentaTabActiva()
        resetForm()
        onVentaCompletada(ticketGenerado)
        onClose()
        procesandoRef.current = false
        setProcesando(false)
      }

      // Si el navegador no tiene conexión a internet, procesar directamente en la cola offline
      if (!navigator.onLine) {
        await registrarVentaEnModoOffline()
        return
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
        const { error: errorLibres } = await supabase.from('productos').upsert(
          itemsLibres.map((it) => ({
            id: it.producto.id,
            kiosco_id: kioscoId,
            descripcion: it.producto.descripcion,
            precio_costo: 0,
            precio_venta: Math.max(0, it.producto.precio_venta),
            stock_actual: 99999,
            stock_minimo: 0,
            es_favorito: false,
            activo: false,
            fecha_creacion: ahora,
            fecha_actualizacion: ahora,
          })),
          { onConflict: 'id' }
        )
        if (errorLibres) {
          console.warn('Aviso al persistir artículos libres en catálogo:', errorLibres)
        }
      }

      // 2. Insertar detalles de venta
      const detalles = items.map((item) => ({
        id: uuidv4(),
        venta_id: ventaId,
        producto_id: item.producto.id,
        cantidad: Math.max(0.001, Number(item.cantidad) || 1),
        precio_unitario: Math.round(
          Number(
            item.sin_envase
              ? item.producto.precio_venta + (item.precio_envase_unitario || item.producto.precio_envase || 0)
              : item.producto.precio_venta
          ) || 0
        ),
        subtotal: Math.round(Number(item.subtotal) || 0),
        sin_envase: Boolean(item.sin_envase),
        precio_envase_unitario: Number(item.precio_envase_unitario || 0),
        es_devolucion_envase: Boolean(item.es_devolucion_envase),
      }))

      let { error: detalleError } = await supabase.from('detalles_venta').insert(detalles)

      // Fallback de resiliencia: si la columna cantidad en Supabase aún es INTEGER (previo a migración)
      if (detalleError && detalleError.message?.includes('invalid input syntax for type integer')) {
        console.warn('detalles_venta.cantidad requiere tipo NUMERIC en Supabase. Aplicando compatibilidad para registrar la venta...')
        const detallesCompat = detalles.map((d) => ({
          ...d,
          cantidad: Math.max(1, Math.round(d.cantidad)),
        }))
        const retryResult = await supabase.from('detalles_venta').insert(detallesCompat)
        detalleError = retryResult.error
      }

      if (detalleError) throw detalleError

      // 3. Insertar pago(s)
      if (esPagoMixto) {
        const pagosInsertar = pagosMixtos.map((p) => ({
          venta_id: ventaId,
          medio_pago: p.medio_pago,
          monto: Math.round(Number(p.monto) || 0),
          referencia: p.medio_pago === 'EFECTIVO' ? null : (referencia || null),
        }))
        const { error: pagoError } = await supabase.from('pagos_venta').insert(pagosInsertar)
        if (pagoError) throw pagoError
      } else {
        const { error: pagoError } = await supabase.from('pagos_venta').insert({
          venta_id: ventaId,
          medio_pago: medioPago,
          monto: Math.round(Number(total) || 0),
          referencia: medioPago === 'EFECTIVO' ? null : (referencia || null),
        })
        if (pagoError) throw pagoError
      }

      // 4. Actualizar stock físico en catálogo y asentar egreso en movimientos_stock
      for (const it of items) {
        if (it.producto.activo === false) continue

        try {
          // Si el producto es un combo, el stock físico reside en sus componentes individuales
          if (it.producto.es_combo) {
            try {
              await useComboStore
                .getState()
                .descontarStockComponentesCombo(
                  it.producto.id,
                  it.cantidad,
                  kioscoId,
                  usuario?.id || null,
                  ventaId
                )
            } catch (errCombo) {
              console.warn(`Error deduciendo componentes del combo ${it.producto.descripcion}:`, errCombo)
            }
            continue
          }

          // Si es un producto estándar, consultar el stock fresco en Supabase para evitar Lost Updates por ventas concurrentes
          let stockBase = it.producto.stock_actual
          try {
            const { data: pActual } = await supabase
              .from('productos')
              .select('stock_actual')
              .eq('id', it.producto.id)
              .maybeSingle()

            if (pActual && typeof pActual.stock_actual === 'number') {
              stockBase = pActual.stock_actual
            }
          } catch (errSyncStock) {
            console.warn('Fallback a stock de carrito para deducción:', errSyncStock)
          }

          const nuevoStock = Number((stockBase - it.cantidad).toFixed(3))

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

      // Sincronizar de inmediato el stock en la caché local asegurando coherencia multi-inquilino
      try {
        const cachedProds = getCachedProductos(kioscoId)
        if (cachedProds && cachedProds.length > 0) {
          const itemsMap = new Map(items.map((i) => [i.producto.id, i.cantidad]))
          const actualizados = cachedProds.map((p) => {
            const qty = itemsMap.get(p.id)
            if (qty !== undefined) {
              return { ...p, stock_actual: Number(((p.stock_actual || 0) - qty).toFixed(3)) }
            }
            return p
          })
          saveCachedProductos(actualizados, kioscoId)
        }
      } catch (cacheErr) {
        console.warn('Error sincronizando stock en memoria local:', cacheErr)
      }

      // 5. Si tiene saldo en Cuenta Corriente, imputar cargo a la ficha del cliente
      if (montoCuentaCorriente > 0 && clienteSeleccionadoId) {
        await imputarCargoVenta(clienteSeleccionadoId, ventaId, montoCuentaCorriente, notasFinal || undefined)
      }

      // 5b. Si ARCA está habilitado y se solicitó factura electrónica, emitirla
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
          console.error('Error emitiendo comprobante ARCA:', errAFIP)
          toast.error(`Venta guardada, pero ocurrió un problema con ARCA: ${errAFIP instanceof Error ? errAFIP.message : 'Error desconocido'}`)
        }
      }

      // 6. Armar datos de ticket para comprobante térmico / digital
      const pagosTicket = esPagoMixto
        ? pagosMixtos.map((p) => ({ medioPago: p.medio_pago, monto: p.monto }))
        : [{ medioPago: medioPago === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : medioPago, monto: total }]

      const ticketGenerado: TicketData = {
        ventaId,
        fecha: ahora,
        items: items.map((it) => {
          let desc = it.producto.descripcion
          if (it.sin_envase) {
            desc = `${it.producto.descripcion} (Sin envase)`
          }
          const precioUnit = it.sin_envase
            ? it.producto.precio_venta + (it.precio_envase_unitario || it.producto.precio_envase || 0)
            : it.producto.precio_venta
          return {
            descripcion: desc,
            cantidad: it.cantidad,
            precioUnitario: precioUnit,
            subtotal: it.subtotal,
            descuentoPromo: it.descuento_promo,
            promoNombre: it.promo_nombre,
          }
        }),
        subtotal,
        ajuste: tieneAjuste
          ? {
              descripcion: descripcionAjuste() || 'Ajuste',
              monto: ajuste,
              esDescuento: tipoAjuste.startsWith('DESCUENTO'),
            }
          : null,
        total,
        medioPago: esPagoMixto
          ? 'Pago Mixto'
          : (medioPago === 'CUENTA_CORRIENTE' ? 'Cuenta Corriente' : medioPago),
        pagos: pagosTicket,
        pagaCon: !esPagoMixto && medioPago === 'EFECTIVO' ? (pagaCon === '' ? total : pagaConNum) : undefined,
        vuelto: !esPagoMixto && medioPago === 'EFECTIVO' ? (pagaCon === '' ? 0 : vuelto) : undefined,
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
        esPagoMixto
          ? `Venta con Pago Mixto registrada — ${formatPrecio(total)}`
          : medioPago === 'CUENTA_CORRIENTE'
          ? `Venta a cuenta corriente registrada — ${formatPrecio(total)}`
          : `Venta registrada — ${formatPrecio(total)}`
      )
      if (!esPagoMixto && medioPago === 'EFECTIVO' && pagaCon !== '' && vuelto > 0) {
        toast(`Vuelto: ${formatPrecio(vuelto)}`, { duration: 5000 })
      }

      completarVentaTabActiva()
      resetForm()
      onVentaCompletada(ticketGenerado)
      onClose()

      // Mantener actualizado el arqueo y balance de caja en memoria
      if (sesionActiva?.id) {
        useCajaStore.getState().cargarResumenSesion(sesionActiva.id).catch((err) => {
          console.warn('Aviso sincronizando resumen de caja post-venta:', err)
        })
      }
    } catch (error) {
      console.error('Error al registrar venta:', error)

      // Extraer mensaje descriptivo real del error (PostgrestError, Error nativo o string)
      const errObj = error as any
      const rawMsg =
        errObj?.message ||
        errObj?.error_description ||
        errObj?.details ||
        (error instanceof Error ? error.message : typeof error === 'string' ? error : '')

      let msg = 'No se pudo registrar la venta.'
      const lower = (rawMsg || '').toLowerCase()
      if (
        lower.includes('failed to fetch') ||
        lower.includes('network') ||
        lower.includes('conexión') ||
        lower.includes('fetch')
      ) {
        msg = 'Problema de conexión con el servidor. Verificá internet e intentá nuevamente.'
      } else if (rawMsg) {
        msg = `No se pudo registrar la venta: ${rawMsg}`
      }

      // Si falló por desconexión de red antes de impactar en Supabase, registrar en cola offline
      if (!ventaCreadaId && (
        lower.includes('failed to fetch') ||
        lower.includes('network') ||
        lower.includes('conexión') ||
        lower.includes('fetch') ||
        !navigator.onLine
      )) {
        console.warn('Fallo de red detectado al cobrar. Derivando a cola offline local...')
        if (registrarVentaEnModoOffline) {
          await registrarVentaEnModoOffline()
          return
        }
      }

      // Rollback de venta incompleta para evitar datos huérfanos o corruptos
      if (ventaCreadaId) {
        try {
          await supabase.from('detalles_venta').delete().eq('venta_id', ventaCreadaId)
          await supabase.from('pagos_venta').delete().eq('venta_id', ventaCreadaId)
          const { data: delVenta } = await supabase.from('ventas').delete().eq('id', ventaCreadaId).select()
          // Si el delete no eliminó filas (por políticas RLS), marcarla de inmediato como ANULADA
          if (!delVenta || delVenta.length === 0) {
            await supabase.from('ventas').update({
              estado: 'ANULADA',
              notas: `Registro cancelado por error: ${rawMsg || 'Error inesperado'}`,
            }).eq('id', ventaCreadaId)
          }
        } catch (cleanupErr) {
          console.warn('Error en rollback de venta fallida:', cleanupErr)
        }
      }

      toast.error(msg, { duration: 6000 })
    } finally {
      procesandoRef.current = false
      setProcesando(false)
    }
  }

  const resetForm = () => {
    setEsPagoMixto(false)
    setPagosMixtos([])
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
  const billetesRapidos = [1000, 2000, 5000, 10000, 20000, 50000]

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!procesando) onClose()
      }}
      title="Cobrar"
      size="md"
      footer={
        <Button
          size="lg"
          fullWidth
          variant="success"
          onClick={confirmarVenta}
          disabled={!puedeConfirmar}
          loading={procesando}
        >
          {emitirFiscal ? 'Confirmar y Facturar ARCA' : 'Confirmar y Cobrar'}
        </Button>
      }
    >
      <div className="space-y-3">
        {/* Total y Desglose */}
        <div className="py-2 px-3 bg-indigo-50/80 dark:bg-indigo-900/30 rounded-xl space-y-0.5 border border-indigo-200 dark:border-indigo-800/60">
          {tieneAjuste && (
            <div className="flex justify-between items-center px-2 text-xs text-gray-600 dark:text-gray-300 pb-1 border-b border-indigo-100 dark:border-indigo-800/40">
              <span>Subtotal: {formatPrecio(subtotal)}</span>
              <span className={tipoAjuste.startsWith('DESCUENTO') ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-blue-600 dark:text-blue-400 font-semibold'}>
                {descripcionAjuste()} ({tipoAjuste.startsWith('DESCUENTO') ? '-' : '+'}{formatPrecio(Math.abs(ajuste))})
              </span>
            </div>
          )}
          <div className="text-center pt-0.5">
            <p className="text-[11px] uppercase tracking-wider text-indigo-700 dark:text-indigo-300 font-bold">Total a cobrar</p>
            <p className="text-2xl sm:text-3xl font-black text-indigo-950 dark:text-white tracking-tight tabular-nums">{formatPrecio(total)}</p>
          </div>
        </div>

        {/* Selector Modalidad: Pago Simple vs Pago Mixto */}
        <div className="flex bg-gray-100 dark:bg-gray-800 p-1 rounded-xl gap-1 border border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={() => setEsPagoMixto(false)}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              !esPagoMixto
                ? 'bg-white dark:bg-gray-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Un solo medio
          </button>
          <button
            type="button"
            onClick={activarPagoMixto}
            className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              esPagoMixto
                ? 'bg-white dark:bg-gray-700 text-indigo-700 dark:text-indigo-300 shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Dividir pago (dos medios)
          </button>
        </div>

        {/* Medio de pago - Pago Simple */}
        {!esPagoMixto && (
          <div>
            <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">Medio de pago</label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {MEDIOS_PAGO.map((mp) => (
                <button
                  key={mp.valor}
                  type="button"
                  onClick={() => setMedioPago(mp.valor)}
                  className={`flex items-center justify-center p-2.5 rounded-xl border-2 text-xs sm:text-sm font-semibold min-h-[42px] active:scale-95 transition-all cursor-pointer ${
                    mp.valor === 'CUENTA_CORRIENTE' ? 'col-span-2 sm:col-span-1' : ''
                  } ${
                    medioPago === mp.valor
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 shadow-xs'
                      : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-400 hover:border-gray-400 dark:hover:border-gray-600'
                  }`}
                >
                  {mp.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Desglose de Líneas - Pago Mixto */}
        {esPagoMixto && (
          <div className="space-y-3 p-3 bg-gray-50/80 dark:bg-gray-800/60 rounded-xl border border-gray-300 dark:border-gray-700">
            <div className="flex justify-between items-center">
              <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
                Líneas de Pago ({pagosMixtos.length}/4)
              </span>
              <span
                className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  saldoRestanteMixto === 0
                    ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                    : saldoRestanteMixto > 0
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
                }`}
              >
                {saldoRestanteMixto === 0
                  ? 'Total cubierto'
                  : saldoRestanteMixto > 0
                  ? `Faltan ${formatPrecio(saldoRestanteMixto)}`
                  : `Excede por ${formatPrecio(Math.abs(saldoRestanteMixto))}`}
              </span>
            </div>

            <div className="space-y-2">
              {pagosMixtos.map((linea) => (
                <div
                  key={linea.id}
                  className="flex items-center gap-2 p-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-300 dark:border-gray-700 shadow-xs"
                >
                  <select
                    value={linea.medio_pago}
                    onChange={(e) => actualizarLineaPagoMixto(linea.id, 'medio_pago', e.target.value as MedioPago)}
                    className="w-1/2 px-2.5 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-xs font-medium text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-indigo-500"
                  >
                    {MEDIOS_PAGO.map((mp) => (
                      <option key={mp.valor} value={mp.valor}>
                        {mp.label}
                      </option>
                    ))}
                  </select>

                  <div className="relative flex-1">
                    <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 font-bold">$</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={linea.monto || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/[^0-9]/g, '')
                        actualizarLineaPagoMixto(linea.id, 'monto', val)
                      }}
                      placeholder="0"
                      className="w-full pl-6 pr-2 py-1.5 text-xs font-bold text-gray-900 dark:text-gray-100 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-1 focus:ring-indigo-500 text-right"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => llenarSaldoRestanteEnLinea(linea.id)}
                    title="Asignar el saldo restante a esta línea"
                    className="px-2 py-1.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 rounded-lg whitespace-nowrap cursor-pointer"
                  >
                    Resto
                  </button>

                  {pagosMixtos.length > 1 && (
                    <button
                      type="button"
                      onClick={() => eliminarLineaPagoMixto(linea.id)}
                      className="p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-950/40 rounded-lg cursor-pointer transition-colors"
                      title="Quitar línea"
                    >
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </div>

            {pagosMixtos.length < 4 && (
              <button
                type="button"
                onClick={agregarLineaPagoMixto}
                className="w-full py-1.5 border border-dashed border-gray-300 dark:border-gray-600 hover:border-indigo-500 dark:hover:border-indigo-400 rounded-lg text-xs font-medium text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors cursor-pointer"
              >
                + Agregar otro medio de pago
              </button>
            )}
          </div>
        )}

        {/* Panel de Cliente para Fiar / Cuenta Corriente */}
        {((!esPagoMixto && medioPago === 'CUENTA_CORRIENTE') || tieneCuentaCorrienteEnMixto) && (
          <div className="space-y-3 p-3.5 bg-gray-50/80 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl">
            <div className="flex justify-between items-center">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Seleccionar Cliente para fiar / imputar deuda *
              </label>
            </div>

            {!clienteSeleccionado && (
              <input
                type="text"
                placeholder="Buscar cliente por nombre o DNI..."
                value={busquedaCliente}
                onChange={(e) => setBusquedaCliente(e.target.value)}
                className="w-full px-3 py-2 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
              />
            )}

            {!clienteSeleccionado && (
              <>
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
                          onClick={() => {
                            setClienteSeleccionadoId(cli.id)
                          }}
                          className={`w-full text-left p-2.5 rounded-lg border text-xs transition-all flex items-center justify-between cursor-pointer ${
                            isSelected
                              ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30 text-indigo-900 dark:text-indigo-200 font-semibold shadow-xs'
                              : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                          }`}
                        >
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-gray-100">{cli.nombre}</p>
                            {cli.dni_cuit && <p className="text-[10px] text-gray-400">DNI/CUIT: {cli.dni_cuit}</p>}
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
              </>
            )}

            {clienteSeleccionado && (
              <div className="pt-2 border-t border-gray-300 dark:border-gray-700 text-xs space-y-2">
                <div className="flex justify-between items-center">
                  <div>
                    <span className="text-gray-500 dark:text-gray-400">Cliente: </span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{clienteSeleccionado.nombre}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setClienteSeleccionadoId('')
                    }}
                    className="text-[11px] text-red-500 hover:underline cursor-pointer"
                  >
                    Cambiar
                  </button>
                </div>

                {((!esPagoMixto && medioPago === 'CUENTA_CORRIENTE') || tieneCuentaCorrienteEnMixto) && (
                  <div className="pt-1 space-y-1">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Saldo deudor actual:</span>
                      <span className="font-medium text-gray-800 dark:text-gray-200">
                        {formatPrecio(clienteSeleccionado.saldo_deudor)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Nuevo saldo estimado:</span>
                      <span className="font-bold text-indigo-600 dark:text-indigo-400">
                        {formatPrecio(
                          (clienteSeleccionado.saldo_deudor || 0) +
                            (esPagoMixto
                              ? pagosMixtos.filter((p) => p.medio_pago === 'CUENTA_CORRIENTE').reduce((acc, p) => acc + p.monto, 0)
                              : total)
                        )}
                      </span>
                    </div>
                    {(clienteSeleccionado.limite_credito || 0) > 0 &&
                      (clienteSeleccionado.saldo_deudor || 0) +
                        (esPagoMixto
                          ? pagosMixtos.filter((p) => p.medio_pago === 'CUENTA_CORRIENTE').reduce((acc, p) => acc + p.monto, 0)
                          : total) >
                        clienteSeleccionado.limite_credito && (
                        <div className="p-2 rounded bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-[11px] text-amber-800 dark:text-amber-300 font-medium">
                          Atención: El nuevo saldo superará el límite de crédito ({formatPrecio(clienteSeleccionado.limite_credito)}).
                        </div>
                      )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Efectivo: calculadora de vuelto (Solo en Pago Simple con Efectivo) */}
        {!esPagoMixto && medioPago === 'EFECTIVO' && (
          <div className="space-y-3">
            <Input
              label="¿Con cuánto paga el cliente?"
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
              placeholder={`Monto exacto: ${formatPrecio(total)} (o ingresá billete)`}
              autoFocus={typeof window !== 'undefined' && window.innerWidth >= 1024}
            />

            {/* Billetes rápidos */}
            <div className="flex flex-wrap gap-2 pt-0.5">
              {billetesRapidos.map((billete) => (
                <button
                  key={billete}
                  type="button"
                  onClick={() => setPagaCon(billete.toString())}
                  className={`px-3.5 py-2.5 min-h-[42px] rounded-xl border text-xs sm:text-sm font-bold active:scale-95 transition-all cursor-pointer ${
                    pagaConNum === billete
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 shadow-xs ring-1 ring-indigo-500/40'
                      : 'border-gray-300 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/60'
                  }`}
                >
                  {formatPrecio(billete)}
                </button>
              ))}
              {/* Monto exacto */}
              <button
                type="button"
                onClick={() => setPagaCon(Math.round(total).toString())}
                className="px-4 py-2.5 min-h-[42px] rounded-xl border border-emerald-300 dark:border-emerald-700 text-xs sm:text-sm font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 active:scale-95 transition-all cursor-pointer"
              >
                Paga justo
              </button>
            </div>

            {/* Indicador de cobro exacto rápido */}
            {pagaCon === '' && (
              <div className="text-center py-2 px-3 rounded-xl border bg-blue-50/70 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800/60 text-xs text-blue-700 dark:text-blue-300">
                Cobro exacto sin vuelto — Presioná <strong>Enter</strong> o <strong>Confirmar y Cobrar</strong> para registrar directamente.
              </div>
            )}

            {/* Vuelto Gigante para personas mayores */}
            {pagaConNum > 0 && (
              <div className={`text-center py-2 sm:py-2.5 px-3.5 rounded-xl border ${
                pagaConNum >= total
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800'
                  : 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800'
              }`}>
                {pagaConNum >= total ? (
                  <>
                    <p className="text-[11px] uppercase tracking-wider text-emerald-700 dark:text-emerald-300 font-bold">
                      Su Vuelto a Entregar:
                    </p>
                    <p className="text-2xl sm:text-3xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                      {formatPrecio(vuelto)}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-[11px] uppercase tracking-wider text-red-700 dark:text-red-300 font-bold">
                      Falta dinero para cubrir el total:
                    </p>
                    <p className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400 tabular-nums mt-0.5">
                      Faltan {formatPrecio(total - pagaConNum)}
                    </p>
                  </>
                )}
              </div>
            )}
          </div>
        )}

        {/* Otros medios o Pago Mixto: referencia opcional */}
        {((!esPagoMixto && medioPago !== 'EFECTIVO') || esPagoMixto) && (
          <Input
            label="Referencia (opcional)"
            placeholder={!esPagoMixto && medioPago === 'TARJETA' ? 'Últimos 4 dígitos' : 'Nro de operación o notas'}
            value={referencia}
            onChange={(e) => setReferencia(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && puedeConfirmar && !procesando) {
                e.preventDefault()
                confirmarVenta()
              }
            }}
          />
        )}

        {/* Selector de Comprobante: Ticket Interno vs Factura ARCA */}
        <div className="p-3.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-gray-50/70 dark:bg-gray-800/60 space-y-2.5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-gray-700 dark:text-gray-300">
              Tipo de Comprobante
            </span>
            <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
              !afipConfig?.habilitado
                ? 'bg-gray-200 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
                : afipConfig?.entorno === 'PRODUCCION'
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
            }`}>
              {!afipConfig?.habilitado
                ? 'ARCA Deshabilitada'
                : afipConfig?.entorno === 'PRODUCCION'
                ? 'ARCA Producción'
                : 'ARCA Modo Pruebas'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setEmitirFiscal(false)}
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex flex-col justify-between cursor-pointer ${
                !emitirFiscal
                  ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/40 shadow-xs'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span>Ticket Interno (X)</span>
                {!emitirFiscal && <span className="w-2 h-2 rounded-full bg-indigo-600"></span>}
              </div>
              <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400 mt-1">
                Control mostrador (sin ARCA)
              </span>
            </button>

            <button
              type="button"
              disabled={!afipConfig?.habilitado}
              onClick={() => {
                if (!afipConfig?.habilitado) {
                  toast.error('La facturación electrónica ARCA no está habilitada en Configuración')
                  return
                }
                setEmitirFiscal(true)
              }}
              title={
                !afipConfig?.habilitado
                  ? 'La facturación fiscal no está habilitada. Podés activarla en Configuración > Facturación ARCA'
                  : undefined
              }
              className={`p-2.5 rounded-xl border text-xs font-bold transition-all text-left flex flex-col justify-between ${
                !afipConfig?.habilitado
                  ? 'border-gray-200 dark:border-gray-700/60 bg-gray-100/70 dark:bg-gray-800/30 text-gray-400 dark:text-gray-500 opacity-60 cursor-not-allowed'
                  : emitirFiscal
                  ? 'border-blue-600 bg-blue-50/80 dark:bg-blue-950/50 text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/40 shadow-xs cursor-pointer'
                  : 'border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/50 cursor-pointer'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <span>Factura ARCA</span>
                {emitirFiscal && afipConfig?.habilitado && <span className="w-2 h-2 rounded-full bg-blue-600"></span>}
              </div>
              <span className="text-[10px] font-normal text-gray-500 dark:text-gray-400 mt-1">
                {!afipConfig?.habilitado
                  ? 'Deshabilitada en Configuración'
                  : afipConfig?.condicion_iva === 'RESPONSABLE_INSCRIPTO'
                  ? 'Factura B con CAE'
                  : 'Factura C con CAE'}
              </span>
            </button>
          </div>

          {emitirFiscal && afipConfig?.habilitado && (
            <div className="pt-2.5 border-t border-blue-200/60 dark:border-blue-800/40 space-y-2.5 text-xs">
              <div>
                <label className="block text-[11px] font-medium text-blue-900 dark:text-blue-300 mb-1.5">
                  Identificación del Receptor
                </label>
                <div className="grid grid-cols-3 gap-1.5 p-1 bg-gray-100 dark:bg-gray-900/70 rounded-lg border border-blue-200/70 dark:border-blue-800/50">
                  <button
                    type="button"
                    onClick={() => {
                      setTipoDocReceptor(99)
                      setNroDocReceptor('')
                    }}
                    className={`py-1.5 px-2 rounded-md font-medium text-xs transition-all text-center cursor-pointer ${
                      tipoDocReceptor === 99
                        ? 'bg-blue-600 text-white shadow-xs font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-800'
                    }`}
                  >
                    Consumidor Final
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoDocReceptor(96)}
                    className={`py-1.5 px-2 rounded-md font-medium text-xs transition-all text-center cursor-pointer ${
                      tipoDocReceptor === 96
                        ? 'bg-blue-600 text-white shadow-xs font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-800'
                    }`}
                  >
                    DNI
                  </button>
                  <button
                    type="button"
                    onClick={() => setTipoDocReceptor(80)}
                    className={`py-1.5 px-2 rounded-md font-medium text-xs transition-all text-center cursor-pointer ${
                      tipoDocReceptor === 80
                        ? 'bg-blue-600 text-white shadow-xs font-semibold'
                        : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 hover:bg-white dark:hover:bg-gray-800'
                    }`}
                  >
                    CUIT
                  </button>
                </div>
              </div>

              {tipoDocReceptor !== 99 && (
                <div>
                  <label className="block text-[11px] font-medium text-blue-900 dark:text-blue-300 mb-1">
                    Número de {tipoDocReceptor === 96 ? 'DNI (7 u 8 dígitos)' : 'CUIT (11 dígitos)'}
                  </label>
                  <input
                    type="text"
                    inputMode="numeric"
                    autoFocus
                    value={nroDocReceptor}
                    onChange={(e) => setNroDocReceptor(e.target.value.replace(/[^\d-]/g, ''))}
                    placeholder={tipoDocReceptor === 96 ? 'Ej: 35123456' : 'Ej: 20-35123456-8'}
                    className="w-full px-3 py-1.5 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xs focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all placeholder:text-gray-400 dark:placeholder:text-gray-500"
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Modal>
  )
}
