import { expect, it, vi } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { prepareFiscalCreditRequest, validateFiscalCreditRequestRecord } from '../../supabase/functions/_shared/fiscalCreditRequest'
import type { FiscalCreditReservation } from '../../supabase/functions/_shared/fiscalCreditRequest'
import { freezeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import { loadFiscalCreditRequest } from '../../supabase/functions/_shared/fiscalCreditDraftService'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { validateFiscalCreditOwnerReview, fiscalCreditOwnerReviewWire, validateFiscalCreditOwnerReviewWire } from '../../supabase/functions/_shared/fiscalCreditOwnerReview'
import { createFiscalCreditClient } from '../lib/fiscalCreditClient'

async function fixture(invoice: 1 | 6 | 11 = 11, concept: 1 | 2 | 3 = 1) {
  const f = await fiscalCreditContextFixture(invoice, concept), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const entry = concept === 1 ? { servicioDesde: null, servicioHasta: null, vencimientoPago: null }
    : { servicioDesde: '20261002', servicioHasta: '20261019', vencimientoPago: '20261027' }
  const prepared = await prepareFiscalCreditPreparation(f.source, f.proposal, context, entry)
  const wire = { version: 1, estado: 'DATOS_NC_PREPARADOS', contexto: context, preparacion: { canonico: prepared.canonico, sha256: prepared.sha256 },
    emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  const reservation: FiscalCreditReservation = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, preparacion_sha256: prepared.sha256, reserva_id: crypto.randomUUID(),
    cuit_emisor: context.cuit_emisor, punto_venta: context.punto_venta, tipo_comprobante: context.tipo_nota_credito, numero: 23, estado: 'RESERVADA', emision_habilitada: false }
  return { ...f, entry, prepared, wire, reservation }
}
async function recordFixture() {
  const f = await fixture(), request = await prepareFiscalCreditRequest(f.source, f.proposal, f.wire, f.reservation)
  const packet = { preparacion: { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, estado: f.wire.estado, preparacion: f.wire.preparacion, contexto: f.wire.contexto,
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false },
    reserva: f.reservation, cuerpo: { canonico: request.canonico, sha256: request.sha256 } }
  return { ...f, packet, request }
}
async function reviewClientFixture() {
  const f = await recordFixture(), review = await validateFiscalCreditOwnerReview({ version: 1, cuerpo: f.packet, aprobacion: null, emision_habilitada: false }, f.source, f.proposal)
  const wire = fiscalCreditOwnerReviewWire(review), local = new Map<string, string>(), state = { stored: false, visible: true, id: '' }
  const storage = { getItem: (key: string) => local.get(key) ?? null, setItem: (key: string, value: string) => { local.set(key, value) } }
  const invoke = vi.fn(async (command: Record<string, unknown>) => {
    if (command.accion === 'APROBAR_REVISION_NC') { state.stored = true; state.id = String(command.revision_id); throw new Error('LOST_ACK') }
    if (command.revision_id === null) return wire
    if (!state.stored || !state.visible || command.revision_id !== state.id) throw new Error('NOT_CONFIRMED')
    return { ...wire, aprobacion: { id: state.id, solicitud_id: f.input.solicitud_id, reserva_id: f.reservation.reserva_id,
      solicitud_sha256: f.request.sha256, preparacion_sha256: f.prepared.sha256, aprobada: true, vence_en: '2026-10-24T23:00:00Z', emision_habilitada: false } }
  })
  const make = () => createFiscalCreditClient(f.scope, { storage, invoke, exclusive: async task => task() })
  return { ...f, review, wireReview: wire, local, state, storage, invoke, make, client: make() }
}
async function numberClientFixture() {
  const f = await reviewClientFixture(), state = { stored: false, visible: true, gate: true }
  const invoke = vi.fn<(command: Record<string, unknown>) => Promise<unknown>>(async command => {
    if (command.accion === 'NUMERAR_NC') { if (!state.gate) throw new Error('GATE_CLOSED'); state.stored = true; throw new Error('LOST_ACK') }
    if (command.accion !== 'CUERPO_NC') throw new Error('UNEXPECTED')
    if (!state.visible) throw new Error('UNKNOWN_GET')
    return state.stored ? f.wireReview : null
  })
  const make = () => createFiscalCreditClient(f.scope, { storage: f.storage, invoke, exclusive: async task => task() })
  return { ...f, state, invoke, make, client: make() }
}
it('numeración persiste identidad antes de POST y confirma ACK perdido por cuerpo durable', async () => {
  const f = await numberClientFixture(), base = f.invoke.getMockImplementation()!
  f.invoke.mockImplementation(async cmd => {
    if (cmd.accion === 'NUMERAR_NC') {
      expect(f.client.pendingNumber()?.reservationId).toBe(cmd.reserva_id)
      expect(Object.keys(f.client.pendingNumber()!).sort()).toEqual(['version', 'operationId', 'requestId', 'proposalSha', 'preparationSha', 'reservationId'].sort())
      expect(JSON.stringify([...f.local.values()])).not.toContain('canonico')
    }
    return base(cmd)
  })
  const result = await f.client.number(f.source, f.proposal, f.wire)
  expect(result.cuerpo.datos.reserva_id).toBe(f.reservation.reserva_id); expect(f.client.pendingNumber()).toBeNull()
  // La respuesta durable del mismo caso/preparación puede pertenecer al trabajador que ganó la carrera.
  expect(result.cuerpo.datos.reserva_id).not.toBe(f.invoke.mock.calls.find(([cmd]) => cmd.accion === 'NUMERAR_NC')?.[0].reserva_id)
  expect(f.invoke.mock.calls.map(([cmd]) => cmd.accion)).toEqual(['CUERPO_NC', 'NUMERAR_NC', 'CUERPO_NC'])
})
it('numeración pendiente sobrevive recarga y bloquea cambios sin repetir POST', async () => {
  const f = await numberClientFixture(); f.state.gate = false
  await expect(f.client.number(f.source, f.proposal, f.wire)).rejects.toThrow()
  const record = f.client.pendingNumber(); expect(record).not.toBeNull()
  await expect(f.make().number(f.source, f.proposal, f.wire)).rejects.toThrow()
  await expect(f.client.save(f.source, f.input)).rejects.toThrow()
  await expect(f.client.cancel(f.operation, f.input.solicitud_id, f.proposal.sha256)).rejects.toThrow()
  await expect(f.client.approveReview(f.source, f.proposal, f.wire, f.review)).rejects.toThrow()
  expect(f.invoke.mock.calls.filter(([cmd]) => cmd.accion === 'NUMERAR_NC')).toHaveLength(1)
  expect(f.client.pendingNumber()).toEqual(record)
})
it('reintento manual de numeración conserva UUID tras ausencia confirmada', async () => {
  const f = await numberClientFixture(); f.state.gate = false
  await expect(f.client.number(f.source, f.proposal, f.wire)).rejects.toThrow()
  f.state.gate = true
  expect((await f.make().retryNumber(f.source, f.proposal, f.wire)).cuerpo.sha256).toBe(f.request.sha256)
  const posts = f.invoke.mock.calls.map(([cmd]) => cmd).filter(cmd => cmd.accion === 'NUMERAR_NC')
  expect(posts).toHaveLength(2); expect(posts[0]).toEqual(posts[1]); expect(f.client.pendingNumber()).toBeNull()
})
it('error de lectura no habilita reintento de numeración ni elimina pendiente', async () => {
  const f = await numberClientFixture(); f.state.gate = false
  await expect(f.client.number(f.source, f.proposal, f.wire)).rejects.toThrow()
  f.state.visible = false; f.state.gate = true
  await expect(f.client.retryNumber(f.source, f.proposal, f.wire)).rejects.toThrow()
  expect(f.invoke.mock.calls.filter(([cmd]) => cmd.accion === 'NUMERAR_NC')).toHaveLength(1); expect(f.client.pendingNumber()).not.toBeNull()
})
it('cuerpo existente se recupera sin POST ni identidad nueva', async () => {
  const f = await numberClientFixture(); f.state.stored = true
  expect((await f.client.number(f.source, f.proposal, f.wire)).cuerpo.sha256).toBe(f.request.sha256)
  expect(f.invoke.mock.calls.map(([cmd]) => cmd.accion)).toEqual(['CUERPO_NC']); expect(f.local.size).toBe(0)
})
it('storage fallido impide solicitud de numeración', async () => {
  const f = await numberClientFixture(), client = createFiscalCreditClient(f.scope, { storage: { ...f.storage, setItem: () => { throw new Error('UNAVAILABLE') } }, invoke: f.invoke, exclusive: async task => task() })
  await expect(client.number(f.source, f.proposal, f.wire)).rejects.toThrow()
  expect(f.invoke.mock.calls.some(([cmd]) => cmd.accion === 'NUMERAR_NC')).toBe(false)
})
it('cliente revisión persiste identidad sin PII antes de POST y recupera ACK perdido', async () => {
  const f = await reviewClientFixture(), base = f.invoke.getMockImplementation()!
  f.invoke.mockImplementation(async command => {
    if (command.accion === 'APROBAR_REVISION_NC') {
      expect(f.client.pendingReview()?.reviewId).toBe(command.revision_id)
      expect(JSON.stringify([...f.local.values()])).not.toContain('canonico')
      expect(Object.keys(f.client.pendingReview()!).sort()).toEqual(['version', 'operationId', 'requestId', 'proposalSha', 'preparationSha', 'bodySha', 'reviewId'].sort())
    }
    return base(command)
  })
  const result = await f.client.approveReview(f.source, f.proposal, f.wire, f.review)
  expect(result.aprobacion?.id).toBe(f.state.id); expect(f.client.pendingReview()).toBeNull()
  expect(f.invoke.mock.calls.map(([cmd]) => cmd.accion)).toEqual(['REVISION_NC', 'APROBAR_REVISION_NC', 'REVISION_NC'])
})
it('revisión incierta sobrevive recarga y sólo recupera por GET, bloqueando mutaciones', async () => {
  const f = await reviewClientFixture(); f.state.visible = false
  await expect(f.client.approveReview(f.source, f.proposal, f.wire, f.review)).rejects.toThrow()
  const record = f.client.pendingReview(); expect(record?.reviewId).toBe(f.state.id)
  await expect(f.make().approveReview(f.source, f.proposal, f.wire, f.review)).rejects.toThrow()
  await expect(f.client.save(f.source, f.input)).rejects.toThrow()
  expect(f.invoke.mock.calls.filter(([cmd]) => cmd.accion === 'APROBAR_REVISION_NC')).toHaveLength(1)
  f.state.visible = true
  expect((await f.make().recoverReview(f.source, f.proposal, f.wire))?.aprobacion?.id).toBe(record?.reviewId)
  expect(f.client.pendingReview()).toBeNull()
})
it('fallo de persistencia local impide POST de aprobación', async () => {
  const f = await reviewClientFixture(), client = createFiscalCreditClient(f.scope, { storage: { ...f.storage, setItem: () => { throw new Error('STORAGE_UNAVAILABLE') } }, invoke: f.invoke, exclusive: async task => task() })
  await expect(client.approveReview(f.source, f.proposal, f.wire, f.review)).rejects.toThrow()
  expect(f.invoke.mock.calls.some(([cmd]) => cmd.accion === 'APROBAR_REVISION_NC')).toBe(false)
})
it('ACK de otro UUID conserva pendiente hasta recuperar evidencia del UUID original', async () => {
  const f = await reviewClientFixture(), base = f.invoke.getMockImplementation()!, other = crypto.randomUUID()
  f.invoke.mockImplementation(async command => {
    const result = await base(command)
    if (command.accion === 'REVISION_NC' && command.revision_id !== null && result.aprobacion) return { ...result, aprobacion: { ...result.aprobacion, id: other } }
    return result
  })
  await expect(f.client.approveReview(f.source, f.proposal, f.wire, f.review)).rejects.toThrow()
  expect(f.client.pendingReview()?.reviewId).toBe(f.state.id)
  f.invoke.mockImplementation(base)
  expect((await f.client.recoverReview(f.source, f.proposal, f.wire))?.aprobacion?.id).toBe(f.state.id)
})
it('reintento explícito tras POST no ejecutado conserva UUID y confirma sólo por GET', async () => {
  const f = await reviewClientFixture(), base = f.invoke.getMockImplementation()!
  f.invoke.mockImplementation(async cmd => { if (cmd.accion === 'APROBAR_REVISION_NC') throw new Error('GATE_CLOSED'); return base(cmd) })
  await expect(f.client.approveReview(f.source, f.proposal, f.wire, f.review)).rejects.toThrow()
  const pending = f.client.pendingReview(); expect(pending).not.toBeNull()
  f.invoke.mockImplementation(base)
  const result = await f.make().retryReview(f.source, f.proposal, f.wire, f.review)
  expect(result.aprobacion?.id).toBe(pending?.reviewId); expect(f.client.pendingReview()).toBeNull()
  const posts = f.invoke.mock.calls.map(([cmd]) => cmd).filter(cmd => cmd.accion === 'APROBAR_REVISION_NC')
  expect(posts).toHaveLength(2); expect(posts[0]).toEqual(posts[1])
})
it('reintento recupera aprobación ya existente sin repetir POST', async () => {
  const f = await reviewClientFixture(); f.state.visible = false
  await expect(f.client.approveReview(f.source, f.proposal, f.wire, f.review)).rejects.toThrow()
  f.state.visible = true
  expect((await f.client.retryReview(f.source, f.proposal, f.wire, f.review)).aprobacion?.id).toBe(f.state.id)
  expect(f.invoke.mock.calls.filter(([cmd]) => cmd.accion === 'APROBAR_REVISION_NC')).toHaveLength(1)
})
it('reintento sin pendiente no crea identidad ni envía solicitudes', async () => {
  const f = await reviewClientFixture()
  await expect(f.client.retryReview(f.source, f.proposal, f.wire, f.review)).rejects.toThrow()
  expect(f.invoke).not.toHaveBeenCalled()
})
it.each(['canonico', 'hash', 'extra', 'approval', 'preparation'])('wire revisión NC %s alterado se rechaza por reconstrucción', async reason => {
  const f = await reviewClientFixture(), wire = structuredClone(f.wireReview)
  const input = reason === 'canonico' ? { ...wire, cuerpo: { ...wire.cuerpo, canonico: ` ${wire.cuerpo.canonico}` } }
    : reason === 'hash' ? { ...wire, cuerpo: { ...wire.cuerpo, sha256: 'e'.repeat(64) } }
    : reason === 'extra' ? { ...wire, extra: true } : reason === 'approval' ? { ...wire, aprobacion: { id: crypto.randomUUID() } } : wire
  await expect(validateFiscalCreditOwnerReviewWire(input, f.source, f.proposal, reason === 'preparation' ? { ...f.wire, estado: 'CANCELADA' } : f.wire)).rejects.toThrow('FISCAL_REVISION_NC_NO_CONFIRMADA')
})
it('valida cuerpo durable reconstruido; no acredita permiso ni pierde inmutabilidad', async () => {
  const f = await recordFixture(), stored = await validateFiscalCreditRequestRecord(f.packet, f.source, f.proposal)
  expect(stored).toEqual({ ...f.request, estado: 'CUERPO_NC_RESERVADO' })
  expect(Object.isFrozen(stored.datos.solicitud)).toBe(true)
})
it.each(['extra', 'hash', 'canonico', 'reserva', 'preparacion', 'numero'])('rechaza evidencia durable alterada %s', async reason => {
  const f = await recordFixture(), packet: Record<string, unknown> = structuredClone(f.packet)
  if (reason === 'extra') packet.extra = true
  if (reason === 'hash') packet.cuerpo = { ...f.packet.cuerpo, sha256: 'a'.repeat(64) }
  if (reason === 'canonico') packet.cuerpo = { ...f.packet.cuerpo, canonico: ` ${f.request.canonico}` }
  if (reason === 'reserva') packet.reserva = { ...f.reservation, reserva_id: crypto.randomUUID() }
  if (reason === 'preparacion') packet.preparacion = { ...f.packet.preparacion, estado: 'CANCELADA' }
  if (reason === 'numero') packet.reserva = { ...f.reservation, numero: 24 }
  await expect(validateFiscalCreditRequestRecord(packet, f.source, f.proposal)).rejects.toThrow('FISCAL_CUERPO_NC_INVALIDO')
})
it('servicio consulta Auth una vez, scope/hash exactos, sólo null significa ausencia', async () => {
  const f = await recordFixture(), getUser = vi.fn<FiscalAuthClient['auth']['getUser']>(async () => ({ data: { user: { id: f.actor } }, error: null }))
  // La representación original proviene del fixture, no del wire de preparación.
  const original = (await import('../../supabase/functions/_shared/fiscalRepresentation')).fiscalRepresentationWire(f.source)
  const rpc = vi.fn<FiscalAuthClient['rpc']>(async name => ({ data: name === 'cargar_representacion_fiscal_homologacion' ? original : f.packet, error: null }))
  const admin = { auth: { getUser }, rpc }, scope = { saleId: f.sale, operationId: f.operation, requestId: f.input.solicitud_id, sha256: f.proposal.sha256 }
  expect((await loadFiscalCreditRequest(admin, 'SYNTHETIC_JWT', scope))?.sha256).toBe(f.request.sha256)
  expect(getUser).toHaveBeenCalledTimes(1)
  expect(rpc.mock.calls.map(([name]) => name)).toEqual(['cargar_representacion_fiscal_homologacion', 'cargar_fuente_cuerpo_nc_homologacion'])
  for (const [, args] of rpc.mock.calls) expect(args.p_actor_auth_id).toBe(f.actor)
  const base = rpc.getMockImplementation()!
  for (const data of [null, undefined]) {
    rpc.mockImplementation(async (name, args) => name === 'cargar_fuente_cuerpo_nc_homologacion' ? { data, error: null } : base(name, args))
    if (data === null) expect(await loadFiscalCreditRequest(admin, 'SYNTHETIC_JWT', scope)).toBeNull()
    else await expect(loadFiscalCreditRequest(admin, 'SYNTHETIC_JWT', scope)).rejects.toThrow('FISCAL_NC_NO_CONFIRMADA')
  }
})
it.each([[1, 1], [6, 1], [11, 1], [11, 2], [11, 3]] as const)('cuerpo NC factura%i concepto%i conserva datos/asociación, añade número propio sin ampliar factura v1', async (invoice, concept) => {
  const f = await fixture(invoice, concept), result = await prepareFiscalCreditRequest(f.source, f.proposal, f.wire, f.reservation)
  expect(result.estado).toBe('CUERPO_NC_NO_PERSISTIDO'); expect(result.emision_habilitada).toBe(false)
  expect(result.datos.solicitud).toEqual({ ...f.prepared.datos.datos, version: 1, entorno: 'HOMOLOGACION', numero: 23 })
  expect(result.datos.solicitud.comprobantesAsociados[0].numero).toBe(1)
  expect(JSON.parse(result.canonico)).toEqual(result.datos); expect(result.sha256).toMatch(/^[a-f0-9]{64}$/)
  expect(Object.isFrozen(result.datos.solicitud.comprobantesAsociados[0])).toBe(true)
  await expect(freezeFiscalRequest(result.datos.solicitud)).rejects.toThrow()
})
it.each(['extra', 'falta', 'otroCaso', 'preparacion', 'propuesta', 'cuit', 'pv', 'tipo', 'fraccion', 'cero', 'exceso', 'coercion', 'estado', 'permiso', 'reserva', 'cancelada'] as const)('rechaza reserva/cuerpo %s', async reason => {
  const f = await fixture(), reservation: Record<string, unknown> = { ...f.reservation }
  if (reason === 'extra') reservation.credencial = 'NO_PRIVATE_DATA'
  if (reason === 'falta') delete reservation.numero
  if (reason === 'otroCaso') reservation.solicitud_id = crypto.randomUUID()
  if (reason === 'preparacion') reservation.preparacion_sha256 = 'a'.repeat(64)
  if (reason === 'propuesta') reservation.propuesta_sha256 = 'a'.repeat(64)
  if (reason === 'cuit') reservation.cuit_emisor = '20123456789'
  if (reason === 'pv') reservation.punto_venta = 2
  if (reason === 'tipo') reservation.tipo_comprobante = 11
  if (reason === 'fraccion') reservation.numero = 1.5
  if (reason === 'cero') reservation.numero = 0
  if (reason === 'exceso') reservation.numero = 100000000
  if (reason === 'coercion') reservation.numero = '23'
  if (reason === 'estado') reservation.estado = 'AUTORIZADA'
  if (reason === 'permiso') reservation.emision_habilitada = true
  if (reason === 'reserva') reservation.reserva_id = 'bad'
  const wire = reason === 'cancelada' ? { ...f.wire, estado: 'CANCELADA' } : f.wire
  await expect(prepareFiscalCreditRequest(f.source, f.proposal, wire, reservation)).rejects.toThrow('FISCAL_CUERPO_NC_INVALIDO')
})
it('captura reserva antes de await y no cambia silenciosamente el número', async () => {
  const f = await fixture(), pending = prepareFiscalCreditRequest(f.source, f.proposal, f.wire, f.reservation)
  f.reservation.numero = 24
  expect((await pending).datos.solicitud.numero).toBe(23)
})
