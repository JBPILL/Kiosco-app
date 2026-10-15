import { v4 as uuidv4 } from 'uuid'

interface OperacionPendiente {
  fingerprint: string
  id: string
  solicitud?: unknown
}

export function obtenerOperacionPersistida<T>(scope: string, identidad: unknown, solicitud: T): { id: string; solicitud: T } {
  const fingerprint = JSON.stringify(identidad)
  const pendientes = leer(scope)
  const existente = pendientes.find(item => item.fingerprint === fingerprint)
  if (existente) return { id: existente.id, solicitud: (existente.solicitud ?? solicitud) as T }
  const id = uuidv4()
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`kioskopos_operaciones_${scope}`, JSON.stringify([
        ...pendientes.slice(-19), { fingerprint, id, solicitud },
      ]))
    } catch {
      // El RPC conserva idempotencia mientras se reintenta esta operación.
    }
  }
  return { id, solicitud }
}

export function confirmarOperacionPersistida(scope: string, identidad: unknown): void {
  if (typeof window === 'undefined') return
  try {
    const fingerprint = JSON.stringify(identidad)
    const pendientes = leer(scope).filter(item => item.fingerprint !== fingerprint)
    if (pendientes.length) localStorage.setItem(`kioskopos_operaciones_${scope}`, JSON.stringify(pendientes))
    else localStorage.removeItem(`kioskopos_operaciones_${scope}`)
  } catch {
    // Un ID pendiente obsoleto es seguro porque el servidor devuelve el resultado original.
  }
}

function leer(scope: string): OperacionPendiente[] {
  if (typeof window === 'undefined') return []
  try {
    const value: unknown = JSON.parse(localStorage.getItem(`kioskopos_operaciones_${scope}`) || '[]')
    return Array.isArray(value) ? value.filter((item): item is OperacionPendiente =>
      !!item && typeof item === 'object' && 'fingerprint' in item && typeof item.fingerprint === 'string'
      && 'id' in item && typeof item.id === 'string') : []
  } catch {
    return []
  }
}

export function obtenerIdOperacionPendiente(scope: string, solicitud: unknown): string {
  const fingerprint = JSON.stringify(solicitud)
  const pendientes = leer(scope)
  const existente = pendientes.find(item => item.fingerprint === fingerprint)
  if (existente) return existente.id
  const id = uuidv4()
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem(`kioskopos_operaciones_${scope}`, JSON.stringify([
        ...pendientes.slice(-19), { fingerprint, id },
      ]))
    } catch {
      // The RPC still has operation-level idempotency for the lifetime of this request.
    }
  }
  return id
}

export function confirmarOperacionPendiente(scope: string, solicitud: unknown): void {
  if (typeof window === 'undefined') return
  try {
    const fingerprint = JSON.stringify(solicitud)
    const pendientes = leer(scope).filter(item => item.fingerprint !== fingerprint)
    if (pendientes.length) localStorage.setItem(`kioskopos_operaciones_${scope}`, JSON.stringify(pendientes))
    else localStorage.removeItem(`kioskopos_operaciones_${scope}`)
  } catch {
    // A stale id is safe: the server returns the same successful result on retry.
  }
}
