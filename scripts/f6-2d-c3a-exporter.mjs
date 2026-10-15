import { createHash } from 'node:crypto'
import { lstat, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Client, types } from 'pg'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const mappingPath = path.join(root, 'supabase/bootstrap/contract/source-destination-mapping.json')
const migrationPath = path.join(root, 'supabase/bootstrap/contract/data-migration.json')
const defaultClassification = path.join(root, 'artifacts/f6-2d-legacy-inventory/export/approved-row-ids.json')
const legacyRef = 'wlqujnwxrmksheubfrha'
const prohibitedColumn = /password|encrypted|token|secret|private.?key|pin.?hash|jwt|(?:^|_)cae(?:_|$)|certificado|afip|arca|point|email|reference|suscrip|plan|devolucion|envase_compartido/i
const validExclusionReasons = new Set([
  'F4_FIXTURE', 'SYNTHETIC_ACCOUNT', 'OUT_OF_SCOPE', 'QUARANTINE', 'INCOMPATIBLE_HISTORY', 'DUPLICATE', 'OTHER_APPROVED',
  'EXACT_SIGNATURE', 'MANUAL_OWNER_CONFIRMED_DEMO', 'MANUAL_OWNER_CONFIRMED_DEMO_CASCADE',
])
const classificationSchemaVersion = 'F6.2D-C3C-2'
const timestampColumns = new Set([
  'kioscos.fecha_creacion', 'usuarios.fecha_creacion', 'productos.fecha_creacion', 'productos.fecha_actualizacion',
  'producto_costos.fecha_actualizacion', 'combo_items.created_at', 'promociones.fecha_inicio', 'promociones.fecha_fin',
  'promociones.created_at', 'lotes_producto.fecha_ingreso', 'sesiones_caja.fecha_apertura', 'sesiones_caja.fecha_cierre',
  'ventas.fecha_hora', 'ventas.anulada_en', 'movimientos_stock.fecha', 'movimientos_caja.fecha_hora',
])
const dateColumns = new Set(['lotes_producto.fecha_vencimiento'])
const numericColumns = {
  productos: ['precio_venta', 'stock_actual', 'stock_minimo', 'precio_envase'],
  producto_costos: ['precio_costo'],
  combo_items: ['cantidad'],
  promociones: ['cantidad_minima', 'cantidad_paga', 'precio_unitario_promo', 'descuento_porcentaje', 'precio_combo'],
  lotes_producto: ['cantidad_inicial', 'cantidad_actual'],
  sesiones_caja: ['monto_inicial', 'monto_final_declarado', 'monto_final_sistema', 'diferencia'],
  ventas: ['total'],
  detalles_venta: ['cantidad', 'precio_unitario', 'subtotal', 'precio_envase_unitario'],
  pagos_venta: ['monto'],
  movimientos_stock: ['cantidad', 'delta_stock'],
  movimiento_stock_costos: ['precio_costo'],
  movimientos_caja: ['monto'],
}

// Preserve PostgreSQL date/timestamp text exactly; JS Date would truncate fractional seconds.
for (const oid of [1082, 1114, 1184]) types.setTypeParser(oid, value => value)

function assert(ok, message) { if (!ok) throw new Error(message) }
function qid(value) { assert(/^[a-z][a-z0-9_]*$/.test(value), `Unsafe SQL identifier: ${value}`); return `"${value}"` }
function stable(value) {
  if (Array.isArray(value)) return value.map(stable)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]))
}
function stableJson(value) { return `${JSON.stringify(stable(value), null, 2)}\n` }
function sha256(value) { return createHash('sha256').update(value).digest('hex') }
async function readJson(file) { return JSON.parse(await readFile(file, 'utf8')) }

export function canonicalizeTimestamptz(value) {
  assert(typeof value === 'string', 'timestamptz value must be PostgreSQL text.')
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,6}))?(Z|([+-])(\d{2})(?::?(\d{2}))?)$/)
  assert(match, `Unrecognized timestamptz text refused: ${value}`)
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction = '', zone, sign, offsetHourText = '0', offsetMinuteText = '0'] = match
  const year = Number(yearText), month = Number(monthText), day = Number(dayText)
  const hour = Number(hourText), minute = Number(minuteText), second = Number(secondText)
  const offsetHour = Number(offsetHourText), offsetMinute = Number(offsetMinuteText)
  assert(year >= 1000 && year <= 9999 && month >= 1 && month <= 12, `Invalid timestamptz calendar date refused: ${value}`)
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  assert(day >= 1 && day <= daysInMonth && hour <= 23 && minute <= 59 && second <= 59, `Invalid timestamptz clock value refused: ${value}`)
  assert(offsetHour <= 23 && offsetMinute <= 59, `Invalid timestamptz UTC offset refused: ${value}`)
  const local = new Date(0)
  local.setUTCFullYear(year, month - 1, day)
  local.setUTCHours(hour, minute, second, 0)
  const offsetSign = sign === '-' ? -1 : 1
  const utc = new Date(local.getTime() - offsetSign * (offsetHour * 60 + offsetMinute) * 60_000)
  assert(!Number.isNaN(utc.getTime()), `Out-of-range timestamptz refused: ${value}`)
  const isoSeconds = utc.toISOString().slice(0, 19)
  return `${isoSeconds}.${fraction.padEnd(6, '0')}Z`
}

export function canonicalizeDate(value) {
  assert(typeof value === 'string', 'date value must be PostgreSQL text.')
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  assert(match, `Unrecognized date text refused: ${value}`)
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3])
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
  assert(month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth, `Invalid date refused: ${value}`)
  return value
}

function canonicalizeTemporalRow(table, row) {
  const canonical = { ...row }
  for (const [column, value] of Object.entries(canonical)) {
    if (value === null || value === undefined) continue
    const qualified = `${table.name}.${column}`
    if (timestampColumns.has(qualified)) canonical[column] = canonicalizeTimestamptz(value)
    if (dateColumns.has(qualified)) canonical[column] = canonicalizeDate(value)
  }
  return canonical
}

function validateExactNumericStrings(table, row) {
  for (const column of numericColumns[table.name] ?? []) {
    const value = row[column]
    if (value === null || value === undefined) continue
    assert(typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value), `${table.name}.${column} must remain an exact PostgreSQL NUMERIC string.`)
  }
}

function addDecimal(values) {
  const parsed = values.filter(value => value !== null && value !== undefined).map(value => {
    const match = String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/)
    assert(match, `Non-NUMERIC baseline value refused: ${value}`)
    return { negative: match[1] === '-', whole: match[2], fraction: match[3] ?? '' }
  })
  if (parsed.length === 0) return null
  const scale = Math.max(...parsed.map(value => value.fraction.length))
  const sum = parsed.reduce((total, value) => {
    const magnitude = BigInt(`${value.whole}${value.fraction.padEnd(scale, '0')}`)
    return total + (value.negative ? -magnitude : magnitude)
  }, 0n)
  const negative = sum < 0n
  const digits = (negative ? -sum : sum).toString().padStart(scale + 1, '0')
  return scale ? `${negative ? '-' : ''}${digits.slice(0, -scale)}.${digits.slice(-scale)}` : `${negative ? '-' : ''}${digits}`
}
function decimalsEqual(left, right) {
  const canonical = value => {
    const match = String(value).match(/^(-?)(\d+)(?:\.(\d+))?$/)
    assert(match, `Non-NUMERIC reconciliation value refused: ${value}`)
    const whole = match[2].replace(/^0+(?=\d)/, '')
    const fraction = (match[3] ?? '').replace(/0+$/, '')
    return `${match[1]}${whole}${fraction ? `.${fraction}` : ''}`
  }
  return canonical(left) === canonical(right)
}

