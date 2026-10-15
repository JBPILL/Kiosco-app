import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { runC2OneShotPhases } from '../../scripts/f6-2d-c2-importer.mjs'
import {
  assertAcceptedOptions,
  assertApprovedZeroRowPackagePath,
  assertCleanTarget,
  assertProductionTargetUrl,
  buildProductionBootstrapPlan,
  classifyBootstrapFailure,
  createEvidenceRecord,
  validateCanonicalPlan,
  validateProjectRef,
  validateTransactionModel,
} from '../../scripts/f6-3b-production-bootstrap.mjs'

const root = process.cwd()
const bootstrap = join(root, 'supabase', 'bootstrap')
const ref = 'abcdefghijklmnopqrst'
const packagePath = 'C:\\KioskoPOS-Migration\\pre-cutover-export'
const packageManifest = {
  PRE_CUTOVER: true,
  export_mode: 'PRE_CUTOVER_EXPORT',
  contract_version: 'F6.2D-C3A-1',
  source_schema_fingerprint: 'a'.repeat(64),
  files: [],
  total_migrable_rows: 0,
  content_sha256: 'b'.repeat(64),
}

describe('F6.3B production bootstrap target guards', () => {
  it('rejects unsupported options instead of silently accepting a force override', () => {
    expect(() => assertAcceptedOptions({ force: true }, ['enable-production-bootstrap', 'confirm-target-ref'])).toThrow(/Unsupported option.*--force/)
  })

  it('accepts only confirmed new-project Direct or official Session Pooler URLs with verify-full TLS', () => {
    expect(assertProductionTargetUrl(`postgresql://postgres:synthetic@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`, ref).hostname)
      .toBe(`db.${ref}.supabase.co`)
    const pooler0 = `postgresql://postgres.${ref}:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`
    expect(assertProductionTargetUrl(pooler0, ref).hostname).toBe('aws-0-us-east-1.pooler.supabase.com')

    const pooler1 = `postgresql://postgres.${ref}:synthetic@aws-1-sa-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full`
    expect(assertProductionTargetUrl(pooler1, ref).hostname).toBe('aws-1-sa-east-1.pooler.supabase.com')
  })

  it.each([
    ['legacy', 'wlqujnwxrmksheubfrha'],
    ['staging', 'acoyfwwmhaeruciyedri'],
  ])('denies %s even when explicitly confirmed', (_label, denied) => {
    expect(() => validateProjectRef(denied)).toThrow(/denied/)
  })

  it.each([
    ['ref mismatch', `postgresql://postgres:synthetic@db.${ref}.supabase.co:5432/postgres?sslmode=verify-full`, 'zyxwvutsrqponmlkjihg'],
    ['wrong host', 'postgresql://postgres:synthetic@db.example.com:5432/postgres?sslmode=verify-full', ref],
    ['wrong database', `postgresql://postgres:synthetic@db.${ref}.supabase.co:5432/other?sslmode=verify-full`, ref],
    ['wrong port', `postgresql://postgres:synthetic@db.${ref}.supabase.co:6543/postgres?sslmode=verify-full`, ref],
    ['missing TLS verification', `postgresql://postgres:synthetic@db.${ref}.supabase.co:5432/postgres?sslmode=require`, ref],
    ['Session Pooler username mismatch', 'postgresql://postgres.otherprojectref123:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full', ref],
  ])('blocks %s', (_label, url, confirmed) => {
    expect(() => assertProductionTargetUrl(url, confirmed)).toThrow()
  })

  it('accepts only the approved zero-row package directory', () => {
    expect(assertApprovedZeroRowPackagePath(packagePath)).toBe(packagePath)
    expect(() => assertApprovedZeroRowPackagePath('C:\\KioskoPOS-Migration\\other-export')).toThrow(/Only C:/)
  })
})

