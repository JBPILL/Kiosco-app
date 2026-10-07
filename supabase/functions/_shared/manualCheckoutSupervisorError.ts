/** Traducir sólo errores conocidos; nunca reenviar texto SQL al navegador. */
export function requiereRenovarPermisoManual(error: { code?: string; message?: string } | null): boolean {
  return error?.code === 'P0001' && ['Permiso no corresponde a la operación',
    'Permiso vencido o consumido', 'PIN modificado'].includes(error.message || '')
}
