// @vitest-environment node
import { expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { reviewedGuardSql, installLocalRestoreCompatibility, seedLocalRestoreSubscription } from '../../scripts/backup/restore-dependency-baseline.mjs'

interface GuardFixture { name: string; body: string; baselineBodySha256: string }
const fixture: { functions: GuardFixture[] } = JSON.parse(readFileSync(new URL('../../scripts/backup/restore-dependency-guard-fixtures.json', import.meta.url), 'utf8'))

it.each(fixture.functions)('accepts only reviewed local guard bytes: $name', row => {
  const sql = reviewedGuardSql(row)
  expect(sql).toContain('SET search_path=pg_catalog,public')
  expect(sql).not.toMatch(/GRANT|ALTER ROLE/)
})

it.each(['body', 'name', 'baseline'])('rejects modified %s without returning SQL', mode => {
  const row = { ...fixture.functions[0] }
  if (mode === 'body') row.body += '\n'
  if (mode === 'name') row.name = 'unreviewed_function'
  if (mode === 'baseline') row.baselineBodySha256 = '0'.repeat(64)
  expect(() => reviewedGuardSql(row)).toThrow(/LOCAL_GUARD_/)
})

it('rejects server-shaped adapters before any SQL or synthetic seeding', async () => {
  let calls = 0
  const adapter = { exec: async () => { calls++ }, query: async () => { calls++ } }
  // Deliberately model an unsupported runtime adapter at the boundary.
  await expect(installLocalRestoreCompatibility(adapter as never)).rejects.toThrow('LOCAL_PGLITE_REQUIRED')
  await expect(seedLocalRestoreSubscription(adapter as never, '11111111-1111-4111-8111-111111111111')).rejects.toThrow('LOCAL_PGLITE_REQUIRED')
  expect(calls).toBe(0)
})
