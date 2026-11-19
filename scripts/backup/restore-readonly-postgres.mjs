// Fixed administrative READ ONLY port. Never exposes a Client or arbitrary SQL.
import pg from 'pg'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { PLAN_HASH } from './restore-acceptance-engine.mjs'
import { verifyRestoreDependencyMetadata } from './restore-dependency-preflight.mjs'
import { buildRestoreStateReadSql, verifyRestoreStateRead } from './restore-state-preflight.mjs'
import { buildRestorePreservationReadSql, writeRestorePreservationBaseline, verifyRestorePreservation } from './restore-preservation.mjs'
const host = 'aws-1-sa-east-1.pooler.supabase.com'
const fail = code => { throw Error(code) }
export const RESTORE_CONNECT_DIAGNOSTICS = Object.freeze([
  'CONNECT_AUTH_OR_HANDSHAKE',
  'CONNECT_TIMEOUT',
  'CONNECT_NETWORK',
  'CONNECT_STARTUP_OPTIONS',
  'CONNECT_TLS',
  'CONNECT_SESSION_SET',
  'CONNECT_SESSION_PROBE',
  'CONNECT_SESSION_PROBE_READ_ONLY',
  'CONNECT_SESSION_PROBE_SEARCH_PATH',
  'CONNECT_SESSION_PROBE_ROLE',
  'CONNECT_SESSION_PROBE_DATABASE',
  'CONNECT_CLOSE',
])
function classifyConnectError(err, phase) {
  const code = typeof err?.code === 'string' ? err.code : ''
  const text = typeof err?.message === 'string' ? err.message : ''
  if (code === 'ETIMEDOUT' || /timeout expired|timed out|query read timeout/i.test(text)) return 'CONNECT_TIMEOUT'
  if (phase === 'SESSION_SET') return 'CONNECT_SESSION_SET'
  if (phase === 'PROBE') return 'CONNECT_SESSION_PROBE'
  if (code.startsWith('ERR_TLS_') || code.startsWith('ERR_SSL_') || /^(UNABLE_TO_|SELF_SIGNED_CERT|DEPTH_ZERO_SELF_SIGNED|CERT_)/.test(code) || /ssl|tls|certificate/i.test(text)) return 'CONNECT_TLS'
  if (['ENOTFOUND', 'EAI_AGAIN', 'ECONNREFUSED', 'ECONNRESET', 'EHOSTUNREACH', 'ENETUNREACH', 'EPIPE', 'EACCES'].includes(code)) return 'CONNECT_NETWORK'
  if (['08P01', '08006', '42704', '22023', 'XX000'].includes(code) || /unrecognized configuration parameter|startup|default_transaction_read_only|search_path/i.test(text)) return 'CONNECT_STARTUP_OPTIONS'
  return 'CONNECT_AUTH_OR_HANDSHAKE'
}
function failConnect(diagnostic) {
  const error = Error('RESTORE_READER_CONNECTION_NOT_CONFIRMED')
  error.diagnostic = RESTORE_CONNECT_DIAGNOSTICS.includes(diagnostic) ? diagnostic : 'CONNECT_AUTH_OR_HANDSHAKE'
  throw error
}
function pinnedSql(name, hash) {
  const source = readFileSync(new URL(name, import.meta.url), 'utf8').replaceAll('\r\n', '\n')
  if (createHash('sha256').update(source).digest('hex') !== hash) fail('RESTORE_READER_SQL_DRIFT')
  if (!source.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;\n') || !source.endsWith('ROLLBACK;\n')) fail('RESTORE_READER_SQL_DRIFT')
  return source.slice(source.indexOf('\n') + 1, -'ROLLBACK;\n'.length)
}
const metadataSql = pinnedSql('./restore-dependency-metadata.sql', '0b2d5d3ed8616893f72532f35bfa6984437e8bfcd871b837de7f0e1788d0e530')
const initialSql = pinnedSql('./restore-acceptance-preflight.sql', '63a7f084ed0c838b24b9cef6142d2084b53c17f96c4995a8ce394b8b284b5c2f')
function evidence(reply) {
  const rows = (Array.isArray(reply) ? reply : [reply]).flatMap(result => result?.rows ?? []).filter(row => Object.hasOwn(row, 'evidence'))
  if (rows.length !== 1) fail('RESTORE_READER_EVIDENCE_NOT_CONFIRMED')
  return rows[0].evidence
}
function validInitial(value, now) {
  const age = now - Date.parse(value?.observed_at)
  const fixtures = value?.fixture_counts, functions = value?.functions
  if (value?.read_only !== 'on' || value.identity_fuse !== true || value.plan_sha256 !== PLAN_HASH || value.public_overloads !== 4
    || !Number.isFinite(age) || age < -30000 || age > 300000 || value.operation_collisions !== 0 || value.stock_operation_collisions !== 0
    || !fixtures || Object.keys(fixtures).sort().join(',') !== 'clientes,lotes_producto,productos,proveedores' || Object.values(fixtures).some(n => n !== 0)
    || !Array.isArray(functions) || functions.length !== 4 || functions.map(row => row.signature).sort().join('|') !== [
      'public.capacidades_restauracion_backup(uuid)', 'public.restaurar_contacto_backup(uuid,uuid,text,uuid,jsonb)',
      'public.restaurar_lote_backup(uuid,uuid,uuid,jsonb)', 'public.restaurar_producto_backup(uuid,uuid,uuid,jsonb)',
    ].sort().join('|')
    || functions.some(row => row.present !== true || row.metadata_matches !== true)) fail('RESTORE_READER_INITIAL_NOT_CONFIRMED')
}
export async function connectRestoreReadOnlyPostgres(credentials, { Client = pg.Client, now = Date.now } = {}) {
  const { password, rootCertificate } = credentials ?? {}
  if (!credentials || Object.keys(credentials).sort().join(',') !== 'password,rootCertificate' || typeof password !== 'string' || !password.length || password.length > 4096
    || typeof rootCertificate !== 'string' || rootCertificate.length > 65536 || !rootCertificate.includes('-----BEGIN CERTIFICATE-----') || !rootCertificate.includes('-----END CERTIFICATE-----') || rootCertificate.includes('PRIVATE KEY')
    || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') fail('RESTORE_READER_INPUT_REJECTED')
  let client, disposed = false, poisoned = false, reading = false, phase = 'CONNECT', diagnostic = ''
  try {
    client = new Client({ host, port: 5432, database: 'postgres', user: 'postgres.acoyfwwmhaeruciyedri', password,
      ssl: { rejectUnauthorized: true, ca: rootCertificate, servername: host },
      application_name: 'kioskopos-restore-readonly', connectionTimeoutMillis: 10000, query_timeout: 15000, statement_timeout: 10000, idle_in_transaction_session_timeout: 15000 })
    client.on('error', () => { poisoned = true })
    await client.connect()
    if (client.connection?.stream?.encrypted !== true || client.connection.stream.authorized !== true) { diagnostic = 'CONNECT_TLS'; fail('TLS') }
    phase = 'SESSION_SET'
    await client.query('SET default_transaction_read_only = on;')
    await client.query('SET search_path = pg_catalog, public;')
    phase = 'PROBE'
    const probe = await client.query("SELECT current_setting('default_transaction_read_only') AS read_only,current_setting('search_path') AS search_path,current_user AS query_role,current_database() AS database_name")
    if (probe?.rows?.length !== 1) { diagnostic = 'CONNECT_SESSION_PROBE'; fail('Session') }
    if (probe.rows[0].read_only !== 'on') { diagnostic = 'CONNECT_SESSION_PROBE_READ_ONLY'; fail('Session') }
    if (probe.rows[0].search_path !== 'pg_catalog, public' && probe.rows[0].search_path !== 'pg_catalog,public') { diagnostic = 'CONNECT_SESSION_PROBE_SEARCH_PATH'; fail('Session') }
    if (probe.rows[0].query_role !== 'postgres') { diagnostic = 'CONNECT_SESSION_PROBE_ROLE'; fail('Session') }
    if (probe.rows[0].database_name !== 'postgres') { diagnostic = 'CONNECT_SESSION_PROBE_DATABASE'; fail('Session') }
  } catch (err) {
    if (!diagnostic) diagnostic = classifyConnectError(err, phase)
    try { await client?.end() } catch { diagnostic = 'CONNECT_CLOSE' }
    failConnect(diagnostic)
  }
  async function read(initial, journal, preservation) {
    if (disposed || poisoned || reading) fail('RESTORE_READER_UNAVAILABLE')
    reading = true
    let result, captured, failed = false
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      await client.query("SET LOCAL TIME ZONE 'UTC'")
      const metadata = evidence(await client.query(metadataSql))
      result = verifyRestoreDependencyMetadata(metadata, now())
      if (initial) {
        validInitial(evidence(await client.query(initialSql)), now())
        result = { ...result, initialState: 'ABSENT_FIXTURES_NO_COLLISIONS_ONLY' }
      }
      if(journal){
        const source=buildRestoreStateReadSql(journal)
        const body=source.slice(source.indexOf('\n')+1,source.lastIndexOf('ROLLBACK;'))
        const owned=verifyRestoreStateRead(journal,evidence(await client.query(body)),now())
        result={...result,ownedState:owned.status,cursor:owned.cursor}
      }
      if(preservation){
        const source=buildRestorePreservationReadSql(),body=source.slice(source.indexOf('\n')+1,source.lastIndexOf('ROLLBACK;'))
        const value=evidence(await client.query(body))
        if(preservation.capture)captured=value
        else result={...result,commercialPreservation:verifyRestorePreservation(journal,preservation.baseline,value,preservation.reviewedHash,now()).status}
      }
    } catch { failed = true }
    try { await client.query('ROLLBACK') } catch { failed = true }
    reading = false
    if (failed || poisoned) { poisoned = true; fail('RESTORE_READER_READ_NOT_CONFIRMED') }
    if(captured){
      try{const baseline=writeRestorePreservationBaseline(journal,captured,now());result={...result,baselineHash:baseline.baselineHash,preparationOnly:true}}
      catch{poisoned=true;fail('RESTORE_READER_BASELINE_NOT_CONFIRMED')}
    }
    return Object.freeze(result)
  }
  return Object.freeze({
    readDependencyMetadata: () => read(false),
    readInitialPreflight: () => read(true),
    readOwnedState: journal => { if(!journal) fail('RESTORE_READER_STATE_REQUIRED'); return read(false, journal) },
    capturePreservationBaseline: journal => {if(!journal)fail('RESTORE_READER_STATE_REQUIRED');return read(true,journal,{capture:true})},
    readPreservedState: (journal,baseline,reviewedHash) => {if(!journal||!baseline||!reviewedHash)fail('RESTORE_READER_STATE_REQUIRED');return read(false,journal,{baseline,reviewedHash})},
    async dispose() {
      if (disposed) return
      if (reading) fail('RESTORE_READER_BUSY')
      disposed = true
      try { await client.end() } catch { fail('RESTORE_READER_CLOSE_NOT_CONFIRMED') }
    },
  })
}
