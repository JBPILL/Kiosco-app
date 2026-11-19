// Reviewed historical metadata is a comparison baseline, never fresh remote proof.
import { readFileSync } from 'node:fs'
import { valueHash } from './restore-acceptance-engine.mjs'
export const REVIEWED_RESTORE_STRUCTURE_HASH = '9e33b734e18fa89ffa670e8f1a16d729088de5e1449e3b232238efe0a6f1c3c5'
const reviewed = JSON.parse(readFileSync(new URL('./restore-dependency-reviewed.json', import.meta.url), 'utf8'))
const keyFields = { tables: ['name'], functions: ['signature'], triggers: ['table', 'name'], columns: ['table', 'column'], constraints: ['table', 'name'] }
const counts = { tables: 16, functions: 21, triggers: 16, columns: 145, constraints: 78 }
const fail = () => { throw Error('RESTORE_DEPENDENCIES_NOT_CONFIRMED') }
function structure(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail()
  const result = {}
  for (const [section, fields] of Object.entries(keyFields)) {
    const rows = input[section]
    if (!Array.isArray(rows) || rows.length !== counts[section]) fail()
    const keyed = rows.map(row => {
      if (!row || typeof row !== 'object' || Array.isArray(row) || fields.some(field => typeof row[field] !== 'string' || !row[field].length)) fail()
      return { key: fields.map(field => row[field]).join('\0'), row }
    }).sort((a, b) => a.key < b.key ? -1 : a.key > b.key ? 1 : 0)
    if (new Set(keyed.map(row => row.key)).size !== rows.length) fail()
    result[section] = keyed.map(item => item.row)
  }
  return result
}
if (reviewed.projectRef !== 'acoyfwwmhaeruciyedri' || reviewed.serverVersion !== '17.11' || reviewed.structureSha256 !== REVIEWED_RESTORE_STRUCTURE_HASH || valueHash(structure(reviewed.metadata)) !== REVIEWED_RESTORE_STRUCTURE_HASH) fail()

export function verifyRestoreDependencyMetadata(input, now = Date.now()) {
  try {
    const observed = Date.parse(input?.observed_at)
    if (!Number.isFinite(now) || !Number.isFinite(observed) || observed > now + 30000 || now - observed > 300000 || input?.read_only !== 'on' || input.query_role !== 'postgres' || input.identity_fuse !== true || input.server_version !== reviewed.serverVersion) fail()
    if (valueHash(structure(input)) !== REVIEWED_RESTORE_STRUCTURE_HASH) fail()
    return Object.freeze({ status: 'METADATA_MATCH_ONLY', structureHash: REVIEWED_RESTORE_STRUCTURE_HASH, ...counts })
  } catch { fail() }
}
