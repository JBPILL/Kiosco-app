#!/usr/bin/env node
/**
 * F6.3B production bootstrap runner. PLAN mode is offline. The remote mode is
 * deliberately separate from the loopback-only F6.2D importer.
 */
import { createHash, randomUUID } from 'node:crypto'
import { lstat, readFile, realpath, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import {
  createZeroRowImportPlan,
  loadZeroRowPackage,
  reconcileZeroRowDestination,
  runC2OneShotPhases,
} from './f6-2d-c2-importer.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bootstrapRoot = path.join(repoRoot, 'supabase', 'bootstrap')
const bootstrapManifestPath = path.join(bootstrapRoot, 'manifest.json')
const preflightPath = path.join(bootstrapRoot, 'preflight.sql')
const postflightPath = path.join(bootstrapRoot, 'postflight.sql')
const approvedPackagePath = path.win32.normalize('C:\\KioskoPOS-Migration\\pre-cutover-export').toLowerCase()
const deniedRefs = new Set(['wlqujnwxrmksheubfrha', 'acoyfwwmhaeruciyedri'])
const expectedPostImportFiles = ['steps/042_post_import_triggers.sql', '900_final_security.sql']
const expectedPreImportCount = 41
const expectedSqlCount = 43
const expectedTriggerCount = 15
const allowedSystemExtensions = new Set([
  'address_standardizer', 'address_standardizer_data_us', 'btree_gist', 'citext', 'cube',
  'earthdistance', 'fuzzystrmatch', 'hstore', 'ltree', 'pg_graphql', 'pg_net',
  'pg_stat_statements', 'pgcrypto', 'pgjwt', 'pg_trgm', 'pg_uuidv7', 'pgvector',
  'postgis', 'postgis_tiger_geocoder', 'postgis_topology', 'supabase_vault',
  'tablefunc', 'tcn', 'unaccent', 'uuid-ossp', 'vector',
])

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex')
}

function stableJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`
}

function parseArgs(argv) {
  const [mode, ...rest] = argv
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index]
    if (!token.startsWith('--')) throw new Error(`Unexpected positional argument: ${token}`)
    const key = token.slice(2)
    assert(!Object.hasOwn(options, key), `--${key} was supplied more than once.`)
    if (['enable-production-bootstrap'].includes(key)) options[key] = true
    else {
      const value = rest[++index]
      assert(value && !value.startsWith('--'), `--${key} requires a value.`)
      options[key] = value
    }
  }
  return { mode, options }
}

export function assertAcceptedOptions(options, allowed) {
  const unexpected = Object.keys(options).filter(key => !allowed.includes(key))
  assert(unexpected.length === 0, `Unsupported option(s): ${unexpected.map(key => `--${key}`).join(', ')}.`)
}

export function validateProjectRef(value, label = 'Target project ref') {
  assert(typeof value === 'string' && /^[a-z0-9]{20}$/.test(value), `${label} must be a 20-character lowercase Supabase project ref.`)
  assert(!deniedRefs.has(value), `${label} is denied; legacy and staging can never be production bootstrap targets.`)
  return value
}

export function assertProductionTargetUrl(value, confirmedRef) {
  const targetRef = validateProjectRef(confirmedRef, '--confirm-target-ref')
  assert(typeof value === 'string' && value.length > 0, 'F6_PRODUCTION_DATABASE_URL is required; its value is never logged.')
  let url
  try { url = new URL(value) } catch { throw new Error('Invalid production database URL.') }
  assert(['postgres:', 'postgresql:'].includes(url.protocol), 'Only a PostgreSQL URL is accepted.')
  assert(url.port === '5432' && url.pathname === '/postgres', 'Production bootstrap requires port 5432 and database postgres; transaction pooling is refused.')
  const sslModes = url.searchParams.getAll('sslmode')
  assert(sslModes.length === 1 && sslModes[0] === 'verify-full', 'Production bootstrap requires exactly sslmode=verify-full.')
  const hostname = url.hostname.toLowerCase()
  const username = decodeURIComponent(url.username)
  let derivedRef
  if (hostname === `db.${targetRef}.supabase.co`) {
    assert(username === 'postgres', 'Direct Supabase connection must use the postgres role.')
    derivedRef = hostname.slice('db.'.length, -'.supabase.co'.length)
  } else {
    assert(/^aws-[0-9]+-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(hostname), 'Only the exact Supabase Direct host or official Session Pooler host is accepted.')
    assert(username === `postgres.${targetRef}`, 'Session Pooler username must identify the exact confirmed project ref.')
    derivedRef = username.slice('postgres.'.length)
  }
  assert(derivedRef === targetRef, 'Database URL project ref differs from --confirm-target-ref.')
  assert(!deniedRefs.has(derivedRef), 'Legacy and staging refs are denied as production targets.')
  return url
}

export function assertApprovedZeroRowPackagePath(packageDirectory) {
  assert(typeof packageDirectory === 'string' && packageDirectory.length > 0, '--package is required.')
  const normalized = path.win32.normalize(path.resolve(packageDirectory)).toLowerCase()
  assert(normalized === approvedPackagePath, 'Only C:\\KioskoPOS-Migration\\pre-cutover-export is approved for production bootstrap.')
  return path.resolve(packageDirectory)
}

export function validateCanonicalPlan(bootstrapManifest, packageManifest) {
  const plan = createZeroRowImportPlan(bootstrapManifest, packageManifest)
  assert(bootstrapManifest.files.length === expectedSqlCount, `Bootstrap manifest must contain exactly ${expectedSqlCount} SQL files.`)
  assert(plan.preImportSqlFiles.length === expectedPreImportCount, `Bootstrap manifest must contain exactly ${expectedPreImportCount} pre-import SQL files.`)
  assert(JSON.stringify(plan.postImportSqlFiles) === JSON.stringify(expectedPostImportFiles), 'Post-import SQL order must be 042 triggers then 900 final security.')
  assert(plan.preImportSqlFiles.at(-1) === bootstrapManifest.importWindowAfter, 'Import window must follow the manifest-declared pre-import boundary.')
  assert(plan.totalMigrableRows === 0, 'This production bootstrap accepts only a zero-row package.')
  return plan
}

export async function validateTransactionModel(bootstrapManifest, readSql = file => readFile(file, 'utf8')) {
  const files = []
  for (const item of bootstrapManifest.files) {
    const file = path.resolve(bootstrapRoot, item.path)
    assert(file.startsWith(`${bootstrapRoot}${path.sep}`), 'Bootstrap SQL path escapes the bootstrap directory.')
    const sql = await readSql(file)
    const withoutLineComments = sql.replace(/^\s*--.*$/gm, '')
    assert(/^\s*BEGIN\s*;\s*$/im.test(withoutLineComments), `${item.path}: each SQL file must open its own transaction.`)
    assert(/^\s*COMMIT\s*;\s*$/im.test(withoutLineComments), `${item.path}: each SQL file must commit its own transaction.`)
    assert(!/^\s*(?:CREATE\s+(?:UNIQUE\s+)?INDEX\s+CONCURRENTLY|VACUUM|CREATE\s+DATABASE|DROP\s+DATABASE|ALTER\s+SYSTEM|COPY\b|\\copy\b)/im.test(withoutLineComments), `${item.path}: contains a statement incompatible with transactional bootstrap.`)
    files.push({ path: item.path, transaction: 'FILE_ATOMIC_BEGIN_COMMIT' })
  }
  return { mode: 'ONE_TRANSACTION_PER_MANIFEST_SQL_FILE', files }
}

export function classifyBootstrapFailure(writeAttempted) {
  return writeAttempted ? 'TAINTED_BOOTSTRAP' : 'BLOCKED_NO_WRITES'
}

export async function buildProductionBootstrapPlan({ targetRef, packageDirectory, readPackage = loadZeroRowPackage, readBytes = readFile }) {
  const ref = validateProjectRef(targetRef, 'Target project ref')
  const approvedPath = assertApprovedZeroRowPackagePath(packageDirectory)
  const packageData = await readPackage(approvedPath)
  const manifestBytes = await readBytes(bootstrapManifestPath)
  const bootstrapManifest = JSON.parse(manifestBytes.toString('utf8'))
  const plan = validateCanonicalPlan(bootstrapManifest, packageData.packageManifest)
  const packageManifestPath = path.join(approvedPath, 'manifest.json')
  const packageManifestBytes = await readBytes(packageManifestPath)
  const packageHashes = []
  for (const item of bootstrapManifest.files) {
    const sqlPath = path.resolve(bootstrapRoot, item.path)
    assert(sqlPath.startsWith(`${bootstrapRoot}${path.sep}`), 'Bootstrap manifest SQL path escapes the bootstrap directory.')
    const sqlBytes = await readBytes(sqlPath)
    assert(sha256(sqlBytes) === item.sha256, `${item.path}: SQL SHA-256 differs from canonical bootstrap manifest.`)
    packageHashes.push({ file: item.path, sha256: item.sha256 })
  }
  const transactionModel = await validateTransactionModel(bootstrapManifest)
  return {
    schemaVersion: 1,
    status: 'PLANNED',
    targetProjectRef: ref,
    bootstrapManifestSha256: sha256(manifestBytes),
    sqlFiles: packageHashes,
    transactionModel,
    preImportSqlFiles: plan.preImportSqlFiles,
    importWindowAfter: bootstrapManifest.importWindowAfter,
    importAction: 'ZERO_ROW_NO_DML',
    postImportSqlFiles: plan.postImportSqlFiles,
    packageManifestSha256: sha256(packageManifestBytes),
    packageContentSha256: packageData.packageManifest.content_sha256,
    expectedMigrableRows: 0,
    checks: [
      'remote target identity and denylist', 'empty target preflight', '41 pre-import SQL files',
      'PRE_TRIGGERS checkpoint', 'zero-row package validation and no-op import', 'pre-trigger reconciliation',
      '042 install and exact 15-trigger verification', '900 final security', 'postflight', 'final reconciliation',
    ],
  }
}

function psqlCompatible(sql, expectedRef = '', actualRef = '') {
  const quote = value => `'${String(value).replaceAll("'", "''")}'`
  return sql.replace(/^\\set[^\r\n]*$/gm, '')
    .replace(/:'expected_ref'/g, quote(expectedRef))
    .replace(/:'actual_ref'/g, quote(actualRef))
}

