import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { useCajaStore } from './cajaStore'
import { useClienteStore } from './clienteStore'
import type {
  DevolucionVenta,
  DetalleDevolucion,
  MetodoReintegro,
  MotivoDevolucion,
  Venta,
  DetalleVenta,
  PagoVenta,
  Producto,
  Cliente,
} from '../types/database'
import toast from 'react-hot-toast'

export type VentaConDetalles = Venta & {
  detalles: (DetalleVenta & { producto?: Producto })[]
  pagos?: PagoVenta[]
  cliente?: Cliente | null
}

interface DevolucionState {
  devoluciones: DevolucionVenta[]
  cargando: boolean

  cargarDevoluciones: (kioscoId?: string) => Promise<void>
  buscarVentaParaDevolucion: (
    criterio: string,
    kioscoId?: string
  ) => Promise<VentaConDetalles | null>
  procesarDevolucion: (params: {
    venta: VentaConDetalles
    itemsADevolver: {
      productoId: string
      cantidad: number
      precioUnitario: number
      reingresaStock: boolean
    }[]
    metodoReintegro: MetodoReintegro
    motivo: MotivoDevolucion
    notas?: string
    kioscoId: string
    usuarioId?: string | null
    sesionCajaId?: string | null
    clienteId?: string | null
  }) => Promise<{ success: boolean; devolucionId?: string; error?: string }>
}

const getStorageKey = (kioscoId?: string) => `kioskopos_devoluciones_${kioscoId || 'default'}`

