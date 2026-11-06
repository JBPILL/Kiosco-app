import type { RestoreRole, RestoreActor } from './restore-acceptance-engine.mjs'
export interface RestoreHttpConfig {
  publicKey: string
  jwt: string
  authId: string
  role: RestoreRole
  allowMutations?: boolean
  reviewedPlanHash?: string
}
export interface VerifiedRestoreActor extends RestoreActor { profileId: string }
export interface RestoreHttpClient {
  verifyIdentity(): Promise<VerifiedRestoreActor>
  requestPlannedRpc(rpc: string, params: Record<string, unknown>): Promise<{ status: number; data: unknown }>
  logoutLocal(): Promise<{ logoutLocalConfirmed: true }>
}
export function createRestoreHttpClient(config: RestoreHttpConfig, request: typeof fetch): RestoreHttpClient
export interface RestoreLoginConfig extends Omit<RestoreHttpConfig, 'jwt'> {
  email: string
  password: string
}
export function loginRestoreHttpClient(config: RestoreLoginConfig, request: typeof fetch): Promise<RestoreHttpClient>
