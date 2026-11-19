import { expect, it, vi } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { loadFiscalCreditPreparation, saveFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditDraftService'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp'

async function fixture() {
  const f = await fiscalCreditContextFixture(), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const preparation = await prepareFiscalCreditPreparation(f.source, f.proposal, context, { servicioDesde: null, servicioHasta: null, vencimientoPago: null })
  const packet = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, estado: 'DATOS_NC_PREPARADOS',
    preparacion: { canonico: preparation.canonico, sha256: preparation.sha256 }, contexto: context,
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  const getUser = vi.fn<FiscalAuthClient['auth']['getUser']>(async () => ({ data: { user: { id: f.actor } }, error: null }))
  const rpc = vi.fn<FiscalAuthClient['rpc']>(async name => ({ data: name === 'cargar_representacion_fiscal_homologacion' ? f.wire : packet, error: null }))
  return { ...f, preparation, packet, getUser, rpc, admin: { auth: { getUser }, rpc }, scope: { saleId: f.sale, operationId: f.operation, requestId: f.input.solicitud_id, sha256: f.proposal.sha256 } }
}
const periods = { servicioDesde: null, servicioHasta: null, vencimientoPago: null }
function request(body: unknown, authorization = 'Bearer SYNTHETIC_JWT') {
  return new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion', { method: 'POST', headers: {
    origin: 'https://kiosco-app-staging.vercel.app', authorization, 'content-type': 'application/json',
  }, body: typeof body === 'string' ? body : JSON.stringify(body) })
}
it('HTTP permite recuperar con escritura apagada, bloquea guardar antes de crear admin', async () => {
  const f = await fixture(), createAdmin = vi.fn(() => f.admin), fetcher = vi.fn<typeof fetch>()
  const handler = createFiscalHttpHandler({ readSecret: key => key === 'SUPABASE_URL' ? 'https://acoyfwwmhaeruciyedri.supabase.co' : key === 'ARCA_HOMO_BACKEND_ENABLED' ? 'true' : undefined, createAdmin, fetcher })
  const command = { accion: 'PREPARACION_NC', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.scope.requestId, propuesta_sha256: f.scope.sha256 }
  const response = await handler(request(command)); expect(response.status).toBe(200)
  expect((await response.json()).resultado.estado).toBe('DATOS_NC_PREPARADOS')
  createAdmin.mockClear(); f.getUser.mockClear()
  expect((await handler(request({ ...command, accion: 'GUARDAR_PREPARACION_NC', contexto_sha256: f.preparation.datos.contexto_sha256, entrada: periods }))).status).toBe(503)
  expect(createAdmin).not.toHaveBeenCalled(); expect(f.getUser).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})
it('HTTP guardado habilitado conserva recuperación y rechaza entradas extra, coerción, duplicados y tamaño', async () => {
  const f = await fixture(), fetcher = vi.fn<typeof fetch>()
  const handler = createFiscalHttpHandler({ readSecret: key => key === 'SUPABASE_URL' ? 'https://acoyfwwmhaeruciyedri.supabase.co' : ['ARCA_HOMO_BACKEND_ENABLED', 'ARCA_HOMO_CREDIT_PREPARATION_ENABLED'].includes(key) ? 'true' : undefined, createAdmin: () => f.admin, fetcher })
  const command = { accion: 'GUARDAR_PREPARACION_NC', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.scope.requestId, propuesta_sha256: f.scope.sha256, contexto_sha256: f.preparation.datos.contexto_sha256, entrada: periods }
  expect((await handler(request(command))).status).toBe(200)
  f.getUser.mockClear(); f.rpc.mockClear()
  for (const invalid of [{ ...command, actor_auth_id: f.actor }, { ...command, contexto_sha256: 1 }, { ...command, entrada: { ...periods, extra: true } },
    { ...command, entrada: { ...periods, servicioDesde: 20261001 } }, { ...command, entrada: {} }, JSON.stringify(command) + ' '.repeat(2100),
    '{"accion":"PREPARACION_NC","accion":"PREPARACION_NC"}']) expect((await handler(request(invalid))).status).toBe(400)
  expect((await handler(request(command, ''))).status).toBe(401)
  expect(f.getUser).not.toHaveBeenCalled(); expect(f.rpc).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})
