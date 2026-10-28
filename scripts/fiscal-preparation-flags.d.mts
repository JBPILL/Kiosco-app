interface Metadata { name: string; digest: string }
export function createPreparationFlags(options: {
  baselineInventory: Metadata[]
  readInventory(): Promise<Metadata[]>
  writeFlag(name: string, value: boolean): Promise<unknown>
  assertExclusive(): Promise<unknown>
  assertOwnerAndWindow(): Promise<unknown>
}): Readonly<{
  enable(): Promise<Readonly<{ preparationFlagsEnabled: true; recoveredEnableAcks: number }>>
  close(): Promise<Readonly<{ flagsClosed: true; recoveredCloseAcks: number }>>
  verifyClosed(): Promise<true>
}>
