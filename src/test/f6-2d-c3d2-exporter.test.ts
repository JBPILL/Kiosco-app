// @vitest-environment node
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  approvedCandidateDependencies,
  assertApprovedSourceFingerprint,
  buildExportPackage,
  fingerprintSchemaRows,
  runReadOnlyExport,
  validateApprovedClassification,
  validateExportContract,
  validateExportPackage,
  validateOutputDirectory,
  writeExportPackageAtomically,
} from '../../scripts/f6-2d-c3a-exporter.mjs'

const mappingPath = 'supabase/bootstrap/contract/source-destination-mapping.json'
const migrationPath = 'supabase/bootstrap/contract/data-migration.json'
const stable = (value: unknown): unknown => Array.isArray(value)
  ? value.map(stable)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, stable((value as Record<string, unknown>)[key])]))
    : value
const stableJson = (value: unknown) => `${JSON.stringify(stable(value), null, 2)}\n`
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

type TestMigrationShape = {
  tables: Array<{ name: string }>
  openCashSessionsAtInventory: number
  legacyPreCutoverBaseline: { ventasLinkedToOpenCash: number }
  profileWithNullKioscoId: number
}

async function setup() {
  const [mapping, migrationValue] = await Promise.all([mappingPath, migrationPath].map(async file => JSON.parse(await fs.readFile(file, 'utf8'))))
  const migration = migrationValue as TestMigrationShape
  const contract = validateExportContract(mapping, migration)
  const schemaRows = contract.tables
    .filter((table: { countOnly?: boolean; enabled?: boolean }) => !table.countOnly && table.enabled !== false)
    .sort((left: { name: string }, right: { name: string }) => left.name.localeCompare(right.name))
    .flatMap((table: { name: string; columns?: string[] }) => (table.columns ?? []).map((column, index) => ({
      table_name: table.name,
      column_name: column,
      data_type: 'text',
      udt_name: 'text',
      is_nullable: 'YES',
      ordinal_position: index + 1,
    })))
  const fingerprint = fingerprintSchemaRows(schemaRows, contract)
  const block11Rows = [{ metric: 'test_metric', kiosco_id: null, dimension: null, row_count: 0, amount_sum: '0.00' }]
  const classification = {
    contractVersion: contract.version,
    classificationSchemaVersion: 'F6.2D-C3C-2',
    baselineStatus: 'PRE_CUTOVER_REVIEWED',
    classificationStatus: 'APPROVED',
    sourceSchemaFingerprint: fingerprint,
    reviewedBlocks: ['03', '04', '05', '06', '07', '08', '09', '10', '11'],
    block03Counts: Object.fromEntries(migration.tables.map((table: { name: string }) => [table.name, 0])),
    block11Rows,
    block11Sha256: sha256(stableJson(block11Rows)),
    tables: Object.fromEntries(contract.tables.map((table: { name: string }) => [table.name, { candidateIds: [], includeIds: [], exclude: {} }])),
  }
  const rowsByTable = Object.fromEntries(contract.tables.map((table: { name: string }) => [table.name, []]))
  return { mapping, migration, contract, schemaRows, fingerprint, classification, rowsByTable }
}

function emptySourceClient(schemaRows: Record<string, unknown>[], migration: TestMigrationShape, queryLog: string[]) {
  return {
    connect: vi.fn(async () => {}),
    end: vi.fn(async () => {}),
    query: vi.fn(async (sql: string) => {
      queryLog.push(sql)
      if (sql.startsWith('BEGIN')) return { rows: [] }
      if (sql === 'SHOW transaction_read_only') return { rows: [{ transaction_read_only: 'on' }] }
      if (sql.includes('information_schema.columns')) return { rows: schemaRows }
      if (sql.includes('FROM public."sesiones_caja" WHERE "estado" IS DISTINCT')) return { rows: [{ row_count: migration.openCashSessionsAtInventory }] }
      if (sql.includes('FROM public."ventas" AS v JOIN public."sesiones_caja"')) return { rows: [{ row_count: migration.legacyPreCutoverBaseline.ventasLinkedToOpenCash }] }
      if (sql.includes('FROM public."movimientos_caja" AS m JOIN public."sesiones_caja"')) return { rows: [{ row_count: 0 }] }
      if (sql.includes('FROM public."usuarios" WHERE "kiosco_id" IS NULL')) return { rows: [{ row_count: migration.profileWithNullKioscoId }] }
      if (/^SELECT count\(\*\)::bigint AS row_count FROM public\./.test(sql)) return { rows: [{ row_count: 0 }] }
      if (/^SELECT /.test(sql)) return { rows: [] }
      if (sql === 'ROLLBACK') return { rows: [] }
      throw new Error(`Unexpected synthetic client query: ${sql}`)
    }),
  }
}

afterEach(() => vi.unstubAllEnvs())

