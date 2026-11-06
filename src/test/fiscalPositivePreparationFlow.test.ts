// @vitest-environment node
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { expect, it, vi } from 'vitest'
import { positivePlanFixture } from './fixtures/fiscalPositivePlan'
import { planFiscalPositiveAcceptance } from '../../scripts/plan-fiscal-positive-acceptance.mjs'
import { createPositivePreparationFlow, type PositiveFlowJournal } from '../../scripts/fiscal-positive-preparation-flow.mjs'
import { requestFromPreparedFiscalData } from '../../supabase/functions/_shared/fiscalPreparation'
import { openPositiveWindowJournal } from '../../scripts/fiscal-positive-window-journal.mjs'

async function fixture() {
  const { config, snapshot } = positivePlanFixture()
  const plan = await planFiscalPositiveAcceptance(config)
  const frozen = await requestFromPreparedFiscalData(plan.prepared, 41)
  const state = { phase: 'SIN_PREPARACION', saveAckLost: false, bodyAckLost: false, saveFailed: false, bodyFailed: false,
    operationId: config.operationId, preparedHash: plan.prepared.sha256, frozen }
  let journal: PositiveFlowJournal = { planSha256: String(plan.manifest.planSha256), operationId: config.operationId, saveAttempted: false, bodyAttempted: false, prepared: null }
  const context = { version: 1, venta_id: snapshot.sale.id, total: snapshot.sale.total, cuit_emisor: snapshot.issuer.cuit_emisor,
    punto_venta: snapshot.issuer.punto_venta, incluye_recepcion_envases: false, revision_parametros: 2,
    condiciones: snapshot.catalog.condiciones, alicuotas: snapshot.catalog.alicuotas }
  const ports = {
    assertAuthority: vi.fn(async () => undefined),
    loadJournal: vi.fn(async () => structuredClone(journal)),
    recordAttempt: vi.fn(async (stage: 'save' | 'body') => { journal = { ...journal, [stage === 'save' ? 'saveAttempted' : 'bodyAttempted']: true } }),
    recordPrepared: vi.fn(async (prepared: { requestSha256: string; number: number }) => { journal = { ...journal, prepared: { ...prepared } } }),
    callPreparation: vi.fn(async (raw: unknown): Promise<unknown> => {
      const command = raw as Record<string, unknown>
      if (command.accion === 'DATOS_FISCALES_VENTA') return structuredClone(context)
      if (command.accion === 'RESOLVER_VENTA') return { venta_id: snapshot.sale.id, estado: state.phase,
        operacion_id: state.phase === 'SIN_PREPARACION' ? null : state.operationId,
        preparacion_sha256: state.phase === 'SIN_PREPARACION' ? null : state.preparedHash, emision_habilitada: false }
      if (command.accion === 'GUARDAR_DATOS_FISCALES') {
        expect((await ports.loadJournal()).saveAttempted).toBe(true)
        expect(command.operacion_id).toBe(config.operationId)
        if (state.saveFailed) throw Error('Synthetic write did not commit')
        state.phase = 'DATOS_PREPARADOS'
        if (state.saveAckLost) throw Error('Synthetic ACK lost after save')
        return { deliberatelyIgnoredAck: true }
      }
      if (command.accion === 'PREPARAR_COMPROBANTE') {
        expect((await ports.loadJournal()).bodyAttempted).toBe(true)
        if (state.bodyFailed) throw Error('Synthetic WSAA uncertain, no durable body')
        state.phase = 'RESERVADA'
        if (state.bodyAckLost) throw Error('Synthetic ACK lost after body')
        return { deliberatelyIgnoredAck: true }
      }
      if (command.accion === 'REVISAR_COMPROBANTE' && state.phase === 'RESERVADA') return {
        operacion_id: config.operationId, estado: 'RESERVADA', revision: 1, solicitud: state.frozen, aprobacion: null,
      }
      throw Error('Synthetic action not available')
    }),
  }
  const create = () => createPositivePreparationFlow(config, String(plan.manifest.planSha256), ports)
  return { config, snapshot, plan, state, ports, context, create }
}

it('prepares once, validates the durable body and recovers the same body/number on reload', async () => {
  const f = await fixture(), flow = await f.create()
  const first = await flow.run()
  expect(first).toMatchObject({ operationId: f.config.operationId, state: 'RESERVADA', number: 41, emissionEnabled: false })
  expect(await flow.reload()).toEqual(first)
  expect(await (await f.create()).reload()).toEqual(first)
  await expect(flow.run()).rejects.toThrow('POSITIVE_FLOW_REENTRY_REJECTED')
  const actions = f.ports.callPreparation.mock.calls.map(([raw]) => (raw as Record<string, unknown>).accion)
  expect(actions.filter(action => action === 'GUARDAR_DATOS_FISCALES')).toHaveLength(1)
  expect(actions.filter(action => action === 'PREPARAR_COMPROBANTE')).toHaveLength(1)
  expect(actions.every(action => ['RESOLVER_VENTA', 'DATOS_FISCALES_VENTA', 'GUARDAR_DATOS_FISCALES', 'PREPARAR_COMPROBANTE', 'REVISAR_COMPROBANTE'].includes(String(action)))).toBe(true)
})

it('recovers both lost write ACKs using reads and a durable original UUID, without repeating either POST', async () => {
  const f = await fixture(); f.state.saveAckLost = true; f.state.bodyAckLost = true
  const flow = await f.create(), first = await flow.run()
  expect(await flow.reload()).toEqual(first)
  expect(f.ports.recordAttempt.mock.calls).toEqual([['save'], ['body']])
  expect(f.ports.recordPrepared).toHaveBeenCalledExactlyOnceWith({ requestSha256: f.state.frozen.sha256, number: 41 })
})

