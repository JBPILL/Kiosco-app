import { kioskoPilotStrictScopeActivo } from './kioskPilotScope'

// El bootstrap estricto no incluye las columnas del circuito fiscal.
// Conservarlas en instalaciones completas para sus comprobantes históricos.
export function camposFiscalesReporteVenta(): string {
  return kioskoPilotStrictScopeActivo()
    ? ''
    : 'afip_cae, afip_vto_cae, afip_tipo_comprobante, afip_nro_comprobante, afip_qr_url,'
}
