import { expect, it, vi } from 'vitest'
import { fiscalCreditUnitsFixture } from './fixtures/fiscalCreditUnits'
import { fiscalCreditUnitsWire, validateFiscalCreditUnits } from '../../supabase/functions/_shared/fiscalCreditUnits'
import { loadFiscalCreditUnits } from '../../supabase/functions/_shared/fiscalCreditDraftService'
import { validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp'
import { createFiscalClient } from '../lib/fiscalClient'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'

it('verifica canónico/hash, liga factura y receta y congela metadata sin conceder permisos', async () => {
  const f = await fiscalCreditUnitsFixture(), result = await validateFiscalCreditUnits(f.packet, f.source, f.commercial)
  expect(fiscalCreditUnitsWire(result)).toEqual(f.packet)
  expect(result.estado).toBe('CAPTURADAS')
  if (result.estado !== 'CAPTURADAS') throw new Error('Missing captured evidence')
  expect(result.unidades.datos).toEqual(f.data)
  expect(Object.isFrozen(result.unidades.datos.lineas[0].componentes[0])).toBe(true)
  expect(Object.isFrozen(result.unidades.datos.lineas)).toBe(true)
  expect(result.emision_habilitada || result.reintegro_habilitado || result.reposicion_habilitada).toBe(false)
})
it('ausencia debe ser explícita y no se confunde con error ni metadata inferida', async () => {
  const f = await fiscalCreditUnitsFixture(), missing = { ...f.packet, estado: 'NO_REGISTRADAS', unidades: null }
  expect(await validateFiscalCreditUnits(missing, f.source, f.commercial)).toEqual(missing)
  await expect(validateFiscalCreditUnits(null, f.source, f.commercial)).rejects.toThrow()
  await expect(validateFiscalCreditUnits({ ...missing, unidades: f.packet.unidades }, f.source, f.commercial)).rejects.toThrow()
})
it.each(['venta', 'operacion', 'hash', 'checksum', 'estado', 'flag', 'extra', 'digest', 'noCanonico', 'datosDerivados', 'tipo', 'producto', 'detalle', 'unidad', 'pesable', 'componente', 'duplicado', 'inconsistente', 'raiz'] as const)('rechaza evidencia alterada %s aunque se recalcule hash estructural', async reason => {
  const f = await fiscalCreditUnitsFixture(), line = f.data.lineas[0]
  let value: unknown = f.packet
  if (reason === 'venta') value = { ...f.packet, venta_id: crypto.randomUUID() }
  if (reason === 'operacion') value = { ...f.packet, operacion_origen_id: crypto.randomUUID() }
  if (reason === 'hash') value = { ...f.packet, solicitud_sha256: 'b'.repeat(64) }
  if (reason === 'checksum') value = { ...f.packet, checkout_sha256: 'b'.repeat(64) }
  if (reason === 'estado') value = { ...f.packet, estado: 'AUTORIZADA' }
  if (reason === 'flag') value = { ...f.packet, reintegro_habilitado: true }
  if (reason === 'extra') value = { ...f.packet, actor_auth_id: f.actor }
  if (reason === 'digest') value = { ...f.packet, unidades: { ...f.packet.unidades, sha256: 'b'.repeat(64) } }
  if (reason === 'noCanonico') value = { ...f.packet, unidades: { ...f.packet.unidades, canonico: JSON.stringify(f.data, null, 2) } }
  if (reason === 'datosDerivados') value = { ...f.packet, unidades: { ...f.packet.unidades, datos: f.data } }
  if (reason === 'tipo') value = await f.wrap({ ...f.data, lineas: [{ ...line, tipo: 'COMBO' }] })
  if (reason === 'producto') value = await f.wrap({ ...f.data, lineas: [{ ...line, producto_id: crypto.randomUUID() }] })
  if (reason === 'detalle') value = await f.wrap({ ...f.data, lineas: [{ ...line, detalle_id: crypto.randomUUID() }] })
  if (reason === 'unidad') value = await f.wrap({ ...f.data, lineas: [{ ...line, unidad_medida: 'LITROS' }] })
  if (reason === 'pesable') value = await f.wrap({ ...f.data, lineas: [{ ...line, es_pesable: 'false' }] })
  if (reason === 'componente') value = await f.wrap({ ...f.data, lineas: [{ ...line, componentes: [{ ...line.componentes[0], producto_id: crypto.randomUUID() }] }] })
  if (reason === 'duplicado') value = await f.wrap({ ...f.data, lineas: [{ ...line, componentes: [...line.componentes, ...line.componentes] }] })
  if (reason === 'inconsistente') value = await f.wrap({ ...f.data, lineas: [{ ...line, unidad_medida: 'KG' }] })
  if (reason === 'raiz') value = await f.wrap({ ...f.data, checkout_sha256: 'a'.repeat(64) })
  await expect(validateFiscalCreditUnits(value, f.source, f.commercial)).rejects.toThrow('FISCAL_UNIDADES_NC_NO_CONFIRMADAS')
})
it('combo pesable conserva fracción histórica sólo con cantidades físicas representables', async () => {
  const f = await fiscalCreditUnitsFixture(), physical = crypto.randomUUID()
  const source = await validateFiscalRepresentation({ ...f.wire, contexto: { ...f.wire.contexto, lineas: f.wire.contexto.lineas.map(line => ({ ...line, cantidad: '0.500' })) } }, f.sale, f.operation)
  const commercial = { ...f.commercial, lineas: [{ ...f.commercial.lineas[0], tipo: 'COMBO' as const, cantidad: '0.500', componentes: [{ producto_id: physical, cantidad: '2.000' }] }] }
  const line = { ...f.data.lineas[0], tipo: 'COMBO', es_pesable: true, unidad_medida: 'KG', componentes: [{ producto_id: physical, es_pesable: false, unidad_medida: 'UN' }] }
  const packet = await f.wrap({ ...f.data, lineas: [line] })
  expect((await validateFiscalCreditUnits(packet, source, commercial)).estado).toBe('CAPTURADAS')
  await expect(validateFiscalCreditUnits(await f.wrap({ ...f.data, lineas: [{ ...line, es_pesable: false }] }), source, commercial)).rejects.toThrow()
  await expect(validateFiscalCreditUnits(packet, source, { ...commercial, lineas: [{ ...commercial.lineas[0], componentes: [{ producto_id: physical, cantidad: '1.000' }] }] })).rejects.toThrow()
})
async function serviceFixture() {
  const f = await fiscalCreditUnitsFixture()
  const getUser = vi.fn<FiscalAuthClient['auth']['getUser']>(async () => ({ data: { user: { id: f.actor } }, error: null }))
  const rpc = vi.fn<FiscalAuthClient['rpc']>(async name => ({ data: name === 'cargar_representacion_fiscal_homologacion' ? f.wire : name === 'cargar_fuente_comercial_nc_homologacion' ? f.commercial : f.packet, error: null }))
  return { ...f, getUser, rpc, admin: { auth: { getUser }, rpc } }
}
it('captura Auth una vez para las tres RPC; error final no se transforma en ausencia ni reintento', async () => {
  const f = await serviceFixture()
  expect(fiscalCreditUnitsWire(await loadFiscalCreditUnits(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation))).toEqual(f.packet)
  expect(f.getUser).toHaveBeenCalledTimes(1)
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['cargar_representacion_fiscal_homologacion', 'cargar_fuente_comercial_nc_homologacion', 'cargar_unidades_nc_homologacion'])
  for (const [, args] of f.rpc.mock.calls) expect(args.p_actor_auth_id).toBe(f.actor)
  const base = f.rpc.getMockImplementation()!
  f.rpc.mockClear(); f.rpc.mockImplementation(async (name, args) => name === 'cargar_unidades_nc_homologacion' ? { data: null, error: { message: 'PRIVATE_SQL' } } : base(name, args))
  await expect(loadFiscalCreditUnits(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  expect(f.rpc).toHaveBeenCalledTimes(3)
})
it('HTTP consulta cerrada sin flag de escritura, custodia ni solicitudes ARCA', async () => {
  const f = await serviceFixture(), fetcher = vi.fn<typeof fetch>()
  const handler = createFiscalHttpHandler({ readSecret: key => key === 'SUPABASE_URL' ? 'https://acoyfwwmhaeruciyedri.supabase.co' : key === 'ARCA_HOMO_BACKEND_ENABLED' ? 'true' : undefined, createAdmin: () => f.admin, fetcher })
  const command = { accion: 'UNIDADES_NC', venta_id: f.sale, operacion_origen_id: f.operation }
  const request = (body: unknown) => new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion', { method: 'POST', headers: { origin: 'https://kiosco-app-staging.vercel.app', authorization: 'Bearer SYNTHETIC_JWT', 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const response = await handler(request(command)); expect(response.status).toBe(200); expect((await response.json()).resultado).toEqual(f.packet)
  f.getUser.mockClear()
  for (const invalid of [{ ...command, actor_auth_id: f.actor }, { ...command, datos: 'x'.repeat(2100) }, { ...command, venta_id: null }]) expect((await handler(request(invalid))).status).toBe(400)
  expect(f.getUser).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})
it('cliente captura argumentos antes de esperar y no lee ni escribe almacenamiento', async () => {
  const f = await fiscalCreditUnitsFixture(), source = structuredClone(f.source), commercial = structuredClone(f.commercial)
  let finish!: (value: unknown) => void
  const send = vi.fn(async () => new Promise<unknown>(resolve => { finish = resolve }))
  const getItem = vi.fn(() => null), setItem = vi.fn(), client = createFiscalClient(f.scope, { storage: { getItem, setItem }, send })
  const loading = client.credits.units(source, commercial)
  commercial.total = '1.00'
  finish({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado: f.packet })
  expect(fiscalCreditUnitsWire(await loading)).toEqual(f.packet)
  expect(getItem).not.toHaveBeenCalled(); expect(setItem).not.toHaveBeenCalled()
})
