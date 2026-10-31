export interface PositiveFlowJournal {
  planSha256: string; operationId: string; saveAttempted: boolean; bodyAttempted: boolean
  prepared: { requestSha256: string; number: number } | null
}
export interface PositivePreparedSummary {
  operationId: string; saleId: string; requestSha256: string; number: number
  revision: 1; state: 'RESERVADA'; emissionEnabled: false
}
export function createPositivePreparationFlow(config: unknown, approvedPlanHash: string, ports: {
  callPreparation(command: unknown): Promise<unknown>
  assertAuthority(): Promise<unknown>
  loadJournal(): Promise<unknown>
  recordAttempt(stage: 'save' | 'body'): Promise<unknown>
  recordPrepared(value: { requestSha256: string; number: number }): Promise<unknown>
}): Promise<Readonly<{
  run(): Promise<Readonly<PositivePreparedSummary>>
  reload(): Promise<Readonly<PositivePreparedSummary>>
}>>
