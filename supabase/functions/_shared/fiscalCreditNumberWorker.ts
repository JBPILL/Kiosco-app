import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import type { FiscalCreditDraftScope } from './fiscalCreditDraftAck.ts'
import type { FiscalTicketKeys } from './fiscalSharedTickets.ts'
import type { GuardedCreditWsaaTicketLoader } from './fiscalCreditSharedTickets.ts'
import { createSharedFiscalCreditTicketLoader } from './fiscalCreditSharedTickets.ts'
import { validateFiscalRepresentation } from './fiscalRepresentation.ts'
import { validateFiscalCreditDraftProposal } from './fiscalCreditDraft.ts'
import { validateFiscalCreditNumberSource } from './fiscalCreditNumberSource.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import type { FiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { consultLastFiscalCreditNumber } from './fiscalCreditNumberXml.ts'
import { fiscalUuid, fiscalSha } from './fiscalReplacement.ts'
import { FISCAL_STAGING_URL } from './fiscalSupabaseAdmin.ts'

export interface FiscalCreditNumberDependencies {
  admin: FiscalAuthClient
  readSecret: (name: string) => string | undefined
  keys: FiscalTicketKeys
  wsaa: GuardedCreditWsaaTicketLoader
  fetcher: typeof fetch
}
const fail = (): never => { throw new Error('FISCAL_NUMERACION_NC_NO_CONFIRMADA') }
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  return value as Record<string, unknown>
}
/** Sólo reserva/cuerpo; nunca solicita CAE. Sin endpoint ni activación implícita.
 * reservationId debe conservarse por el llamador; recuperación siempre precede TA. */
export async function prepareFiscalCreditNumber(deps: FiscalCreditNumberDependencies, token: string, input: FiscalCreditDraftScope,
  preparationSha: string, reservationId: string): Promise<Readonly<FiscalCreditRequestRecord>> {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 45000)
  try {
    const scope = Object.freeze({ ...input })
    if (!fiscalUuid(scope.saleId) || !fiscalUuid(scope.operationId) || !fiscalUuid(scope.requestId) || !fiscalSha(scope.sha256)
      || !fiscalSha(preparationSha) || !fiscalUuid(reservationId) || typeof token !== 'string' || token.length > 16384 || !/^\S+$/.test(token)) return fail()
    const backend = () => {
      if (controller.signal.aborted || deps.readSecret('SUPABASE_URL') !== FISCAL_STAGING_URL || deps.readSecret('ARCA_HOMO_BACKEND_ENABLED') !== 'true') return fail()
    }
    const enabled = () => { backend(); if (deps.readSecret('ARCA_HOMO_CREDIT_NUMBERING_ENABLED') !== 'true') return fail() }
    backend()
    const auth = await deps.admin.auth.getUser(token), actor = auth.data.user?.id
    if (auth.error || !fiscalUuid(actor)) return fail()
    const response = await deps.admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: actor, p_venta_id: scope.saleId, p_operacion_id: scope.operationId })
    if (response.error) return fail()
    const original = await validateFiscalRepresentation(response.data, scope.saleId, scope.operationId)
    const args = { p_actor_auth_id: actor, p_venta_id: scope.saleId, p_operacion_origen_id: scope.operationId, p_id: scope.requestId, p_sha: scope.sha256 }
    const proposal = async (packet: unknown) => {
      const prep = record(record(packet).preparacion), value = await validateFiscalCreditDraftProposal(original, prep.propuesta)
      if (value.sha256 !== scope.sha256 || value.datos.solicitud_id !== scope.requestId) return fail()
      return value
    }
    const read = async () => {
      backend()
      const result = await deps.admin.rpc('cargar_fuente_cuerpo_nc_homologacion', args)
      if (result.error) return fail()
      if (result.data === null) return null
      const value = await validateFiscalCreditRequestRecord(result.data, original, await proposal(result.data))
      if (value.datos.preparacion_sha256 !== preparationSha) return fail()
      return value
    }
    const recovered = await read()
    if (recovered) return recovered
    enabled()
    const source = async () => {
      enabled()
      const result = await deps.admin.rpc('cargar_fuente_numeracion_nc_homologacion', { ...args, p_preparacion_sha: preparationSha })
      if (result.error) return fail()
      return validateFiscalCreditNumberSource(result.data, original, await proposal(result.data), actor, preparationSha)
    }
    try {
      const initial = await source(), binding = initial.binding
      const guard = async () => {
        const fresh = await source()
        if (JSON.stringify(fresh.binding) !== JSON.stringify(binding) || fresh.preparacion.preparacion.canonico !== initial.preparacion.preparacion.canonico) return fail()
        enabled()
      }
      const ticket = await createSharedFiscalCreditTicketLoader(deps.admin, deps.keys, deps.wsaa, guard)(binding, controller.signal)
      if (ticket.cuitEmisor !== binding.cuit_emisor || ticket.credencialId !== binding.credencial_id || ticket.certificadoSha256 !== binding.certificado_sha256) return fail()
      const last = await consultLastFiscalCreditNumber({ entorno: 'HOMOLOGACION', cuitEmisor: binding.cuit_emisor,
        puntoVenta: binding.punto_venta, tipoComprobante: binding.tipo_comprobante }, ticket, deps.fetcher, guard)
      enabled()
      if (last.ultimo >= 99999999) return fail()
      try {
        await deps.admin.rpc('reservar_cuerpo_nc_homologacion', { ...args, p_preparacion_sha: preparationSha, p_reserva_id: reservationId,
          p_ultimo_autorizado: last.ultimo, p_consultado_en: last.consultado_en })
      } catch { /* ACK perdido: sólo lectura con la identidad original; nunca otro POST. */ }
    } catch { /* Otro trabajador pudo reservar; recuperación sin repetir consulta ni escritura. */ }
    const confirmed = await read()
    if (!confirmed) return fail()
    return confirmed
  } catch { return fail() } finally { clearTimeout(timer); controller.abort() }
}
