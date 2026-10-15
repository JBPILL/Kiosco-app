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
    'kioscos','usuarios','platform_initial_admin_bootstrap_state','productos','combo_items','lotes_producto','sesiones_caja',
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

it('keeps the one-time initial-admin state empty and inaccessible to API roles', async () => {
  const result = await db.query<{ rows: number; rls: boolean; anon_select: boolean; authenticated_select: boolean; service_update: boolean }>(`
    SELECT (SELECT count(*)::int FROM public.platform_initial_admin_bootstrap_state) AS rows,
      (SELECT c.relrowsecurity FROM pg_class c WHERE c.oid='public.platform_initial_admin_bootstrap_state'::regclass) AS rls,
      has_table_privilege('anon','public.platform_initial_admin_bootstrap_state','SELECT') AS anon_select,
      has_table_privilege('authenticated','public.platform_initial_admin_bootstrap_state','SELECT') AS authenticated_select,
      has_table_privilege('service_role','public.platform_initial_admin_bootstrap_state','UPDATE') AS service_update
  `)
  expect(result.rows[0]).toEqual({ rows: 0, rls: true, anon_select: false, authenticated_select: false, service_update: false })
})

it('runs clean-target preflight and structural postflight SQL', async () => {
  const clean = new PGlite()
  try {
    const preflight = readFileSync(join(root, 'preflight.sql'), 'utf8')
      .replace(/^\\set.*$/gm, '')
      .replace(/:'expected_ref'/g, "''")
      .replace(/:'actual_ref'/g, "''")
    await clean.exec(preflight)
  } finally {
    await clean.close()
  }
  const postflight = readFileSync(join(root, 'postflight.sql'), 'utf8')
    .replace(/^\\set.*$/gm, '')
    .replace(/:'expected_ref'/g, "''")
    .replace(/:'actual_ref'/g, "''")
  await db.exec(postflight)
})
it('covers application relations, required RPCs, and write boundaries', async () => {
  const relations = [
    'proveedores','compras_proveedor','detalles_compra','pagos_proveedor','movimientos_proveedor','tickets_soporte',
    'operaciones_stock','electronica_unidades','electronica_reparaciones','electronica_solicitudes',
  ]
  for (const relation of relations) {
    const result = await db.query<{ exists: boolean; rls: boolean }>(`
      SELECT c.oid IS NOT NULL AS exists,coalesce(c.relrowsecurity,false) AS rls
      FROM (SELECT to_regclass($1)::oid AS oid) x LEFT JOIN pg_class c ON c.oid=x.oid
    `, [`public.${relation}`])
    expect(result.rows[0], relation).toEqual({ exists: true, rls: true })
  }
  const privileges = await db.query<{ stock_insert: boolean; provider_insert: boolean; purchase_insert: boolean; ticket_insert: boolean; stock_rpc: boolean; drawer_request: boolean; drawer_result: boolean; report: boolean; backup: boolean; restore_combo: boolean; electronics_unit: boolean; electronics_repair: boolean; cash_open: boolean; cash_move: boolean; cash_close: boolean; supplier_crud_rpc: boolean; purchase_rpc: boolean; supplier_payment: boolean; account_rpc: boolean; product_rpc: boolean; support_rpc: boolean; supplier_balance_column_update: boolean }>(`
    SELECT has_table_privilege('authenticated','public.movimientos_stock','INSERT') AS stock_insert,
      has_table_privilege('authenticated','public.proveedores','INSERT') AS provider_insert,
      has_table_privilege('authenticated','public.compras_proveedor','INSERT') AS purchase_insert,
      has_table_privilege('authenticated','public.tickets_soporte','INSERT') AS ticket_insert,
      has_function_privilege('authenticated','public.registrar_movimiento_stock_idempotente(uuid,uuid,text,numeric,text,text,date,text,uuid)','EXECUTE') AS stock_rpc,
      has_function_privilege('authenticated','public.solicitar_apertura_manual_cajon(uuid,text)','EXECUTE') AS drawer_request,
      has_function_privilege('authenticated','public.registrar_resultado_apertura_cajon(uuid,text)','EXECUTE') AS drawer_result,
      has_function_privilege('authenticated','public.resumir_bajas_stock(uuid,date,date)','EXECUTE') AS report,
      has_function_privilege('authenticated','public.generar_snapshot_backup_ampliado(uuid)','EXECUTE') AS backup,
      has_function_privilege('authenticated','public.restaurar_combo_backup(uuid,uuid,boolean,jsonb)','EXECUTE') AS restore_combo,
      has_function_privilege('authenticated','public.electronica_registrar_unidad(uuid,uuid,text,text,date,text)','EXECUTE') AS electronics_unit,
      has_function_privilege('authenticated','public.electronica_guardar_reparacion(uuid,uuid,integer,jsonb)','EXECUTE') AS electronics_repair,
      has_function_privilege('authenticated','public.abrir_sesion_caja_transaccional(uuid,numeric)','EXECUTE') AS cash_open,
      has_function_privilege('authenticated','public.registrar_movimiento_caja_transaccional(uuid,uuid,text,text,numeric,text)','EXECUTE') AS cash_move,
      has_function_privilege('authenticated','public.cerrar_sesion_caja_transaccional(uuid,uuid,numeric)','EXECUTE') AS cash_close,
      has_function_privilege('authenticated','public.guardar_proveedor_transaccional(uuid,uuid,jsonb)','EXECUTE') AS supplier_crud_rpc,
      has_function_privilege('authenticated','public.registrar_compra_proveedor_transaccional(uuid,uuid,timestamptz,text,text,boolean,uuid,text,numeric,jsonb)','EXECUTE') AS purchase_rpc,
      has_function_privilege('authenticated','public.registrar_pago_proveedor_transaccional(uuid,uuid,numeric,text,uuid,text,text)','EXECUTE') AS supplier_payment,
      has_function_privilege('authenticated','public.registrar_movimiento_cuenta_corriente_transaccional(uuid,uuid,uuid,text,numeric,text,text,uuid)','EXECUTE') AS account_rpc,
      has_function_privilege('authenticated','public.guardar_producto_transaccional(uuid,uuid,jsonb)','EXECUTE') AS product_rpc,
      has_function_privilege('authenticated','public.crear_ticket_soporte_transaccional(uuid,text,text,text,jsonb)','EXECUTE') AS support_rpc,
      has_column_privilege('authenticated','public.proveedores','saldo_pendiente','UPDATE') AS supplier_balance_column_update
  `)
  expect(privileges.rows[0]).toEqual({ stock_insert: false, provider_insert: false, purchase_insert: false,
    ticket_insert: false, stock_rpc: true, drawer_request: true, drawer_result: true, report: true,
    backup: true, restore_combo: true, electronics_unit: true, electronics_repair: true, cash_open: true,
    cash_move: true, cash_close: true, supplier_crud_rpc: true, purchase_rpc: true, supplier_payment: true, account_rpc: true,
    product_rpc: true, support_rpc: true, supplier_balance_column_update: false })
})

