import { afterEach, expect, it, vi } from 'vitest'
import { camposFiscalesReporteVenta } from './salesReportProjection'

afterEach(() => vi.unstubAllEnvs())

it('omite columnas fiscales sólo en el piloto estricto', () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  expect(camposFiscalesReporteVenta()).toBe('')
})

it('preserva todos los campos fiscales de instalaciones completas', () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
  expect(camposFiscalesReporteVenta()).toBe('afip_cae, afip_vto_cae, afip_tipo_comprobante, afip_nro_comprobante, afip_qr_url,')
})
