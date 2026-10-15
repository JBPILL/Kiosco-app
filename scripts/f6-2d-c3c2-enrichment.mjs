import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const seedSignatures = [
  { id: 'SEED_BAZAR_PRISMA_V1', kiosk: 'Bazar y Hogar Prisma', categoryCount: 9, categories: ['Sets y Promociones','Cocina y Vajilla','Utensilios y Cocción','Repostería y Moldes','Termos, Mates y Bebidas','Conservación y Herméticos','Organización y Limpieza','Decoración y Regalería','Baño y Textiles'], productCount: 48, barcodes: ['7792001001014','7792001001021','7792001001038'] },
  { id: 'SEED_DON_PEDRO_V1', kiosk: 'Kiosco y Almacén Don Pedro', categoryCount: 9, categories: ['Combos y Promociones','Golosinas y Alfajores','Galletitas y Snacks','Bebidas sin Alcohol','Cervezas y Bebidas Alcohólicas','Almacén Básico','Fiambrería y Quesos','Congelados','Cigarrillos, Pilas y Varios'], productCount: 97, barcodes: ['7790580200012','7790580200029','7790580200036'] },
  { id: 'SEED_LIBRERIA_SOL_V1', kiosk: 'Librería y Papelera Sol', categoryCount: 9, categories: ['Combos y Promociones','Cuadernos y Carpetas','Útiles Escolares','Escritura','Papelería y Hojas','Arte y Manualidades','Tecnología y Accesorios','Cartuchería e Impresión','Mochilas y Accesorios'], productCount: 99, barcodes: ['7790001000010','7790001000027','7790001000034'] },
  { id: 'SEED_MAXIKIOSCO_MARCHELO_V1', kiosk: 'Maxikiosco & Heladería Marchelo', categoryCount: 8, categories: ['Combos y Promociones','Helados Marchelo','Panizados La Reina','Gaseosas y Bebidas','Almacén y Comestibles','Fiambrería y Quesos','Golosinas y Snacks','Cigarrillos y Varios'], productCount: 73, barcodes: ['7798001000010','7798001000027','7798001000034'] },
  { id: 'SEED_SAN_CAYETANO_V1', kiosk: 'Kiosco & Almacén San Cayetano', categoryCount: 7, categories: ['Combos del Kiosco','Bebidas y Cervezas (Retornables)','Fiambrería y Balanza','Golosinas, Alfajores y Snacks','Almacén y Panificados','Cigarrillos y Tabaco','Limpieza y Kiosco Diario'], productCount: 41, barcodes: ['7792798000014','7790895000508','7792798000021'] },
  { id: 'SEED_VETERINARIA_HUELLAS_V1', kiosk: 'Veterinaria y Pet Shop Huellas', categoryCount: 10, categories: ['Combos y Promociones','Alimentos para Perros','Alimentos para Gatos','Alimentos a Granel (x Kg)','Farmacia y Antiparasitarios','Higiene y Peluquería','Paseo, Collares y Correas','Juguetes y Rascadores','Premios y Snacks','Servicios Veterinarios'], productCount: 46, barcodes: ['7791234001010','7791234001027','7791234001034'] },
]

// V2 is intentionally provisional. The local seeds establish that these
// markers belong to their seed files, but the fixture registry is incomplete
// and does not prove that no real legacy data could collide with them.
const strongSeedSignaturesV2 = [
  { id: 'SEED_DON_PEDRO_V2', kioskId: '614a2e8c-2488-4caa-a95a-22a04db115b8', category: 'Golosinas y Alfajores', barcodes: ['7790580200012','7790580200029','7790580200036'] },
  { id: 'SEED_LIBRERIA_SOL_V2', kioskId: 'b62cdaa7-ce1a-43b6-a1f9-17a3fc89d38b', category: 'Cuadernos y Carpetas', barcodes: ['7790001000010','7790001000027','7790001000034'] },
]

const relations = [
  ['kioscos','id'], ['usuarios','id'], ['categorias','id'], ['productos','id'], ['producto_costos','producto_id'],
  ['combo_items','id'], ['promociones','id'], ['lotes_producto','id'], ['sesiones_caja','id'], ['ventas','id'],
  ['detalles_venta','id'], ['pagos_venta','id'], ['movimientos_stock','id'], ['movimiento_stock_costos','movimiento_id'],
  ['movimientos_caja','id'], ['clientes','id'], ['movimientos_cuenta_corriente','id'], ['proveedores','id'],
  ['compras_proveedor','id'], ['detalles_compra','id'], ['pagos_proveedor','id'], ['checkout_manuales','id'],
  ['anulaciones_venta_atomicas','venta_id'],
]