function reconciliationMetrics(rowsByTable, sourceStockRows = rowsByTable.movimientos_stock) {
  const metrics = []
  const add = (metric, rows, field, dimensionField = null, kioskOf = row => row.kiosco_id ?? null) => {
    const groups = new Map()
    for (const row of rows ?? []) {
      const key = `${kioskOf(row) ?? ''}\0${dimensionField ? row[dimensionField] ?? '' : ''}`
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key).push(row)
    }
    for (const [key, group] of groups) {
      const [kiosk, dimension] = key.split('\0')
      metrics.push({ metric, kiosco_id: kiosk || null, dimension: dimension || null, row_count: group.length, amount_sum: field ? addDecimal(group.map(row => row[field])) : null })
    }
  }
  const products = rowsByTable.productos ?? []
  add('productos_stock_snapshot', products, 'stock_actual')
  add('productos_precio_venta_snapshot', products, 'precio_venta')
  add('producto_costos_snapshot', rowsByTable.producto_costos, 'precio_costo')
  add('lotes_cantidad_actual', rowsByTable.lotes_producto, 'cantidad_actual')
  add('ventas_por_estado', rowsByTable.ventas, 'total', 'estado')
  const sales = new Map((rowsByTable.ventas ?? []).map(row => [String(row.id), row]))
  const bySaleKiosk = row => sales.get(String(row.venta_id))?.kiosco_id ?? null
  add('detalles_venta', rowsByTable.detalles_venta, 'subtotal', null, bySaleKiosk)
  add('pagos_venta', rowsByTable.pagos_venta, 'monto', null, bySaleKiosk)
  add('movimientos_stock_por_tipo', sourceStockRows, 'cantidad', 'tipo')
  add('movimientos_stock_neto_compatible', rowsByTable.movimientos_stock, 'delta_stock')
  add('movimiento_stock_costos', rowsByTable.movimiento_stock_costos, 'precio_costo')
  add('sesiones_caja_cerradas', rowsByTable.sesiones_caja, 'monto_final_declarado')
  add('movimientos_caja_por_tipo', rowsByTable.movimientos_caja, 'monto', 'tipo')
  return metrics.sort((a, b) => `${a.metric}:${a.kiosco_id}:${a.dimension}`.localeCompare(`${b.metric}:${b.kiosco_id}:${b.dimension}`))
}

export function normalizeHistoricalStockMovements(inputRows) {
  return inputRows.map(row => {
    assert(typeof row.cantidad === 'string' && /^-?\d+(?:\.\d+)?$/.test(row.cantidad), 'Stock movement cantidad must remain an exact signed NUMERIC string.')
    const negative = row.cantidad.startsWith('-')
    const magnitude = negative ? row.cantidad.slice(1) : row.cantidad
    assert(/[1-9]/.test(magnitude), 'Stock movement cantidad must be non-zero.')
    if (row.tipo === 'INGRESO') {
      assert(!negative, 'Negative INGRESO quantity has no approved historical semantics.')
      return { ...row, cantidad: magnitude, delta_stock: magnitude }
    }
    if (row.tipo === 'EGRESO') {
      const delta = negative ? row.cantidad : `-${magnitude}`
      return { ...row, cantidad: magnitude, delta_stock: delta }
    }
    throw new Error(`Stock movement type ${String(row.tipo)} needs approved semantics; export blocked.`)
  })
}

function historicalRowsForTable(table, inputRows) {
  return table.name === 'movimientos_stock' ? normalizeHistoricalStockMovements(inputRows) : inputRows
}

function validateExportRelationships(rowsByTable) {
  const kiosks = new Map((rowsByTable.kioscos ?? []).map(row => [String(row.id), row]))
  const users = new Map((rowsByTable.usuarios ?? []).map(row => [String(row.id), row]))
  const categories = new Map((rowsByTable.categorias ?? []).map(row => [String(row.id), row]))
  const products = new Map((rowsByTable.productos ?? []).map(row => [String(row.id), row]))
  const lots = new Map((rowsByTable.lotes_producto ?? []).map(row => [String(row.id), row]))
  const sessions = new Map((rowsByTable.sesiones_caja ?? []).map(row => [String(row.id), row]))
  const sales = new Map((rowsByTable.ventas ?? []).map(row => [String(row.id), row]))
  const stockMoves = new Map((rowsByTable.movimientos_stock ?? []).map(row => [String(row.id), row]))
  const sameKiosk = (kioskId, referenced, relation) => assert(Boolean(referenced) && String(referenced.kiosco_id) === String(kioskId), `${relation}: missing or cross-kiosk reference; export blocked.`)
  for (const row of rowsByTable.usuarios ?? []) assert(kiosks.has(String(row.kiosco_id)), 'usuarios.kiosco_id: kiosk missing from export.')
  for (const row of rowsByTable.categorias ?? []) assert(kiosks.has(String(row.kiosco_id)), 'categorias.kiosco_id: kiosk missing from export.')
  for (const row of rowsByTable.productos ?? []) {
    assert(kiosks.has(String(row.kiosco_id)), 'productos.kiosco_id: kiosk missing from export.')
    if (row.categoria_id) sameKiosk(row.kiosco_id, categories.get(String(row.categoria_id)), 'productos.categoria_id')
    assert(!row.proveedor_id, 'Product references a provider while the provider domain is contractually empty.')
  }
  for (const row of rowsByTable.producto_costos ?? []) sameKiosk(row.kiosco_id, products.get(String(row.producto_id)) && { kiosco_id: products.get(String(row.producto_id)).kiosco_id }, 'producto_costos.producto_id')
  for (const row of rowsByTable.combo_items ?? []) {
    sameKiosk(row.kiosco_id, products.get(String(row.combo_producto_id)), 'combo_items.combo_producto_id')
    sameKiosk(row.kiosco_id, products.get(String(row.componente_producto_id)), 'combo_items.componente_producto_id')
  }
  for (const row of rowsByTable.promociones ?? []) {
    if (row.producto_id) sameKiosk(row.kiosco_id, products.get(String(row.producto_id)), 'promociones.producto_id')
    if (row.categoria_id) sameKiosk(row.kiosco_id, categories.get(String(row.categoria_id)), 'promociones.categoria_id')
  }
  for (const row of rowsByTable.lotes_producto ?? []) sameKiosk(row.kiosco_id, products.get(String(row.producto_id)), 'lotes_producto.producto_id')
  for (const row of rowsByTable.sesiones_caja ?? []) {
    assert(row.estado === 'CERRADA' && row.fecha_cierre, 'Only genuinely closed sessions may be exported.')
    sameKiosk(row.kiosco_id, users.get(String(row.usuario_id)), 'sesiones_caja.usuario_id')
  }
  for (const row of rowsByTable.ventas ?? []) {
    sameKiosk(row.kiosco_id, users.get(String(row.usuario_id)), 'ventas.usuario_id')
    if (row.sesion_caja_id) sameKiosk(row.kiosco_id, sessions.get(String(row.sesion_caja_id)), 'ventas.sesion_caja_id')
  }
  for (const row of rowsByTable.detalles_venta ?? []) {
    const sale = sales.get(String(row.venta_id))
    const product = products.get(String(row.producto_id))
    assert(sale && product && String(sale.kiosco_id) === String(product.kiosco_id), 'detalles_venta: missing sale/product or cross-kiosk relation.')
  }
  for (const row of rowsByTable.pagos_venta ?? []) assert(sales.has(String(row.venta_id)), 'pagos_venta.venta_id: sale is not included.')
  for (const sale of rowsByTable.ventas ?? []) {
    const details = (rowsByTable.detalles_venta ?? []).filter(row => String(row.venta_id) === String(sale.id))
    const payments = (rowsByTable.pagos_venta ?? []).filter(row => String(row.venta_id) === String(sale.id))
    assert(details.length > 0 && decimalsEqual(addDecimal(details.map(row => row.subtotal)), sale.total), 'A sale detail total does not reconcile; export blocked.')
    assert(payments.length > 0 && decimalsEqual(addDecimal(payments.map(row => row.monto)), sale.total), 'A sale payment total does not reconcile; unsupported account/payment history blocks export.')
  }
  for (const row of rowsByTable.movimientos_stock ?? []) {
    sameKiosk(row.kiosco_id, products.get(String(row.producto_id)), 'movimientos_stock.producto_id')
    if (row.usuario_id) sameKiosk(row.kiosco_id, users.get(String(row.usuario_id)), 'movimientos_stock.usuario_id')
    if (row.lote_producto_id) sameKiosk(row.kiosco_id, lots.get(String(row.lote_producto_id)), 'movimientos_stock.lote_producto_id')
  }
  for (const row of rowsByTable.movimiento_stock_costos ?? []) sameKiosk(row.kiosco_id, stockMoves.get(String(row.movimiento_id)) && { kiosco_id: stockMoves.get(String(row.movimiento_id)).kiosco_id }, 'movimiento_stock_costos.movimiento_id')
  for (const row of rowsByTable.movimientos_caja ?? []) {
    sameKiosk(row.kiosco_id, sessions.get(String(row.sesion_caja_id)), 'movimientos_caja.sesion_caja_id')
    sameKiosk(row.kiosco_id, users.get(String(row.usuario_id)), 'movimientos_caja.usuario_id')
  }
  for (const name of ['clientes','movimientos_cuenta_corriente','proveedores','compras_proveedor','detalles_compra','pagos_proveedor']) assert((rowsByTable[name] ?? []).length === 0, `${name}: nonempty domain requires reopening the migration mapping.`)
}

