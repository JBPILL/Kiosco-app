import { createHash } from 'node:crypto'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'
import { validateExportContract, validateExportPackage } from './f6-2d-c3a-exporter.mjs'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const bootstrapRoot = path.join(repoRoot, 'supabase', 'bootstrap')
const manifestFile = path.join(bootstrapRoot, 'manifest.json')
const mappingFile = path.join(bootstrapRoot, 'contract', 'source-destination-mapping.json')
const fixtureFile = path.join(bootstrapRoot, 'fixtures', 'f6-2d-c2-synthetic.json')
const forbiddenKey = /(password|encrypted|hash|token|secret|private.?key|service.?role|jwt|(?:^|_)cae(?:_|$)|afip|arca|point|suscrip|plan|devolucion|envase_compartido|policy|policies|function|trigger|acl)/i
const jsonColumns = new Set(['capacidades_operativas', 'solicitud', 'resultado'])
const expectedPostImportTriggerCount = 15
const expectedKeyMetadataContract = {
  foreignKey: { sourceColumns: 'string[]', destinationColumns: 'string[]', compositeOrder: 'ordinality' },
  primaryKey: { columns: 'string[]', compositeOrder: 'ordinality' },
  uniqueKey: { columns: 'string[]', compositeOrder: 'ordinality' },
}

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

async function readJson(file) {
  return JSON.parse((await readFile(file, 'utf8')).replace(/^\uFEFF/, ''))
}

export function assertZeroRowPackageArtifact(packageArtifact, exportContract) {
  assertPackageManifestShape(packageArtifact?.manifest)
  const validation = validateExportPackage(packageArtifact, exportContract)
  assert(validation.totalMigrableRows === 0 && packageArtifact.manifest.total_migrable_rows === 0, 'Real local rehearsal accepts only a zero-row export package.')
  for (const [name, content] of Object.entries(packageArtifact.files)) {
    const rows = JSON.parse(content)
    assert(Array.isArray(rows) && rows.length === 0, `${name}: zero-row package must contain an empty array.`)
  }
  assert(JSON.parse(packageArtifact.files['auth-mapping.json']).length === 0, 'Zero-row package cannot contain Auth mappings.')
  return validation
}

export function assertBootstrapManifestShape(bootstrapManifest) {
  if (bootstrapManifest?.PRE_CUTOVER === true || bootstrapManifest?.export_mode === 'PRE_CUTOVER_EXPORT') {
    throw new Error('package manifest cannot be used as bootstrap manifest.')
  }
  assert(bootstrapManifest && bootstrapManifest.version === 2, 'Bootstrap manifest must declare phased import support.')
  assert(Array.isArray(bootstrapManifest.files) && bootstrapManifest.files.length > 0, 'Bootstrap manifest must contain ordered SQL files.')
  assert(bootstrapManifest.files.every(item => item && typeof item.path === 'string' && item.path.length > 0 && /^[a-f0-9]{64}$/.test(item.sha256)), 'Bootstrap manifest SQL entries require path and SHA-256.')
  assert(typeof bootstrapManifest.importWindowAfter === 'string' && bootstrapManifest.importWindowAfter.length > 0, 'Bootstrap manifest import window boundary is missing.')
  assert(Array.isArray(bootstrapManifest.postImportFiles) && bootstrapManifest.postImportFiles.every(file => typeof file === 'string' && file.length > 0), 'Bootstrap manifest post-import SQL order is missing.')
  return bootstrapManifest
}

export function assertPackageManifestShape(packageManifest) {
  if (packageManifest?.version === 2 && packageManifest?.profile === 'ONE_SHOT_EMPTY_DB') {
    throw new Error('bootstrap manifest cannot be used as package manifest.')
  }
  assert(packageManifest && packageManifest.PRE_CUTOVER === true && packageManifest.export_mode === 'PRE_CUTOVER_EXPORT', 'Package manifest must declare PRE_CUTOVER_EXPORT.')
  assert(typeof packageManifest.contract_version === 'string' && packageManifest.contract_version.length > 0, 'Package manifest contract version is missing.')
  assert(typeof packageManifest.source_schema_fingerprint === 'string' && /^[a-f0-9]{64}$/.test(packageManifest.source_schema_fingerprint), 'Package manifest source fingerprint is missing or malformed.')
  assert(Array.isArray(packageManifest.files) && packageManifest.files.every(item => item && typeof item.file === 'string' && Number.isInteger(item.row_count) && item.row_count >= 0 && /^[a-f0-9]{64}$/.test(item.checksum_sha256)), 'Package manifest file entries require file, row_count, and SHA-256.')
  assert(Number.isInteger(packageManifest.total_migrable_rows) && packageManifest.total_migrable_rows >= 0, 'Package manifest migrable row total is missing.')
  return packageManifest
}

export function createZeroRowImportPlan(bootstrapManifest, packageManifest) {
  assertBootstrapManifestShape(bootstrapManifest)
  assertPackageManifestShape(packageManifest)
  const windowIndex = bootstrapManifest.files.findIndex(item => item.path === bootstrapManifest.importWindowAfter)
  assert(windowIndex >= 0, 'Bootstrap manifest import window boundary is missing.')
  return {
    preImportSqlFiles: bootstrapManifest.files.slice(0, windowIndex + 1).map(item => item.path),
    postImportSqlFiles: [...bootstrapManifest.postImportFiles],
    packageFiles: packageManifest.files.map(item => item.file),
    totalMigrableRows: packageManifest.total_migrable_rows,
  }
}

function validateNoForbiddenKeys(value, at = 'fixture') {
  if (Array.isArray(value)) return value.forEach((item, index) => validateNoForbiddenKeys(item, `${at}[${index}]`))
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert(!forbiddenKey.test(key), `${at}.${key}: forbidden field`)
    validateNoForbiddenKeys(child, `${at}.${key}`)
  }
}

