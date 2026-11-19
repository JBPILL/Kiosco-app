// For an explicitly authorized UI controller. Never print values or use exec_command.
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { CUSTODY_PROJECT, validateCustodyProvisionPlan, requireAbsentCustodyBaseline, custodyInventory } from '../fiscal-custody-plan.mjs'

const fail = () => { throw Error('FISCAL_PRIVATE_DELIVERY_NOT_CONFIRMED') }
const processStage = error => error?.code === 'EPERM' || error?.code === 'EACCES' ? 'PROCESS_DENIED' : error?.code === 'ENOENT' ? 'PROCESS_MISSING' : 'PROCESS_UNAVAILABLE'
/** @returns {Promise<Buffer>} Private memory only; raw stdout/stderr never become diagnostics. */
async function readPipe(plan, paths) {
  const args = ['-NoProfile', '-NonInteractive', '-File', fileURLToPath(new URL('./read-custody-provision-pipe.ps1', import.meta.url)),
    '-Certificado', paths.certificatePath, '-ClaveCifrada', paths.encryptedKeyPath, '-ProteccionDpapi', paths.protectionPath,
    '-CertificadoSha256', plan.certificateSha256, '-CuitCertificado', plan.certificateCuit,
    '-IdCredencial', plan.credentialId, '-IdClaveTa', plan.taKeyId]
  return new Promise((resolve, reject) => {
    let child
    try {
      child = spawn('pwsh', args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, NODE_OPTIONS: '', NODE_PATH: '', KIOSKOPOS_PRIVATE_CHANNEL_V1: '1' } })
    } catch (error) {
      reject(Error('FISCAL_PRIVATE_DELIVERY_NOT_CONFIRMED:' + processStage(error)))
      return
    }
    const chunks = [], errors = []
    let length = 0, errorLength = 0, failed = false, spawnFailure
    const stop = () => { failed = true; child.kill() }
    const timer = setTimeout(stop, 30000)
    child.stdout.on('data', chunk => { length += chunk.length; if (length > 220000) { chunk.fill(0); stop() } else chunks.push(chunk) })
    child.stderr.on('data', chunk => { errorLength += chunk.length; if (errorLength > 1024) { chunk.fill(0); stop() } else errors.push(chunk) })
    child.on('error', error => { failed = true; spawnFailure = processStage(error) })
    child.on('close', code => {
      clearTimeout(timer)
      const bytes = Buffer.concat(chunks)
      const errorBytes = Buffer.concat(errors)
      const safeStage = /^FISCAL_PRIVATE_CHANNEL_NOT_CONFIRMED:(CHANNEL|METADATA|PUBLIC_PIN|ORIGINAL_COPY|PACKET)$/.exec(errorBytes.toString('utf8'))?.[1]
      errorBytes.fill(0)
      for (const chunk of chunks) chunk.fill(0)
      for (const chunk of errors) chunk.fill(0)
      if (failed || code !== 0) { bytes.fill(0); reject(Error('FISCAL_PRIVATE_DELIVERY_NOT_CONFIRMED' + (spawnFailure || safeStage ? ':' + (spawnFailure || safeStage) : ''))) } else resolve(bytes)
    })
  })
}
/** @returns {Promise<object>} Values are hidden from enumeration/JSON and must be disposed after use. */
export async function preparePrivateCustodyDelivery({ plan: input, approvedHash, baseline, paths }) {
  let bytes, packet, records
  let stage = 'PLAN'
  try {
    const plan = validateCustodyProvisionPlan(input, approvedHash)
    stage = 'BASELINE'
    const before = requireAbsentCustodyBaseline(plan, baseline)
    stage = 'PATHS'
    if (!paths || Object.keys(paths).sort().join(',') !== 'certificatePath,encryptedKeyPath,protectionPath'
      || Object.values(paths).some(value => typeof value !== 'string' || !value || /[\r\n\0]/.test(value))) return fail()
    stage = 'READ_PIPE'
    bytes = await readPipe(plan, paths)
    stage = 'PACKET'
    packet = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!packet || Object.keys(packet).sort().join(',') !== 'certificateSha256,credentialId,projectRef,secrets,taKeyId,version'
      || packet.version !== 1 || packet.projectRef !== CUSTODY_PROJECT || packet.credentialId !== plan.credentialId
      || packet.taKeyId !== plan.taKeyId || packet.certificateSha256 !== plan.certificateSha256
      || JSON.stringify(Object.keys(packet.secrets ?? {})) !== JSON.stringify(plan.secretNames)
      || Object.values(packet.secrets).some(value => typeof value !== 'string' || !value || value.length > 100000)
      || packet.secrets[plan.secretNames[0]] !== '1' || packet.secrets[plan.secretNames[3]].length < 16
      || !/^[A-Za-z0-9+/]{43}=$/.test(packet.secrets[plan.secretNames[4]])
      || packet.secrets[plan.secretNames[5]] !== plan.taKeyId) return fail()
    records = new Map(Object.entries(packet.secrets))
    let disposed = false
    const alive = () => { if (disposed || Date.now() >= Date.parse(plan.expiresAt)) return fail() }
    return Object.freeze(Object.defineProperties({ projectRef: CUSTODY_PROJECT, names: Object.freeze([...plan.secretNames]), planSha256: approvedHash }, {
      value: { value(name) { alive(); if (!records.has(name)) return fail(); return records.get(name) } },
      verifyInventory: { value(inventory) {
        alive()
        try {
          const after = custodyInventory(inventory)
          if (after.size !== before.size + 6 || [...before].some(([name, digest]) => after.get(name) !== digest)
            || [...records].some(([name, value]) => after.get(name) !== createHash('sha256').update(value).digest('hex'))) return fail()
          return { presence: '6/6', newDigestsMatch: true, existingUnchanged: true, fiscalFlagsClosed: true, functionalCustodyProven: false }
        } catch {
          // A partial write or drift is terminal: do not retain a reusable delivery.
          disposed = true
          records.clear()
          return fail()
        }
      } },
      dispose: { value() { disposed = true; records.clear() } },
    }))
  } catch (error) {
    records?.clear()
    if (error instanceof Error && /^FISCAL_PRIVATE_DELIVERY_NOT_CONFIRMED:(CHANNEL|METADATA|PUBLIC_PIN|ORIGINAL_COPY|PACKET|PROCESS_DENIED|PROCESS_MISSING|PROCESS_UNAVAILABLE)$/.test(error.message)) throw Error(error.message)
    throw Error('FISCAL_PRIVATE_DELIVERY_NOT_CONFIRMED:' + stage)
  } finally {
    bytes?.fill(0)
    if (packet?.secrets) for (const name of Object.keys(packet.secrets)) packet.secrets[name] = ''
  }
}
