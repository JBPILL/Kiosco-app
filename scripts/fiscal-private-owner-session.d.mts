export interface PrivateOwnerIdentity { ownerAuthId: string; kioskId: string }
export function authenticatePrivateOwner(input: {
  email: string; password: string; publicKey: string; expectedOwnerAuthId: string; expectedKioskId: string
}, options?: { fetcher?: typeof fetch; now?: () => number; approvedRequests?: ReadonlyArray<Record<string, unknown>> }): Promise<Readonly<{
  checkOwner(): Promise<Readonly<PrivateOwnerIdentity>>
  callPreparation(command: unknown): Promise<unknown>
  probeBackendClosed(): Promise<Readonly<{ backendClosed503: true }>>
  logoutLocal(): Promise<Readonly<{ localLogoutConfirmed: true }>>
  logoutAndVerifyClosed(): Promise<Readonly<{ localLogoutConfirmed: true; backendClosed503: true }>>
}>>
