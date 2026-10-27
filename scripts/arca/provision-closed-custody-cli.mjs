// Invoked by the interactive PowerShell operator wrapper. stdin only, no values in argv.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { provisionClosedCustody, diagnoseClosedCustodyInventory } from './provision-closed-custody.mjs'
import { validateCustodyProvisionPlan } from '../fiscal-custody-plan.mjs'

let bytes, packet
try {
  if (process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('RUNTIME_POLICY')
  if (process.argv.length === 4 && process.argv[2] === '--prepare') {
    const proposal = JSON.parse(readFileSync(process.argv[3], 'utf8'))
    validateCustodyProvisionPlan(proposal.plan, proposal.planSha256)
    const probe = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', '[Console]::Out.Write("RUNTIME_READY")'],
      { encoding: 'utf8', timeout: 10000, windowsHide: true, env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '' } })
    if (probe.error || probe.status !== 0 || probe.stdout !== 'RUNTIME_READY' || probe.stderr) throw Error('RUNTIME')
    console.log('CUSTODY_OPERATOR_READY staging=true runtime=true private_read=false network=0')
  } else {
    const diagnostic = process.argv.length === 3 && process.argv[2] === '--inventory'
    if ((!diagnostic && process.argv.length !== 2) || process.stdin.isTTY) throw Error('CHANNEL')
    const chunks = []; let length = 0
    try {
      for await (const chunk of process.stdin) {
        length += chunk.length
        if (length > 32768) throw Error('CHANNEL')
        chunks.push(chunk)
      }
      bytes = Buffer.concat(chunks)
      packet = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))
    } finally { for (const chunk of chunks) chunk.fill(0) }
    if (diagnostic) {
      const result = await diagnoseClosedCustodyInventory(packet)
      console.log('CUSTODY_BASELINE_PASS count=' + result.count + ' flags_closed=true private_read=false write_attempted=false')
    } else {
      const result = await provisionClosedCustody(packet)
      console.log(result.status + ' count=6 flags_closed=true functional=false edge_check=REQUIRED')
    }
  }
} catch (error) {
  const reason = '(TOKEN_FORMAT|NETWORK_OR_TLS|HTTP_(401|403|404|429|500|502|503|504|OTHER)|METADATA_(SHAPE|FIELDS|DIGEST_FIELD|DIGEST_FORMAT|JSON_OR_SIZE)|INVENTORY_POLICY|INITIAL_STATE_REJECTED|PLAN_OR_INPUT|POLICY_OR_DELIVERY)'
  const safe = error instanceof Error && new RegExp('^(CUSTODY_PROVISION_NOT_CONFIRMED stage=(PLAN|AUTH|BASELINE|PRIVATE_COPY|PREWRITE_RECHECK|POST|VERIFY) write_attempted=(true|false) reconcile_before_retry=(true|false) reason=' + reason + '|CUSTODY_BASELINE_NOT_CONFIRMED reason=' + reason + ' private_read=false write_attempted=false)$').test(error.message)
  console.log(safe ? error.message : 'CUSTODY_OPERATOR_NOT_CONFIRMED')
  process.exitCode = 1
} finally { bytes?.fill(0); if (packet) packet.token = ''; packet = null }
