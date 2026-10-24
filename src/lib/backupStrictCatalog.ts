import { supabase } from './supabase'

interface SolicitudCatalogoBackup {
  id: string
  solicitud: Record<string, unknown>
}

/** No enviar una escritura restaurada si su identidad no pudo conservarse. */
export async function guardarCatalogoBackupStrict(
  tabla: 'productos' | 'categorias' | 'promociones', kioscoId: string, registroId: string,
  datos: Record<string, unknown>,
): Promise<void> {
  const { useAuthStore } = await import('../stores/authStore')
  const inicial = useAuthStore.getState().usuario
  function validarContexto(): void {
    const actual = useAuthStore.getState()
    if (!inicial?.id || !inicial.auth_user_id || !actual.usuario?.activo || actual.usuario.rol !== 'DUEÑO'
      || actual.usuario.id !== inicial.id || actual.usuario.auth_user_id !== inicial.auth_user_id
      || actual.usuario.kiosco_id !== kioscoId || actual.kiosco?.id !== kioscoId) {
      throw new Error('Se requiere la sesión original del Dueño para restaurar este catálogo.')
    }
  }
  validarContexto()
  const clave = `kioskopos_backup_catalogo_${JSON.stringify([kioscoId, tabla, registroId])}`
  const firma = JSON.stringify(datos)
  let operacion: SolicitudCatalogoBackup
  const almacenado = localStorage.getItem(clave)
  if (almacenado !== null) {
    let valor: unknown
    try { valor = JSON.parse(almacenado) } catch { throw new Error('La restauración pendiente está dañada; revisá su estado.') }
    if (!valor || typeof valor !== 'object' || !('id' in valor) || typeof valor.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor.id) || !('solicitud' in valor)
      || JSON.stringify(valor.solicitud) !== firma) {
      throw new Error('Hay una restauración pendiente con otros datos; recuperá la solicitud original.')
    }
    operacion = { id: valor.id, solicitud: datos }
  } else {
    operacion = { id: crypto.randomUUID(), solicitud: datos }
    localStorage.setItem(clave, JSON.stringify(operacion))
  }
  const { data, error } = tabla === 'productos'
    ? await supabase.rpc('guardar_producto_transaccional', {
      p_operacion_id: operacion.id, p_producto_id: registroId, p_datos: operacion.solicitud,
    })
    : tabla === 'categorias' ? await supabase.rpc('guardar_categoria_transaccional', {
      p_operacion_id: operacion.id, p_categoria_id: registroId, p_datos: operacion.solicitud,
    })
      : await supabase.rpc('guardar_promocion_transaccional', {
        p_operacion_id: operacion.id, p_promocion_id: registroId, p_datos: operacion.solicitud, p_eliminar: false,
      })
  if (error) throw new Error(error.message)
  validarContexto()
  const fila: unknown = tabla === 'productos' ? data?.producto : data
  if (!fila || typeof fila !== 'object' || !('id' in fila) || fila.id !== registroId
    || !('kiosco_id' in fila) || fila.kiosco_id !== kioscoId) {
    throw new Error('El servidor no confirmó el registro restaurado del comercio.')
  }
  localStorage.removeItem(clave)
}
