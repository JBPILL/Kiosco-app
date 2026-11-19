// @vitest-environment node
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
const { planProductionInstall, verifyProductionFullSqlChain } = await import(pathToFileURL(path.resolve('scripts/plan-commercial-production-install.mjs')).href) as {
  planProductionInstall: (input: Record<string, unknown>) => string
  verifyProductionFullSqlChain: () => { order: number; block: string; path: string; sha256: string }[]
}
const input = { projectRef: 'lllkjnqpltnwvxzphncr', adminEmail: 'admin@example.test', monthlyPrice: 30000, coverageMonths: 1, trialPrice: 0, trialDays: 30 }
it('rejects the wrong destination and unapproved commercial coverage before output', () => {
  expect(() => planProductionInstall({ ...input, projectRef: 'acoyfwwmhaeruciyedri' })).toThrow(/Production/)
  expect(() => planProductionInstall({ ...input, monthlyPrice: 0 })).toThrow(/authorized/)
  expect(() => planProductionInstall({ ...input, coverageMonths: 12 })).toThrow(/authorized/)
  expect(() => planProductionInstall({ ...input, trialDays: 365 })).toThrow(/authorized/)
})
it('requires the existing administrator identity and escapes SQL literals', () => {
  expect(() => planProductionInstall({ ...input, adminEmail: '' })).toThrow(/identity/)
  const sql = planProductionInstall({ ...input, adminEmail: "admin'quoted@example.test" })
  expect(sql).toContain("'admin''quoted@example.test'")
})
it('verifies SHA-256 of all 56 SQL files and appends pilot-operations/envases/returns in canonical order when enabled', () => {
  const chain = verifyProductionFullSqlChain()
  expect(chain).toHaveLength(56)
  for (const item of chain) {
    const actual = createHash('sha256').update(readFileSync(item.path)).digest('hex')
    expect(actual, `SHA-256 mismatch for ${item.path}`).toBe(item.sha256)
  }
  const sql = planProductionInstall({ ...input, includePilotOperations: true })
  const idx = (m: string) => sql.indexOf(m)
  expect(idx('supabase/bootstrap/pilot-operations/001_capabilities.sql')).toBeGreaterThan(-1)
  expect(idx('supabase_fase_devolucion_preparacion_privada.sql'))
    .toBeLessThan(idx('supabase/bootstrap/returns/001_atomic_cash_return.sql'))
  expect(idx('supabase/bootstrap/returns/002_owner_envases_return.sql'))
    .toBeLessThan(idx('supabase/bootstrap/envases/003_pending_totals.sql'))
  expect(idx('supabase/bootstrap/envases/003_pending_totals.sql'))
    .toBeLessThan(idx('supabase/bootstrap/returns/003_whole_unit_quantities.sql'))
})
