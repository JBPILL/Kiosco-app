export class SupervisorPinBloqueado extends Error {
  readonly reintentarEn: string
  constructor(reintentarEn: string) {
    super(`Esperá hasta las ${new Date(reintentarEn).toLocaleTimeString('es-AR')} para volver a ingresar el PIN.`)
    this.name = 'SupervisorPinBloqueado'
    this.reintentarEn = reintentarEn
  }
}

/** Sólo acepta el contrato público del bloqueo; nunca muestra errores arbitrarios. */
export async function leerBloqueoSupervisor(error: unknown): Promise<SupervisorPinBloqueado | null> {
  if (!error || typeof error !== 'object' || !('context' in error)) return null
  const respuesta: unknown = error.context
  if (!(respuesta instanceof Response) || respuesta.status !== 429) return null
  try {
    const texto = await respuesta.clone().text()
    if (texto.length > 2000) return null
    const valor: unknown = JSON.parse(texto)
    if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return null
    const datos = valor as Record<string, unknown>
    if (Object.keys(datos).length !== 2 || datos.estado !== 'BLOQUEADO'
      || typeof datos.reintentarEn !== 'string' || !Number.isFinite(Date.parse(datos.reintentarEn))) return null
    return new SupervisorPinBloqueado(new Date(datos.reintentarEn).toISOString())
  } catch { return null }
}
