import { expect, it, vi } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { loadFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditDraftService'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'

async function fixture() {
  const f = await fiscalCreditContextFixture(), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const preparation = await prepareFiscalCreditPreparation(f.source, f.proposal, context, { servicioDesde: null, servicioHasta: null, vencimientoPago: null })
  const packet = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, estado: 'DATOS_NC_PREPARADOS',
    preparacion: { canonico: preparation.canonico, sha256: preparation.sha256 }, contexto: context,
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  const getUser = vi.fn<FiscalAuthClient['auth']['getUser']>(async () => ({ data: { user: { id: f.actor } }, error: null }))
  const rpc = vi.fn<FiscalAuthClient['rpc']>(async name => ({ data: name === 'cargar_representacion_fiscal_homologacion' ? f.wire : packet, error: null }))
  return { ...f, packet, getUser, rpc, admin: { auth: { getUser }, rpc }, scope: { saleId: f.sale, operationId: f.operation, requestId: f.input.solicitud_id, sha256: f.proposal.sha256 } }
}
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
