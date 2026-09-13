import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { useCajaStore } from './cajaStore'
import type {
  Proveedor,
  CompraProveedor,
  DetalleCompra,
  MedioPagoCompra,
  Producto,
} from '../types/database'
import toast from 'react-hot-toast'

interface NuevoProveedorInput {
  nombre: string
  contacto_nombre?: string | null
  telefono?: string | null
  email?: string | null
  cuit?: string | null
  dias_visita?: string | null
  cbu_alias?: string | null
  saldo_pendiente?: number
}

interface ItemCompraInput {
  producto_id: string
  cantidad: number
  precio_costo_unitario: number
  subtotal: number
  producto?: Producto
}

interface NuevaCompraInput {
  proveedor_id: string
  nro_comprobante?: string | null
  fecha?: string
  total: number
  medio_pago: MedioPagoCompra
  pagado_en_caja: boolean
  notas?: string | null
  detalles: ItemCompraInput[]
}

interface ProveedorState {
  proveedores: Proveedor[]
  compras: CompraProveedor[]
  cargando: boolean
  cargandoCompras: boolean

  cargarProveedores: () => Promise<Proveedor[]>
  crearProveedor: (datos: NuevoProveedorInput) => Promise<Proveedor | null>
  actualizarProveedor: (id: string, datos: Partial<Proveedor>) => Promise<boolean>
  eliminarProveedor: (id: string) => Promise<boolean>
  abonarSaldoProveedor: (id: string, monto: number, medioPago: string, descontarDeCaja?: boolean) => Promise<boolean>

  cargarCompras: () => Promise<CompraProveedor[]>
  cargarDetallesCompra: (compraId: string) => Promise<DetalleCompra[]>
  registrarCompra: (
    compra: NuevaCompraInput,
    descontarDeCaja?: boolean
  ) => Promise<{ success: boolean; id?: string; error?: string }>
  anularCompra: (compraId: string) => Promise<boolean>
}

