// @vitest-environment node
// Actual PostgreSQL SQL parsing/state checks in PGlite, using canonical table
// definitions only. Does NOT claim complete SQL001-054 installation/functions.
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { positivePlanFixture } from './fixtures/fiscalPositivePlan'
import { createPositiveWindowDatabase, positiveWindowReadOnlySql } from '../../scripts/fiscal-positive-window-database.mjs'
import { planFiscalPreparationToggle } from '../../scripts/plan-fiscal-preparation-toggle.mjs'
function canonicalTables(sql: string): string[] {
  const statements: string[] = []
  for (const match of sql.matchAll(/CREATE TABLE IF NOT EXISTS public\.[a-z_]+\s*\(/g)) {
    let depth = 1, quote = '', end = match.index + match[0].length
    for (; end < sql.length && depth > 0; end++) {
      const char = sql[end]
      if (quote) { if (char === quote) { if (sql[end + 1] === quote) end++; else quote = '' } continue }
      if (char === "'" || char === '"') { quote = char; continue }
      if (char === '-' && sql[end + 1] === '-') { const newline = sql.indexOf('\n', end); if (newline < 0) throw Error('Unterminated table comment'); end = newline; continue }
      if (char === '(') depth++
      if (char === ')') depth--
    }
    if (depth !== 0 || sql.slice(end).trimStart()[0] !== ';') throw Error('Unterminated canonical table')
    statements.push(sql.slice(match.index, end) + ';')
  }
  return statements
}
async function fixture(catalogRevision=2) {
  const db = new PGlite(), { config, snapshot } = positivePlanFixture(catalogRevision)
  const runtimeNow = Date.now()
  config.now = new Date(runtimeNow - 10000).toISOString(); config.startsAt = new Date(runtimeNow - 5000).toISOString()
  config.endsAt = new Date(runtimeNow + 600000).toISOString(); config.taNotBefore = new Date(runtimeNow - 6000).toISOString()
  snapshot.observed_at = config.now; snapshot.catalog.vence_en = new Date(runtimeNow + 3600000).toISOString()
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(runtimeNow)
  config.invoice.datos.fecha = ['year','month','day'].map(key => parts.find(part => part.type === key)?.value).join('')
  config.snapshotText = JSON.stringify(snapshot); config.snapshotSha256 = createHash('sha256').update(config.snapshotText).digest('hex')
  try {
    await db.exec('CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY)')
    await db.exec(readFileSync('supabase/bootstrap/001_domain.sql', 'utf8'))
    const folder = 'supabase/pilot-fiscal'
    const canonicalFunction = readFileSync(join(folder, '018_fiscal_reserved_replacement.sql'), 'utf8').match(/CREATE OR REPLACE FUNCTION public\.fiscal_json_canonico_homologacion\([\s\S]*?END \$\$;/)?.[0]
    if (!canonicalFunction) throw Error('Canonical CHECK dependency absent')
    await db.exec(canonicalFunction)
    // Keep the real CHECK validator referenced by the canonical catalog table;
    // no unconditional-true stub or stripped constraint is used.
    const catalogFunctions = readFileSync(join(folder, '033_fiscal_credit_context.sql'), 'utf8')
    await db.exec(catalogFunctions.slice(0, catalogFunctions.indexOf('CREATE TABLE')) + '\nCOMMIT;')
    for (const file of readdirSync(folder).filter(name => name.endsWith('.sql')).sort()) {
      const sql = readFileSync(join(folder, file), 'utf8')
      for (const statement of canonicalTables(sql)) await db.exec(statement)
    }
    await db.exec('ALTER TABLE fiscal_ta_intentos_homologacion ADD COLUMN operacion_origen_id uuid; ALTER TABLE fiscal_reservas_homologacion ADD COLUMN solicitud_sha256 text; ALTER TABLE fiscal_emisores_homologacion ENABLE ROW LEVEL SECURITY; ALTER TABLE fiscal_parametros_homologacion ENABLE ROW LEVEL SECURITY')
    await db.query('INSERT INTO auth.users VALUES($1)', [config.ownerAuthId])
    await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Synthetic')", [config.kioskId])
    await db.query("INSERT INTO usuarios(auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,'Synthetic','DUEÑO')", [config.ownerAuthId, config.kioskId])
    await db.query('INSERT INTO ventas(id,kiosco_id,fecha_hora,total) VALUES($1,$2,$3,$4)', [snapshot.sale.id, config.kioskId, snapshot.sale.fecha_hora, snapshot.sale.total])
    const d = snapshot.details[0]
    await db.query("INSERT INTO productos(id,kiosco_id,descripcion,stock_actual) VALUES($1,$2,'Synthetic',1)", [d.producto_id, config.kioskId])
    await db.query('INSERT INTO detalles_venta(id,venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,$3,$4,$5,$6)', [d.id, snapshot.sale.id, d.producto_id, d.cantidad, d.precio_unitario, d.subtotal])
    await db.query('INSERT INTO fiscal_emisores_homologacion SELECT * FROM jsonb_populate_record(NULL::fiscal_emisores_homologacion,$1::jsonb)', [JSON.stringify(snapshot.issuer)])
    await db.query('INSERT INTO fiscal_parametros_homologacion SELECT * FROM jsonb_populate_record(NULL::fiscal_parametros_homologacion,$1::jsonb)', [JSON.stringify(snapshot.catalog)])
    for(let revision=1;revision<catalogRevision;revision++)await db.query('INSERT INTO fiscal_parametros_homologacion SELECT $1::integer,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,false FROM fiscal_parametros_homologacion WHERE revision=$2',[revision,catalogRevision])
    await db.exec("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SET LOCAL TIME ZONE 'UTC'")
    const read = await db.query<{ history_sha256: string; commercial_sha256: string }>(positiveWindowReadOnlySql, [config.ownerAuthId, config.kioskId, snapshot.sale.id, config.operationId, snapshot.issuer.certificado_sha256,config.catalogRevision])
    await db.exec('ROLLBACK')
    const observer = { query: async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('SET LOCAL TIME')) { await db.exec(sql); return { rows: [] } }
      return db.query<Record<string, unknown>>(sql, params)
    } }
    const writer = { query: async (sql: string, params?: unknown[]) => {
      if (sql.startsWith('-- REVIEW') || sql.startsWith('-- Close private')) { await db.exec(sql); return { rows: [] } }
      return db.query<Record<string, unknown>>(sql, params)
    } }
    const adapter = await createPositiveWindowDatabase({ client: writer, observer, config, historySha256: read.rows[0].history_sha256, commercialSha256: read.rows[0].commercial_sha256 })
    return { db, adapter, config, snapshot, observer, writer, historySha256: read.rows[0].history_sha256, commercialSha256: read.rows[0].commercial_sha256,
      plan: await planFiscalPreparationToggle(config) }
  } catch (error) { await db.close(); throw error }
}
it('executes the real read-only SQL and accepts only the exact inactive baseline, without leaving a transaction', async () => {
  const f = await fixture()
  try {
    await f.adapter.assertClosedBaseline()
    expect((await f.db.query("SELECT current_setting('transaction_read_only') AS value")).rows).toEqual([{ value: 'off' }])
  } finally { await f.db.close() }
}, 60000)
it('reads explicitly pinned revision3 and anchors both older revisions',async()=>{
  const f=await fixture(3)
  try{
    await f.adapter.assertClosedBaseline()
    expect(f.adapter.baselineMetadata().historySha256).toBe(f.historySha256)
    const rows=await f.db.query(positiveWindowReadOnlySql,[f.config.ownerAuthId,f.config.kioskId,f.snapshot.sale.id,f.config.operationId,f.snapshot.issuer.certificado_sha256,3])
    expect(rows.rows[0]).toMatchObject({catalog_count:3,history_revisions:[1,2],snapshot:{catalog:{revision:3,habilitado:false}}})
  }finally{await f.db.close()}
},60000)
it.each(['older-drift','history-gap','unexpected-revision'])('rejects renewed-catalog %s without silently repinning',async mode=>{
  const f=await fixture(3)
  try{
    await f.adapter.assertClosedBaseline()
    if(mode==='older-drift')await f.db.exec("UPDATE fiscal_parametros_homologacion SET fuente_sha256=repeat('d',64) WHERE revision=2")
    if(mode==='history-gap')await f.db.exec('DELETE FROM fiscal_parametros_homologacion WHERE revision=1')
    if(mode==='unexpected-revision')await f.db.exec('INSERT INTO fiscal_parametros_homologacion SELECT 4,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,false FROM fiscal_parametros_homologacion WHERE revision=3')
    await expect(f.adapter.assertClosedBaseline()).rejects.toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
  }finally{await f.db.close()}
},60000)
it('permanently rejects an observer with unconfirmed ROLLBACK instead of reusing a potentially stale snapshot', async () => {
  const f = await fixture()
  try {
    let calls = 0
    const observer = { query: async (sql: string, params?: unknown[]) => {
      calls++
      if (sql === 'ROLLBACK') throw Error('Synthetic lost rollback ACK')
      return f.observer.query(sql, params)
    } }
    const adapter = await createPositiveWindowDatabase({ client: f.writer, observer, config: f.config, historySha256: f.historySha256, commercialSha256: f.commercialSha256 })
    await expect(adapter.assertClosedBaseline()).rejects.toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
    const firstCalls = calls
    await expect(adapter.assertClosedBaseline()).rejects.toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
    expect(calls).toBe(firstCalls)
    await f.db.exec('ROLLBACK') // Only the isolated fixture repairs its test transaction.
  } finally { await f.db.close() }
}, 60000)
it('can capture a fresh closed baseline before opening, persists its anchors and never refreshes them after drift', async () => {
  const f = await fixture()
  try {
    const adapter = await createPositiveWindowDatabase({ client: f.writer, observer: f.observer, config: f.config, historySha256: null, commercialSha256: null })
    expect(() => adapter.baselineMetadata()).toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
    await expect(adapter.executeOpen(f.plan.activationSql)).rejects.toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
    await adapter.assertClosedBaseline()
    const baseline = adapter.baselineMetadata()
    expect(baseline).toMatchObject({ historySha256: f.historySha256, commercialSha256: f.commercialSha256 })
    await f.db.exec('UPDATE productos SET stock_actual=2')
    await expect(adapter.assertClosedBaseline()).rejects.toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
    expect(adapter.baselineMetadata()).toBe(baseline)
    expect((await f.db.query<{ enabled: boolean }>('SELECT habilitado AS enabled FROM fiscal_emisores_homologacion')).rows[0].enabled).toBe(false)
  } finally { await f.db.close() }
}, 60000)
it('can recover its exact receipt for cleanup after Owner revocation immediately following the opening commit', async () => {
  const f = await fixture()
  try {
    await f.adapter.assertClosedBaseline()
    await f.adapter.executeOpen(f.plan.activationSql)
    await f.db.exec('UPDATE usuarios SET activo=false')
    const receipt = await f.adapter.readOpenedReceipt()
    await expect(f.adapter.assertActiveBinding(receipt)).rejects.toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
    await f.adapter.executeClose(f.plan.closureSql, receipt.openedAt)
    await f.adapter.verifyClosed(receipt, null)
    expect((await f.db.query<{ enabled: boolean }>('SELECT habilitado AS enabled FROM fiscal_emisores_homologacion')).rows[0].enabled).toBe(false)
  } finally { await f.db.close() }
}, 60000)
it('executes only the exact approved SQL, preserves its receipt on closure and rejects reopening the old plan', async () => {
  const f = await fixture()
  try {
    await expect(f.adapter.executeOpen(f.plan.activationSql + '\n-- altered')).rejects.toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
    await f.adapter.assertClosedBaseline()
    await f.adapter.executeOpen(f.plan.activationSql)
    const receipt = await f.adapter.readOpenedReceipt()
    expect(typeof receipt.openedAt).toBe('string')
    await f.adapter.assertActiveBinding(receipt)
    await expect(f.adapter.executeClose(f.plan.closureSql, '2000-01-01 00:00:00+00')).rejects.toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
    await f.adapter.assertActiveBinding(receipt)
    await f.adapter.executeClose(f.plan.closureSql, receipt.openedAt)
    await f.adapter.verifyClosed(receipt, null)
    expect((await f.db.query<{ same_receipt: boolean }>('SELECT actualizado_en=$1::timestamptz AS same_receipt FROM fiscal_emisores_homologacion', [receipt.openedAt])).rows[0].same_receipt).toBe(true)
    await expect(f.adapter.executeOpen(f.plan.activationSql)).rejects.toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
    await f.adapter.verifyClosed(receipt, null)
  } finally { await f.db.close() }
}, 60000)
it.each(['stock','history','actor','issuer','catalog','private-grant','unexpected-credit'])('rejects %s drift with real read-only SQL', async mode => {
  const f = await fixture()
  try {
    if (mode === 'stock') await f.db.exec('UPDATE productos SET stock_actual=2')
    if (mode === 'history') await f.db.exec("UPDATE fiscal_parametros_homologacion SET fuente_sha256=repeat('d',64) WHERE revision=1")
    if (mode === 'actor') await f.db.exec("UPDATE usuarios SET rol='CAJERO'")
    if (mode === 'issuer') await f.db.exec('UPDATE fiscal_emisores_homologacion SET habilitado=true')
    if (mode === 'catalog') await f.db.exec('UPDATE fiscal_parametros_homologacion SET habilitado=true WHERE revision=2')
    if (mode === 'private-grant') await f.db.exec('GRANT SELECT ON fiscal_emisores_homologacion TO authenticated')
    if (mode === 'unexpected-credit') await f.db.exec("INSERT INTO fiscal_nc_series_homologacion(cuit_emisor,punto_venta,tipo_comprobante) VALUES('20123456786',2,13)")
    await expect(f.adapter.assertClosedBaseline()).rejects.toThrow('WINDOW_DATABASE_NOT_CONFIRMED')
    expect((await f.db.query("SELECT current_setting('transaction_read_only') AS value")).rows).toEqual([{ value: 'off' }])
  } finally { await f.db.close() }
}, 60000)