const branch = (table, key, { kiosk = null, parent = null, parent2 = null, parent3 = null, state = null, closed = null, user = false, signature = false } = {}) => {
  const value = (column, cast) => column ? `t.${column}::${cast}` : `NULL::${cast}`
  const signatureExpr = signature ? signatureSql() : 'NULL::text'
  const signatureV2Expr = signature ? signatureSqlV2() : 'NULL::text'
  const hintExpr = signature ? signatureHintSql() : 'NULL::text'
  const from = table === 'ventas'
    ? `FROM public."${table}" t JOIN candidates c ON c.entity = '${table}' AND t."${key}" = c.id LEFT JOIN public."sesiones_caja" s ON s.id = t.sesion_caja_id`
    : `FROM public."${table}" t JOIN candidates c ON c.entity = '${table}' AND t."${key}" = c.id`
  const recordState = table === 'ventas' ? `CASE WHEN t.sesion_caja_id IS NULL THEN t.estado::text ELSE t.estado::text || '/SESSION:' || COALESCE(s.estado::text, 'MISSING') END` : value(state, 'text')
  const closedAt = table === 'ventas' ? 's.fecha_cierre::timestamptz' : value(closed, 'timestamptz')
  return `SELECT '${table}'::text AS entity, t.${key}::uuid AS id, ${value(kiosk, 'uuid')} AS kiosco_id, ${parent ? `'${parent[0]}'::text` : 'NULL::text'} AS parent_relation, ${value(parent?.[1], 'uuid')} AS parent_id, ${parent2 ? `'${parent2[0]}'::text` : 'NULL::text'} AS secondary_parent_relation, ${value(parent2?.[1], 'uuid')} AS secondary_parent_id, ${parent3 ? `'${parent3[0]}'::text` : 'NULL::text'} AS tertiary_parent_relation, ${value(parent3?.[1], 'uuid')} AS tertiary_parent_id, ${recordState} AS record_state, ${closedAt} AS closed_at, ${user ? 't.es_superadmin::boolean' : 'NULL::boolean'} AS es_superadmin, ${user ? 't.activo::boolean' : 'NULL::boolean'} AS activo, ${user ? 't.rol::text' : 'NULL::text'} AS rol, ${signatureExpr} IS NOT NULL AS matches_seed_signature, COALESCE(${signatureExpr}, ${signatureV2Expr}, ${hintExpr}) AS seed_signature_id, CASE WHEN ${signatureExpr} IS NOT NULL THEN 'EXACT_SIGNATURE'::text WHEN ${signatureV2Expr} IS NOT NULL THEN 'STRONG_SEED_MATCH_V2'::text WHEN ${hintExpr} IS NOT NULL THEN 'HINT'::text ELSE NULL::text END AS signature_strength ${from}`
}

function quoteLiteral(value) { return `'${value.replaceAll("'", "''")}'` }

function signatureSql() {
  const clauses = seedSignatures.map(signature => {
    const categories = signature.categories.map(quoteLiteral).join(', ')
    const barcodes = signature.barcodes.map(quoteLiteral).join(', ')
    return `WHEN t.nombre = ${quoteLiteral(signature.kiosk)} AND (SELECT count(*) FROM public.categorias c WHERE c.kiosco_id = t.id) = ${signature.categoryCount} AND (SELECT count(DISTINCT c.nombre) FROM public.categorias c WHERE c.kiosco_id = t.id AND c.nombre IN (${categories})) = ${signature.categoryCount} AND NOT EXISTS (SELECT 1 FROM public.categorias c WHERE c.kiosco_id = t.id AND c.nombre NOT IN (${categories})) AND (SELECT count(*) FROM public.productos p WHERE p.kiosco_id = t.id) = ${signature.productCount} AND (SELECT count(DISTINCT p.codigo_barras) FROM public.productos p WHERE p.kiosco_id = t.id AND p.codigo_barras IN (${barcodes})) = ${signature.barcodes.length} THEN ${quoteLiteral(signature.id)}`
  })
  return `(CASE ${clauses.join(' ')} ELSE NULL END)`
}

function signatureHintSql() {
  const clauses = seedSignatures.map(signature => `WHEN t.nombre = ${quoteLiteral(signature.kiosk)} THEN ${quoteLiteral(signature.id)}`)
  return `(CASE ${clauses.join(' ')} ELSE NULL END)`
}

function signatureSqlV2() {
  const clauses = strongSeedSignaturesV2.map(signature => {
    const barcodes = signature.barcodes.map(quoteLiteral).join(', ')
    return `WHEN t.id = '${signature.kioskId}'::uuid AND EXISTS (SELECT 1 FROM public.categorias c WHERE c.kiosco_id = t.id AND c.nombre = ${quoteLiteral(signature.category)}) AND (SELECT count(DISTINCT p.codigo_barras) FROM public.productos p WHERE p.kiosco_id = t.id AND p.codigo_barras IN (${barcodes})) >= 2 THEN ${quoteLiteral(signature.id)}`
  })
  return `(CASE ${clauses.join(' ')} ELSE NULL END)`
}