export const useDevolucionStore = create<DevolucionState>((set, get) => ({
  devoluciones: [],
  cargando: false,

  cargarDevoluciones: async (kioscoId?: string) => {
    const key = getStorageKey(kioscoId)
    // 1. Cargar caché local
    try {
      const cached = localStorage.getItem(key)
      if (cached) {
        set({ devoluciones: JSON.parse(cached) })
      }
    } catch {}

    if (!kioscoId) return

    set({ cargando: true })
    try {
      const { data, error } = await supabase
        .from('devoluciones_venta')
        .select('*, detalles:detalles_devolucion(*, producto:productos(*)), usuario:usuarios(nombre)')
        .eq('kiosco_id', kioscoId)
        .order('fecha_hora', { ascending: false })
        .limit(50)

      if (!error && data) {
        set({ devoluciones: data as DevolucionVenta[], cargando: false })
        localStorage.setItem(key, JSON.stringify(data))
      }
    } catch (e) {
      console.warn('Error sincronizando devoluciones desde Supabase:', e)
    } finally {
      set({ cargando: false })
    }
  },

  buscarVentaParaDevolucion: async (
    criterio: string,
    kioscoId?: string
  ): Promise<VentaConDetalles | null> => {
    const limpio = criterio.trim().toLowerCase()
    if (!limpio) return null

    try {
      // 1. Buscar venta por UUID completo o por prefijo (8 caracteres)
      let query = supabase
        .from('ventas')
        .select('*, detalles:detalles_venta(*, producto:productos(*)), pagos:pagos_venta(*)')
        .order('fecha_hora', { ascending: false })

      if (kioscoId) {
        query = query.eq('kiosco_id', kioscoId)
      }

      // Si tiene formato UUID estándar (36 caracteres)
      if (limpio.length === 36) {
        query = query.eq('id', limpio)
      } else {
        // Buscar por los primeros caracteres del UUID
        query = query.ilike('id', `${limpio}%`).limit(1)
      }

      const { data, error } = await query

      if (error) {
        console.warn('Error buscando venta para devolución en Supabase:', error.message)
        return null
      }

      if (!data || data.length === 0) {
        return null
      }

      const ventaEncontrada = data[0] as VentaConDetalles

      // Si la venta tiene pagos con cuenta corriente, buscar datos del cliente asociado
      const pagoCC = ventaEncontrada.pagos?.find((p) => p.medio_pago === 'CUENTA_CORRIENTE')
      if (pagoCC) {
        const { data: movCC } = await supabase
          .from('movimientos_cuenta_corriente')
          .select('*, cliente:clientes(*)')
          .eq('venta_id', ventaEncontrada.id)
          .maybeSingle()

        if (movCC?.cliente) {
          ventaEncontrada.cliente = movCC.cliente as Cliente
        }
      }

      return ventaEncontrada
    } catch (err) {
      console.error('Error buscando venta para devolución:', err)
      return null
    }
  },

  procesarDevolucion: async (params) => {
    const {
      venta,
      itemsADevolver,
      metodoReintegro,
      motivo,
      notas,
      kioscoId,
      usuarioId,
      sesionCajaId,
      clienteId,
    } = params

    if (itemsADevolver.length === 0) {
      return { success: false, error: 'No se seleccionaron productos para devolver' }
    }

    const devolucionId = uuidv4()
    const ahora = new Date().toISOString()
    const montoTotal = itemsADevolver.reduce(
      (acc, it) => acc + Math.round(it.cantidad * it.precioUnitario),
      0
    )

    try {
      // 1. Insertar cabecera de devolución en Supabase
      const payloadDev: Partial<DevolucionVenta> = {
        id: devolucionId,
        kiosco_id: kioscoId,
        venta_id: venta.id,
        usuario_id: usuarioId || null,
        sesion_caja_id: sesionCajaId || null,
        cliente_id: clienteId || venta.cliente?.id || null,
        fecha_hora: ahora,
        monto_total: montoTotal,
        metodo_reintegro: metodoReintegro,
        motivo,
        notas: notas || null,
      }

      await supabase.from('devoluciones_venta').insert(payloadDev)

      // 2. Insertar detalles de devolución
      const detallesPayload: DetalleDevolucion[] = itemsADevolver.map((it) => ({
        id: uuidv4(),
        devolucion_id: devolucionId,
        producto_id: it.productoId,
        cantidad: it.cantidad,
        precio_unitario: it.precioUnitario,
        subtotal: Math.round(it.cantidad * it.precioUnitario),
        reingresa_stock: it.reingresaStock,
      }))

      await supabase.from('detalles_devolucion').insert(detallesPayload)

      // 3. Reingresar stock físico para los ítems marcados
      for (const it of itemsADevolver) {
        if (it.reingresaStock) {
          try {
            // Traer stock actual
            const { data: prodData } = await supabase
              .from('productos')
              .select('id, stock_actual, descripcion')
              .eq('id', it.productoId)
              .single()

            if (prodData) {
              const nuevoStock = (prodData.stock_actual || 0) + it.cantidad
              await supabase
                .from('productos')
                .update({ stock_actual: nuevoStock, fecha_actualizacion: ahora })
                .eq('id', prodData.id)

              await supabase.from('movimientos_stock').insert({
                kiosco_id: kioscoId,
                producto_id: prodData.id,
                tipo: 'INGRESO',
                cantidad: it.cantidad,
                motivo: 'AJUSTE',
                notas: `Devolución Venta #${venta.id.slice(0, 8).toUpperCase()} (${motivo})`,
                usuario_id: usuarioId || null,
                fecha: ahora,
              })
            }
          } catch (errStock) {
            console.warn('Error reingresando stock de devolución:', errStock)
          }
        }
      }

      // 4. Actualizar caché local de productos (kiosko_cache_productos)
      try {
        const cachedRaw = localStorage.getItem('kiosko_cache_productos')
        if (cachedRaw) {
          const cachedProds: Producto[] = JSON.parse(cachedRaw)
          const itemsReingresadosMap = new Map(
            itemsADevolver.filter((i) => i.reingresaStock).map((i) => [i.productoId, i.cantidad])
          )

          const actualizados = cachedProds.map((p) => {
            const sum = itemsReingresadosMap.get(p.id)
            if (sum !== undefined) {
              return { ...p, stock_actual: (p.stock_actual || 0) + sum }
            }
            return p
          })

          localStorage.setItem('kiosko_cache_productos', JSON.stringify(actualizados))
        }
      } catch (eCache) {
        console.warn('Error actualizando caché tras devolución:', eCache)
      }

      // 5. Impacto financiero según método de reintegro elegido
      if (metodoReintegro === 'EFECTIVO_CAJA') {
        // Registrar egreso de caja en la sesión activa
        try {
          await useCajaStore
            .getState()
            .registrarMovimientoCaja(
              'EGRESO',
              'DEVOLUCION_VENTA',
              montoTotal,
              `Reintegro por devolución Ticket #${venta.id.slice(0, 8).toUpperCase()}`
            )
        } catch (errCaja) {
          console.warn('Error registrando egreso de caja por devolución:', errCaja)
        }
      } else if (metodoReintegro === 'CUENTA_CORRIENTE') {
        // Acreditar saldo a favor o reducir deuda en cuenta corriente del cliente
        const targetClienteId = clienteId || venta.cliente?.id
        if (targetClienteId) {
          try {
            await useClienteStore
              .getState()
              .revertirCargoVenta(
                venta.id,
                montoTotal,
                `Crédito por devolución Ticket #${venta.id.slice(0, 8).toUpperCase()}`
              )
          } catch (errCC) {
            console.warn('Error revirtiendo saldo de cuenta corriente:', errCC)
          }
        }
      }

      // 6. Guardar en historial de devoluciones local
      const nuevaDevCompleta: DevolucionVenta = {
        ...(payloadDev as DevolucionVenta),
        detalles: detallesPayload,
      }
      const listaActual = [nuevaDevCompleta, ...get().devoluciones]
      set({ devoluciones: listaActual })
      try {
        localStorage.setItem(getStorageKey(kioscoId), JSON.stringify(listaActual))
      } catch {}

      toast.success(`Devolución por $${montoTotal.toLocaleString('es-AR')} procesada con éxito`)
      return { success: true, devolucionId }
    } catch (err: any) {
      console.error('Error al procesar devolución:', err)
      return { success: false, error: err.message || 'Error inesperado al procesar devolución' }
    }
  },
}))
