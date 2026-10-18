/** Optional modules stay off until their backend and hosted gates are installed. */
export function envasesTransaccionalesActivos(): boolean {
  return import.meta.env.VITE_KIOSKO_PILOT_STRICT_SCOPE === 'true'
    && import.meta.env.VITE_CHECKOUT_MANUAL_TRANSACCIONAL === 'true'
    && import.meta.env.VITE_KIOSKO_ENVASES_TRANSACCIONAL === 'true'
}
export function devolucionesEfectivoActivas(): boolean {
  return import.meta.env.VITE_KIOSKO_PILOT_STRICT_SCOPE === 'true'
    && import.meta.env.VITE_CHECKOUT_MANUAL_TRANSACCIONAL === 'true'
    && import.meta.env.VITE_KIOSKO_DEVOLUCIONES_EFECTIVO === 'true'
}
