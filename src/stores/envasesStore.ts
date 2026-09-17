import { create } from 'zustand'

export interface TipoEnvase {
  id: string
  nombre: string
  precio: number
  descripcion?: string
}

export const TIPOS_ENVASES_DEFAULT: TipoEnvase[] = [
  { id: '1lt', nombre: '1LT', precio: 1500, descripcion: 'Cerveza o gaseosa de 1 litro vidrio' },
  { id: '2lts', nombre: '2lts', precio: 2000, descripcion: 'Gaseosa retornable de 2 litros' },
  { id: '2.25lts', nombre: '2.25lts', precio: 2200, descripcion: 'Gaseosa retornable de 2.25 litros' },
  { id: 'sifon', nombre: 'Sifón de soda', precio: 2500, descripcion: 'Sifón de soda retornable' },
  { id: 'bidon20l', nombre: 'Bidón de agua 20lts', precio: 5000, descripcion: 'Bidón retornable de 20 litros' },
]

const getStorageKey = (kioscoId?: string) => `kiosko_tipos_envases_${kioscoId || 'default'}`

interface EnvasesState {
  tiposEnvases: TipoEnvase[]
  cargando: boolean

  cargarTiposEnvases: (kioscoId?: string) => void
  actualizarPrecioTipo: (id: string, nuevoPrecio: number, kioscoId?: string) => void
  actualizarPreciosConjuntamente: (
    modo: 'FIJO' | 'PORCENTAJE',
    valor: number,
    kioscoId?: string
  ) => void
  guardarTodosTipos: (tipos: TipoEnvase[], kioscoId?: string) => void
  obtenerPrecioPorTipo: (nombreOTipo?: string) => number
}

export const useEnvasesStore = create<EnvasesState>((set, get) => ({
  tiposEnvases: TIPOS_ENVASES_DEFAULT,
  cargando: false,

  cargarTiposEnvases: (kioscoId?: string) => {
    try {
      const key = getStorageKey(kioscoId)
      const stored = localStorage.getItem(key)
      if (stored) {
        const parsed: TipoEnvase[] = JSON.parse(stored)
        const fusionados: TipoEnvase[] = [...parsed]
        TIPOS_ENVASES_DEFAULT.forEach((def) => {
          const existe = fusionados.some(
            (t) => t.id === def.id || t.nombre.toLowerCase() === def.nombre.toLowerCase()
          )
          if (!existe) fusionados.push(def)
        })
        set({ tiposEnvases: fusionados })
        return
      }
    } catch (e) {
      console.warn('Error leyendo tipos de envases desde almacenamiento local:', e)
    }

    set({ tiposEnvases: TIPOS_ENVASES_DEFAULT })
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
