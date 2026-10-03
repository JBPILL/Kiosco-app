import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { useCajaStore } from './cajaStore'
import { useClienteStore } from './clienteStore'
import { useComboStore } from './comboStore'
import { useLoteStore } from './loteStore'
import { getCachedProductos, saveCachedProductos } from '../lib/utils'
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
            (limpio.length >= 4 && vid.includes(limpio)) ||
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

        if (kioscoId) {
          queryExacta = queryExacta.eq('kiosco_id', kioscoId)
        }

        const { data: vExacta } = await queryExacta.maybeSingle()
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

    for (const it of itemsADevolver) {
      if (typeof it.cantidad !== 'number' || isNaN(it.cantidad) || it.cantidad <= 0) {
        return { success: false, error: 'Todos los productos a devolver deben tener una cantidad mayor a 0' }
      }
    }

    if (venta.estado === 'ANULADA') {
      return { success: false, error: 'No es posible procesar una devolución sobre una venta que ya fue anulada' }
    }

    if (metodoReintegro === 'CUENTA_CORRIENTE') {
      const targetClienteId = clienteId || venta.cliente?.id
      if (!targetClienteId) {
        return {
          success: false,
          error: 'No se puede reintegrar a cuenta corriente porque el ticket no posee un cliente asignado',
        }
      }
    }

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

    // Verificar si ya existe devolución registrada para esta venta
    try {
      const { data: devExistentes, error: devCheckErr } = await supabase
        .from('devoluciones_venta')
        .select('id, monto_total, detalles:detalles_devolucion(producto_id, cantidad)')
        .eq('venta_id', venta.id)

      if (!devCheckErr && devExistentes) {
        const totalYaDevuelto = devExistentes.reduce((s, d) => s + (d.monto_total || 0), 0)
        if (totalYaDevuelto + montoTotal > (venta.total || 0)) {
          return { success: false, error: `El monto a devolver ($${montoTotal}) sumado a lo ya devuelto ($${totalYaDevuelto}) supera el total original de la venta ($${venta.total || 0})` }
        }

        const cantidadesYaDevueltas: Record<string, number> = {}
        for (const dev of devExistentes) {
          if (dev.detalles) {
            for (const det of dev.detalles) {
              const productoId = (det as any).producto_id
              const cant = (det as any).cantidad || 0
              cantidadesYaDevueltas[productoId] = (cantidadesYaDevueltas[productoId] || 0) + cant
            }
          }
        }

        for (const item of itemsADevolver) {
          const yaDevuelto = cantidadesYaDevueltas[item.productoId] || 0
          const original = venta.detalles.find(d => d.producto_id === item.productoId)?.cantidad || 0
          if (yaDevuelto + item.cantidad > original) {
            return { success: false, error: `No se puede devolver ${item.cantidad} del producto (ya se devolvieron ${yaDevuelto} de ${original} originales)` }
          }
        }
      }
    } catch (checkErr) {
      console.warn('Advertencia al verificar devoluciones previas:', checkErr)
    }

    const devolucionId = uuidv4()
    const ahora = new Date().toISOString()

    try {
      // 1. Insertar cabecera de devolución en Supabase
      // La restricción CHECK en Supabase requiere motivo IN ('CAMBIO_PRODUCTO', 'FALLA_ROTURA', 'VENCIDO', 'ERROR_COBRO')
      // Si el usuario seleccionó 'OTRO', enviamos 'CAMBIO_PRODUCTO' como valor SQL seguro y guardamos el detalle en notas
      const motivoValidoSQL = ['CAMBIO_PRODUCTO', 'FALLA_ROTURA', 'VENCIDO', 'ERROR_COBRO'].includes(motivo)
        ? motivo
        : 'CAMBIO_PRODUCTO'

      const notasFinales = motivo === 'OTRO'
        ? (notas ? `[Motivo: Otro / especial] ${notas}` : '[Motivo: Otro / especial]')
        : (notas || null)

      const payloadDev: Record<string, any> = {
        id: devolucionId,
        kiosco_id: kioscoId,
        venta_id: venta.id,
        usuario_id: usuarioId || null,
        sesion_caja_id: sesionCajaId || null,
        cliente_id: clienteId || venta.cliente?.id || null,
        fecha_hora: ahora,
        monto_total: montoTotal,
        metodo_reintegro: metodoReintegro,
        motivo: motivoValidoSQL,
        notas: notasFinales,
      }

      let { error: errorDev } = await supabase.from('devoluciones_venta').insert(payloadDev)

      // Fallback si la restricción de motivo fallara con cualquier otro valor
      if (errorDev && (errorDev.message?.includes('motivo_check') || errorDev.message?.includes('devoluciones_venta_motivo_check'))) {
        console.warn('Check constraint de motivo falló en devoluciones_venta, reintentando con CAMBIO_PRODUCTO:', errorDev)
        payloadDev.motivo = 'CAMBIO_PRODUCTO'
        payloadDev.notas = payloadDev.notas ? `[Motivo especial] ${payloadDev.notas}` : '[Motivo especial]'
        const retryMotivo = await supabase.from('devoluciones_venta').insert(payloadDev)
        errorDev = retryMotivo.error
      }

      // Si la base de datos de producción aún no tiene la columna cliente_id, reintentar sin ella
      if (errorDev && (errorDev.message?.includes('cliente_id') || errorDev.code === 'PGRST204')) {
        console.warn('Campo cliente_id no encontrado en devoluciones_venta en Supabase, reintentando inserción sin él:', errorDev)
        delete payloadDev.cliente_id
        const retryResult = await supabase.from('devoluciones_venta').insert(payloadDev)
        errorDev = retryResult.error
      }
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

      let { error: errorDet } = await supabase.from('detalles_devolucion').insert(detallesPayload)
      // Si la base de datos de producción aún no tiene la columna reingresa_stock en detalles_devolucion, reintentar sin ella
      if (errorDet && (errorDet.message?.includes('reingresa_stock') || errorDet.code === 'PGRST204')) {
        console.warn('Campo reingresa_stock no encontrado en detalles_devolucion, reintentando sin él:', errorDet)
        const sinReingreso = detallesPayload.map(({ reingresa_stock, ...resto }) => resto)
        const retryDet = await supabase.from('detalles_devolucion').insert(sinReingreso)
        errorDet = retryDet.error
      }
      if (errorDet) throw errorDet

      // 3. Reingresar stock físico para los ítems marcados
      for (const it of itemsADevolver) {
        if (it.reingresaStock) {
          try {
            // Traer stock actual y verificar si es combo (BUG-19: maybeSingle en lugar de single)
            const { data: prodData } = await supabase
              .from('productos')
              .select('id, stock_actual, descripcion, es_combo')
              .eq('id', it.productoId)
              .maybeSingle()

            if (prodData) {
              if (prodData.es_combo) {
                // Si es un combo, restituir el stock físico de sus componentes individuales
                const componentes = useComboStore.getState().obtenerComponentesDeCombo(prodData.id)
                for (const comp of componentes) {
                  const cantRestituir = comp.cantidad * it.cantidad
                  const { data: compProd } = await supabase
                    .from('productos')
                    .select('id, stock_actual, descripcion')
                    .eq('id', comp.componente_producto_id)
                    .maybeSingle()

                  if (compProd) {
                    const nuevoStockComp = Number(((compProd.stock_actual || 0) + cantRestituir).toFixed(3))
                    await supabase
                      .from('productos')
                      .update({ stock_actual: nuevoStockComp, fecha_actualizacion: ahora })
                      .eq('id', compProd.id)

                    await supabase.from('movimientos_stock').insert({
                      kiosco_id: kioscoId,
                      producto_id: compProd.id,
                      tipo: 'INGRESO',
                      cantidad: cantRestituir,
                      motivo: 'AJUSTE',
                      notas: `Devolución Combo #${venta.id.slice(0, 8).toUpperCase()} - ${prodData.descripcion}`,
                      usuario_id: usuarioId || null,
                      fecha: ahora,
                    })

                    try {
                      await useLoteStore.getState().restituirStockLote(compProd.id, cantRestituir, kioscoId)
                    } catch (errLote) {
                      console.warn('Error restituyendo lote de componente en devolución:', errLote)
                    }
                  }
                }
              } else {
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

                try {
                  await useLoteStore.getState().restituirStockLote(prodData.id, it.cantidad, kioscoId)
                } catch (errLote) {
                  console.warn('Error restituyendo lote en devolución:', errLote)
                }
              }
            }
          } catch (errStock) {
            console.warn('Error reingresando stock de devolución:', errStock)
          }
        }
      }

      // 4. Actualizar caché local de productos asegurando coherencia multi-inquilino
      try {
        const cachedProds: Producto[] = getCachedProductos(kioscoId)
        if (cachedProds && cachedProds.length > 0) {
          const itemsReingresadosMap = new Map<string, number>()

          for (const i of itemsADevolver.filter((i) => i.reingresaStock)) {
            const prod = cachedProds.find((p) => p.id === i.productoId)
            if (prod?.es_combo) {
              const componentes = useComboStore.getState().obtenerComponentesDeCombo(prod.id)
              for (const comp of componentes) {
                const actual = itemsReingresadosMap.get(comp.componente_producto_id) || 0
                itemsReingresadosMap.set(comp.componente_producto_id, actual + comp.cantidad * i.cantidad)
              }
            } else {
              const actual = itemsReingresadosMap.get(i.productoId) || 0
              itemsReingresadosMap.set(i.productoId, actual + i.cantidad)
            }
          }

          const actualizados = cachedProds.map((p) => {
            const sum = itemsReingresadosMap.get(p.id)
            if (sum !== undefined) {
              return { ...p, stock_actual: Number(((p.stock_actual || 0) + sum).toFixed(3)) }
            }
            return p
          })

          saveCachedProductos(actualizados, kioscoId)
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
                `Crédito por devolución Ticket #${venta.id.slice(0, 8).toUpperCase()}`,
                targetClienteId
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

      // BUG-20: Rollback de devolución incompleta para no dejar registros huérfanos
      if (devolucionId) {
        try {
          await supabase.from('detalles_devolucion').delete().eq('devolucion_id', devolucionId)
          await supabase.from('devoluciones_venta').delete().eq('id', devolucionId)
        } catch (cleanupErr) {
          console.warn('Error en rollback de devolución:', cleanupErr)
        }
      }

      return { success: false, error: err.message || 'Error inesperado al procesar devolución' }
    }
  },
}))
