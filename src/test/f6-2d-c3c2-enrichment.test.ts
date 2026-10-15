// @vitest-environment node
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildEnrichmentSql } from '../../scripts/f6-2d-c3c2-enrichment.mjs'

const uuid = '6b0f5d8c-58a1-4f12-8d2a-9a5b68403a11'
const tableNames = [
  'kioscos','usuarios','categorias','productos','producto_costos','combo_items','promociones','lotes_producto',
  'sesiones_caja','ventas','detalles_venta','pagos_venta','movimientos_stock','movimiento_stock_costos','movimientos_caja',
  'clientes','movimientos_cuenta_corriente','proveedores','compras_proveedor','detalles_compra','pagos_proveedor',
  'checkout_manuales','anulaciones_venta_atomicas',
]

const legacyForeignKeys = [
  'anulaciones_venta_atomicas:kiosco_id>kioscos', 'anulaciones_venta_atomicas:venta_id>ventas',
  'categorias:kiosco_id>kioscos', 'checkout_manuales:kiosco_id>kioscos', 'checkout_manuales:venta_id>ventas',
  'clientes:kiosco_id>kioscos', 'combo_items:combo_producto_id>productos', 'combo_items:componente_producto_id>productos', 'combo_items:kiosco_id>kioscos',
  'compras_proveedor:kiosco_id>kioscos', 'compras_proveedor:proveedor_id>proveedores', 'compras_proveedor:sesion_caja_id>sesiones_caja', 'compras_proveedor:usuario_id>usuarios',
  'detalles_compra:compra_id>compras_proveedor', 'detalles_compra:producto_id>productos', 'detalles_venta:producto_id>productos', 'detalles_venta:venta_id>ventas',
  'lotes_producto:kiosco_id>kioscos', 'lotes_producto:producto_id>productos',
  'movimiento_stock_costos:kiosco_id>kioscos', 'movimiento_stock_costos:movimiento_id>movimientos_stock',
  'movimientos_caja:kiosco_id>kioscos', 'movimientos_caja:sesion_caja_id>sesiones_caja', 'movimientos_caja:usuario_id>usuarios',
  'movimientos_cuenta_corriente:cliente_id>clientes', 'movimientos_cuenta_corriente:kiosco_id>kioscos', 'movimientos_cuenta_corriente:usuario_id>usuarios', 'movimientos_cuenta_corriente:venta_id>ventas',
  'movimientos_stock:kiosco_id>kioscos', 'movimientos_stock:lote_producto_id>lotes_producto', 'movimientos_stock:producto_id>productos', 'movimientos_stock:usuario_id>usuarios',
  'pagos_proveedor:kiosco_id>kioscos', 'pagos_proveedor:proveedor_id>proveedores', 'pagos_proveedor:sesion_caja_id>sesiones_caja',
  'pagos_venta:venta_id>ventas', 'producto_costos:kiosco_id>kioscos', 'producto_costos:producto_id>productos',
  'productos:categoria_id>categorias', 'productos:kiosco_id>kioscos', 'productos:proveedor_id>proveedores',
  'promociones:categoria_id>categorias', 'promociones:kiosco_id>kioscos', 'promociones:producto_id>productos',
  'proveedores:kiosco_id>kioscos', 'sesiones_caja:kiosco_id>kioscos', 'sesiones_caja:usuario_id>usuarios', 'usuarios:kiosco_id>kioscos',
  'ventas:anulada_por>usuarios', 'ventas:kiosco_id>kioscos', 'ventas:sesion_caja_id>sesiones_caja', 'ventas:usuario_id>usuarios',
]

const mapping = JSON.parse(readFileSync(new URL('../../supabase/bootstrap/contract/source-destination-mapping.json', import.meta.url), 'utf8'))

function artifact() {
  return {
    contractVersion: 'F6.2D-C3A-1',
    tables: Object.fromEntries(tableNames.map(name => [name, { candidateIds: name === 'productos' ? [uuid] : [] }])),
  }
}

