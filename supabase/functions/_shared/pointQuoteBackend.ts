import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import type { Cliente, Kiosco, Producto, Promocion, Usuario } from '../../../src/types/database.ts'
import type { PointQuoteHttpDependencies } from './pointQuoteHttp.ts'

export function crearBackendCotizacionPoint(admin: SupabaseClient): Omit<PointQuoteHttpDependencies, 'origins' | 'iniciarCheckout'> {
  return {
    ahora: () => new Date(),
    autenticar: async (token) => {
      const { data: auth, error: authError } = await admin.auth.getUser(token)
      if (authError || !auth.user) return null
      const { data: perfil, error } = await admin.from('usuarios').select('*')
        .eq('auth_user_id', auth.user.id).eq('activo', true).maybeSingle()
      if (error || !perfil?.kiosco_id) return null
      const { data: comercio, error: errorComercio } = await admin.from('kioscos')
        .select('id,estado_suscripcion,capacidades_operativas').eq('id', perfil.kiosco_id).maybeSingle()
      if (errorComercio || !comercio) return null
      return { authUserId: auth.user.id, usuario: perfil as Usuario, kiosco: comercio as Kiosco }
    },
    cargarDatos: async (permisos, solicitud) => {
      // Incluye identidades virtuales para detectar colisiones con productos reales.
      const ids = [...new Set(solicitud.lineas.map((linea) => linea.tipo === 'PRODUCTO' ? linea.productoId : linea.id))]
      const { data: catalogo, error: errorCatalogo } = await admin.from('productos')
        .select('id,kiosco_id,categoria_id,descripcion,precio_venta,precio_envase,es_retornable,es_pesable,activo,es_combo')
        .eq('kiosco_id', permisos.kioscoId).in('id', ids)
      if (errorCatalogo || !catalogo) throw new Error('Catálogo no disponible')
      const promociones: Promocion[] = []
      for (let desde = 0; ; desde += 500) {
        const { data, error } = await admin.from('promociones').select('*')
          .eq('kiosco_id', permisos.kioscoId).eq('activo', true).order('id').range(desde, desde + 499)
        if (error || !data || desde >= 10000) throw new Error('Promociones no disponibles')
        promociones.push(...data as Promocion[])
        if (data.length < 500) break
      }
      const envaseIds = solicitud.lineas.flatMap((linea) => linea.tipo === 'DEVOLUCION_ENVASE' ? [linea.envaseId] : [])
      let envases: Array<{ id: string; kioscoId: string; nombre: string; precio: number }> = []
      if (envaseIds.length > 0) {
        const { data, error } = await admin.from('envases_tipos_comercio').select('id,nombre,precio')
          .eq('kiosco_id', permisos.kioscoId).eq('activo', true).in('id', envaseIds)
        if (error || !data) throw new Error('Envases no disponibles')
        envases = data.map((envase) => ({ id: envase.id, nombre: envase.nombre,
          precio: Number(envase.precio), kioscoId: permisos.kioscoId }))
      }
      let cliente: Cliente | null = null
      if (solicitud.clienteId) {
        const { data, error } = await admin.from('clientes').select('*')
          .eq('kiosco_id', permisos.kioscoId).eq('id', solicitud.clienteId).maybeSingle()
        if (error) throw new Error('Cliente no disponible')
        cliente = data as Cliente | null
      }
      return { productos: catalogo.map((producto) => ({ ...producto, precio_costo: 0 })) as Producto[],
        promociones, envases, cliente }
    },
  }
}
