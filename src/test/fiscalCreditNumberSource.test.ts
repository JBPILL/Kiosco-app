import { expect, it } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { validateFiscalCreditNumberSource } from '../../supabase/functions/_shared/fiscalCreditNumberSource'
import { validateFiscalWorkerBinding } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'

async function fixture() {
  const f = await fiscalCreditContextFixture(), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const prepared = await prepareFiscalCreditPreparation(f.source, f.proposal, context, { servicioDesde: null, servicioHasta: null, vencimientoPago: null })
  const packet = { preparacion: { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation, solicitud_id: f.input.solicitud_id,
    propuesta_sha256: f.proposal.sha256, estado: 'DATOS_NC_PREPARADOS', preparacion: { canonico: prepared.canonico, sha256: prepared.sha256 }, contexto: context,
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false },
    binding: { version: 1, entorno: 'HOMOLOGACION', servicio: 'wsfe', finalidad: 'NUMERACION_NC', venta_id: f.sale, operacion_origen_id: f.operation,
      solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, preparacion_sha256: prepared.sha256, kiosco_id: f.scope.kioskId, usuario_id: crypto.randomUUID(),
      actor_auth_id: f.actor, cuit_emisor: context.cuit_emisor, punto_venta: context.punto_venta, tipo_comprobante: context.tipo_nota_credito,
      credencial_id: crypto.randomUUID(), certificado_sha256: 'e'.repeat(64), revision_emisor: context.revision_emisor, revision_parametros: context.revision_parametros, emision_habilitada: false } }
  return { ...f, prepared, packet }
}
it('metadata NC cerrada y congelada no se acepta como binding de factura/TA heredado', async () => {
  const f = await fixture(), value = await validateFiscalCreditNumberSource(f.packet, f.source, f.proposal, f.actor, f.prepared.sha256)
  expect(value.binding).toEqual(f.packet.binding); expect(Object.isFrozen(value.binding)).toBe(true)
  expect(value.binding).not.toHaveProperty('operacion_id'); expect(value.binding).not.toHaveProperty('token')
  expect(() => validateFiscalWorkerBinding(value.binding, f.operation)).toThrow()
})
it.each(['extra', 'finalidad', 'actor', 'caso', 'operacion', 'preparacion', 'cuit', 'pv', 'tipo', 'revision', 'catalogo', 'credencial', 'certificado', 'permiso', 'cancelada'])('rechaza metadata NC %s', async reason => {
  const f = await fixture(), packet: { preparacion: unknown; binding: Record<string, unknown> } = structuredClone(f.packet)
  if (reason === 'extra') packet.binding.operacion_id = f.operation
  if (reason === 'finalidad') packet.binding.finalidad = 'EMISION'
  if (reason === 'actor') packet.binding.actor_auth_id = crypto.randomUUID()
  if (reason === 'caso') packet.binding.solicitud_id = crypto.randomUUID()
  if (reason === 'operacion') packet.binding.operacion_origen_id = crypto.randomUUID()
  if (reason === 'preparacion') packet.binding.preparacion_sha256 = 'a'.repeat(64)
  if (reason === 'cuit') packet.binding.cuit_emisor = '20123456789'
  if (reason === 'pv') packet.binding.punto_venta = 2
  if (reason === 'tipo') packet.binding.tipo_comprobante = 11
  if (reason === 'revision') packet.binding.revision_emisor = 2
  if (reason === 'catalogo') packet.binding.revision_parametros = 2
  if (reason === 'credencial') packet.binding.credencial_id = 'bad'
  if (reason === 'certificado') packet.binding.certificado_sha256 = null
  if (reason === 'permiso') packet.binding.emision_habilitada = true
  if (reason === 'cancelada') packet.preparacion = { ...f.packet.preparacion, estado: 'CANCELADA' }
  await expect(validateFiscalCreditNumberSource(packet, f.source, f.proposal, f.actor, f.prepared.sha256)).rejects.toThrow('FISCAL_FUENTE_NUMERACION_NC_INVALIDA')
})
it('captura metadata antes de await; no hereda cambio de credencial posterior', async () => {
  const f = await fixture(), expected = f.packet.binding.credencial_id
  const pending = validateFiscalCreditNumberSource(f.packet, f.source, f.proposal, f.actor, f.prepared.sha256)
  f.packet.binding.credencial_id = crypto.randomUUID()
  expect((await pending).binding.credencial_id).toBe(expected)
})