export function validateLocalDatabaseUrl(value) {
  assert(typeof value === 'string' && value.length > 0, 'F6_LOCAL_DATABASE_URL is required for IMPORT_LOCAL.')
  let url
  try { url = new URL(value) } catch { throw new Error('Invalid local database URL.') }
  assert(['postgres:', 'postgresql:'].includes(url.protocol), 'Only a PostgreSQL URL is accepted.')
  assert(['localhost', '127.0.0.1', '::1'].includes(url.hostname), 'IMPORT_LOCAL accepts loopback hosts only.')
  assert(url.port === '54322', 'IMPORT_LOCAL requires the Supabase local database port 54322.')
  assert(url.pathname === '/postgres', 'IMPORT_LOCAL requires the local postgres database.')
  assert(decodeURIComponent(url.username) === 'postgres', 'IMPORT_LOCAL requires the local postgres role.')
  assert(!/supabase\.co$/i.test(url.hostname), 'Hosted Supabase URLs are forbidden.')
  assert(!url.searchParams.has('project-ref') && !url.searchParams.has('project_ref'), 'Project refs are forbidden.')
  return url
}

export function assertFixtureStructure(fixture, mapping) {
  assert(fixture.kind === 'F6.2D-C2_SYNTHETIC_ONLY', 'Fixture is not marked synthetic-only.')
  assert(mapping.remoteAccessAllowed === false && mapping.importEnabled === false, 'Real source import must remain disabled.')
  assertKeyMetadataContract(mapping.keyMetadataContract)
  assert(Array.isArray(fixture.authMapping) && Array.isArray(fixture.authUsers), 'Auth mapping contract is missing.')
  assert(fixture.tables && typeof fixture.tables === 'object', 'Fixture table set is missing.')
  validateNoForbiddenKeys(fixture)
  const allowed = mapping.localSyntheticImportAllowlist
  assert(allowed && typeof allowed === 'object', 'Mapping has no local synthetic import allowlist.')
  const fixtureTables = Object.keys(fixture.tables).sort()
  assert(JSON.stringify(fixtureTables) === JSON.stringify(Object.keys(allowed).sort()), 'Fixture table set differs from the mapping allowlist.')
  assert(JSON.stringify(Object.keys(fixture.tables)) === JSON.stringify(mapping.localSyntheticImportOrder), 'Fixture row order differs from the mapped FK load order.')
  for (const [table, rows] of Object.entries(fixture.tables)) {
    assert(/^[a-z][a-z0-9_]*$/.test(table), 'Unsafe table identifier in mapping.')
    assert(Array.isArray(rows), `${table}: rows must be an array.`)
    const columns = allowed[table]
    assert(Array.isArray(columns) && columns.length > 0, `${table}: empty column allowlist.`)
    const seen = new Set()
    for (const row of rows) {
      assert(row && typeof row === 'object' && !Array.isArray(row), `${table}: row must be an object.`)
      for (const key of Object.keys(row)) assert(columns.includes(key), `${table}.${key}: column is not allowlisted.`)
      if (row.id) {
        assert(!seen.has(row.id), `${table}: duplicate primary key in fixture.`)
        seen.add(row.id)
      }
      if (table === 'sesiones_caja') assert(row.estado === 'CERRADA' && row.fecha_cierre, 'Open cash sessions are refused.')
      if (table === 'usuarios') assert(row.kiosco_id !== null && row.auth_user_id, 'NULL kiosk profiles or unmapped auth users are refused.')
    }
  }
  const authIds = new Set(fixture.authUsers.map(user => user.id))
  const mappedAuth = new Set()
  const profiles = new Set()
  const legacyUsers = new Set()
  for (const item of fixture.authMapping) {
    assert(item.legacy_business_user_id && item.destination_auth_user_id && item.profile_id && item.kiosco_id && item.role, 'Incomplete auth mapping row.')
    assert(authIds.has(item.destination_auth_user_id), 'Auth mapping target lacks a synthetic local auth placeholder.')
    assert(!mappedAuth.has(item.destination_auth_user_id) && !profiles.has(item.profile_id) && !legacyUsers.has(item.legacy_business_user_id), 'Auth mapping must be one-to-one.')
    assert(['DUEÑO','CAJERO','VISOR'].includes(item.role), 'Unsupported destination role in auth mapping.')
    mappedAuth.add(item.destination_auth_user_id); profiles.add(item.profile_id); legacyUsers.add(item.legacy_business_user_id)
  }
  assert(mappedAuth.size === authIds.size, 'Unmapped synthetic Auth identity is present.')
  const users = fixture.tables.usuarios
  assert(users.every(user => fixture.authMapping.some(map => map.profile_id === user.id && map.destination_auth_user_id === user.auth_user_id && map.kiosco_id === user.kiosco_id && map.role === user.rol)), 'Profile/Auth/kiosk/role mapping mismatch.')
  validateFixtureTenancy(fixture)
  assert(fixture.tables.kioscos.length === 4, 'Synthetic fixture must cover four kiosks.')
  assert(fixture.tables.productos.some(row => !fixture.tables.producto_costos.some(cost => cost.producto_id === row.id)), 'Fixture must preserve a product without a cost row.')
  assert(fixture.tables.movimientos_stock.length >= 2 && fixture.tables.movimiento_stock_costos.length < fixture.tables.movimientos_stock.length, 'Fixture must include stock movements with and without cost evidence.')
  assert(fixture.tables.ventas.some(row => row.estado === 'COMPLETADA') && fixture.tables.ventas.some(row => row.estado === 'ANULADA'), 'Fixture must include completed and final annulled sales.')
  assert(fixture.tables.clientes.length === 0 && fixture.tables.proveedores.length === 0 && fixture.tables.compras_proveedor.length === 0, 'Empty source domains must remain empty.')
  const openProfile = fixture.rejectedExamples?.nullKioskProfile
  if (openProfile) assert(openProfile.kiosco_id === null, 'NULL-kiosk negative example must remain a rejected case.')
}

export function assertKeyMetadataContract(value) {
  const hasExactKeys = (object, keys) => object && typeof object === 'object' && !Array.isArray(object) &&
    JSON.stringify(Object.keys(object).sort()) === JSON.stringify([...keys].sort())
  assert(hasExactKeys(value, ['foreignKey', 'primaryKey', 'uniqueKey']), 'Key metadata contract must define foreignKey, primaryKey, and uniqueKey.')
  assert(hasExactKeys(value.foreignKey, ['sourceColumns', 'destinationColumns', 'compositeOrder']) &&
    value.foreignKey.sourceColumns === expectedKeyMetadataContract.foreignKey.sourceColumns &&
    value.foreignKey.destinationColumns === expectedKeyMetadataContract.foreignKey.destinationColumns &&
    value.foreignKey.compositeOrder === expectedKeyMetadataContract.foreignKey.compositeOrder,
  'Foreign-key contract must use ordered sourceColumns/destinationColumns string arrays.')
  for (const field of ['primaryKey', 'uniqueKey']) {
    assert(hasExactKeys(value[field], ['columns', 'compositeOrder']) &&
      value[field].columns === expectedKeyMetadataContract[field].columns &&
      value[field].compositeOrder === expectedKeyMetadataContract[field].compositeOrder,
    `${field} contract must use ordered string-array columns.`)
  }
}

