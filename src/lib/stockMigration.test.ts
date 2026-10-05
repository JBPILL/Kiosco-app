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
    await db.exec(readFileSync('supabase_fase_costos_movimientos_privados.sql', 'utf8'))
    await db.exec(readFileSync('supabase_fase_stock_idempotente.sql', 'utf8'))
    await db.exec(readFileSync('supabase_fase_reporte_bajas_stock.sql', 'utf8'))
    await db.exec('GRANT SELECT ON productos,lotes_producto,movimientos_stock TO authenticated,service_role;')
  }, 30_000)
  beforeEach(async () => {
    await db.exec(`RESET ROLE; SET request.jwt.claim.role='service_role'; DELETE FROM movimientos_stock; DELETE FROM lotes_producto WHERE id NOT IN ('${lot1}','${lot2}'); UPDATE productos SET stock_actual=10; UPDATE producto_costos SET precio_costo=12; UPDATE lotes_producto SET cantidad_actual=cantidad_inicial,activo=true; UPDATE usuarios SET activo=true;`)
    await session()
  })
  afterAll(async () => db?.close())

  const report = (target = kiosk, from = '2026-10-01', to = '2026-10-31') => db.query<{
    resumen: { movimientos: number; por_motivo: { motivo: string; movimientos: number; sin_costo: number; estimacion: number | null }[] }
  }>('SELECT resumir_bajas_stock($1::uuid,$2::date,$3::date) AS resumen', [target, from, to])

  it('reporte: incluye más de mil movimientos y separa motivos sin truncar', async () => {
    await db.exec(`RESET ROLE;
      INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,fecha)
      SELECT '${kiosk}','${product}','EGRESO',-1,'MERMA','2026-10-15 15:00Z' FROM generate_series(1,1201);
      INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,fecha) VALUES
      ('${kiosk}','${product}','EGRESO',2,'ROBO','2026-10-15 15:00Z'),
      ('${kiosk}','${product}','EGRESO',-3,'VENTA','2026-10-15 15:00Z'),
      ('${kiosk}','${product}','AJUSTE',-4,'MERMA','2026-10-15 15:00Z');`)
    await db.exec('UPDATE producto_costos SET precio_costo=99;')
    await session()
    const summary = (await report()).rows[0].resumen
    expect(summary.movimientos).toBe(1202)
    expect(summary.por_motivo).toContainEqual({ motivo: 'MERMA', movimientos: 1201, sin_costo: 0, estimacion: 14412 })
    expect(summary.por_motivo).toContainEqual({ motivo: 'ROBO', movimientos: 1, sin_costo: 0, estimacion: 24 })
  })

  it('reporte: usa límites del día argentino y conserva cero y desconocido', async () => {
    await db.exec(`RESET ROLE;
      INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,fecha) VALUES
      ('${kiosk}','${product}','EGRESO',-1,'MERMA','2026-10-05 02:59:59Z'),
      ('${kiosk}','${product}','EGRESO',-1,'MERMA','2026-10-05 03:00Z'),
      ('${kiosk}','${product}','EGRESO',-1,'ROBO','2026-10-06 02:59:59Z'),
      ('${kiosk}','${product}','EGRESO',-1,'MERMA','2026-10-06 03:00Z');
      UPDATE movimiento_stock_costos SET precio_costo=CASE
      WHEN movimiento_id IN(SELECT id FROM movimientos_stock WHERE motivo='ROBO') THEN 0 ELSE NULL END;`)
    await session()
    expect((await report(kiosk, '2026-10-05', '2026-10-05')).rows[0].resumen).toEqual({
      movimientos: 2, por_motivo: [
        { motivo: 'MERMA', movimientos: 1, sin_costo: 1, estimacion: null },
        { motivo: 'ROBO', movimientos: 1, sin_costo: 0, estimacion: 0 },
      ],
    })
  })

  it('reporte: rechaza cajero, comercio ajeno y perfil desactivado', async () => {
    await session(foreignUser)
    await expect(report()).rejects.toThrow('No autorizado')
    await db.exec(`RESET ROLE; UPDATE usuarios SET rol='CAJERO' WHERE id='${user}';`)
    await session()
    await expect(report()).rejects.toThrow('No autorizado')
    await db.exec(`RESET ROLE; UPDATE usuarios SET rol='DUEÑO',activo=false WHERE id='${user}';`)
    await session()
    await expect(report()).rejects.toThrow('No autorizado')
    await db.exec(`RESET ROLE; UPDATE usuarios SET activo=true WHERE id='${user}';`)
  })

  it('reporte: rechaza anónimo y rangos inválidos', async () => {
    await expect(report(kiosk, '2026-10-06', '2026-10-05')).rejects.toThrow('Rango de fechas inválido')
    await db.exec('RESET ROLE; SET ROLE anon;')
    await expect(report()).rejects.toThrow('permission denied')
  })

  it('reporte: período sin movimientos devuelve conjunto vacío', async () => {
    expect((await report()).rows[0].resumen).toEqual({ movimientos: 0, por_motivo: [] })
  })

  it('reporte: costos y cantidades NaN quedan fuera de la estimación', async () => {
    await db.exec(`RESET ROLE;
      INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,fecha) VALUES
      ('${kiosk}','${product}','EGRESO',-1,'MERMA','2026-10-15 15:00Z'),
      ('${kiosk}','${product}','EGRESO','NaN','ROBO','2026-10-15 15:00Z');
      UPDATE movimiento_stock_costos SET precio_costo='NaN' WHERE movimiento_id IN
        (SELECT id FROM movimientos_stock WHERE motivo='MERMA');`)
    await session()
    const result = (await report()).rows[0].resumen
    expect(result.movimientos).toBe(2)
    expect(result.por_motivo.every((fila) => fila.sin_costo === 1 && fila.estimacion === null)).toBe(true)
  })

  it('descuenta FEFO y conserva el costo al registrar la merma', async () => {
    const result = await move('EGRESO', 4)
    expect(Number(result.rows[0].stock_nuevo)).toBe(6)
    expect(await state()).toEqual({ stock: 6, lots: [0, 2], movements: 1 })
    expect(Number((await db.query<{ costo: string }>('SELECT precio_costo AS costo FROM movimiento_stock_costos')).rows[0].costo)).toBe(12)
    expect((await db.query<{ costo: null }>('SELECT costo_unitario_referencia AS costo FROM movimientos_stock')).rows[0].costo).toBeNull()
  })
  it('repetir el mismo identificador devuelve el resultado sin descontar nuevamente', async () => {
    const params = ['40000000-0000-0000-0000-000000000001', product, 2]
    const sql = "SELECT * FROM registrar_movimiento_stock_idempotente($1::uuid,$2::uuid,'EGRESO',$3::numeric,'MERMA')"
    const first = await db.query(sql, params)
    const retry = await db.query(sql, params)
    expect(retry.rows).toEqual(first.rows)
    expect(await state()).toEqual({ stock: 8, lots: [0, 4], movements: 1 })
    await expect(db.query(sql, [params[0], product, 3])).rejects.toThrow('otra operación')
    expect((await state()).stock).toBe(8)
  })
  it('una operación fallida no reserva la clave ni conserva cambios parciales', async () => {
    const sql = "SELECT * FROM registrar_movimiento_stock_idempotente($1::uuid,$2::uuid,'EGRESO',2,$3)"
    const id = '40000000-0000-0000-0000-000000000002'
    await expect(db.query(sql, [id, product, 'FALLA'])).rejects.toThrow('check constraint')
    await db.query(sql, [id, product, 'MERMA'])
    expect(await state()).toEqual({ stock: 8, lots: [0, 4], movements: 1 })
  })
  it('cancelar una identidad no aplicada impide una llegada tardía', async () => {
    const id = '40000000-0000-0000-0000-000000000003'
    const response = await db.query<{ estado: { estado: string } }>('SELECT resolver_operacion_stock($1::uuid,$2::uuid,$3::uuid,true) AS estado', [id,kiosk,product])
    expect(response.rows[0].estado.estado).toBe('CANCELADA')
    await expect(db.query("SELECT * FROM registrar_movimiento_stock_idempotente($1::uuid,$2::uuid,'EGRESO',2,'MERMA')", [id,product])).rejects.toThrow('cancelada')
    expect(await state()).toEqual({ stock: 10, lots: [2,4], movements: 0 })
  })
  it('consultar ausencia no la confunde con cancelación ni concede acceso ajeno', async () => {
    const id = '40000000-0000-0000-0000-000000000004'
    const sql = 'SELECT resolver_operacion_stock($1::uuid,$2::uuid,$3::uuid,false) AS estado'
    const response = await db.query<{ estado: { estado: string } }>(sql,[id,kiosk,product])
    expect(response.rows[0].estado.estado).toBe('NO_REGISTRADA')
    await session(foreignUser)
    await expect(db.query(sql,[id,kiosk,product])).rejects.toThrow('No autorizado')
  })
  it('cancelar una identidad aplicada informa su resultado sin revertir stock', async () => {
    const id = '40000000-0000-0000-0000-000000000005'
    await db.query("SELECT * FROM registrar_movimiento_stock_idempotente($1::uuid,$2::uuid,'EGRESO',2,'MERMA')", [id,product])
    const response = await db.query<{ estado: { estado: string } }>('SELECT resolver_operacion_stock($1::uuid,$2::uuid,$3::uuid,true) AS estado', [id,kiosk,product])
    expect(response.rows[0].estado.estado).toBe('APLICADA')
    expect(await state()).toEqual({ stock: 8, lots: [0,4], movements: 1 })
  })
  it('baja únicamente el lote seleccionado', async () => {
    await move('EGRESO', 2, 'VENCIMIENTO', lot2)
    expect(await state()).toEqual({ stock: 8, lots: [2, 2], movements: 1 })
  })
  it('el costo histórico no cambia al editar el producto ni el movimiento', async () => {
    await move('EGRESO', 1)
    await db.exec("RESET ROLE; SET request.jwt.claim.role='service_role'; UPDATE productos SET precio_costo=34; UPDATE movimientos_stock SET costo_unitario_referencia=99;")
    const result = await db.query<{ costo: string }>('SELECT precio_costo AS costo FROM movimiento_stock_costos')
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
  it('el cajero no obtiene snapshots aunque lea movimientos públicos', async () => {
    await move('EGRESO',1)
    await db.exec(`RESET ROLE; UPDATE usuarios SET rol='CAJERO' WHERE id='${user}';`)
    await session()
    expect((await db.query('SELECT * FROM movimiento_stock_costos')).rows).toEqual([])
    expect((await db.query<{ costo: null }>('SELECT costo_unitario_referencia AS costo FROM movimientos_stock')).rows[0].costo).toBeNull()
    await db.exec(`RESET ROLE; UPDATE usuarios SET rol='DUEÑO' WHERE id='${user}';`)
  })
  it('otro dueño no obtiene los costos de movimientos del comercio', async () => {
    await move('EGRESO',1)
    await session(foreignUser)
    expect((await db.query('SELECT * FROM movimiento_stock_costos')).rows).toEqual([])
  })
  it('el dueño no puede falsificar el snapshot privado mediante update directo', async () => {
    await move('EGRESO',1)
    await expect(db.exec('UPDATE movimiento_stock_costos SET precio_costo=99')).rejects.toThrow('permission denied')
    expect(Number((await db.query<{ costo: string }>('SELECT precio_costo AS costo FROM movimiento_stock_costos')).rows[0].costo)).toBe(12)
  })
  it('reaplicar mermas y costos privados conserva snapshots y columnas públicas vacías', async () => {
    await move('EGRESO',1)
    await db.exec('RESET ROLE;')
    await db.exec(readFileSync('supabase_fase_mermas_trazables.sql','utf8'))
    await db.exec(readFileSync('supabase_fase_costos_movimientos_privados.sql','utf8'))
    await session()
    await move('EGRESO',1)
    const publicRows = (await db.query<{ costo: null }>('SELECT costo_unitario_referencia AS costo FROM movimientos_stock')).rows
    expect(publicRows.every((row) => row.costo === null)).toBe(true)
    expect((await db.query('SELECT * FROM movimiento_stock_costos')).rows).toHaveLength(2)
  })
  it('migra el costo histórico conocido sin inventar costos para registros anteriores desconocidos', async () => {
    await db.exec(`RESET ROLE;
      ALTER TABLE movimientos_stock DISABLE TRIGGER trg_capturar_costo_historico_movimiento_stock;
      ALTER TABLE movimientos_stock DISABLE TRIGGER trg_guardar_costo_privado_movimiento_stock;
      INSERT INTO movimientos_stock(id,kiosco_id,producto_id,tipo,cantidad,motivo,fecha,costo_unitario_referencia) VALUES
      ('50000000-0000-0000-0000-000000000001','${kiosk}','${product}','EGRESO',-1,'MERMA',now(),21),
      ('50000000-0000-0000-0000-000000000002','${kiosk}','${product}','EGRESO',-1,'MERMA',now(),NULL);
      ALTER TABLE movimientos_stock ENABLE TRIGGER trg_capturar_costo_historico_movimiento_stock;
      ALTER TABLE movimientos_stock ENABLE TRIGGER trg_guardar_costo_privado_movimiento_stock;
    `)
    await db.exec(readFileSync('supabase_fase_costos_movimientos_privados.sql','utf8'))
    await session()
    const snapshots = (await db.query<{ precio_costo: string }>('SELECT precio_costo FROM movimiento_stock_costos')).rows
    expect(snapshots).toHaveLength(1)
    expect(Number(snapshots[0].precio_costo)).toBe(21)
    expect((await db.query<{ costo: null }>('SELECT costo_unitario_referencia AS costo FROM movimientos_stock')).rows.every((row) => row.costo === null)).toBe(true)
  })
  it('permite operaciones del backend con el rol de servicio', async () => {
    await db.exec("RESET ROLE; SET request.jwt.claim.sub=''; SET request.jwt.claim.role='service_role'; SET ROLE service_role;")
    await move('EGRESO', 1)
    expect((await state()).stock).toBe(9)
  })
})
