import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)))
const steps = join(root, 'steps')
const manifestPath = join(root, 'manifest.json')
const args = process.argv.slice(2)
const mode = args[0] || '--check'
const arg = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined }
const installedFiles = [
  join(root, '001_domain.sql'),
  join(root, '002_identity_helpers.sql'),
  ...readdirSync(steps).filter(name => name.endsWith('.sql')).sort().map(name => join(steps, name)),
  join(root, '900_final_security.sql'),
]
const ordered = installedFiles.map(file => relative(root, file).split(sep).join('/'))
const importWindowAfter = 'steps/041_catalog_support_write_hardening.sql'
const postImportFiles = ['steps/042_post_import_triggers.sql', '900_final_security.sql']
const expected = arg('--expected-project-ref') ?? process.env.F6_EXPECTED_PROJECT_REF ?? ''
const actual = arg('--actual-project-ref') ?? process.env.F6_ACTUAL_PROJECT_REF ?? ''

function digest(file) { return createHash('sha256').update(readFileSync(file)).digest('hex') }
function fileEntry(relBootstrapPath, block) {
  const fullPath = resolve(root, relBootstrapPath)
  const repoRoot = resolve(root, '../..')
  return {
    block,
    path: relative(repoRoot, fullPath).split(sep).join('/'),
    bootstrapPath: relBootstrapPath,
    sha256: digest(fullPath),
  }
}
function generate() {
  const commercialFiles = readdirSync(join(root, 'commercial')).filter(name => name.endsWith('.sql')).sort()
    .map(name => ({ path: `commercial/${name}`, sha256: digest(join(root, 'commercial', name)) }))
  const pilotOpsFiles = [{ path: 'pilot-operations/001_capabilities.sql', sha256: digest(join(root, 'pilot-operations/001_capabilities.sql')) }]
  const envasesCoreFiles = ['envases/001_shared_ledger.sql', 'envases/002_checkout_receipts.sql']
    .map(path => ({ path, sha256: digest(join(root, path)) }))
  const returnsPrereqFiles = [
    '../../supabase_fase_devolucion_registro_privado.sql',
    '../../supabase_fase_devolucion_calculo_historico.sql',
    '../../supabase_fase_devolucion_preparacion_privada.sql',
  ].map(path => ({ path, sha256: digest(resolve(root, path)) }))
  const returnsCoreFiles = ['returns/001_atomic_cash_return.sql', 'returns/002_owner_envases_return.sql']
    .map(path => ({ path, sha256: digest(join(root, path)) }))
  const finalIncrementalFiles = ['envases/003_pending_totals.sql', 'returns/003_whole_unit_quantities.sql']
    .map(path => ({ path, sha256: digest(join(root, path)) }))
  const chainEntries = [
    ...ordered.map(path => fileEntry(path, 'baseline')),
    ...commercialFiles.map(entry => fileEntry(entry.path, 'commercial')),
    ...pilotOpsFiles.map(entry => fileEntry(entry.path, 'pilot-operations')),
    ...envasesCoreFiles.map(entry => fileEntry(entry.path, 'envases-core')),
    ...returnsPrereqFiles.map(entry => fileEntry(entry.path, 'returns-prerequisites')),
    ...returnsCoreFiles.map(entry => fileEntry(entry.path, 'returns-core')),
    ...finalIncrementalFiles.map(entry => fileEntry(entry.path, 'final-incrementals')),
  ].map((entry, idx) => ({ order: idx + 1, ...entry }))

  return { version: 2, profile: 'ONE_SHOT_EMPTY_DB', expectedProjectRef: null,
    importWindowAfter, postImportFiles,
    files: ordered.map(path => ({ path, sha256: digest(join(root, path)) })),
    optionalModules: {
      commercial: {
        installAfter: '900_final_security.sql',
        automaticInstall: false,
        incrementalPath: '../../supabase_fase_comercial_suscripciones.sql',
        incrementalSha256: digest(join(root, '../../supabase_fase_comercial_suscripciones.sql')),
        files: commercialFiles,
      },
      pilotOperations: {
        installAfter: 'commercial/003_commerce_provisioning.sql',
        automaticInstall: false,
        defaultCapabilitiesEnabled: false,
        files: pilotOpsFiles,
      },
      envases: {
        installAfter: 'pilot-operations/001_capabilities.sql',
        automaticInstall: false,
        files: envasesCoreFiles,
      },
      returnsPrerequisites: {
        installAfter: 'envases/002_checkout_receipts.sql',
        automaticInstall: false,
        files: returnsPrereqFiles,
      },
      returns: {
        installAfter: '../../supabase_fase_devolucion_preparacion_privada.sql',
        automaticInstall: false,
        files: returnsCoreFiles,
      },
      finalIncrementals: {
        installAfter: 'returns/002_owner_envases_return.sql',
        automaticInstall: false,
        note: 'envases/003_pending_totals.sql must run after returns/002_owner_envases_return.sql so envases_movimientos_accion_check keeps DEVOLVER_CLIENTE, AJUSTAR_PENDIENTES and RECIBIR_PENDIENTES.',
        files: finalIncrementalFiles,
      },
    },
    fullSqlChain: chainEntries,
  }
}
function runSql(file) {
  if (expected && actual && expected !== actual) throw new Error('Expected and actual project refs do not match.')
  const result = spawnSync('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-v', `expected_ref=${expected}`, '-v', `actual_ref=${actual}`, '-f', join(root, file)], {
    cwd: root, env: process.env, stdio: 'inherit', windowsHide: true,
  })
  if (result.error) throw result.error
  if (result.status !== 0) process.exit(result.status || 1)
}

try {
  if (mode === '--write-manifest') {
    writeFileSync(manifestPath, `${JSON.stringify(generate(), null, 2)}\n`)
    process.stdout.write(`Wrote ${ordered.length} ordered SQL checksums.\n`)
  } else if (mode === '--check') {
    const saved = JSON.parse(readFileSync(manifestPath, 'utf8'))
    const current = generate()
    if (JSON.stringify(saved) !== JSON.stringify(current)) throw new Error('Bootstrap SQL order or SHA-256 manifest is stale.')
    if (expected && actual && expected !== actual) throw new Error('Expected and actual project refs do not match.')
    process.stdout.write(`Bootstrap manifest PASS (${ordered.length} ordered SQL files).\n`)
  } else if (mode === '--preflight') runSql('preflight.sql')
  else if (mode === '--postflight') runSql('postflight.sql')
  else throw new Error('Usage: node verify-manifest.mjs --check|--write-manifest|--preflight|--postflight [--expected-project-ref REF --actual-project-ref REF]')
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : 'Bootstrap verification failed.'}\n`)
  process.exit(1)
}