export function assertForeignKeyMetadata(value) {
  assert(value && typeof value === 'object' && !Array.isArray(value), 'Foreign-key metadata row must be an object.')
  for (const field of ['table_schema', 'table_name', 'constraint_name', 'foreign_table_schema', 'foreign_table_name']) {
    assert(typeof value[field] === 'string' && value[field].length > 0, `Foreign-key metadata ${field} must be a non-empty string.`)
  }
  for (const field of ['source_columns', 'destination_columns']) {
    assert(Array.isArray(value[field]) && value[field].length > 0 && value[field].every(column => typeof column === 'string' && column.length > 0),
      `Foreign-key metadata ${field} must be a non-empty string array.`)
  }
  assert(value.source_columns.length === value.destination_columns.length, 'Foreign-key metadata source/destination column arrays must have equal lengths.')
  return {
    tableSchema: value.table_schema,
    tableName: value.table_name,
    constraintName: value.constraint_name,
    foreignTableSchema: value.foreign_table_schema,
    foreignTableName: value.foreign_table_name,
    sourceColumns: value.source_columns,
    destinationColumns: value.destination_columns,
  }
}

function validateFixtureTenancy(fixture) {
  const byId = table => new Map((fixture.tables[table] ?? []).map(row => [row.id, row]))
  const kiosks = byId('kioscos'), users = byId('usuarios'), categories = byId('categorias'), products = byId('productos')
  const providers = byId('proveedores'), customers = byId('clientes'), sessions = byId('sesiones_caja')
  const sales = byId('ventas'), purchases = byId('compras_proveedor'), lots = byId('lotes_producto'), stockMoves = byId('movimientos_stock')
  const sameKiosk = (expected, actual, relation) => assert(Boolean(actual) && actual.kiosco_id === expected, `${relation}: cross-kiosk or missing reference.`)
  for (const row of fixture.tables.usuarios) assert(kiosks.has(row.kiosco_id), 'usuarios.kiosco_id: missing kiosk.')
  for (const row of fixture.tables.categorias) assert(kiosks.has(row.kiosco_id), 'categorias.kiosco_id: missing kiosk.')
  for (const row of fixture.tables.clientes) assert(kiosks.has(row.kiosco_id), 'clientes.kiosco_id: missing kiosk.')
  for (const row of fixture.tables.proveedores) assert(kiosks.has(row.kiosco_id), 'proveedores.kiosco_id: missing kiosk.')
  for (const row of fixture.tables.productos) {
    assert(kiosks.has(row.kiosco_id), 'productos.kiosco_id: missing kiosk.')
    if (row.categoria_id) sameKiosk(row.kiosco_id, categories.get(row.categoria_id), 'productos.categoria_id')
    if (row.proveedor_id) sameKiosk(row.kiosco_id, providers.get(row.proveedor_id), 'productos.proveedor_id')
  }
  for (const row of fixture.tables.producto_costos) sameKiosk(row.kiosco_id, products.get(row.producto_id), 'producto_costos.producto_id')
  for (const row of fixture.tables.combo_items) {
    sameKiosk(row.kiosco_id, products.get(row.combo_producto_id), 'combo_items.combo_producto_id')
    sameKiosk(row.kiosco_id, products.get(row.componente_producto_id), 'combo_items.componente_producto_id')
  }
  for (const row of fixture.tables.promociones) {
    assert(kiosks.has(row.kiosco_id), 'promociones.kiosco_id: missing kiosk.')
    if (row.producto_id) sameKiosk(row.kiosco_id, products.get(row.producto_id), 'promociones.producto_id')
    if (row.categoria_id) sameKiosk(row.kiosco_id, categories.get(row.categoria_id), 'promociones.categoria_id')
  }
  for (const row of fixture.tables.lotes_producto) sameKiosk(row.kiosco_id, products.get(row.producto_id), 'lotes_producto.producto_id')
  for (const row of fixture.tables.sesiones_caja) sameKiosk(row.kiosco_id, users.get(row.usuario_id), 'sesiones_caja.usuario_id')
  for (const row of fixture.tables.ventas) {
    sameKiosk(row.kiosco_id, users.get(row.usuario_id), 'ventas.usuario_id')
    if (row.sesion_caja_id) sameKiosk(row.kiosco_id, sessions.get(row.sesion_caja_id), 'ventas.sesion_caja_id')
  }
  for (const row of fixture.tables.detalles_venta) {
    sameKiosk(sales.get(row.venta_id)?.kiosco_id, products.get(row.producto_id), 'detalles_venta.producto_id')
  }
  for (const row of fixture.tables.pagos_venta) assert(sales.has(row.venta_id), 'pagos_venta.venta_id: missing sale.')
  for (const row of fixture.tables.movimientos_stock) {
    sameKiosk(row.kiosco_id, products.get(row.producto_id), 'movimientos_stock.producto_id')
    if (row.usuario_id) sameKiosk(row.kiosco_id, users.get(row.usuario_id), 'movimientos_stock.usuario_id')
    if (row.lote_producto_id) sameKiosk(row.kiosco_id, lots.get(row.lote_producto_id), 'movimientos_stock.lote_producto_id')
  }
  for (const row of fixture.tables.movimiento_stock_costos) sameKiosk(row.kiosco_id, stockMoves.get(row.movimiento_id), 'movimiento_stock_costos.movimiento_id')
  for (const row of fixture.tables.movimientos_caja) {
    sameKiosk(row.kiosco_id, sessions.get(row.sesion_caja_id), 'movimientos_caja.sesion_caja_id')
    sameKiosk(row.kiosco_id, users.get(row.usuario_id), 'movimientos_caja.usuario_id')
  }
  for (const row of fixture.tables.movimientos_cuenta_corriente) {
    sameKiosk(row.kiosco_id, customers.get(row.cliente_id), 'movimientos_cuenta_corriente.cliente_id')
    if (row.usuario_id) sameKiosk(row.kiosco_id, users.get(row.usuario_id), 'movimientos_cuenta_corriente.usuario_id')
    if (row.venta_id) sameKiosk(row.kiosco_id, sales.get(row.venta_id), 'movimientos_cuenta_corriente.venta_id')
  }
  for (const row of fixture.tables.compras_proveedor) {
    sameKiosk(row.kiosco_id, providers.get(row.proveedor_id), 'compras_proveedor.proveedor_id')
    if (row.usuario_id) sameKiosk(row.kiosco_id, users.get(row.usuario_id), 'compras_proveedor.usuario_id')
    if (row.sesion_caja_id) sameKiosk(row.kiosco_id, sessions.get(row.sesion_caja_id), 'compras_proveedor.sesion_caja_id')
  }
  for (const row of fixture.tables.detalles_compra) {
    const parent = purchases.get(row.compra_id)
    assert(parent && products.has(row.producto_id), 'detalles_compra: missing parent or product.')
  }
  for (const row of fixture.tables.pagos_proveedor) sameKiosk(row.kiosco_id, providers.get(row.proveedor_id), 'pagos_proveedor.proveedor_id')
  for (const row of fixture.tables.checkout_manuales) sameKiosk(row.kiosco_id, sales.get(row.venta_id), 'checkout_manuales.venta_id')
  for (const row of fixture.tables.anulaciones_venta_atomicas) {
    sameKiosk(row.kiosco_id, sales.get(row.venta_id), 'anulaciones_venta_atomicas.venta_id')
    assert(fixture.authMapping.some(item => item.destination_auth_user_id === row.actor_auth_id && item.kiosco_id === row.kiosco_id), 'Annulment evidence actor is not mapped to this kiosk.')
  }
}