it('contexto cambió o entrada inválida impiden escribir tras ausencia confirmada', async () => {
  const f = await fixture(), base = f.rpc.getMockImplementation()!
  f.rpc.mockImplementation(async (name, args) => {
    if (name === 'cargar_preparacion_nc_homologacion') return { data: null, error: null }
    if (name === 'cargar_fuente_contexto_nc_homologacion') return { data: { contexto: f.packet.contexto, propuesta: f.packet.propuesta }, error: null }
    return base(name, args)
  })
  for (const [hash, input] of [['a'.repeat(64), periods], [f.preparation.datos.contexto_sha256, { ...periods, extra: true }]] as const) {
    await expect(saveFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope, hash, input)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  }
  expect(f.rpc.mock.calls.some(([name]) => name.startsWith('guardar'))).toBe(false)
})
it('captura períodos y scope antes de esperar Auth para recuperar', async () => {
  const f = await fixture(), entry = { ...periods }; let finish!: (value: Awaited<ReturnType<FiscalAuthClient['auth']['getUser']>>) => void
  f.getUser.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const pending = saveFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope, f.preparation.datos.contexto_sha256, entry)
  f.scope.requestId = crypto.randomUUID(); Object.assign(entry, { servicioDesde: '20261001' })
  finish({ data: { user: { id: f.actor } }, error: null })
  expect((await pending).estado).toBe('DATOS_NC_PREPARADOS')
})
it.each(['DATOS_NC_PREPARADOS', 'CANCELADA'])('guardar recupera primero %s sin catálogo ni nueva escritura', async estado => {
  const f = await fixture(); f.packet.estado = estado
  expect((await saveFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope, f.preparation.datos.contexto_sha256, periods)).estado).toBe(estado)
  expect(f.getUser).toHaveBeenCalledTimes(1); expect(f.rpc).toHaveBeenCalledTimes(2)
})
it.each(['ok', 'ackPerdido', 'errorRPC'])('guardado %s consulta durable y no repite escritura', async mode => {
  const f = await fixture(); let saved = false
  f.rpc.mockImplementation(async name => {
    if (name === 'cargar_representacion_fiscal_homologacion') return { data: f.wire, error: null }
    if (name === 'cargar_preparacion_nc_homologacion') return { data: saved ? f.packet : null, error: null }
    if (name === 'cargar_fuente_contexto_nc_homologacion') return { data: { contexto: f.packet.contexto, propuesta: f.packet.propuesta }, error: null }
    if (name === 'guardar_preparacion_nc_homologacion') {
      saved = true
      if (mode === 'ackPerdido') throw new Error('PRIVATE_ACK')
      return { data: { ignored: true }, error: mode === 'errorRPC' ? { message: 'PRIVATE_RPC' } : null }
    }
    throw new Error('UNEXPECTED_RPC')
  })
  expect((await saveFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope, f.preparation.datos.contexto_sha256, periods)).preparacion.sha256).toBe(f.preparation.sha256)
  expect(f.getUser).toHaveBeenCalledTimes(1)
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['cargar_representacion_fiscal_homologacion', 'cargar_preparacion_nc_homologacion', 'cargar_fuente_contexto_nc_homologacion', 'guardar_preparacion_nc_homologacion', 'cargar_preparacion_nc_homologacion'])
  for (const [, args] of f.rpc.mock.calls) expect(args.p_actor_auth_id).toBe(f.actor)
})
it('rechaza cambiar períodos/contexto de una preparación existente sin escribir', async () => {
  const f = await fixture()
  for (const [hash, input] of [[f.preparation.datos.contexto_sha256, { ...periods, servicioDesde: '20261001' }], ['a'.repeat(64), periods]] as const) {
    await expect(saveFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope, hash, input)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  }
  expect(f.rpc.mock.calls.some(([name]) => name.startsWith('guardar'))).toBe(false)
})
it('no escribe si la recuperación previa falla; no confirma ausencia posterior a escribir', async () => {
  const f = await fixture(), base = f.rpc.getMockImplementation()!
  f.rpc.mockImplementation(async (name, args) => name === 'cargar_preparacion_nc_homologacion' ? { data: null, error: { message: 'PRIVATE_READ' } } : base(name, args))
  await expect(saveFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope, f.preparation.datos.contexto_sha256, periods)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  expect(f.rpc.mock.calls.some(([name]) => name.startsWith('guardar'))).toBe(false)
  f.rpc.mockClear()
  f.rpc.mockImplementation(async (name, args) => {
    if (name === 'cargar_preparacion_nc_homologacion' || name === 'guardar_preparacion_nc_homologacion') return { data: null, error: null }
    if (name === 'cargar_fuente_contexto_nc_homologacion') return { data: { contexto: f.packet.contexto, propuesta: f.packet.propuesta }, error: null }
    return base(name, args)
  })
  await expect(saveFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope, f.preparation.datos.contexto_sha256, periods)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  expect(f.rpc.mock.calls.filter(([name]) => name.startsWith('guardar'))).toHaveLength(1)
})
it.each(['DATOS_NC_PREPARADOS', 'CANCELADA'])('recupera %s con Auth única y sin catálogo actual ni escrituras', async estado => {
  const f = await fixture(); f.packet.estado = estado
  expect((await loadFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope))?.estado).toBe(estado)
  expect(f.getUser).toHaveBeenCalledTimes(1)
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['cargar_representacion_fiscal_homologacion', 'cargar_preparacion_nc_homologacion'])
  for (const [, args] of f.rpc.mock.calls) expect(args.p_actor_auth_id).toBe(f.actor)
  expect(f.rpc.mock.calls[1][1]).toMatchObject({ p_id: f.scope.requestId, p_sha: f.scope.sha256 })
})
it('sólo null durable representa ausencia; errores y respuesta indefinida fallan saneados', async () => {
  const f = await fixture(), base = f.rpc.getMockImplementation()!
  f.rpc.mockImplementation(async (name, args) => name === 'cargar_preparacion_nc_homologacion' ? { data: null, error: null } : base(name, args))
  expect(await loadFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope)).toBeNull()
  for (const result of [{ data: undefined, error: null }, { data: null, error: { message: 'PRIVATE_DB' } }]) {
    f.rpc.mockImplementation(async (name, args) => name === 'cargar_preparacion_nc_homologacion' ? result : base(name, args))
    await expect(loadFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  }
})
it('rechaza otro caso, canónico alterado y Auth inválida sin filtrar diagnóstico privado', async () => {
  const f = await fixture()
  await expect(loadFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', { ...f.scope, requestId: crypto.randomUUID() })).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  f.packet.preparacion.sha256 = 'a'.repeat(64)
  await expect(loadFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  f.rpc.mockClear(); f.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'PRIVATE_AUTH' } })
  await expect(loadFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  expect(f.rpc).not.toHaveBeenCalled()
})
it('captura scope antes de esperar Auth', async () => {
  const f = await fixture(); let finish!: (value: Awaited<ReturnType<FiscalAuthClient['auth']['getUser']>>) => void
  f.getUser.mockReturnValueOnce(new Promise(resolve => { finish = resolve }))
  const pending = loadFiscalCreditPreparation(f.admin, 'SYNTHETIC_JWT', f.scope)
  f.scope.requestId = crypto.randomUUID(); finish({ data: { user: { id: f.actor } }, error: null })
  expect((await pending)?.estado).toBe('DATOS_NC_PREPARADOS')
})