function getLocalProveedores(kioscoId: string): Proveedor[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`kioskopos_proveedores_${kioscoId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalProveedores(kioscoId: string, proveedores: Proveedor[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`kioskopos_proveedores_${kioscoId}`, JSON.stringify(proveedores))
  } catch (e) {
    console.error('Error guardando proveedores en local:', e)
  }
}

function getLocalCompras(kioscoId: string): CompraProveedor[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`kioskopos_compras_${kioscoId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalCompras(kioscoId: string, compras: CompraProveedor[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`kioskopos_compras_${kioscoId}`, JSON.stringify(compras))
  } catch (e) {
    console.error('Error guardando compras en local:', e)
  }
}

export const useProveedorStore = create<ProveedorState>((set, get) => ({
  proveedores: [],
  compras: [],
  cargando: false,
  cargandoCompras: false,

  cargarProveedores: async () => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return []

    set({ cargando: true })
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .eq('kiosco_id', usuario.kiosco_id)
        .eq('activo', true)
        .order('nombre')

      if (!error && data) {
        set({ proveedores: data as Proveedor[], cargando: false })
        saveLocalProveedores(usuario.kiosco_id, data as Proveedor[])
        return data as Proveedor[]
      }
    } catch {
      // Fallback a almacenamiento local si la tabla aún no existe o está offline
    }

    const locales = getLocalProveedores(usuario.kiosco_id).filter((p) => p.activo !== false)
    set({ proveedores: locales, cargando: false })
    return locales
  },

  crearProveedor: async (datos) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) {
      toast.error('No se pudo identificar el kiosco')
      return null
    }

    const nuevoProveedor: Proveedor = {
      id: uuidv4(),
      kiosco_id: usuario.kiosco_id,
      nombre: datos.nombre.trim(),
      contacto_nombre: datos.contacto_nombre?.trim() || null,
      telefono: datos.telefono?.trim() || null,
      email: datos.email?.trim() || null,
      cuit: datos.cuit?.trim() || null,
      dias_visita: datos.dias_visita?.trim() || null,
      cbu_alias: datos.cbu_alias?.trim() || null,
      saldo_pendiente: Number(datos.saldo_pendiente) || 0,
      activo: true,
      fecha_creacion: new Date().toISOString(),
    }

    const actualizados = [...get().proveedores, nuevoProveedor].sort((a, b) =>
      a.nombre.localeCompare(b.nombre)
    )
    saveLocalProveedores(usuario.kiosco_id, actualizados)
    set({ proveedores: actualizados })

    try {
      const { error } = await supabase.from('proveedores').insert({
        id: nuevoProveedor.id,
        kiosco_id: nuevoProveedor.kiosco_id,
        nombre: nuevoProveedor.nombre,
        contacto_nombre: nuevoProveedor.contacto_nombre,
        telefono: nuevoProveedor.telefono,
        email: nuevoProveedor.email,
        cuit: nuevoProveedor.cuit,
        dias_visita: nuevoProveedor.dias_visita,
        cbu_alias: nuevoProveedor.cbu_alias,
        saldo_pendiente: nuevoProveedor.saldo_pendiente,
        activo: true,
        fecha_creacion: nuevoProveedor.fecha_creacion,
      })
      if (error) {
        console.warn('Supabase proveedores insert fallback:', error.message)
      }
    } catch (err) {
      console.warn('Error al guardar proveedor en Supabase (guardado localmente):', err)
    }

    toast.success('Proveedor guardado correctamente')
    return nuevoProveedor
  },

  actualizarProveedor: async (id, datos) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false

    const actualizados = get().proveedores.map((p) =>
      p.id === id ? { ...p, ...datos } : p
    )
    saveLocalProveedores(usuario.kiosco_id, actualizados)
    set({ proveedores: actualizados })

    try {
      const { error } = await supabase
        .from('proveedores')
        .update(datos)
        .eq('id', id)
        .eq('kiosco_id', usuario.kiosco_id)

      if (error) {
        console.warn('Supabase update fallback:', error.message)
      }
    } catch (err) {
      console.warn('Error al actualizar en Supabase:', err)
    }

    toast.success('Proveedor actualizado')
    return true
  },

  eliminarProveedor: async (id) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false

    // Soft delete (activo = false) para preservar el historial de compras
    const actualizados = get().proveedores.filter((p) => p.id !== id)
    saveLocalProveedores(usuario.kiosco_id, actualizados)
    set({ proveedores: actualizados })

    try {
      const { error } = await supabase
        .from('proveedores')
        .update({ activo: false })
        .eq('id', id)
        .eq('kiosco_id', usuario.kiosco_id)

      if (error) {
        console.warn('Supabase soft delete fallback:', error.message)
      }
    } catch (err) {
      console.warn('Error al eliminar en Supabase:', err)
    }

    toast.success('Proveedor eliminado')
    return true
  },

  abonarSaldoProveedor: async (id, monto, medioPago, descontarDeCaja = false) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false

    const proveedor = get().proveedores.find((p) => p.id === id)
    if (!proveedor) {
      toast.error('Proveedor no encontrado')
      return false
    }

    const nuevoSaldo = Math.max(0, (proveedor.saldo_pendiente || 0) - monto)

    const actualizados = get().proveedores.map((p) =>
      p.id === id ? { ...p, saldo_pendiente: nuevoSaldo } : p
    )
    saveLocalProveedores(usuario.kiosco_id, actualizados)
    set({ proveedores: actualizados })

    try {
      await supabase
        .from('proveedores')
        .update({ saldo_pendiente: nuevoSaldo })
        .eq('id', id)
        .eq('kiosco_id', usuario.kiosco_id)
    } catch (err) {
      console.warn('Error al actualizar saldo en Supabase:', err)
    }

    // Si se optó por descontar de caja y el medio fue efectivo
    if (descontarDeCaja && medioPago === 'EFECTIVO') {
      const caja = useCajaStore.getState()
      if (caja.sesionActiva) {
        await caja.registrarMovimientoCaja(
          'EGRESO',
          'PROVEEDOR',
          monto,
          `Pago de cuenta a proveedor: ${proveedor.nombre}`
        )
      }
    }

    toast.success(`Pago de $${monto.toLocaleString('es-AR')} registrado`)
    return true
  },

  cargarCompras: async () => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return []

    set({ cargandoCompras: true })
    try {
      const { data, error } = await supabase
        .from('compras_proveedor')
        .select(`
          *,
          proveedor:proveedores(*),
          usuario:usuarios(id, nombre)
        `)
        .eq('kiosco_id', usuario.kiosco_id)
        .order('fecha', { ascending: false })

      if (!error && data) {
        set({ compras: data as CompraProveedor[], cargandoCompras: false })
        saveLocalCompras(usuario.kiosco_id, data as CompraProveedor[])
        return data as CompraProveedor[]
      }
    } catch {
      // Fallback a localStorage
    }

    const locales = getLocalCompras(usuario.kiosco_id)
    set({ compras: locales, cargandoCompras: false })
    return locales
  },

  cargarDetallesCompra: async (compraId: string) => {
    try {
      const { data, error } = await supabase
        .from('detalles_compra')
        .select(`
          *,
          producto:productos(*)
        `)
        .eq('compra_id', compraId)

      if (!error && data) {
        return data as DetalleCompra[]
      }
    } catch {
      // Fallback a buscar en compras locales
    }

    const comprasLocales = get().compras
    const compra = comprasLocales.find((c) => c.id === compraId)
    return compra?.detalles || []
  },

  registrarCompra: async (compraInput, descontarDeCaja = false) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) {
      toast.error('Sesión no identificada')
      return { success: false, error: 'Sin sesión' }
    }

    if (!compraInput.detalles || compraInput.detalles.length === 0) {
      toast.error('Debe incluir al menos un producto en la compra')
      return { success: false, error: 'Sin productos' }
    }

    const caja = useCajaStore.getState()
    const sesionCajaId = (descontarDeCaja && caja.sesionActiva) ? caja.sesionActiva.id : null

    const compraId = uuidv4()
    const fechaActual = compraInput.fecha || new Date().toISOString()
    const proveedor = get().proveedores.find((p) => p.id === compraInput.proveedor_id)

    // 1. Armar objeto cabecera de compra
    const nuevaCompra: CompraProveedor = {
      id: compraId,
      kiosco_id: usuario.kiosco_id,
      proveedor_id: compraInput.proveedor_id,
      usuario_id: usuario.id,
      nro_comprobante: compraInput.nro_comprobante?.trim() || null,
      fecha: fechaActual,
      total: compraInput.total,
      estado: 'RECIBIDA',
      medio_pago: compraInput.medio_pago,
      pagado_en_caja: Boolean(descontarDeCaja && sesionCajaId),
      sesion_caja_id: sesionCajaId,
      notas: compraInput.notas?.trim() || null,
      proveedor: proveedor,
      detalles: compraInput.detalles.map((d) => ({
        id: uuidv4(),
        compra_id: compraId,
        producto_id: d.producto_id,
        cantidad: d.cantidad,
        precio_costo_unitario: d.precio_costo_unitario,
        subtotal: d.subtotal,
        producto: d.producto,
      })),
    }

    // 2. Si se pagó a cuenta corriente, acumular saldo pendiente al proveedor
    if (compraInput.medio_pago === 'CUENTA_CORRIENTE') {
      const nuevoSaldo = (proveedor?.saldo_pendiente || 0) + compraInput.total
      get().actualizarProveedor(compraInput.proveedor_id, { saldo_pendiente: nuevoSaldo })
    }

    // 3. Guardar en local storage para disponibilidad inmediata
    const comprasActualizadas = [nuevaCompra, ...get().compras]
    saveLocalCompras(usuario.kiosco_id, comprasActualizadas)
    set({ compras: comprasActualizadas })

    // 4. Actualizar stock local en catálogo de productos
    try {
      const cached = localStorage.getItem('kiosko_cache_productos')
      if (cached) {
        const productosList: Producto[] = JSON.parse(cached)
        const updatedList = productosList.map((prod) => {
          const item = compraInput.detalles.find((d) => d.producto_id === prod.id)
          if (item) {
            return {
              ...prod,
              stock_actual: prod.stock_actual + item.cantidad,
              precio_costo: item.precio_costo_unitario,
              fecha_actualizacion: new Date().toISOString(),
            }
          }
          return prod
        })
        localStorage.setItem('kiosko_cache_productos', JSON.stringify(updatedList))
      }
    } catch (e) {
      console.warn('Error actualizando caché local de productos:', e)
    }

    // 5. Si se solicitó descontar de la caja activa y el medio es EFECTIVO
    if (descontarDeCaja && caja.sesionActiva && compraInput.medio_pago === 'EFECTIVO') {
      try {
        await caja.registrarMovimientoCaja(
          'EGRESO',
          'PROVEEDOR',
          compraInput.total,
          `Compra a ${proveedor?.nombre || 'Proveedor'} (Comprobante: ${compraInput.nro_comprobante || 'S/N'})`
        )
      } catch (err) {
        console.warn('No se pudo registrar egreso de caja para la compra:', err)
      }
    }

    // 6. Impactar en Supabase (cabecera y detalles)
    try {
      const { error: errorCabecera } = await supabase.from('compras_proveedor').insert({
        id: nuevaCompra.id,
        kiosco_id: nuevaCompra.kiosco_id,
        proveedor_id: nuevaCompra.proveedor_id,
        usuario_id: nuevaCompra.usuario_id,
        nro_comprobante: nuevaCompra.nro_comprobante,
        fecha: nuevaCompra.fecha,
        total: nuevaCompra.total,
        estado: nuevaCompra.estado,
        medio_pago: nuevaCompra.medio_pago,
        pagado_en_caja: nuevaCompra.pagado_en_caja,
        sesion_caja_id: nuevaCompra.sesion_caja_id,
        notas: nuevaCompra.notas,
      })

      if (!errorCabecera) {
        // Insertar los renglones (esto disparará el trigger trg_impactar_stock_compra en Postgres)
        const renglones = nuevaCompra.detalles!.map((d) => ({
          id: d.id,
          compra_id: d.compra_id,
          producto_id: d.producto_id,
          cantidad: d.cantidad,
          precio_costo_unitario: d.precio_costo_unitario,
          subtotal: d.subtotal,
        }))

        const { error: errorDetalles } = await supabase.from('detalles_compra').insert(renglones)
        if (errorDetalles) {
          console.warn('Error insertando detalles_compra en Supabase:', errorDetalles)
        }
      } else {
        console.warn('Supabase compras_proveedor insert fallback:', errorCabecera)
      }
    } catch (err) {
      console.warn('Error al persistir compra en Supabase (guardada localmente):', err)
    }

    toast.success('Compra y stock recibidos exitosamente')
    return { success: true, id: compraId }
  },

  anularCompra: async (compraId: string) => {
    const usuario = useAuthStore.getState().usuario
    if (!usuario?.kiosco_id) return false

    const compra = get().compras.find((c) => c.id === compraId)
    if (!compra) {
      toast.error('Compra no encontrada')
      return false
    }
    if (compra.estado === 'ANULADA') {
      toast.error('La compra ya está anulada')
      return false
    }

    // 1. Si era cuenta corriente, revertir saldo del proveedor
    if (compra.medio_pago === 'CUENTA_CORRIENTE' && compra.proveedor_id) {
      const proveedor = get().proveedores.find((p) => p.id === compra.proveedor_id)
      if (proveedor) {
        const saldoRevertido = Math.max(0, (proveedor.saldo_pendiente || 0) - compra.total)
        get().actualizarProveedor(compra.proveedor_id, { saldo_pendiente: saldoRevertido })
      }
    }

    // 2. Actualizar estado local
    const comprasActualizadas = get().compras.map((c) =>
      c.id === compraId ? { ...c, estado: 'ANULADA' as const } : c
    )
    saveLocalCompras(usuario.kiosco_id, comprasActualizadas)
    set({ compras: comprasActualizadas })

    // 3. Actualizar en Supabase
    try {
      await supabase
        .from('compras_proveedor')
        .update({ estado: 'ANULADA' })
        .eq('id', compraId)
        .eq('kiosco_id', usuario.kiosco_id)
    } catch (err) {
      console.warn('Error al anular compra en Supabase:', err)
    }

    toast.success('Compra marcada como ANULADA')
    return true
  },
}))