async function verifyManifest(manifest) {
  assertBootstrapManifestShape(manifest)
  assert(manifest.version === 2, 'Manifest does not declare phased import support.')
  const windowIndex = manifest.files.findIndex(item => item.path === manifest.importWindowAfter)
  assert(windowIndex >= 0, 'Manifest import window boundary is missing.')
  assert(JSON.stringify(manifest.postImportFiles) === JSON.stringify(['steps/042_post_import_triggers.sql', '900_final_security.sql']), 'Unexpected post-import hardening order.')
  const stepNames = (await readdir(path.join(bootstrapRoot, 'steps'))).filter(name => name.endsWith('.sql')).sort()
  const canonicalOrder = ['001_domain.sql', '002_identity_helpers.sql', ...stepNames.map(name => `steps/${name}`), '900_final_security.sql']
  assert(JSON.stringify(manifest.files.map(item => item.path)) === JSON.stringify(canonicalOrder), 'Manifest SQL order is not canonical.')
  for (let i = 0; i < manifest.files.length; i += 1) {
    const item = manifest.files[i]
    const file = path.resolve(bootstrapRoot, item.path)
    assert(file.startsWith(`${bootstrapRoot}${path.sep}`), `${item.path}: path escapes bootstrap.`)
    const digest = createHash('sha256').update(await readFile(file)).digest('hex')
    assert(digest === item.sha256, `${item.path}: manifest checksum mismatch.`)
  }
  assert(manifest.files[windowIndex + 1]?.path === manifest.postImportFiles[0], 'Trigger installation must immediately follow the import window.')
  assert(manifest.files[windowIndex + 2]?.path === manifest.postImportFiles[1], 'Final security must follow trigger installation.')
}

async function loadBootstrapContract() {
  const [bootstrapManifest, mapping, migration] = await Promise.all([readJson(manifestFile), readJson(mappingFile), readJson(path.join(bootstrapRoot, 'contract', 'data-migration.json'))])
  await verifyManifest(bootstrapManifest)
  assertKeyMetadataContract(mapping.keyMetadataContract)
  return { bootstrapManifest, mapping, migration }
}

async function loadContract() {
  const [{ bootstrapManifest, mapping }, fixture] = await Promise.all([loadBootstrapContract(), readJson(fixtureFile)])
  assertFixtureStructure(fixture, mapping)
  return { bootstrapManifest, mapping, fixture }
}

export async function loadZeroRowPackage(directory) {
  const packageDirectory = path.resolve(directory)
  const [{ bootstrapManifest, mapping, migration }, packageManifest] = await Promise.all([
    loadBootstrapContract(), readJson(path.join(packageDirectory, 'manifest.json')),
  ])
  assertPackageManifestShape(packageManifest)
  const exportContract = validateExportContract(mapping, migration)
  const expectedFiles = [...exportContract.tables.filter(table => table.enabled !== false).map(table => `${table.name}.json`), 'auth-mapping.json', 'manifest.json'].sort()
  const actualFiles = (await readdir(packageDirectory)).sort()
  assert(JSON.stringify(actualFiles) === JSON.stringify(expectedFiles), 'Real zero-row package contains unexpected or missing files.')
  const files = {}
  for (const name of expectedFiles.filter(name => name !== 'manifest.json')) files[name] = await readFile(path.join(packageDirectory, name), 'utf8')
  const result = assertZeroRowPackageArtifact({ manifest: packageManifest, files }, exportContract)
  const sqlPlan = createZeroRowImportPlan(bootstrapManifest, packageManifest)
  assert(sqlPlan.totalMigrableRows === result.totalMigrableRows, 'Package import plan row total differs from validated package.')
  return { bootstrapManifest, packageManifest, mapping, migration, exportContract, files, result, sqlPlan }
}

function sqlFilePath(relativePath) {
  const file = path.resolve(bootstrapRoot, relativePath)
  assert(file.startsWith(`${bootstrapRoot}${path.sep}`), 'SQL path escapes bootstrap.')
  return file
}

function psqlCompatible(sql) {
  return sql.replace(/^\\set[^\r\n]*$/gm, '').replace(/:'expected_ref'/g, "''").replace(/:'actual_ref'/g, "''")
}

