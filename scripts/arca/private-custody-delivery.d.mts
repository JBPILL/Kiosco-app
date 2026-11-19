export interface PrivateCustodyDelivery {
  readonly projectRef: 'acoyfwwmhaeruciyedri'
  readonly names: readonly string[]
  readonly planSha256: string
  value(name: string): string
  verifyInventory(inventory: unknown): {
    presence: '6/6'
    newDigestsMatch: true
    existingUnchanged: true
    fiscalFlagsClosed: true
    functionalCustodyProven: false
  }
  dispose(): void
}
export function preparePrivateCustodyDelivery(input: {
  plan: unknown
  approvedHash: string
  baseline: unknown
  paths: {certificatePath: string; encryptedKeyPath: string; protectionPath: string}
}): Promise<PrivateCustodyDelivery>
