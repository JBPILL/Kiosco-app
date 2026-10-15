// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterEach, describe, expect, it } from 'vitest'
import { assertBootstrapManifestShape, assertFixtureStructure, assertForeignKeyMetadata, assertKeyMetadataContract, assertPackageManifestShape, assertZeroRowPackageArtifact, createZeroRowImportPlan, reconcile, reconcileZeroRowDestination, runC2OneShotPhases, validateC2Artifacts, validateLocalDatabaseUrl, type C2QueryClient } from '../../scripts/f6-2d-c2-importer.mjs'
import { validateExportContract } from '../../scripts/f6-2d-c3a-exporter.mjs'

const bootstrap = 'supabase/bootstrap'
const fixturePath = join(bootstrap, 'fixtures/f6-2d-c2-synthetic.json')
const mappingPath = join(bootstrap, 'contract/source-destination-mapping.json')
const manifestPath = join(bootstrap, 'manifest.json')
const databases: PGlite[] = []

afterEach(async () => {
  await Promise.all(databases.splice(0).map(db => db.close()))
})

describe('F6.2D-C2 synthetic importer contract', () => {
  it('accepts only explicit local Supabase PostgreSQL URLs', () => {
    expect(validateLocalDatabaseUrl('postgresql://postgres:synthetic@127.0.0.1:54322/postgres').hostname).toBe('127.0.0.1')
    expect(() => validateLocalDatabaseUrl('postgresql://x:y@acoyfwwmhaeruciyedri.supabase.co:5432/postgres')).toThrow(/loopback/)
    expect(() => validateLocalDatabaseUrl('postgresql://x:y@127.0.0.1:5432/postgres')).toThrow(/54322/)
    expect(() => validateLocalDatabaseUrl('postgresql://postgres:synthetic@127.0.0.1:54322/postgres?project-ref=wlqujnwxrmksheubfrha')).toThrow(/Project refs/)
  })

  it('rejects unknown, secret-bearing, and open-cash fixture content', async () => {
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
    const mapping = JSON.parse(await readFile(mappingPath, 'utf8'))
    expect(() => assertFixtureStructure({ ...fixture, tables: { ...fixture.tables, usuarios: [{ ...fixture.tables.usuarios[0], pin_hash: 'synthetic' }] } }, mapping)).toThrow(/forbidden field/)
    expect(() => assertFixtureStructure({ ...fixture, tables: { ...fixture.tables, sesiones_caja: [{ ...fixture.tables.sesiones_caja[0], estado: 'ABIERTA', fecha_cierre: null }] } }, mapping)).toThrow(/Open cash sessions/)
    expect(() => assertFixtureStructure({ ...fixture, tables: { ...fixture.tables, usuarios: [{ ...fixture.tables.usuarios[0], kiosco_id: null }] } }, mapping)).toThrow(/NULL kiosk profiles/)
    const crossKiosk = structuredClone(fixture)
    crossKiosk.tables.productos[0].kiosco_id = crossKiosk.tables.kioscos[1].id
    expect(() => assertFixtureStructure(crossKiosk, mapping)).toThrow(/cross-kiosk/)
    const malformedKeyContract = structuredClone(mapping)
    malformedKeyContract.keyMetadataContract.foreignKey.sourceColumns = 'string'
    expect(() => assertFixtureStructure(fixture, malformedKeyContract)).toThrow(/ordered sourceColumns\/destinationColumns string arrays/)
    expect(() => assertKeyMetadataContract(malformedKeyContract.keyMetadataContract)).toThrow(/ordered sourceColumns\/destinationColumns string arrays/)
  })

  it('rejects the real node-postgres name[] string shape and preserves composite FK order', () => {
    const realFailureShape = {
      table_schema: 'public',
      table_name: 'anulaciones_venta_atomicas',
      constraint_name: 'anulaciones_venta_atomicas_kiosco_id_fkey',
      foreign_table_schema: 'public',
      foreign_table_name: 'kioscos',
      source_columns: '{kiosco_id}',
      destination_columns: '{id}',
    }
    expect(() => assertForeignKeyMetadata(realFailureShape)).toThrow(/source_columns must be a non-empty string array/)
    expect(assertForeignKeyMetadata({ ...realFailureShape, source_columns: ['kiosco_id'], destination_columns: ['id'] })).toMatchObject({
      sourceColumns: ['kiosco_id'], destinationColumns: ['id'],
    })
    expect(assertForeignKeyMetadata({ ...realFailureShape, constraint_name: 'composite_fk', source_columns: ['kiosco_id', 'producto_id'], destination_columns: ['kiosco_id', 'id'] }).sourceColumns)
      .toEqual(['kiosco_id', 'producto_id'])
    expect(() => assertForeignKeyMetadata({ ...realFailureShape, source_columns: ['kiosco_id'], destination_columns: ['kiosco_id', 'id'] })).toThrow(/equal lengths/)
  })

  it('runs the exact one-shot order and reconciles before installing triggers', async () => {
    const events: string[] = []
    const outcome = await runC2OneShotPhases({
      preImport: async () => { events.push('PRE_IMPORT') },
      preImportStepCount: 41,
      importFixture: async () => { events.push('IMPORT') },
      postImportFiles: ['steps/042_post_import_triggers.sql', '900_final_security.sql'],
      applySql: async (file: string) => { events.push(file === 'steps/042_post_import_triggers.sql' ? '042' : '900') },
      reconcileAt: async (phase: string) => { events.push(phase === 'pre-trigger' ? 'RECONCILE_PRE' : 'RECONCILE_FINAL'); return { counts: { productos: 1 }, salesByState: [], evidence: {}, foreignKeysChecked: 1, crossKiosk: 0, outOfScopeRows: {} } },
      checkTriggers: async () => { events.push('CHECK_15_TRIGGERS'); return 15 },
      postflight: async () => { events.push('POSTFLIGHT') },
    })
    expect(events).toEqual(['PRE_IMPORT', 'IMPORT', 'RECONCILE_PRE', '042', 'CHECK_15_TRIGGERS', '900', 'POSTFLIGHT', 'RECONCILE_FINAL'])
    expect(outcome).toMatchObject({ preImportStepCount: 41, expectedPostImportTriggersBefore042: 0, preTriggerReconciliation: 'PASS', postImportTriggerCount: 15, finalReconciliation: 'PASS' })
  })

  it('stops before 042 when the pre-trigger reconciliation fails', async () => {
    const events: string[] = []
    await expect(runC2OneShotPhases({
      preImport: async () => { events.push('PRE_IMPORT') },
      preImportStepCount: 41,
      importFixture: async () => { events.push('IMPORT') },
      postImportFiles: ['steps/042_post_import_triggers.sql', '900_final_security.sql'],
      applySql: async (file: string) => { events.push(file) },
      reconcileAt: async () => { events.push('RECONCILE_PRE'); throw new Error('checkpoint mismatch') },
      checkTriggers: async () => 15,
      postflight: async () => { events.push('POSTFLIGHT') },
    })).rejects.toThrow('checkpoint mismatch')
    expect(events).toEqual(['PRE_IMPORT', 'IMPORT', 'RECONCILE_PRE'])
  })

  it('reconciles the imported fixture before triggers, then proves final hardening without replay side effects', async () => {
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
    const mapping = JSON.parse(await readFile(mappingPath, 'utf8'))
    assertFixtureStructure(fixture, mapping)
    const db = new PGlite()
    databases.push(db)
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
        SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
    const preflight = (await readFile(join(bootstrap, 'preflight.sql'), 'utf8'))
      .replace(/^\\set.*$/gm, '').replace(/:'expected_ref'/g, "''").replace(/:'actual_ref'/g, "''")
    await db.exec(preflight)
    const boundary = manifest.files.findIndex((item: { path: string }) => item.path === manifest.importWindowAfter)
    for (const item of manifest.files.slice(0, boundary + 1)) await db.exec(await readFile(join(bootstrap, item.path), 'utf8'))
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (
      SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
    )`)).rows[0].n).toBe(0)

    for (const user of fixture.authUsers) await db.query('INSERT INTO auth.users(id) VALUES($1)', [user.id])
    for (const [table, rows] of Object.entries(fixture.tables) as [string, Record<string, unknown>[]][]) {
      for (const row of rows) {
        const columns = Object.keys(row)
        const values = columns.map(column => row[column])
        const placeholders = columns.map((column, index) => `$${index + 1}${['solicitud','resultado'].includes(column) ? '::jsonb' : ''}`)
        await db.query(`INSERT INTO public."${table}" (${columns.map(column => `"${column}"`).join(',')}) VALUES (${placeholders.join(',')})`, values.map((value, index) => ['solicitud','resultado'].includes(columns[index]) ? JSON.stringify(value) : value))
      }
    }
    const oneShot = await runC2OneShotPhases({
      preImport: async () => {},
      preImportStepCount: manifest.files.findIndex((item: { path: string }) => item.path === manifest.importWindowAfter) + 1,
      importFixture: async () => {},
      postImportFiles: manifest.postImportFiles,
      applySql: async (file: string) => db.exec(await readFile(join(bootstrap, file), 'utf8')),
      reconcileAt: async () => reconcile(db as unknown as C2QueryClient, fixture),
      checkTriggers: async () => (await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (
        SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
      )`)).rows[0].n,
      postflight: async () => {
        const postflight = (await readFile(join(bootstrap, 'postflight.sql'), 'utf8'))
          .replace(/^\\set.*$/gm, '').replace(/:'expected_ref'/g, "''").replace(/:'actual_ref'/g, "''")
        await db.exec(postflight)
      },
    })
    const reconciled = oneShot.reconciliation as Awaited<ReturnType<typeof reconcile>>
    expect(reconciled.counts.kioscos).toBe(4)
    expect(reconciled.salesByState).toHaveLength(2)
    expect(reconciled.foreignKeysChecked).toBeGreaterThan(0)
    expect(reconciled.crossKiosk).toBe(0)

    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (
      SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
    )`)).rows[0].n).toBe(15)
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.movimientos_stock`)).rows[0].n).toBe(2)
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.movimiento_stock_costos`)).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.auditoria_operaciones`)).rows[0].n).toBe(0)
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.checkout_manuales`)).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.anulaciones_venta_atomicas`)).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.producto_costos`)).rows[0].n).toBe(3)
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.productos p LEFT JOIN public.producto_costos c ON c.producto_id=p.id WHERE p.id='f6600000-0000-0000-0000-000000000002' AND c.producto_id IS NULL`)).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.ventas WHERE estado='ANULADA' AND anulada_en IS NOT NULL`)).rows[0].n).toBe(1)
    expect((await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.sesiones_caja WHERE estado<>'CERRADA' OR fecha_cierre IS NULL`)).rows[0].n).toBe(0)
    expect((await db.query<{ stock_actual: string }>(`SELECT stock_actual::text FROM public.productos WHERE id='f6600000-0000-0000-0000-000000000001'`)).rows[0].stock_actual).toBe('9.000')
    expect((await db.query<{ anon_insert: boolean; auth_insert: boolean }>(`SELECT has_table_privilege('anon','public.productos','INSERT') AS anon_insert,
      has_table_privilege('authenticated','public.productos','INSERT') AS auth_insert`)).rows[0]).toEqual({ anon_insert: false, auth_insert: false })
  }, 120_000)
})


