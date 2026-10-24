import { expect, it } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { prepareFiscalCreditRequest } from '../../supabase/functions/_shared/fiscalCreditRequest'
import type { FiscalCreditReservation } from '../../supabase/functions/_shared/fiscalCreditRequest'
import { freezeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'

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