export function validateExportContract(mapping, migration) {
  const contract = mapping?.exportContract
  assert(contract?.version === 'F6.2D-C3A-1' && contract.mode === 'PRE_CUTOVER_EXPORT' && contract.preCutover === true, 'Export contract must identify PRE_CUTOVER_EXPORT.')
  assert(mapping.remoteAccessAllowed === false && mapping.importEnabled === false, 'Export contract must not authorize remote writes/import.')
  assert(Array.isArray(contract.tables) && contract.tables.length > 0, 'Export table contract is missing.')
  const names = new Set()
  for (const table of contract.tables) {
    assert(typeof table.name === 'string' && /^[a-z][a-z0-9_]*$/.test(table.name), 'Invalid export relation name.')
    assert(!names.has(table.name), `Duplicate export relation: ${table.name}`)
    names.add(table.name)
    assert(Array.isArray(table.columns) && table.columns.length > 0 && table.columns.every(column => typeof column === 'string' && /^[a-z][a-z0-9_]*$/.test(column)), `${table.name}: columns must be explicit identifiers.`)
    assert(new Set(table.columns).size === table.columns.length, `${table.name}: duplicate export column.`)
    assert(table.columns.every(column => !prohibitedColumn.test(column)), `${table.name}: prohibited column in export allowlist.`)
    assert(table.columns.includes(table.key), `${table.name}: primary key must be selected for classification and sorting.`)
    assert(table.disposition, `${table.name}: disposition is required.`)
    if (table.countOnly) assert(table.columns.length === 1 && table.columns[0] === table.key, `${table.name}: empty domain must be count-only.`)
  }
  for (const entity of mapping.entities) {
    if (names.has(entity.source)) assert(entity.destination === entity.source || entity.source === 'auth.users', `${entity.source}: source/destination mapping mismatch.`)
  }
  const dataTables = new Set(migration.tables.map(table => table.name))
  for (const table of contract.tables) assert(dataTables.has(table.name), `${table.name}: missing from data-migration.json.`)
  assert(migration.remoteExportImportEnabled === false && migration.authTokensMigrated === false, 'Data migration contract unexpectedly enables remote export/import or Auth tokens.')
  assert(contract.tables.find(item => item.name === 'sesiones_caja')?.filter === "estado = 'CERRADA' AND fecha_cierre IS NOT NULL", 'Only explicitly closed sessions may be exported.')
  assert(contract.tables.find(item => item.name === 'checkout_manuales')?.enabled === false && contract.tables.find(item => item.name === 'anulaciones_venta_atomicas')?.enabled === false, 'Evidence export must stay disabled until separately approved.')
  return contract
}

export function buildSelectQuery(table, options = {}) {
  assert(table && typeof table.name === 'string' && Array.isArray(table.columns), 'Invalid query table contract.')
  const relation = `public.${qid(table.name)}`
  if (table.countOnly) return { text: `SELECT count(*)::bigint AS row_count FROM ${relation}`, values: [] }
  const columns = (options.idOnly ? [table.key] : table.columns).map(qid).join(', ')
  const clauses = []
  const values = []
  if (table.name === 'sesiones_caja') clauses.push(`"estado" = 'CERRADA' AND "fecha_cierre" IS NOT NULL`)
  if (table.name === 'usuarios') clauses.push('"kiosco_id" IS NOT NULL')
  if (table.name === 'ventas') clauses.push(`("sesion_caja_id" IS NULL OR EXISTS (SELECT 1 FROM public."sesiones_caja" AS closed_session WHERE closed_session."id" = "ventas"."sesion_caja_id" AND closed_session."estado" = 'CERRADA' AND closed_session."fecha_cierre" IS NOT NULL))`)
  if (table.name === 'movimientos_caja') clauses.push(`EXISTS (SELECT 1 FROM public."sesiones_caja" AS closed_session WHERE closed_session."id" = "movimientos_caja"."sesion_caja_id" AND closed_session."estado" = 'CERRADA' AND closed_session."fecha_cierre" IS NOT NULL)`)
  if (table.name === 'detalles_venta' || table.name === 'pagos_venta') {
    assert(Array.isArray(options.saleIds), `${table.name}: approved sale IDs required.`)
    values.push(options.saleIds)
    clauses.push(`"venta_id" = ANY($${values.length}::uuid[])`)
  }
  if (table.name === 'movimientos_caja') {
    assert(Array.isArray(options.closedSessionIds), 'movimientos_caja: approved closed-session IDs required.')
    values.push(options.closedSessionIds)
    clauses.push(`"sesion_caja_id" = ANY($${values.length}::uuid[])`)
  }
  if (table.name === 'movimiento_stock_costos') {
    assert(Array.isArray(options.stockMovementIds), 'movimiento_stock_costos: approved movement IDs required.')
    values.push(options.stockMovementIds)
    clauses.push(`"movimiento_id" = ANY($${values.length}::uuid[])`)
  }
  if (options.approvedIds) {
    assert(Array.isArray(options.approvedIds), `${table.name}: approved IDs must be an array.`)
    values.push(options.approvedIds)
    clauses.push(`${qid(table.key)} = ANY($${values.length}::uuid[])`)
  }
  const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : ''
  const text = `SELECT ${columns} FROM ${relation}${where} ORDER BY ${qid(table.key)}`
  assert(!/SELECT\s+\*/i.test(text), `${table.name}: SELECT * is forbidden.`)
  return { text, values }
}