describe('F6.3B empty-target and canonical-plan guards', () => {
  it('allows an empty public schema plus an allowlisted platform extension object', async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('current_user AS role')) return { rows: [{ role: 'postgres', database: 'postgres', transaction_read_only: 'off' }] }
        if (sql.includes('WITH public_objects')) return { rows: [{ kind: 'relation', name: 'spatial_ref_sys', extension_name: 'postgis' }] }
        if (sql.includes('c.relname=ANY')) return { rows: [] }
        if (sql.includes('DO $$')) return { rows: [] }
        throw new Error(`Unexpected preflight query: ${sql}`)
      },
    }
    await expect(assertCleanTarget(client as never, ref, ref)).resolves.toMatchObject({ role: 'postgres', database: 'postgres' })
  })

  it('blocks a non-extension business object or partial KioskoPOS relation', async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('current_user AS role')) return { rows: [{ role: 'postgres', database: 'postgres', transaction_read_only: 'off' }] }
        if (sql.includes('WITH public_objects')) return { rows: [{ kind: 'relation', name: 'productos', extension_name: null }] }
        throw new Error('Should block before other checks.')
      },
    }
    await expect(assertCleanTarget(client as never, ref, ref)).rejects.toThrow(/not clean/)
  })

  it('blocks a KioskoPOS contract relation already present even if other system objects are allowlisted', async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes('current_user AS role')) return { rows: [{ role: 'postgres', database: 'postgres', transaction_read_only: 'off' }] }
        if (sql.includes('WITH public_objects')) return { rows: [{ kind: 'relation', name: 'extension_fixture', extension_name: 'postgis' }] }
        if (sql.includes('c.relname=ANY')) return { rows: [{ name: 'productos' }] }
        throw new Error(`Unexpected preflight query: ${sql}`)
      },
    }
    await expect(assertCleanTarget(client as never, ref, ref)).rejects.toThrow(/KioskoPOS contract relations/)
  })

  it('keeps the SQL and runner platform-extension allowlists identical', async () => {
    const [runner, preflight] = await Promise.all([
      readFile(join(root, 'scripts', 'f6-3b-production-bootstrap.mjs'), 'utf8'),
      readFile(join(bootstrap, 'preflight.sql'), 'utf8'),
    ])
    const runnerBlock = runner.match(/const allowedSystemExtensions = new Set\(\[([\s\S]*?)\]\)/)?.[1]
    const sqlBlock = preflight.match(/e\.extname NOT IN \(([\s\S]*?)\)/)?.[1]
    expect(runnerBlock).toBeTruthy()
    expect(sqlBlock).toBeTruthy()
    const values = (block: string) => [...block.matchAll(/'([^']+)'/g)].map(match => match[1]).sort()
    expect(values(runnerBlock!)).toEqual(values(sqlBlock!))
  })

  it('plans exactly 41 pre-import files and 042 then 900 from the bootstrap manifest', async () => {
    const manifest = JSON.parse(await readFile(join(bootstrap, 'manifest.json'), 'utf8'))
    const plan = validateCanonicalPlan(manifest, packageManifest)
    expect(plan.preImportSqlFiles).toHaveLength(41)
    expect(plan.preImportSqlFiles.at(-1)).toBe(manifest.importWindowAfter)
    expect(plan.postImportSqlFiles).toEqual(['steps/042_post_import_triggers.sql', '900_final_security.sql'])
    expect(() => validateCanonicalPlan(manifest, { ...packageManifest, total_migrable_rows: 1 })).toThrow(/zero-row package/)
  })

  it('proves all 43 manifest SQL files are individual transactional units', async () => {
    const manifest = JSON.parse(await readFile(join(bootstrap, 'manifest.json'), 'utf8'))
    const model = await validateTransactionModel(manifest)
    expect(model.mode).toBe('ONE_TRANSACTION_PER_MANIFEST_SQL_FILE')
    expect(model.files).toHaveLength(43)
  })

  it('generates an offline plan with hashes, zero-row expectation, and no connection data', async () => {
    const plan = await buildProductionBootstrapPlan({
      targetRef: ref,
      packageDirectory: packagePath,
      readPackage: async () => ({ packageManifest }),
      readBytes: async file => file.endsWith('manifest.json') && file.includes('KioskoPOS-Migration')
        ? Buffer.from(JSON.stringify(packageManifest))
        : readFile(file),
    })
    expect(plan).toMatchObject({ status: 'PLANNED', targetProjectRef: ref, expectedMigrableRows: 0, importAction: 'ZERO_ROW_NO_DML' })
    expect(plan.sqlFiles).toHaveLength(43)
    expect(JSON.stringify(plan)).not.toMatch(/postgresql:\/\/|service_role|password|jwt/i)
  })
})

