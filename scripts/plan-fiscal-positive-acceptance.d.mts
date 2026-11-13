import type { PreparedFiscalData } from '../supabase/functions/_shared/fiscalPreparation.ts'
export function planFiscalPositiveAcceptance(input: unknown): Promise<{
  manifest: Readonly<Record<string, unknown>>
  requests: ReadonlyArray<Readonly<Record<string, unknown>>>
  prepared: Readonly<PreparedFiscalData>
}>
