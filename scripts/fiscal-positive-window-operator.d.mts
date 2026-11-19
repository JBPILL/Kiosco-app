import type { acquirePreparationSession } from './fiscal-preparation-session.mjs'
import type { authenticatePrivateOwner } from './fiscal-private-owner-session.mjs'
import type { PreparationReceipt } from './fiscal-preparation-session.mjs'
import type { PositivePreparedSummary } from './fiscal-positive-preparation-flow.mjs'
export interface PositiveWindowPorts {
  client: Parameters<typeof acquirePreparationSession>[0]
  now(): number
  db: {
    projectRef: string; planSha256: string
    assertClosedBaseline(): Promise<void>
    baselineMetadata?(): Readonly<{ historySha256: string; commercialSha256: string; observedAt: string }>
    executeOpen(sql: string): Promise<unknown>
    readOpenedReceipt(): Promise<PreparationReceipt>
    assertActiveBinding(receipt: Readonly<PreparationReceipt>): Promise<void>
    executeClose(sql: string, openedAt: string): Promise<unknown>
    verifyPrepared(summary: Readonly<PositivePreparedSummary>): Promise<void>
    verifyClosed(receipt: Readonly<PreparationReceipt>, summary: Readonly<PositivePreparedSummary> | null): Promise<void>
  }
  management: {
    readInventory(): Promise<{ name: string; digest: string }[]>
    assertCustodyMetadata(inventory: { name: string; digest: string }[]): Promise<void>
    writeFlag(name: string, value: boolean): Promise<unknown>
  }
  authenticateOwner(requests: ReadonlyArray<Readonly<Record<string, unknown>>>): ReturnType<typeof authenticatePrivateOwner>
  dispose(): Promise<void>
}
export function executePositiveWindow(input: { config: unknown; approvedHash: string; authorizedScope: string; journalPath: string }, ports: PositiveWindowPorts): Promise<Readonly<{
  version: 1; projectRef: string; operationId: string; passed: boolean; preparationPassed: boolean
  cleanupConfirmed: boolean; flagsClosed: boolean; sqlClosed: boolean; logoutConfirmed: boolean; backendClosed503: boolean
  requiresReconciliation: boolean; failures: readonly string[]; prepared: Readonly<PositivePreparedSummary> | null
  emissionExecuted: false; cae: 0
}>>