describe('F6.3B execution ordering and taint policy', () => {
  it('uses preflight, 41 SQL, checkpoint, package validation, no-op import, reconciliation, 042, 900, postflight', async () => {
    const events: string[] = []
    await runC2OneShotPhases({
      preImportStepCount: 41,
      preImport: async () => { events.push('41_SQL'); events.push('PRE_TRIGGERS_CHECKPOINT') },
      importFixture: async () => { events.push('PACKAGE_VALIDATION'); events.push('ZERO_ROW_NO_DML') },
      postImportFiles: ['steps/042_post_import_triggers.sql', '900_final_security.sql'],
      applySql: async file => { events.push(file) },
      reconcileAt: async phase => {
        events.push(phase === 'pre-trigger' ? 'RECONCILE_PRE' : 'RECONCILE_FINAL')
        return { counts: {}, salesByState: [], evidence: {}, foreignKeysChecked: 0, crossKiosk: 0, outOfScopeRows: {} }
      },
      checkTriggers: async () => { events.push('VERIFY_15_TRIGGERS'); return 15 },
      postflight: async () => { events.push('POSTFLIGHT') },
    })
    expect(events).toEqual([
      '41_SQL', 'PRE_TRIGGERS_CHECKPOINT', 'PACKAGE_VALIDATION', 'ZERO_ROW_NO_DML', 'RECONCILE_PRE',
      'steps/042_post_import_triggers.sql', 'VERIFY_15_TRIGGERS', '900_final_security.sql', 'POSTFLIGHT', 'RECONCILE_FINAL',
    ])
  })

  it('stops on the first SQL failure and classifies any attempted write as tainted', async () => {
    const events: string[] = []
    await expect(runC2OneShotPhases({
      preImportStepCount: 41,
      preImport: async () => { events.push('PREFLIGHT_AND_41_SQL') },
      importFixture: async () => { events.push('IMPORT') },
      postImportFiles: ['steps/042_post_import_triggers.sql', '900_final_security.sql'],
      applySql: async file => { events.push(file); throw new Error('synthetic SQL error') },
      reconcileAt: async () => {
        events.push('RECONCILE')
        return { counts: {}, salesByState: [], evidence: {}, foreignKeysChecked: 0, crossKiosk: 0, outOfScopeRows: {} }
      },
      checkTriggers: async () => 15,
      postflight: async () => { events.push('POSTFLIGHT') },
    })).rejects.toThrow('synthetic SQL error')
    expect(events).not.toContain('900_final_security.sql')
    expect(events).not.toContain('POSTFLIGHT')
    expect(classifyBootstrapFailure(true)).toBe('TAINTED_BOOTSTRAP')
    expect(classifyBootstrapFailure(false)).toBe('BLOCKED_NO_WRITES')
  })

  it('keeps evidence limited to public identifiers, hashes, counts, and step statuses', () => {
    const plan = {
      schemaVersion: 1,
      status: 'PLANNED' as const,
      targetProjectRef: ref,
      bootstrapManifestSha256: 'a'.repeat(64),
      sqlFiles: [{ file: '001_domain.sql', sha256: 'b'.repeat(64) }],
      transactionModel: { mode: 'ONE_TRANSACTION_PER_MANIFEST_SQL_FILE', files: [] },
      preImportSqlFiles: ['001_domain.sql'],
      importWindowAfter: '001_domain.sql',
      importAction: 'ZERO_ROW_NO_DML' as const,
      postImportSqlFiles: ['steps/042_post_import_triggers.sql', '900_final_security.sql'],
      packageManifestSha256: 'c'.repeat(64),
      packageContentSha256: 'd'.repeat(64),
      expectedMigrableRows: 0 as const,
      checks: [],
    }
    const evidence = createEvidenceRecord(plan, '2026-10-13T00:00:00.000Z')
    expect(evidence).toMatchObject({ status: 'PLANNED', finalStatus: 'PLANNED', writeAttempted: false, reconciliationStatus: 'NOT_RUN' })
    expect(JSON.stringify(evidence)).not.toMatch(/database_url|postgresql:\/\/|password|service_role|jwt|secret|token/i)
  })
})
