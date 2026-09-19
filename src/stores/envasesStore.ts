import { create } from 'zustand'

export interface MovimientoEnvase {
  id: string
  fecha: string
  tipoEnvaseId: string
  tipoEnvaseNombre: string
  tipo: 'INGRESO_MOSTRADOR' | 'AJUSTE_MANUAL' | 'ENTREGA_DISTRIBUIDOR'
  cantidad: number
  stockResultante: number
  distribuidor?: string
  usuarioNombre?: string
  notas?: string
}

export interface TipoEnvase {
  id: string
  nombre: string
  precio: number
  descripcion?: string
  stock_vacios?: number
}

export const TIPOS_ENVASES_DEFAULT: TipoEnvase[] = [
  { id: '1lt', nombre: '1LT', precio: 1500, descripcion: 'Cerveza o gaseosa de 1 litro vidrio', stock_vacios: 0 },
  { id: '1.5lts', nombre: '1.5lts', precio: 1800, descripcion: 'Gaseosas medianas vidrio (Coca-Cola, Sprite, Fanta 1.5L)', stock_vacios: 0 },
  { id: '2lts', nombre: '2lts', precio: 2000, descripcion: 'Gaseosa retornable de 2 litros', stock_vacios: 0 },
  { id: '2.25lts', nombre: '2.25lts', precio: 2200, descripcion: 'Gaseosa retornable de 2.25 litros', stock_vacios: 0 },
  { id: 'sifon', nombre: 'Sifón de soda', precio: 2500, descripcion: 'Sifón de soda retornable', stock_vacios: 0 },
  { id: 'bidon20l', nombre: 'Bidón de agua 20lts', precio: 5000, descripcion: 'Bidón retornable de 20 litros', stock_vacios: 0 },
]

const getStorageKey = (kioscoId?: string) => `kiosko_tipos_envases_${kioscoId || 'default'}`
const getMovimientosStorageKey = (kioscoId?: string) => `kiosko_movimientos_envases_${kioscoId || 'default'}`

interface EnvasesState {
  tiposEnvases: TipoEnvase[]
  historialMovimientos: MovimientoEnvase[]
  cargando: boolean

  cargarTiposEnvases: (kioscoId?: string) => void
  cargarHistorialMovimientos: (kioscoId?: string) => void
  actualizarPrecioTipo: (id: string, nuevoPrecio: number, kioscoId?: string) => void
  actualizarPreciosConjuntamente: (
    modo: 'FIJO' | 'PORCENTAJE',
    valor: number,
    kioscoId?: string
  ) => void
  guardarTodosTipos: (tipos: TipoEnvase[], kioscoId?: string) => void
  actualizarStockVacios: (id: string, nuevoStock: number, kioscoId?: string, usuarioNombre?: string) => void
  ajustarStockVacios: (
    id: string,
    delta: number,
    motivo?: 'INGRESO_MOSTRADOR' | 'AJUSTE_MANUAL',
    kioscoId?: string,
    usuarioNombre?: string,
    notas?: string
  ) => void
  entregarVaciosADistribuidor: (
    id: string,
    cantidad: number,
    distribuidor: string,
    notas?: string,
    kioscoId?: string,
    usuarioNombre?: string
  ) => boolean
  obtenerPrecioPorTipo: (nombreOTipo?: string) => number
}

