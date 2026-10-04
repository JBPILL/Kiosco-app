import { create } from 'zustand'
import { v4 as uuidv4 } from 'uuid'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { useCajaStore } from './cajaStore'
import { getCachedProductos, saveCachedProductos } from '../lib/utils'
import type {
  Proveedor,
  CompraProveedor,
  DetalleCompra,
  MedioPagoCompra,
  PagoProveedor,
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
  pagos: PagoProveedor[]
  cargando: boolean
  cargandoCompras: boolean
  cargandoPagos: boolean

  cargarProveedores: () => Promise<Proveedor[]>
  crearProveedor: (datos: NuevoProveedorInput) => Promise<Proveedor | null>
  actualizarProveedor: (id: string, datos: Partial<Proveedor>) => Promise<boolean>
  eliminarProveedor: (id: string) => Promise<boolean>

  // Pagos y saldos
  cargarPagos: (proveedorId?: string) => Promise<PagoProveedor[]>
  abonarSaldoProveedor: (
    id: string,
    monto: number,
    medioPago: 'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO',
    descontarDeCaja?: boolean,
    notas?: string,
    comprobanteRef?: string
  ) => Promise<PagoProveedor | null>
  ajustarSaldoProveedor: (id: string, nuevoSaldo: number, motivo?: string) => Promise<boolean>
  anularPagoProveedor: (pagoId: string) => Promise<boolean>

  // Compras y remitos
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

function getLocalPagos(kioscoId: string): PagoProveedor[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(`kioskopos_pagos_prov_${kioscoId}`)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function saveLocalPagos(kioscoId: string, pagos: PagoProveedor[]) {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(`kioskopos_pagos_prov_${kioscoId}`, JSON.stringify(pagos))
  } catch (e) {
    console.error('Error guardando pagos en local:', e)
  }
}

function getKioscoId(): string | null {
  const auth = useAuthStore.getState()
  return auth.usuario?.kiosco_id || auth.kiosco?.id || null
}

export const useProveedorStore = create<ProveedorState>((set, get) => ({
  proveedores: [],
  compras: [],
  pagos: [],
  cargando: false,
  cargandoCompras: false,
  cargandoPagos: false,

  cargarProveedores: async () => {
    const kioscoId = getKioscoId()
    if (!kioscoId) return []

    set({ cargando: true })
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .eq('kiosco_id', kioscoId)
        .eq('activo', true)
        .order('nombre')
        .limit(10000)

      if (!error && data) {
        set({ proveedores: data as Proveedor[], cargando: false })
        saveLocalProveedores(kioscoId, data as Proveedor[])
        return data as Proveedor[]
      }
    } catch {
      // Fallback a almacenamiento local
    }

    const locales = getLocalProveedores(kioscoId).filter((p) => p.activo !== false)
    set({ proveedores: locales, cargando: false })
    return locales
  },

  crearProveedor: async (datos) => {
    const kioscoId = getKioscoId()
    if (!kioscoId) {
      toast.error('No se pudo identificar el kiosco')
      return null
    }

    const nombreLimpio = datos.nombre?.trim()
    if (!nombreLimpio) {
      toast.error('El nombre del proveedor es obligatorio')
      return null
    }

    const existe = get().proveedores.some(
      (p) => p.activo !== false && p.nombre.toLowerCase().trim() === nombreLimpio.toLowerCase()
    )
    if (existe) {
      toast.error(`Ya existe un proveedor registrado con el nombre "${nombreLimpio}"`)
      return null
    }

    const emailLimpio = datos.email?.trim() || null
    if (emailLimpio && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
      toast.error('El formato del correo electrónico ingresado no es válido')
      return null
    }

    const nuevoProveedor: Proveedor = {
      id: uuidv4(),
      kiosco_id: kioscoId,
      nombre: nombreLimpio,
      contacto_nombre: datos.contacto_nombre?.trim() || null,
      telefono: datos.telefono?.trim() || null,
      email: emailLimpio,
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
    saveLocalProveedores(kioscoId, actualizados)
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
    const kioscoId = getKioscoId()
    if (!kioscoId) return false

    if (datos.nombre !== undefined) {
      const nombreLimpio = datos.nombre.trim()
      if (!nombreLimpio) {
        toast.error('El nombre del proveedor no puede estar vacío')
        return false
      }
      const existeOtro = get().proveedores.some(
        (p) => p.id !== id && p.activo !== false && p.nombre.toLowerCase().trim() === nombreLimpio.toLowerCase()
      )
      if (existeOtro) {
        toast.error(`Ya existe otro proveedor registrado con el nombre "${nombreLimpio}"`)
        return false
      }
      datos.nombre = nombreLimpio
    }

    if (datos.email !== undefined && datos.email !== null) {
      const emailLimpio = datos.email.trim()
      if (emailLimpio && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpio)) {
        toast.error('El formato del correo electrónico ingresado no es válido')
        return false
      }
      datos.email = emailLimpio || null
    }

    const actualizados = get().proveedores.map((p) =>
      p.id === id ? { ...p, ...datos } : p
    )
    saveLocalProveedores(kioscoId, actualizados)
    set({ proveedores: actualizados })

    try {
      const { error } = await supabase
        .from('proveedores')
        .update(datos)
        .eq('id', id)
        .eq('kiosco_id', kioscoId)

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
    const kioscoId = getKioscoId()
    if (!kioscoId) return false

    const actualizados = get().proveedores.filter((p) => p.id !== id)
    saveLocalProveedores(kioscoId, actualizados)
    set({ proveedores: actualizados })

    try {
      const { error } = await supabase
        .from('proveedores')
        .update({ activo: false })
        .eq('id', id)
        .eq('kiosco_id', kioscoId)

      if (error) {
        console.warn('Supabase soft delete fallback:', error.message)
      }
    } catch (err) {
      console.warn('Error al eliminar en Supabase:', err)
    }

    toast.success('Proveedor eliminado')
    return true
  },

  cargarPagos: async (proveedorId?: string) => {
    const kioscoId = getKioscoId()
    if (!kioscoId) return []

    set({ cargandoPagos: true })
    try {
      let query = supabase
        .from('pagos_proveedor')
        .select(`
          *,
          proveedor:proveedores(*)
        `)
        .eq('kiosco_id', kioscoId)
        .order('fecha', { ascending: false })
        .limit(10000)

      if (proveedorId) {
        query = query.eq('proveedor_id', proveedorId)
      }

      const { data, error } = await query
      if (!error && data) {
        set({ pagos: data as PagoProveedor[], cargandoPagos: false })
        saveLocalPagos(kioscoId, data as PagoProveedor[])
        return data as PagoProveedor[]
      }
    } catch {
      // Fallback a localStorage
    }

    let locales = getLocalPagos(kioscoId)
    if (proveedorId) {
      locales = locales.filter((p) => p.proveedor_id === proveedorId)
    }
    set({ pagos: locales, cargandoPagos: false })
    return locales
  },

  abonarSaldoProveedor: async (
    id,
    monto,
    medioPago,
    descontarDeCaja = false,
    notas,
    comprobanteRef
  ) => {
    const kioscoId = getKioscoId()
    if (!kioscoId) return null

    const proveedor = get().proveedores.find((p) => p.id === id)
    if (!proveedor) {
      toast.error('Proveedor no encontrado')
      return null
    }

    // BUG-28: Consultar saldo fresco en base de datos para evitar Lost Updates por concurrencia
    let saldoAnterior = Number(proveedor.saldo_pendiente) || 0
    try {
      const { data: provDB } = await supabase
        .from('proveedores')
        .select('saldo_pendiente')
        .eq('id', id)
        .maybeSingle()
      if (provDB && typeof provDB.saldo_pendiente === 'number') {
        saldoAnterior = provDB.saldo_pendiente
      }
    } catch {}

    const nuevoSaldo = Number((saldoAnterior - monto).toFixed(2))

    // 1. Actualizar proveedor
    const actualizados = get().proveedores.map((p) =>
      p.id === id ? { ...p, saldo_pendiente: nuevoSaldo } : p
    )
    saveLocalProveedores(kioscoId, actualizados)
    set({ proveedores: actualizados })

    try {
      await supabase
        .from('proveedores')
        .update({ saldo_pendiente: nuevoSaldo })
        .eq('id', id)
        .eq('kiosco_id', kioscoId)
    } catch (err) {
      console.warn('Error al actualizar saldo en Supabase:', err)
    }

    // 2. Si se optó por descontar de caja en efectivo
    const caja = useCajaStore.getState()
    const sesionCajaId = (descontarDeCaja && medioPago === 'EFECTIVO' && caja.sesionActiva)
      ? caja.sesionActiva.id
      : null

    if (sesionCajaId) {
      const efectivoEnCaja = caja.resumenActivo?.efectivo_esperado_en_caja ?? (caja.sesionActiva?.monto_inicial || 0)
      if (monto > efectivoEnCaja) {
        toast('Aviso: El pago al proveedor supera el efectivo registrado en caja.', { icon: '⚠️' })
      }
      try {
        await caja.registrarMovimientoCaja(
          'EGRESO',
          'PROVEEDOR',
          monto,
          `Pago de saldo a proveedor: ${proveedor.nombre} ${comprobanteRef ? `(Ref: ${comprobanteRef})` : ''}`
        )
      } catch (err) {
        console.warn('Error registrando egreso en caja:', err)
      }
    }

    // 3. Crear comprobante de pago
    const nuevoPago: PagoProveedor = {
      id: uuidv4(),
      kiosco_id: kioscoId,
      proveedor_id: id,
      fecha: new Date().toISOString(),
      monto,
      medio_pago: medioPago,
      saldo_anterior: saldoAnterior,
      saldo_nuevo: nuevoSaldo,
      pagado_en_caja: Boolean(sesionCajaId),
      sesion_caja_id: sesionCajaId,
      comprobante_ref: comprobanteRef?.trim() || null,
      notas: notas?.trim() || null,
      proveedor: proveedor,
      estado: 'ACTIVO',
    }

    const pagosActualizados = [nuevoPago, ...get().pagos]
    saveLocalPagos(kioscoId, pagosActualizados)
    set({ pagos: pagosActualizados })

    try {
      await supabase.from('pagos_proveedor').insert({
        id: nuevoPago.id,
        kiosco_id: nuevoPago.kiosco_id,
        proveedor_id: nuevoPago.proveedor_id,
        fecha: nuevoPago.fecha,
        monto: nuevoPago.monto,
        medio_pago: nuevoPago.medio_pago,
        saldo_anterior: nuevoPago.saldo_anterior,
        saldo_nuevo: nuevoPago.saldo_nuevo,
        pagado_en_caja: nuevoPago.pagado_en_caja,
        sesion_caja_id: nuevoPago.sesion_caja_id,
        comprobante_ref: nuevoPago.comprobante_ref,
        notas: nuevoPago.notas,
        estado: 'ACTIVO',
      })
    } catch {
      // Ignorar si la tabla pagos_proveedor aún no está creada en Postgres
    }

    toast.success(`Pago de $${monto.toLocaleString('es-AR')} registrado correctamente`)
    return nuevoPago
  },

  ajustarSaldoProveedor: async (id, nuevoSaldo, motivo) => {
    const kioscoId = getKioscoId()
    if (!kioscoId) return false

    const proveedor = get().proveedores.find((p) => p.id === id)
    if (!proveedor) {
      toast.error('Proveedor no encontrado')
      return false
    }

    const saldoNumerico = Number((Number(nuevoSaldo) || 0).toFixed(2))
    const actualizados = get().proveedores.map((p) =>
      p.id === id ? { ...p, saldo_pendiente: saldoNumerico } : p
    )
    saveLocalProveedores(kioscoId, actualizados)
    set({ proveedores: actualizados })

    try {
      await supabase
        .from('proveedores')
        .update({ saldo_pendiente: saldoNumerico })
        .eq('id', id)
        .eq('kiosco_id', kioscoId)
    } catch (err) {
      console.warn('Error actualizando saldo en Supabase:', err)
    }

    toast.success(`Saldo ajustado a $${saldoNumerico.toLocaleString('es-AR')} ${motivo ? `(${motivo})` : ''}`)
    return true
  },

  anularPagoProveedor: async (pagoId: string) => {
    const kioscoId = getKioscoId()
    if (!kioscoId) return false

    const pago = get().pagos.find((p) => p.id === pagoId)
    if (!pago) {
      toast.error('Comprobante de pago no encontrado')
      return false
    }
    if (pago.estado === 'ANULADO') {
      toast.error('Este comprobante ya se encuentra anulado')
      return false
    }

    // 1. Revertir saldo pendiente al proveedor
    const proveedor = get().proveedores.find((p) => p.id === pago.proveedor_id)
    if (proveedor) {
      // BUG-28: Consultar saldo fresco en base de datos para evitar Lost Updates por concurrencia
      let saldoBase = Number(proveedor.saldo_pendiente) || 0
      try {
        const { data: provDB } = await supabase
          .from('proveedores')
          .select('saldo_pendiente')
          .eq('id', proveedor.id)
          .maybeSingle()
        if (provDB && typeof provDB.saldo_pendiente === 'number') {
          saldoBase = provDB.saldo_pendiente
        }
      } catch {}

      const saldoRestituido = Number((saldoBase + pago.monto).toFixed(2))
      const actualizados = get().proveedores.map((p) =>
        p.id === proveedor.id ? { ...p, saldo_pendiente: saldoRestituido } : p
      )
      saveLocalProveedores(kioscoId, actualizados)
      set({ proveedores: actualizados })

      try {
        await supabase
          .from('proveedores')
          .update({ saldo_pendiente: saldoRestituido })
          .eq('id', proveedor.id)
          .eq('kiosco_id', kioscoId)
      } catch (err) {
        console.warn('Error revirtiendo saldo:', err)
      }
    }

    // 2. Si se había descontado de caja y la caja sigue abierta, ingresar reintegro
    if (pago.pagado_en_caja) {
      const caja = useCajaStore.getState()
      if (caja.sesionActiva) {
        try {
          await caja.registrarMovimientoCaja(
            'INGRESO',
            'PROVEEDOR',
            pago.monto,
            `Reintegro por anulación de pago a proveedor: ${proveedor?.nombre || 'Proveedor'}`
          )
        } catch (err) {
          console.warn('Error reintegrando a caja:', err)
        }
      }
    }

    // 3. Marcar pago como anulado
    const pagosActualizados = get().pagos.map((p) =>
      p.id === pagoId ? { ...p, estado: 'ANULADO' as const } : p
    )
    saveLocalPagos(kioscoId, pagosActualizados)
    set({ pagos: pagosActualizados })

    try {
      await supabase
        .from('pagos_proveedor')
        .update({ estado: 'ANULADO' })
        .eq('id', pagoId)
        .eq('kiosco_id', kioscoId)
    } catch {
      // Fallback
    }

    toast.success('Pago anulado y saldo de deuda restituido')
    return true
  },

  cargarCompras: async () => {
    const kioscoId = getKioscoId()
    if (!kioscoId) return []

    set({ cargandoCompras: true })
    try {
      const { data, error } = await supabase
        .from('compras_proveedor')
        .select(`
          *,
          proveedor:proveedores(*),
          usuario:usuarios(id, nombre)
        `)
        .eq('kiosco_id', kioscoId)
        .order('fecha', { ascending: false })
        .limit(10000)

      if (!error && data) {
        set({ compras: data as CompraProveedor[], cargandoCompras: false })
        saveLocalCompras(kioscoId, data as CompraProveedor[])
        return data as CompraProveedor[]
      }
    } catch {
      // Fallback a localStorage
    }

    const locales = getLocalCompras(kioscoId)
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
    const kioscoId = getKioscoId()
    if (!kioscoId) {
      toast.error('Sesión no identificada')
      return { success: false, error: 'Sin sesión' }
    }

    const tieneDetalles = Boolean(compraInput.detalles && compraInput.detalles.length > 0)
    if (!tieneDetalles && (!compraInput.total || compraInput.total <= 0)) {
      toast.error('El monto total de la compra debe ser mayor a 0')
      return { success: false, error: 'Monto inválido' }
    }

    const caja = useCajaStore.getState()
    const sesionCajaId = (descontarDeCaja && caja.sesionActiva) ? caja.sesionActiva.id : null

    const compraId = uuidv4()
    const fechaActual = compraInput.fecha || new Date().toISOString()
    const proveedor = get().proveedores.find((p) => p.id === compraInput.proveedor_id)

    // 1. Armar objeto cabecera de compra
    const nuevaCompra: CompraProveedor = {
      id: compraId,
      kiosco_id: kioscoId,
      proveedor_id: compraInput.proveedor_id,
      usuario_id: usuario?.id || null,
      nro_comprobante: compraInput.nro_comprobante?.trim() || null,
      fecha: fechaActual,
      total: compraInput.total,
      estado: 'RECIBIDA',
      medio_pago: compraInput.medio_pago,
      pagado_en_caja: Boolean(descontarDeCaja && sesionCajaId),
      sesion_caja_id: sesionCajaId,
      notas: compraInput.notas?.trim() || null,
      proveedor: proveedor,
      detalles: (compraInput.detalles || []).map((d) => ({
        id: uuidv4(),
        compra_id: compraId,
        producto_id: d.producto_id,
        cantidad: d.cantidad,
        precio_costo_unitario: d.precio_costo_unitario,
        subtotal: d.subtotal,
        producto: d.producto,
      })),
    }

    // 2. Si se pagó a cuenta corriente, acumular saldo pendiente al proveedor (BUG-28)
    if (compraInput.medio_pago === 'CUENTA_CORRIENTE') {
      let saldoBase = Number(proveedor?.saldo_pendiente) || 0
      try {
        const { data: provDB } = await supabase
          .from('proveedores')
          .select('saldo_pendiente')
          .eq('id', compraInput.proveedor_id)
          .maybeSingle()
        if (provDB && typeof provDB.saldo_pendiente === 'number') {
          saldoBase = provDB.saldo_pendiente
        }
      } catch {}

      const nuevoSaldo = Number((saldoBase + compraInput.total).toFixed(2))
      get().actualizarProveedor(compraInput.proveedor_id, { saldo_pendiente: nuevoSaldo })
    }

    // 3. Guardar en local storage para disponibilidad inmediata
    const comprasActualizadas = [nuevaCompra, ...get().compras]
    saveLocalCompras(kioscoId, comprasActualizadas)
    set({ compras: comprasActualizadas })

    // 4. Actualizar stock local en catálogo de productos si hubo renglones
    if (tieneDetalles) {
      try {
        const productosList: Producto[] = getCachedProductos(kioscoId)
        if (productosList && productosList.length > 0) {
          const updatedList = productosList.map((prod) => {
            const item = (compraInput.detalles || []).find((d) => d.producto_id === prod.id)
            if (item) {
              return {
                ...prod,
                // BUG-29: Sanitizar contra undefined/null para no generar NaN
                stock_actual: Number(((prod.stock_actual || 0) + item.cantidad).toFixed(3)),
                precio_costo: item.precio_costo_unitario,
                fecha_actualizacion: new Date().toISOString(),
              }
            }
            return prod
          })
          saveCachedProductos(updatedList, kioscoId)
        }
      } catch (e) {
        console.warn('Error actualizando caché local de productos:', e)
      }
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

      if (!errorCabecera && tieneDetalles) {
        const renglones = (nuevaCompra.detalles || []).map((d) => ({
          id: d.id,
          compra_id: d.compra_id,
          producto_id: d.producto_id,
          cantidad: d.cantidad,
          precio_costo_unitario: d.precio_costo_unitario,
          subtotal: d.subtotal,
        }))

        if (renglones.length > 0) {
          const { error: errorDetalles } = await supabase.from('detalles_compra').insert(renglones)
          if (errorDetalles) {
            console.warn('Error insertando detalles_compra en Supabase:', errorDetalles)
          }
        }

        // Actualizar stock_actual y precio_costo en tabla productos en Supabase
        for (const item of (compraInput.detalles || [])) {
          try {
            // BUG-27: maybeSingle para no interrumpir el bucle si un producto fue dado de baja
            const { data: pDB } = await supabase
              .from('productos')
              .select('id, stock_actual')
              .eq('id', item.producto_id)
              .maybeSingle()

            if (pDB) {
              const nuevoStock = Number(((pDB.stock_actual || 0) + item.cantidad).toFixed(3))
              await supabase
                .from('productos')
                .update({
                  stock_actual: nuevoStock,
                  precio_costo: item.precio_costo_unitario,
                  fecha_actualizacion: new Date().toISOString(),
                })
                .eq('id', pDB.id)

              await supabase.from('movimientos_stock').insert({
                kiosco_id: kioscoId,
                producto_id: pDB.id,
                tipo: 'INGRESO',
                cantidad: item.cantidad,
                motivo: 'COMPRA',
                notas: `Compra ${compraInput.nro_comprobante ? `(${compraInput.nro_comprobante})` : ''} - Proveedor: ${proveedor?.nombre || 'General'}`,
                usuario_id: usuario?.id || null,
                fecha: new Date().toISOString(),
              })
            }
          } catch (errStockProd) {
            console.warn('Error actualizando stock de producto en compra:', errStockProd)
          }
        }
      }
    } catch (err) {
      console.warn('Error al persistir compra en Supabase (guardada localmente):', err)
    }

    toast.success('Compra y stock recibidos exitosamente')
    return { success: true, id: compraId }
  },

  anularCompra: async (compraId: string) => {
    const usuario = useAuthStore.getState().usuario
    const kioscoId = getKioscoId()
    if (!kioscoId) return false

    const compra = get().compras.find((c) => c.id === compraId)
    if (!compra) {
      toast.error('Compra no encontrada')
      return false
    }
    if (compra.estado === 'ANULADA') {
      toast.error('La compra ya está anulada')
      return false
    }

    // 1. Si era cuenta corriente, revertir saldo del proveedor (BUG-28)
    if (compra.medio_pago === 'CUENTA_CORRIENTE' && compra.proveedor_id) {
      const proveedor = get().proveedores.find((p) => p.id === compra.proveedor_id)
      if (proveedor) {
        let saldoBase = Number(proveedor.saldo_pendiente) || 0
        try {
          const { data: provDB } = await supabase
            .from('proveedores')
            .select('saldo_pendiente')
            .eq('id', compra.proveedor_id)
            .maybeSingle()
          if (provDB && typeof provDB.saldo_pendiente === 'number') {
            saldoBase = provDB.saldo_pendiente
          }
        } catch {}

        const saldoRevertido = Number((saldoBase - compra.total).toFixed(2))
        await get().actualizarProveedor(compra.proveedor_id, { saldo_pendiente: saldoRevertido })
      }
    }

    // 1b. Si se había descontado de caja y la caja sigue abierta, ingresar reintegro para evitar faltante ficticio
    if (compra.pagado_en_caja) {
      const caja = useCajaStore.getState()
      if (caja.sesionActiva) {
        try {
          await caja.registrarMovimientoCaja(
            'INGRESO',
            'PROVEEDOR',
            compra.total,
            `Reintegro por anulación de compra #${compra.nro_comprobante || compra.id.slice(0, 8).toUpperCase()} - Proveedor: ${compra.proveedor?.nombre || 'General'}`
          )
        } catch (errCaja) {
          console.warn('Error reintegrando a caja en anulación de compra:', errCaja)
        }
      }
    }

    // 2. Revertir stock de los productos comprados (Supabase y caché local)
    try {
      let detalles = compra.detalles
      if (!detalles || detalles.length === 0) {
        detalles = await get().cargarDetallesCompra(compraId)
      }

      if (detalles && detalles.length > 0) {
        // Revertir en Supabase
        for (const item of detalles) {
          try {
            // BUG-27: maybeSingle para no interrumpir la anulación si un producto fue archivado
            const { data: pDB } = await supabase
              .from('productos')
              .select('id, stock_actual')
              .eq('id', item.producto_id)
              .maybeSingle()

            if (pDB) {
              const nuevoStock = Math.max(0, Number(((pDB.stock_actual || 0) - item.cantidad).toFixed(3)))
              await supabase
                .from('productos')
                .update({
                  stock_actual: nuevoStock,
                  fecha_actualizacion: new Date().toISOString(),
                })
                .eq('id', pDB.id)

              await supabase.from('movimientos_stock').insert({
                kiosco_id: kioscoId,
                producto_id: pDB.id,
                tipo: 'EGRESO',
                cantidad: -item.cantidad,
                motivo: 'AJUSTE',
                notas: `Anulación de compra #${compra.nro_comprobante || compra.id.slice(0, 8).toUpperCase()}`,
                usuario_id: usuario?.id || null,
                fecha: new Date().toISOString(),
              })
            }
          } catch (errStockRev) {
            console.warn('Error revirtiendo stock en anulación:', errStockRev)
          }
        }

        // Revertir en caché local
        try {
          const productosList: Producto[] = getCachedProductos(kioscoId)
          if (productosList && productosList.length > 0) {
            const detallesMap = new Map(detalles.map((d) => [d.producto_id, d.cantidad]))
            const updatedList = productosList.map((prod) => {
              const cantDeducir = detallesMap.get(prod.id)
              if (cantDeducir !== undefined) {
                return {
                  ...prod,
                  stock_actual: Math.max(0, prod.stock_actual - cantDeducir),
                  fecha_actualizacion: new Date().toISOString(),
                }
              }
              return prod
            })
            saveCachedProductos(updatedList, kioscoId)
          }
        } catch (eLocal) {
          console.warn('Error actualizando caché local al anular compra:', eLocal)
        }
      }
    } catch (errDet) {
      console.warn('Error al cargar detalles para revertir stock de compra:', errDet)
    }

    // 3. Actualizar estado local
    const comprasActualizadas = get().compras.map((c) =>
      c.id === compraId ? { ...c, estado: 'ANULADA' as const } : c
    )
    saveLocalCompras(kioscoId, comprasActualizadas)
    set({ compras: comprasActualizadas })

    // 4. Actualizar en Supabase
    try {
      await supabase
        .from('compras_proveedor')
        .update({ estado: 'ANULADA' })
        .eq('id', compraId)
        .eq('kiosco_id', kioscoId)
    } catch (err) {
      console.warn('Error al anular compra en Supabase:', err)
    }

    toast.success('Compra anulada y stock revertido correctamente')
    return true
  },
}))
