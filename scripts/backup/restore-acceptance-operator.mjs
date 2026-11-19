// Private orchestration only: injected sessions/preflight, no login, env or network.
import { PLAN_HASH, loadRestorePlan, inspectRestoreJournal, executeNextRestoreAction } from './restore-acceptance-engine.mjs'
import fs from 'node:fs'
const plan = loadRestorePlan()
const ownerEnd = plan.steps.reduce((n, step) => n + (step.expected === 'REJECT' ? 1 : 2), 0)
const fail = () => { throw Error('RESTORE_OPERATOR_STOP') }

export async function runRestoreRolePhase(options) {
  let stage = 'GATE', client, logout = 'NOT_ESTABLISHED', confirmed = 0, attempted = 0, phasePassed = false, lease, leaseReleased = false
  const { journal, role, allowRun = false, reviewedPlanHash, expiresAt, preflight, openSession, now = Date.now } = options ?? {}
  const deadline = Date.parse(expiresAt)
  const requireWindow = () => {
    const current=now()
    if (!Number.isFinite(current) || !Number.isFinite(deadline) || deadline <= current || deadline > current + 900000) fail()
  }
  try {
    if (allowRun !== true || reviewedPlanHash !== PLAN_HASH || !['OWNER', 'CASHIER'].includes(role) || typeof preflight !== 'function' || typeof openSession !== 'function') fail()
    requireWindow()
    stage = 'LEASE'
    lease = fs.openSync(journal.file + '.phase.lock', 'wx', 0o600)
    fs.fsyncSync(lease)
    stage = 'JOURNAL'
    const initial = inspectRestoreJournal(journal)
    const start = role === 'OWNER' ? 0 : ownerEnd
    const end = role === 'OWNER' ? ownerEnd : plan.expectedTotalExplicitRpcCalls
    // A partial phase is investigated separately, never resumed by this entry point.
    if (initial.stopped || initial.pending || initial.cursor !== start) fail()
    stage = 'PREFLIGHT'
    if (await preflight({ role, cursor: initial.cursor, planHash: PLAN_HASH }) !== true) fail()
    requireWindow()
    stage = 'SESSION'
    logout = 'NOT_CONFIRMED'
    client = await openSession(role)
    stage = 'IDENTITY'
    const actor = await client.verifyIdentity()
    if (actor?.role !== role || actor.authId !== initial.actors[role] || actor.kioskId !== plan.kioskId) fail()
    while (inspectRestoreJournal(journal).cursor < end) {
      stage = 'PREFLIGHT'
      requireWindow()
      const current = inspectRestoreJournal(journal)
      if (current.stopped || current.pending || await preflight({ role, cursor: current.cursor, planHash: PLAN_HASH }) !== true) fail()
      requireWindow() // Preflight/session acquisition may have consumed the window.
      stage = 'ACTION'
      attempted++
      await executeNextRestoreAction(journal, actor, (rpc, params) => client.requestPlannedRpc(rpc, params))
      confirmed++
    }
    stage = 'FINAL_PREFLIGHT'
    requireWindow()
    if(await preflight({role,cursor:end,planHash:PLAN_HASH})!==true)fail()
    requireWindow()
    phasePassed = true
  } catch { /* Never return private exceptions, response bodies or credentials. */ }
  finally {
    if (client) {
      try {
        const result = await client.logoutLocal()
        if (result?.logoutLocalConfirmed === true) logout = 'CONFIRMED'
      } catch { logout = 'NOT_CONFIRMED' }
    }
    if (lease !== undefined) {
      try {
        fs.closeSync(lease)
        // Unknown login/logout outcomes, partial/uncertain actions and process crashes preserve the exclusion.
        if (logout !== 'NOT_CONFIRMED' && (phasePassed || attempted === 0)) { fs.unlinkSync(journal.file + '.phase.lock'); leaseReleased = true }
      } catch { stage = 'LEASE_CLEANUP' }
    }
  }
  return Object.freeze({ status: phasePassed && logout === 'CONFIRMED' && leaseReleased ? 'ROLE_PHASE_PASS' : 'ROLE_PHASE_NOT_CONFIRMED', stage: phasePassed && stage !== 'LEASE_CLEANUP' ? 'LOGOUT' : stage, confirmed, logout, mayRetry: false })
}