export const useEnvasesStore = create<EnvasesState>((set, get) => ({
  tiposEnvases: TIPOS_ENVASES_DEFAULT,
  historialMovimientos: [],
  cargando: false,

  cargarTiposEnvases: (kioscoId?: string) => {
    try {
      const key = getStorageKey(kioscoId)
      const stored = localStorage.getItem(key)
      if (stored) {
        const parsed: TipoEnvase[] = JSON.parse(stored)
        const fusionados: TipoEnvase[] = parsed.map((item) => ({
          ...item,
          stock_vacios: typeof item.stock_vacios === 'number' ? item.stock_vacios : 0,
        }))
        TIPOS_ENVASES_DEFAULT.forEach((def) => {
          const existe = fusionados.some(
            (t) => t.id === def.id || t.nombre.toLowerCase() === def.nombre.toLowerCase()
          )
          if (!existe) fusionados.push(def)
        })
        set({ tiposEnvases: fusionados })
        get().cargarHistorialMovimientos(kioscoId)
        return
      }
    } catch (e) {
      console.warn('Error leyendo tipos de envases desde almacenamiento local:', e)
    }

    set({ tiposEnvases: TIPOS_ENVASES_DEFAULT })
    get().cargarHistorialMovimientos(kioscoId)
  },

  cargarHistorialMovimientos: (kioscoId?: string) => {
    try {
      const key = getMovimientosStorageKey(kioscoId)
      const stored = localStorage.getItem(key)
      if (stored) {
        set({ historialMovimientos: JSON.parse(stored) })
        return
      }
    } catch (e) {
      console.warn('Error cargando historial de movimientos de envases:', e)
    }
    set({ historialMovimientos: [] })
  },

  actualizarPrecioTipo: (id: string, nuevoPrecio: number, kioscoId?: string) => {
    const p = Math.max(0, nuevoPrecio)
    const actualizados = get().tiposEnvases.map((t) => (t.id === id ? { ...t, precio: p } : t))
    set({ tiposEnvases: actualizados })
    try {
      localStorage.setItem(getStorageKey(kioscoId), JSON.stringify(actualizados))
    } catch (e) {
      console.warn('Error persistiendo tipo de envase:', e)
    }
  },

  actualizarPreciosConjuntamente: (
    modo: 'FIJO' | 'PORCENTAJE',
    valor: number,
    kioscoId?: string
  ) => {
    const actualizados = get().tiposEnvases.map((t) => {
      let nuevoPrecio = t.precio
      if (modo === 'FIJO') {
        nuevoPrecio = Math.max(0, valor)
      } else if (modo === 'PORCENTAJE') {
        nuevoPrecio = Math.round(t.precio * (1 + valor / 100))
      }
      return { ...t, precio: nuevoPrecio }
    })

    set({ tiposEnvases: actualizados })
    try {
      localStorage.setItem(getStorageKey(kioscoId), JSON.stringify(actualizados))
    } catch (e) {
      console.warn('Error persistiendo tipos de envases conjuntamente:', e)
    }
  },

  guardarTodosTipos: (tipos: TipoEnvase[], kioscoId?: string) => {
    set({ tiposEnvases: tipos })
    try {
      localStorage.setItem(getStorageKey(kioscoId), JSON.stringify(tipos))
    } catch (e) {
      console.warn('Error guardando lista de tipos de envases:', e)
    }
  },

  actualizarStockVacios: (id: string, nuevoStock: number, kioscoId?: string, usuarioNombre?: string) => {
    const stockSeguro = Math.max(0, Math.round(nuevoStock))
    let envaseEncontrado: TipoEnvase | undefined
    const actualizados = get().tiposEnvases.map((t) => {
      if (t.id === id) {
        envaseEncontrado = t
        return { ...t, stock_vacios: stockSeguro }
      }
      return t
    })

    if (!envaseEncontrado) return

    set({ tiposEnvases: actualizados })
    try {
      localStorage.setItem(getStorageKey(kioscoId), JSON.stringify(actualizados))
    } catch (e) {
      console.warn('Error persistiendo stock de envases:', e)
    }

    // Registrar movimiento
    const nuevoMov: MovimientoEnvase = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      fecha: new Date().toISOString(),
      tipoEnvaseId: id,
      tipoEnvaseNombre: envaseEncontrado.nombre,
      tipo: 'AJUSTE_MANUAL',
      cantidad: stockSeguro - (envaseEncontrado.stock_vacios || 0),
      stockResultante: stockSeguro,
      usuarioNombre: usuarioNombre || 'Usuario',
      notas: 'Ajuste manual de stock en depósito',
    }
    const historial = [nuevoMov, ...get().historialMovimientos].slice(0, 100)
    set({ historialMovimientos: historial })
    try {
      localStorage.setItem(getMovimientosStorageKey(kioscoId), JSON.stringify(historial))
    } catch (e) {
      console.warn('Error persistiendo movimiento de envase:', e)
    }
  },

  ajustarStockVacios: (
    id: string,
    delta: number,
    motivo: 'INGRESO_MOSTRADOR' | 'AJUSTE_MANUAL' = 'INGRESO_MOSTRADOR',
    kioscoId?: string,
    usuarioNombre?: string,
    notas?: string
  ) => {
    let envaseEncontrado: TipoEnvase | undefined
    let nuevoStock = 0

    const actualizados = get().tiposEnvases.map((t) => {
      if (t.id === id) {
        envaseEncontrado = t
        nuevoStock = Math.max(0, (t.stock_vacios || 0) + delta)
        return { ...t, stock_vacios: nuevoStock }
      }
      return t
    })

    if (!envaseEncontrado) return

    set({ tiposEnvases: actualizados })
    try {
      localStorage.setItem(getStorageKey(kioscoId), JSON.stringify(actualizados))
    } catch (e) {
      console.warn('Error persistiendo stock de envases:', e)
    }

    // Registrar en historial
    const nuevoMov: MovimientoEnvase = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      fecha: new Date().toISOString(),
      tipoEnvaseId: id,
      tipoEnvaseNombre: envaseEncontrado.nombre,
      tipo: motivo,
      cantidad: delta,
      stockResultante: nuevoStock,
      usuarioNombre: usuarioNombre || 'Cajero',
      notas: notas || (delta > 0 ? `Recepción mostrador (+${delta})` : `Egreso mostrador (${delta})`),
    }
    const historial = [nuevoMov, ...get().historialMovimientos].slice(0, 100)
    set({ historialMovimientos: historial })
    try {
      localStorage.setItem(getMovimientosStorageKey(kioscoId), JSON.stringify(historial))
    } catch (e) {
      console.warn('Error persistiendo movimiento de envase:', e)
    }
  },

  entregarVaciosADistribuidor: (
    id: string,
    cantidad: number,
    distribuidor: string,
    notas?: string,
    kioscoId?: string,
    usuarioNombre?: string
  ) => {
    const cantADescontar = Math.max(1, Math.round(cantidad))
    let envaseEncontrado: TipoEnvase | undefined
    let stockResultante = 0

    const actualizados = get().tiposEnvases.map((t) => {
      if (t.id === id) {
        envaseEncontrado = t
        const actual = t.stock_vacios || 0
        stockResultante = Math.max(0, actual - cantADescontar)
        return { ...t, stock_vacios: stockResultante }
      }
      return t
    })

    if (!envaseEncontrado) return false

    set({ tiposEnvases: actualizados })
    try {
      localStorage.setItem(getStorageKey(kioscoId), JSON.stringify(actualizados))
    } catch (e) {
      console.warn('Error persistiendo stock de envases:', e)
    }

    const nuevoMov: MovimientoEnvase = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      fecha: new Date().toISOString(),
      tipoEnvaseId: id,
      tipoEnvaseNombre: envaseEncontrado.nombre,
      tipo: 'ENTREGA_DISTRIBUIDOR',
      cantidad: -cantADescontar,
      stockResultante,
      distribuidor: distribuidor.trim(),
      usuarioNombre: usuarioNombre || 'Dueño',
      notas: notas || `Entrega de vacíos a camión distribuidor`,
    }

    const historial = [nuevoMov, ...get().historialMovimientos].slice(0, 100)
    set({ historialMovimientos: historial })
    try {
      localStorage.setItem(getMovimientosStorageKey(kioscoId), JSON.stringify(historial))
    } catch (e) {
      console.warn('Error persistiendo movimiento de envase:', e)
    }

    return true
  },

  obtenerPrecioPorTipo: (nombreOTipo?: string): number => {
    if (!nombreOTipo) return 1500
    const q = nombreOTipo.toLowerCase().trim()
    const tipos = get().tiposEnvases

    // 1. Coincidencia exacta por nombre o id
    const exacto = tipos.find(
      (t) => t.nombre.toLowerCase() === q || t.id.toLowerCase() === q
    )
    if (exacto) return exacto.precio

    // 2. Coincidencias por palabras clave frecuentes
    if (q.includes('2.25') || q.includes('2,25')) {
      const t = tipos.find((x) => x.id === '2.25lts')
      if (t) return t.precio
    }
    if (q.includes('2l') || q.includes('2 l') || q.includes('2 lt') || q.includes('2lt')) {
      const t = tipos.find((x) => x.id === '2lts')
      if (t) return t.precio
    }
    if (q.includes('1.5') || q.includes('1,5') || q.includes('1 1/2') || q.includes('1.5l') || q.includes('1,5l')) {
      const t = tipos.find((x) => x.id === '1.5lts')
      if (t) return t.precio
    }
    if (q.includes('sifon') || q.includes('sifón') || q.includes('soda')) {
      const t = tipos.find((x) => x.id === 'sifon')
      if (t) return t.precio
    }
    if (q.includes('bidon') || q.includes('bidón') || q.includes('20')) {
      const t = tipos.find((x) => x.id === 'bidon20l')
      if (t) return t.precio
    }
    if (q.includes('1l') || q.includes('1 l') || q.includes('1lt') || q.includes('litro')) {
      const t = tipos.find((x) => x.id === '1lt')
      if (t) return t.precio
    }

    return tipos[0]?.precio || 1500
  },
}))
