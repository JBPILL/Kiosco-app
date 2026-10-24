// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { fiscalCreditFixture } from './fixtures/fiscalCredit'
import { validateFiscalCreditHistory, fiscalCreditHistoryWire } from '../../supabase/functions/_shared/fiscalCreditHistory'
import { validateFiscalCreditDraftProposal } from '../../supabase/functions/_shared/fiscalCreditDraft'
import { loadFiscalCreditHistory } from '../../supabase/functions/_shared/fiscalCreditDraftService'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
it('historial reconstruye propuesta canónica y ACK sin atribuir emisión o saldo actual', async () => {
  const f = await fiscalCreditFixture(), result = await validateFiscalCreditHistory(f.page, f.source, 0)
  expect(result.casos[0].propuesta).toEqual(f.proposal)
  expect(result.casos[0].acuse).toEqual(f.ack); expect(Object.isFrozen(result.casos[0])).toBe(true)
  expect(Object.isFrozen(result.casos[0].propuesta.datos.lineas[0])).toBe(true)
  expect(fiscalCreditHistoryWire(result)).toEqual(f.page)
  const empty = await validateFiscalCreditHistory({ ...f.page, casos: [] }, f.source, 0)
  expect(empty.casos).toEqual([])
})
it.each(['venta', 'factura', 'cursor', 'orden', 'id_duplicado', 'hash', 'promocion', 'limite', 'continuacion', 'extras'])('historial rechaza %s', async cause => {
  const f = await fiscalCreditFixture(); let page: unknown = f.page
  if (cause === 'venta') page = { ...f.page, venta_id: crypto.randomUUID() }
  if (cause === 'factura') page = { ...f.page, operacion_origen_id: crypto.randomUUID() }
  if (cause === 'cursor') page = { ...f.page, despues: 1 }
  if (cause === 'orden') page = { ...f.page, casos: [{ ...f.entry, secuencia: 0 }] }
  if (cause === 'id_duplicado') page = { ...f.page, casos: [f.entry, { ...f.entry, secuencia: 2 }] }
  if (cause === 'hash') page = { ...f.page, casos: [{ ...f.entry, propuesta: { ...f.entry.propuesta, sha256: 'a'.repeat(64) } }] }
  if (cause === 'promocion') page = { ...f.page, casos: [{ ...f.entry, acuse: { ...f.ack, reintegro_habilitado: true } }] }
  if (cause === 'limite') page = { ...f.page, casos: Array.from({ length: 11 }, (_, i) => ({ ...f.entry, secuencia: i + 1 })) }
  if (cause === 'continuacion') page = { ...f.page, continuar_desde: 1 }
  if (cause === 'extras') page = { ...f.page, credential: 'UNEXPECTED' }
  await expect(validateFiscalCreditHistory(page, f.source, 0)).rejects.toThrow('FISCAL_HISTORIAL_NC_NO_CONFIRMADO')
})
it('propuesta de historia no admite cambios derivados aunque se vuelvan a serializar', async () => {
  const f = await fiscalCreditFixture(), altered = { ...f.proposal.datos, origen: { ...f.proposal.datos.origen, numero: 999 } }
  await expect(validateFiscalCreditDraftProposal(f.source, { canonico: JSON.stringify(altered), sha256: f.proposal.sha256 })).rejects.toThrow()
  await expect(validateFiscalCreditHistory({ ...f.page, casos: [] }, { ...f.source, estado: 'PREPARADA' } as unknown as typeof f.source, 0)).rejects.toThrow()
})
it('servicio consulta fuente e historial con Auth una vez; HTTP permite lectura sin flag de escritura', async () => {
  const f = await fiscalCreditFixture(), getUser = vi.fn<FiscalAuthClient['auth']['getUser']>(async () => ({ data: { user: { id: f.actor } }, error: null }))
  const rpc = vi.fn<FiscalAuthClient['rpc']>(async name => ({ data: name === 'cargar_representacion_fiscal_homologacion' ? f.wire : f.page, error: null }))
  const admin = { auth: { getUser }, rpc }, fetcher = vi.fn<typeof fetch>()
  const result = await loadFiscalCreditHistory(admin, 'SYNTHETIC_JWT', f.sale, f.operation, 0)
  expect(result.casos[0].propuesta.sha256).toBe(f.proposal.sha256); expect(getUser).toHaveBeenCalledTimes(1)
  for (const [, args] of rpc.mock.calls) expect(args.p_actor_auth_id).toBe(f.actor)
  getUser.mockClear(); rpc.mockClear()
  const handler = createFiscalHttpHandler({ readSecret: name => name === 'SUPABASE_URL' ? 'https://acoyfwwmhaeruciyedri.supabase.co' : name === 'ARCA_HOMO_BACKEND_ENABLED' ? 'true' : undefined, createAdmin: () => admin, fetcher })
  const request = (despues: unknown) => new Request('https://acoyfwwmhaeruciyedri.supabase.co/functions/v1/arca-homologacion', { method: 'POST', headers: { origin: 'https://kiosco-app-staging.vercel.app', authorization: 'Bearer SYNTHETIC_JWT', 'content-type': 'application/json' }, body: JSON.stringify({ accion: 'HISTORIAL_BORRADORES_NC', venta_id: f.sale, operacion_origen_id: f.operation, despues }) })
  const response = await handler(request(0)); expect(response.status).toBe(200); expect((await response.json()).resultado).toEqual(f.page)
  expect(getUser).toHaveBeenCalledTimes(1); expect(fetcher).not.toHaveBeenCalled()
  getUser.mockClear()
  for (const invalid of [-1, 0.5, 2147483648, '0']) expect((await handler(request(invalid))).status).toBe(400)
  expect(getUser).not.toHaveBeenCalled()
})
