// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { createFiscalClient } from '../lib/fiscalClient'
import { fiscalCreditFixture } from './fixtures/fiscalCredit'
import { prepareFiscalCreditDraft } from '../../supabase/functions/_shared/fiscalCreditDraft'
import type { FiscalCreditDraftInput } from '../../supabase/functions/_shared/fiscalCreditDraft'
async function fixture() {
  const f = await fiscalCreditFixture(), local = new Map<string, string>(), server = new Map<string, { ack: Record<string, unknown>; proposal: { canonico: string; sha256: string } | null }>()
  const storage = { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => { local.set(key, value) }, removeItem: (key: string) => { local.delete(key) } }
  const envelope = (resultado: unknown) => ({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado })
  const send = vi.fn(async (cmd: Record<string, unknown>) => {
    const id = String(cmd.solicitud_id)
    if (cmd.accion === 'BORRADOR_NC') return envelope(server.get(id)?.ack ?? null)
    if (cmd.accion === 'GUARDAR_BORRADOR_NC') {
      const proposal = await prepareFiscalCreditDraft(f.source, cmd.propuesta, '20261023')
      const ack = { ...f.ack, solicitud_id: proposal.datos.solicitud_id, propuesta_sha256: proposal.sha256 }
      server.set(proposal.datos.solicitud_id, { ack, proposal: { canonico: proposal.canonico, sha256: proposal.sha256 } }); return envelope(ack)
    }
    if (cmd.accion === 'CANCELAR_BORRADOR_NC') {
      const old = server.get(id), ack = { ...f.ack, solicitud_id: id, propuesta_sha256: cmd.propuesta_sha256, estado: 'CANCELADA' }
      server.set(id, { ack, proposal: old?.proposal ?? null }); return envelope(ack)
    }
    if (cmd.accion === 'HISTORIAL_BORRADORES_NC') return envelope({ ...f.page, casos: [...server.values()].filter(x => x.proposal).map((x, i) => ({ secuencia: i + 1, acuse: x.ack, propuesta: x.proposal })) })
    throw new Error('UNEXPECTED_COMMAND')
  })
  const make = () => createFiscalClient(f.scope, { storage, send })
  return { ...f, local, server, storage, send, make, client: make() }
}
it('registra sólo UUID/hash/intención antes de POST y valida ACK durable antes de retirar', async () => {
  const f = await fixture(), base = f.send.getMockImplementation()!
  f.send.mockImplementation(async cmd => {
    if (cmd.accion === 'GUARDAR_BORRADOR_NC') {
      expect(f.client.credits.pending()).toMatchObject({ requestId: f.input.solicitud_id, sha256: f.proposal.sha256, intention: 'GUARDAR' })
      const raw = [...f.local.values()].join(''); expect(raw).not.toContain('motivo'); expect(raw).not.toContain('canonico'); expect(raw).not.toContain('domicilio'); expect(raw).not.toContain('numero_documento_receptor')
    }
    return base(cmd)
  })
  expect(await f.client.credits.save(f.source, f.input)).toEqual(f.ack)
  expect(f.client.credits.pending()).toBeNull(); expect(f.send.mock.calls.map(([c]) => c.accion)).toEqual(['BORRADOR_NC', 'GUARDAR_BORRADOR_NC', 'BORRADOR_NC'])
})
it('dos clientes con mismo intento y exclusión local compartida generan un solo POST', async () => {
  const f = await fixture(), other = f.make()
  const results = await Promise.all([f.client.credits.save(f.source, f.input), other.credits.save(f.source, f.input)])
  expect(results[0]).toEqual(results[1]); expect(f.server.size).toBe(1)
  expect(f.send.mock.calls.filter(([c]) => c.accion === 'GUARDAR_BORRADOR_NC')).toHaveLength(1)
})
it('respuesta perdida y reinicio consultan mismo UUID; no se vuelve a guardar', async () => {
  const f = await fixture(), base = f.send.getMockImplementation()!; let saved = false, loseRead = true
  f.send.mockImplementation(async cmd => {
    if (cmd.accion === 'GUARDAR_BORRADOR_NC') { await base(cmd); saved = true; throw new Error('LOST_ACK') }
    if (cmd.accion === 'BORRADOR_NC' && saved && loseRead) { loseRead = false; throw new Error('NETWORK') }
    return base(cmd)
  })
  await expect(f.client.credits.save(f.source, f.input)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
  const recovered = f.make(); expect(recovered.credits.pending()?.requestId).toBe(f.input.solicitud_id)
  expect(await recovered.credits.recover()).toEqual(f.ack); expect(recovered.credits.pending()).toBeNull()
  expect(f.send.mock.calls.filter(([c]) => c.accion === 'GUARDAR_BORRADOR_NC')).toHaveLength(1)
})
it('ausencia no borra pendiente; descartar crea desistimiento y envío tardío conserva CANCELADA', async () => {
  const f = await fixture(), base = f.send.getMockImplementation()!
  f.send.mockImplementation(async cmd => { if (cmd.accion === 'GUARDAR_BORRADOR_NC') throw new Error('NOT_SENT'); return base(cmd) })
  await expect(f.client.credits.save(f.source, f.input)).rejects.toThrow()
  const original = f.client.credits.pending()!
  expect(await f.client.credits.recover()).toBeNull(); expect(f.client.credits.pending()).toEqual(original)
  const calls = f.send.mock.calls.length
  await expect(f.client.credits.save(f.source, { ...f.input, motivo: 'Otro' })).rejects.toThrow(); expect(f.send).toHaveBeenCalledTimes(calls)
  expect((await f.client.credits.cancel(original.operationId, original.requestId, original.sha256)).estado).toBe('CANCELADA')
  expect(f.client.credits.pending()).toBeNull()
  expect((await f.client.credits.save(f.source, f.input)).estado).toBe('CANCELADA')
  expect(f.send.mock.calls.filter(([c]) => c.accion === 'GUARDAR_BORRADOR_NC')).toHaveLength(1)
})
it('sin almacenamiento verificado no manda POST y otro Auth/comercio/venta no recupera metadata', async () => {
  const f = await fixture()
  for (const storage of [{ getItem: () => null, setItem: () => { throw new Error('quota') } }, { getItem: () => null, setItem: () => {} }]) {
    const client = createFiscalClient(f.scope, { storage, send: f.send })
    await expect(client.credits.save(f.source, f.input)).rejects.toThrow()
  }
  expect(f.send.mock.calls.some(([c]) => c.accion === 'GUARDAR_BORRADOR_NC')).toBe(false)
  const base = f.send.getMockImplementation()!; f.send.mockImplementation(async cmd => { if (cmd.accion === 'GUARDAR_BORRADOR_NC') throw new Error('lost'); return base(cmd) })
  await expect(f.client.credits.save(f.source, f.input)).rejects.toThrow()
  for (const key of ['authId', 'kioskId', 'saleId'] as const) expect(createFiscalClient({ ...f.scope, [key]: crypto.randomUUID() }, { storage: f.storage, send: f.send }).credits.pending()).toBeNull()
})
it('historial recupera casos después de borrar almacenamiento local, sin persistir la propuesta', async () => {
  const f = await fixture(); await f.client.credits.save(f.source, f.input); f.local.clear()
  const result = await f.make().credits.history(f.source)
  expect(result.casos[0].propuesta.canonico).toBe(f.proposal.canonico); expect(f.local.size).toBe(0)
})
it('no genera un UUID silencioso si el formulario no conserva su identidad', async () => {
  const f = await fixture(), { solicitud_id: _removed, ...withoutId } = f.input
  await expect(f.client.credits.save(f.source, withoutId as FiscalCreditDraftInput)).rejects.toThrow()
  expect(f.send).not.toHaveBeenCalled(); expect(f.local.size).toBe(0)
})
it('cancelación no confirmada queda pendiente; una recuperación SALDO no la da por cancelada', async () => {
  const f = await fixture(); await f.client.credits.save(f.source, f.input)
  const base = f.send.getMockImplementation()!
  f.send.mockImplementation(async cmd => { if (cmd.accion === 'CANCELAR_BORRADOR_NC') throw new Error('not_confirmed'); return base(cmd) })
  await expect(f.client.credits.cancel(f.operation, f.input.solicitud_id, f.proposal.sha256)).rejects.toThrow()
  expect((await f.client.credits.recover())?.estado).toBe('SALDO_RESERVADO_NO_EMITIR'); expect(f.client.credits.pending()?.intention).toBe('CANCELAR')
  await expect(f.client.credits.save(f.source, f.input)).rejects.toThrow()
  f.send.mockImplementation(base); expect((await f.client.credits.cancel(f.operation, f.input.solicitud_id, f.proposal.sha256)).estado).toBe('CANCELADA')
  expect(f.client.credits.pending()).toBeNull()
})
it('captura el formulario antes de esperar y nunca sustituye el UUID/hash pendiente', async () => {
  const f = await fixture(), input = structuredClone(f.input), pending = f.client.credits.save(f.source, input)
  input.motivo = 'CAMBIADO'; expect(await pending).toEqual(f.ack)
})
it('registro local corrupto se conserva y no dispara red ni borrado', async () => {
  const f = await fixture(), key = `kioskopos:fiscal:v1:${f.scope.authId}:${f.scope.kioskId}:${f.sale}:credit`
  f.local.set(key, '{invalid')
  expect(() => f.client.credits.pending()).toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
  await expect(f.client.credits.recover()).rejects.toThrow(); expect(f.local.get(key)).toBe('{invalid'); expect(f.send).not.toHaveBeenCalled()
})
