import type { connectPositiveWindowPostgres } from './fiscal-positive-postgres.mjs'
import type { createPositiveWindowDatabase } from './fiscal-positive-window-database.mjs'
import type { createPreparationManagement } from './fiscal-preparation-management.mjs'
import type { authenticatePrivateOwner } from './fiscal-private-owner-session.mjs'
import type { executePositiveWindow } from './fiscal-positive-window-operator.mjs'
export interface PrivateWindowPacket {
  packageText: string; approvedPackageHash: string; authorizedScope: string; exclusiveWriteConfirmed: boolean
  journalPath: string; rootCertificate: string
  credentials: { publicKey: string; email: string; password: string; postgresPassword: string; managementToken: string }
}
export function executePrivateWindowPacket(packet: unknown, dependencies?: {
  now?: () => number; checkDirectory?: (path: string) => Promise<void>
  connect?: typeof connectPositiveWindowPostgres; database?: typeof createPositiveWindowDatabase
  management?: typeof createPreparationManagement; authenticate?: typeof authenticatePrivateOwner
  execute?: (...args: Parameters<typeof executePositiveWindow>) => Promise<Pick<Awaited<ReturnType<typeof executePositiveWindow>>, 'passed'|'cleanupConfirmed'>>
}): Promise<string>
