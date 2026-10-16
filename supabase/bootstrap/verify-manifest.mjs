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
function generate() {
  return { version: 2, profile: 'ONE_SHOT_EMPTY_DB', expectedProjectRef: null,
    importWindowAfter, postImportFiles,
    files: ordered.map(path => ({ path, sha256: digest(join(root, path)) })),
    optionalModules: {
      commercial: {
        installAfter: '900_final_security.sql',
        automaticInstall: false,
        incrementalPath: '../../supabase_fase_comercial_suscripciones.sql',
        incrementalSha256: digest(join(root, '../../supabase_fase_comercial_suscripciones.sql')),
        files: readdirSync(join(root, 'commercial')).filter(name => name.endsWith('.sql')).sort()
          .map(name => ({ path: `commercial/${name}`, sha256: digest(join(root, 'commercial', name)) })),
      },
    } }
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
