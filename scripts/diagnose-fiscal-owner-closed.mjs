// Exact private Auth adapter, without preparation commands or window authority.
import { pathToFileURL } from 'node:url'
import { authenticatePrivateOwner } from './fiscal-private-owner-session.mjs'
const safeCodes = new Set(['PRIVATE_OWNER_INPUT_REJECTED','PRIVATE_OWNER_JWT_REJECTED',
  'PRIVATE_OWNER_RESPONSE_REJECTED','PRIVATE_OWNER_NETWORK_UNCERTAIN','PRIVATE_OWNER_LOGIN_NOT_CONFIRMED',
  'PRIVATE_OWNER_AUTH_NOT_CONFIRMED','PRIVATE_OWNER_PROFILE_NOT_CONFIRMED',
  'PRIVATE_OWNER_FAILURE_LOGOUT_NOT_CONFIRMED','PRIVATE_OWNER_LOGOUT_NOT_CONFIRMED',
  'PRIVATE_BACKEND_CLOSED_NOT_CONFIRMED'])
export async function diagnoseFiscalOwnerClosed(credentials, options = {}) {
  let session, reason = null, logout = 'NOT_ESTABLISHED'
  try {
    if (!credentials || Object.keys(credentials).sort().join(',') !== 'email,password,publicKey') throw Error('ENTRY')
    session = await authenticatePrivateOwner({ ...credentials,
      expectedOwnerAuthId: '0e90b9a7-36d2-4762-ab1a-4982996cf9aa',
      expectedKioskId: 'b7254826-c767-4098-94b8-71013c12021d' }, options)
    await session.probeBackendClosed()
  } catch (error) { reason = safeCodes.has(error?.message) ? error.message : 'ENTRY' }
  finally {
    if (session) {
      try { await session.logoutLocal(); logout = 'CONFIRMED' }
      catch { reason = 'PRIVATE_OWNER_LOGOUT_NOT_CONFIRMED'; logout = 'NOT_CONFIRMED' }
    }
  }
  return reason === null
    ? 'OWNER_CLOSED_PASS identity=true profile=true backend503=true logout_local=CONFIRMED window=false arca=false'
    : 'OWNER_CLOSED_NOT_CONFIRMED reason='+reason+' logout_local='+logout+' window=false arca=false'
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let packet, bytes
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--run-closed' || process.stdin.isTTY
      || process.env.NODE_OPTIONS || process.env.NODE_PATH || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('ENTRY')
    const chunks = []; let size = 0
    try {
      for await (const chunk of process.stdin) { chunks.push(chunk); size += chunk.length; if (size > 16384) throw Error('SIZE') }
      bytes = Buffer.concat(chunks)
      packet = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))
    } finally { for (const chunk of chunks) chunk.fill(0) }
    const line = await diagnoseFiscalOwnerClosed(packet)
    console.log(line); if (!line.startsWith('OWNER_CLOSED_PASS ')) process.exitCode = 1
  } catch { console.log('OWNER_CLOSED_NOT_CONFIRMED reason=ENTRY logout_local=NOT_ESTABLISHED window=false arca=false'); process.exitCode = 1 }
  finally { bytes?.fill(0); if (packet && typeof packet === 'object') for (const key of Object.keys(packet)) packet[key] = '' }
}