it('applies purchase, cash and customer-credit operations atomically and idempotently', async () => {
  const kiosk = 'a1000000-0000-0000-0000-000000000001'
  const otherKiosk = 'a1000000-0000-0000-0000-000000000002'
  const authId = 'a2000000-0000-0000-0000-000000000001'
  const userId = 'a3000000-0000-0000-0000-000000000001'
  const providerId = 'a4000000-0000-0000-0000-000000000001'
  const product1 = 'a5000000-0000-0000-0000-000000000001'
  const product2 = 'a5000000-0000-0000-0000-000000000002'
  const product3 = 'a5000000-0000-0000-0000-000000000003'
  const customerId = 'a6000000-0000-0000-0000-000000000001'
  const otherCustomerId = 'a6000000-0000-0000-0000-000000000002'
  const purchaseOp = 'a7000000-0000-0000-0000-000000000001'
  const failedPurchaseOp = 'a7000000-0000-0000-0000-000000000002'
  const openOp = 'a8000000-0000-0000-0000-000000000001'
  const movementOp = 'a8000000-0000-0000-0000-000000000002'
  const closeOp = 'a8000000-0000-0000-0000-000000000003'
  const ccOp = 'a9000000-0000-0000-0000-000000000001'
  const ccConflictOp = 'a9000000-0000-0000-0000-000000000002'
  const providerSaveOp = 'aa000000-0000-0000-0000-000000000001'
  const stockOp = 'ab000000-0000-0000-0000-000000000001'
  const sessionId = openOp

  await db.query('INSERT INTO auth.users(id) VALUES($1)', [authId])
  await db.query('INSERT INTO public.kioscos(id,nombre) VALUES($1,$2),($3,$4)', [kiosk,'TEST tx',otherKiosk,'TEST other'])
  await db.query("INSERT INTO public.usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'TEST owner','DUEÑO')", [userId,authId,kiosk])
  await db.query('INSERT INTO public.proveedores(id,kiosco_id,nombre) VALUES($1,$2,$3)', [providerId,kiosk,'TEST supplier'])
  await db.query("INSERT INTO public.productos(id,kiosco_id,descripcion,precio_costo,stock_actual) VALUES($1,$2,'TEST one',0,0),($3,$2,'TEST two',0,0),($4,$5,'TEST foreign',0,0)", [product1,kiosk,product2,product3,otherKiosk])
  await db.query("INSERT INTO public.clientes(id,kiosco_id,nombre,saldo_deudor) VALUES($1,$2,'TEST customer',20),($3,$4,'TEST cross',0)", [customerId,kiosk,otherCustomerId,otherKiosk])
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [authId])

  const providerBody = { nombre: 'Proveedor actualizado', contacto_nombre: 'Contacto', activo: true }
  const savedProvider = await db.query('SELECT public.guardar_proveedor_transaccional($1,$2,$3::jsonb)', [providerSaveOp,providerId,JSON.stringify(providerBody)])
  expect((await db.query('SELECT public.guardar_proveedor_transaccional($1,$2,$3::jsonb)', [providerSaveOp,providerId,JSON.stringify(providerBody)])).rows[0]).toEqual(savedProvider.rows[0])
  await expect(db.query('SELECT public.guardar_proveedor_transaccional($1,$2,$3::jsonb)', [providerSaveOp,providerId,JSON.stringify({ ...providerBody, nombre: 'Conflicto' })])).rejects.toThrow('El identificador ya corresponde a otra operación')
  await expect(db.query('SELECT public.guardar_proveedor_transaccional($1,$2,$3::jsonb)', ['aa000000-0000-0000-0000-000000000002',providerId,JSON.stringify({ ...providerBody, saldo_pendiente: 0 })])).rejects.toThrow('Datos de proveedor inválidos')

  const line = (productId: string, quantity: number, cost: number) => ({ producto_id: productId, cantidad: quantity, precio_costo_unitario: cost })
  const compra = async (operation: string, details: unknown[], total: number) => db.query<{ registrar_compra_proveedor_transaccional: { compra_id: string; total: number } }>(`
    SELECT public.registrar_compra_proveedor_transaccional($1,$2,'2026-10-12T00:00:00Z','F6.2B.1','CUENTA_CORRIENTE',false,NULL,'prueba',$3,$4::jsonb)
  `, [operation,providerId,total,JSON.stringify(details)])

  const successfulBody = [line(product1,3,2)]
  const firstPurchase = await compra(purchaseOp,successfulBody,6)
  const repeatedPurchase = await compra(purchaseOp,successfulBody,6)
  expect(repeatedPurchase.rows[0]).toEqual(firstPurchase.rows[0])
  expect((await db.query<{stock_actual:string}>('SELECT stock_actual FROM public.productos WHERE id=$1',[product1])).rows[0]).toEqual({stock_actual:'3.000'})
  expect((await db.query<{saldo_pendiente:string}>('SELECT saldo_pendiente FROM public.proveedores WHERE id=$1',[providerId])).rows[0]).toEqual({saldo_pendiente:'6.00'})
  expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM public.detalles_compra WHERE compra_id=$1',[purchaseOp])).rows[0].n).toBe(1)
  await expect(compra(purchaseOp,[line(product1,2,2)],4)).rejects.toThrow('El identificador ya corresponde a otra operación')

  await db.exec(`CREATE FUNCTION public.test_fail_second_purchase_stock() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id='${product2}'::uuid AND NEW.stock_actual>0 THEN RAISE EXCEPTION 'forced second-line failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_fail_second_purchase_stock BEFORE UPDATE OF stock_actual ON public.productos
      FOR EACH ROW EXECUTE FUNCTION public.test_fail_second_purchase_stock();`)
  await expect(compra(failedPurchaseOp,[line(product1,2,3),line(product2,1,1)],7)).rejects.toThrow('forced second-line failure')
  await db.exec('DROP TRIGGER test_fail_second_purchase_stock ON public.productos; DROP FUNCTION public.test_fail_second_purchase_stock();')
  expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM public.compras_proveedor WHERE id=$1',[failedPurchaseOp])).rows[0].n).toBe(0)
  expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM public.operaciones_escritura WHERE id=$1',[failedPurchaseOp])).rows[0].n).toBe(0)
  expect((await db.query<{stock_actual:string}>('SELECT stock_actual FROM public.productos WHERE id=$1',[product1])).rows[0]).toEqual({stock_actual:'3.000'})

  const stockRequest = "SELECT * FROM public.registrar_movimiento_stock_idempotente($1,$2,'EGRESO',1,'TEST',NULL,NULL,NULL,NULL)"
  const stockResult = await db.query(stockRequest,[stockOp,product1])
  expect((await db.query(stockRequest,[stockOp,product1])).rows[0]).toEqual(stockResult.rows[0])
  await expect(db.query("SELECT * FROM public.registrar_movimiento_stock_idempotente($1,$2,'EGRESO',2,'TEST',NULL,NULL,NULL,NULL)",[stockOp,product1])).rejects.toThrow('El identificador ya corresponde a otra operación')
  await expect(db.query("SELECT * FROM public.registrar_movimiento_stock_idempotente($1,$2,'INGRESO',1,'TEST',NULL,NULL,NULL,NULL)",['ab000000-0000-0000-0000-000000000002',product3])).rejects.toThrow('No autorizado')

  const apertura = await db.query('SELECT public.abrir_sesion_caja_transaccional($1,100)',[openOp])
  expect((await db.query('SELECT public.abrir_sesion_caja_transaccional($1,100)',[openOp])).rows[0]).toEqual(apertura.rows[0])
  await expect(db.query('SELECT public.abrir_sesion_caja_transaccional($1,100)',['a8000000-0000-0000-0000-000000000004'])).rejects.toThrow()
  const movimiento = await db.query("SELECT public.registrar_movimiento_caja_transaccional($1,$2,'EGRESO','TEST',2,'retiro')",[movementOp,sessionId])
  expect((await db.query("SELECT public.registrar_movimiento_caja_transaccional($1,$2,'EGRESO','TEST',2,'retiro')",[movementOp,sessionId])).rows[0]).toEqual(movimiento.rows[0])
  const cierre = await db.query('SELECT public.cerrar_sesion_caja_transaccional($1,$2,98)',[closeOp,sessionId])
  expect((await db.query('SELECT public.cerrar_sesion_caja_transaccional($1,$2,98)',[closeOp,sessionId])).rows[0]).toEqual(cierre.rows[0])
  expect((cierre.rows[0] as { cerrar_sesion_caja_transaccional: { monto_final_sistema: number } }).cerrar_sesion_caja_transaccional.monto_final_sistema).toBe(98)

  const credit = async (operation: string, client: string, amount: number) => db.query(`
    SELECT public.registrar_movimiento_cuenta_corriente_transaccional($1,$2,NULL,'ABONO_PAGO',$3,'TRANSFERENCIA','test',NULL)
  `,[operation,client,amount])
  const creditResult = await credit(ccOp,customerId,5)
  expect((await credit(ccOp,customerId,5)).rows[0]).toEqual(creditResult.rows[0])
  expect((await db.query<{saldo_deudor:string}>('SELECT saldo_deudor FROM public.clientes WHERE id=$1',[customerId])).rows[0]).toEqual({saldo_deudor:'15.00'})
  await expect(credit(ccConflictOp,otherCustomerId,5)).rejects.toThrow('Cliente no disponible para este comercio')
  expect((await db.query<{n:number}>('SELECT count(*)::int AS n FROM public.movimientos_cuenta_corriente WHERE cliente_id=$1',[otherCustomerId])).rows[0].n).toBe(0)
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

  await expect(db.query(`
    INSERT INTO public.movimientos_stock(kiosco_id,producto_id,tipo,cantidad,delta_stock,motivo)
    VALUES ($1,$2,'EGRESO',1,1,'TEST contradictory signed delta')
  `, [kiosk, products[4]])).rejects.toThrow(/delta_stock contradice el tipo/i)

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

it('secures catalog product writes and support ticket creation with atomic idempotent RPCs', async () => {
  const kiosk = 'ac100000-0000-0000-0000-000000000001'
  const otherKiosk = 'ac100000-0000-0000-0000-000000000002'
  const authId = 'ac200000-0000-0000-0000-000000000001'
  const userId = 'ac300000-0000-0000-0000-000000000001'
  const cashierAuthId = 'ac200000-0000-0000-0000-000000000002'
  const cashierUserId = 'ac300000-0000-0000-0000-000000000002'
  const productId = 'ac400000-0000-0000-0000-000000000001'
  const productOp = 'ac500000-0000-0000-0000-000000000001'
  const failProduct = 'ac400000-0000-0000-0000-000000000002'
  const failOp = 'ac500000-0000-0000-0000-000000000002'
  const importOp = 'ac500000-0000-0000-0000-000000000003'
  const ticketOp = 'ac600000-0000-0000-0000-000000000001'
  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [authId,cashierAuthId])
  await db.query('INSERT INTO public.kioscos(id,nombre) VALUES($1,$2),($3,$4)', [kiosk, 'TEST strict catalog', otherKiosk, 'TEST foreign catalog'])
  await db.query("INSERT INTO public.usuarios(id,auth_user_id,kiosco_id,nombre,email,rol) VALUES($1,$2,$3,'Dueña de prueba','owner@test.invalid','DUEÑO')", [userId,authId,kiosk])
  await db.query("INSERT INTO public.usuarios(id,auth_user_id,kiosco_id,nombre,email,rol) VALUES($1,$2,$3,'Cajero de prueba','cashier@test.invalid','CAJERO')", [cashierUserId,cashierAuthId,kiosk])
  await db.query("INSERT INTO public.categorias(id,kiosco_id,nombre) VALUES('ac700000-0000-0000-0000-000000000001',$1,'Alimentos')", [kiosk])
  await db.query("INSERT INTO public.productos(id,kiosco_id,descripcion) VALUES('ac400000-0000-0000-0000-000000000003',$1,'TEST foreign product')", [otherKiosk])
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [authId])

  const body = { descripcion: 'TEST strict product', precio_venta: 12.5, precio_costo: 5, stock_actual: 6,
    categoria_id: 'ac700000-0000-0000-0000-000000000001', unidad_medida: 'UN' }
  const create = () => db.query('SELECT public.guardar_producto_transaccional($1,$2,$3::jsonb)', [productOp,productId,JSON.stringify(body)])
  const created = await create()
  expect((await create()).rows[0]).toEqual(created.rows[0])
  await expect(db.query('SELECT public.guardar_producto_transaccional($1,$2,$3::jsonb)', [productOp,productId,JSON.stringify({ ...body, precio_venta: 20 })])).rejects.toThrow('El identificador ya corresponde a otra operación')
  expect((await db.query<{ stock_actual: string; precio_costo: string }>('SELECT stock_actual,precio_costo FROM public.productos WHERE id=$1',[productId])).rows[0]).toEqual({ stock_actual: '6.000', precio_costo: '0.00' })
  expect((await db.query<{ costo: string }>('SELECT precio_costo AS costo FROM public.producto_costos WHERE producto_id=$1',[productId])).rows[0].costo).toBe('5.00')
  expect((await db.query<{ delta: string }>('SELECT delta_stock AS delta FROM public.movimientos_stock WHERE producto_id=$1',[productId])).rows[0].delta).toBe('6.000')

  const importItems = [{ id: productId, datos: { descripcion: 'TEST strict product updated', precio_venta: 15, stock_actual: 7 } }]
  const importBatch = () => db.query('SELECT public.importar_productos_catalogo_transaccional($1,$2::jsonb,ARRAY[]::uuid[])', [importOp,JSON.stringify(importItems)])
  const importResult = await importBatch()
  expect(JSON.parse(JSON.stringify(importResult.rows[0]))).toEqual(JSON.parse(JSON.stringify((await importBatch()).rows[0])))
  expect((await db.query<{ stock_actual: string }>('SELECT stock_actual FROM public.productos WHERE id=$1',[productId])).rows[0].stock_actual).toBe('7.000')
  await expect(db.query('SELECT public.importar_productos_catalogo_transaccional($1,$2::jsonb,ARRAY[]::uuid[])', [importOp,JSON.stringify([{ id: productId, datos: { descripcion: 'Conflict', precio_venta: 15 } }])])).rejects.toThrow('El identificador ya corresponde a otra operación')
  const crossOp = 'ac500000-0000-0000-0000-000000000004'
  const crossResult = await db.query('SELECT public.importar_productos_catalogo_transaccional($1,$2::jsonb,ARRAY[]::uuid[])', [crossOp,JSON.stringify([{ id: 'ac400000-0000-0000-0000-000000000003', datos: { descripcion: 'Cross tenant', precio_venta: 1 } }])])
  expect((crossResult.rows[0] as Record<string, { ok: boolean; errores: unknown[] }>).importar_productos_catalogo_transaccional.ok).toBe(false)
  expect((await db.query<{ descripcion: string }>("SELECT descripcion FROM public.productos WHERE id='ac400000-0000-0000-0000-000000000003'")).rows[0].descripcion).toBe('TEST foreign product')

  await db.exec(`CREATE FUNCTION public.test_fail_catalog_stock() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.id='${failProduct}'::uuid AND NEW.stock_actual>0 THEN RAISE EXCEPTION 'forced catalog stock failure'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_fail_catalog_stock BEFORE UPDATE OF stock_actual ON public.productos FOR EACH ROW EXECUTE FUNCTION public.test_fail_catalog_stock();`)
  await expect(db.query('SELECT public.guardar_producto_transaccional($1,$2,$3::jsonb)', [failOp,failProduct,JSON.stringify({ descripcion:'TEST rollback',precio_venta:10,stock_actual:4 })])).rejects.toThrow('forced catalog stock failure')
  await db.exec('DROP TRIGGER test_fail_catalog_stock ON public.productos; DROP FUNCTION public.test_fail_catalog_stock();')
  expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM public.productos WHERE id=$1',[failProduct])).rows[0].n).toBe(0)
  expect((await db.query<{ n: number }>('SELECT count(*)::int AS n FROM public.operaciones_escritura WHERE id=$1',[failOp])).rows[0].n).toBe(0)

  const ticketBody = [ticketOp,'ERROR','POS','No imprime','{"version":"test"}']
  const ticket = () => db.query('SELECT public.crear_ticket_soporte_transaccional($1,$2,$3,$4,$5::jsonb)', ticketBody)
  const ticketCreated = await ticket()
  expect((await ticket()).rows[0]).toEqual(ticketCreated.rows[0])
  const result = (ticketCreated.rows[0] as Record<string, unknown>)['crear_ticket_soporte_transaccional'] as { kiosco_id: string; usuario_id: string; usuario_nombre: string }
  expect(result).toMatchObject({ kiosco_id: kiosk, usuario_id: userId, usuario_nombre: 'Dueña de prueba' })
  await expect(db.query('SELECT public.crear_ticket_soporte_transaccional($1,$2,$3,$4,$5::jsonb)', [ticketOp,'ERROR','POS','mensaje distinto','{}'])).rejects.toThrow('El identificador ya corresponde a otra operación')
  await expect(db.query('SELECT public.crear_ticket_soporte_transaccional($1,$2,$3,$4,$5::jsonb)', ['ac600000-0000-0000-0000-000000000002','INVALIDO','POS','x','{}'])).rejects.toThrow('Datos del ticket inválidos')

  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [cashierAuthId])
  await expect(db.query('SELECT public.guardar_producto_transaccional($1,$2,$3::jsonb)', ['ac500000-0000-0000-0000-000000000005',productId,'{"descripcion":"No autorizado"}'])).rejects.toThrow('Sólo el dueño puede editar productos existentes')
  await db.query("SELECT set_config('request.jwt.claim.sub','',false)")
  await expect(db.query('SELECT public.crear_ticket_soporte_transaccional($1,$2,$3,$4,$5::jsonb)', ['ac600000-0000-0000-0000-000000000003','CONSULTA','POS','sin auth','{}'])).rejects.toThrow('Autenticación requerida')
})

