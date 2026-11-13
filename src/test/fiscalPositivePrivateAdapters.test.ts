// @vitest-environment node
import { EventEmitter } from 'node:events'
import { randomUUID, createHash } from 'node:crypto'
import { expect, it, vi } from 'vitest'
import { createPreparationManagement } from '../../scripts/fiscal-preparation-management.mjs'
import { custodySecretNames } from '../../scripts/fiscal-custody-plan.mjs'
import { connectPositiveWindowPostgres } from '../../scripts/fiscal-positive-postgres.mjs'
const hash = (value: string) => createHash('sha256').update(value).digest('hex')
const endpoint = 'https://api.supabase.com/v1/projects/acoyfwwmhaeruciyedri/secrets'
function managementFixture() {
  const credentialId = randomUUID(), taKeyId = randomUUID(), names = custodySecretNames(credentialId, taKeyId)
  const rows = names.map(name => ({ name, value: hash(name.endsWith('_REVISION') ? '1' : name.endsWith('_ACTIVE_KEY_ID') ? taKeyId : 'synthetic'), updated_at: '2026-10-28T15:00:00Z' }))
  const fetcher = vi.fn<typeof fetch>(async (url, init) => {
    expect(url).toBe(endpoint); expect(init?.redirect).toBe('error')
    return init?.method === 'GET' ? Response.json(rows) : new Response(null, { status: 204 })
  })
  const adapter = createPreparationManagement({ token: 'sbp_fcSYNTHETIC_NOT_A_REAL_TOKEN', credentialId, taKeyId }, { fetcher })
  return { rows, adapter, fetcher }
}
it('reads only safe metadata, verifies original custody names and posts a single boolean preparation flag', async () => {
  const f = managementFixture(), rows = await f.adapter.readInventory()
  await f.adapter.assertCustodyMetadata(rows)
  expect(rows.every(row => Object.keys(row).sort().join(',') === 'digest,name')).toBe(true)
  await f.adapter.writeFlag('ARCA_HOMO_PREPARATION_ENABLED', true)
  expect(f.fetcher.mock.calls.at(-1)?.[1]?.body).toBe('[{"name":"ARCA_HOMO_PREPARATION_ENABLED","value":"true"}]')
})
it.each(['ARCA_HOMO_EMISSION_ENABLED','ARCA_HOMO_CREDIT_SEND_ENABLED','ARCA_HOMO_TA_ACTIVE_KEY_ID','OTHER_SECRET'])('refuses to write %s before making a request', async name => {
  const f = managementFixture()
  await expect(f.adapter.writeFlag(name, true)).rejects.toThrow('WINDOW_MANAGEMENT_NOT_CONFIRMED')
  expect(f.fetcher).not.toHaveBeenCalled()
})
it.each(['plaintext','extra-field','duplicate','emission-open','unknown-flag'])('rejects %s metadata without exposing any response content', async mode => {
  const f = managementFixture()
  if (mode === 'plaintext') f.rows[0].value = 'SYNTHETIC_DO_NOT_EXPOSE'
  if (mode === 'extra-field') Object.assign(f.rows[0], { unsafe: 'SYNTHETIC_DO_NOT_EXPOSE' })
  if (mode === 'duplicate') f.rows.push(f.rows[0])
  if (mode === 'emission-open') f.rows.push({ name: 'ARCA_HOMO_EMISSION_ENABLED', value: hash('true'), updated_at: '' })
  if (mode === 'unknown-flag') f.rows.push({ name: 'ARCA_HOMO_UNKNOWN_ENABLED', value: hash('false'), updated_at: '' })
  await expect(f.adapter.readInventory()).rejects.toThrow('WINDOW_MANAGEMENT_NOT_CONFIRMED')
})
it('does not repeat an uncertain flag request', async () => {
  const f = managementFixture(); f.fetcher.mockRejectedValue(Error('private external diagnostics'))
  await expect(f.adapter.writeFlag('ARCA_HOMO_BACKEND_ENABLED', true)).rejects.toThrow('WINDOW_MANAGEMENT_NOT_CONFIRMED')
  expect(f.fetcher).toHaveBeenCalledTimes(1)
})
it('never accepts a different TA selector digest as the expected keyring', async () => {
  const f = managementFixture(); f.rows.at(-1)!.value = hash(randomUUID())
  await expect(f.adapter.assertCustodyMetadata(await f.adapter.readInventory())).rejects.toThrow('WINDOW_MANAGEMENT_NOT_CONFIRMED')
})

class FakePostgres extends EventEmitter {
  static instances: FakePostgres[] = []
  static failAt = 0
  readonly connect = vi.fn(async () => { if (FakePostgres.failAt === FakePostgres.instances.indexOf(this) + 1) throw Error('Synthetic private connection failure') })
  readonly end = vi.fn(async () => undefined)
  readonly query = vi.fn(async (): Promise<{ rows: Record<string, unknown>[] }> => ({ rows: [] }))
  readonly options: Record<string, unknown>
  constructor(options: Record<string, unknown>) { super(); this.options = options; FakePostgres.instances.push(this) }
}
const publicSyntheticCertificate = '-----BEGIN CERTIFICATE-----\nSYNTHETIC_PUBLIC_CA\n-----END CERTIFICATE-----'
it('pins two private PostgreSQL sessions to Staging, TLS verification and the session pooler port', async () => {
  FakePostgres.instances = []; FakePostgres.failAt = 0
  const result = await connectPositiveWindowPostgres({ password: 'synthetic_database_password', rootCertificate: publicSyntheticCertificate }, { Client: FakePostgres })
  expect(FakePostgres.instances).toHaveLength(2)
  for (const client of FakePostgres.instances) {
    expect(client.options).toMatchObject({ host: 'aws-1-sa-east-1.pooler.supabase.com', port: 5432, database: 'postgres', user: 'postgres.acoyfwwmhaeruciyedri',
      ssl: { rejectUnauthorized: true, ca: publicSyntheticCertificate, servername: 'aws-1-sa-east-1.pooler.supabase.com' } })
    expect(client.connect).toHaveBeenCalledTimes(1)
  }
  await result.dispose(); await result.dispose()
  for (const client of FakePostgres.instances) expect(client.end).toHaveBeenCalledTimes(1)
})
it('closes both private clients if the second connection fails, with no retry or raw error', async () => {
  FakePostgres.instances = []; FakePostgres.failAt = 2
  await expect(connectPositiveWindowPostgres({ password: 'synthetic_database_password', rootCertificate: publicSyntheticCertificate }, { Client: FakePostgres })).rejects.toThrow('WINDOW_POSTGRES_CONNECTION_NOT_CONFIRMED')
  expect(FakePostgres.instances).toHaveLength(2)
  for (const client of FakePostgres.instances) expect(client.end).toHaveBeenCalledTimes(1)
  FakePostgres.failAt = 0
})
