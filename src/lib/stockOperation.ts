/** Conserva la identidad de una solicitud hasta confirmar también la actualización de la pantalla. */
export function prepararMovimientoStock(kioscoId: string | undefined, solicitud: Record<string, string | number | null>) {
  if (!kioscoId) throw new Error('No se pudo identificar el comercio del movimiento.')
  if (typeof solicitud.p_producto_id !== 'string' || !solicitud.p_producto_id) {
    throw new Error('No se pudo identificar el producto del movimiento.')
  }
  const clave = `kiosko_stock_pendiente_${JSON.stringify([kioscoId, solicitud.p_producto_id])}`
  const firma = JSON.stringify(Object.entries(solicitud).sort(([a], [b]) => a.localeCompare(b)))
  let almacenado: string | null
  try {
    almacenado = localStorage.getItem(clave)
  } catch {
    throw new Error('No se pudo leer el movimiento pendiente. No se envió una nueva operación.')
  }
  let id: string
  if (almacenado !== null) {
    let registro: unknown
    try { registro = JSON.parse(almacenado) } catch {
      throw new Error('El movimiento pendiente está dañado. Revisá su estado antes de enviar otro.')
    }
    if (typeof registro !== 'object' || registro === null || !('id' in registro) || !('firma' in registro) ||
      typeof registro.id !== 'string' || typeof registro.firma !== 'string' ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(registro.id)) {
      throw new Error('El movimiento pendiente está dañado. Revisá su estado antes de enviar otro.')
    }
    if (registro.firma !== firma) {
      throw new Error('Hay un movimiento pendiente para este producto. Reintentá la solicitud original antes de cambiar sus datos.')
    }
    id = registro.id
  } else {
    id = crypto.randomUUID()
    try { localStorage.setItem(clave, JSON.stringify({ id, firma, solicitud })) } catch {
      throw new Error('No se pudo guardar la identidad del movimiento. No se envió la operación.')
    }
    window.dispatchEvent(new Event('kiosko-stock-pendientes'))
  }
  const operacionId = id
  return {
    parametros: { ...solicitud, p_operacion_id: operacionId },
    confirmar: () => {
      try {
        const actual = localStorage.getItem(clave)
        if (actual !== null && JSON.parse(actual).id === operacionId) localStorage.removeItem(clave)
        window.dispatchEvent(new Event('kiosko-stock-pendientes'))
      } catch {
        throw new Error('El movimiento se aplicó, pero no se pudo cerrar su registro pendiente en este dispositivo.')
      }
    },
  }
}

export interface MovimientoStockPendiente {
  id: string
  productoId: string
  solicitud: Record<string, string | number | null>
}

export function listarMovimientosStockPendientes(kioscoId: string): MovimientoStockPendiente[] {
  const pendientes: MovimientoStockPendiente[] = []
  for (let i = 0; i < localStorage.length; i++) {
    const clave = localStorage.key(i)
    if (!clave?.startsWith('kiosko_stock_pendiente_')) continue
    const alcance: unknown = JSON.parse(clave.slice('kiosko_stock_pendiente_'.length))
    if (!Array.isArray(alcance) || alcance[0] !== kioscoId) continue
    const registro: unknown = JSON.parse(localStorage.getItem(clave) || 'null')
    if (typeof registro !== 'object' || registro === null || !('id' in registro) || !('solicitud' in registro) || !('firma' in registro) ||
      typeof registro.id !== 'string' || typeof registro.solicitud !== 'object' || registro.solicitud === null || Array.isArray(registro.solicitud)) {
      throw new Error('Hay un movimiento pendiente dañado. Revisá el registro antes de enviar otro.')
    }
    const solicitud = registro.solicitud as Record<string, unknown>
    if (solicitud.p_producto_id !== alcance[1] || typeof alcance[1] !== 'string' ||
      Object.values(solicitud).some((value) => value !== null && typeof value !== 'string' && typeof value !== 'number') ||
      registro.firma !== JSON.stringify(Object.entries(solicitud).sort(([a],[b]) => a.localeCompare(b)))) {
      throw new Error('Hay un movimiento pendiente dañado. Revisá el registro antes de enviar otro.')
    }
    pendientes.push({ id: registro.id, productoId: alcance[1], solicitud: solicitud as Record<string,string|number|null> })
  }
  return pendientes
}