it('allows exactly the global SuperAdmin profile shape and keeps the owner tenant-scoped', async () => {
  const superAuth = 'ad200000-0000-0000-0000-000000000001'
  const ownerAuth = 'ad200000-0000-0000-0000-000000000002'
  const superProfile = 'ad300000-0000-0000-0000-000000000001'
  const ownerProfile = 'ad300000-0000-0000-0000-000000000002'
  const kiosk = 'ad400000-0000-0000-0000-000000000001'
  const otherKiosk = 'ad400000-0000-0000-0000-000000000002'

  const contract = await db.query<{ kiosk_nullable: string; role_check: string; superadmin_check: string }>(`
    SELECT (SELECT is_nullable FROM information_schema.columns
      WHERE table_schema='public' AND table_name='usuarios' AND column_name='kiosco_id') AS kiosk_nullable,
      (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.usuarios'::regclass AND conname='usuarios_rol_check') AS role_check,
      (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid='public.usuarios'::regclass AND conname='usuarios_superadmin_kiosco_scope_check') AS superadmin_check
  `)
  expect(contract.rows[0].kiosk_nullable).toBe('YES')
  expect(contract.rows[0].role_check).toMatch(/DUEÑO.*CAJERO.*VISOR/)
  expect(contract.rows[0].superadmin_check).toMatch(/es_superadmin.*kiosco_id IS NULL/)

  await db.query('INSERT INTO auth.users(id) VALUES($1),($2)', [superAuth, ownerAuth])
  await db.query('INSERT INTO auth.users(id) VALUES($1)', ['ad200000-0000-0000-0000-000000000003'])
  await db.query('INSERT INTO public.kioscos(id,nombre) VALUES($1,$2),($3,$4)', [kiosk, 'TEST initial owner', otherKiosk, 'TEST foreign tenant'])
  await db.query("SELECT set_config('request.jwt.claim.role','service_role',false)")
  await db.query(`INSERT INTO public.usuarios(id,auth_user_id,kiosco_id,nombre,rol,activo,es_superadmin)
    VALUES($1,$2,NULL,'TEST platform admin','VISOR',true,true),($3,$4,$5,'TEST first owner','DUEÑO',true,false)`,
  [superProfile, superAuth, ownerProfile, ownerAuth, kiosk])
  await db.query("SELECT set_config('request.jwt.claim.role','',false)")

  await expect(db.query(`INSERT INTO public.usuarios(auth_user_id,kiosco_id,nombre,rol,es_superadmin)
    VALUES('ad200000-0000-0000-0000-000000000003',NULL,'TEST invalid global','DUEÑO',false)`))
    .rejects.toThrow()
  await expect(db.query(`INSERT INTO public.usuarios(auth_user_id,kiosco_id,nombre,rol,es_superadmin)
    VALUES('ad200000-0000-0000-0000-000000000003',$1,'TEST invalid tenant admin','VISOR',true)`, [kiosk]))
    .rejects.toThrow()
  await expect(db.query(`INSERT INTO public.usuarios(auth_user_id,kiosco_id,nombre,rol,es_superadmin)
    VALUES('ad200000-0000-0000-0000-000000000003',$1,'TEST invented role','SUPERADMIN',true)`, [kiosk]))
    .rejects.toThrow()

  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [ownerAuth])
  await db.exec('SET ROLE authenticated')
  const ownerKiosks = await db.query<{ id: string }>('SELECT id FROM public.kioscos WHERE id=ANY($1::uuid[]) ORDER BY id', [[kiosk, otherKiosk]])
  expect(ownerKiosks.rows).toEqual([{ id: kiosk }])
  await db.exec('RESET ROLE')

  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [superAuth])
  await db.exec('SET ROLE authenticated')
  const globalKiosks = await db.query<{ id: string }>('SELECT id FROM public.kioscos WHERE id=ANY($1::uuid[]) ORDER BY id', [[kiosk, otherKiosk]])
  expect(globalKiosks.rows).toEqual([{ id: kiosk }, { id: otherKiosk }])
  const resolved = await db.query<{ kiosco_id: string | null; rol: string; es_superadmin: boolean }>(`
    SELECT public.auth_user_kiosco_id() AS kiosco_id, public.auth_user_rol() AS rol,
      public.auth_es_superadmin() AS es_superadmin
  `)
  expect(resolved.rows[0]).toEqual({ kiosco_id: null, rol: 'VISOR', es_superadmin: true })
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.role','',false)")
})
