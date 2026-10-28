// Private, pinned Management adapter: GET metadata, POST three boolean flags.
// No arbitrary endpoint, secret provisioning, values read, retries or redirects.
import { createHash } from 'node:crypto'
import { custodyInventory, custodySecretNames } from './fiscal-custody-plan.mjs'
const endpoint = 'https://api.supabase.com/v1/projects/acoyfwwmhaeruciyedri/secrets'
const flags = ['ARCA_HOMO_BACKEND_ENABLED','ARCA_HOMO_DATA_PREPARATION_ENABLED','ARCA_HOMO_PREPARATION_ENABLED']
const sha = value => createHash('sha256').update(value).digest('hex')
const fail = () => { throw Error('WINDOW_MANAGEMENT_NOT_CONFIRMED') }
async function metadata(response) {
  const reader = response.body?.getReader()
  if (!reader) return fail()
  const buffers = []
  let bytes = 0
  try {
    for (;;) {
      const next = await reader.read()
      if (next.done) break
      bytes += next.value.byteLength
      if (bytes > 131072) return fail()
      buffers.push(Buffer.from(next.value))
    }
    const rows = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(Buffer.concat(buffers)))
    if (!Array.isArray(rows) || rows.length > 500) return fail()
    const result = rows.map(row => {
      if (!row || !Object.hasOwn(row,'name') || !Object.hasOwn(row,'value')
        || Object.keys(row).some(key => !['name','value','updated_at'].includes(key))
        || typeof row.value !== 'string' || !/^[a-f0-9]{64}$/.test(row.value)) return fail()
      return { name: row.name, digest: row.value }
    })
    // Validate every field/duplicate and all non-preparation flags using the
    // existing inventory policy, normalizing only our three permitted flags.
    custodyInventory(result.map(row => {
      if (!flags.includes(row.name)) return row
      if (![sha('true'),sha('false')].includes(row.digest)) return fail()
      return { ...row, digest: sha('false') }
    }))
    return result
  } catch { return fail() }
  finally { for (const buffer of buffers) buffer.fill(0); await reader.cancel().catch(() => {}); reader.releaseLock() }
}
export function createPreparationManagement({ token, credentialId, taKeyId }, { fetcher = fetch } = {}) {
  if (typeof token !== 'string' || !/^sbp_fc[A-Za-z0-9_-]{16,512}$/.test(token)) return fail()
  const names = custodySecretNames(credentialId, taKeyId)
  async function request(method, body) {
    try {
      return await fetcher(endpoint, { method, redirect: 'error', signal: AbortSignal.timeout(15000),
        headers: { Authorization: 'Bearer '+token, Accept: 'application/json', ...(body ? { 'Content-Type':'application/json' } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) })
    } catch { return fail() }
  }
  return Object.freeze({
    async readInventory() {
      const response = await request('GET')
      if (response.status !== 200) { await response.body?.cancel().catch(() => {}); return fail() }
      return metadata(response)
    },
    async assertCustodyMetadata(rows) {
      const inventory = custodyInventory(rows)
      if (names.some(name => !inventory.has(name)) || [...inventory.keys()].some(name =>
        /^(ARCA_HOMO_CREDENTIAL_|ARCA_HOMO_TA_KEY_)/.test(name) && !names.includes(name))) return fail()
      if (inventory.get(names[0]) !== sha('1') || inventory.get('ARCA_HOMO_TA_ACTIVE_KEY_ID') !== sha(taKeyId)) return fail()
    },
    async writeFlag(name, value) {
      if (!flags.includes(name) || typeof value !== 'boolean') return fail()
      const response = await request('POST', [{ name, value: String(value) }])
      // Never consume an echo as authority, nor persist raw response content.
      await response.body?.cancel().catch(() => {})
      if (![200,201,204].includes(response.status)) return fail()
    },
  })
}
