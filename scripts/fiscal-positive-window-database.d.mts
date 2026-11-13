import type { PositiveWindowPorts } from './fiscal-positive-window-operator.mjs'
interface QueryPort { query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }> }
export const positiveWindowReadOnlySql: string
export function createPositiveWindowDatabase(input: {
  client: QueryPort; observer: QueryPort; config: unknown; historySha256: string | null; commercialSha256: string | null; now?: () => number
}): Promise<Readonly<PositiveWindowPorts['db'] & { baselineMetadata(): Readonly<{ historySha256: string; commercialSha256: string; observedAt: string }> }>>