export function approvedCandidateDependencies(tableName, classification, closedSessionIds = []) {
  if (tableName === 'detalles_venta' || tableName === 'pagos_venta') {
    return { saleIds: classification.tables?.ventas?.candidateIds ?? [] }
  }
  if (tableName === 'movimientos_caja') return { closedSessionIds }
  if (tableName === 'movimiento_stock_costos') {
    return { stockMovementIds: classification.tables?.movimientos_stock?.candidateIds ?? [] }
  }
  return {}
}

export function validateClassification(classification, tableContract, candidateRows) {
  const tableClass = classification?.tables?.[tableContract.name]
  assert(tableClass && Array.isArray(tableClass.candidateIds) && Array.isArray(tableClass.includeIds) && tableClass.exclude && typeof tableClass.exclude === 'object' && !Array.isArray(tableClass.exclude), `${tableContract.name}: missing candidateIds/includeIds/exclude classification.`)
  const includes = tableClass.includeIds
  assert(includes.every(id => typeof id === 'string' && /^[0-9a-f-]{36}$/i.test(id)) && new Set(includes).size === includes.length, `${tableContract.name}: includeIds must be unique UUIDs.`)
  const excluded = Object.entries(tableClass.exclude)
  for (const [id, value] of excluded) {
    assert(/^[0-9a-f-]{36}$/i.test(id), `${tableContract.name}: excluded keys must be UUIDs.`)
    assert(value && validExclusionReasons.has(value.reason) && typeof value.note === 'string' && value.note.trim().length >= 8, `${tableContract.name}: every excluded ID needs an allowed reason and review note.`)
  }
  assert(!includes.some(id => Object.hasOwn(tableClass.exclude, id)), `${tableContract.name}: an ID cannot be both included and excluded.`)
  const key = tableContract.key
  const candidates = candidateRows.map(row => String(row[key]))
  assert(new Set(candidates).size === candidates.length, `${tableContract.name}: duplicate source keys.`)
  assert(JSON.stringify([...tableClass.candidateIds].sort()) === JSON.stringify([...candidates].sort()), `${tableContract.name}: candidate UUID list is stale or differs from the source snapshot.`)
  const classified = new Set([...includes, ...excluded.map(([id]) => id)])
  assert(candidates.every(id => classified.has(id)), `${tableContract.name}: unclassified source candidates; export refused.`)
  assert([...classified].every(id => candidates.includes(id)), `${tableContract.name}: classification contains unknown/stale source IDs.`)
  return candidateRows.filter(row => includes.includes(String(row[key])))
}

export function validateReviewedBaseline(classification, migration) {
  assert(classification?.baselineStatus === 'PRE_CUTOVER_REVIEWED', 'Reviewed PRE_CUTOVER baseline is required.')
  assert(Array.isArray(classification.reviewedBlocks) && JSON.stringify(classification.reviewedBlocks) === JSON.stringify(['03','04','05','06','07','08','09','10','11']), 'Manual evidence for baseline blocks 03–11 is incomplete or out of order.')
  assert(Array.isArray(classification.block11Rows) && classification.block11Rows.length > 0, 'Sanitized block 11 metrics are required for reconciliation.')
  if (classification.block11Sha256) assert(classification.block11Sha256 === sha256(stableJson(classification.block11Rows)), 'Block 11 checksum does not match the reviewed aggregate rows.')
  const expected = classification.block03Counts
  assert(expected && typeof expected === 'object' && !Array.isArray(expected), 'Exact block 03 counts are required.')
  for (const table of migration.tables) {
    const value = expected[table.name]
    assert(Number.isSafeInteger(value) && value >= 0, `Block 03 count missing/invalid for ${table.name}.`)
  }
}

export function buildClassificationDraft({ mapping, migration, candidateIds, block03Counts, block11Rows, sourceSchemaFingerprint, openSessions, openSessionSales, baselineStatus }) {
  assert(baselineStatus === 'PRE_CUTOVER_REVIEWED', 'Original input baselineStatus must be exactly PRE_CUTOVER_REVIEWED before building a candidate draft.')
  const contract = validateExportContract(mapping, migration)
  const tables = {}
  for (const table of contract.tables) tables[table.name] = { candidateIds: candidateIds[table.name] ?? [], includeIds: [], exclude: {} }
  return {
    contractVersion: contract.version,
    classificationSchemaVersion,
    baselineStatus,
    classificationStatus: 'PENDING_MANUAL_REVIEW',
    reviewedBlocks: ['03','04','05','06','07','08','09','10','11'],
    block03Counts,
    block11Sha256: sha256(stableJson(block11Rows)),
    block11Rows,
    sourceSchemaFingerprint,
    pendingOpenCashSessions: openSessions,
    pendingSalesLinkedToOpenCash: openSessionSales,
    tables,
    notes: 'Technical UUID candidate list only. Classify every candidate by moving IDs to includeIds or exclude with reason/note; verify baseline manually before setting PRE_CUTOVER_REVIEWED.',
  }
}

export function validateApprovedClassification(classification, migration) {
  assert(classification?.classificationSchemaVersion === classificationSchemaVersion, `Classification schema version must be exactly ${classificationSchemaVersion}.`)
  assert(classification?.classificationStatus === 'APPROVED', 'Candidate classification must be explicitly APPROVED before export.')
  assert(typeof classification.sourceSchemaFingerprint === 'string' && /^[a-f0-9]{64}$/.test(classification.sourceSchemaFingerprint), 'Approved classification must carry a valid source schema fingerprint.')
  validateReviewedBaseline(classification, migration)
}

export function assertApprovedSourceFingerprint(approvedFingerprint, currentFingerprint) {
  assert(typeof approvedFingerprint === 'string' && /^[a-f0-9]{64}$/.test(approvedFingerprint), 'Approved source schema fingerprint is missing or malformed.')
  assert(typeof currentFingerprint === 'string' && /^[a-f0-9]{64}$/.test(currentFingerprint), 'Current source schema fingerprint is malformed.')
  assert(approvedFingerprint === currentFingerprint, 'Current source schema fingerprint differs from the approved classification; export blocked.')
}

export function evaluateDemoOnlyZeroRowCutover({ conditions, blockers, expectedBlockers }) {
  const requiredConditions = [
    'allCandidateKiosksExcluded', 'zeroIncludedRows', 'zeroUnresolvedRows', 'classificationApproved',
    'candidateCoverageComplete', 'kioskProvenanceApproved', 'packageReconciled', 'zeroMigrableRows',
    'allBlockersBelongToExcludedKiosks', 'noMigrableBlockerDependents', 'zeroOrphans', 'zeroCrossKiosk',
    'sourceSchemaMatches', 'checksumsMatch',
  ]
  const failedConditions = requiredConditions.filter(condition => conditions?.[condition] !== true)
  const blockerKeys = ['openSessions', 'linkedSales', 'linkedCashMovements']
  const mismatchedBlockers = blockerKeys.filter(key => !Number.isSafeInteger(blockers?.[key]) || blockers[key] !== expectedBlockers?.[key])
  const applicable = failedConditions.length === 0 && mismatchedBlockers.length === 0
  return {
    cutoverClass: applicable ? 'DEMO_ONLY_ZERO_ROW_CUTOVER_NOT_APPLICABLE' : 'OPERATIONAL_CUTOVER_REQUIRED',
    cashClosureRequirement: applicable ? 'NOT_APPLICABLE_DEMO_ONLY_SOURCE' : 'CUTOVER_BLOCKER',
    finalDataDeltaRequired: !applicable,
    finalDataExportRequired: !applicable,
    blockers: { ...blockers },
    failedConditions,
    mismatchedBlockers,
  }
}

