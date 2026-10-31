export function createPreparationManagement(input: { token: string; credentialId: string; taKeyId: string }, options?: { fetcher?: typeof fetch }): Readonly<{
  readInventory(): Promise<{ name: string; digest: string }[]>
  assertCustodyMetadata(rows: { name: string; digest: string }[]): Promise<void>
  writeFlag(name: string, value: boolean): Promise<void>
}>
