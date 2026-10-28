// Private preparation orchestration only. All I/O uses reviewed private ports.
// No send/approval/reconciliation/commercial command is reachable here.
import { planFiscalPositiveAcceptance } from './plan-fiscal-positive-acceptance.mjs'
import { prepareFiscalData, requestFromPreparedFiscalData } from '../supabase/functions/_shared/fiscalPreparation.ts'
import { validateFiscalSaleResolution, validateFiscalPreparationContext } from '../supabase/functions/_shared/fiscalPreparationPublic.ts'
import { validatePublicFiscalOwnerReview } from '../supabase/functions/_shared/fiscalOwnerReview.ts'
const fail = code => { throw Error(code) }
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right)

export async function createPositivePreparationFlow(config, approvedPlanHash, ports) {
  // Detach all caller-owned objects BEFORE the first asynchronous operation.
  const input = JSON.parse(JSON.stringify(config))
  const plan = await planFiscalPositiveAcceptance(input)
  if (plan.manifest.planSha256 !== approvedPlanHash || typeof approvedPlanHash !== 'string'
    || !['callPreparation', 'assertAuthority', 'loadJournal', 'recordAttempt', 'recordPrepared'].every(key => typeof ports[key] === 'function')) fail('POSITIVE_FLOW_PACKAGE_REJECTED')
  const requests = plan.requests, manifest = plan.manifest, source = JSON.parse(input.snapshotText)
  const expectedContext = { version: 1, venta_id: source.sale.id, total: source.sale.total,
    cuit_emisor: source.issuer.cuit_emisor, punto_venta: source.issuer.punto_venta, incluye_recepcion_envases: false,
    revision_parametros: source.catalog.revision, condiciones: source.catalog.condiciones, alicuotas: source.catalog.alicuotas }
  let used = false, busy = false
  async function call(index) {
    await ports.assertAuthority()
    // Never give a port a mutable reference to the reviewed in-memory package.
    return ports.callPreparation(JSON.parse(JSON.stringify(requests[index])))
  }
  async function journal() {
    const value = await ports.loadJournal()
    if (!value || Object.keys(value).sort().join(',') !== 'bodyAttempted,operationId,planSha256,prepared,saveAttempted'
      || value.planSha256 !== approvedPlanHash || value.operationId !== manifest.operationId
      || typeof value.saveAttempted !== 'boolean' || typeof value.bodyAttempted !== 'boolean'
      || value.bodyAttempted && !value.saveAttempted) fail('POSITIVE_FLOW_JOURNAL_REJECTED')
    if (value.prepared !== null && (!value.bodyAttempted || !value.prepared
      || Object.keys(value.prepared).sort().join(',') !== 'number,requestSha256'
      || typeof value.prepared.requestSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(value.prepared.requestSha256)
      || !Number.isSafeInteger(value.prepared.number) || value.prepared.number < 1 || value.prepared.number > 99999999)) fail('POSITIVE_FLOW_JOURNAL_REJECTED')
    return JSON.parse(JSON.stringify(value))
  }
  async function resolution() {
    const result = validateFiscalSaleResolution(await call(0), manifest.saleId)
    if (!['SIN_PREPARACION', 'DATOS_PREPARADOS', 'RESERVADA'].includes(result.estado)) fail('POSITIVE_FLOW_UNEXPECTED_OPERATION')
    if (result.estado !== 'SIN_PREPARACION' && (result.operacion_id !== manifest.operationId || result.preparacion_sha256 !== manifest.preparedSha256)) fail('POSITIVE_FLOW_UNEXPECTED_OPERATION')
    return result
  }
  async function verifiedReview() {
    const review = await validatePublicFiscalOwnerReview(await call(4), manifest.operationId)
    if (review.estado !== 'RESERVADA' || review.revision !== 1 || review.aprobacion !== null) fail('POSITIVE_FLOW_UNEXPECTED_REVIEW')
    const expected = await requestFromPreparedFiscalData(plan.prepared, review.solicitud.solicitud.numero)
    if (!same(expected, review.solicitud)) fail('POSITIVE_FLOW_BODY_CHANGED')
    return Object.freeze({ operationId: manifest.operationId, saleId: manifest.saleId,
      requestSha256: expected.sha256, number: expected.solicitud.numero, revision: 1, state: 'RESERVADA', emissionEnabled: false })
  }
  async function rememberReview() {
    const result = await verifiedReview(), current = await journal()
    const prepared = { requestSha256: result.requestSha256, number: result.number }
    if (current.prepared !== null && !same(current.prepared, prepared)) fail('POSITIVE_FLOW_RELOAD_CHANGED')
    if (current.prepared === null) {
      // Persist only safe body identity, never the HTTP response or auth data.
      await ports.recordPrepared(prepared)
      if (!same((await journal()).prepared, prepared)) fail('POSITIVE_FLOW_JOURNAL_NOT_DURABLE')
    }
    return result
  }
  return Object.freeze({
    async run() {
      if (used || busy) fail('POSITIVE_FLOW_REENTRY_REJECTED')
      used = true; busy = true
      try {
        let current = await journal()
        const context = validateFiscalPreparationContext(await call(1))
        if (!same(context, expectedContext)) fail('POSITIVE_FLOW_CONTEXT_CHANGED')
        const prepared = await prepareFiscalData(context, requests[2].entrada)
        if (prepared.sha256 !== manifest.preparedSha256 || prepared.canonico !== plan.prepared.canonico) fail('POSITIVE_FLOW_CONTEXT_CHANGED')
        let state = await resolution()
        if (state.estado === 'SIN_PREPARACION') {
          if (current.saveAttempted) fail('POSITIVE_FLOW_SAVE_UNCERTAIN_NO_RETRY')
          await ports.recordAttempt('save')
          current = await journal()
          if (!current.saveAttempted || current.bodyAttempted || current.prepared !== null) fail('POSITIVE_FLOW_JOURNAL_NOT_DURABLE')
          try { await call(2) } catch { /* Recover by durable identity, never POST again. */ }
          state = await resolution()
          if (state.estado !== 'DATOS_PREPARADOS') fail('POSITIVE_FLOW_SAVE_NOT_CONFIRMED')
        } else if (!current.saveAttempted) fail('POSITIVE_FLOW_UNEXPECTED_OPERATION')
        current = await journal()
        if (state.estado === 'RESERVADA' && !current.bodyAttempted) fail('POSITIVE_FLOW_UNEXPECTED_OPERATION')
        if (!current.bodyAttempted) {
          await ports.recordAttempt('body')
          current = await journal()
          if (!current.bodyAttempted || current.prepared !== null) fail('POSITIVE_FLOW_JOURNAL_NOT_DURABLE')
          try { await call(3) } catch { /* No second LoginCms/number query; read existing body only. */ }
        }
        // Even after ACK loss, no successful POST substitutes for this read.
        return await rememberReview()
      } finally { busy = false }
    },
    async reload() {
      if (busy) fail('POSITIVE_FLOW_REENTRY_REJECTED')
      busy = true
      try {
        const current = await journal()
        if (!current.saveAttempted || !current.bodyAttempted || current.prepared === null) fail('POSITIVE_FLOW_RELOAD_NOT_READY')
        const state = await resolution()
        if (state.estado !== 'RESERVADA') fail('POSITIVE_FLOW_RELOAD_NOT_READY')
        const result = await verifiedReview()
        if (result.requestSha256 !== current.prepared.requestSha256 || result.number !== current.prepared.number) fail('POSITIVE_FLOW_RELOAD_CHANGED')
        return result
      } finally { busy = false }
    },
  })
}
