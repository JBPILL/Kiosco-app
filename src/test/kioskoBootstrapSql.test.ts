// @vitest-environment node
// PGlite is an auxiliary parser/contract check; it is not real PostgreSQL or Supabase.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, expect, it } from 'vitest'

const root = 'supabase/bootstrap'
const db = new PGlite()

beforeAll(async () => {
  await db.exec(`
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE TABLE auth.users (id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
    $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$
      SELECT nullif(current_setting('request.jwt.claim.role',true),'')
    $$;
  `)

  const orderedFiles = [
    join(root, '001_domain.sql'),
    join(root, '002_identity_helpers.sql'),
    ...readdirSync(join(root, 'steps')).sort().map(name => join(root, 'steps', name)),
    join(root, '900_final_security.sql'),
  ]
  for (const file of orderedFiles) await db.exec(readFileSync(file, 'utf8'))
}, 120_000)

afterAll(async () => db.close())

it('creates the pilot schema and resolves physical combos to combo_items', async () => {
  const { rows } = await db.query<{ combo_items: string | null; items_combo: string | null; promo_items: string | null }>(`
    SELECT to_regclass('public.combo_items')::text AS combo_items,
      to_regclass('public.items_combo')::text AS items_combo,
      (SELECT data_type FROM information_schema.columns
        WHERE table_schema='public' AND table_name='promociones' AND column_name='items_combo') AS promo_items
  `)
  expect(rows[0]).toEqual({ combo_items: 'combo_items', items_combo: null, promo_items: 'jsonb' })

  const required = [
    'kioscos','usuarios','productos','combo_items','lotes_producto','sesiones_caja',
    'movimientos_caja','ventas','detalles_venta','pagos_venta','movimientos_stock',
    'clientes','movimientos_cuenta_corriente','checkout_manuales','checkout_manual_entradas',
    'checkout_manual_cancelaciones','anulaciones_venta_atomicas','producto_costos','movimiento_stock_costos',
  ]
  for (const table of required) {
    const result = await db.query<{ exists: boolean; rls: boolean }>(`
      SELECT c.oid IS NOT NULL AS exists,coalesce(c.relrowsecurity,false) AS rls
      FROM (SELECT to_regclass($1)::oid AS oid) x
      LEFT JOIN pg_class c ON c.oid=x.oid
    `, [`public.${table}`])
    expect(result.rows[0].exists, `${table} should exist`).toBe(true)
    expect(result.rows[0].rls, `${table} should have RLS enabled`).toBe(true)
  }
})

it('defines exactly one productos categoria foreign key to categorias', async () => {
  const { rows } = await db.query<{ constraint_count: number; delete_action: string | null }>(`
    SELECT count(*)::int AS constraint_count,
      max(c.confdeltype)::text AS delete_action
    FROM pg_constraint c
    WHERE c.contype = 'f'
      AND c.conrelid = 'public.productos'::regclass
      AND c.confrelid = 'public.categorias'::regclass
      AND c.conkey = ARRAY[(
        SELECT attnum FROM pg_attribute
        WHERE attrelid = 'public.productos'::regclass AND attname = 'categoria_id'
      )]::smallint[]
  `)
  expect(rows[0]).toEqual({ constraint_count: 1, delete_action: 'n' })
})

it('keeps checkout and annulment RPC privileges separated', async () => {
  const { rows } = await db.query<{
    service_confirm: boolean
    auth_confirm: boolean
    anon_confirm: boolean
    auth_annul: boolean
    anon_annul: boolean
    auth_insert_product: boolean
    auth_select_product: boolean
  }>(`
    SELECT has_function_privilege('service_role','public.confirmar_venta_manual(uuid,jsonb)','EXECUTE') AS service_confirm,
      has_function_privilege('authenticated','public.confirmar_venta_manual(uuid,jsonb)','EXECUTE') AS auth_confirm,
      has_function_privilege('anon','public.confirmar_venta_manual(uuid,jsonb)','EXECUTE') AS anon_confirm,
      has_function_privilege('authenticated','public.anular_venta_atomica(uuid,text,uuid)','EXECUTE') AS auth_annul,
      has_function_privilege('anon','public.anular_venta_atomica(uuid,text,uuid)','EXECUTE') AS anon_annul,
      has_table_privilege('authenticated','public.productos','INSERT') AS auth_insert_product,
      has_table_privilege('authenticated','public.productos','SELECT') AS auth_select_product
  `)
  expect(rows[0]).toEqual({
    service_confirm: true,
    auth_confirm: false,
    anon_confirm: false,
    auth_annul: true,
    anon_annul: false,
    auth_insert_product: false,
    auth_select_product: true,
  })
})

