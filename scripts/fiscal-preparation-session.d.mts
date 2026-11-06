interface PrivateClient {
  query(sql: string, values?: number[]): Promise<{ rows: Record<string, unknown>[] }>
  on(event: string, listener: () => void): unknown
  off(event: string, listener: () => void): unknown
}
export interface PreparationReceipt {
  planSha256: string
  operationId: string
  openedAt: string
}
export function acquirePreparationSession(client: PrivateClient, binding: {
  projectRef: string; planSha256: string; operationId: string
}): Promise<Readonly<{
  assertHeld(): Promise<void>
  openOnce(executeOpen: () => Promise<unknown>, readVerifiedReceipt: () => Promise<unknown>): Promise<Readonly<{
    receipt: Readonly<PreparationReceipt>; reconciled: boolean
  }>>
  receipt(): Readonly<PreparationReceipt>
  releaseAfterClosed(verifyFlagsAndSqlClosed: () => Promise<boolean>): Promise<void>
}>>