export function validatePreCutoverBaseline(classification, actualCounts, migration) {
  validateReviewedBaseline(classification, migration)
  for (const table of migration.tables) assert(actualCounts[table.name] === classification.block03Counts[table.name], `${table.name}: source count differs from reviewed block 03 baseline.`)
}

export function buildExportPackage({ mapping, migration, rowsByTable, generatedAt, sourceSchemaFingerprint, classification = null }) {
  const contract = validateExportContract(mapping, migration)
  assert(typeof generatedAt === 'string' && !Number.isNaN(Date.parse(generatedAt)), 'generatedAt must be an ISO timestamp.')
  assert(typeof sourceSchemaFingerprint === 'string' && /^[a-f0-9]{64}$/.test(sourceSchemaFingerprint), 'Source schema fingerprint must be SHA-256.')
  const canonicalRowsByTable = Object.fromEntries(contract.tables.map(table => {
    const rows = rowsByTable[table.name] ?? []
    assert(Array.isArray(rows), `${table.name}: export rows must be an array.`)
    if (table.enabled === false) {
      assert(rows.length === 0, `${table.name}: disabled evidence payload cannot enter the export.`)
      return [table.name, []]
    }
    return [table.name, rows.map(row => canonicalizeTemporalRow(table, row))]
  }))
  for (const table of contract.tables) {
    if (table.enabled === false) continue
    for (const row of canonicalRowsByTable[table.name]) validateExactNumericStrings(table, row)
  }
  const sourceStockRows = canonicalRowsByTable.movimientos_stock ?? []
  canonicalRowsByTable.movimientos_stock = historicalRowsForTable(
    contract.tables.find(table => table.name === 'movimientos_stock'),
    canonicalRowsByTable.movimientos_stock ?? [],
  )
  validateExportRelationships(canonicalRowsByTable)
  const files = []
  const authMapping = []
  const allRows = {}
  for (const table of contract.tables) {
    if (table.enabled === false) continue
    const input = canonicalRowsByTable[table.name] ?? []
    if (table.countOnly) assert(input.length === 0, `${table.name}: empty-domain baseline changed; export blocked.`)
    const rows = [...input].map(row => {
      assert(row && typeof row === 'object' && !Array.isArray(row), `${table.name}: row must be an object.`)
      const keys = Object.keys(row)
      const outputColumns = table.name === 'movimientos_stock' ? [...table.columns, 'delta_stock'] : table.columns
      assert(keys.every(key => outputColumns.includes(key)), `${table.name}: source row contains a non-allowlisted column.`)
      assert(outputColumns.filter(column => !keys.includes(column)).length === 0, `${table.name}: source row is missing an allowlisted/derived column.`)
      for (const key of keys) assert(!prohibitedColumn.test(key), `${table.name}.${key}: prohibited export column.`)
      return stable(row)
    }).sort((left, right) => String(left[table.key]).localeCompare(String(right[table.key])))
    if (table.name === 'usuarios') {
      for (const row of rows) {
        assert(row.kiosco_id !== null && row.auth_user_id, 'NULL-kiosk or unmapped profile cannot enter the business export.')
        assert(['DUEÑO', 'CAJERO', 'VISOR'].includes(row.rol), 'SUPERADMIN/unknown profile role needs separate role approval.')
        authMapping.push({ legacy_business_user_id: row.id, old_auth_user_id: row.auth_user_id, profile_id: row.id, kiosco_id: row.kiosco_id, role: row.rol, new_auth_user_id: null, status: 'RECREATE_AUTH_REQUIRED' })
      }
    }
    const businessRows = table.name === 'usuarios' ? rows.map(({ auth_user_id, ...profile }) => profile) : rows
    const content = stableJson(businessRows)
    const filename = `${table.name}.json`
    const packageColumns = table.name === 'usuarios' ? table.columns.filter(column => column !== 'auth_user_id') : table.name === 'movimientos_stock' ? [...table.columns, 'delta_stock'] : table.columns
    files.push({ file: filename, table: table.name, row_count: businessRows.length, checksum_sha256: sha256(content), columns: packageColumns, disposition: table.disposition })
    allRows[filename] = content
  }
  const authContent = stableJson(authMapping.sort((a, b) => a.profile_id.localeCompare(b.profile_id)))
  files.push({ file: 'auth-mapping.json', table: 'auth_mapping', row_count: authMapping.length, checksum_sha256: sha256(authContent), columns: ['legacy_business_user_id','old_auth_user_id','profile_id','kiosco_id','role','new_auth_user_id','status'], disposition: 'SEPARATE_IDENTITY_MAPPING' })
  allRows['auth-mapping.json'] = authContent
  const contentHash = sha256(files.map(item => `${item.file}:${item.checksum_sha256}`).join('\n'))
  return {
    files: allRows,
    manifest: {
      contract_version: contract.version,
      generated_at: new Date(generatedAt).toISOString(),
      export_mode: contract.mode,
      PRE_CUTOVER: true,
      source_schema_fingerprint: sourceSchemaFingerprint,
      files,
      content_sha256: contentHash,
      reconciliation_metrics: reconciliationMetrics(canonicalRowsByTable, sourceStockRows),
      baseline_comparison: 'Compare exact exported metrics to reviewed block 11; sessions open and their linked sales are pending FINAL_CUTOVER, not silently normalized.',
      baseline_11_metrics: classification?.block11Rows ?? [],
      baseline_03_counts: classification?.block03Counts ?? {},
      classified_candidates: Object.fromEntries(contract.tables.map(table => {
        const disposition = classification?.tables?.[table.name]
        return [table.name, { candidates: disposition?.candidateIds?.length ?? 0, included: disposition?.includeIds?.length ?? 0, excluded: Object.keys(disposition?.exclude ?? {}).length }]
      })),
      auth_sessions_exported: 0,
      open_sessions_exported: 0,
      credentials_exported: 0,
      total_migrable_rows: files.filter(file => file.table !== 'auth_mapping').reduce((total, file) => total + file.row_count, 0),
      evidence_exported: false,
      evidence_omitted_relations: contract.tables.filter(table => table.enabled === false).map(table => table.name),
      excluded_relations: contract.excludedRelations,
      classification_status: 'APPROVED_IDS_REQUIRED_AND_VALIDATED',
    },
  }
}

function parseArgs(argv) {
  const [mode, ...rest] = argv
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    if (rest[index].startsWith('--')) {
      const key = rest[index].slice(2)
    if (['enable-pre-cutover-export', 'include-evidence', 'show-sql'].includes(key)) options[key] = true
      else options[key] = rest[++index]
    }
  }
  return { mode, options }
}