export async function assertCleanTarget(client, expectedRef, actualRef, { allowedExtensions = allowedSystemExtensions } = {}) {
  assert(validateProjectRef(expectedRef) === actualRef, 'Target identity does not match the confirmed ref.')
  const session = await client.query(`SELECT current_user AS role, current_database() AS database,
    current_setting('transaction_read_only') AS transaction_read_only`)
  assert(session.rows[0]?.role === 'postgres', 'Remote bootstrap must connect as postgres.')
  assert(session.rows[0]?.database === 'postgres', 'Remote bootstrap must connect to database postgres.')
  assert(session.rows[0]?.transaction_read_only === 'off', 'Target connection is read-only; bootstrap cannot proceed.')

  const objectState = await client.query(`WITH public_objects AS (
      SELECT 'relation'::text AS kind, c.relname AS name, c.oid AS object_id, 'pg_class'::regclass AS class_id
      FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
      UNION ALL
      SELECT 'function', p.proname, p.oid, 'pg_proc'::regclass
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
      UNION ALL
      SELECT 'type', t.typname, t.oid, 'pg_type'::regclass
      FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='public' AND t.typrelid=0 AND t.typtype IN ('d','e','r','m')
    )
    SELECT o.kind, o.name, e.extname AS extension_name
    FROM public_objects o
    LEFT JOIN pg_depend d ON d.classid=o.class_id AND d.objid=o.object_id AND d.deptype='e'
    LEFT JOIN pg_extension e ON d.refclassid='pg_extension'::regclass AND d.refobjid=e.oid
    ORDER BY o.kind,o.name`)
  const unexpected = objectState.rows.filter(row => !row.extension_name || !allowedExtensions.has(row.extension_name))
  assert(unexpected.length === 0, `Target public schema is not clean; found ${unexpected.length} non-allowlisted object(s).`)

  const migration = JSON.parse((await readFile(path.join(bootstrapRoot, 'contract', 'data-migration.json'), 'utf8')).replace(/^\uFEFF/, ''))
  const contractRelations = [...new Set([
    ...migration.tables.map(table => table.name), ...migration.excludedTables, ...migration.reinitialize,
  ])]
  const presentContract = await client.query(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname=ANY($1::text[]) ORDER BY c.relname`, [contractRelations])
  assert(presentContract.rows.length === 0, 'Target already contains one or more KioskoPOS contract relations.')

  const preflight = await readFile(preflightPath, 'utf8')
  await client.query(psqlCompatible(preflight, expectedRef, actualRef))
  return { role: 'postgres', database: 'postgres', publicObjects: objectState.rows.length, allowlistedExtensionObjects: objectState.rows.length }
}

function expectedTriggers(sql) {
  return [...sql.matchAll(/\bCREATE\s+TRIGGER\s+("?[a-z_][a-z0-9_]*"?)\s+[\s\S]*?\bON\s+public\.("?[a-z_][a-z0-9_]*"?)/gi)]
    .map(match => ({ name: match[1].replaceAll('"', ''), table: match[2].replaceAll('"', '') }))
    .sort((a, b) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`))
}

