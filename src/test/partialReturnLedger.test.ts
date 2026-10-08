// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, expect, it } from 'vitest'

let db: PGlite
const id = '11111111-1111-4111-8111-111111111111'
const venta = '22222222-2222-4222-8222-222222222222'
const kiosco = '33333333-3333-4333-8333-333333333333'
const actor = '44444444-4444-4444-8444-444444444444'
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE TABLE kioscos(id uuid PRIMARY KEY);
    CREATE TABLE ventas(id uuid PRIMARY KEY, kiosco_id uuid NOT NULL REFERENCES kioscos(id));
    INSERT INTO kioscos VALUES('${kiosco}'); INSERT INTO ventas VALUES('${venta}','${kiosco}');`)
  const sql = readFileSync('supabase_fase_devolucion_registro_privado.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql)
}, 30_000)
afterAll(async () => { await db.close() })
const insertar = (solicitud: unknown, resultado: unknown) => db.query(`INSERT INTO devoluciones_parciales_atomicas
  (id,venta_id,kiosco_id,actor_auth_id,solicitud,resultado) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
  [id, venta, kiosco, actor, JSON.stringify(solicitud), JSON.stringify(resultado)])
const solicitud = { version: 1, id, ventaId: venta, items: [{ detalleId: 'a', cantidad: 1 }] }
const resultado = { id, venta_id: venta, kiosco_id: kiosco, monto_total: 1, detalles: [{ detalle_id: 'a', cantidad: 1, importe: 1 }] }
it('conserva solicitud/resultado y exige identidad coherente y UUID único', async () => {
  await insertar(solicitud, resultado)
  await expect(insertar({ ...solicitud, items: [] }, resultado)).rejects.toThrow('duplicate key')
  expect((await db.query('SELECT solicitud,resultado FROM devoluciones_parciales_atomicas')).rows).toEqual([{ solicitud, resultado }])
  await db.exec('DELETE FROM devoluciones_parciales_atomicas')
})
it.each([
  { entrada: { ...solicitud, id: venta }, salida: resultado },
  { entrada: { ...solicitud, ventaId: id }, salida: resultado },
  { entrada: solicitud, salida: { ...resultado, kiosco_id: venta } },
  { entrada: solicitud, salida: null },
  { entrada: { version: 1, items: [] }, salida: resultado },
])('rechaza identidad de registro inconsistente %j', async ({ entrada, salida }) => {
  await expect(insertar(entrada, salida)).rejects.toThrow()
})
it('impide registrar una venta bajo otro comercio aunque el JSON coincida', async () => {
  const otro = '55555555-5555-4555-8555-555555555555'
  await db.exec(`INSERT INTO kioscos VALUES('${otro}')`)
  await expect(db.query(`INSERT INTO devoluciones_parciales_atomicas
    (id,venta_id,kiosco_id,actor_auth_id,solicitud,resultado) VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb)`,
    [id, venta, otro, actor, JSON.stringify(solicitud), JSON.stringify({ ...resultado, kiosco_id: otro })])).rejects.toThrow('foreign key')
})
it('un fallo de transacción no conserva una confirmación', async () => {
  await db.exec('BEGIN')
  await insertar(solicitud, resultado)
  await expect(db.exec('SELECT 1/0')).rejects.toThrow()
  await db.exec('ROLLBACK')
  expect((await db.query('SELECT count(*)::int n FROM devoluciones_parciales_atomicas')).rows).toEqual([{ n: 0 }])
})
it('revoca permisos API por tabla y columnas, incluida una concesión PUBLIC previa', async () => {
  await db.exec('GRANT UPDATE(resultado), SELECT(solicitud) ON devoluciones_parciales_atomicas TO PUBLIC')
  await db.exec(readFileSync('supabase_fase_devolucion_registro_privado.sql', 'utf8'))
  const { rows } = await db.query<{ rls: boolean; escribe: boolean; lee: boolean }>(`SELECT c.relrowsecurity rls,
    has_table_privilege(r.oid,c.oid,'SELECT') OR has_any_column_privilege(r.oid,c.oid,'SELECT') lee,
    has_table_privilege(r.oid,c.oid,'INSERT,UPDATE,DELETE') OR has_any_column_privilege(r.oid,c.oid,'INSERT,UPDATE') escribe
    FROM pg_class c CROSS JOIN pg_roles r WHERE c.oid='devoluciones_parciales_atomicas'::regclass
      AND r.rolname IN ('anon','authenticated','service_role')`)
  expect(rows).toHaveLength(3)
  expect(rows.every(r => r.rls && !r.escribe && !r.lee)).toBe(true)
  await db.exec('SET ROLE authenticated')
  try { await expect(insertar(solicitud, resultado)).rejects.toThrow('permission denied') }
  finally { await db.exec('RESET ROLE') }
})
