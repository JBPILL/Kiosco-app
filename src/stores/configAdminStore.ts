import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import toast from 'react-hot-toast'

export interface ConfiguracionAdmin {
  whatsapp_soporte: string
  alias_mp: string
  cbu_banco: string
  titular_cuenta: string
  banco_nombre?: string
  mensaje_soporte?: string
}

const STORAGE_KEY = 'kiosko_config_admin'

const DEFAULT_CONFIG: ConfiguracionAdmin = {
  whatsapp_soporte: '',
  alias_mp: '',
  cbu_banco: '',
  titular_cuenta: '',
  banco_nombre: '',
  mensaje_soporte: 'Hola, me comunico desde AlPaso POS.',
}

/**
 * Normaliza cualquier formato de teléfono ingresado (ej: 11 2345-6789, 011..., +549...)
 * y genera una URL de WhatsApp directa válida.
 */
export function formatearLinkWhatsApp(telefono?: string, mensaje?: string): string {
  if (!telefono) return ''
  // Eliminar cualquier caracter no numérico
  let clean = telefono.replace(/\D/g, '')
  if (!clean) return ''

  // Si empieza con 0 (ej: 011...), remover el 0
  if (clean.startsWith('0')) {
    clean = clean.slice(1)
  }

  // Si tiene 10 dígitos (número estándar argentino sin código de país, ej: 1123456789)
  if (clean.length === 10) {
    clean = `549${clean}`
  } else if (clean.length === 12 && clean.startsWith('54') && !clean.startsWith('549')) {
    // Si tiene 54 pero falta el 9 para celulares de Argentina
    clean = `549${clean.slice(2)}`
  }

  const msgParam = mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''
  return `https://wa.me/${clean}${msgParam}`
}

interface ConfigAdminState {
  config: ConfiguracionAdmin
  cargando: boolean
  guardando: boolean
  error: string | null

  cargarConfig: () => Promise<ConfiguracionAdmin>
  guardarConfig: (nuevaConfig: Partial<ConfiguracionAdmin>) => Promise<boolean>
}

export const useConfigAdminStore = create<ConfigAdminState>((set, get) => ({
  config: (() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY)
      if (cached) {
        return { ...DEFAULT_CONFIG, ...JSON.parse(cached) }
      }
    } catch {
      // Ignorar error de parsing
    }
    return DEFAULT_CONFIG
  })(),
  cargando: false,
  guardando: false,
  error: null,

  cargarConfig: async () => {
    set({ cargando: true, error: null })
    try {
      // 1. Intentar cargar desde tabla dedicada 'configuracion_admin'
      const { data: tablaData, error: tablaError } = await supabase
        .from('configuracion_admin')
        .select('*')
        .eq('id', 'general')
        .maybeSingle()

      if (!tablaError && tablaData) {
        const configCargada: ConfiguracionAdmin = {
          whatsapp_soporte: tablaData.whatsapp || '',
          alias_mp: tablaData.alias_mp || '',
          cbu_banco: tablaData.cbu_banco || '',
          titular_cuenta: tablaData.titular_cuenta || '',
          banco_nombre: tablaData.banco_nombre || '',
          mensaje_soporte: tablaData.mensaje_soporte || DEFAULT_CONFIG.mensaje_soporte,
        }
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configCargada))
        set({ config: configCargada, cargando: false })
        return configCargada
      }

      // 2. Fallback nube: buscar registro especial en tabla 'planes'
      const { data: planConfig } = await supabase
        .from('planes')
        .select('descripcion')
        .eq('nombre', '__CONFIG_SISTEMA__')
        .maybeSingle()

      if (planConfig?.descripcion) {
        try {
          const parsed = JSON.parse(planConfig.descripcion)
          const configCargada: ConfiguracionAdmin = { ...DEFAULT_CONFIG, ...parsed }
          localStorage.setItem(STORAGE_KEY, JSON.stringify(configCargada))
          set({ config: configCargada, cargando: false })
          return configCargada
        } catch {
          // JSON no válido
        }
      }

      // 3. Fallback: usar el valor en cache local o defaults
      const actual = get().config
      set({ cargando: false })
      return actual
    } catch (err) {
      console.error('Error cargando configuración admin:', err)
      set({ cargando: false })
      return get().config
    }
  },

  guardarConfig: async (nuevaConfig: Partial<ConfiguracionAdmin>) => {
    set({ guardando: true, error: null })
    const configFusionada: ConfiguracionAdmin = {
      ...get().config,
      ...nuevaConfig,
    }

    try {
      // 1. Guardar de inmediato en localStorage para respuesta instantánea
      localStorage.setItem(STORAGE_KEY, JSON.stringify(configFusionada))
      set({ config: configFusionada })

      // 2. Intentar guardar en tabla 'configuracion_admin'
      await supabase
        .from('configuracion_admin')
        .upsert({
          id: 'general',
          whatsapp: configFusionada.whatsapp_soporte,
          alias_mp: configFusionada.alias_mp,
          cbu_banco: configFusionada.cbu_banco,
          titular_cuenta: configFusionada.titular_cuenta,
          banco_nombre: configFusionada.banco_nombre,
          mensaje_soporte: configFusionada.mensaje_soporte,
          fecha_actualizacion: new Date().toISOString(),
        })

      // 3. Guardar también en tabla 'planes' para replicación garantizada en todos los clientes
      const { data: planExistente } = await supabase
        .from('planes')
        .select('id')
        .eq('nombre', '__CONFIG_SISTEMA__')
        .maybeSingle()

      const jsonStr = JSON.stringify(configFusionada)

      if (planExistente?.id) {
        await supabase
          .from('planes')
          .update({
            descripcion: jsonStr,
            activo: false,
          })
          .eq('id', planExistente.id)
      } else {
        await supabase
          .from('planes')
          .insert({
            nombre: '__CONFIG_SISTEMA__',
            precio_mensual: 0,
            max_usuarios: 0,
            descripcion: jsonStr,
            activo: false,
          })
      }

      set({ guardando: false })
      toast.success('Datos de cobro y WhatsApp guardados correctamente')
      return true
    } catch (err) {
      console.error('Error guardando configuración admin:', err)
      set({ guardando: false })
      toast.error('Error al guardar datos de cobro')
      return false
    }
  },
}))