async function verifyTriggers(client, sqlPath) {
  const sql = await readFile(path.resolve(bootstrapRoot, sqlPath), 'utf8')
  const expected = expectedTriggers(sql)
  assert(expected.length === expectedTriggerCount, `042 declares ${expected.length} triggers; expected ${expectedTriggerCount}.`)
  const actual = await client.query(`SELECT t.tgname AS name,c.relname AS table FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname,t.tgname`)
  const rows = actual.rows.sort((a, b) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`))
  assert(JSON.stringify(rows) === JSON.stringify(expected), 'Installed trigger names or tables differ from 042_post_import_triggers.sql.')
  return rows.length
}

async function assertEvidencePathAvailable(evidencePath) {
  assert(typeof evidencePath === 'string' && evidencePath.length > 0, '--evidence is required for remote mode.')
  const absolute = path.resolve(evidencePath)
  const parent = await realpath(path.dirname(absolute))
  const repo = await realpath(repoRoot)
  const relative = path.relative(repo, path.join(parent, path.basename(absolute)))
  assert(relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative), 'Evidence output must be outside the repository.')
  try {
    await lstat(absolute)
    throw new Error('Evidence output already exists; refusing to overwrite it.')
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error
  }
  return absolute
}

async function createEvidenceFile(file, evidence) {
  await writeFile(file, stableJson(evidence), { flag: 'wx' })
}

async function persistEvidence(file, evidence) {
  const temporary = `${file}.tmp-${randomUUID()}`
  try {
    await writeFile(temporary, stableJson(evidence), { flag: 'wx' })
    await rename(temporary, file)
  } catch (error) {
    await import('node:fs/promises').then(fs => fs.rm(temporary, { force: true })).catch(() => {})
    throw error
  }
}

export function createEvidenceRecord(plan, now = new Date().toISOString()) {
  return {
    schemaVersion: 1,
    status: 'PLANNED',
    timestamp: now,
    targetProjectRef: plan.targetProjectRef,
    bootstrapManifestSha256: plan.bootstrapManifestSha256,
    sqlFiles: plan.sqlFiles,
    packageManifestSha256: plan.packageManifestSha256,
    packageContentSha256: plan.packageContentSha256,
    expectedMigrableRows: 0,
    stepStatuses: Object.fromEntries(['REMOTE_PREFLIGHT', ...plan.preImportSqlFiles, 'PRE_TRIGGERS_CHECKPOINT', 'PACKAGE_VALIDATION', 'PACKAGE_ZERO_ROW_IMPORT', 'RECONCILIATION_PRE_TRIGGERS', ...plan.postImportSqlFiles, 'TRIGGER_VERIFICATION', 'POSTFLIGHT', 'RECONCILIATION_FINAL'].map(step => [step, 'NOT_RUN'])),
    lastPassedStep: null,
    writeAttempted: false,
    schemaSecurityCounts: null,
    triggerCount: null,
    reconciliationStatus: 'NOT_RUN',
    finalStatus: 'PLANNED',
  }
}

function safeError(error) {
  return error instanceof Error ? error.message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[database-url-redacted]') : 'Unexpected bootstrap error.'
}

async function executeProductionBootstrap({ databaseUrl, targetRef, packageDirectory, evidencePath, clientFactory = config => new Client(config), readSql = file => readFile(file, 'utf8') }) {
  const parsedUrl = assertProductionTargetUrl(databaseUrl, targetRef)
  const plan = await buildProductionBootstrapPlan({ targetRef, packageDirectory })
  const output = await assertEvidencePathAvailable(evidencePath)
  let evidence = createEvidenceRecord(plan)
  evidence.status = 'RUNNING'
  evidence.finalStatus = 'RUNNING'
  await createEvidenceFile(output, evidence)

  const client = clientFactory({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: true, servername: parsedUrl.hostname },
    connectionTimeoutMillis: 8000,
    query_timeout: 60000,
  })
  let activeStep = 'connection'
  try {
    await client.connect()
    activeStep = 'REMOTE_PREFLIGHT'
    evidence.stepStatuses[activeStep] = 'RUNNING'
    await assertCleanTarget(client, targetRef, targetRef)
    evidence.stepStatuses[activeStep] = 'PASS'
    evidence.lastPassedStep = activeStep
    await persistEvidence(output, evidence)

    let packageData = null
    const canonicalManifest = JSON.parse((await readFile(bootstrapManifestPath, 'utf8')).replace(/^\uFEFF/, ''))
    assert(sha256(await readFile(bootstrapManifestPath)) === plan.bootstrapManifestSha256, 'Bootstrap manifest changed after the plan was created.')
    const initiallyValidatedPackage = await loadZeroRowPackage(packageDirectory)
    const importPlan = validateCanonicalPlan(canonicalManifest, initiallyValidatedPackage.packageManifest)
    const sqlFiles = new Map(canonicalManifest.files.map(item => [item.path, item.sha256]))
    const preImportFiles = importPlan.preImportSqlFiles
    const postImportFiles = importPlan.postImportSqlFiles
    const progress = async (step, status, writeAttempted = false) => {
      activeStep = step
      evidence.stepStatuses[step] = status
      evidence.writeAttempted ||= writeAttempted
      if (status === 'PASS') evidence.lastPassedStep = step
      await persistEvidence(output, evidence)
    }

    const result = await runC2OneShotPhases({
      preImportStepCount: preImportFiles.length,
      preImport: async () => {
        for (const relativeSql of preImportFiles) {
          const step = relativeSql
          await progress(step, 'RUNNING', true)
          await client.query(await readSql(path.resolve(bootstrapRoot, relativeSql)))
          await progress(step, 'PASS')
        }
        await progress('PRE_TRIGGERS_CHECKPOINT', 'RUNNING')
        const checkpointTriggers = await client.query(`SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
          JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relkind IN ('r','p')`)
        assert(checkpointTriggers.rows[0].n === 0, 'Operational triggers exist before the import window.')
        await progress('PRE_TRIGGERS_CHECKPOINT', 'PASS')
      },
      importFixture: async () => {
        activeStep = 'PACKAGE_VALIDATION'
        evidence.stepStatuses[activeStep] = 'RUNNING'
        await persistEvidence(output, evidence)
        packageData = await loadZeroRowPackage(packageDirectory)
        validateCanonicalPlan(packageData.bootstrapManifest, packageData.packageManifest)
        const currentPackageManifest = await readFile(path.join(packageDirectory, 'manifest.json'))
        assert(sha256(currentPackageManifest) === plan.packageManifestSha256, 'Approved package manifest changed after the plan was created.')
        assert(packageData.packageManifest.content_sha256 === plan.packageContentSha256, 'Approved package content changed after the plan was created.')
        assert(packageData.result.totalMigrableRows === 0 && packageData.packageManifest.total_migrable_rows === 0, 'Production bootstrap accepts only zero migrable rows.')
        evidence.stepStatuses[activeStep] = 'PASS'
        evidence.lastPassedStep = activeStep
        await persistEvidence(output, evidence)
        activeStep = 'PACKAGE_ZERO_ROW_IMPORT'
        evidence.stepStatuses[activeStep] = 'RUNNING'
        await persistEvidence(output, evidence)
        // The validated package has no business or Auth rows; the import window is an explicit no-op.
        evidence.stepStatuses[activeStep] = 'PASS'
        evidence.lastPassedStep = activeStep
        await persistEvidence(output, evidence)
      },
      postImportFiles: postImportFiles,
      applySql: async relativeSql => {
        const step = relativeSql
        const actualHash = sha256(await readSql(path.resolve(bootstrapRoot, relativeSql)))
        assert(actualHash === sqlFiles.get(relativeSql), `${relativeSql}: SQL changed after the plan was verified.`)
        await progress(step, 'RUNNING', true)
        await client.query(await readSql(path.resolve(bootstrapRoot, relativeSql)))
        await progress(step, 'PASS')
      },
      reconcileAt: async phase => {
        const step = phase === 'pre-trigger' ? 'RECONCILIATION_PRE_TRIGGERS' : 'RECONCILIATION_FINAL'
        await progress(step, 'RUNNING')
        if (phase === 'pre-trigger') {
          const triggers = await client.query(`SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
            JOIN pg_namespace n ON n.oid=c.relnamespace WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relkind IN ('r','p')`)
          assert(triggers.rows[0].n === 0, 'Post-import triggers must be absent during pre-trigger reconciliation.')
        }
        assert(packageData, 'Package must be validated after the PRE_TRIGGERS checkpoint and before reconciliation.')
        const reconciliation = await reconcileZeroRowDestination(client, packageData.mapping, packageData.migration, { phase })
        await progress(step, 'PASS')
        evidence.reconciliationStatus = phase === 'final' ? 'PASS' : evidence.reconciliationStatus
        evidence.schemaSecurityCounts = {
          publicTables: reconciliation.publicTables,
          views: reconciliation.views.length,
          rlsTables: reconciliation.rlsTables,
          directDmlPrivileges: reconciliation.directDmlPrivileges,
          publicExecuteFunctions: reconciliation.publicExecuteFunctions,
          unsecuredDefiners: reconciliation.unsecuredDefiners,
          authUsers: reconciliation.authUsers,
          unexpectedBusinessRows: reconciliation.unexpectedBusinessRows,
        }
        await persistEvidence(output, evidence)
        return reconciliation
      },
      checkTriggers: async () => {
        activeStep = 'TRIGGER_VERIFICATION'
        evidence.stepStatuses[activeStep] = 'RUNNING'
        await persistEvidence(output, evidence)
        const count = await verifyTriggers(client, postImportFiles[0])
        evidence.triggerCount = count
        evidence.stepStatuses[activeStep] = 'PASS'
        evidence.lastPassedStep = activeStep
        await persistEvidence(output, evidence)
        return count
      },
      postflight: async () => {
        activeStep = 'POSTFLIGHT'
        evidence.stepStatuses[activeStep] = 'RUNNING'
        await persistEvidence(output, evidence)
        const sql = await readSql(postflightPath)
        await client.query(psqlCompatible(sql, targetRef, targetRef))
        evidence.stepStatuses[activeStep] = 'PASS'
        evidence.lastPassedStep = activeStep
        await persistEvidence(output, evidence)
      },
    })
    evidence.status = 'PASS'
    evidence.finalStatus = 'PASS'
    evidence.reconciliationStatus = 'PASS'
    evidence.result = result
    await persistEvidence(output, evidence)
    return { result, evidencePath: output }
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    const tainted = classifyBootstrapFailure(evidence.writeAttempted) === 'TAINTED_BOOTSTRAP'
    evidence.stepStatuses[activeStep] = 'FAILED'
    evidence.status = tainted ? 'TAINTED_BOOTSTRAP' : 'BLOCKED_NO_WRITES'
    evidence.finalStatus = evidence.status
    evidence.failure = safeError(error)
    await persistEvidence(output, evidence).catch(() => {})
    throw new Error(`${activeStep}: ${safeError(error)}. ${tainted ? 'STOP; target is TAINTED_BOOTSTRAP and must be recreated under a separate approval gate.' : 'STOP; no bootstrap SQL was attempted.'}`)
  } finally {
    await client.end().catch(() => {})
  }
}

async function main() {
  const { mode, options } = parseArgs(process.argv.slice(2))
  if (mode === 'PLAN_PRODUCTION_BOOTSTRAP') {
    assertAcceptedOptions(options, ['target-ref', 'package'])
    assert(!options['enable-production-bootstrap'], 'Plan mode must not be armed for writes.')
    assert(!process.env.F6_PRODUCTION_DATABASE_URL, 'Plan mode refuses a production database URL in the environment.')
    const plan = await buildProductionBootstrapPlan({ targetRef: options['target-ref'], packageDirectory: options.package })
    process.stdout.write(`${stableJson(plan)}`)
    return
  }
  if (mode === 'PRODUCTION_BOOTSTRAP_REMOTE') {
    assertAcceptedOptions(options, ['enable-production-bootstrap', 'confirm-target-ref', 'package', 'evidence'])
    assert(options['enable-production-bootstrap'] === true, 'Remote mode requires --enable-production-bootstrap.')
    const targetRef = validateProjectRef(options['confirm-target-ref'], '--confirm-target-ref')
    const packageDirectory = assertApprovedZeroRowPackagePath(options.package)
    const result = await executeProductionBootstrap({
      databaseUrl: process.env.F6_PRODUCTION_DATABASE_URL,
      targetRef,
      packageDirectory,
      evidencePath: options.evidence,
    })
    process.stdout.write(`PASS: production bootstrap complete. Evidence: ${result.evidencePath}\n`)
    return
  }
  throw new Error('Usage: node scripts/f6-3b-production-bootstrap.mjs PLAN_PRODUCTION_BOOTSTRAP --target-ref <new-ref> --package <approved-zero-row-package> | PRODUCTION_BOOTSTRAP_REMOTE --enable-production-bootstrap --confirm-target-ref <new-ref> --package <approved-zero-row-package> --evidence <new-file-outside-repo>')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    process.stderr.write(`BLOCKED: ${safeError(error)}\n`)
    process.exitCode = 2
  })
}
