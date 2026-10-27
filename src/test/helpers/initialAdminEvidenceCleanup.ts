import { rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, dirname, resolve } from 'node:path'

/** Only evidence roots created by the synthetic initial-admin tests. */
export async function cleanupInitialAdminEvidence(folder:string):Promise<void> {
 const target=resolve(folder)
 if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('f6-initial-admin-'))throw Error('Unexpected synthetic initial-admin cleanup target')
 // Bounded Windows filesystem retries; persistent failures still fail the test.
 await rm(target,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}
