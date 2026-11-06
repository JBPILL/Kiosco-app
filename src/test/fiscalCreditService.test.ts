// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { saveFiscalCreditDraft, loadFiscalCreditDraft, cancelFiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraftService'
import { validateFiscalCreditDraftAck } from '../../supabase/functions/_shared/fiscalCreditDraftAck'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { prepareFiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraft'
import { validateFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentation'
import { fiscalRepresentationFixture } from './fixtures/fiscalRepresentation'

const now = Date.parse('2026-10-23T18:00:00Z'), origin = 'https://kiosco-app-staging.vercel.app'
const host = 'https://acoyfwwmhaeruciyedri.supabase.co'
async function fixture() {
  const f = await fiscalRepresentationFixture(), source = await validateFiscalRepresentation(f.wire, f.sale, f.operation)
  const input = { version: 1, solicitud_id: crypto.randomUUID(), fecha: '20261023', motivo: 'Devolución sintética', condicion_iva_receptor: 5,
    lineas: [{ detalle_id: source.contexto.lineas[0].detalle_id, cantidad: '2.000', importe: '123.45', reingresa_stock: true }],
    importes: structuredClone(source.constancia.solicitud.solicitud.importes), iva: [], tributos: [] }
  const proposal = await prepareFiscalCreditDraft(source, input, '20261023')
  const scope = { saleId: f.sale, operationId: f.operation, requestId: input.solicitud_id, sha256: proposal.sha256 }
  const ack = { version: 1, entorno: 'HOMOLOGACION', solicitud_id: input.solicitud_id, venta_id: f.sale, operacion_origen_id: f.operation,
    propuesta_sha256: proposal.sha256, estado: 'SALDO_RESERVADO_NO_EMITIR', emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  let stored: Record<string, unknown> | null = null, lostSave = false, lostCancel = false
  const getUser = vi.fn<FiscalAuthClient['auth']['getUser']>(async () => ({ data: { user: { id: f.actor } }, error: null }))
  const rpc = vi.fn<FiscalAuthClient['rpc']>(async (name, args) => {
    if (name === 'cargar_representacion_fiscal_homologacion') return { data: f.wire, error: null }
    if (name === 'guardar_borrador_nc_homologacion') {
      stored = { ...ack, propuesta_sha256: args.p_sha }
      if (lostSave) throw new Error('SYNTHETIC_ACK_LOST')
      return { data: stored, error: null }
    }
    if (name === 'cancelar_borrador_nc_homologacion') {
      if (stored) stored = { ...stored, estado: 'CANCELADA' }
      if (lostCancel) throw new Error('SYNTHETIC_ACK_LOST')
      return { data: stored, error: null }
    }
    if (name === 'cargar_borrador_nc_homologacion') return { data: stored, error: null }
    throw new Error('UNEXPECTED_PRIVATE_RPC')
  })
  const admin = { auth: { getUser }, rpc }, fetcher = vi.fn<typeof fetch>()
  const flags: Record<string, string> = { SUPABASE_URL: host, ARCA_HOMO_BACKEND_ENABLED: 'true', ARCA_HOMO_CREDIT_DRAFTS_ENABLED: 'true' }
  const readSecret = vi.fn((name: string) => flags[name]), createAdmin = vi.fn(() => admin)
  const handler = createFiscalHttpHandler({ readSecret, createAdmin, fetcher })
  return { ...f, input, source, proposal, scope, ack, admin, rpc, getUser, flags, readSecret, createAdmin, handler, fetcher,
    stored: (value: Record<string, unknown> | null) => { stored = value }, loseSave: () => { lostSave = true }, loseCancel: () => { lostCancel = true } }
}
function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request(host + '/functions/v1/arca-homologacion', { method: 'POST', headers: { origin, authorization: 'Bearer SYNTHETIC_JWT', 'content-type': 'application/json', ...headers }, body: typeof body === 'string' ? body : JSON.stringify(body) })
}
it('reserva usando Auth una vez, fuente verificada y ACK leído, sin dar por válido el ACK de escritura', async () => {
  const f = await fixture(), result = await saveFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation, f.input, now)
  expect(result).toEqual(f.ack); expect(Object.isFrozen(result)).toBe(true); expect(f.getUser).toHaveBeenCalledExactlyOnceWith('SYNTHETIC_JWT')
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['cargar_representacion_fiscal_homologacion', 'guardar_borrador_nc_homologacion', 'cargar_borrador_nc_homologacion'])
  for (const [, args] of f.rpc.mock.calls) expect(args.p_actor_auth_id).toBe(f.actor)
  expect(f.rpc.mock.calls[1][1]).toMatchObject({ p_venta_id: f.sale, p_operacion_origen_id: f.operation, p_canonico: f.proposal.canonico, p_sha: f.proposal.sha256 })
})
it('ACK de guardado o cancelación perdido se recupera sin repetir escritura', async () => {
  const f = await fixture(); f.loseSave(); f.loseCancel()
  expect(await saveFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation, f.input, now)).toEqual(f.ack)
  expect(await cancelFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.scope)).toMatchObject({ estado: 'CANCELADA' })
  expect(f.rpc.mock.calls.filter(([name]) => name === 'guardar_borrador_nc_homologacion')).toHaveLength(1)
  expect(f.rpc.mock.calls.filter(([name]) => name === 'cancelar_borrador_nc_homologacion')).toHaveLength(1)
  expect(f.getUser).toHaveBeenCalledTimes(2)
})
it('ausencia confirmada, error de consulta y guardado no confirmado son resultados diferentes', async () => {
  const f = await fixture()
  expect(await loadFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.scope)).toBeNull()
  f.rpc.mockResolvedValue({ data: null, error: new Error('PRIVATE_DB_ERROR') })
  await expect(loadFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.scope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  await expect(saveFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation, f.input, now)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
})
it.each(['venta_id', 'operacion_origen_id', 'solicitud_id', 'propuesta_sha256', 'estado', 'emision_habilitada', 'reintegro_habilitado', 'reposicion_habilitada', 'extra'])('ACK alterado %s no acredita reserva ni devolución', async field => {
  const f = await fixture(), bad = { ...f.ack, [field]: field.endsWith('habilitada') || field.endsWith('habilitado') ? true : 'INVALID_OR_FOREIGN' }
  expect(() => validateFiscalCreditDraftAck(bad, f.scope)).toThrow('FISCAL_NC_NO_CONFIRMADA')
  f.stored(bad); await expect(loadFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.scope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
})
it('error Auth o scope inválido no accede a RPC; no se usa perfil para inferir el Auth', async () => {
  const f = await fixture(); f.getUser.mockResolvedValue({ data: { user: null }, error: new Error('PRIVATE_AUTH_ERROR') })
  await expect(saveFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation, f.input, now)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  expect(f.rpc).not.toHaveBeenCalled(); f.getUser.mockClear()
  await expect(loadFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', { ...f.scope, sha256: 'bad' })).rejects.toThrow()
  expect(f.getUser).not.toHaveBeenCalled()
})
it('fecha operativa usa Argentina, sin aceptar el día UTC como día local siguiente', async () => {
  const f = await fixture()
  await expect(saveFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation, f.input, Date.parse('2026-10-23T02:30:00Z'))).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['cargar_representacion_fiscal_homologacion'])
})
it('captura propuesta y scope antes de esperar Auth', async () => {
  const f = await fixture(); let finish!: () => void
  f.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ data: { user: { id: f.actor } }, error: null }) }))
  const input = structuredClone(f.input), pending = saveFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation, input, now)
  input.motivo = 'MUTADO'; finish(); expect(await pending).toEqual(f.ack)
  expect(f.rpc.mock.calls[1][1].p_canonico).toBe(f.proposal.canonico)
  f.getUser.mockImplementationOnce(() => new Promise(resolve => { finish = () => resolve({ data: { user: { id: f.actor } }, error: null }) }))
  const scope = { ...f.scope }, reading = loadFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', scope)
  scope.requestId = crypto.randomUUID(); scope.sha256 = 'b'.repeat(64)
  finish(); expect(await reading).toEqual(f.ack)
  expect(f.rpc.mock.lastCall?.[1].p_id).toBe(f.scope.requestId)
})
it('cancelación no confirmada como CANCELADA falla y no libera otra solicitud', async () => {
  const f = await fixture(); f.stored(f.ack)
  f.rpc.mockImplementation(async () => ({ data: f.ack, error: null }))
  await expect(cancelFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.scope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  expect(f.rpc).toHaveBeenCalledTimes(2)
})
it('HTTP guardar exige flag propio antes de instanciar Admin; no basta backend habilitado', async () => {
  const f = await fixture(); delete f.flags.ARCA_HOMO_CREDIT_DRAFTS_ENABLED
  const response = await f.handler(request({ accion: 'GUARDAR_BORRADOR_NC', venta_id: f.sale, operacion_origen_id: f.operation, propuesta: f.input }))
  expect(response.status).toBe(503); expect((await response.json()).codigo).toBe('BORRADORES_NC_NO_HABILITADOS')
  expect(f.createAdmin).not.toHaveBeenCalled(); expect(f.getUser).not.toHaveBeenCalled(); expect(f.fetcher).not.toHaveBeenCalled()
})
it.each(['BORRADOR_NC', 'CANCELAR_BORRADOR_NC'])('HTTP %s recupera con flag de guardado apagado sin TA/custodia/red', async accion => {
  const f = await fixture(); f.stored(f.ack); delete f.flags.ARCA_HOMO_CREDIT_DRAFTS_ENABLED
  const response = await f.handler(request({ accion, venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.scope.requestId, propuesta_sha256: f.scope.sha256 }))
  expect(response.status).toBe(200); const result = (await response.json()).resultado
  expect(result).toMatchObject({ solicitud_id: f.scope.requestId, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false })
  expect(f.getUser).toHaveBeenCalledTimes(1); expect(f.fetcher).not.toHaveBeenCalled()
  expect(f.readSecret.mock.calls.some(([name]) => /CUSTODY|KEYRING|CREDENTIAL|TICKET_KEYS/.test(name))).toBe(false)
})
it('HTTP guarda usando sólo IDs propios y devuelve ACK cerrado, nunca la fuente original', async () => {
  const f = await fixture(), response = await f.handler(request({ accion: 'GUARDAR_BORRADOR_NC', venta_id: f.sale, operacion_origen_id: f.operation, propuesta: f.input }))
  expect(response.status).toBe(200); const body = await response.json()
  expect(body.resultado).toEqual(f.ack); expect(Object.keys(body.resultado)).toHaveLength(10)
  expect(JSON.stringify(body)).not.toContain('canonico'); expect(JSON.stringify(body)).not.toContain('credencial')
  expect(f.getUser).toHaveBeenCalledTimes(1); expect(f.fetcher).not.toHaveBeenCalled()
})
it('HTTP mantiene JSON estricto y presupuestos propios, sin actor/CAE/importes agregados en raíz', async () => {
  const f = await fixture(), body = { accion: 'BORRADOR_NC', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.scope.requestId, propuesta_sha256: f.scope.sha256 }
  for (const bad of [{ ...body, actor_auth_id: f.actor }, { ...body, cae: '11111111111111' }, { ...body, propuesta_sha256: 'bad' }, { ...body, accion: 'EMITIR_NC' }, ' '.repeat(65537),
    `{"accion":"GUARDAR_BORRADOR_NC","venta_id":"${f.sale}","operacion_origen_id":"${f.operation}","propuesta":{"fecha":"20261023","\\u0066echa":"20261022"}}`]) {
    expect((await f.handler(request(bad))).status).toBe(400)
  }
  expect(f.createAdmin).not.toHaveBeenCalled(); expect(f.getUser).not.toHaveBeenCalled()
})
it('HTTP consulta mayor a2KiB y origen/sesión ajenos no llegan al servicio', async () => {
  const f = await fixture(), body = { accion: 'BORRADOR_NC', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.scope.requestId, propuesta_sha256: f.scope.sha256 }
  expect((await f.handler(request(' '.repeat(2049) + JSON.stringify(body)))).status).toBe(400)
  const foreign = await f.handler(request(body, { origin: 'https://foreign.example' }))
  const missingSession = await f.handler(request(body, { authorization: '' }))
  expect(foreign.status).toBe(403); expect(missingSession.status).toBe(401)
  expect(f.createAdmin).not.toHaveBeenCalled()
})
it('estado de ACK debe ser string literal y no un array coercible', async () => {
  const f = await fixture()
  expect(() => validateFiscalCreditDraftAck({ ...f.ack, estado: ['CANCELADA'] }, f.scope)).toThrow('FISCAL_NC_NO_CONFIRMADA')
})
it('guardado fallido sin registro durable no produce éxito ni reintento automático', async () => {
  const f = await fixture(), base = f.rpc.getMockImplementation()!
  f.rpc.mockImplementation(async (name, args) => name === 'guardar_borrador_nc_homologacion' ? { data: null, error: new Error('PRIVATE_REJECTED') } : base(name, args))
  await expect(saveFiscalCreditDraft(f.admin, 'SYNTHETIC_JWT', f.sale, f.operation, f.input, now)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  expect(f.rpc.mock.calls.map(([name]) => name)).toEqual(['cargar_representacion_fiscal_homologacion', 'guardar_borrador_nc_homologacion', 'cargar_borrador_nc_homologacion'])
})
it('HTTP escritura admite hasta64KiB sin aplicar el presupuesto de consulta2KiB', async () => {
  const f = await fixture(), value = { accion: 'GUARDAR_BORRADOR_NC', venta_id: f.sale, operacion_origen_id: f.operation, propuesta: f.input }
  const body = ' '.repeat(2500) + JSON.stringify(value)
  expect((await f.handler(request(body))).status).toBe(200)
  expect(f.getUser).toHaveBeenCalledTimes(1)
})
