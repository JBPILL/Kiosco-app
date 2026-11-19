import type { planFiscalPositiveAcceptance } from './plan-fiscal-positive-acceptance.mjs'
export function planFiscalPreparationToggle(input: unknown): Promise<{
  data: Awaited<ReturnType<typeof planFiscalPositiveAcceptance>>
  activationSql: string; closureSql: string; verificationSql: string
  manifest: Readonly<Record<string, unknown>>
}>
