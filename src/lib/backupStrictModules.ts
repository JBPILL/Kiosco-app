import { supabase } from './supabase'

export type TablaModuloBackup = 'clientes' | 'proveedores' | 'productos' | 'lotes_producto'
export interface ConfirmacionModuloBackup {
  registro: Record<string, unknown>
  creado?: boolean
  saldo_conservado?: boolean
}

async function contextoDueno(kioscoId: string): Promise<() => void> {
  const { useAuthStore } = await import('../stores/authStore')
  const original = useAuthStore.getState().usuario
  const comprobar = () => {
    const { usuario, kiosco } = useAuthStore.getState()
    if (!original?.id || !original.auth_user_id || !usuario?.activo || usuario.rol !== 'DUEÑO'
      || usuario.id !== original.id || usuario.auth_user_id !== original.auth_user_id
      || usuario.kiosco_id !== kioscoId || kiosco?.id !== kioscoId) {
      throw new Error('Se requiere la sesión original del Dueño para restaurar estos módulos.')
    }
  }
  comprobar()
  return comprobar
}

/** Antes de la primera escritura: no empezar una restauración con SQL incompleto. */
export async function comprobarModulosBackupStrict(kioscoId: string): Promise<void> {
  const comprobar = await contextoDueno(kioscoId)
  const { data, error } = await supabase.rpc('capacidades_restauracion_backup', { p_kiosco_id: kioscoId })
  comprobar()
  if (error || !data || data.version !== 1 || data.kiosco_id !== kioscoId || !Array.isArray(data.modulos)
    || !['contactos', 'producto_proveedor', 'lotes'].every(nombre => data.modulos.includes(nombre))) {
    throw new Error('El servidor aún no tiene todos los módulos de restauración habilitados. No se escribió ningún dato.')
  }
}

/** El pendiente conserva operación y huella; no guarda contactos o saldos en localStorage. */
export async function guardarModuloBackupStrict(
  tabla: TablaModuloBackup, kioscoId: string, id: string, datos: Record<string, unknown>,
): Promise<ConfirmacionModuloBackup> {
  const comprobar = await contextoDueno(kioscoId)
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(datos)))
  const firma = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('')
  comprobar()
  const clave = `kioskopos_backup_modulo_${JSON.stringify([kioscoId, tabla, id])}`
  const guardado = localStorage.getItem(clave)
  let operacionId: string
  if (guardado !== null) {
    let valor: unknown
    try { valor = JSON.parse(guardado) } catch { throw new Error('La restauración pendiente está dañada; revisá su estado.') }
    if (!valor || typeof valor !== 'object' || !('id' in valor) || typeof valor.id !== 'string'
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(valor.id)
      || !('firma' in valor) || valor.firma !== firma) {
      throw new Error('Hay una restauración pendiente con otros datos; recuperá la solicitud original.')
    }
    operacionId = valor.id
  } else {
    operacionId = crypto.randomUUID()
    localStorage.setItem(clave, JSON.stringify({ id: operacionId, firma }))
  }
  const base = { p_operacion_id: operacionId, p_kiosco_id: kioscoId, p_datos: datos }
  const { data, error } = tabla === 'productos'
    ? await supabase.rpc('restaurar_producto_backup', { ...base, p_producto_id: id })
    : tabla === 'lotes_producto'
      ? await supabase.rpc('restaurar_lote_backup', { ...base, p_lote_id: id })
      : await supabase.rpc('restaurar_contacto_backup', { ...base, p_registro_id: id, p_tabla: tabla })
  if (error) throw new Error(error.message)
  comprobar()
  const registro: unknown = tabla === 'productos' ? data?.producto : data?.registro
  if (!registro || typeof registro !== 'object' || Array.isArray(registro)
    || !('id' in registro) || registro.id !== id || !('kiosco_id' in registro) || registro.kiosco_id !== kioscoId
    || (tabla !== 'productos' && (data?.id !== id || data?.kiosco_id !== kioscoId))) {
    throw new Error('El servidor no confirmó el registro restaurado del comercio.')
  }
  if ((tabla === 'clientes' || tabla === 'proveedores')
    && (typeof data.creado !== 'boolean' || data.saldo_conservado !== !data.creado)) {
    throw new Error('El servidor no confirmó la conservación del saldo del contacto.')
  }
  if (tabla === 'clientes' || tabla === 'proveedores') {
    const saldo = (registro as Record<string, unknown>)[tabla === 'clientes' ? 'saldo_deudor' : 'saldo_pendiente']
    if (typeof saldo !== 'number' || !Number.isFinite(saldo) || saldo < 0 || Number(saldo.toFixed(2)) !== saldo) {
      throw new Error('El servidor no confirmó el saldo del contacto.')
    }
  }
  if (tabla === 'productos' && Array.isArray(datos.lotes_backup)) {
    const esperados = new Set(datos.lotes_backup.map((valor: unknown) => valor && typeof valor === 'object' && 'id' in valor ? valor.id : null))
    const recibidos = new Set<string>()
    if (!Array.isArray(data.lotes) || data.lotes.length !== esperados.size || esperados.has(null)
      || !data.lotes.every((valor: unknown) => {
        if (!valor || typeof valor !== 'object' || !('id' in valor) || typeof valor.id !== 'string'
          || !esperados.has(valor.id) || recibidos.has(valor.id) || !('kiosco_id' in valor) || valor.kiosco_id !== kioscoId
          || !('producto_id' in valor) || valor.producto_id !== id) return false
        recibidos.add(valor.id)
        return true
      })) throw new Error('El servidor no confirmó los lotes junto con el producto restaurado.')
  }
  localStorage.removeItem(clave)
  return { registro: registro as Record<string, unknown>,
    ...(tabla === 'clientes' || tabla === 'proveedores' ? { creado: data.creado, saldo_conservado: data.saldo_conservado } : {}) }
}

