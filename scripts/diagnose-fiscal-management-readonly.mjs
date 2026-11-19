// Private, GET-only diagnostic. Never opens a window, reads originals or logs responses.
import { pathToFileURL } from 'node:url'
import { createPreparationManagement } from './fiscal-preparation-management.mjs'
const endpoint = 'https://api.supabase.com/v1/projects/acoyfwwmhaeruciyedri/secrets'
const failure = reason => 'MGMT_READONLY_NOT_CONFIRMED reason='+reason+' original_read=false write_attempted=false'
export async function diagnoseFiscalManagementReadonly(token, { fetcher = fetch } = {}) {
  let status = null, stage = 'TOKEN'
  try {
    const adapter = createPreparationManagement({ token,
      credentialId: '9a4916d1-b6b5-499f-98ef-9f6cf79510be', taKeyId: 'b14101fb-ba80-4d3f-a102-d2f8c96f3072' }, {
      fetcher: async (url, options) => {
        if (url !== endpoint || options?.method !== 'GET' || options.body !== undefined) throw Error('GET_ONLY')
        const response = await fetcher(url, options)
        status = response.status
        return response
      },
    })
    stage = 'READ'
    const rows = await adapter.readInventory()
    stage = 'CUSTODY'
    await adapter.assertCustodyMetadata(rows)
    return 'MGMT_READONLY_PASS status=200 names=6 flags_closed=true original_read=false write_attempted=false'
  } catch {
    if (stage === 'TOKEN') return failure('TOKEN_FORMAT')
    if (status === null) return failure('NETWORK_OR_TLS')
    if (status !== 200) return failure([401,403,404,429,500,502,503,504].includes(status) ? 'HTTP_'+status : 'HTTP_OTHER')
    return failure(stage === 'CUSTODY' ? 'CUSTODY_REJECTED' : 'METADATA_REJECTED')
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  let bytes, packet
  try {
    if (process.argv.length !== 3 || process.argv[2] !== '--run-read-only' || process.stdin.isTTY
      || Number(process.versions.node.split('.')[0]) < 24 || process.env.NODE_OPTIONS || process.env.NODE_PATH
      || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw Error('ENTRY')
    const chunks = []; let size = 0
    try {
      for await (const chunk of process.stdin) { size += chunk.length; if (size > 8192) throw Error('SIZE'); chunks.push(chunk) }
      bytes = Buffer.concat(chunks)
      packet = JSON.parse(new TextDecoder('utf8', { fatal: true }).decode(bytes))
    } finally { for (const chunk of chunks) chunk.fill(0) }
    if (!packet || Object.keys(packet).join(',') !== 'token') throw Error('ENTRY')
    const result = await diagnoseFiscalManagementReadonly(packet.token)
    console.log(result)
    if (!result.startsWith('MGMT_READONLY_PASS ')) process.exitCode = 1
  } catch { console.log(failure('ENTRY')); process.exitCode = 1 }
  finally { bytes?.fill(0); if (packet) packet.token = ''; packet = null }
}
