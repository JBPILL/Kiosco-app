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
  usuario?: { nombre?: string } | null
}

export function limpiarCodigoTicket(input: string): string {
  if (!input) return ''
  return input
    .trim()
    .replace(/^venta\s*#?\s*/i, '')
    .replace(/^ticket\s*#?\s*/i, '')
    .replace(/^comprobante\s*#?\s*/i, '')
    .replace(/^t-/i, '')
    .replace(/^#/i, '')
    .trim()
    .toLowerCase()
}

interface DevolucionState {
  devoluciones: DevolucionVenta[]
  cargando: boolean

  cargarDevoluciones: (kioscoId?: string) => Promise<void>
  obtenerUltimasVentas: (kioscoId?: string, limite?: number) => Promise<VentaConDetalles[]>
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

  obtenerUltimasVentas: async (kioscoId?: string, limite = 30): Promise<VentaConDetalles[]> => {
    try {
      let query = supabase
        .from('ventas')
        .select('*, detalles:detalles_venta(*, producto:productos(*)), pagos:pagos_venta(*), usuario:usuarios(nombre)')
        .order('fecha_hora', { ascending: false })
        .limit(limite)

      if (kioscoId) {
        query = query.eq('kiosco_id', kioscoId)
      }

      const { data, error } = await query
      if (error || !data) return []

      const ventasList = data as VentaConDetalles[]

      // Enriquecer clientes de ventas con Cuenta Corriente si corresponde
      const ventasCC = ventasList.filter((v) =>
        v.pagos?.some((p) => p.medio_pago === 'CUENTA_CORRIENTE')
      )
      if (ventasCC.length > 0) {
        const ids = ventasCC.map((v) => v.id)
        const { data: movsCC } = await supabase
          .from('movimientos_cuenta_corriente')
          .select('venta_id, cliente:clientes(*)')
          .in('venta_id', ids)

        if (movsCC) {
          const ccMap = new Map(movsCC.map((m) => [m.venta_id, m.cliente]))
          for (const v of ventasList) {
            if (ccMap.has(v.id)) {
              const cliRaw = ccMap.get(v.id)
              v.cliente = (Array.isArray(cliRaw) ? cliRaw[0] : cliRaw) as unknown as Cliente
            }
          }
        }
      }

      return ventasList
    } catch (e) {
      console.warn('Error al obtener últimas ventas:', e)
      return []
    }
  },

  buscarVentaParaDevolucion: async (
    criterio: string,
    kioscoId?: string
  ): Promise<VentaConDetalles | null> => {
    const limpio = limpiarCodigoTicket(criterio)
    if (!limpio) return null

    try {
      // Estrategia 1: Buscar en las últimas 150 ventas en memoria
      // (Resuelve T-BACFC93B, #BACFC93B, BACFC93B, venta #..., afip_nro_comprobante de manera 100% infalible)
      let queryRecientes = supabase
        .from('ventas')
        .select('*, detalles:detalles_venta(*, producto:productos(*)), pagos:pagos_venta(*), usuario:usuarios(nombre)')
        .order('fecha_hora', { ascending: false })
        .limit(150)

      if (kioscoId) {
        queryRecientes = queryRecientes.eq('kiosco_id', kioscoId)
      }

      const { data: recientes } = await queryRecientes

      if (recientes && recientes.length > 0) {
        const ventaCandidata = (recientes as VentaConDetalles[]).find((v) => {
          const vid = v.id.toLowerCase()
          const vidSinGuiones = vid.replace(/-/g, '')
          const afipNro = v.afip_nro_comprobante ? String(v.afip_nro_comprobante) : ''
          return (
            vid.startsWith(limpio) ||
            vidSinGuiones.startsWith(limpio) ||
            vid.includes(limpio) ||
            afipNro === limpio
          )
        })

        if (ventaCandidata) {
          // Si tiene cuenta corriente, verificar cliente
          const pagoCC = ventaCandidata.pagos?.find((p) => p.medio_pago === 'CUENTA_CORRIENTE')
          if (pagoCC && !ventaCandidata.cliente) {
            const { data: movCC } = await supabase
              .from('movimientos_cuenta_corriente')
              .select('*, cliente:clientes(*)')
              .eq('venta_id', ventaCandidata.id)
              .maybeSingle()

            if (movCC?.cliente) {
              ventaCandidata.cliente = movCC.cliente as Cliente
            }
          }
          return ventaCandidata
        }
      }

      // Estrategia 2: Si tiene formato UUID exacto de 36 caracteres y no estaba en las 150 recientes
      if (limpio.length === 36) {
        let queryExacta = supabase
          .from('ventas')
          .select('*, detalles:detalles_venta(*, producto:productos(*)), pagos:pagos_venta(*), usuario:usuarios(nombre)')
          .eq('id', limpio)
          .maybeSingle()

        const { data: vExacta } = await queryExacta
        if (vExacta) {
          return vExacta as VentaConDetalles
        }
      }

      // Estrategia 3: Si es puramente numérico, buscar por afip_nro_comprobante histórico
      const numComp = parseInt(limpio, 10)
      if (!isNaN(numComp) && String(numComp) === limpio) {
        let queryAfip = supabase
          .from('ventas')
          .select('*, detalles:detalles_venta(*, producto:productos(*)), pagos:pagos_venta(*), usuario:usuarios(nombre)')
          .eq('afip_nro_comprobante', numComp)

        if (kioscoId) queryAfip = queryAfip.eq('kiosco_id', kioscoId)

        const { data: dataAfip } = await queryAfip.limit(1)
        if (dataAfip && dataAfip.length > 0) {
          return dataAfip[0] as VentaConDetalles
        }
      }

      return null
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

    if (venta.estado === 'ANULADA') {
      return { success: false, error: 'No es posible procesar una devolución sobre una venta que ya fue anulada' }
    }

    // Verificar si ya existe devolución registrada para esta venta
    try {
      const { data: devExistentes, error: devCheckErr } = await supabase
        .from('devoluciones_venta')
        .select('id, monto_total')
        .eq('venta_id', venta.id)

      if (!devCheckErr && devExistentes && devExistentes.length > 0) {
        const totalYaDevuelto = devExistentes.reduce((s, d) => s + (d.monto_total || 0), 0)
        if (totalYaDevuelto >= (venta.total || 0)) {
          return { success: false, error: 'Esta venta ya ha sido devuelta en su totalidad previamente' }
        }
      }
    } catch (checkErr) {
      console.warn('Advertencia al verificar devoluciones previas:', checkErr)
    }

    const devolucionId = uuidv4()
    const ahora = new Date().toISOString()

    // Si la venta original tuvo descuento global, prorratear el reintegro proporcionalmente
    const subtotalOriginal = (venta.detalles || []).reduce(
      (acc: number, d: any) => acc + (d.subtotal || Math.round((d.cantidad || 0) * (d.precio_unitario || 0))),
      0
    )
    const tieneDescuento = subtotalOriginal > 0 && venta.total < subtotalOriginal
    const ratioReintegro = tieneDescuento ? Math.max(0, venta.total / subtotalOriginal) : 1

    const montoTotal = itemsADevolver.reduce(
      (acc, it) => acc + Math.round(it.cantidad * it.precioUnitario * ratioReintegro),
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

      const { error: errorDev } = await supabase.from('devoluciones_venta').insert(payloadDev)
      if (errorDev) throw errorDev

      // 2. Insertar detalles de devolución
      const detallesPayload: DetalleDevolucion[] = itemsADevolver.map((it) => ({
        id: uuidv4(),
        devolucion_id: devolucionId,
        producto_id: it.productoId,
        cantidad: it.cantidad,
        precio_unitario: Math.round(it.precioUnitario * ratioReintegro),
        subtotal: Math.round(it.cantidad * it.precioUnitario * ratioReintegro),
        reingresa_stock: it.reingresaStock,
      }))

      const { error: errorDet } = await supabase.from('detalles_devolucion').insert(detallesPayload)
      if (errorDet) throw errorDet

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
              const nuevoStock = Number(((prodData.stock_actual || 0) + it.cantidad).toFixed(3))
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
              return { ...p, stock_actual: Number(((p.stock_actual || 0) + sum).toFixed(3)) }
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
