import { expect, it, vi } from 'vitest'
import { fiscalCreditCommercialFixture } from './fixtures/fiscalCreditCommercial'
import { validateFiscalCreditCommercialSource } from '../../supabase/functions/_shared/fiscalCreditCommercialSource'
import { loadFiscalCreditCommercialSource } from '../../supabase/functions/_shared/fiscalCreditDraftService'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp'
import { createFiscalClient } from '../lib/fiscalClient'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
it('revalida fuente completa, sumas y receta; congela DTO sin inferir unidades o permisos', async () => {
  const f = await fiscalCreditCommercialFixture(), value = await validateFiscalCreditCommercialSource(f.commercial, f.source)
  expect(value).toEqual(f.commercial); expect(Object.isFrozen(value.lineas[0].componentes[0])).toBe(true)
  expect(Object.isFrozen(value.pagos)).toBe(true); expect(Object.isFrozen(value.lineas)).toBe(true)
  expect(value.unidades_historicas).toBe('NO_REGISTRADAS'); expect(value.reintegro_habilitado).toBe(false)
  f.commercial.lineas[0].cantidad = '1.000'; expect(value.lineas[0].cantidad).toBe('2.000')
})
it.each(['venta', 'operacion', 'hash', 'checksum', 'total', 'extra', 'flag', 'unidad', 'cantidad', 'subtotal', 'duplicado', 'receta', 'tipo', 'medio', 'sumaPagos', 'efectivo', 'pagoExtra', 'componenteExtra', 'desorden', 'fraccionCombo', 'coercion'] as const)('rechaza DTO comercial alterado %s', async reason => {
  const f = await fiscalCreditCommercialFixture(), line = f.commercial.lineas[0]
  let value: unknown = f.commercial
  if (reason === 'venta') value = { ...f.commercial, venta_id: crypto.randomUUID() }
  if (reason === 'operacion') value = { ...f.commercial, operacion_origen_id: crypto.randomUUID() }
  if (reason === 'hash') value = { ...f.commercial, solicitud_sha256: 'b'.repeat(64) }
  if (reason === 'checksum') value = { ...f.commercial, checkout_sha256: 'not-a-hash' }
  if (reason === 'total') value = { ...f.commercial, total: '1.00' }
  if (reason === 'extra') value = { ...f.commercial, referencia: 'PRIVATE_UNEXPECTED' }
  if (reason === 'flag') value = { ...f.commercial, emision_habilitada: true }
  if (reason === 'unidad') value = { ...f.commercial, unidades_historicas: 'UN' }
  if (reason === 'cantidad') value = { ...f.commercial, lineas: [{ ...line, cantidad: '2.001' }] }
  if (reason === 'subtotal') value = { ...f.commercial, lineas: [{ ...line, subtotal: 123.45 }] }
  if (reason === 'duplicado') value = { ...f.commercial, lineas: [line, line] }
  if (reason === 'receta') value = { ...f.commercial, lineas: [{ ...line, componentes: [{ producto_id: crypto.randomUUID(), cantidad: '1.000' }] }] }
  if (reason === 'tipo') value = { ...f.commercial, lineas: [{ ...line, tipo: 'LIBRE' }] }
  if (reason === 'medio') value = { ...f.commercial, pagos: [{ medio: 'OTRO', importe: '123.45' }] }
  if (reason === 'sumaPagos') value = { ...f.commercial, pagos: [{ medio: 'EFECTIVO', importe: '123.46' }] }
  if (reason === 'efectivo') value = { ...f.commercial, pago_integro_efectivo: false }
  if (reason === 'pagoExtra') value = { ...f.commercial, pagos: [{ ...f.commercial.pagos[0], referencia: 'UNEXPECTED' }] }
  if (reason === 'componenteExtra') value = { ...f.commercial, lineas: [{ ...line, componentes: [{ ...line.componentes[0], costo: 1 }] }] }
  if (reason === 'desorden') value = { ...f.commercial, lineas: [{ ...line, tipo: 'COMBO', componentes: [line.componentes[0], line.componentes[0]] }] }
  if (reason === 'fraccionCombo') value = { ...f.commercial, lineas: [{ ...line, tipo: 'COMBO', cantidad: '1.500' }] }
  if (reason === 'coercion') value = { ...f.commercial, lineas: [{ ...line, tipo: ['PRODUCTO'] }] }
  await expect(validateFiscalCreditCommercialSource(value, f.source)).rejects.toThrow('FISCAL_FUENTE_COMERCIAL_NC_NO_CONFIRMADA')
})
it('admite medios mixtos, combo y libre como hechos históricos sin habilitar reintegros', async () => {
  const f = await fiscalCreditCommercialFixture(), line = f.commercial.lineas[0]
  const mixed = { ...f.commercial, pago_integro_efectivo: false, pagos: [{ medio: 'EFECTIVO', importe: '100.00' }, { medio: 'TARJETA', importe: '23.45' }] }
  expect((await validateFiscalCreditCommercialSource(mixed, f.source)).pago_integro_efectivo).toBe(false)
  for (const tipo of ['COMBO', 'LIBRE']) {
    const result = await validateFiscalCreditCommercialSource({ ...mixed, lineas: [{ ...line, tipo, componentes: tipo === 'LIBRE' ? [] : line.componentes }] }, f.source)
    expect(result.lineas[0].tipo).toBe(tipo); expect(result.reposicion_habilitada).toBe(false)
  }
})
async function serviceFixture() {
  const f = await fiscalCreditCommercialFixture()
  const getUser = vi.fn<FiscalAuthClient['auth']['getUser']>(async () => ({ data: { user: { id: f.actor } }, error: null }))
  const rpc = vi.fn<FiscalAuthClient['rpc']>(async name => ({ data: name === 'cargar_representacion_fiscal_homologacion' ? f.wire : f.commercial, error: null }))
  return { ...f, getUser, rpc, admin: { auth: { getUser }, rpc } }
}
it('servicio verifica Auth una vez y transmite el mismo actor a ambas RPC', async () => {
  const f = await serviceFixture()
  expect(await loadFiscalCreditCommercialSource(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation)).toEqual(f.commercial)
  expect(f.getUser).toHaveBeenCalledTimes(1)
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['cargar_representacion_fiscal_homologacion', 'cargar_fuente_comercial_nc_homologacion'])
  for (const [, args] of f.rpc.mock.calls) expect(args.p_actor_auth_id).toBe(f.actor)
})
it('errores de Auth/RPC o DTO alterado fallan saneados sin repetir consultas', async () => {
  const f = await serviceFixture()
  f.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'PRIVATE_AUTH' } })
  await expect(loadFiscalCreditCommercialSource(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA'); expect(f.rpc).not.toHaveBeenCalled()
  f.rpc.mockRejectedValueOnce(new Error('PRIVATE_RPC'))
  await expect(loadFiscalCreditCommercialSource(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  f.rpc.mockImplementation(async name => ({ data: name === 'cargar_representacion_fiscal_homologacion' ? f.wire : { ...f.commercial, reintegro_habilitado: true }, error: null }))
  await expect(loadFiscalCreditCommercialSource(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
})
it('HTTP sólo permite consulta cerrada, sin flag de escritura, ni llamadas fiscales', async () => {
  const f = await serviceFixture(), fetcher = vi.fn<typeof fetch>()
  const handler = createFiscalHttpHandler({ readSecret: key => key === 'SUPABASE_URL' ? 'https://acoyfwwmhaeruciyedri.supabase.co' : key === 'ARCA_HOMO_BACKEND_ENABLED' ? 'true' : undefined, createAdmin: () => f.admin, fetcher })
  const request = (body: unknown) => new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion', { method: 'POST', headers: { origin: 'https://kiosco-app-staging.vercel.app', authorization: 'Bearer SYNTHETIC_JWT', 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const command = { accion: 'FUENTE_COMERCIAL_NC', venta_id: f.sale, operacion_origen_id: f.operation }
  const response = await handler(request(command)); expect(response.status).toBe(200); expect((await response.json()).resultado).toEqual(f.commercial)
  f.getUser.mockClear()
  for (const invalid of [{ ...command, actor_auth_id: f.actor }, { ...command, operacion_origen_id: null }, { ...command, datos: 'x'.repeat(2100) }]) expect((await handler(request(invalid))).status).toBe(400)
  expect(f.getUser).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})
it('cliente valida misma factura y deja storage intacto incluso ante error o respuesta ajena', async () => {
  const f = await fiscalCreditCommercialFixture(), setItem = vi.fn(), getItem = vi.fn(() => null)
  const send = vi.fn(async () => ({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado: f.commercial }))
  const client = createFiscalClient(f.scope, { storage: { getItem, setItem }, send })
  expect(await client.credits.commercialSource(f.source)).toEqual(f.commercial)
  expect(send.mock.calls).toHaveLength(1); expect(getItem).not.toHaveBeenCalled(); expect(setItem).not.toHaveBeenCalled()
  send.mockResolvedValueOnce({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado: { ...f.commercial, venta_id: crypto.randomUUID() } })
  await expect(client.credits.commercialSource(f.source)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
  send.mockRejectedValueOnce(new Error('PRIVATE_NETWORK'))
  await expect(client.credits.commercialSource(f.source)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO'); expect(setItem).not.toHaveBeenCalled()
})
it('captura fuente y entrada antes de esperar; no valida datos mutados durante la consulta', async () => {
  const f = await fiscalCreditCommercialFixture()
  const validating = validateFiscalCreditCommercialSource(f.commercial, f.source)
  f.commercial.total = '1.00'; expect((await validating).total).toBe('123.45'); f.commercial.total = '123.45'
  const original = { ...f.source, contexto: { ...f.source.contexto, lineas: f.source.contexto.lineas.map(line => ({ ...line })) } }
  let finish!: (value: unknown) => void
  const send = vi.fn(async () => new Promise<unknown>(resolve => { finish = resolve }))
  const setItem = vi.fn(), client = createFiscalClient(f.scope, { storage: { getItem: () => null, setItem }, send })
  const loading = client.credits.commercialSource(original); original.contexto.lineas[0].cantidad = '1.000'
  finish({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado: f.commercial })
  expect((await loading).lineas[0].cantidad).toBe('2.000'); expect(setItem).not.toHaveBeenCalled()
})
it('fracción histórica no acredita pesable; no permite convertirla en libre o combo entero', async () => {
  const f = await fiscalCreditCommercialFixture()
  const source = await validateFiscalRepresentation({ ...f.wire, contexto: { ...f.wire.contexto, lineas: f.wire.contexto.lineas.map(line => ({ ...line, cantidad: '1.500' })) } }, f.sale, f.operation)
  const line = { ...f.commercial.lineas[0], cantidad: '1.500' }, value = { ...f.commercial, lineas: [line] }
  expect((await validateFiscalCreditCommercialSource(value, source)).lineas[0].cantidad).toBe('1.500')
  expect((await validateFiscalCreditCommercialSource(value, source)).unidades_historicas).toBe('NO_REGISTRADAS')
  for (const tipo of ['COMBO', 'LIBRE']) await expect(validateFiscalCreditCommercialSource({ ...value, lineas: [{ ...line, tipo, componentes: tipo === 'LIBRE' ? [] : line.componentes }] }, source)).rejects.toThrow('FISCAL_FUENTE_COMERCIAL_NC_NO_CONFIRMADA')
})
