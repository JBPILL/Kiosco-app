import { expect, it, vi } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation, validateFiscalCreditPreparationRecord, fiscalCreditPreparationWire } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { createFiscalClient } from '../lib/fiscalClient'

const periods = { servicioDesde: null, servicioHasta: null, vencimientoPago: null }
async function fixture() {
  const f = await fiscalCreditContextFixture(), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const prepared = await prepareFiscalCreditPreparation(f.source, f.proposal, context, periods)
  const record = await validateFiscalCreditPreparationRecord({ version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, estado: 'DATOS_NC_PREPARADOS', contexto: context,
    preparacion: { canonico: prepared.canonico, sha256: prepared.sha256 }, propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 },
    emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }, f.source, f.proposal)
  const wire = fiscalCreditPreparationWire(record), local = new Map<string, string>()
  const storage = { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => { local.set(key, value) } }
  const state = { stored: false, visible: true }
  const send = vi.fn<(command: Record<string, unknown>) => Promise<unknown>>(async (command: Record<string, unknown>) => {
    if (command.accion === 'GUARDAR_PREPARACION_NC') { state.stored = true; throw new Error('LOST_ACK') }
    return { version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado: state.stored && state.visible ? wire : null }
  })
  const make = () => createFiscalClient(f.scope, { storage, send })
  return { ...f, context, prepared, record, wire, local, storage, state, send, make, client: make() }
}
it('persiste sólo identidad antes de POST y confirma ACK perdido por lectura durable', async () => {
  const f = await fixture(), base = f.send.getMockImplementation()!
  f.send.mockImplementation(async command => {
    if (command.accion === 'GUARDAR_PREPARACION_NC') {
      const pending = f.client.credits.pendingPreparation()
      expect(pending?.preparationSha).toBe(f.prepared.sha256)
      expect(Object.keys(pending!).sort()).toEqual(['version', 'operationId', 'requestId', 'proposalSha', 'preparationSha', 'contextSha'].sort())
    }
    return base(command)
  })
  expect(await f.client.credits.savePreparation(f.source, f.proposal, f.context, periods)).toEqual(f.record)
  expect(f.client.credits.pendingPreparation()).toBeNull()
  expect(f.send.mock.calls.map(([command]) => command.accion)).toEqual(['PREPARACION_NC', 'GUARDAR_PREPARACION_NC', 'PREPARACION_NC'])
})
it('conserva pendiente tras recarga, bloquea cancelación y recupera sin POST', async () => {
  const f = await fixture(); f.state.visible = false
  await expect(f.client.credits.savePreparation(f.source, f.proposal, f.context, periods)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
  expect(f.client.credits.pendingPreparation()?.preparationSha).toBe(f.prepared.sha256)
  const next = f.make(); f.send.mockClear()
  await expect(next.credits.cancel(f.operation, crypto.randomUUID(), f.proposal.sha256)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
  expect(f.send).not.toHaveBeenCalled()
  expect(await next.credits.recoverPreparation(f.source, f.proposal)).toBeNull()
  expect(next.credits.pendingPreparation()).not.toBeNull()
  f.state.visible = true
  expect(await next.credits.recoverPreparation(f.source, f.proposal)).toEqual(f.record)
  expect(next.credits.pendingPreparation()).toBeNull()
  expect(f.send.mock.calls.every(([command]) => command.accion === 'PREPARACION_NC')).toBe(true)
})
it.each(['confirmada', 'ACK perdido'])('cancelación %s cierra mismo caso antes de retirar preparación incierta', async mode => {
  const f = await fixture(); f.state.visible = false
  await expect(f.client.credits.savePreparation(f.source, f.proposal, f.context, periods)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
  const envelope = (resultado: unknown) => ({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado })
  let cancelled = false
  f.send.mockImplementation(async command => {
    if (command.accion === 'CANCELAR_BORRADOR_NC') {
      expect(f.client.credits.pendingPreparation()).not.toBeNull()
      expect(f.client.credits.pending()?.intention).toBe('CANCELAR')
      cancelled = true
      if (mode === 'ACK perdido') throw new Error('LOST_CANCEL_ACK')
    }
    return envelope({ ...f.ack, estado: cancelled ? 'CANCELADA' : 'SALDO_RESERVADO_NO_EMITIR' })
  })
  expect((await f.client.credits.cancel(f.operation, f.input.solicitud_id, f.proposal.sha256)).estado).toBe('CANCELADA')
  expect(f.client.credits.pendingPreparation()).toBeNull(); expect(f.client.credits.pending()).toBeNull()
})
it('fallo al confirmar cancelación conserva ambos pendientes y permite recuperar tras recarga', async () => {
  const f = await fixture(); f.state.visible = false
  await expect(f.client.credits.savePreparation(f.source, f.proposal, f.context, periods)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
  let reads = 0
  const envelope = (resultado: unknown) => ({ version: 1, entorno: 'HOMOLOGACION', emision_habilitada: false, resultado })
  f.send.mockImplementation(async command => {
    if (command.accion === 'BORRADOR_NC' && ++reads === 1) return envelope(f.ack)
    throw new Error('UNCERTAIN_CANCEL')
  })
  await expect(f.client.credits.cancel(f.operation, f.input.solicitud_id, f.proposal.sha256)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
  expect(f.client.credits.pendingPreparation()).not.toBeNull(); expect(f.client.credits.pending()?.intention).toBe('CANCELAR')
  f.send.mockImplementation(async () => envelope({ ...f.ack, estado: 'CANCELADA' }))
  const next = f.make()
  expect((await next.credits.recover())?.estado).toBe('CANCELADA')
  expect(next.credits.pendingPreparation()).toBeNull(); expect(next.credits.pending()).toBeNull()
})
it('fallo de persistencia impide POST', async () => {
  const f = await fixture(), client = createFiscalClient(f.scope, { storage: { getItem: () => null, setItem: () => { throw new Error('QUOTA') } }, send: f.send })
  await expect(client.credits.savePreparation(f.source, f.proposal, f.context, periods)).rejects.toThrow('FISCAL_NC_CLIENTE_NO_CONFIRMADO')
  expect(f.send).toHaveBeenCalledTimes(1); expect(f.state.stored).toBe(false)
})
it('dos instancias comparten exclusión por venta y no duplican POST', async () => {
  const f = await fixture(), next = f.make()
  const results = await Promise.all([f.client.credits.savePreparation(f.source, f.proposal, f.context, periods), next.credits.savePreparation(f.source, f.proposal, f.context, periods)])
  expect(results).toEqual([f.record, f.record])
  expect(f.send.mock.calls.filter(([command]) => command.accion === 'GUARDAR_PREPARACION_NC')).toHaveLength(1)
})
