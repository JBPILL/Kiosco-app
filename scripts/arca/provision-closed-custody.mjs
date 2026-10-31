// Local operator only. No browser import, secret persistence, retries or redirects.
import { CUSTODY_PROJECT, validateCustodyProvisionPlan, requireAbsentCustodyBaseline, custodyInventory } from '../fiscal-custody-plan.mjs'
import { preparePrivateCustodyDelivery } from './private-custody-delivery.mjs'

const endpoint = 'https://api.supabase.com/v1/projects/' + CUSTODY_PROJECT + '/secrets'
const fail = () => { throw Error('CLOSED_CUSTODY_REJECTED') }
class InventoryFailure extends Error {
  constructor(reason) { super('INVENTORY_REJECTED'); this.reason = reason }
}
const inventoryFailure = reason => { throw new InventoryFailure(reason) }
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
  if (!Array.isArray(rows) || rows.length > 500) return inventoryFailure('METADATA_SHAPE')
  // Accept the API's "value" field only as SHA256 metadata, never plaintext.
  const clean = rows.map(row => {
    if (row && !Object.hasOwn(row, 'value') && Object.hasOwn(row, 'digest')) return inventoryFailure('METADATA_DIGEST_FIELD')
    if (!row || Object.keys(row).some(key => !['name', 'value', 'updated_at'].includes(key))) return inventoryFailure('METADATA_FIELDS')
    if (typeof row.value !== 'string' || !/^[0-9a-f]{64}$/.test(row.value)) return inventoryFailure('METADATA_DIGEST_FORMAT')
    return { name: row.name, digest: row.value }
  })
  try { custodyInventory(clean) } catch { return inventoryFailure('INVENTORY_POLICY') }
  return clean
}
function validateToken(token) {
  if (typeof token !== 'string' || !/^sbp_fc[A-Za-z0-9_-]{16,512}$/.test(token)) return inventoryFailure('TOKEN_FORMAT')
}
async function readInventory(token, request) {
  let response
  try {
    response = await request(endpoint, { method: 'GET', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } })
  } catch { return inventoryFailure('NETWORK_OR_TLS') }
  if (response.status !== 200) {
    await response.body?.cancel().catch(() => {})
    const reason = [401, 403, 404, 429, 500, 502, 503, 504].includes(response.status) ? 'HTTP_' + response.status : 'HTTP_OTHER'
    return inventoryFailure(reason)
  }
  let rows
  try { rows = await boundedJson(response) } catch { return inventoryFailure('METADATA_JSON_OR_SIZE') }
  return metadata(rows)
}
/** Read-only operator diagnostic: no private factory, POST or credentials files. */
export async function diagnoseClosedCustodyInventory(input, dependencies = {}) {
  try {
    if (!input || Object.keys(input).sort().join(',') !== 'approvedHash,plan,token') return fail()
    const plan = validateCustodyProvisionPlan(input.plan, input.approvedHash)
    validateToken(input.token)
    const rows = await readInventory(input.token, dependencies.request ?? fetch)
    try { requireAbsentCustodyBaseline(plan, rows) } catch { return inventoryFailure('INITIAL_STATE_REJECTED') }
    return { count: rows.length, flagsClosed: true, privateRead: false, writeAttempted: false }
  } catch (error) {
    throw Error('CUSTODY_BASELINE_NOT_CONFIRMED reason=' + (error instanceof InventoryFailure ? error.reason : 'PLAN_OR_INPUT') + ' private_read=false write_attempted=false')
  }
}
/** Dependencies are only for offline tests; the CLI cannot supply alternate hosts/fetch. */
export async function provisionClosedCustody(input, dependencies = {}) {
  const request = dependencies.request ?? fetch
  const prepare = dependencies.prepare ?? preparePrivateCustodyDelivery
  let delivery, stage = 'PLAN', writeAttempted = false
  const get = token => readInventory(token, request)
  try {
    if (!input || Object.keys(input).sort().join(',') !== 'approvedHash,exclusiveWriteConfirmed,paths,plan,token'
      || input.exclusiveWriteConfirmed !== true) return fail()
    const plan = validateCustodyProvisionPlan(input.plan, input.approvedHash)
    stage = 'AUTH'
    validateToken(input.token)
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
  } catch (error) {
    // Any POST failure may include ACK loss. Never retry, undo or overwrite.
    throw Error('CUSTODY_PROVISION_NOT_CONFIRMED stage=' + stage + ' write_attempted=' + writeAttempted + ' reconcile_before_retry=' + writeAttempted + ' reason=' + (error instanceof InventoryFailure ? error.reason : 'POLICY_OR_DELIVERY'))
  } finally { delivery?.dispose() }
}
