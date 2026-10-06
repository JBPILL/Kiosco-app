// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest'
let db: PGlite
const kid = '10000000-0000-0000-0000-000000000001'
const attempt = '20000000-0000-0000-0000-000000000001'
const second = '20000000-0000-0000-0000-000000000002'
const caja = '30000000-0000-0000-0000-000000000001'
const user = '40000000-0000-0000-0000-000000000001'
const product = '50000000-0000-0000-0000-000000000001'
const other = '50000000-0000-0000-0000-000000000002'
async function preparar(id = attempt, plan = [{ productoId: product, cantidad: 2.5 }]) {
  await db.query("SELECT preparar_intento_point($1,$2,$1,'terminal',10000,$3::jsonb,'123','456','sandbox')",
    [id, kid, JSON.stringify({ version: 2, usuarioId: user, sesionCajaId: caja, cotizacion: { ticket: { consumoStock: plan } } })])
}
const reservar = (id = attempt) => db.query('SELECT reservar_stock_point($1,$2)', [id, kid])
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role' $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY); CREATE TABLE ventas(id uuid PRIMARY KEY);
    CREATE TABLE sesiones_caja(id uuid PRIMARY KEY,kiosco_id uuid,usuario_id uuid,estado text);
    CREATE TABLE productos(id uuid PRIMARY KEY,kiosco_id uuid,stock_actual numeric,activo boolean,es_combo boolean);
    CREATE TABLE lotes_producto(id uuid PRIMARY KEY,producto_id uuid,kiosco_id uuid,cantidad_actual numeric,
      activo boolean,fecha_vencimiento date,fecha_ingreso timestamptz);
    INSERT INTO kioscos VALUES('${kid}');
    INSERT INTO sesiones_caja VALUES('${caja}','${kid}','${user}','ABIERTA');
    INSERT INTO productos VALUES('${product}','${kid}',5,true,false),('${other}','${kid}',1,true,false);`)
  await db.exec(readFileSync('supabase_fase_point_intentos.sql', 'utf8'))
  await db.exec(readFileSync('supabase_fase_point_caja.sql', 'utf8'))
  const sql = readFileSync('supabase_fase_point_reserva_stock.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const lotes = readFileSync('supabase_fase_point_reserva_lotes.sql', 'utf8')
  await db.exec(lotes)
  await db.exec(lotes)
}, 30000)
beforeEach(async () => {
  await db.exec(`DELETE FROM point_reservas_lotes; DELETE FROM point_reservas_stock; DELETE FROM point_intentos; DELETE FROM lotes_producto;
    UPDATE productos SET stock_actual=CASE WHEN id='${product}' THEN 5 ELSE 1 END,activo=true,es_combo=false;`)
})
it('congela los lotes por vencimiento y protege cantidades y fechas', async () => {
  const temprano = '60000000-0000-0000-0000-000000000001'
  const tarde = '60000000-0000-0000-0000-000000000002'
  await db.query(`INSERT INTO lotes_producto VALUES
    ($1,$3,$4,2,true,'2026-10-20','2026-10-01'),($2,$3,$4,3,true,'2026-11-20','2026-10-01')`,
    [temprano,tarde,product,kid])
  await preparar(attempt,[{ productoId: product,cantidad: 3 }])
  await db.query('SELECT reservar_lotes_point($1,$2)',[attempt,kid])
  await db.query('SELECT reservar_lotes_point($1,$2)',[attempt,kid])
  const filas = await db.query<{ lote_id: string; cantidad: string }>('SELECT lote_id,cantidad FROM point_reservas_lotes ORDER BY lote_id')
  expect(filas.rows).toEqual([{ lote_id: temprano,cantidad: '2.000' },{ lote_id: tarde,cantidad: '1.000' }])
  await expect(db.query('UPDATE lotes_producto SET cantidad_actual=1 WHERE id=$1',[temprano])).rejects.toThrow('POINT_LOTE_RESERVADO')
  await expect(db.query("UPDATE lotes_producto SET fecha_vencimiento='2026-12-01' WHERE id=$1",[temprano])).rejects.toThrow('POINT_LOTE_RESERVADO')
})
it('mantiene el stock sin lote reservado físicamente', async () => {
  await preparar()
  await db.query('SELECT reservar_lotes_point($1,$2)',[attempt,kid])
  expect((await db.query('SELECT * FROM point_reservas_stock')).rows).toHaveLength(1)
  expect((await db.query('SELECT * FROM point_reservas_lotes')).rows).toHaveLength(0)
  expect((await db.query<{ lotes_reservados_at: string | null }>('SELECT lotes_reservados_at FROM point_intentos')).rows[0].lotes_reservados_at).not.toBeNull()
})
afterAll(async () => db?.close())
it('reserva fracciones una sola vez y protege el stock físico sin descontarlo', async () => {
  await preparar()
  await reservar()
  await reservar()
  expect((await db.query('SELECT * FROM point_reservas_stock')).rows).toHaveLength(1)
  expect((await db.query<{ stock_actual: string }>('SELECT stock_actual FROM productos WHERE id=$1', [product])).rows[0].stock_actual).toBe('5')
  await expect(db.query('UPDATE productos SET stock_actual=2 WHERE id=$1', [product])).rejects.toThrow('POINT_STOCK_RESERVADO')
  await expect(db.query('UPDATE productos SET activo=false WHERE id=$1', [product])).rejects.toThrow('POINT_STOCK_RESERVADO')
})
it('rechaza sobreventa entre intentos y libera disponibilidad tras cancelación definitiva', async () => {
  await preparar(attempt, [{ productoId: product, cantidad: 4 }])
  await reservar()
  await preparar(second)
  await expect(reservar(second)).rejects.toThrow('insuficiente')
  await db.query("UPDATE point_intentos SET estado='CONCILIAR' WHERE id=$1", [attempt])
  await expect(reservar(second)).rejects.toThrow('insuficiente')
  await db.query("UPDATE point_intentos SET estado='CANCELADO' WHERE id=$1", [attempt])
  await reservar(second)
})
it('revierte todas las reservas si una línea falla y rechaza cantidades imprecisas', async () => {
  await preparar(attempt, [{ productoId: product, cantidad: 2 }, { productoId: other, cantidad: 2 }])
  await expect(reservar()).rejects.toThrow('insuficiente')
  expect((await db.query('SELECT * FROM point_reservas_stock')).rows).toHaveLength(0)
  expect((await db.query<{ stock_reservado_at: string | null }>('SELECT stock_reservado_at FROM point_intentos')).rows[0].stock_reservado_at).toBeNull()
  await preparar(second, [{ productoId: product, cantidad: 0.0001 }])
  await expect(reservar(second)).rejects.toThrow('Cantidad física inválida')
})
