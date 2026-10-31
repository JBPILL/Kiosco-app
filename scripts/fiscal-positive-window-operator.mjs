// Unified private operator core. Importing never connects or reads credentials.
// Production adapters must bind the exact package and independently validate
// DB state. Ports are private capabilities, never browser/user-selected RPCs.
import { planFiscalPreparationToggle } from './plan-fiscal-preparation-toggle.mjs'
import { acquirePreparationSession } from './fiscal-preparation-session.mjs'
import { createPreparationFlags } from './fiscal-preparation-flags.mjs'
import { openPositiveWindowJournal } from './fiscal-positive-window-journal.mjs'
import { createPositivePreparationFlow } from './fiscal-positive-preparation-flow.mjs'
const scope = 'PRIMERA_VENTANA_POSITIVA_SIN_EMISION'
const fail = code => { throw Error(code) }

/** A GO attestation is a runtime guard, never a substitute for the user's GO.
 * On uncertainty, return explicit incomplete cleanup; never auto-reopen/retry.
 */
export async function executePositiveWindow(input, ports) {
  const config = JSON.parse(JSON.stringify(input.config))
  const plan = await planFiscalPreparationToggle(config)
  const hash = plan.data.manifest.planSha256
  if (input.approvedHash !== hash || input.authorizedScope !== scope
    || ports.db.projectRef !== 'acoyfwwmhaeruciyedri' || ports.db.planSha256 !== hash) fail('WINDOW_OPERATOR_GO_REJECTED')
  const binding = { projectRef: config.projectRef, planSha256: hash, operationId: config.operationId }
  const activationSql = plan.activationSql, closureSql = plan.closureSql
  let lease, journal, flags, owner, receipt, prepared, openAttempted = false, stage = 'PREFLIGHT'
  let flagsClosed = false, sqlClosed = false, logoutConfirmed = false, backendClosed503 = false, leaseReleased = false
  let preparationPassed = false
  const failures = []
  const report = at => { if (!failures.includes(at)) failures.push(at) }
  async function assertTime() {
    const now = ports.now()
    if (!Number.isSafeInteger(now) || now < Date.parse(config.startsAt) || now >= Date.parse(config.endsAt)) fail('WINDOW_OPERATOR_EXPIRED')
  }
  async function authority() {
    await lease.assertHeld()
    await assertTime()
    await owner.checkOwner()
    await ports.db.assertActiveBinding(receipt)
  }
  // This function is callable only after attempting ONE opening under the
  // original still-held session, never after reacquiring a replacement lease.
  async function recoverOpeningForCleanup() {
    await lease.assertHeld()
    const observed = await ports.db.readOpenedReceipt()
    await lease.assertHeld()
    if (observed.planSha256 !== hash || observed.operationId !== config.operationId || typeof observed.openedAt !== 'string') fail('WINDOW_OPERATOR_RECEIPT_REJECTED')
    receipt = Object.freeze({ ...observed })
    if (journal.state().openedAt === null) await journal.record('OPEN_RECEIPT', { openedAt: receipt.openedAt })
  }
  try {
    lease = await acquirePreparationSession(ports.client, binding)
    journal = openPositiveWindowJournal(input.journalPath, binding, { create: true, assertExclusive: lease.assertHeld })
    await ports.db.assertClosedBaseline()
    if(ports.db.baselineMetadata)await journal.record('BASELINE',ports.db.baselineMetadata())
    stage = 'MANAGEMENT'
    const inventory = await ports.management.readInventory()
    await ports.management.assertCustodyMetadata(inventory)
    flags = createPreparationFlags({ baselineInventory: inventory,
      readInventory: ports.management.readInventory, writeFlag: ports.management.writeFlag,
      assertExclusive: lease.assertHeld, assertOwnerAndWindow: authority })
    await flags.verifyClosed()
    stage = 'AUTH'
    owner = await ports.authenticateOwner(plan.data.requests)
    const identity = await owner.checkOwner()
    if (identity.ownerAuthId !== config.ownerAuthId || identity.kioskId !== config.kioskId) fail('WINDOW_OPERATOR_OWNER_REJECTED')
    await owner.probeBackendClosed()
    // Fresh independent baseline immediately before the SQL transaction; SQL
    // itself revalidates all locked bindings again after any blocking wait.
    await ports.db.assertClosedBaseline()
    await flags.verifyClosed()
    await assertTime()
    stage = 'OPEN'
    await journal.record('OPEN_ATTEMPT')
    openAttempted = true
    const opened = await lease.openOnce(() => ports.db.executeOpen(activationSql), ports.db.readOpenedReceipt)
    receipt = opened.receipt
    await journal.record('OPEN_RECEIPT', { openedAt: receipt.openedAt })
    stage = 'FLAGS'
    await flags.enable()
    await journal.record('FLAGS_ENABLED')
    stage = 'DATA'
    const flowPorts = {
      callPreparation: owner.callPreparation, assertAuthority: authority,
      loadJournal: async () => journal.flowJournal(),
      recordAttempt: async kind => {
        stage = kind === 'save' ? 'DATA' : 'BODY'
        await journal.record(kind === 'save' ? 'SAVE_ATTEMPT' : 'BODY_ATTEMPT')
      },
      recordPrepared: async value => { await journal.record('PREPARED', value) },
    }
    const flow = await createPositivePreparationFlow(config, hash, flowPorts)
    prepared = await flow.run()
    stage = 'RELOAD'
    // Fresh flow instance reads the durable journal and server identity again;
    // no cached body or successful write ACK is used as reload evidence.
    const reloadedFlow = await createPositivePreparationFlow(config, hash, flowPorts)
    const recovered = await reloadedFlow.reload()
    if (JSON.stringify(recovered) !== JSON.stringify(prepared)) fail('WINDOW_OPERATOR_RELOAD_CHANGED')
    await ports.db.verifyPrepared(prepared)
    preparationPassed = true
  } catch { report(stage) }
  finally {
    // Always attempt safe cleanup of OUR changes. A lost session is not
    // permission to take over or close another matching active window.
    if (lease && journal && openAttempted && !receipt) {
      try { await recoverOpeningForCleanup() } catch {
        try { await ports.db.assertClosedBaseline(); sqlClosed = true } catch { report('OPEN') }
      }
    }
    if (flags) {
      try { await flags.close(); flagsClosed = true } catch {
        // ACK loss is reconciled by read only, never a second flag write.
        try { await flags.verifyClosed(); flagsClosed = true } catch { report('FLAGS') }
      }
    }
    if (receipt && flagsClosed) {
      try { if (!journal.state().flagsClosed) await journal.record('FLAGS_CLOSED') } catch { report('CLOSE') }
      try {
        await lease.assertHeld()
        await ports.db.executeClose(closureSql, receipt.openedAt)
      } catch { /* No blind UPDATE retry; independent exact read below. */ }
      try {
        await lease.assertHeld()
        await ports.db.verifyClosed(receipt, prepared ?? null)
        sqlClosed = true
        await journal.record('SQL_CLOSED')
      } catch { report('CLOSE') }
    } else if (!openAttempted && lease) {
      try { await ports.db.assertClosedBaseline(); sqlClosed = true } catch { report('CLOSE') }
    }
    if (owner) {
      try {
        await owner.logoutAndVerifyClosed()
        logoutConfirmed = true; backendClosed503 = true
      } catch (error) {
        // The private Auth port reports this code only AFTER logout204.
        if (error?.message === 'PRIVATE_BACKEND_CLOSED_NOT_CONFIRMED') { logoutConfirmed = true; report('FINAL_PROBE') }
        else report('LOGOUT')
      }
      if (journal && lease) {
        try {
          if (logoutConfirmed) await journal.record('LOGOUT_CONFIRMED')
          if (backendClosed503) await journal.record('BACKEND_CLOSED')
        } catch { report('SESSION') }
      }
    }
    if (flagsClosed && sqlClosed && lease) {
      try {
        await flags.verifyClosed()
        if (receipt) await ports.db.verifyClosed(receipt, prepared ?? null)
        await lease.releaseAfterClosed(async () => flagsClosed && sqlClosed)
        leaseReleased = true
      } catch { report('CLOSE') }
    }
    if (journal) {
      try { journal.dispose() } catch { report('SESSION') }
    }
    // Ending the dedicated client on failure releases only its own session
    // lock. Pending cleanup remains explicitly unresolved, never advertised PASS.
    try { await ports.dispose() } catch { report('SESSION') }
  }
  const cleanupConfirmed = flagsClosed && sqlClosed && logoutConfirmed && backendClosed503 && leaseReleased
  return Object.freeze({ version: 1, projectRef: config.projectRef, operationId: config.operationId,
    passed: preparationPassed && cleanupConfirmed && failures.length === 0,
    preparationPassed, cleanupConfirmed, flagsClosed, sqlClosed, logoutConfirmed, backendClosed503,
    requiresReconciliation: !cleanupConfirmed || failures.length > 0, failures: Object.freeze([...failures]),
    prepared: prepared ?? null, emissionExecuted: false, cae: 0 })
}
