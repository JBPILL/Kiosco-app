import type { FiscalAuthClient } from './fiscalWorkerAuthorization.ts'
import type { FiscalCreditDraftScope } from './fiscalCreditDraftAck.ts'
import type { FiscalCreditOwnerReview } from './fiscalCreditOwnerReview.ts'
import { validateFiscalCreditOwnerReview } from './fiscalCreditOwnerReview.ts'
import { validateFiscalRepresentation } from './fiscalRepresentation.ts'
import { validateFiscalCreditDraftProposal } from './fiscalCreditDraft.ts'
import { fiscalUuid, fiscalSha } from './fiscalReplacement.ts'

const fail = (): never => { throw new Error('FISCAL_REVISION_NC_NO_CONFIRMADA') }
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail()
  return value as Record<string, unknown>
}
async function session(admin: FiscalAuthClient, token: string, input: FiscalCreditDraftScope) {
  const scope = Object.freeze({ ...input })
  if (!fiscalUuid(scope.saleId) || !fiscalUuid(scope.operationId) || !fiscalUuid(scope.requestId) || !fiscalSha(scope.sha256)
    || typeof token !== 'string' || token.length > 16384 || !/^\S+$/.test(token)) return fail()
  const auth = await admin.auth.getUser(token), actor = auth.data.user?.id
  if (auth.error || !fiscalUuid(actor)) return fail()
  const result = await admin.rpc('cargar_representacion_fiscal_homologacion', { p_actor_auth_id: actor, p_venta_id: scope.saleId, p_operacion_id: scope.operationId })
  if (result.error) return fail()
  const original = await validateFiscalRepresentation(result.data, scope.saleId, scope.operationId)
  const args = Object.freeze({ p_actor_auth_id: actor, p_venta_id: scope.saleId, p_operacion_origen_id: scope.operationId, p_id: scope.requestId, p_sha: scope.sha256 })
  const read = async (revisionId: string | null): Promise<Readonly<FiscalCreditOwnerReview>> => {
    const response = await admin.rpc('cargar_revision_nc_homologacion', { ...args, p_revision_id: revisionId })
    if (response.error) return fail()
    const packet = structuredClone(response.data)
    const proposal = await validateFiscalCreditDraftProposal(original, object(object(object(packet).cuerpo).preparacion).propuesta)
    if (proposal.datos.solicitud_id !== scope.requestId || proposal.sha256 !== scope.sha256) return fail()
    const review = await validateFiscalCreditOwnerReview(packet, original, proposal)
    if (revisionId === null ? review.aprobacion !== null : review.aprobacion?.id !== revisionId) return fail()
    return review
  }
  return { args, read }
}
/** Lectura histórica: aprobación devuelta no significa permiso vigente de emisión. */
export async function loadFiscalCreditOwnerReview(admin: FiscalAuthClient, token: string, scope: FiscalCreditDraftScope, revisionId: string | null = null): Promise<Readonly<FiscalCreditOwnerReview>> {
  try {
    if (revisionId !== null && !fiscalUuid(revisionId)) return fail()
    return await (await session(admin, token, scope)).read(revisionId)
  } catch { return fail() }
}
/** ID/hash deben conservarse antes del envío. Sólo un POST y GET durable; sin reintento automático ni permisos nuevos. */
export async function approveFiscalCreditOwnerReview(admin: FiscalAuthClient, token: string, scope: FiscalCreditDraftScope,
  revisionId: string, bodySha: string, preparationSha: string): Promise<Readonly<FiscalCreditOwnerReview>> {
  try {
    if (!fiscalUuid(revisionId) || !fiscalSha(bodySha) || !fiscalSha(preparationSha)) return fail()
    const current = await session(admin, token, scope), before = await current.read(null)
    if (before.cuerpo.sha256 !== bodySha || before.cuerpo.datos.preparacion_sha256 !== preparationSha) return fail()
    try {
      await admin.rpc('aprobar_revision_nc_homologacion', { ...current.args, p_revision_id: revisionId, p_cuerpo_sha: bodySha, p_preparacion_sha: preparationSha })
    } catch { /* Puede haber confirmado: no repetir escritura ni cambiar UUID. */ }
    const confirmed = await current.read(revisionId)
    if (confirmed.cuerpo.sha256 !== bodySha || confirmed.cuerpo.datos.preparacion_sha256 !== preparationSha) return fail()
    return confirmed
  } catch { return fail() }
}