describe('F6.3A real zero-row package gate', () => {
  const digest = (value: string) => createHash('sha256').update(value).digest('hex')
  const packageArtifact = (tables: Record<string, string> = { 'kioscos.json': '[]', 'auth-mapping.json': '[]' }) => {
    const files = Object.fromEntries(Object.entries(tables).map(([file, content]) => [file, content]))
    const filesMeta = Object.entries(files).map(([file, content]) => ({ file, row_count: JSON.parse(content).length, checksum_sha256: digest(content) }))
    return { files, manifest: { PRE_CUTOVER: true, export_mode: 'PRE_CUTOVER_EXPORT', contract_version: 'F6.2D-C3A-1', source_schema_fingerprint: 'a'.repeat(64), evidence_exported: false, credentials_exported: 0, auth_sessions_exported: 0, files: filesMeta, content_sha256: digest(filesMeta.map(item => `${item.file}:${item.checksum_sha256}`).join('\n')), total_migrable_rows: filesMeta.filter(item => item.file !== 'auth-mapping.json').reduce((sum, item) => sum + item.row_count, 0) } }
  }
  const contract = { tables: [{ name: 'kioscos', enabled: true }] }

  it('accepts a verified zero-row business package and empty Auth mapping', () => {
    expect(assertZeroRowPackageArtifact(packageArtifact(), contract)).toMatchObject({ totalMigrableRows: 0, files: 2 })
  })

  it('rejects any business row, Auth mapping row, tampered checksum, or unexpected file', () => {
    expect(() => assertZeroRowPackageArtifact(packageArtifact({ 'kioscos.json': '[{}]', 'auth-mapping.json': '[]' }), contract)).toThrow(/row total|zero-row/i)
    expect(() => assertZeroRowPackageArtifact(packageArtifact({ 'kioscos.json': '[]', 'auth-mapping.json': '[{}]' }), contract)).toThrow(/zero-row package|Auth mappings|row count/i)
    const tampered = packageArtifact(); tampered.files['kioscos.json'] = '[{}]'
    expect(() => assertZeroRowPackageArtifact(tampered, contract)).toThrow(/checksum|zero-row/i)
    expect(() => assertZeroRowPackageArtifact(packageArtifact({ 'kioscos.json': '[]', 'auth-mapping.json': '[]', 'unexpected.json': '[]' }), contract)).toThrow(/file set/i)
  })

  it('keeps the real package manifest separate from the canonical 43-step bootstrap manifest', async () => {
    const bootstrapManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const mapping = JSON.parse(await readFile(mappingPath, 'utf8'))
    const migration = JSON.parse(await readFile(join(bootstrap, 'contract/data-migration.json'), 'utf8'))
    const exportContract = validateExportContract(mapping, migration)
    const files = Object.fromEntries([
      ...exportContract.tables.filter((table: { enabled?: boolean }) => table.enabled !== false).map((table: { name: string }) => [`${table.name}.json`, '[]']),
      ['auth-mapping.json', '[]'],
    ])
    const filesMeta = Object.entries(files).map(([file, content]) => ({ file, row_count: 0, checksum_sha256: digest(content as string) }))
    const packageManifest = {
      PRE_CUTOVER: true,
      export_mode: 'PRE_CUTOVER_EXPORT',
      contract_version: 'F6.2D-C3A-1',
      source_schema_fingerprint: 'a'.repeat(64),
      evidence_exported: false,
      credentials_exported: 0,
      auth_sessions_exported: 0,
      files: filesMeta,
      content_sha256: digest(filesMeta.map(item => `${item.file}:${item.checksum_sha256}`).join('\n')),
      total_migrable_rows: 0,
    }

    expect(assertBootstrapManifestShape(bootstrapManifest)).toBe(bootstrapManifest)
    expect(() => assertBootstrapManifestShape(packageManifest)).toThrow(/package manifest cannot be used as bootstrap manifest/)
    expect(assertPackageManifestShape(packageManifest)).toBe(packageManifest)
    expect(() => assertPackageManifestShape(bootstrapManifest)).toThrow(/bootstrap manifest cannot be used as package manifest/)
    expect(bootstrapManifest.files.every((item: { path?: string }) => typeof item.path === 'string')).toBe(true)
    expect(packageManifest.files.every((item: { file?: string; path?: string }) => typeof item.file === 'string' && item.path === undefined)).toBe(true)
    expect(assertZeroRowPackageArtifact({ files, manifest: packageManifest }, exportContract)).toMatchObject({ totalMigrableRows: 0, files: 22 })

    const plan = createZeroRowImportPlan(bootstrapManifest, packageManifest)
    expect(plan.preImportSqlFiles).toHaveLength(41)
    expect(plan.preImportSqlFiles.at(-1)).toBe('steps/041_catalog_support_write_hardening.sql')
    expect(plan.preImportSqlFiles.every((file: unknown) => typeof file === 'string')).toBe(true)
    expect(plan.postImportSqlFiles).toEqual(['steps/042_post_import_triggers.sql', '900_final_security.sql'])
    expect(plan.packageFiles).toHaveLength(22)
    expect(plan.packageFiles.every((file: string) => !file.endsWith('.sql'))).toBe(true)
    expect(await validateC2Artifacts()).toMatchObject({ sqlFiles: 43, preImportFiles: 41, postImportFiles: 2 })
  })

  it('runs the zero-row import window without issuing package-derived SQL or inserts', async () => {
    const bootstrapManifest = JSON.parse(await readFile(manifestPath, 'utf8'))
    const packageManifest = packageArtifact({ 'kioscos.json': '[]', 'auth-mapping.json': '[]' }).manifest
    const plan = createZeroRowImportPlan(bootstrapManifest, packageManifest)
    const events: string[] = []
    const result = await runC2OneShotPhases({
      preImport: async () => { events.push(`PRE_IMPORT_SQL:${plan.preImportSqlFiles.length}`) },
      preImportStepCount: plan.preImportSqlFiles.length,
      importFixture: async () => { events.push('ZERO_ROW_IMPORT:NO_DML') },
      postImportFiles: plan.postImportSqlFiles,
      applySql: async file => { events.push(`SQL:${file}`) },
      reconcileAt: async phase => { events.push(phase === 'pre-trigger' ? 'RECONCILE_PRE' : 'RECONCILE_FINAL'); return { counts: {}, salesByState: [], evidence: {}, foreignKeysChecked: 0, crossKiosk: 0, outOfScopeRows: {} } },
      checkTriggers: async () => { events.push('CHECK_15_TRIGGERS'); return 15 },
      postflight: async () => { events.push('POSTFLIGHT') },
    })
    expect(events).toEqual(['PRE_IMPORT_SQL:41', 'ZERO_ROW_IMPORT:NO_DML', 'RECONCILE_PRE', 'SQL:steps/042_post_import_triggers.sql', 'CHECK_15_TRIGGERS', 'SQL:900_final_security.sql', 'POSTFLIGHT', 'RECONCILE_FINAL'])
    expect(result).toMatchObject({ preImportStepCount: 41, postImportTriggerCount: 15, preTriggerReconciliation: 'PASS', finalReconciliation: 'PASS' })
  })

  it('defers RLS enforcement until after 900_final_security', async () => {
    const migration = JSON.parse(await readFile(join(bootstrap, 'contract/data-migration.json'), 'utf8'))
    const tables = [...new Set([...migration.tables.map((table: { name: string }) => table.name), ...migration.excludedTables, ...migration.reinitialize])].sort()
    const client = {
      query: async (statement: string) => {
        if (statement.includes('FROM pg_class c') && statement.includes("c.relkind IN ('r','p') ORDER BY")) return { rows: tables.map(name => ({ name })) }
        if (statement.includes('FROM public.') && statement.includes('count(*)')) return { rows: [{ n: 0 }] }
        if (statement.includes('FROM auth.users')) return { rows: [{ n: 0 }] }
        if (statement.includes('relrowsecurity')) return { rows: [{ total: tables.length, missing: 1 }] }
        if (statement.includes('has_table_privilege')) return { rows: [{ n: 0 }] }
        if (statement.includes('aclexplode')) return { rows: [{ n: 1 }] }
        if (statement.includes('p.prosecdef')) return { rows: [{ n: 0 }] }
        if (statement.includes("c.relkind IN ('v','m')")) return { rows: [] }
        throw new Error(`Unexpected reconciliation query: ${statement}`)
      },
    } as unknown as C2QueryClient

    await expect(reconcileZeroRowDestination(client, {}, migration, { phase: 'pre-trigger' }))
      .resolves.toMatchObject({ securityFinalized: false })
    await expect(reconcileZeroRowDestination(client, {}, migration, { phase: 'final' }))
      .rejects.toThrow('RLS is not enabled on every public table.')
  })

  it('defers browser DML enforcement until after 900_final_security', async () => {
    const migration = JSON.parse(await readFile(join(bootstrap, 'contract/data-migration.json'), 'utf8'))
    const tables = [...new Set([...migration.tables.map((table: { name: string }) => table.name), ...migration.excludedTables, ...migration.reinitialize])].sort()
    const client = {
      query: async (statement: string) => {
        if (statement.includes('FROM pg_class c') && statement.includes("c.relkind IN ('r','p') ORDER BY")) return { rows: tables.map(name => ({ name })) }
        if (statement.includes('FROM public.') && statement.includes('count(*)')) return { rows: [{ n: 0 }] }
        if (statement.includes('FROM auth.users')) return { rows: [{ n: 0 }] }
        if (statement.includes('relrowsecurity')) return { rows: [{ total: tables.length, missing: 0 }] }
        if (statement.includes('has_table_privilege')) return { rows: [{ n: 1 }] }
        if (statement.includes('aclexplode')) return { rows: [{ n: 1 }] }
        if (statement.includes('p.prosecdef')) return { rows: [{ n: 0 }] }
        if (statement.includes("c.relkind IN ('v','m')")) return { rows: [] }
        throw new Error(`Unexpected reconciliation query: ${statement}`)
      },
    } as unknown as C2QueryClient

    await expect(reconcileZeroRowDestination(client, {}, migration, { phase: 'pre-trigger' }))
      .resolves.toMatchObject({ securityFinalized: false })
    await expect(reconcileZeroRowDestination(client, {}, migration, { phase: 'final' }))
      .rejects.toThrow('Browser roles retain direct DML privileges on public tables.')
  })

it('defers final PUBLIC function ACL enforcement until after 900_final_security', async () => {
    const migration = JSON.parse(await readFile(join(bootstrap, 'contract/data-migration.json'), 'utf8'))
    const tables = [...new Set([...migration.tables.map((table: { name: string }) => table.name), ...migration.excludedTables, ...migration.reinitialize])].sort()
    const client = {
      query: async (statement: string) => {
        if (statement.includes('FROM pg_class c') && statement.includes("c.relkind IN ('r','p') ORDER BY")) return { rows: tables.map(name => ({ name })) }
        if (statement.includes('FROM public.') && statement.includes('count(*)')) return { rows: [{ n: 0 }] }
        if (statement.includes('FROM auth.users')) return { rows: [{ n: 0 }] }
        if (statement.includes('relrowsecurity')) return { rows: [{ total: tables.length, missing: 0 }] }
        if (statement.includes('has_table_privilege')) return { rows: [{ n: 0 }] }
        if (statement.includes('aclexplode')) return { rows: [{ n: 1 }] }
        if (statement.includes('p.prosecdef')) return { rows: [{ n: 0 }] }
        if (statement.includes("c.relkind IN ('v','m')")) return { rows: [] }
        throw new Error(`Unexpected reconciliation query: ${statement}`)
      },
    } as unknown as C2QueryClient

    await expect(reconcileZeroRowDestination(client, {}, migration, { phase: 'pre-trigger' }))
      .resolves.toMatchObject({ publicExecuteFunctions: 1, securityFinalized: false })
    await expect(reconcileZeroRowDestination(client, {}, migration, { phase: 'final' }))
      .rejects.toThrow('PUBLIC retains EXECUTE on public functions.')
  })

  it('compares zero-row business state while allowing final-security metadata to change', async () => {
    const events: string[] = []
    const result = await runC2OneShotPhases({
      preImport: async () => {},
      preImportStepCount: 41,
      importFixture: async () => {},
      postImportFiles: ['steps/042_post_import_triggers.sql', '900_final_security.sql'],
      applySql: async file => { events.push(file) },
      reconcileAt: async phase => ({ zeroRowPackage: true, counts: { productos: 0 }, publicTables: 42, views: [], authUsers: 0, authMappings: 0, unexpectedBusinessRows: 0, foreignKeyOrphans: 0, crossKiosk: 0, publicExecuteFunctions: phase === 'pre-trigger' ? 9 : 0, securityFinalized: phase === 'final', salesByState: [], evidence: {}, foreignKeysChecked: 0, outOfScopeRows: {} }),
      checkTriggers: async () => 15,
      postflight: async () => {},
    })
    expect(result.finalReconciliation).toBe('PASS')
    expect(events).toEqual(['steps/042_post_import_triggers.sql', '900_final_security.sql'])

    await expect(runC2OneShotPhases({
      preImport: async () => {},
      preImportStepCount: 41,
      importFixture: async () => {},
      postImportFiles: ['steps/042_post_import_triggers.sql', '900_final_security.sql'],
      applySql: async () => {},
      reconcileAt: async phase => ({ zeroRowPackage: true, counts: { productos: phase === 'pre-trigger' ? 0 : 1 }, publicTables: 42, views: [], authUsers: 0, authMappings: 0, unexpectedBusinessRows: 0, foreignKeyOrphans: 0, crossKiosk: 0, salesByState: [], evidence: {}, foreignKeysChecked: 0, outOfScopeRows: {} }),
      checkTriggers: async () => 15,
      postflight: async () => {},
    })).rejects.toThrow(/post-import SQL changed imported data/)
  })
})