/** Rechazar datos sin soporte antes de restaurar categorías u otros registros. */
export function datosContactoBackup(tabla: 'clientes' | 'proveedores', valor: unknown): Record<string, unknown> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Contacto de respaldo inválido.')
  const fila = valor as Record<string, unknown>
  if (typeof fila.nombre !== 'string' || !fila.nombre.trim() || fila.nombre.trim().length > 180) throw new Error('Nombre de contacto inválido.')
  const datos: Record<string, unknown> = { nombre: fila.nombre.trim() }
  const textos = tabla === 'clientes' ? ['telefono', 'dni_cuit', 'direccion', 'email', 'notas']
    : ['contacto_nombre', 'telefono', 'email', 'cuit', 'dias_visita', 'cbu_alias']
  for (const campo of textos) {
    const contenido = fila[campo] ?? null
    if (contenido !== null && (typeof contenido !== 'string' || contenido.length > 2000)) throw new Error('Texto de contacto inválido.')
    datos[campo] = contenido
  }
  for (const campo of tabla === 'clientes' ? ['limite_credito', 'saldo_deudor'] : ['saldo_pendiente']) {
    const contenido = fila[campo] === undefined ? 0 : fila[campo]
    if (typeof contenido !== 'number' || !Number.isFinite(contenido) || contenido < 0 || contenido > 9999999999.99
      || Number(contenido.toFixed(2)) !== contenido) throw new Error('Importe de contacto inválido.')
    datos[campo] = contenido
  }
  if (fila.activo !== undefined && typeof fila.activo !== 'boolean') throw new Error('Estado de contacto inválido.')
  datos.activo = fila.activo ?? true
  if (tabla === 'clientes' && fila.puntos_fidelidad !== undefined && fila.puntos_fidelidad !== 0) {
    throw new Error('Esta copia contiene puntos de fidelidad sin contrato de restauración.')
  }
  return datos
}

export function prepararLotesBackupStrict(lotes: readonly unknown[], productos: readonly unknown[]): Record<string, unknown>[] {
  const catalogo = new Map<string, Record<string, unknown>>()
  for (const valor of productos) {
    if (valor && typeof valor === 'object' && !Array.isArray(valor) && 'id' in valor && typeof valor.id === 'string') {
      catalogo.set(valor.id, valor as Record<string, unknown>)
    }
  }
  const cantidades = new Map<string, number>()
  return lotes.map(valor => {
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) throw new Error('Lote de respaldo inválido.')
    const fila = valor as Record<string, unknown>
    const producto = typeof fila.producto_id === 'string' ? catalogo.get(fila.producto_id) : undefined
    if (!producto || producto.es_combo === true) throw new Error('Producto de lote ausente o virtual.')
    for (const campo of ['cantidad_inicial', 'cantidad_actual']) {
      const cantidad = fila[campo]
      if (typeof cantidad !== 'number' || !Number.isFinite(cantidad) || cantidad < 0 || cantidad > 999999999.999
        || Number(cantidad.toFixed(3)) !== cantidad || (producto.es_pesable !== true && !Number.isInteger(cantidad))) {
        throw new Error('Cantidad de lote inválida.')
      }
    }
    if ((fila.cantidad_actual as number) > (fila.cantidad_inicial as number)) throw new Error('El lote supera su cantidad inicial.')
    if (typeof fila.fecha_vencimiento !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fila.fecha_vencimiento)
      || !Number.isFinite(Date.parse(fila.fecha_vencimiento))
      || new Date(fila.fecha_vencimiento).toISOString().slice(0, 10) !== fila.fecha_vencimiento) throw new Error('Vencimiento de lote inválido.')
    if (fila.fecha_ingreso !== undefined && (typeof fila.fecha_ingreso !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/.test(fila.fecha_ingreso)
      || !Number.isFinite(Date.parse(fila.fecha_ingreso)))) throw new Error('Ingreso de lote inválido.')
    if (fila.activo !== undefined && typeof fila.activo !== 'boolean') throw new Error('Estado de lote inválido.')
    if (fila.numero_lote !== undefined && fila.numero_lote !== null
      && (typeof fila.numero_lote !== 'string' || fila.numero_lote.length > 180)) throw new Error('Número de lote inválido.')
    const id = fila.producto_id as string
    const total = (cantidades.get(id) ?? 0) + (fila.activo === false ? 0 : fila.cantidad_actual as number)
    if (typeof producto.stock_actual !== 'number' || !Number.isFinite(producto.stock_actual)
      || Number(total.toFixed(3)) > producto.stock_actual) throw new Error('Los lotes superan el stock físico del respaldo.')
    cantidades.set(id, total)
    return { producto_id: id, numero_lote: fila.numero_lote ?? null, fecha_vencimiento: fila.fecha_vencimiento,
      cantidad_inicial: fila.cantidad_inicial, cantidad_actual: fila.cantidad_actual, activo: fila.activo ?? true,
      ...(fila.fecha_ingreso === undefined ? {} : { fecha_ingreso: fila.fecha_ingreso }) }
  })
}