it('does not retry an unconfirmed save after recreating the flow', async () => {
  const f = await fixture(); f.state.saveFailed = true
  await expect((await f.create()).run()).rejects.toThrow('POSITIVE_FLOW_SAVE_NOT_CONFIRMED')
  f.state.saveFailed = false
  await expect((await f.create()).run()).rejects.toThrow('POSITIVE_FLOW_SAVE_UNCERTAIN_NO_RETRY')
  expect(f.ports.recordAttempt.mock.calls).toEqual([['save']])
})

it('does not execute a second WSAA/number preparation after an uncertain body attempt', async () => {
  const f = await fixture(); f.state.bodyFailed = true
  await expect((await f.create()).run()).rejects.toThrow('Synthetic action not available')
  f.state.bodyFailed = false
  await expect((await f.create()).run()).rejects.toThrow('Synthetic action not available')
  expect(f.ports.callPreparation.mock.calls.filter(([raw]) => (raw as Record<string, unknown>).accion === 'PREPARAR_COMPROBANTE')).toHaveLength(1)
})

it('requires the write-ahead journal to be durable before performing either write', async () => {
  const f = await fixture(); f.ports.recordAttempt.mockImplementation(async () => undefined)
  await expect((await f.create()).run()).rejects.toThrow('POSITIVE_FLOW_JOURNAL_NOT_DURABLE')
  expect(f.ports.callPreparation.mock.calls.map(([raw]) => (raw as Record<string, unknown>).accion)).toEqual(['DATOS_FISCALES_VENTA', 'RESOLVER_VENTA'])
})

it.each(['foreign-operation', 'foreign-hash', 'existing-body', 'uncertain-emission', 'authorized'])('stops %s rather than adopting it', async mode => {
  const f = await fixture(); f.state.phase = 'DATOS_PREPARADOS'
  if (mode === 'foreign-operation') f.state.operationId = randomUUID()
  if (mode === 'foreign-hash') f.state.preparedHash = 'f'.repeat(64)
  if (mode === 'existing-body') f.state.phase = 'RESERVADA'
  if (mode === 'uncertain-emission') f.state.phase = 'ENVIO_INCIERTO'
  if (mode === 'authorized') f.state.phase = 'AUTORIZADA'
  await expect((await f.create()).run()).rejects.toThrow('POSITIVE_FLOW_UNEXPECTED_OPERATION')
  expect(f.ports.recordAttempt).not.toHaveBeenCalled()
})

it('rejects catalog/context drift before recording a write attempt', async () => {
  const f = await fixture(); f.context.condiciones[0].descripcion = 'changed catalog content'
  await expect((await f.create()).run()).rejects.toThrow('POSITIVE_FLOW_CONTEXT_CHANGED')
  expect(f.ports.recordAttempt).not.toHaveBeenCalled()
})

it('rejects a changed reserved number on reload rather than replacing its durable journal identity', async () => {
  const f = await fixture(), flow = await f.create(); await flow.run()
  f.state.frozen = await requestFromPreparedFiscalData(f.plan.prepared, 42)
  await expect(flow.reload()).rejects.toThrow('POSITIVE_FLOW_RELOAD_CHANGED')
  expect(f.ports.recordPrepared).toHaveBeenCalledTimes(1)
})

it('rejects a package hash mismatch before any I/O', async () => {
  const f = await fixture()
  await expect(createPositivePreparationFlow(f.config, 'f'.repeat(64), f.ports)).rejects.toThrow('POSITIVE_FLOW_PACKAGE_REJECTED')
  expect(f.ports.loadJournal).not.toHaveBeenCalled()
})

it('uses the real fsync journal across a flow reload, keeping both attempts and the exact body identity', async () => {
  const f = await fixture(), root = mkdtempSync(join(tmpdir(), 'kiosko-positive-flow-'))
  const path = join(root, 'journal.jsonl'), binding = { projectRef: f.config.projectRef, planSha256: String(f.plan.manifest.planSha256), operationId: f.config.operationId }
  let journal = openPositiveWindowJournal(path, binding, { create: true, assertExclusive: f.ports.assertAuthority })
  try {
    await journal.record('OPEN_ATTEMPT')
    await journal.record('OPEN_RECEIPT', { openedAt: '2026-10-28 15:10:01.123456+00' })
    await journal.record('FLAGS_ENABLED')
    f.ports.loadJournal.mockImplementation(async () => ({ ...journal.flowJournal() }))
    f.ports.recordAttempt.mockImplementation(async stage => { await journal.record(stage === 'save' ? 'SAVE_ATTEMPT' : 'BODY_ATTEMPT') })
    f.ports.recordPrepared.mockImplementation(async value => { await journal.record('PREPARED', value) })
    const flow = await f.create(), result = await flow.run()
    const beforeReload = readFileSync(path, 'utf8')
    journal.dispose()
    journal = openPositiveWindowJournal(path, binding, { assertExclusive: f.ports.assertAuthority })
    expect(await (await f.create()).reload()).toEqual(result)
    expect(readFileSync(path, 'utf8')).toBe(beforeReload)
    expect(journal.flowJournal().prepared).toEqual({ requestSha256: result.requestSha256, number: result.number })
    expect(journal.state().openedAt).toBe('2026-10-28 15:10:01.123456+00')
    expect(f.ports.recordAttempt.mock.calls).toEqual([['save'], ['body']])
  } finally {
    journal.dispose()
    if (dirname(resolve(root)) !== resolve(tmpdir()) || !basename(root).startsWith('kiosko-positive-flow-')) throw Error('Unexpected cleanup path')
    rmSync(root, { recursive: true, force: true })
  }
})