export function assertLegacySourceUrl(value, confirmedRef) {
  assert(confirmedRef === legacyRef, 'Confirm the exact legacy source ref with --confirm-source-ref; no other project is allowed.')
  assert(typeof value === 'string' && value.length > 0, 'F6_LEGACY_READONLY_DATABASE_URL is required; its value is never logged.')
  const url = new URL(value)
  assert(['postgres:', 'postgresql:'].includes(url.protocol), 'Only PostgreSQL source URLs are accepted.')
  assert(url.port === '5432' && url.pathname === '/postgres', 'Only PostgreSQL port 5432 and database postgres are permitted; transaction pooler and other databases are refused.')
  const sslmodes = url.searchParams.getAll('sslmode')
  assert(sslmodes.length === 1 && ['require', 'verify-full'].includes(sslmodes[0]), 'Legacy source connection must require TLS (sslmode=require or verify-full).')

  const hostname = url.hostname.toLowerCase()
  if (hostname === `db.${legacyRef}.supabase.co`) return url

  // Supabase Connect's shared Session Pooler endpoint format. Port 5432 and
  // postgres.<project-ref> identify Session mode; Transaction Pooler (6543)
  // is rejected above. The regional host alone does not identify a project.
  assert(/^aws-0-[a-z0-9]+(?:-[a-z0-9]+)*\.pooler\.supabase\.com$/.test(hostname), 'Only the legacy Direct host or an official Supabase Session Pooler host is permitted.')
  assert(decodeURIComponent(url.username) === `postgres.${legacyRef}`, 'Session Pooler username must identify the exact legacy project ref.')
  assert(sslmodes[0] === 'verify-full', 'Session Pooler requires sslmode=verify-full.')
  return url
}

function pathIsWithin(parent, candidate) {
  const relative = path.relative(parent, candidate)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export async function assertOutputPathAbsent(output, fsOps = { lstat }) {
  try {
    const existing = await fsOps.lstat(output)
    const kind = existing.isSymbolicLink() ? 'file link/junction' : existing.isDirectory() ? 'directory' : 'file'
    throw new Error(`Export output already exists as a ${kind}; refusing to reuse or overwrite it.`)
  } catch (error) {
    if (error?.code === 'ENOENT') return
    throw error
  }
}

export async function validateOutputDirectory(directory) {
  assert(typeof directory === 'string' && directory.length > 0, 'An output directory outside the repository is required.')
  const output = path.resolve(directory)
  const normalizedRoot = path.resolve(root).replace(/[\\/]+$/, '').toLowerCase()
  const normalizedOutput = output.replace(/[\\/]+$/, '').toLowerCase()
  assert(normalizedOutput !== normalizedRoot && !normalizedOutput.startsWith(`${normalizedRoot}${path.sep}`), 'Export output must be outside the repository to avoid staging business data.')
  await assertOutputPathAbsent(output)
  await mkdir(path.dirname(output), { recursive: true })
  const [canonicalRoot, canonicalParent] = await Promise.all([realpath(root), realpath(path.dirname(output))])
  assert(!pathIsWithin(canonicalRoot, canonicalParent), 'Export output parent resolves inside the repository; refusing to stage business data there.')
  await assertOutputPathAbsent(output)
  return output
}

function validateOutputFile(filename) {
  assert(typeof filename === 'string' && filename.length > 0, 'An output file outside the repository is required.')
  const output = path.resolve(filename)
  const normalizedRoot = path.resolve(root).replace(/[\\/]+$/, '').toLowerCase()
  const normalizedOutput = output.replace(/[\\/]+$/, '').toLowerCase()
  assert(normalizedOutput !== normalizedRoot && !normalizedOutput.startsWith(`${normalizedRoot}${path.sep}`), 'Export output must be outside the repository to avoid staging business data.')
  return output
}

async function schemaFingerprint(client, contract) {
  const relations = contract.tables.filter(table => !table.countOnly && table.enabled !== false)
  const result = await client.query(`SELECT table_name,column_name,data_type,udt_name,is_nullable,ordinal_position
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name = ANY($1::text[])
    ORDER BY table_name,ordinal_position`, [relations.map(table => table.name)])
  return fingerprintSchemaRows(result.rows, contract)
}

export function fingerprintSchemaRows(rows, contract) {
  const relations = contract.tables.filter(table => !table.countOnly && table.enabled !== false)
  const allowed = new Map(relations.map(table => [table.name, new Set(table.columns)]))
  const schema = rows.filter(row => allowed.get(row.table_name)?.has(row.column_name))
  for (const table of relations) {
    const found = new Set(schema.filter(row => row.table_name === table.name).map(row => row.column_name))
    assert(table.columns.every(column => found.has(column)), `${table.name}: source schema does not contain every contract column; export blocked.`)
  }
  return sha256(stableJson(schema))
}

export function validateExportPackage(packageArtifact, contract, classification = null) {
  assert(packageArtifact && packageArtifact.manifest && packageArtifact.files && typeof packageArtifact.files === 'object', 'Export package is incomplete.')
  const { manifest, files } = packageArtifact
  assert(manifest.PRE_CUTOVER === true && manifest.export_mode === 'PRE_CUTOVER_EXPORT', 'Package is not marked PRE_CUTOVER_EXPORT.')
  assert(typeof manifest.source_schema_fingerprint === 'string' && /^[a-f0-9]{64}$/.test(manifest.source_schema_fingerprint), 'Package source fingerprint is missing or malformed.')
  assert(manifest.evidence_exported === false && manifest.credentials_exported === 0 && manifest.auth_sessions_exported === 0, 'Package contains or enables prohibited evidence/credentials/Auth sessions.')
  const expectedNames = [...contract.tables.filter(table => table.enabled !== false).map(table => `${table.name}.json`), 'auth-mapping.json'].sort()
  assert(JSON.stringify(Object.keys(files).sort()) === JSON.stringify(expectedNames), 'Package file set differs from the approved export contract.')
  const manifestFiles = manifest.files
  assert(Array.isArray(manifestFiles) && manifestFiles.length === expectedNames.length, 'Package manifest file inventory is incomplete.')
  const byName = new Map(manifestFiles.map(item => [item.file, item]))
  assert(byName.size === expectedNames.length && expectedNames.every(name => byName.has(name)), 'Package manifest contains duplicate, missing, or unexpected files.')
  let totalMigrableRows = 0
  for (const name of expectedNames) {
    const content = files[name]
    assert(typeof content === 'string', `${name}: package content is missing.`)
    const rows = JSON.parse(content)
    assert(Array.isArray(rows), `${name}: package JSON must be an array.`)
    const metadata = byName.get(name)
    const checksum = sha256(content)
    assert(metadata.row_count === rows.length && metadata.checksum_sha256 === checksum, `${name}: row count or checksum does not match package content.`)
    if (name !== 'auth-mapping.json') {
      totalMigrableRows += rows.length
      const tableName = name.slice(0, -'.json'.length)
      if (classification) assert(rows.length === classification.tables?.[tableName]?.includeIds?.length, `${tableName}: exported row count differs from approved includeIds.`)
    }
  }
  assert(manifest.content_sha256 === sha256(manifestFiles.map(item => `${item.file}:${item.checksum_sha256}`).join('\n')), 'Package content checksum does not match the manifest.')
  assert(manifest.total_migrable_rows === totalMigrableRows, 'Manifest migrable row total does not match table files.')
  if (classification && Object.values(classification.tables).every(table => table.includeIds.length === 0)) {
    assert(totalMigrableRows === 0 && JSON.parse(files['auth-mapping.json']).length === 0, 'Zero-row classification produced business or Auth mapping rows.')
  }
  return { files: expectedNames.length, totalMigrableRows }
}

async function validateStagedExportPackage(staging, packageArtifact, contract, classification, fsOps) {
  const expectedNames = [...Object.keys(packageArtifact.files), 'manifest.json'].sort()
  const actualNames = (await fsOps.readdir(staging)).sort()
  assert(JSON.stringify(actualNames) === JSON.stringify(expectedNames), 'Temporary package directory contains missing or unexpected files.')
  const stagedFiles = {}
  for (const name of Object.keys(packageArtifact.files)) {
    const content = await fsOps.readFile(path.join(staging, name), 'utf8')
    assert(content === packageArtifact.files[name], `${name}: staged bytes differ from validated package content.`)
    stagedFiles[name] = content
  }
  const stagedManifest = JSON.parse(await fsOps.readFile(path.join(staging, 'manifest.json'), 'utf8'))
  assert(stableJson(stagedManifest) === stableJson(packageArtifact.manifest), 'Staged manifest differs from the validated package manifest.')
  validateExportPackage({ files: stagedFiles, manifest: stagedManifest }, contract, classification)
}

export async function writeExportPackageAtomically(output, packageArtifact, contract, classification = null, fsOps = { mkdtemp, writeFile, readFile, readdir, rename, rm }) {
  validateExportPackage(packageArtifact, contract, classification)
  await assertOutputPathAbsent(output)
  const staging = await fsOps.mkdtemp(path.join(path.dirname(output), '.kioskopos-c3a-'))
  try {
    for (const [filename, content] of Object.entries(packageArtifact.files)) await fsOps.writeFile(path.join(staging, filename), content, { flag: 'wx' })
    await fsOps.writeFile(path.join(staging, 'manifest.json'), stableJson(packageArtifact.manifest), { flag: 'wx' })
    await validateStagedExportPackage(staging, packageArtifact, contract, classification, fsOps)
    await assertOutputPathAbsent(output)
    await fsOps.rename(staging, output)
  } catch (error) {
    await fsOps.rm(staging, { recursive: true, force: true }).catch(() => {})
    throw error
  }
  return validateExportPackage(packageArtifact, contract, classification)
}

async function runClassifyOnly(options, mapping, migration, contract) {
  assert(options['enable-pre-cutover-export'] === true, 'Source classification requires the explicit --enable-pre-cutover-export opt-in.')
  const url = assertLegacySourceUrl(process.env.F6_LEGACY_READONLY_DATABASE_URL, options['confirm-source-ref'])
  const baseline = await readJson(path.resolve(options.baseline ?? ''))
  validateReviewedBaseline(baseline, migration)
  const output = validateOutputFile(options.output)
  const client = new Client({ connectionString: url.toString(), application_name: 'kioskopos-f6-c3a-readonly-classifier', statement_timeout: 60000, query_timeout: 65000 })
  try {
    await client.connect()
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const readOnly = await client.query('SHOW transaction_read_only')
    assert(readOnly.rows[0].transaction_read_only === 'on', 'Database did not enter a read-only transaction.')
    const actualCounts = {}
    for (const table of contract.tables) {
      const result = await client.query(`SELECT count(*)::bigint AS row_count FROM public.${qid(table.name)}`)
      actualCounts[table.name] = Number(result.rows[0].row_count)
    }
    for (const table of migration.tables) {
      if (!Object.hasOwn(actualCounts, table.name)) {
        assert(table.disposition === 'OMIT' || table.reason?.includes('Source relation absent'), `${table.name}: relation absent from export contract but not documented as absent.`)
        actualCounts[table.name] = 0
      }
    }
    validatePreCutoverBaseline(baseline, actualCounts, migration)
    const schemaHash = await schemaFingerprint(client, contract)
    const candidateIds = {}
    let sessionIds = []
    let saleIds = []
    let movementIds = []
    for (const table of contract.tables) {
      if (table.enabled === false || table.countOnly) { candidateIds[table.name] = []; continue }
      let dependencies = {}
      if (table.name === 'detalles_venta' || table.name === 'pagos_venta') dependencies = { saleIds }
      if (table.name === 'movimientos_caja') dependencies = { closedSessionIds: sessionIds }
      if (table.name === 'movimiento_stock_costos') dependencies = { stockMovementIds: movementIds }
      const query = buildSelectQuery(table, { ...dependencies, idOnly: true })
      const result = await client.query(query.text, query.values)
      candidateIds[table.name] = result.rows.map(row => String(row[table.key])).sort()
      if (table.name === 'sesiones_caja') sessionIds = candidateIds[table.name]
      if (table.name === 'ventas') saleIds = candidateIds[table.name]
      if (table.name === 'movimientos_stock') movementIds = candidateIds[table.name]
    }
    const openSessions = await client.query(`SELECT count(*)::bigint AS row_count FROM public."sesiones_caja" WHERE "estado" IS DISTINCT FROM 'CERRADA' OR "fecha_cierre" IS NULL`)
    const openSessionSales = await client.query(`SELECT count(*)::bigint AS row_count FROM public."ventas" AS v JOIN public."sesiones_caja" AS s ON s."id" = v."sesion_caja_id" WHERE s."estado" IS DISTINCT FROM 'CERRADA' OR s."fecha_cierre" IS NULL`)
    const openSessionCashMovements = await client.query(`SELECT count(*)::bigint AS row_count FROM public."movimientos_caja" AS m JOIN public."sesiones_caja" AS s ON s."id" = m."sesion_caja_id" WHERE s."estado" IS DISTINCT FROM 'CERRADA' OR s."fecha_cierre" IS NULL`)
    const nullKioskProfiles = await client.query(`SELECT count(*)::bigint AS row_count FROM public."usuarios" WHERE "kiosco_id" IS NULL`)
    assert(Number(openSessions.rows[0].row_count) === migration.openCashSessionsAtInventory, 'Open cash-session count differs from reviewed PRE baseline.')
    assert(Number(openSessionSales.rows[0].row_count) === migration.legacyPreCutoverBaseline.ventasLinkedToOpenCash, 'Sales pending open-session close differ from reviewed PRE baseline.')
    assert(Number(nullKioskProfiles.rows[0].row_count) === migration.profileWithNullKioscoId, 'Quarantined NULL-kiosk profile count differs from reviewed PRE baseline.')
    await client.query('ROLLBACK')
    const draft = buildClassificationDraft({
      mapping, migration, candidateIds, block03Counts: baseline.block03Counts, block11Rows: baseline.block11Rows,
      sourceSchemaFingerprint: schemaHash, openSessions: Number(openSessions.rows[0].row_count), openSessionSales: Number(openSessionSales.rows[0].row_count),
      baselineStatus: baseline.baselineStatus,
    })
    await mkdir(path.dirname(output), { recursive: true })
    await writeFile(output, stableJson(draft), { flag: 'wx' })
    console.log(`PASS: technical UUID classification draft created at ${output}; only explicit SELECTs in a READ ONLY transaction; no business rows exported.`)
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* transaction may not have started */ }
    throw error
  } finally {
    await client.end().catch(() => {})
  }
}

