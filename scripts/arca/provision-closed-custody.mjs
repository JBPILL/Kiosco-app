// Local operator only. No browser import, secret persistence, retries or redirects.
import { CUSTODY_PROJECT, validateCustodyProvisionPlan, requireAbsentCustodyBaseline, custodyInventory } from '../fiscal-custody-plan.mjs'
import { preparePrivateCustodyDelivery } from './private-custody-delivery.mjs'

const endpoint = 'https://api.supabase.com/v1/projects/' + CUSTODY_PROJECT + '/secrets'
const fail = () => { throw Error('CLOSED_CUSTODY_REJECTED') }
async function boundedJson(response) {
  const reader = response.body?.getReader()
  if (!reader) return fail()
  const chunks = []
  let length = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      length += next.value.byteLength
      if (length > 131072) return fail()
      chunks.push(Buffer.from(next.value))
    }
    const bytes = Buffer.concat(chunks)
    try { return JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes)) }
    finally { bytes.fill(0) }
  } finally {
    for (const chunk of chunks) chunk.fill(0)
    await reader.cancel().catch(() => {})
  }
}
function metadata(rows) {
  if (!Array.isArray(rows) || rows.length > 500) return fail()
  // Accept the API's "value" field only as SHA256 metadata, never plaintext.
  const clean = rows.map(row => {
    if (!row || Object.keys(row).some(key => !['name', 'value', 'updated_at'].includes(key))
      || typeof row.value !== 'string' || !/^[0-9a-f]{64}$/.test(row.value)) return fail()
    return { name: row.name, digest: row.value }
  })
  custodyInventory(clean)
  return clean
}
/** Dependencies are only for offline tests; the CLI cannot supply alternate hosts/fetch. */
export async function provisionClosedCustody(input, dependencies = {}) {
  const request = dependencies.request ?? fetch
  const prepare = dependencies.prepare ?? preparePrivateCustodyDelivery
  let delivery, stage = 'PLAN', writeAttempted = false
  const get = async token => {
    const response = await request(endpoint, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } })
    if (response.status !== 200) { await response.body?.cancel(); return fail() }
    return metadata(await boundedJson(response))
  }
  try {
    if (!input || Object.keys(input).sort().join(',') !== 'approvedHash,exclusiveWriteConfirmed,paths,plan,token'
      || input.exclusiveWriteConfirmed !== true) return fail()
    const plan = validateCustodyProvisionPlan(input.plan, input.approvedHash)
    stage = 'AUTH'
    if (typeof input.token !== 'string' || !/^sbp_fc[A-Za-z0-9_-]{16,512}$/.test(input.token)) return fail()
    stage = 'BASELINE'
    const before = await get(input.token)
    requireAbsentCustodyBaseline(plan, before)
    stage = 'PRIVATE_COPY'
    delivery = await prepare({ plan, approvedHash: input.approvedHash, baseline: before, paths: input.paths })
    stage = 'PREWRITE_RECHECK'
    const recheck = await get(input.token)
    const original = custodyInventory(before), current = requireAbsentCustodyBaseline(plan, recheck)
    if (original.size !== current.size || [...original].some(([name, digest]) => current.get(name) !== digest)) return fail()
    validateCustodyProvisionPlan(plan, input.approvedHash)
    stage = 'POST'
    let payload = plan.secretNames.map(name => ({ name, value: delivery.value(name) }))
    try {
      writeAttempted = true
      const response = await request(endpoint, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer ' + input.token, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      await response.body?.cancel()
      if (response.status !== 201) return fail()
    } finally { for (const row of payload) row.value = ''; payload = [] }
    stage = 'VERIFY'
    const result = delivery.verifyInventory(await get(input.token))
    return { status: 'CUSTODY_PROVISION_METADATA_PASS', ...result, edgeCheckRequired: true }
  } catch {
    // Any POST failure may include ACK loss. Never retry, undo or overwrite.
    throw Error('CUSTODY_PROVISION_NOT_CONFIRMED stage=' + stage + ' write_attempted=' + writeAttempted + ' reconcile_before_retry=' + writeAttempted)
  } finally { delivery?.dispose() }
}
