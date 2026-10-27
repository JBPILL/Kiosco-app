import type { PrivateCustodyDelivery } from './private-custody-delivery.mjs'
export function diagnoseClosedCustodyInventory(input: unknown, dependencies?: {request?: typeof fetch}): Promise<{count: number; flagsClosed: true; privateRead: false; writeAttempted: false}>
export function provisionClosedCustody(input: unknown, dependencies?: {
  request?: typeof fetch
  prepare?: (input: unknown) => Promise<PrivateCustodyDelivery>
}): Promise<{status: 'CUSTODY_PROVISION_METADATA_PASS'; presence: '6/6'; newDigestsMatch: true; existingUnchanged: true; fiscalFlagsClosed: true; functionalCustodyProven: false; edgeCheckRequired: true}>
