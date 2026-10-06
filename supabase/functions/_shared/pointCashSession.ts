/** La caja se resuelve en el servidor y se congela antes de iniciar el cobro. */
export function resolverSesionCajaPoint(value: unknown, kioscoId: string, usuarioId: string): string {
  if (!Array.isArray(value) || value.length !== 1) throw new Error('Se requiere una única caja abierta')
  const fila: unknown = value[0]
  if (!fila || typeof fila !== 'object' || Array.isArray(fila)) throw new Error('Caja inválida')
  const sesion = fila as Record<string, unknown>
  if (typeof sesion.id !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(sesion.id)
    || sesion.kiosco_id !== kioscoId || sesion.usuario_id !== usuarioId || sesion.estado !== 'ABIERTA') {
    throw new Error('La caja no pertenece al usuario y comercio activos')
  }
  return sesion.id.toLowerCase()
}
