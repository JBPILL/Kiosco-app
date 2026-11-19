import type { PositiveFlowJournal } from './fiscal-positive-preparation-flow.mjs'
export function openPositiveWindowJournal(path: string, binding: { projectRef: string; planSha256: string; operationId: string }, options: {
  create?: boolean; assertExclusive(): Promise<unknown>
}): Readonly<{
  state(): Readonly<Record<string, unknown>>
  flowJournal(): Readonly<PositiveFlowJournal>
  record(event: string, payload?: unknown): Promise<Readonly<Record<string, unknown>>>
  dispose(): void
}>
