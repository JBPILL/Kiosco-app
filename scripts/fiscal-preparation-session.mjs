// Private operator coordination only. No connection creation, credentials or network.
// The caller must supply a dedicated, already verified PostgreSQL Client (no pool /
// transaction pooler / reconnect). Advisory exclusion does not replace the SQL GO,
// exact binding checks or exclusive administration required by the approved plan.
const project = 'acoyfwwmhaeruciyedri'
// One project-wide lock, independent of plan/operation, including competing plans.
const lockKey = [1263554630, 1347568976]
const clients = new WeakSet()
const fail = code => { throw new Error(code) }
const identitySql = `SELECT current_user AS actor, pg_backend_pid() AS pid,
 (SELECT backend_start::text FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS started`
const heldSql = `SELECT current_user AS actor, pg_backend_pid() AS pid,
 (SELECT backend_start::text FROM pg_stat_activity WHERE pid=pg_backend_pid()) AS started,
 EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND pid=pg_backend_pid()
 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
 AND classid=$1::oid AND objid=$2::oid AND objsubid=2
 AND mode='ExclusiveLock' AND granted) AS held`
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
const uuid = value => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value)

/** Retain this session until flags AND SQL metadata are independently closed.
 * A transport error permanently poisons the lease. Never acquire it again to
 * infer ownership from a matching open binding; that may belong to another run.
 */
export async function acquirePreparationSession(client, binding) {
  if (!binding || Object.keys(binding).sort().join(',') !== 'operationId,planSha256,projectRef'
    || binding.projectRef !== project || !hash(binding.planSha256) || !uuid(binding.operationId)
    || !client || typeof client.query !== 'function' || typeof client.on !== 'function'
    || typeof client.off !== 'function') fail('WINDOW_SESSION_INPUT_REJECTED')
  if (clients.has(client)) fail('WINDOW_SESSION_REENTRY_REJECTED')
  // Permanently consume this dedicated Client, even if acquisition is uncertain.
  clients.add(client)
  const expected = Object.freeze({ ...binding })
  let poisoned = false, released = false, busy = false, attempted = false, receipt = null
  const poison = () => { poisoned = true }
  client.on('error', poison)
  client.on('end', poison)
  let identity
  try {
    const result = await client.query(identitySql)
    if (result.rows.length !== 1 || result.rows[0].actor !== 'postgres'
      || !Number.isSafeInteger(result.rows[0].pid) || typeof result.rows[0].started !== 'string') {
      fail('WINDOW_SESSION_IDENTITY_REJECTED')
    }
    identity = { ...result.rows[0] }
    const locked = await client.query('SELECT pg_try_advisory_lock($1::int,$2::int) AS acquired', lockKey)
    if (locked.rows.length !== 1 || locked.rows[0].acquired !== true) fail('WINDOW_SESSION_BUSY')
  } catch (error) {
    // Never retry an uncertain lock acquisition or expose raw database diagnostics.
    poisoned = true
    if (error?.message === 'WINDOW_SESSION_BUSY' || error?.message === 'WINDOW_SESSION_IDENTITY_REJECTED') throw error
    fail('WINDOW_SESSION_ACQUIRE_UNCERTAIN')
  }
  async function assertHeld() {
    if (poisoned || released) fail('WINDOW_SESSION_OWNERSHIP_LOST')
    try {
      const result = await client.query(heldSql, lockKey)
      const row = result.rows[0]
      if (result.rows.length !== 1 || row?.held !== true || row.actor !== identity.actor
        || row.pid !== identity.pid || row.started !== identity.started || poisoned || released) {
        poisoned = true
        fail('WINDOW_SESSION_OWNERSHIP_LOST')
      }
    } catch {
      poisoned = true
      fail('WINDOW_SESSION_OWNERSHIP_LOST')
    }
  }
  return Object.freeze({
    assertHeld,
    // executeOpen executes ONLY the reviewed SQL. readVerifiedReceipt must use
    // an independent READ ONLY connection/verifier and validate the entire
    // opened binding, not merely the three receipt fields returned here.
    async openOnce(executeOpen, readVerifiedReceipt) {
      if (attempted || busy || released) fail('WINDOW_OPEN_REPLAY_REJECTED')
      if (typeof executeOpen !== 'function' || typeof readVerifiedReceipt !== 'function') fail('WINDOW_SESSION_INPUT_REJECTED')
      attempted = true
      busy = true
      try {
        await assertHeld()
        let ackLost = false
        try { await executeOpen() } catch { ackLost = true }
        // Only a still-held original session permits read-only ACK recovery.
        await assertHeld()
        let observed
        try { observed = await readVerifiedReceipt() } catch { fail('WINDOW_OPEN_RECONCILIATION_REQUIRED') }
        await assertHeld()
        if (!observed || Object.keys(observed).sort().join(',') !== 'openedAt,operationId,planSha256'
          || observed.planSha256 !== expected.planSha256 || observed.operationId !== expected.operationId
          || typeof observed.openedAt !== 'string'
          || !/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}(?::?\d{2})?)$/.test(observed.openedAt)) {
          fail('WINDOW_OPEN_RECEIPT_REJECTED')
        }
        // Preserve original PostgreSQL text. Never Date/ISO/round-trip a receipt.
        receipt = Object.freeze({ ...observed })
        return Object.freeze({ receipt, reconciled: ackLost })
      } finally { busy = false }
    },
    receipt() {
      if (!receipt || poisoned || released) fail('WINDOW_OPEN_RECEIPT_UNAVAILABLE')
      return receipt
    },
    async releaseAfterClosed(verifyFlagsAndSqlClosed) {
      if (busy || released || typeof verifyFlagsAndSqlClosed !== 'function') fail('WINDOW_SESSION_RELEASE_REJECTED')
      busy = true
      try {
        await assertHeld()
        if (await verifyFlagsAndSqlClosed() !== true) fail('WINDOW_SESSION_CLEANUP_NOT_CONFIRMED')
        await assertHeld()
        const result = await client.query('SELECT pg_advisory_unlock($1::int,$2::int) AS released', lockKey)
        if (result.rows.length !== 1 || result.rows[0].released !== true || poisoned) fail('WINDOW_SESSION_RELEASE_UNCERTAIN')
        released = true
        client.off('error', poison)
        client.off('end', poison)
      } catch (error) {
        if (error?.message === 'WINDOW_SESSION_CLEANUP_NOT_CONFIRMED') throw error
        poisoned = true
        fail('WINDOW_SESSION_RELEASE_UNCERTAIN')
      } finally { busy = false }
    },
  })
}
