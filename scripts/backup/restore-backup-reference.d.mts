export interface RestoreBackupReference {
 directory: string; archive: string; archiveHash: string; contextHash: string; rolesHash: string; createdAt: string; clientImageId: string
}
export function verifyRestoreBackupReference(reference: RestoreBackupReference, dependencies?: {
 root?: string; now?: number; checkDirectory?: (directory: string) => void | Promise<void>
 runCommand?: (command: string,args: string[]) => string | Promise<string>
}): Promise<{status: 'PRIVATE_BACKUP_REFERENCE_VERIFIED'; archiveHash: string; contextHash: string; rolesHash: string; physicalRestore: false; storageIncluded: false}>