export async function runReadOnlyExport(options, mapping, migration, contract, { createClient = config => new Client(config) } = {}) {
  assert(options['enable-pre-cutover-export'] === true, 'Live export requires the explicit --enable-pre-cutover-export opt-in.')
  assert(options['include-evidence'] !== true, 'Evidence export is disabled pending separate privacy/invariant approval.')
  const url = assertLegacySourceUrl(process.env.F6_LEGACY_READONLY_DATABASE_URL, options['confirm-source-ref'])
  const output = await validateOutputDirectory(options.output)
  const classificationPath = path.resolve(options.classification ?? defaultClassification)
  const classification = await readJson(classificationPath)
  assert(classification.contractVersion === contract.version, 'Classification file contract version mismatch.')
  validateApprovedClassification(classification, migration)
  assert(typeof classification.block11Sha256 === 'string', 'Reviewed classification must carry the block 11 checksum.')
  const client = createClient({ connectionString: url.toString(), application_name: 'kioskopos-f6-c3a-readonly-export', statement_timeout: 60000, query_timeout: 65000 })
  const rowsByTable = {}
  try {
    await client.connect()
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    const readOnly = await client.query('SHOW transaction_read_only')
    assert(readOnly.rows[0].transaction_read_only === 'on', 'Database did not enter a read-only transaction.')
    const contract = validateExportContract(mapping, migration)
    const fingerprint = await schemaFingerprint(client, contract)
    assertApprovedSourceFingerprint(classification.sourceSchemaFingerprint, fingerprint)
    const actualCounts = {}
    for (const table of contract.tables) {
      const result = await client.query(`SELECT count(*)::bigint AS row_count FROM public.${qid(table.name)}`)
      actualCounts[table.name] = Number(result.rows[0].row_count)
    }
    for (const table of migration.tables) {
      if (!Object.hasOwn(actualCounts, table.name)) {
        assert(table.disposition === 'OMIT' || table.reason?.includes('Source relation absent'), `${table.name}: relation absent from export contract but not documented as absent.`)
        actualCounts[table.name] = 0
      }
    }
    validatePreCutoverBaseline(classification, actualCounts, migration)
    const closedSessionsTable = contract.tables.find(table => table.name === 'sesiones_caja')
    const closedSessionsQuery = buildSelectQuery(closedSessionsTable, { idOnly: true })
    const closedSessions = await client.query(closedSessionsQuery.text, closedSessionsQuery.values)
    const sessionIds = closedSessions.rows.map(row => String(row.id))
    for (const table of contract.tables) {
      if (table.enabled === false) { rowsByTable[table.name] = []; continue }
      if (table.countOnly) {
        const query = buildSelectQuery(table)
        const count = await client.query(query.text, query.values)
        assert(Number(count.rows[0].row_count) === 0, `${table.name}: expected empty domain changed; export blocked.`)
        rowsByTable[table.name] = []
        continue
      }
      const dependencies = approvedCandidateDependencies(table.name, classification, sessionIds)
      assert(Array.isArray(classification.tables?.[table.name]?.includeIds), `${table.name}: approved includeIds missing; export blocked.`)
      const query = buildSelectQuery(table, dependencies)
      const result = await client.query(query.text, query.values)
      const selected = validateClassification(classification, table, result.rows)
      if (table.name === 'usuarios') assert(selected.every(row => row.kiosco_id !== null), 'NULL-kiosk profile is quarantined and cannot be exported.')
      rowsByTable[table.name] = selected
    }
    const openSessions = await client.query(`SELECT count(*)::bigint AS row_count FROM public."sesiones_caja" WHERE "estado" IS DISTINCT FROM 'CERRADA' OR "fecha_cierre" IS NULL`)
    const openSessionSales = await client.query(`SELECT count(*)::bigint AS row_count FROM public."ventas" AS v JOIN public."sesiones_caja" AS s ON s."id" = v."sesion_caja_id" WHERE s."estado" IS DISTINCT FROM 'CERRADA' OR s."fecha_cierre" IS NULL`)
    const openSessionCashMovements = await client.query(`SELECT count(*)::bigint AS row_count FROM public."movimientos_caja" AS m JOIN public."sesiones_caja" AS s ON s."id" = m."sesion_caja_id" WHERE s."estado" IS DISTINCT FROM 'CERRADA' OR s."fecha_cierre" IS NULL`)
    const nullKioskProfiles = await client.query(`SELECT count(*)::bigint AS row_count FROM public."usuarios" WHERE "kiosco_id" IS NULL`)
    assert(Number(openSessions.rows[0].row_count) === migration.openCashSessionsAtInventory, 'Open cash-session count differs from reviewed PRE baseline.')
    assert(Number(openSessionSales.rows[0].row_count) === migration.legacyPreCutoverBaseline.ventasLinkedToOpenCash, 'Sales pending open-session close differ from reviewed PRE baseline.')
    assert(Number(nullKioskProfiles.rows[0].row_count) === migration.profileWithNullKioscoId, 'Quarantined NULL-kiosk profile count differs from reviewed PRE baseline.')
    await client.query('ROLLBACK')
    const result = buildExportPackage({ mapping, migration, rowsByTable, generatedAt: new Date().toISOString(), sourceSchemaFingerprint: fingerprint, classification })
    result.manifest.pending_open_cash_sessions = Number(openSessions.rows[0].row_count)
    result.manifest.pending_sales_linked_to_open_cash = Number(openSessionSales.rows[0].row_count)
    result.manifest.pending_cash_movements_linked_to_open_sessions = Number(openSessionCashMovements.rows[0].row_count)
    result.manifest.quarantined_null_kiosk_profiles = Number(nullKioskProfiles.rows[0].row_count)
    result.manifest.unprofiled_auth_users_included = 0
    result.manifest.source_row_counts = actualCounts
    result.manifest.block03_baseline_counts_sha256 = sha256(stableJson(classification.block03Counts))
    result.manifest.block11_baseline_sha256 = classification.block11Sha256
    const packageValidation = await writeExportPackageAtomically(output, result, contract, classification)
    assert(packageValidation.totalMigrableRows === 0 || result.manifest.total_migrable_rows === packageValidation.totalMigrableRows, 'Export package row total failed post-write validation.')
    console.log(`PASS: PRE_CUTOVER export package created at ${output}; source transaction was READ ONLY and rolled back.`)
    return result.manifest
  } catch (error) {
    try { await client.query('ROLLBACK') } catch { /* transaction may not have started */ }
    throw error
  } finally {
    await client.end().catch(() => {})
  }
}

