/** Optional modules stay off until their backend and hosted gates are installed. */
export function revisionFiscalHomologacionActiva(): boolean {
  return import.meta.env.VITE_KIOSKO_PILOT_STRICT_SCOPE === 'true'
    && import.meta.env.VITE_KIOSKO_ARCA_REVISION_HOMO === 'true'
}
export function casosNotasCreditoHomologacionActivos(): boolean {
  return revisionFiscalHomologacionActiva()
    && import.meta.env.VITE_KIOSKO_ARCA_CASOS_NC_HOMO === 'true'
}
export function aplicacionNotasCreditoHomologacionActiva(): boolean {
  return casosNotasCreditoHomologacionActivos()
    && import.meta.env.VITE_KIOSKO_ARCA_APLICACION_NC_HOMO === 'true'
}
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

/** Independent front-end gates; neither grants private emission/query authority. */
export function envioNotasCreditoHomologacionActivo(): boolean {
  return casosNotasCreditoHomologacionActivos() && import.meta.env.VITE_KIOSKO_ARCA_ENVIO_NC_HOMO === 'true'
}
export function conciliacionNotasCreditoHomologacionActiva(): boolean {
  return casosNotasCreditoHomologacionActivos() && import.meta.env.VITE_KIOSKO_ARCA_CONCILIACION_NC_HOMO === 'true'
}