describe('F6.2D-C3D-2 exporter hardening', () => {
  it('accepts only an exact, well-formed approved source fingerprint', () => {
    const expected = 'a'.repeat(64)
    expect(() => assertApprovedSourceFingerprint(expected, expected)).not.toThrow()
    expect(() => assertApprovedSourceFingerprint(expected, 'b'.repeat(64))).toThrow(/differs from the approved classification/)
    for (const missingOrMalformed of [undefined, '', 'not-a-sha256', 'A'.repeat(64)]) {
      expect(() => assertApprovedSourceFingerprint(missingOrMalformed, expected)).toThrow(/missing or malformed/)
    }
    expect(() => assertApprovedSourceFingerprint(expected, '')).toThrow(/Current source schema fingerprint is malformed/)
  })

  it('rejects a missing fingerprint in the approved artifact before connecting', async () => {
    const { migration, classification } = await setup()
    const missing = { ...classification, sourceSchemaFingerprint: undefined }
    expect(() => validateApprovedClassification(missing, migration)).toThrow(/must carry a valid source schema fingerprint/)
  })

  it('blocks schema mismatch before business SELECTs and leaves no final package', async () => {
    const { mapping, migration, contract, schemaRows, classification } = await setup()
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'f6-c3d-fingerprint-'))
    const artifactPath = path.join(tempRoot, 'approved.json')
    const outputPath = path.join(tempRoot, 'export')
    await fs.writeFile(artifactPath, JSON.stringify({ ...classification, sourceSchemaFingerprint: '0'.repeat(64) }))
    const queryLog: string[] = []
    const client = emptySourceClient(schemaRows, migration, queryLog)
    vi.stubEnv('F6_LEGACY_READONLY_DATABASE_URL', 'postgresql://readonly:synthetic@db.wlqujnwxrmksheubfrha.supabase.co:5432/postgres?sslmode=verify-full')
    await expect(runReadOnlyExport({
      'enable-pre-cutover-export': true,
      'confirm-source-ref': 'wlqujnwxrmksheubfrha',
      classification: artifactPath,
      output: outputPath,
    }, mapping, migration, contract, { createClient: () => client })).rejects.toThrow(/differs from the approved classification/)
    expect(queryLog.some(sql => sql.includes('information_schema.columns'))).toBe(true)
    expect(queryLog.filter(sql => /^SELECT /.test(sql) && !sql.includes('information_schema.columns'))).toEqual([])
    expect(queryLog.at(-1)).toBe('ROLLBACK')
    await expect(fs.lstat(outputPath)).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it('requires nonexistent output and rejects files, directories, and junctions', async () => {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'f6-c3d-output-'))
    const newParent = path.join(parent, 'created-parent')
    const output = path.join(newParent, 'new-export')
    await expect(validateOutputDirectory(output)).resolves.toBe(output)
    expect(await fs.readdir(newParent)).toEqual([])

    const existingDirectory = path.join(parent, 'existing-directory')
    const existingFile = path.join(parent, 'existing-file')
    await fs.mkdir(existingDirectory)
    await fs.writeFile(existingFile, 'preserve')
    await expect(validateOutputDirectory(existingDirectory)).rejects.toThrow(/already exists as a directory/)
    await expect(validateOutputDirectory(existingFile)).rejects.toThrow(/already exists as a file/)

    const junction = path.join(parent, 'existing-junction')
    await fs.symlink(existingDirectory, junction, 'junction')
    await expect(validateOutputDirectory(junction)).rejects.toThrow(/already exists as a file link\/junction/)
    await fs.rm(parent, { recursive: true, force: true })
  })

  it('uses source candidate parents even when all their includeIds are empty', () => {
    const classification = { tables: {
      ventas: { candidateIds: ['sale-candidate'], includeIds: [], exclude: { 'sale-candidate': { reason: 'OUT_OF_SCOPE', note: 'excluded test candidate' } } },
      movimientos_stock: { candidateIds: ['movement-candidate'], includeIds: [], exclude: { 'movement-candidate': { reason: 'OUT_OF_SCOPE', note: 'excluded test candidate' } } },
    } }
    expect(approvedCandidateDependencies('detalles_venta', classification)).toEqual({ saleIds: ['sale-candidate'] })
    expect(approvedCandidateDependencies('pagos_venta', classification)).toEqual({ saleIds: ['sale-candidate'] })
    expect(approvedCandidateDependencies('movimiento_stock_costos', classification)).toEqual({ stockMovementIds: ['movement-candidate'] })
    expect(approvedCandidateDependencies('movimientos_caja', classification, ['closed-session'])).toEqual({ closedSessionIds: ['closed-session'] })
  })

  it('exports and validates a complete zero-row package through a synthetic read-only client', async () => {
    const { mapping, migration, contract, schemaRows, fingerprint, classification } = await setup()
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'f6-c3d-zero-export-'))
    const artifactPath = path.join(tempRoot, 'approved.json')
    const outputPath = path.join(tempRoot, 'pre-cutover-export')
    await fs.writeFile(artifactPath, JSON.stringify(classification))
    const queryLog: string[] = []
    const client = emptySourceClient(schemaRows, migration, queryLog)
    vi.stubEnv('F6_LEGACY_READONLY_DATABASE_URL', 'postgresql://readonly:synthetic@db.wlqujnwxrmksheubfrha.supabase.co:5432/postgres?sslmode=verify-full')
    const manifest = await runReadOnlyExport({
      'enable-pre-cutover-export': true,
      'confirm-source-ref': 'wlqujnwxrmksheubfrha',
      classification: artifactPath,
      output: outputPath,
    }, mapping, migration, contract, { createClient: () => client })
    expect(manifest.total_migrable_rows).toBe(0)
    expect(manifest.PRE_CUTOVER).toBe(true)
    expect(manifest.evidence_exported).toBe(false)
    const manifestFile = JSON.parse(await fs.readFile(path.join(outputPath, 'manifest.json'), 'utf8'))
    expect(manifestFile.source_schema_fingerprint).toBe(fingerprint)
    expect(manifestFile.total_migrable_rows).toBe(0)
    const expectedTables = contract.tables.filter((table: { enabled?: boolean }) => table.enabled !== false)
    expect(manifestFile.files).toHaveLength(expectedTables.length + 1)
    for (const table of expectedTables) {
      expect(JSON.parse(await fs.readFile(path.join(outputPath, `${table.name}.json`), 'utf8'))).toEqual([])
    }
    expect(JSON.parse(await fs.readFile(path.join(outputPath, 'auth-mapping.json'), 'utf8'))).toEqual([])
    expect(validateExportPackage({
      manifest: manifestFile,
      files: Object.fromEntries(await Promise.all([...expectedTables.map(async (table: { name: string }) => [
        `${table.name}.json`, await fs.readFile(path.join(outputPath, `${table.name}.json`), 'utf8'),
      ] as const), ['auth-mapping.json', await fs.readFile(path.join(outputPath, 'auth-mapping.json'), 'utf8')] as const])),
    }, contract, classification).totalMigrableRows).toBe(0)
    expect(queryLog.at(-1)).toBe('ROLLBACK')
    expect((await fs.readdir(tempRoot)).sort()).toEqual(['approved.json', 'pre-cutover-export'])
    await fs.rm(tempRoot, { recursive: true, force: true })
  })

  it('cleans only its unique temp directory after a staged write failure', async () => {
    const { mapping, migration, contract, classification, rowsByTable, fingerprint } = await setup()
    const packageArtifact = buildExportPackage({ mapping, migration, rowsByTable, generatedAt: '2026-01-01T00:00:00.000Z', sourceSchemaFingerprint: fingerprint, classification })
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'f6-c3d-write-failure-'))
    const output = path.join(parent, 'new-export')
    const unrelated = path.join(parent, 'keep.txt')
    await fs.writeFile(unrelated, 'preserve')
    let ownTemp = ''
    let writes = 0
    const io = {
      mkdtemp: async (prefix: string) => { ownTemp = await fs.mkdtemp(prefix); return ownTemp },
      writeFile: async (...args: Parameters<typeof fs.writeFile>) => { writes += 1; if (writes === 2) throw new Error('synthetic staged write failure'); return fs.writeFile(...args) },
      readFile: fs.readFile,
      readdir: fs.readdir,
      rename: fs.rename,
      rm: fs.rm,
    }
    await expect(writeExportPackageAtomically(output, packageArtifact, contract, classification, io)).rejects.toThrow(/synthetic staged write failure/)
    expect(await fs.readFile(unrelated, 'utf8')).toBe('preserve')
    await expect(fs.lstat(output)).rejects.toMatchObject({ code: 'ENOENT' })
    await expect(fs.lstat(ownTemp)).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.rm(parent, { recursive: true, force: true })
  })

  it('preserves a foreign output that appears at the promotion collision point', async () => {
    const { mapping, migration, contract, classification, rowsByTable, fingerprint } = await setup()
    const packageArtifact = buildExportPackage({ mapping, migration, rowsByTable, generatedAt: '2026-01-01T00:00:00.000Z', sourceSchemaFingerprint: fingerprint, classification })
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'f6-c3d-promotion-collision-'))
    const output = path.join(parent, 'new-export')
    let ownTemp = ''
    const io = {
      mkdtemp: async (prefix: string) => { ownTemp = await fs.mkdtemp(prefix); return ownTemp },
      writeFile: fs.writeFile,
      readFile: fs.readFile,
      readdir: fs.readdir,
      rename: async (source: string, destination: string) => {
        await fs.mkdir(destination)
        await fs.writeFile(path.join(destination, 'foreign.txt'), 'preserve')
        return fs.rename(source, destination)
      },
      rm: fs.rm,
    }
    await expect(writeExportPackageAtomically(output, packageArtifact, contract, classification, io)).rejects.toBeTruthy()
    expect(await fs.readFile(path.join(output, 'foreign.txt'), 'utf8')).toBe('preserve')
    expect((await fs.readdir(output))).toEqual(['foreign.txt'])
    await expect(fs.lstat(ownTemp)).rejects.toMatchObject({ code: 'ENOENT' })
    await fs.rm(parent, { recursive: true, force: true })
  })
})