async function main() {
  const { mode, options } = parseArgs(process.argv.slice(2))
  const [mapping, migration] = await Promise.all([readJson(mappingPath), readJson(migrationPath)])
  const contract = validateExportContract(mapping, migration)
  if (mode === 'VALIDATE_ONLY') {
    const generated = contract.tables.filter(table => table.enabled !== false).map(table => buildSelectQuery(table, {
      saleIds: [], closedSessionIds: [], stockMovementIds: [],
    }))
    assert(generated.every(query => /^SELECT\s+/i.test(query.text) && /\bFROM\s+public\./i.test(query.text) && !/SELECT\s+\*/i.test(query.text)), 'A generated statement is not an explicit SELECT.')
    const sqlTexts = generated.map(query => query.text).join('\n')
    assert(!/\b(INSERT|UPDATE|DELETE|MERGE|UPSERT|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i.test(sqlTexts), 'Exporter SQL contains a forbidden statement.')
    console.log(`PASS: C3A contract; ${contract.tables.length} relations, ${generated.length} explicit SELECT templates; no connection performed.`)
    if (options['show-sql'] === true) for (const query of generated) console.log(`${query.text};`)
  } else if (mode === 'CLASSIFY_ONLY') {
    await runClassifyOnly(options, mapping, migration, contract)
  } else if (mode === 'EXPORT_PRE_CUTOVER') {
    await runReadOnlyExport(options, mapping, migration, contract)
  } else {
    console.log('Usage: node scripts/f6-2d-c3a-exporter.mjs VALIDATE_ONLY [--show-sql] | CLASSIFY_ONLY --enable-pre-cutover-export --confirm-source-ref wlqujnwxrmksheubfrha --baseline <reviewed-json> --output <outside-repo-file> | EXPORT_PRE_CUTOVER --enable-pre-cutover-export --confirm-source-ref wlqujnwxrmksheubfrha --classification <reviewed-json> --output <outside-repo-dir>')
    process.exitCode = 2
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => { console.error(`BLOCKED: ${error.message}`); process.exitCode = 1 })
}
