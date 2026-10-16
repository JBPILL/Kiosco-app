import { create } from 'zustand'
import { supabase } from '../lib/supabase'
import { administracionComercialHabilitada } from '../lib/commercialScope'
import { ejecutarMutacionComercial } from '../lib/commercialClient'
import { useAuthStore } from './authStore'
import toast from 'react-hot-toast'

export interface ConfiguracionAdmin {
  whatsapp_soporte: string; alias_mp: string; cbu_banco: string; titular_cuenta: string
  banco_nombre?: string; mensaje_soporte?: string
}
export const CONFIG_ADMIN_VACIA: ConfiguracionAdmin = {
  whatsapp_soporte: '', alias_mp: '', cbu_banco: '', titular_cuenta: '', banco_nombre: '',
  mensaje_soporte: 'Hola, me comunico desde AlPaso POS.',
}
export function formatearLinkWhatsApp(telefono?: string, mensaje?: string): string {
  if (!telefono) return ''
  let clean = telefono.replace(/\D/g, '')
  if (!clean) return ''
  if (clean.startsWith('0')) clean = clean.slice(1)
  if (clean.length === 10) clean = `549${clean}`
  else if (clean.length === 12 && clean.startsWith('54') && !clean.startsWith('549')) clean = `549${clean.slice(2)}`
  return `https://wa.me/${clean}${mensaje ? `?text=${encodeURIComponent(mensaje)}` : ''}`
}
interface ConfigAdminState {
  config: ConfiguracionAdmin; cargando: boolean; guardando: boolean; error: string | null
  cargarConfig: () => Promise<ConfiguracionAdmin>
  guardarConfig: (config: Partial<ConfiguracionAdmin>) => Promise<boolean>
}
export const useConfigAdminStore = create<ConfigAdminState>((set, get) => ({
  config: CONFIG_ADMIN_VACIA, cargando: false, guardando: false, error: null,
  cargarConfig: async () => {
    const user = useAuthStore.getState().usuario
    if (!administracionComercialHabilitada() || !user?.activo || (!user.es_superadmin && user.rol !== 'DUEÑO')) {
      set({ config: CONFIG_ADMIN_VACIA, cargando: false, error: null })
      return CONFIG_ADMIN_VACIA
    }
    set({ cargando: true, config: CONFIG_ADMIN_VACIA, error: null })
    try {
      const { data, error } = await supabase.rpc('leer_configuracion_comercial')
      if (error || !data || typeof data !== 'object') throw new Error('No se pudo cargar la configuración comercial.')
      const config = { ...CONFIG_ADMIN_VACIA, ...data } as ConfiguracionAdmin
      if (useAuthStore.getState().usuario?.id !== user.id) return CONFIG_ADMIN_VACIA
      set({ config, cargando: false })
      return config
    } catch {
      set({ config: CONFIG_ADMIN_VACIA, cargando: false, error: 'No se pudo cargar la configuración comercial.' })
      return CONFIG_ADMIN_VACIA
    }
  },
  guardarConfig: async nueva => {
    if (get().guardando) return false
    set({ guardando: true, error: null })
    try {
      const config = { ...get().config, ...nueva }
      const data = await ejecutarMutacionComercial('guardar_configuracion_comercial', 'configuracion', { p_datos: config })
      if (!data.config || typeof data.config !== 'object') throw new Error('Configuración no confirmada')
      set({ config: data.config as ConfiguracionAdmin })
      toast.success('Datos de cobro confirmados')
      return true
    } catch (error) {
      const mensaje = error instanceof Error ? error.message : 'Configuración no confirmada'
      set({ error: mensaje }); toast.error(mensaje)
      return false
    } finally { set({ guardando: false }) }
  },
}))
