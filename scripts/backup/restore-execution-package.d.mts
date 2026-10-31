import type { RestoreBackupReference } from './restore-backup-reference.mjs'
export const RESTORE_CAPTURE_SCOPE: 'PR07_READ_ONLY_PRESERVATION_CAPTURE'
export const RESTORE_EXECUTION_SCOPE: 'PR07_FIXED_ISOLATED_RESTORE_ACCEPTANCE'
export interface RestorePackageInput {
 scope: typeof RESTORE_CAPTURE_SCOPE | typeof RESTORE_EXECUTION_SCOPE
 actors: {OWNER: string; CASHIER: string}
 startsAt: string; endsAt: string
 baselineHash: string | null
 backup: RestoreBackupReference | null
}
export interface RestoreExecutionPackage extends RestorePackageInput {
 version: number; projectRef: string; kioskId: string; planHash: string; preservationScopeHash: string
 runtimeFiles: Record<string,string>; nodeVersion: string; packageHash: string
 requiresSpecificGo: true; requiresExclusiveOperator: true; automaticRetry: false; flags: false; arca: false; production: false; restoreUiEnabled: false; totalExplicitRpcCalls: number
}
export function restoreExecutionRuntimeHashes(): Record<string,string>
export function buildRestoreExecutionPackage(input: RestorePackageInput): RestoreExecutionPackage
export function validateRestoreExecutionPackage(packet: unknown,reviewedHash: string,options?: {now?: number;execute?: boolean}): RestoreExecutionPackage
