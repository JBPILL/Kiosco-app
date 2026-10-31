import { expect, it, vi } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { loadFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditDraftService'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp'
import { createFiscalClient } from '../lib/fiscalClient'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
async function fixture() {
  const f = await fiscalCreditContextFixture()
  const getUser = vi.fn<FiscalAuthClient['auth']['getUser']>(async () => ({ data: { user: { id: f.actor } }, error: null }))
  const rpc = vi.fn<FiscalAuthClient['rpc']>(async name => ({ data: name === 'cargar_representacion_fiscal_homologacion' ? f.wire : { contexto: f.context, propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 } }, error: null }))
  const proposal = { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }
  return { ...f, getUser, rpc, body: proposal, queryScope: { saleId: f.sale, operationId: f.operation, requestId: f.input.solicitud_id, sha256: f.proposal.sha256 }, admin: { auth: { getUser }, rpc } }
}
it('Auth se verifica una vez, mismo actor y hash de caso en SQL; no hay permiso ni mutación', async () => {
  const f = await fixture()
  expect(await loadFiscalCreditContext(f.admin, 'SYNTHETIC_JWT', f.queryScope)).toEqual(f.context)
  expect(f.getUser).toHaveBeenCalledTimes(1)
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['cargar_representacion_fiscal_homologacion', 'cargar_fuente_contexto_nc_homologacion'])
  for (const [, args] of f.rpc.mock.calls) expect(args.p_actor_auth_id).toBe(f.actor)
  expect(f.rpc.mock.calls[1][1]).toMatchObject({ p_id: f.input.solicitud_id, p_sha: f.proposal.sha256 })
})
it('servicio captura identidad solicitada antes de esperar Auth',async()=>{
  const f=await fixture();let finish!: (value: Awaited<ReturnType<FiscalAuthClient['auth']['getUser']>>) => void
  f.getUser.mockReturnValueOnce(new Promise(resolve=>{finish=resolve}))
  const loading=loadFiscalCreditContext(f.admin,'SYNTHETIC_JWT',f.queryScope)
  f.queryScope.requestId=crypto.randomUUID();finish({data:{user:{id:f.actor}},error:null})
  expect(await loading).toEqual(f.context);expect(f.rpc.mock.calls[1][1].p_id).toBe(f.input.solicitud_id)
})
it('errores Auth/RPC, propuesta alterada y contexto ajeno fallan saneados sin reintentos', async () => {
  const f = await fixture()
  f.getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: 'PRIVATE_AUTH' } })
  await expect(loadFiscalCreditContext(f.admin, 'SYNTHETIC_JWT', f.queryScope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA'); expect(f.rpc).not.toHaveBeenCalled()
  await expect(loadFiscalCreditContext(f.admin, 'SYNTHETIC_JWT', { ...f.queryScope, sha256: 'bad' })).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  expect(f.rpc).not.toHaveBeenCalled()
  f.rpc.mockRejectedValueOnce(new Error('PRIVATE_RPC'))
  await expect(loadFiscalCreditContext(f.admin, 'SYNTHETIC_JWT', f.queryScope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  const base = f.rpc.getMockImplementation()!
  f.rpc.mockImplementation(async (name, args) => name === 'cargar_fuente_contexto_nc_homologacion' ? { data: { contexto: { ...f.context, propuesta_sha256: 'a'.repeat(64) }, propuesta: f.body }, error: null } : base(name, args))
  await expect(loadFiscalCreditContext(f.admin, 'SYNTHETIC_JWT', f.queryScope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  f.rpc.mockImplementation(async (name, args) => name === 'cargar_fuente_contexto_nc_homologacion' ? { data: { contexto: f.context, propuesta: { ...f.body, canonico: '{}' } }, error: null } : base(name, args))
  await expect(loadFiscalCreditContext(f.admin, 'SYNTHETIC_JWT', f.queryScope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
})
it('HTTP contexto cerrado 2KiB, lectura sin flag de guardar y sin red fiscal', async () => {
  const f = await fixture(), fetcher = vi.fn<typeof fetch>()
  const handler = createFiscalHttpHandler({ readSecret: key => key === 'SUPABASE_URL' ? 'https://acoyfwwmhaeruciyedri.supabase.co' : key === 'ARCA_HOMO_BACKEND_ENABLED' ? 'true' : undefined, createAdmin: () => f.admin, fetcher })
  const command = { accion: 'CONTEXTO_NC', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256 }
  const request = (body: unknown) => new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion', { method: 'POST', headers: { origin: 'https://kiosco-app-staging.vercel.app', authorization: 'Bearer SYNTHETIC_JWT', 'content-type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) })
  const response = await handler(request(command)); expect(response.status).toBe(200); expect((await response.json()).resultado).toEqual(f.context)
  f.getUser.mockClear()
  for (const invalid of [{ ...command, actor_auth_id: f.actor }, { ...command, solicitud_id: [] }, { ...command, extra: 'x'.repeat(65536) }, JSON.stringify(command) + ' '.repeat(2100), '{"accion":"CONTEXTO_NC","accion":"CONTEXTO_NC"}']) expect((await handler(request(invalid))).status).toBe(400)
  expect(f.getUser).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})
it('cliente captura datos antes de await, valida caso y deja storage intacto', async () => {
  const f = await fixture(), original = { ...f.source }, proposal = { ...f.proposal }
  let finish!: (value: unknown) => void
  const send = vi.fn<(command: Record<string, unknown>) => Promise<unknown>>(async () => new Promise<unknown>(resolve => { finish = resolve })), getItem = vi.fn(() => null), setItem = vi.fn()
  const client = createFiscalClient(f.scope, { storage: { getItem, setItem }, send })
  const loading = client.credits.context(original, proposal); original.venta_id = crypto.randomUUID(); proposal.canonico = '{}'
  await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
  expect(send.mock.calls[0][0]).toEqual({ accion: 'CONTEXTO_NC', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256 })
  finish({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado: f.context })
  expect(await loading).toEqual(f.context); expect(getItem).not.toHaveBeenCalled(); expect(setItem).not.toHaveBeenCalled()
})
it('cliente no envía propuesta de otra factura y rechaza respuesta de otro caso sin persistir', async () => {
  const f = await fixture(), other = await fixture(), getItem = vi.fn(() => null), setItem = vi.fn()
  const send = vi.fn(async () => ({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado: other.context }))
  const client = createFiscalClient(f.scope, { storage: { getItem, setItem }, send })
  await expect(client.credits.context(other.source, other.proposal)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO'); expect(send).not.toHaveBeenCalled()
  await expect(client.credits.context(f.source, f.proposal)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
  expect(setItem).not.toHaveBeenCalled(); expect(getItem).not.toHaveBeenCalled()
})
