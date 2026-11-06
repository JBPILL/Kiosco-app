// Public planning only. No private inputs, Supabase requests or secret values.
import { createHash, randomUUID } from 'node:crypto'

export const CUSTODY_PROJECT = 'acoyfwwmhaeruciyedri'
export const CLOSED_FISCAL_FLAGS = Object.freeze([
  'ARCA_HOMO_BACKEND_ENABLED', 'ARCA_HOMO_CREDIT_APPLY_ENABLED', 'ARCA_HOMO_CREDIT_CONSULT_ENABLED',
  'ARCA_HOMO_CREDIT_DRAFTS_ENABLED', 'ARCA_HOMO_CREDIT_NUMBERING_ENABLED', 'ARCA_HOMO_CREDIT_PREPARATION_ENABLED',
  'ARCA_HOMO_CREDIT_REVIEW_ENABLED', 'ARCA_HOMO_CREDIT_SEND_ENABLED', 'ARCA_HOMO_DATA_PREPARATION_ENABLED',
  'ARCA_HOMO_EMISSION_ENABLED', 'ARCA_HOMO_PREPARATION_ENABLED', 'ARCA_HOMO_RECONCILIATION_ENABLED',
  'ARCA_HOMO_REJECTION_RECOVERY_ENABLED',
])
const fail = () => { throw Error('FISCAL_CUSTODY_PLAN_NOT_CONFIRMED') }
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)
// The UI controller accepts JS/MJS only. Keep this public checksum equivalent
// to normalizeFiscalCuit in the server; cross-runtime equivalence is tested.
function reviewedCuit(value) {
  if (typeof value !== 'string' || !/^[0-9]{11}$/.test(value)) return fail()
  const raw = 11 - [5, 4, 3, 2, 7, 6, 5, 4, 3, 2].reduce((sum, weight, index) => sum + Number(value[index]) * weight, 0) % 11
  if (Number(value[10]) !== (raw === 11 ? 0 : raw === 10 ? 9 : raw)) return fail()
  return value
}
export { reviewedCuit as validatePublicFiscalCuit }
/** @returns {string[]} Six exact names; selector is written last. */
export function custodySecretNames(credentialId, taKeyId) {
  if (!uuid(credentialId) || !uuid(taKeyId) || credentialId === taKeyId) return fail()
  const prefix = 'ARCA_HOMO_CREDENTIAL_' + credentialId.replaceAll('-', '').toUpperCase()
  return ['REVISION', 'CERT_PEM', 'KEY_PEM', 'PASSWORD'].map(suffix => prefix + '_' + suffix)
    .concat('ARCA_HOMO_TA_KEY_' + taKeyId.replaceAll('-', '').toUpperCase(), 'ARCA_HOMO_TA_ACTIVE_KEY_ID')
}
/** @returns {Readonly<object>} Canonical public proposal, never values. */
export function createCustodyProvisionPlan(input, now = Date.now(), ids = { credentialId: randomUUID(), taKeyId: randomUUID() }) {
  if (!input || Object.keys(input).sort().join(',') !== 'certificateCuit,certificateSha256'
    || typeof input.certificateSha256 !== 'string' || typeof input.certificateCuit !== 'string'
    || !/^[0-9a-f]{64}$/.test(input.certificateSha256) || reviewedCuit(input.certificateCuit) !== input.certificateCuit
    || !Number.isSafeInteger(now)) return fail()
  return Object.freeze({ version: 1, projectRef: CUSTODY_PROJECT, function: 'arca-homologacion',
    certificateSha256: input.certificateSha256, certificateCuit: input.certificateCuit,
    credentialId: ids.credentialId, taKeyId: ids.taKeyId, revision: 1,
    secretNames: Object.freeze(custodySecretNames(ids.credentialId, ids.taKeyId)),
    createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 86400000).toISOString(),
    policy: 'INITIAL_ABSENT_ONLY_ALL_FISCAL_FLAGS_CLOSED',
  })
}
/** @returns {string} Hash of exact canonical proposal. It is not human authorization. */
export function custodyPlanHash(plan) { return createHash('sha256').update(JSON.stringify(plan)).digest('hex') }
/** @returns {Readonly<object>} Rejects altered, stale, foreign or expanded plans. */
export function validateCustodyProvisionPlan(plan, approvedHash, now = Date.now()) {
  try {
    if (!plan || typeof plan !== 'object' || Array.isArray(plan) || !/^[0-9a-f]{64}$/.test(approvedHash)
      || !Number.isSafeInteger(now) || typeof plan.createdAt !== 'string') return fail()
    const created = Date.parse(plan.createdAt)
    if (!Number.isSafeInteger(created) || created > now || now >= created + 86400000) return fail()
    const canonical = createCustodyProvisionPlan({ certificateSha256: plan.certificateSha256, certificateCuit: plan.certificateCuit }, created,
      { credentialId: plan.credentialId, taKeyId: plan.taKeyId })
    if (JSON.stringify(plan) !== JSON.stringify(canonical) || custodyPlanHash(canonical) !== approvedHash) return fail()
    return canonical
  } catch { return fail() }
}
/** @returns {Map<string,string>} Metadata only. Never pass actual values here. */
export function custodyInventory(inventory) {
  if (!Array.isArray(inventory) || inventory.length > 500) return fail()
  const entries = new Map()
  for (const row of inventory) {
    if (!row || Object.keys(row).sort().join(',') !== 'digest,name' || typeof row.name !== 'string'
      || !/^[A-Z][A-Z0-9_]{0,199}$/.test(row.name) || typeof row.digest !== 'string'
      || !/^[0-9a-f]{64}$/.test(row.digest) || entries.has(row.name)) return fail()
    entries.set(row.name, row.digest)
  }
  const closed = createHash('sha256').update('false').digest('hex')
  for (const [name, digest] of entries) {
    if (name.startsWith('ARCA_HOMO_') && name.endsWith('_ENABLED')
      && (!CLOSED_FISCAL_FLAGS.includes(name) || digest !== closed)) return fail()
  }
  return entries
}
/** @returns {Map<string,string>} Must be observed from this Staging before reading private inputs. */
export function requireAbsentCustodyBaseline(plan, inventory) {
  const entries = custodyInventory(inventory)
  if (plan.secretNames.some(name => entries.has(name))) return fail()
  return entries
}
