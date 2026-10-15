// @vitest-environment node
import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'
import { assertLegacySourceUrl, buildClassificationDraft, buildExportPackage, buildSelectQuery, canonicalizeDate, canonicalizeTimestamptz, normalizeHistoricalStockMovements, validateApprovedClassification, validateClassification, validateExportContract, validatePreCutoverBaseline } from '../../scripts/f6-2d-c3a-exporter.mjs'

const mappingPath = 'supabase/bootstrap/contract/source-destination-mapping.json'
const migrationPath = 'supabase/bootstrap/contract/data-migration.json'
const fixturePath = 'supabase/bootstrap/fixtures/f6-2d-c2-synthetic.json'
const uuid = (last: string) => `00000000-0000-4000-8000-${last.padStart(12, '0')}`

async function contracts() {
  const [mapping, migration, fixture] = await Promise.all([mappingPath, migrationPath, fixturePath].map(async file => JSON.parse(await readFile(file, 'utf8'))))
  return { mapping, migration, fixture }
}

describe('F6.2D-C3A read-only export contract', () => {
  it('accepts the exact legacy Direct host and keeps its existing TLS modes, without connecting', () => {
    expect(assertLegacySourceUrl('postgresql://readonly:synthetic@db.wlqujnwxrmksheubfrha.supabase.co:5432/postgres?sslmode=verify-full', 'wlqujnwxrmksheubfrha').hostname)
      .toBe('db.wlqujnwxrmksheubfrha.supabase.co')
    expect(assertLegacySourceUrl('postgresql://readonly:synthetic@db.wlqujnwxrmksheubfrha.supabase.co:5432/postgres?sslmode=require', 'wlqujnwxrmksheubfrha').hostname)
      .toBe('db.wlqujnwxrmksheubfrha.supabase.co')
    expect(() => assertLegacySourceUrl('postgresql://readonly:synthetic@db.acoyfwwmhaeruciyedri.supabase.co:5432/postgres?sslmode=require', 'acoyfwwmhaeruciyedri')).toThrow(/exact legacy source ref/)
    expect(() => assertLegacySourceUrl('postgresql://readonly:synthetic@db.acoyfwwmhaeruciyedri.supabase.co:5432/postgres?sslmode=verify-full', 'wlqujnwxrmksheubfrha')).toThrow(/Direct host or an official Supabase Session Pooler host/)
    expect(() => assertLegacySourceUrl('postgresql://readonly:synthetic@db.wlqujnwxrmksheubfrha.supabase.co:5432/postgres', 'wlqujnwxrmksheubfrha')).toThrow(/TLS/)
  })

  it('accepts only the legacy Session Pooler identity with full TLS verification', () => {
    const sessionUrl = 'postgresql://postgres.wlqujnwxrmksheubfrha:synthetic@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=verify-full'
    expect(assertLegacySourceUrl(sessionUrl, 'wlqujnwxrmksheubfrha').hostname).toBe('aws-0-us-east-1.pooler.supabase.com')
    expect(() => assertLegacySourceUrl(sessionUrl.replace('postgres.wlqujnwxrmksheubfrha', 'postgres.acoyfwwmhaeruciyedri'), 'wlqujnwxrmksheubfrha')).toThrow(/username must identify the exact legacy project ref/)
    expect(() => assertLegacySourceUrl(sessionUrl.replace(':5432/', ':6543/'), 'wlqujnwxrmksheubfrha')).toThrow(/port 5432/)
    expect(() => assertLegacySourceUrl(sessionUrl.replace('aws-0-us-east-1.pooler.supabase.com', 'pooler.example.com'), 'wlqujnwxrmksheubfrha')).toThrow(/official Supabase Session Pooler host/)
    expect(() => assertLegacySourceUrl(sessionUrl.replace('sslmode=verify-full', ''), 'wlqujnwxrmksheubfrha')).toThrow(/TLS/)
    expect(() => assertLegacySourceUrl(sessionUrl.replace('sslmode=verify-full', 'sslmode=require'), 'wlqujnwxrmksheubfrha')).toThrow(/requires sslmode=verify-full/)
    expect(() => assertLegacySourceUrl(sessionUrl.replace('/postgres?', '/other?'), 'wlqujnwxrmksheubfrha')).toThrow(/database postgres/)
    expect(() => assertLegacySourceUrl(sessionUrl, 'acoyfwwmhaeruciyedri')).toThrow(/exact legacy source ref/)
    expect(() => assertLegacySourceUrl(sessionUrl.replace('aws-0-us-east-1.pooler.supabase.com', 'localhost'), 'wlqujnwxrmksheubfrha')).toThrow(/official Supabase Session Pooler host/)
  })

  it('keeps both database modes inside a verified read-only snapshot and rolls back on success and error', async () => {
    const source = await readFile('scripts/f6-2d-c3a-exporter.mjs', 'utf8')
    const classify = source.split('async function runClassifyOnly')[1]?.split('async function runReadOnlyExport')[0] ?? ''
    const exportMode = source.split('async function runReadOnlyExport')[1]?.split('async function main')[0] ?? ''
    for (const modeSource of [classify, exportMode]) {
      expect(modeSource).toContain("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY")
      expect(modeSource).toContain("SHOW transaction_read_only")
      expect(modeSource).toContain("transaction_read_only === 'on'")
      expect(modeSource).toContain("await client.query('ROLLBACK')")
      expect(modeSource).toContain("try { await client.query('ROLLBACK') } catch")
    }
  })

  it('validates source mapping/data contract and builds explicit SELECTs only', async () => {
    const { mapping, migration } = await contracts()
    const tables = validateExportContract(mapping, migration).tables
    for (const table of tables) {
      const query = buildSelectQuery(table, { saleIds: [], closedSessionIds: [], stockMovementIds: [] })
      expect(query.text).toMatch(/^SELECT\s+/i)
      expect(query.text).not.toMatch(/SELECT\s+\*/i)
      expect(query.text).toMatch(/FROM\s+public\./i)
      expect(query.text).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i)
    }
    expect(buildSelectQuery(tables.find((table: {name:string}) => table.name === 'sesiones_caja')!).text).toContain('"estado" = \'CERRADA\' AND "fecha_cierre" IS NOT NULL')
    expect(buildSelectQuery(tables.find((table: {name:string}) => table.name === 'ventas')!, { saleIds: [] }).text).toContain('closed_session')
    expect(buildSelectQuery(tables.find((table: {name:string}) => table.name === 'clientes')!).text).toBe('SELECT count(*)::bigint AS row_count FROM public."clientes"')
  })

  it('projects exactly the ten legacy cash-session columns and keeps closed-session filters', async () => {
    const { mapping, migration } = await contracts()
    const sessions = validateExportContract(mapping, migration).tables.find((table: {name:string}) => table.name === 'sesiones_caja')!
    const expectedSourceColumns = [
      'id', 'kiosco_id', 'usuario_id', 'fecha_apertura', 'fecha_cierre',
      'monto_inicial', 'monto_final_declarado', 'monto_final_sistema', 'diferencia', 'estado',
    ]
    const query = buildSelectQuery(sessions).text
    const projection = query.match(/^SELECT (.+?) FROM /)?.[1]?.split(', ').map(column => column.replaceAll('"', ''))
    expect(sessions.columns).toEqual(expectedSourceColumns)
    expect(projection).toEqual(expectedSourceColumns)
    expect(query).not.toContain('notas_cierre')
    expect(projection).toEqual(expect.arrayContaining(['monto_inicial', 'monto_final_declarado', 'monto_final_sistema', 'diferencia', 'fecha_apertura', 'fecha_cierre']))
    expect(query).toContain('"estado" = \'CERRADA\' AND "fecha_cierre" IS NOT NULL')

    const entity = mapping.entities.find((item: {source:string}) => item.source === 'sesiones_caja')
    expect(entity.columns).toEqual(['id,kiosco_id,usuario_id,fecha_apertura,fecha_cierre,monto_inicial,monto_final_declarado,monto_final_sistema,diferencia,estado→same'])
    expect(entity.omit).toContain('notas_cierre is DESTINATION_ONLY; absent from source projection and omitted/null at destination')
    expect(entity.transform).not.toMatch(/notas_cierre/i)
    expect(entity.nullDefault).not.toMatch(/notas_cierre/i)
    expect(entity).not.toHaveProperty('defaults.notas_cierre')
    expect(entity).not.toHaveProperty('transforms.notas_cierre')
  })

  it('keeps the source schema guard fail-closed for every required session column', async () => {
    const { mapping, migration } = await contracts()
    const sessions = validateExportContract(mapping, migration).tables.find((table: {name:string}) => table.name === 'sesiones_caja')!
    const source = await readFile('scripts/f6-2d-c3a-exporter.mjs', 'utf8')
    expect(source).toContain('assert(table.columns.every(column => found.has(column))')
    const requiredColumns: string[] = sessions.columns!
    for (const missingColumn of requiredColumns) {
      const found = new Set(requiredColumns.filter(column => column !== missingColumn))
      expect(requiredColumns.every(column => found.has(column))).toBe(false)
    }
  })

  it('fails closed on prohibited columns and validates exact reviewed baseline counts', async () => {
    const { mapping, migration } = await contracts()
    const unsafe = structuredClone(mapping)
    unsafe.exportContract.tables.find((table: {name:string}) => table.name === 'usuarios').columns.push('pin_hash')
    expect(() => validateExportContract(unsafe, migration)).toThrow(/prohibited column/)
    const baseline = {
      baselineStatus: 'PRE_CUTOVER_REVIEWED',
      reviewedBlocks: ['03','04','05','06','07','08','09','10','11'],
      block03Counts: Object.fromEntries(migration.tables.map((table: {name:string}) => [table.name, 0])),
      block11Rows: [{ metric: 'productos_stock_snapshot', kiosco_id: null, dimension: null, row_count: 0, amount_sum: '0.000' }],
    }
    const wrongCount = { ...baseline, block03Counts: { ...baseline.block03Counts, kioscos: 4 } }
    expect(() => validatePreCutoverBaseline(wrongCount, wrongCount.block03Counts, migration)).not.toThrow()
    expect(() => validatePreCutoverBaseline({ ...baseline, reviewedBlocks: ['03'] }, baseline.block03Counts, migration)).toThrow(/incomplete or out of order/)
    expect(() => validatePreCutoverBaseline(baseline, { ...baseline.block03Counts, kioscos: 4 }, migration)).toThrow(/kioscos: source count differs/)
  })

  it('validates the original baselineStatus exactly and separates it from candidate review status', async () => {
    const { mapping, migration } = await contracts()
    const validBaseline = {
      baselineStatus: 'PRE_CUTOVER_REVIEWED',
      reviewedBlocks: ['03','04','05','06','07','08','09','10','11'],
      block03Counts: Object.fromEntries(migration.tables.map((table: {name:string}) => [table.name, 0])),
      block11Rows: [{ metric: 'synthetic_test_metric', kiosco_id: null, dimension: null, row_count: 0, amount_sum: '0.000' }],
    }
    expect(() => validatePreCutoverBaseline(validBaseline, validBaseline.block03Counts, migration)).not.toThrow()
    for (const invalid of [
      { ...validBaseline, baselineStatus: 'PENDING_MANUAL_REVIEW' },
      { ...validBaseline, baselineStatus: 'FINAL' },
      { ...validBaseline, baselineStatus: undefined },
      { ...validBaseline, baselineStatus: 'APPROVED' },
    ]) {
      expect(() => validatePreCutoverBaseline(invalid, validBaseline.block03Counts, migration)).toThrow(/Reviewed PRE_CUTOVER baseline is required/)
    }

    const draft = buildClassificationDraft({
      mapping, migration, candidateIds: { kioscos: [uuid('1')] },
      block03Counts: validBaseline.block03Counts, block11Rows: validBaseline.block11Rows,
      sourceSchemaFingerprint: 'c'.repeat(64), openSessions: 4, openSessionSales: 14,
      baselineStatus: validBaseline.baselineStatus,
    })
    expect(draft).toMatchObject({
      baselineStatus: 'PRE_CUTOVER_REVIEWED',
      classificationSchemaVersion: 'F6.2D-C3C-2',
      classificationStatus: 'PENDING_MANUAL_REVIEW',
    })
    expect(() => buildClassificationDraft({
      mapping, migration, candidateIds: {}, block03Counts: validBaseline.block03Counts,
      block11Rows: validBaseline.block11Rows, sourceSchemaFingerprint: 'c'.repeat(64),
      openSessions: 4, openSessionSales: 14, baselineStatus: 'PENDING_MANUAL_REVIEW',
    })).toThrow(/Original input baselineStatus/)
    expect(() => validateApprovedClassification(draft, migration)).toThrow(/explicitly APPROVED/)
    expect(() => validateApprovedClassification({ ...draft, classificationSchemaVersion: 'F6.2D-C3A-1', classificationStatus: 'APPROVED' }, migration)).toThrow(/Classification schema version/)
  })

  it('keeps the approved-row template baseline state unset and review state explicit', async () => {
    const template = JSON.parse(await readFile('artifacts/f6-2d-legacy-inventory/export/approved-row-ids.template.json', 'utf8'))
    expect(template).toMatchObject({
      classificationSchemaVersion: 'F6.2D-C3C-2',
      baselineStatus: null,
      classificationStatus: 'PENDING_MANUAL_REVIEW',
    })
  })

  it('does not normalize the original input baseline before validation', async () => {
    const source = await readFile('scripts/f6-2d-c3a-exporter.mjs', 'utf8')
    const classify = source.split('async function runClassifyOnly')[1]?.split('async function runReadOnlyExport')[0] ?? ''
    expect(classify).toContain('validatePreCutoverBaseline(baseline, actualCounts, migration)')
    expect(classify).not.toContain('baselineForCheck')
    expect(classify).not.toMatch(/baselineStatus\s*:\s*'PRE_CUTOVER_REVIEWED'/)
    expect(classify.indexOf('validateReviewedBaseline(baseline, migration)')).toBeLessThan(classify.indexOf('await client.connect()'))
  })

  it('requires every candidate UUID to be included or excluded with a reason', () => {
    const table = { name: 'productos', key: 'id' }
    const rows = [{ id: uuid('1'), descripcion: 'synthetic fixture' }, { id: uuid('2'), descripcion: 'business row' }]
    expect(() => validateClassification({ tables: { productos: { candidateIds: rows.map(row => row.id), includeIds: [uuid('2')], exclude: {} } } }, table, rows)).toThrow(/unclassified/)
    expect(validateClassification({ tables: { productos: { candidateIds: rows.map(row => row.id), includeIds: [uuid('2')], exclude: { [uuid('1')]: { reason: 'F4_FIXTURE', note: 'Known synthetic fixture row' } } } } }, table, rows)).toEqual([rows[1]])
  })

  it('accepts the explicit technical and owner-confirmed demo provenance reasons', () => {
    const table = { name: 'kioscos', key: 'id' }
    const rows = [
      { id: uuid('1') },
      { id: uuid('2') },
      { id: uuid('3') },
    ]
    const classification = { tables: { kioscos: {
      candidateIds: rows.map(row => row.id),
      includeIds: [],
      exclude: {
        [uuid('1')]: { reason: 'EXACT_SIGNATURE', note: 'Previously reviewed exact seed signature.' },
        [uuid('2')]: { reason: 'MANUAL_OWNER_CONFIRMED_DEMO', note: 'Owner confirmed this kiosk is a demo.' },
        [uuid('3')]: { reason: 'MANUAL_OWNER_CONFIRMED_DEMO_CASCADE', note: 'Inherited from a confirmed demo kiosk through verified FK.' },
      },
    } } }
    expect(validateClassification(classification, table, rows)).toEqual([])
  })

  it('canonicalizes both historical EGRESO quantity conventions into magnitude plus signed delta', () => {
    expect(normalizeHistoricalStockMovements([
      { tipo: 'EGRESO', cantidad: '-8.000' },
      { tipo: 'EGRESO', cantidad: '1.000' },
      { tipo: 'INGRESO', cantidad: '3.000' },
    ])).toEqual([
      { tipo: 'EGRESO', cantidad: '8.000', delta_stock: '-8.000' },
      { tipo: 'EGRESO', cantidad: '1.000', delta_stock: '-1.000' },
      { tipo: 'INGRESO', cantidad: '3.000', delta_stock: '3.000' },
    ])
    expect(normalizeHistoricalStockMovements([{ tipo: 'INGRESO', cantidad: '0.123456789012345678901234' }])[0].delta_stock)
      .toBe('0.123456789012345678901234')
    expect(() => normalizeHistoricalStockMovements([{ tipo: 'AJUSTE', cantidad: '1.000' }])).toThrow(/needs approved semantics/)
    expect(() => normalizeHistoricalStockMovements([{ tipo: 'INGRESO', cantidad: '-1.000' }])).toThrow(/Negative INGRESO/)
    expect(() => normalizeHistoricalStockMovements([{ tipo: 'EGRESO', cantidad: 1 }])).toThrow(/exact signed NUMERIC string/)
  })

  it('canonicalizes instants to UTC Z without losing microseconds and keeps dates timezone-free', () => {
    expect(canonicalizeTimestamptz('2026-10-13 12:34:56.123456+03')).toBe('2026-10-13T09:34:56.123456Z')
    expect(canonicalizeTimestamptz('2026-10-13 12:34:56.1+00')).toBe('2026-10-13T12:34:56.100000Z')
    expect(canonicalizeDate('2024-02-29')).toBe('2024-02-29')
    expect(() => canonicalizeDate('2025-02-29')).toThrow(/Invalid date/)
    expect(() => canonicalizeTimestamptz('2026-10-13 12:34:56.123456')).toThrow(/Unrecognized timestamptz/)
  })

  it('builds deterministic C2-fixture-backed artifacts, separates Auth mapping, and preserves stock snapshot', async () => {
    const { mapping, migration, fixture } = await contracts()
    const contractTables = mapping.exportContract.tables
    const rowsByTable: Record<string, Record<string, unknown>[]> = Object.fromEntries(contractTables.map((table: {name:string}) => [table.name, []]))
    const kioskSource = fixture.tables.kioscos[0]
    const kiosk = { direccion: null, telefono: null, rubro: null, capacidades_operativas: null, equipos_comercio: null, arqueo_ciego_obligatorio: false, fecha_creacion: null, ...kioskSource }
    const profile = { fecha_creacion: null, ...fixture.tables.usuarios[0] }
    rowsByTable.kioscos = [kiosk]
    rowsByTable.usuarios = [profile]
    rowsByTable.categorias = [{ color: null, orden: 0, ...fixture.tables.categorias[0] }]
    const productSource = Object.fromEntries(Object.entries(fixture.tables.productos[0]).filter(([key]) => key !== 'precio_costo'))
    const movementSource = Object.fromEntries(Object.entries(fixture.tables.movimientos_stock[0]).filter(([key]) => key !== 'delta_stock'))
    rowsByTable.productos = [{ proveedor_id: null, codigo_barras: null, stock_minimo: '0.000', es_favorito: false, es_pesable: false, unidad_medida: null, plu_balanza: null, es_combo: false, es_retornable: false, precio_envase: null, nombre_envase: null, requiere_vencimiento: false, dias_alerta_vencimiento: null, fecha_creacion: null, fecha_actualizacion: null, ...productSource }]
    rowsByTable.movimientos_stock = [{ notas: null, usuario_id: null, lote_producto_id: null, ...movementSource }]
    const rows = rowsByTable
    const first = buildExportPackage({ mapping, migration, rowsByTable: rows, generatedAt: '2026-01-01T00:00:00.000Z', sourceSchemaFingerprint: 'b'.repeat(64) })
    const second = buildExportPackage({ mapping, migration, rowsByTable: rows, generatedAt: '2026-01-01T00:00:00.000Z', sourceSchemaFingerprint: 'b'.repeat(64) })
    expect(first.manifest.content_sha256).toBe(second.manifest.content_sha256)
    expect(first.files['usuarios.json']).not.toContain('auth_user_id')
    expect(first.files['auth-mapping.json']).toContain('old_auth_user_id')
    expect(first.manifest.PRE_CUTOVER).toBe(true)
    expect(first.manifest.open_sessions_exported).toBe(0)
    expect(first.manifest.files).toContainEqual(expect.objectContaining({ table: 'productos', row_count: 1 }))
    expect(JSON.parse(first.files['productos.json'])[0].stock_actual).toBe('9.000')
    expect(JSON.parse(first.files['movimientos_stock.json'])[0].cantidad).toBe('1.000')
    expect(JSON.parse(first.files['movimientos_stock.json'])[0].delta_stock).toBe('-1.000')
    expect(first.manifest.evidence_omitted_relations).toContain('checkout_manuales')
    expect(first.manifest.evidence_omitted_relations).toContain('anulaciones_venta_atomicas')
    expect((first.manifest.files as { table: string }[]).some(file => ['checkout_manuales', 'anulaciones_venta_atomicas'].includes(file.table))).toBe(false)
    expect(first.manifest.reconciliation_metrics).toContainEqual(expect.objectContaining({ metric: 'productos_stock_snapshot', amount_sum: '9.000' }))
    expect(first.manifest.reconciliation_metrics).toContainEqual(expect.objectContaining({ metric: 'movimientos_stock_por_tipo', dimension: 'EGRESO', amount_sum: '1.000' }))
    expect(first.manifest.reconciliation_metrics).toContainEqual(expect.objectContaining({ metric: 'movimientos_stock_neto_compatible', amount_sum: '-1.000' }))
    expect(fixture.kind).toBe('F6.2D-C2_SYNTHETIC_ONLY')
  })

  it('does not synthesize AJUSTE signs or authorize evidence automatically', async () => {
    const { mapping, migration } = await contracts()
    const rowsByTable: Record<string, Record<string, unknown>[]> = Object.fromEntries(mapping.exportContract.tables.map((table: {name:string}) => [table.name, []]))
    rowsByTable.movimientos_stock = [{ id: uuid('20'), kiosco_id: uuid('10'), producto_id: uuid('21'), tipo: 'AJUSTE', cantidad: '1.000', motivo: null, notas: null, usuario_id: null, fecha: null, lote_producto_id: null }]
    expect(() => buildExportPackage({ mapping, migration, rowsByTable, generatedAt: '2026-01-01T00:00:00.000Z', sourceSchemaFingerprint: 'c'.repeat(64) })).toThrow(/needs approved semantics/)
    expect(mapping.exportContract.tables.find((table: {name:string}) => table.name === 'checkout_manuales').enabled).toBe(false)
    expect(mapping.exportContract.tables.find((table: {name:string}) => table.name === 'anulaciones_venta_atomicas').enabled).toBe(false)
  })

  it('keeps PostgreSQL NUMERIC values as exact decimal strings and refuses JS numbers', async () => {
    const { mapping, migration } = await contracts()
    const rowsByTable: Record<string, Record<string, unknown>[]> = Object.fromEntries(mapping.exportContract.tables.map((table: {name:string}) => [table.name, []]))
    const fixture = JSON.parse(await readFile('supabase/bootstrap/fixtures/f6-2d-c2-synthetic.json', 'utf8'))
    const kiosk = fixture.tables.kioscos[0]
    const product = fixture.tables.productos[0]
    rowsByTable.kioscos = [{ direccion: null, telefono: null, rubro: null, capacidades_operativas: null, equipos_comercio: null, arqueo_ciego_obligatorio: false, fecha_creacion: null, ...kiosk }]
    rowsByTable.categorias = [{ color: null, orden: 0, ...fixture.tables.categorias[0] }]
    rowsByTable.productos = [{ proveedor_id: null, codigo_barras: null, stock_minimo: '0.000', es_favorito: false, es_pesable: false, unidad_medida: null, plu_balanza: null, es_combo: false, es_retornable: false, precio_envase: null, nombre_envase: null, requiere_vencimiento: false, dias_alerta_vencimiento: null, fecha_creacion: null, fecha_actualizacion: null, ...Object.fromEntries(Object.entries(product).filter(([key]) => key !== 'precio_costo')) }]
    rowsByTable.producto_costos = [{ producto_id: product.id, kiosco_id: kiosk.id, precio_costo: '9999999999.10', fecha_actualizacion: null }]
    const artifact = buildExportPackage({ mapping, migration, rowsByTable, generatedAt: '2026-01-01T00:00:00.000Z', sourceSchemaFingerprint: 'd'.repeat(64) })
    expect(JSON.parse(artifact.files['producto_costos.json'])[0].precio_costo).toBe('9999999999.10')
    rowsByTable.producto_costos[0].precio_costo = 123456789.12
    expect(() => buildExportPackage({ mapping, migration, rowsByTable, generatedAt: '2026-01-01T00:00:00.000Z', sourceSchemaFingerprint: 'd'.repeat(64) })).toThrow(/exact PostgreSQL NUMERIC string/)
  })

  it('refuses raw rows for disabled evidence relations', async () => {
    const { mapping, migration } = await contracts()
    const rowsByTable: Record<string, Record<string, unknown>[]> = Object.fromEntries(mapping.exportContract.tables.map((table: {name:string}) => [table.name, []]))
    rowsByTable.checkout_manuales = [{ solicitud: { notas: 'must not leak' } }]
    expect(() => buildExportPackage({ mapping, migration, rowsByTable, generatedAt: '2026-01-01T00:00:00.000Z', sourceSchemaFingerprint: 'e'.repeat(64) })).toThrow(/disabled evidence payload cannot enter/)
  })
})