describe('F6.2D-C3C-2 local enrichment SQL generator', () => {
  it('generates bounded psql read-only SQL with one candidate UUID and rollback guards', () => {
    const sql = buildEnrichmentSql(artifact())
    expect(sql).toContain('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;')
    expect(sql).toContain('SHOW transaction_read_only \\gset')
    expect(sql).toContain('\\if :transaction_read_only')
    expect(sql.match(/ROLLBACK;/g)).toHaveLength(2)
    expect(sql).toContain(`'productos', '${uuid}'::uuid`)
    expect(sql).toContain("t.\"id\" = c.id")
    expect(sql).toContain("'ventas'::text AS entity")
    expect(sql).toContain("'usuarios'::text AS tertiary_parent_relation")
    expect(sql).toContain("'/SESSION:'")
    expect(sql).toContain('EXACT_SIGNATURE')
    expect(sql).toContain('AS matches_seed_signature')
    expect(sql).not.toMatch(/SELECT\s+\*/i)
    expect(sql).not.toMatch(/\b(INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|CALL|DO)\b/i)
    for (const forbidden of ['email','telefono','direccion','auth_user_id','pin_hash','solicitud','resultado','total','monto','precio','access_token','refresh_token']) {
      expect(sql).not.toMatch(new RegExp(`\\b${forbidden}\\b`, 'i'))
    }
  })

  it('fails closed on invalid candidate contract, unknown IDs, or malformed UUIDs', () => {
    expect(() => buildEnrichmentSql({ ...artifact(), contractVersion: 'old' })).toThrow(/contractVersion\/tables/)
    expect(() => buildEnrichmentSql({ ...artifact(), tables: { ...artifact().tables, unknown: { candidateIds: [uuid] } } })).toThrow(/Unknown candidate entity/)
    const invalid = artifact()
    invalid.tables.productos.candidateIds = ['not-a-uuid']
    expect(() => buildEnrichmentSql(invalid)).toThrow(/invalid candidate UUID/)
  })

  it('keeps kiosk seed labels inside predicates and returns only technical signature identifiers', () => {
    const sql = buildEnrichmentSql(artifact())
    expect(sql).toContain("t.nombre = 'Bazar y Hogar Prisma'")
    expect(sql).toContain("THEN 'SEED_BAZAR_PRISMA_V1' WHEN t.nombre = 'Kiosco y Almacén Don Pedro'")
    expect(sql).toContain("AS seed_signature_id")
    expect(sql).toContain("AS signature_strength")
    expect(sql).toContain("THEN 'HINT'::text")
    expect(sql).not.toContain('AS nombre')
    expect(sql).not.toContain('AS descripcion')
  })

  it('projects ventas.anulada_por only as the third technical FK to usuarios.id', () => {
    const sql = buildEnrichmentSql(artifact())
    const salesBranch = sql.split("SELECT 'ventas'::text AS entity")[1].split('UNION ALL')[0]
    expect(salesBranch).toContain("'usuarios'::text AS tertiary_parent_relation")
    expect(salesBranch).toContain('t.anulada_por::uuid AS tertiary_parent_id')
    expect(salesBranch.match(/t\.anulada_por::uuid/g)).toHaveLength(1)
    expect(salesBranch).not.toContain('anulada_por.nombre')
    expect(salesBranch).not.toContain('anulada_por.email')
  })

  it('represents all 52 real single-column FKs in mapping columns and dependencies', () => {
    expect(legacyForeignKeys).toHaveLength(52)
    const entries = new Map(mapping.entities.map((entry: { source: string }) => [entry.source, entry]))
    for (const edge of legacyForeignKeys) {
      const [source, remainder] = edge.split(':')
      const [column, target] = remainder.split('>')
      const entry = entries.get(source) as { columns: string[]; dependsOn: string[] } | undefined
      expect(entry, `${source} mapping entry`).toBeDefined()
      const mappedSourceColumns = entry!.columns.flatMap(value => value.split('→')[0].split(',').map(item => item.trim()))
      expect(mappedSourceColumns, `${edge} source column`).toContain(column)
      expect(entry!.dependsOn, `${edge} target dependency`).toContain(target)
    }
  })

  it('adds kiosk dependencies only to the seven entities with a real kiosco_id FK', () => {
    const addedKioskDependencies = ['anulaciones_venta_atomicas','compras_proveedor','movimiento_stock_costos','movimientos_caja','movimientos_cuenta_corriente','pagos_proveedor','producto_costos']
    for (const source of addedKioskDependencies) {
      const entry = mapping.entities.find((candidate: { source: string }) => candidate.source === source)
      expect(entry?.dependsOn).toContain('kioscos')
      expect(legacyForeignKeys).toContain(`${source}:kiosco_id>kioscos`)
    }
    const kioskForeignKeySources = [...new Set(legacyForeignKeys.filter(edge => edge.endsWith('>kioscos')).map(edge => edge.split(':')[0]))].sort()
    expect(kioskForeignKeySources).toHaveLength(19)
    expect(addedKioskDependencies.every(source => kioskForeignKeySources.includes(source))).toBe(true)
  })

  it('marks V2 seed matches as strong provisional evidence, never exact provenance', () => {
    const sql = buildEnrichmentSql(artifact())
    expect(sql).toContain("'STRONG_SEED_MATCH_V2'::text")
    expect(sql).toContain("THEN 'SEED_DON_PEDRO_V2'")
    expect(sql).toContain("THEN 'SEED_LIBRERIA_SOL_V2'")
    expect(sql).not.toContain('EXACT_SIGNATURE_V2')
    expect(sql).toContain('>= 2 THEN')
    expect(sql).not.toMatch(/COALESCE\([^\n]*V2[^\n]*\) IS NOT NULL AS matches_seed_signature/)
  })

  const reviewedDraftPath = process.env.F6_C3A_CANDIDATES_PATH
  it.skipIf(!reviewedDraftPath)('preserves the reviewed 942-position candidate set and cutover blockers', () => {
    const draft = JSON.parse(readFileSync(resolve(reviewedDraftPath!), 'utf8'))
    const candidateIds = Object.values(draft.tables).flatMap((entry: any) => entry.candidateIds)
    const sql = buildEnrichmentSql(draft)
    const sqlCandidateIds = [...sql.matchAll(/\('(?:[^']+)', '([0-9a-f-]{36})'::uuid\)/gi)].map(match => match[1])
    expect(Object.keys(draft.tables)).toHaveLength(23)
    expect(candidateIds).toHaveLength(942)
    expect(new Set(candidateIds).size).toBe(595)
    expect(sqlCandidateIds).toHaveLength(942)
    expect(new Set(sqlCandidateIds).size).toBe(595)
    expect(draft.tables.sesiones_caja.candidateIds).toHaveLength(3)
    expect(draft.tables.ventas.candidateIds).toHaveLength(14)
    expect(draft.pendingOpenCashSessions).toBe(4)
    expect(draft.pendingSalesLinkedToOpenCash).toBe(14)
    expect(draft.baselineStatus).toBe('PRE_CUTOVER_REVIEWED')
    expect(draft.classificationStatus).toBe('PENDING_MANUAL_REVIEW')
  })
})