async function runPreflight(client) {
  await client.query(psqlCompatible(await readFile(path.join(bootstrapRoot, 'preflight.sql'), 'utf8')))
}

async function insertTable(client, table, rows, allowlist) {
  for (const row of rows) {
    const columns = Object.keys(row)
    assert(columns.length > 0 && columns.every(column => allowlist[table].includes(column)), `${table}: invalid import column.`)
    const values = columns.map(column => row[column])
    const placeholders = columns.map((column, index) => `$${index + 1}${jsonColumns.has(column) ? '::jsonb' : ''}`)
    const qualified = `public.${table}`
    const statement = `INSERT INTO ${qualified} (${columns.map(column => `"${column}"`).join(',')}) VALUES (${placeholders.join(',')})`
    const parameters = columns.map((column, index) => jsonColumns.has(column) && values[index] !== null ? JSON.stringify(values[index]) : values[index])
    await client.query(statement, parameters)
  }
}

export async function reconcileZeroRowDestination(client, mapping, migration, { phase = 'final' } = {}) {
  assert(phase === 'pre-trigger' || phase === 'final', 'Zero-row reconciliation phase must be pre-trigger or final.')
  const expectedTables = [...new Set([
    ...migration.tables.map(table => table.name), ...migration.excludedTables, ...migration.reinitialize,
  ])].sort()
  const actual = await client.query(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`)
  const actualTables = actual.rows.map(row => row.name)
  assert(JSON.stringify(actualTables) === JSON.stringify(expectedTables), 'Destination public table set differs from the migration contract.')
  const counts = {}
  for (const table of actualTables) {
    const result = await client.query(`SELECT count(*)::int AS n FROM public.${quoteIdentifier(table)}`)
    counts[table] = result.rows[0].n
    assert(counts[table] === 0, `${table}: zero-row rehearsal found unexpected business/default rows.`)
  }
  const authUsers = await client.query('SELECT count(*)::int AS n FROM auth.users')
  assert(authUsers.rows[0].n === 0, 'Zero-row rehearsal found Auth users.')
  const rls = await client.query(`SELECT count(*)::int AS total, count(*) FILTER (WHERE NOT c.relrowsecurity)::int AS missing FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')`)
  if (phase === 'final') assert(rls.rows[0].total === actualTables.length && rls.rows[0].missing === 0, 'RLS is not enabled on every public table.')
  const directDml = await client.query(`SELECT count(*)::int AS n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND (has_table_privilege('anon',c.oid,'INSERT') OR has_table_privilege('anon',c.oid,'UPDATE') OR has_table_privilege('anon',c.oid,'DELETE') OR has_table_privilege('authenticated',c.oid,'INSERT') OR has_table_privilege('authenticated',c.oid,'UPDATE') OR has_table_privilege('authenticated',c.oid,'DELETE'))`)
  if (phase === 'final') assert(directDml.rows[0].n === 0, 'Browser roles retain direct DML privileges on public tables.')
  const publicExecute = await client.query(`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) acl WHERE n.nspname='public' AND acl.grantee=0 AND acl.privilege_type='EXECUTE'`)
  if (phase === 'final') assert(publicExecute.rows[0].n === 0, 'PUBLIC retains EXECUTE on public functions.')
  const unsecuredDefiners = await client.query(`SELECT count(*)::int AS n FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prosecdef AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,ARRAY[]::text[])) setting WHERE setting LIKE 'search_path=%')`)
  assert(unsecuredDefiners.rows[0].n === 0, 'SECURITY DEFINER function lacks explicit search_path.')
  const views = await client.query(`SELECT c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('v','m') ORDER BY c.relname`)
  return { zeroRowPackage: true, counts, publicTables: actualTables.length, views: views.rows.map(row => row.name), authUsers: 0, authMappings: 0, unexpectedBusinessRows: 0, rlsTables: rls.rows[0].total, directDmlPrivileges: directDml.rows[0].n, publicExecuteFunctions: publicExecute.rows[0].n, securityFinalized: phase === 'final', unsecuredDefiners: unsecuredDefiners.rows[0].n, foreignKeyOrphans: 0, crossKiosk: 0 }
}

export async function reconcile(client, fixture) {
  const counts = {}
  for (const [table, rows] of Object.entries(fixture.tables)) {
    const result = await client.query(`SELECT count(*)::int AS n FROM public."${table}"`)
    counts[table] = result.rows[0].n
    assert(counts[table] === rows.length, `${table}: post-import count ${counts[table]} differs from expected ${rows.length}.`)
    const keyColumn = rows.length === 0 || rows.every(row => 'id' in row)
      ? 'id'
      : ({ producto_costos: 'producto_id', movimiento_stock_costos: 'movimiento_id', anulaciones_venta_atomicas: 'venta_id' })[table]
    assert(keyColumn || rows.length === 0, `${table}: no reconciliation key is defined.`)
    if (rows.length > 0) {
      const keys = await client.query(`SELECT ${quoteIdentifier(keyColumn)}::text AS id FROM public."${table}" ORDER BY ${quoteIdentifier(keyColumn)}`)
      const expectedKeys = rows.map(row => String(row[keyColumn])).sort()
      assert(JSON.stringify(keys.rows.map(row => row.id)) === JSON.stringify(expectedKeys), `${table}: business identifiers differ from the synthetic fixture.`)
    }
  }
  const authUsers = await client.query('SELECT id::text AS id FROM auth.users ORDER BY id')
  const expectedAuthUserIds = fixture.authUsers.map(user => user.id).sort()
  assert(JSON.stringify(authUsers.rows.map(row => row.id)) === JSON.stringify(expectedAuthUserIds), 'Synthetic Auth user mapping differs from the fixture.')
  const numericChecks = [
    ['ventas', 'id', ['total'], fixture.tables.ventas],
    ['detalles_venta', 'id', ['cantidad', 'precio_unitario', 'subtotal'], fixture.tables.detalles_venta],
    ['pagos_venta', 'id', ['monto'], fixture.tables.pagos_venta],
    ['movimientos_stock', 'id', ['cantidad', 'delta_stock'], fixture.tables.movimientos_stock],
    ['movimientos_caja', 'id', ['monto'], fixture.tables.movimientos_caja],
    ['sesiones_caja', 'id', ['monto_inicial', 'monto_final_declarado', 'monto_final_sistema', 'diferencia'], fixture.tables.sesiones_caja],
  ]
  for (const [table, keyColumn, columns, expectedRows] of numericChecks) {
    const selected = [keyColumn, ...columns].map(column => `${quoteIdentifier(column)}::text AS ${quoteIdentifier(column)}`).join(',')
    const actual = await client.query(`SELECT ${selected} FROM public.${quoteIdentifier(table)} ORDER BY ${quoteIdentifier(keyColumn)}`)
    const expected = [...expectedRows].sort((a, b) => String(a[keyColumn]).localeCompare(String(b[keyColumn]))).map(row =>
      Object.fromEntries([keyColumn, ...columns].map(column => [column, row[column] == null ? null : String(row[column])])),
    )
    assert(JSON.stringify(actual.rows) === JSON.stringify(expected), `${table}: exact synthetic NUMERIC values differ from the fixture.`)
  }
  const stockRows = await client.query(`SELECT id,stock_actual::text FROM public.productos WHERE id = ANY($1::uuid[]) ORDER BY id`, [fixture.tables.productos.map(row => row.id)])
  const expectedStock = [...fixture.tables.productos].sort((a, b) => a.id.localeCompare(b.id)).map(row => ({ id: row.id, stock_actual: row.stock_actual }))
  assert(JSON.stringify(stockRows.rows) === JSON.stringify(expectedStock), 'Authoritative product stock snapshot changed.')
  const costs = await client.query(`SELECT producto_id,precio_costo::text FROM public.producto_costos ORDER BY producto_id`)
  const expectedCosts = [...fixture.tables.producto_costos].sort((a, b) => a.producto_id.localeCompare(b.producto_id)).map(row => ({ producto_id: row.producto_id, precio_costo: row.precio_costo }))
  assert(JSON.stringify(costs.rows) === JSON.stringify(expectedCosts), 'Product cost rows or exact NUMERIC values changed.')
  const movementCosts = await client.query(`SELECT movimiento_id,precio_costo::text FROM public.movimiento_stock_costos ORDER BY movimiento_id`)
  const expectedMovementCosts = [...fixture.tables.movimiento_stock_costos].sort((a, b) => a.movimiento_id.localeCompare(b.movimiento_id)).map(row => ({ movimiento_id: row.movimiento_id, precio_costo: row.precio_costo }))
  assert(JSON.stringify(movementCosts.rows) === JSON.stringify(expectedMovementCosts), 'Historical movement costs changed or were synthesized.')
  const authLinks = await client.query(`SELECT id,auth_user_id,kiosco_id,rol FROM public.usuarios ORDER BY id`)
  const expectedAuthLinks = fixture.tables.usuarios.map(row => ({ id: row.id, auth_user_id: row.auth_user_id, kiosco_id: row.kiosco_id, rol: row.rol })).sort((a, b) => a.id.localeCompare(b.id))
  assert(JSON.stringify(authLinks.rows) === JSON.stringify(expectedAuthLinks), 'Synthetic Auth mapping or preserved business profile UUID changed.')
  const salesLedger = await client.query(`SELECT v.id,v.total::text,coalesce(sum(d.subtotal),0)::numeric(12,2)::text AS detail_total,
      coalesce((SELECT sum(p.monto) FROM public.pagos_venta p WHERE p.venta_id=v.id),0)::numeric(12,2)::text AS payment_total
    FROM public.ventas v LEFT JOIN public.detalles_venta d ON d.venta_id=v.id GROUP BY v.id ORDER BY v.id`)
  for (const row of salesLedger.rows) assert(row.total === row.detail_total && row.total === row.payment_total, `Sale ${row.id}: total, detail, and payment NUMERIC differ.`)
  const tenantMismatch = await client.query(`SELECT
      (SELECT count(*)::int FROM public.productos p JOIN public.categorias c ON c.id=p.categoria_id WHERE p.kiosco_id<>c.kiosco_id) +
      (SELECT count(*)::int FROM public.producto_costos pc JOIN public.productos p ON p.id=pc.producto_id WHERE pc.kiosco_id<>p.kiosco_id) +
      (SELECT count(*)::int FROM public.combo_items ci JOIN public.productos p ON p.id=ci.combo_producto_id WHERE ci.kiosco_id<>p.kiosco_id) +
      (SELECT count(*)::int FROM public.promociones pr JOIN public.productos p ON p.id=pr.producto_id WHERE pr.producto_id IS NOT NULL AND pr.kiosco_id<>p.kiosco_id) +
      (SELECT count(*)::int FROM public.lotes_producto lp JOIN public.productos p ON p.id=lp.producto_id WHERE lp.kiosco_id<>p.kiosco_id) +
      (SELECT count(*)::int FROM public.sesiones_caja sc JOIN public.usuarios u ON u.id=sc.usuario_id WHERE sc.kiosco_id<>u.kiosco_id) +
      (SELECT count(*)::int FROM public.ventas v JOIN public.usuarios u ON u.id=v.usuario_id WHERE v.kiosco_id<>u.kiosco_id) +
      (SELECT count(*)::int FROM public.movimientos_stock ms JOIN public.productos p ON p.id=ms.producto_id WHERE ms.kiosco_id<>p.kiosco_id) +
      (SELECT count(*)::int FROM public.movimientos_caja mc JOIN public.sesiones_caja sc ON sc.id=mc.sesion_caja_id WHERE mc.kiosco_id<>sc.kiosco_id) AS n`)
  assert(tenantMismatch.rows[0].n === 0, 'Cross-kiosk relationship detected.')
  const foreignKeys = await client.query(`SELECT source_ns.nspname AS table_schema,source_rel.relname AS table_name,con.conname AS constraint_name,
      target_ns.nspname AS foreign_table_schema,target_rel.relname AS foreign_table_name,
      array_agg(source_att.attname::text ORDER BY key_pair.ordinality) AS source_columns,
      array_agg(target_att.attname::text ORDER BY key_pair.ordinality) AS destination_columns
    FROM pg_constraint con
    JOIN pg_class source_rel ON source_rel.oid=con.conrelid
    JOIN pg_namespace source_ns ON source_ns.oid=source_rel.relnamespace
    JOIN pg_class target_rel ON target_rel.oid=con.confrelid
    JOIN pg_namespace target_ns ON target_ns.oid=target_rel.relnamespace
    CROSS JOIN LATERAL unnest(con.conkey,con.confkey) WITH ORDINALITY AS key_pair(source_attnum,target_attnum,ordinality)
    JOIN pg_attribute source_att ON source_att.attrelid=source_rel.oid AND source_att.attnum=key_pair.source_attnum
    JOIN pg_attribute target_att ON target_att.attrelid=target_rel.oid AND target_att.attnum=key_pair.target_attnum
    WHERE con.contype='f' AND source_ns.nspname='public'
    GROUP BY source_ns.nspname,source_rel.relname,con.conname,target_ns.nspname,target_rel.relname
    ORDER BY source_ns.nspname,source_rel.relname,con.conname`)
  const groupedForeignKeys = new Map()
  for (const rawItem of foreignKeys.rows) {
    const item = assertForeignKeyMetadata(rawItem)
    const key = `${item.tableSchema}.${item.tableName}.${item.constraintName}`
    groupedForeignKeys.set(key, item)
  }
  for (const fk of groupedForeignKeys.values()) {
    const match = fk.sourceColumns.map((column, index) => `target.${quoteIdentifier(fk.destinationColumns[index])}=source.${quoteIdentifier(column)}`).join(' AND ')
    const allKeysPresent = fk.sourceColumns.map(column => `source.${quoteIdentifier(column)} IS NOT NULL`).join(' AND ')
    const orphan = await client.query(`SELECT count(*)::int AS n FROM ${quoteIdentifier(fk.tableSchema)}.${quoteIdentifier(fk.tableName)} source
      WHERE ${allKeysPresent} AND NOT EXISTS (SELECT 1 FROM ${quoteIdentifier(fk.foreignTableSchema)}.${quoteIdentifier(fk.foreignTableName)} target WHERE ${match})`)
    assert(orphan.rows[0].n === 0, `${fk.tableName}.${fk.constraintName}: foreign-key orphans detected.`)
  }
  const migrationContract = await readJson(path.join(bootstrapRoot, 'contract', 'data-migration.json'))
  const outOfScopeRows = {}
  for (const table of migrationContract.excludedTables) {
    const relation = await client.query('SELECT to_regclass($1)::text AS name', [`public.${table}`])
    if (!relation.rows[0].name) {
      outOfScopeRows[table] = 0
      continue
    }
    const result = await client.query(`SELECT count(*)::int AS n FROM public.${quoteIdentifier(table)}`)
    outOfScopeRows[table] = result.rows[0].n
    assert(outOfScopeRows[table] === 0, `${table}: excluded/out-of-scope table contains rows.`)
  }
  const status = await client.query(`SELECT estado,count(*)::int AS n,sum(total)::numeric(12,2)::text AS total FROM public.ventas GROUP BY estado ORDER BY estado`)
  assert(status.rows.length === 2 && status.rows.find(row => row.estado === 'ANULADA')?.n === 1, 'Final annulment status was not preserved.')
  const openCash = await client.query(`SELECT count(*)::int AS n FROM public.sesiones_caja WHERE estado<>'CERRADA' OR fecha_cierre IS NULL`)
  assert(openCash.rows[0].n === 0, 'Destination contains an open cash session.')
  const evidence = await client.query(`SELECT
      (SELECT count(*)::int FROM public.checkout_manuales) AS checkout_evidence,
      (SELECT count(*)::int FROM public.anulaciones_venta_atomicas) AS annulment_evidence,
      (SELECT count(*)::int FROM public.auditoria_operaciones) AS operation_audit,
      (SELECT count(*)::int FROM public.movimientos_stock) AS stock_movements,
      (SELECT count(*)::int FROM public.movimientos_caja) AS cash_movements`)
  assert(evidence.rows[0].checkout_evidence === fixture.tables.checkout_manuales.length, 'Checkout history evidence was duplicated.')
  assert(evidence.rows[0].annulment_evidence === fixture.tables.anulaciones_venta_atomicas.length, 'Annulment evidence was duplicated.')
  assert(evidence.rows[0].operation_audit === 0, 'Unexpected audit side effects were generated.')
  assert(evidence.rows[0].stock_movements === fixture.tables.movimientos_stock.length, 'Stock trigger generated extra historical movements.')
  assert(evidence.rows[0].cash_movements === fixture.tables.movimientos_caja.length, 'Cash movements were duplicated.')
  return { counts, salesByState: status.rows, evidence: evidence.rows[0], foreignKeysChecked: groupedForeignKeys.size, crossKiosk: tenantMismatch.rows[0].n, outOfScopeRows }
}

export async function runC2OneShotPhases({ preImport, preImportStepCount, importFixture, postImportFiles, applySql, reconcileAt, checkTriggers, postflight }) {
  await preImport()
  await importFixture()
  const preTrigger = await reconcileAt('pre-trigger')
  console.log('PASS: pre-trigger reconciliation')
  await applySql(postImportFiles[0])
  const triggerCount = await checkTriggers()
  assert(triggerCount === expectedPostImportTriggerCount, `Expected ${expectedPostImportTriggerCount} post-import triggers, found ${triggerCount}.`)
  console.log('PASS: post-import trigger installation')
  await applySql(postImportFiles[1])
  await postflight()
  console.log('PASS: final security/postflight')
  const final = await reconcileAt('final')
  const checkpointState = value => value?.zeroRowPackage === true
    ? (({ zeroRowPackage, counts, publicTables, views, authUsers, authMappings, unexpectedBusinessRows, foreignKeyOrphans, crossKiosk }) => ({ zeroRowPackage, counts, publicTables, views, authUsers, authMappings, unexpectedBusinessRows, foreignKeyOrphans, crossKiosk }))(value)
    : value
  assert(JSON.stringify(checkpointState(final)) === JSON.stringify(checkpointState(preTrigger)), 'Final reconciliation differs from the pre-trigger checkpoint; post-import SQL changed imported data.')
  console.log('PASS: final reconciliation')
  return {
    preImportStepCount,
    expectedPostImportTriggersBefore042: 0,
    preTriggerReconciliation: 'PASS',
    postImportTriggerCount: triggerCount,
    finalReconciliation: 'PASS',
    reconciliation: final,
  }
}

export async function executeImportLocal(databaseUrl, options = {}) {
  validateLocalDatabaseUrl(databaseUrl)
  assert(options.target === 'local', 'IMPORT_LOCAL requires --target local.')
  const zeroRowPackage = options.zeroRowPackageDirectory ? await loadZeroRowPackage(options.zeroRowPackageDirectory) : null
  const loadedContract = zeroRowPackage ?? await loadContract()
  const { bootstrapManifest, mapping } = loadedContract
  const fixture = zeroRowPackage ? null : loadedContract.fixture
  const zeroRowPlan = zeroRowPackage?.sqlPlan
  assert(!process.env.F6_EXPECTED_PROJECT_REF && !process.env.F6_ACTUAL_PROJECT_REF, 'Project refs are forbidden for local import.')
  const linkedRef = path.join(repoRoot, 'supabase', '.temp', 'project-ref')
  try {
    await readFile(linkedRef, 'utf8')
    throw new Error('Supabase checkout is linked to a project; IMPORT_LOCAL refused.')
  } catch (error) {
    if (error instanceof Error && error.message.includes('linked to a project')) throw error
    if (error?.code !== 'ENOENT') throw error
  }
  const client = new Client({ connectionString: databaseUrl, connectionTimeoutMillis: 4000, query_timeout: 30000, ssl: false })
  let currentStep = 'local connection'
  try {
    await client.connect()
    await runPreflight(client)
    const preImportSqlFiles = zeroRowPlan?.preImportSqlFiles ?? bootstrapManifest.files.slice(0, bootstrapManifest.files.findIndex(item => item.path === bootstrapManifest.importWindowAfter) + 1).map(item => item.path)
    const postImportSqlFiles = zeroRowPlan?.postImportSqlFiles ?? bootstrapManifest.postImportFiles
    return await runC2OneShotPhases({
      preImport: async () => {
        currentStep = 'preflight'
        await runPreflight(client)
        for (const relativePath of preImportSqlFiles) {
          currentStep = relativePath
          await client.query(await readFile(sqlFilePath(relativePath), 'utf8'))
        }
        currentStep = 'safe import window trigger check'
        const earlyTriggers = await client.query(`SELECT count(*)::int AS n FROM pg_trigger WHERE NOT tgisinternal AND tgrelid IN (
          SELECT c.oid FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p')
        )`)
        assert(earlyTriggers.rows[0].n === 0, 'Operational triggers are active before historical import.')
      },
      preImportStepCount: preImportSqlFiles.length,
      importFixture: async () => {
        currentStep = zeroRowPackage ? 'validated zero-row package (no business/Auth inserts)' : 'synthetic Auth identity placeholders and fixture import'
        if (zeroRowPackage) {
          assert(zeroRowPackage.result.totalMigrableRows === 0, 'Only a validated zero-row package may use this local path.')
          console.log('PASS: package import window is intentionally empty; no business/Auth rows inserted.')
          return
        }
        await client.query('BEGIN')
        try {
          for (const user of fixture.authUsers) await client.query('INSERT INTO auth.users(id) VALUES($1)', [user.id])
          for (const table of mapping.localSyntheticImportOrder) await insertTable(client, table, fixture.tables[table], mapping.localSyntheticImportAllowlist)
          await client.query('COMMIT')
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        }
      },
      postImportFiles: postImportSqlFiles,
      applySql: async relativePath => {
        currentStep = relativePath
        await client.query(await readFile(sqlFilePath(relativePath), 'utf8'))
      },
      reconcileAt: async phase => {
        currentStep = phase === 'pre-trigger' ? 'RECONCILIATION_PRE_TRIGGERS' : 'RECONCILIATION_FINAL'
        if (phase === 'pre-trigger') {
          const triggers = await client.query(`SELECT count(*)::int AS n FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
            WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relkind IN ('r','p')`)
          assert(triggers.rows[0].n === 0, 'Post-import triggers must be absent during pre-trigger reconciliation.')
        }
        return zeroRowPackage ? await reconcileZeroRowDestination(client, mapping, zeroRowPackage.migration, { phase }) : await reconcile(client, fixture)
      },
      checkTriggers: async () => {
        currentStep = 'post-import trigger verification'
        const triggerSql = await readFile(sqlFilePath(postImportSqlFiles[0]), 'utf8')
        const expected = [...triggerSql.matchAll(/\bCREATE\s+TRIGGER\s+("?[a-z_][a-z0-9_]*"?)\s+[\s\S]*?\bON\s+public\.("?[a-z_][a-z0-9_]*"?)/gi)]
          .map(match => ({ name: match[1].replaceAll('"', ''), table: match[2].replaceAll('"', '') }))
          .sort((a, b) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`))
        assert(expected.length === expectedPostImportTriggerCount, `042 declares ${expected.length} triggers; expected ${expectedPostImportTriggerCount}.`)
        const actual = await client.query(`SELECT t.tgname AS name,c.relname AS table FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
          WHERE NOT t.tgisinternal AND n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname,t.tgname`)
        const actualTriggers = actual.rows.sort((a, b) => `${a.table}.${a.name}`.localeCompare(`${b.table}.${b.name}`))
        assert(JSON.stringify(actualTriggers) === JSON.stringify(expected), 'Installed trigger names or tables differ from 042_post_import_triggers.sql.')
        return actual.rows.length
      },
      postflight: async () => {
        currentStep = 'postflight'
        await client.query(psqlCompatible(await readFile(path.join(bootstrapRoot, 'postflight.sql'), 'utf8')))
      },
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown failure.'
    throw new Error(`${currentStep}: ${message}. Stop; reset only the isolated local Supabase stack before retrying.`)
  } finally {
    await client.end().catch(() => {})
  }
}

export async function validateC2Artifacts() {
  const loaded = await loadContract()
  return {
    sqlFiles: loaded.bootstrapManifest.files.length,
    preImportFiles: loaded.bootstrapManifest.files.findIndex(item => item.path === loaded.bootstrapManifest.importWindowAfter) + 1,
    postImportFiles: loaded.bootstrapManifest.postImportFiles.length,
    fixtureRows: Object.values(loaded.fixture.tables).reduce((total, rows) => total + rows.length, 0),
    kiosks: loaded.fixture.tables.kioscos.length,
  }
}
