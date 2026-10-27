export interface CustodyProvisionPlan {
  readonly version: 1
  readonly projectRef: 'acoyfwwmhaeruciyedri'
  readonly function: 'arca-homologacion'
  readonly certificateSha256: string
  readonly certificateCuit: string
  readonly credentialId: string
  readonly taKeyId: string
  readonly revision: 1
  readonly secretNames: readonly string[]
  readonly createdAt: string
  readonly expiresAt: string
  readonly policy: 'INITIAL_ABSENT_ONLY_ALL_FISCAL_FLAGS_CLOSED'
}
export const CUSTODY_PROJECT: 'acoyfwwmhaeruciyedri'
export const CLOSED_FISCAL_FLAGS: readonly string[]
export function custodySecretNames(credentialId: string, taKeyId: string): string[]
export function createCustodyProvisionPlan(input: unknown, now?: number, ids?: {credentialId: string; taKeyId: string}): CustodyProvisionPlan
export function custodyPlanHash(plan: unknown): string
export function validateCustodyProvisionPlan(plan: unknown, approvedHash: string, now?: number): CustodyProvisionPlan
export function custodyInventory(inventory: unknown): Map<string, string>
export function requireAbsentCustodyBaseline(plan: CustodyProvisionPlan, inventory: unknown): Map<string, string>
