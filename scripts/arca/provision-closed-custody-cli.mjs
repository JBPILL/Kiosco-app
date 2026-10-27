// Invoked by the interactive PowerShell operator wrapper. stdin only, no values in argv.
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { provisionClosedCustody } from './provision-closed-custody.mjs'
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
    if (process.argv.length !== 2 || process.stdin.isTTY) throw Error('CHANNEL')
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
    const result = await provisionClosedCustody(packet)
    console.log(result.status + ' count=6 flags_closed=true functional=false edge_check=REQUIRED')
  }
} catch (error) {
  const safe = error instanceof Error && /^CUSTODY_PROVISION_NOT_CONFIRMED stage=(PLAN|AUTH|BASELINE|PRIVATE_COPY|PREWRITE_RECHECK|POST|VERIFY) write_attempted=(true|false) reconcile_before_retry=(true|false)$/.test(error.message)
  console.log(safe ? error.message : 'CUSTODY_OPERATOR_NOT_CONFIRMED')
  process.exitCode = 1
} finally { bytes?.fill(0); if (packet) packet.token = ''; packet = null }