const branches = [
  branch('kioscos','id',{signature:true}),
  branch('usuarios','id',{kiosk:'kiosco_id',user:true}),
  branch('categorias','id',{kiosk:'kiosco_id'}),
  branch('productos','id',{kiosk:'kiosco_id',parent:['categorias','categoria_id'],parent2:['proveedores','proveedor_id']}),
  branch('producto_costos','producto_id',{kiosk:'kiosco_id',parent:['productos','producto_id']}),
  branch('combo_items','id',{kiosk:'kiosco_id',parent:['productos','combo_producto_id'],parent2:['productos','componente_producto_id']}),
  branch('promociones','id',{kiosk:'kiosco_id',parent:['productos','producto_id'],parent2:['categorias','categoria_id']}),
  branch('lotes_producto','id',{kiosk:'kiosco_id',parent:['productos','producto_id']}),
  branch('sesiones_caja','id',{kiosk:'kiosco_id',parent:['usuarios','usuario_id'],state:'estado',closed:'fecha_cierre'}),
  branch('ventas','id',{kiosk:'kiosco_id',parent:['usuarios','usuario_id'],parent2:['sesiones_caja','sesion_caja_id'],parent3:['usuarios','anulada_por'],state:'estado'}),
  branch('detalles_venta','id',{parent:['ventas','venta_id'],parent2:['productos','producto_id']}),
  branch('pagos_venta','id',{parent:['ventas','venta_id']}),
  branch('movimientos_stock','id',{kiosk:'kiosco_id',parent:['productos','producto_id'],parent2:['lotes_producto','lote_producto_id'],parent3:['usuarios','usuario_id']}),
  branch('movimiento_stock_costos','movimiento_id',{kiosk:'kiosco_id',parent:['movimientos_stock','movimiento_id']}),
  branch('movimientos_caja','id',{kiosk:'kiosco_id',parent:['sesiones_caja','sesion_caja_id'],parent2:['usuarios','usuario_id']}),
  branch('clientes','id',{kiosk:'kiosco_id'}),
  branch('movimientos_cuenta_corriente','id',{kiosk:'kiosco_id',parent:['clientes','cliente_id'],parent2:['ventas','venta_id'],parent3:['usuarios','usuario_id']}),
  branch('proveedores','id',{kiosk:'kiosco_id'}),
  branch('compras_proveedor','id',{kiosk:'kiosco_id',parent:['proveedores','proveedor_id'],parent2:['sesiones_caja','sesion_caja_id'],parent3:['usuarios','usuario_id']}),
  branch('detalles_compra','id',{parent:['compras_proveedor','compra_id'],parent2:['productos','producto_id']}),
  branch('pagos_proveedor','id',{kiosk:'kiosco_id',parent:['proveedores','proveedor_id'],parent2:['sesiones_caja','sesion_caja_id']}),
  branch('checkout_manuales','id',{kiosk:'kiosco_id',parent:['ventas','venta_id']}),
  branch('anulaciones_venta_atomicas','venta_id',{kiosk:'kiosco_id',parent:['ventas','venta_id']}),
]

export function buildEnrichmentSql(candidateArtifact) {
  if (candidateArtifact?.contractVersion !== 'F6.2D-C3A-1' || !candidateArtifact.tables || typeof candidateArtifact.tables !== 'object') {
    throw new Error('Candidate artifact contractVersion/tables are invalid.')
  }
  const allowedTables = new Set(relations.map(([table]) => table))
  for (const table of Object.keys(candidateArtifact.tables)) {
    if (!allowedTables.has(table)) throw new Error(`Unknown candidate entity ${table}.`)
  }
  const values = []
  for (const [table, key] of relations) {
    const entry = candidateArtifact.tables[table]
    if (!entry || !Array.isArray(entry.candidateIds)) throw new Error(`${table}: candidateIds must be an array.`)
    const ids = [...new Set(entry.candidateIds)]
    for (const id of ids) {
      if (typeof id !== 'string' || !uuidPattern.test(id)) throw new Error(`${table}: invalid candidate UUID.`)
      values.push(`(${quoteLiteral(table)}, '${id.toLowerCase()}'::uuid)`)
    }
    if (entry.key !== undefined && entry.key !== key) throw new Error(`${table}: candidate key differs from the allowlisted mapping key.`)
  }
  const candidateValues = values.length ? `VALUES\n  ${values.join(',\n  ')}` : `SELECT NULL::text, NULL::uuid WHERE false`
  const query = branches.join('\nUNION ALL\n')
  return [
    '\\set ON_ERROR_STOP on',
    'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;',
    'SHOW transaction_read_only \\gset',
    '\\if :transaction_read_only',
    `WITH candidates(entity, id) AS (${candidateValues})\n${query}\nORDER BY entity, id;`,
    '\\else',
    "\\echo BLOCKED: transaction_read_only is not on; no enrichment SELECT was run.",
    'ROLLBACK;',
    '\\quit 3',
    '\\endif',
    'ROLLBACK;',
    '',
  ].join('\n')
}

async function main() {
  const candidatePath = process.argv[2]
  if (!candidatePath) throw new Error('Usage: node scripts/f6-2d-c3c2-enrichment.mjs <c3a-candidates.json> > enrichment-read-only.sql')
  const artifact = JSON.parse(await readFile(path.resolve(candidatePath), 'utf8'))
  process.stdout.write(buildEnrichmentSql(artifact))
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch(error => { console.error(`BLOCKED: ${error.message}`); process.exitCode = 1 })
}