it('stores non-negative movement magnitudes and a signed stock delta for all movement types', async () => {
  const kiosk = '81000000-0000-0000-0000-000000000001'
  const products = [
    '82000000-0000-0000-0000-000000000001',
    '82000000-0000-0000-0000-000000000002',
    '82000000-0000-0000-0000-000000000003',
    '82000000-0000-0000-0000-000000000004',
    '82000000-0000-0000-0000-000000000005',
  ]
  await db.query('INSERT INTO public.kioscos(id,nombre) VALUES($1,$2)', [kiosk, 'TEST stock contract'])
  for (const [index, product] of products.entries()) {
    await db.query(
      'INSERT INTO public.productos(id,kiosco_id,descripcion,stock_actual) VALUES($1,$2,$3,10)',
      [product, kiosk, `TEST product ${index + 1}`],
    )
  }

  const lotes = [
    '83000000-0000-0000-0000-000000000001',
    '83000000-0000-0000-0000-000000000002',
  ]
  await db.query(`
    INSERT INTO public.lotes_producto(id,kiosco_id,producto_id,fecha_vencimiento,cantidad_inicial,cantidad_actual)
    VALUES ($1,$2,$3,'2027-01-01',6,6),($4,$2,$3,'2027-02-01',4,4)
  `, [lotes[0], kiosk, products[3], lotes[1]])
  await db.exec("SET request.jwt.claim.role='service_role'")

  const registrar = async (product: string, tipo: string, cantidad: number) => db.query<{
    stock_anterior: string
    stock_nuevo: string
    movimiento_id: string
  }>(`SELECT * FROM public.registrar_movimiento_stock($1::uuid,$2,$3::numeric,$4,NULL,NULL,NULL,NULL)`, [
    product, tipo, cantidad, 'TEST contrato cantidad/delta',
  ])

  const ingreso = await registrar(products[0], 'INGRESO', 3)
  const egreso = await registrar(products[1], 'EGRESO', 2)
  const ajusteSube = await registrar(products[2], 'AJUSTE', 15)
  const ajusteBaja = await registrar(products[3], 'AJUSTE', 4)
  expect(ingreso.rows[0]).toMatchObject({ stock_anterior: '10.000', stock_nuevo: '13.000' })
  expect(egreso.rows[0]).toMatchObject({ stock_anterior: '10.000', stock_nuevo: '8.000' })
  expect(ajusteSube.rows[0]).toMatchObject({ stock_anterior: '10.000', stock_nuevo: '15.000' })
  expect(ajusteBaja.rows[0]).toMatchObject({ stock_anterior: '10.000', stock_nuevo: '4.000' })

  await db.query(`
    INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo)
    VALUES
      ($1,$2,'EGRESO',2,'TEST checkout-shaped'),
      ($1,$2,'INGRESO',2,'TEST annulment-shaped'),
      ($1,$2,'AJUSTE',3,'TEST up-adjustment'),
      ($1,$2,'AJUSTE',-2,'TEST down-adjustment'),
      ($1,$2,'EGRESO',-1,'TEST legacy negative-egreso')
  `, [kiosk, products[4]])
  const directCompatibility = await db.query(`
    SELECT motivo,tipo,cantidad,delta_stock FROM public.movimientos_stock
    WHERE producto_id=$1 ORDER BY motivo
  `, [products[4]])
  expect(directCompatibility.rows).toEqual([
    { motivo: 'TEST annulment-shaped', tipo: 'INGRESO', cantidad: '2.000', delta_stock: '2.000' },
    { motivo: 'TEST checkout-shaped', tipo: 'EGRESO', cantidad: '2.000', delta_stock: '-2.000' },
    { motivo: 'TEST down-adjustment', tipo: 'AJUSTE', cantidad: '2.000', delta_stock: '-2.000' },
    { motivo: 'TEST legacy negative-egreso', tipo: 'EGRESO', cantidad: '1.000', delta_stock: '-1.000' },
    { motivo: 'TEST up-adjustment', tipo: 'AJUSTE', cantidad: '3.000', delta_stock: '3.000' },
  ])

  await db.exec('ALTER TABLE public.movimientos_stock DISABLE TRIGGER trg_normalizar_movimiento_stock')
  try {
    await expect(db.query(`
      INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,delta_stock,motivo)
      VALUES ($1,$2,'EGRESO',-1,-1,'TEST must fail CHECK')
    `, [kiosk, products[4]])).rejects.toThrow(/check constraint/i)
  } finally {
    await db.exec('ALTER TABLE public.movimientos_stock ENABLE TRIGGER trg_normalizar_movimiento_stock')
  }

  const movements = await db.query<{
    producto_id: string
    tipo: string
    cantidad: string
    delta_stock: string
  }>(`SELECT producto_id,tipo,cantidad,delta_stock FROM public.movimientos_stock
      WHERE kiosco_id=$1 AND producto_id<>$2 ORDER BY producto_id`, [kiosk, products[4]])
  expect(movements.rows).toEqual([
    { producto_id: products[0], tipo: 'INGRESO', cantidad: '3.000', delta_stock: '3.000' },
    { producto_id: products[1], tipo: 'EGRESO', cantidad: '2.000', delta_stock: '-2.000' },
    { producto_id: products[2], tipo: 'AJUSTE', cantidad: '5.000', delta_stock: '5.000' },
    { producto_id: products[3], tipo: 'AJUSTE', cantidad: '6.000', delta_stock: '-6.000' },
  ])

  const reconciliacion = await db.query<{ stock_actual: string; neto: string }>(`
    SELECT p.id,p.stock_actual,coalesce(sum(m.delta_stock),0) AS neto
    FROM public.productos p LEFT JOIN public.movimientos_stock m ON m.producto_id=p.id
    WHERE p.id=ANY($1::uuid[]) GROUP BY p.id ORDER BY p.id
  `, [products.slice(0, 4)])
  expect(reconciliacion.rows.map(row => Number(row.stock_actual) - Number(row.neto))).toEqual([10, 10, 10, 10])
  expect((await db.query<{ cantidad_actual: string }>(`SELECT cantidad_actual FROM public.lotes_producto WHERE id=$1`, [lotes[0]])).rows[0].cantidad_actual).toBe('0.000')
  expect((await db.query<{ cantidad_actual: string }>(`SELECT cantidad_actual FROM public.lotes_producto WHERE id=$1`, [lotes[1]])).rows[0].cantidad_actual).toBe('4.000')

  const constraint = await db.query<{ definition: string }>(`
    SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
    WHERE conrelid='public.movimientos_stock'::regclass AND conname='movimientos_stock_cantidad_check'
  `)
  expect(constraint.rows[0].definition).toMatch(/cantidad\s*>=\s*\(0\)::numeric/i)
})
