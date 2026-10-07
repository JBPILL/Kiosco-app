export interface PermisoSupervisorManual {
  autorizacionId: string
  venceEn: string
}

/** Validación de transporte; sólo el servidor decide vigencia y autorización. */
export function leerPermisoSupervisorManual(value: unknown): PermisoSupervisorManual {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Permiso de supervisor inválido')
  const datos = value as Record<string, unknown>
  if (Object.keys(datos).length !== 2 || typeof datos.autorizacionId !== 'string'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(datos.autorizacionId)
    || typeof datos.venceEn !== 'string' || !Number.isFinite(Date.parse(datos.venceEn))) {
    throw new Error('Permiso de supervisor inválido')
  }
  return { autorizacionId: datos.autorizacionId.toLowerCase(), venceEn: new Date(datos.venceEn).toISOString() }
}
