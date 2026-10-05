// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const kiosk = '10000000-0000-0000-0000-000000000001'
const other = '10000000-0000-0000-0000-000000000002'
const user = '00000000-0000-0000-0000-000000000001'
const foreignUser = '00000000-0000-0000-0000-000000000002'
const product = '20000000-0000-0000-0000-000000000001'
const lot1 = '30000000-0000-0000-0000-000000000001'
const lot2 = '30000000-0000-0000-0000-000000000002'

describe('movimientos manuales en PostgreSQL', () => {
  let db: PGlite
  const session = async (id = user) => db.exec(`RESET ROLE; SET request.jwt.claim.sub = '${id}'; SET request.jwt.claim.role = 'authenticated'; SET ROLE authenticated;`)
  const move = (type: string, amount: number, reason = 'MERMA', lot: string | null = null, expiry: string | null = null) => db.query<{ stock_anterior: string; stock_nuevo: string; movimiento_id: string }>(
    'SELECT * FROM public.registrar_movimiento_stock($1::uuid,$2,$3::numeric,$4,NULL,$5::date,NULL,$6::uuid)', [product, type, amount, reason, expiry, lot],
  )
  const state = async () => ({
    stock: Number((await db.query<{ stock_actual: string }>('SELECT stock_actual FROM productos WHERE id=$1', [product])).rows[0].stock_actual),
    lots: (await db.query<{ cantidad_actual: string }>('SELECT cantidad_actual FROM lotes_producto ORDER BY id')).rows.map((row) => Number(row.cantidad_actual)),
    movements: (await db.query('SELECT id FROM movimientos_stock')).rows.length,
  })

  beforeAll(async () => {
    db = new PGlite()
    await db.exec(`
      CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT NULLIF(current_setting('request.jwt.claim.role', true), '') $$;
      GRANT USAGE ON SCHEMA auth TO authenticated, service_role;
      CREATE TABLE kioscos(id uuid PRIMARY KEY);
      CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid,rol text,activo boolean DEFAULT true,es_superadmin boolean DEFAULT false);
      CREATE TABLE productos(id uuid PRIMARY KEY,kiosco_id uuid REFERENCES kioscos(id),descripcion text,precio_costo numeric(12,2),stock_actual numeric(12,3),fecha_actualizacion timestamptz);
      CREATE TABLE lotes_producto(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid,producto_id uuid REFERENCES productos(id),numero_lote text,fecha_vencimiento date,cantidad_inicial numeric(12,3),cantidad_actual numeric(12,3),fecha_ingreso timestamptz DEFAULT now(),activo boolean DEFAULT true);
      CREATE TABLE movimientos_stock(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid,producto_id uuid REFERENCES productos(id),tipo text,cantidad numeric(12,3),motivo text CHECK(motivo <> 'FALLA'),notas text,usuario_id uuid,fecha timestamptz);
      INSERT INTO kioscos VALUES('${kiosk}'),('${other}');
      INSERT INTO usuarios(id,auth_user_id,kiosco_id,rol) VALUES('${user}','${user}','${kiosk}','DUEÑO'),('${foreignUser}','${foreignUser}','${other}','DUEÑO');
      INSERT INTO productos VALUES('${product}','${kiosk}','Producto',12,10,now());
      INSERT INTO lotes_producto(id,kiosco_id,producto_id,fecha_vencimiento,cantidad_inicial,cantidad_actual) VALUES
        ('${lot1}','${kiosk}','${product}','2027-01-01',2,2),('${lot2}','${kiosk}','${product}','2027-02-01',4,4);
    `)
    const roles = readFileSync('supabase_seguridad_roles_rls.sql', 'utf8')
    await db.exec(roles.slice(roles.indexOf('CREATE OR REPLACE FUNCTION public.auth_user_kiosco_id()'), roles.indexOf('-- 3. SOLUCIÓN ADVISOR:')))
    await db.exec(readFileSync('supabase_fase_seguridad_costos_privados.sql', 'utf8'))
    await db.exec(readFileSync('supabase_fase_mermas_trazables.sql', 'utf8'))
    await db.exec('GRANT SELECT ON productos,lotes_producto,movimientos_stock TO authenticated,service_role;')
  }, 30_000)
  beforeEach(async () => {
    await db.exec(`RESET ROLE; SET request.jwt.claim.role='service_role'; DELETE FROM movimientos_stock; DELETE FROM lotes_producto WHERE id NOT IN ('${lot1}','${lot2}'); UPDATE productos SET stock_actual=10; UPDATE producto_costos SET precio_costo=12; UPDATE lotes_producto SET cantidad_actual=cantidad_inicial,activo=true; UPDATE usuarios SET activo=true;`)
    await session()
  })
  afterAll(async () => db?.close())

  it('descuenta FEFO y conserva el costo al registrar la merma', async () => {
    const result = await move('EGRESO', 4)
    expect(Number(result.rows[0].stock_nuevo)).toBe(6)
    expect(await state()).toEqual({ stock: 6, lots: [0, 2], movements: 1 })
    expect(Number((await db.query<{ costo: string }>('SELECT costo_unitario_referencia AS costo FROM movimientos_stock')).rows[0].costo)).toBe(12)
  })
  it('baja únicamente el lote seleccionado', async () => {
    await move('EGRESO', 2, 'VENCIMIENTO', lot2)
    expect(await state()).toEqual({ stock: 8, lots: [2, 2], movements: 1 })
  })
  it('el costo histórico no cambia al editar el producto ni el movimiento', async () => {
    await move('EGRESO', 1)
    await db.exec("RESET ROLE; SET request.jwt.claim.role='service_role'; UPDATE productos SET precio_costo=34; UPDATE movimientos_stock SET costo_unitario_referencia=99;")
    const result = await db.query<{ costo: string }>('SELECT costo_unitario_referencia AS costo FROM movimientos_stock')
    expect(Number(result.rows[0].costo)).toBe(12)
  })
  it('un ajuste a cero vacía lotes activos y registra el delta real', async () => {
    await move('AJUSTE', 0, 'INVENTARIO')
    expect(await state()).toEqual({ stock: 0, lots: [0, 0], movements: 1 })
    expect(Number((await db.query<{ cantidad: string }>('SELECT cantidad FROM movimientos_stock')).rows[0].cantidad)).toBe(-10)
  })
  it('un ajuste hacia arriba registra el delta sin restar lotes', async () => {
    await move('AJUSTE', 15, 'INVENTARIO')
    expect(await state()).toEqual({ stock: 15, lots: [2, 4], movements: 1 })
    expect(Number((await db.query<{ cantidad: string }>('SELECT cantidad FROM movimientos_stock')).rows[0].cantidad)).toBe(5)
  })
  it('revierte todo si el egreso supera el stock', async () => {
    await expect(move('EGRESO', 11)).rejects.toThrow('supera')
    expect(await state()).toEqual({ stock: 10, lots: [2, 4], movements: 0 })
  })
  it('revierte todo si el lote seleccionado no alcanza', async () => {
    await expect(move('EGRESO', 3, 'VENCIMIENTO', lot1)).rejects.toThrow('lote')
    expect(await state()).toEqual({ stock: 10, lots: [2, 4], movements: 0 })
  })
  it('revierte cambios previos si falla el insert del kardex', async () => {
    await expect(move('EGRESO', 2, 'FALLA')).rejects.toThrow('check constraint')
    expect(await state()).toEqual({ stock: 10, lots: [2, 4], movements: 0 })
  })
  it('registra ingreso, lote y stock en conjunto', async () => {
    await move('INGRESO', 3, 'COMPRA', null, '2027-03-01')
    const current = await state()
    expect(current.stock).toBe(13)
    expect(current.lots.reduce((sum, quantity) => sum + quantity, 0)).toBe(9)
    expect(current.movements).toBe(1)
  })
  it('un ajuste hacia abajo también reduce lotes por FEFO', async () => {
    await move('AJUSTE', 4, 'INVENTARIO')
    expect(await state()).toEqual({ stock: 4, lots: [0, 0], movements: 1 })
  })
  it('rechaza cantidades que se redondearían a cero', async () => {
    await expect(move('EGRESO', 0.0001)).rejects.toThrow()
    expect(await state()).toEqual({ stock: 10, lots: [2, 4], movements: 0 })
  })
  it('impide modificar otro comercio', async () => {
    await session(foreignUser)
    await expect(move('EGRESO', 1)).rejects.toThrow('No autorizado')
    expect(await state()).toEqual({ stock: 10, lots: [2, 4], movements: 0 })
  })
  it('impide operar con un perfil desactivado', async () => {
    await db.exec(`RESET ROLE; UPDATE usuarios SET activo=false WHERE id='${user}';`)
    await session()
    await expect(move('EGRESO', 1)).rejects.toThrow('No autorizado')
    expect(await state()).toEqual({ stock: 10, lots: [2, 4], movements: 0 })
  })
  it('rechaza ejecución anónima por permisos de función', async () => {
    await db.exec("RESET ROLE; SET ROLE anon;")
    await expect(move('EGRESO', 1)).rejects.toThrow('permission denied')
  })
  it('permite operaciones del backend con el rol de servicio', async () => {
    await db.exec("RESET ROLE; SET request.jwt.claim.sub=''; SET request.jwt.claim.role='service_role'; SET ROLE service_role;")
    await move('EGRESO', 1)
    expect((await state()).stock).toBe(9)
  })
})
