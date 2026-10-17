// @vitest-environment node
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { expect, it } from 'vitest'
const { planProductionInstall } = await import(pathToFileURL(path.resolve('scripts/plan-commercial-production-install.mjs')).href) as {
  planProductionInstall: (input: Record<string, unknown>) => string
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
