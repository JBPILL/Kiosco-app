import type { RestoreReadOnlyPort } from './restore-readonly-postgres.mjs'
import type { RestoreBackupReference } from './restore-backup-reference.mjs'
export function executePrivateRestorePacket(packet: unknown,dependencies?: {
 now?: () => number
 checkDirectory?: (file: string) => void | Promise<void>
 connect?: (credentials: {password: string; rootCertificate: string}) => Promise<RestoreReadOnlyPort>
 verifyBackup?: (reference: RestoreBackupReference,options: {now: number}) => Promise<{status: 'PRIVATE_BACKUP_REFERENCE_VERIFIED'; archiveHash: string;contextHash: string;rolesHash: string}>
 request?: typeof fetch
}): Promise<string>
