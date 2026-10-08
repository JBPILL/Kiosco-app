import { registrarFalloCheckout } from './checkoutDiagnostic.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.116.0'
import type { Cliente, ItemCombo, Kiosco, Producto, Promocion, Usuario } from '../../../src/types/database.ts'
import type { PointQuoteHttpDependencies } from './pointQuoteHttp.ts'

export function crearBackendCotizacionPoint(admin: SupabaseClient): Omit<PointQuoteHttpDependencies, 'origins' | 'iniciarCheckout'> {
  return {
    ahora: () => new Date(),
    autenticar: async (token) => {
      const { data: auth, error: authError } = await admin.auth.getUser(token)
      if (authError || !auth.user) return null
      const { data: perfil, error } = await admin.from('usuarios').select('id,auth_user_id,kiosco_id,activo,rol')
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
      const catalogo: Producto[] = []
      const cargarProductos = async (ids: string[]) => {
        for (let desde = 0; desde < ids.length; desde += 100) {
          const { data, error } = await admin.from('productos')
            .select('id,kiosco_id,categoria_id,descripcion,precio_venta,precio_envase,es_retornable,es_pesable,activo,es_combo,stock_actual')
            .eq('kiosco_id', permisos.kioscoId).in('id', ids.slice(desde, desde + 100))
          if (error || !data) { registrarFalloCheckout('CATALOGO', error); throw new Error('Catálogo no disponible') }
          catalogo.push(...data as Producto[])
        }
      }
      await cargarProductos(ids)
      const comboIds = catalogo.filter((producto) => producto.es_combo).map((producto) => producto.id)
      const componentes: ItemCombo[] = []
      for (let grupo = 0; grupo < comboIds.length; grupo += 100) {
        for (let desde = 0; ; desde += 500) {
          const { data, error } = await admin.from('combo_items')
            .select('id,kiosco_id,combo_producto_id,componente_producto_id,cantidad')
            .eq('kiosco_id', permisos.kioscoId).in('combo_producto_id', comboIds.slice(grupo, grupo + 100))
            .order('id').range(desde, desde + 499)
          if (error || !data || componentes.length + data.length > 50000) { registrarFalloCheckout('COMPONENTES', error); throw new Error('Componentes no disponibles') }
          componentes.push(...data as ItemCombo[])
          if (data.length < 500) break
        }
      }
      const conocidos = new Set(catalogo.map((producto) => producto.id))
      await cargarProductos([...new Set(componentes.map((componente) => componente.componente_producto_id))]
        .filter((id) => !conocidos.has(id)))
      const promociones: Promocion[] = []
      for (let desde = 0; ; desde += 500) {
        const { data, error } = await admin.from('promociones').select('id,kiosco_id,nombre,tipo,producto_id,categoria_id,cantidad_minima,cantidad_paga,precio_unitario_promo,descuento_porcentaje,precio_combo,items_combo,dias_semana,fecha_inicio,fecha_fin,activo')
          .eq('kiosco_id', permisos.kioscoId).eq('activo', true).order('id').range(desde, desde + 499)
        if (error || !data || desde >= 10000) { registrarFalloCheckout('PROMOCIONES', error); throw new Error('Promociones no disponibles') }
        promociones.push(...data as Promocion[])
        if (data.length < 500) break
      }
      const envaseIds = new Set(solicitud.lineas.flatMap((linea) => linea.tipo === 'DEVOLUCION_ENVASE' ? [linea.envaseId] : []))
      let envases: Array<{ id: string; kioscoId: string; nombre: string; precio: number }> = []
      if (envaseIds.size > 0) {
        const { data, error } = await admin.from('envases_tipos_comercio').select('id,nombre,precio')
          .eq('kiosco_id', permisos.kioscoId).eq('activo', true).limit(101)
        if (error || !data || data.length > 100) { registrarFalloCheckout('ENVASES', error); throw new Error('Envases no disponibles') }
        envases = data.filter((envase) => envaseIds.has(envase.id)).map((envase) => ({ id: envase.id, nombre: envase.nombre,
          precio: Number(envase.precio), kioscoId: permisos.kioscoId }))
      }
      let cliente: Cliente | null = null
      if (solicitud.clienteId) {
        const { data, error } = await admin.from('clientes').select('id,kiosco_id,activo,saldo_deudor,limite_credito')
          .eq('kiosco_id', permisos.kioscoId).eq('id', solicitud.clienteId).maybeSingle()
        if (error) { registrarFalloCheckout('CLIENTE', error); throw new Error('Cliente no disponible') }
        cliente = data as Cliente | null
      }
      return { productos: catalogo.map((producto) => ({ ...producto, precio_costo: 0 })) as Producto[],
        componentes, promociones, envases, cliente }
    },
  }
}
