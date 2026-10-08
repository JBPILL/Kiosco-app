// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

const venta = '10000000-0000-0000-0000-000000000001'
const anterior = '10000000-0000-0000-0000-000000000002'
const comercio = '20000000-0000-0000-0000-000000000001'
const sql = readFileSync('supabase_fase_checkout_manual_inmutabilidad.sql', 'utf8')
let db: PGlite

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`
    CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth_user_kiosco_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${comercio}'::uuid $$;
    CREATE FUNCTION auth_es_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION auth_es_dueno_o_superadmin() RETURNS boolean LANGUAGE sql AS $$
      SELECT current_setting('test.dueno',true)='true' $$;
    CREATE TABLE checkout_manual_entradas(id uuid PRIMARY KEY,kiosco_id uuid);
    CREATE TABLE checkout_manuales(id uuid PRIMARY KEY,venta_id uuid,kiosco_id uuid);
    CREATE TABLE ventas(id uuid PRIMARY KEY,kiosco_id uuid,total numeric);
    CREATE TABLE detalles_venta(id uuid PRIMARY KEY,venta_id uuid,cantidad numeric);
    CREATE TABLE pagos_venta(id uuid PRIMARY KEY,venta_id uuid,monto numeric);
    INSERT INTO checkout_manual_entradas VALUES ('${venta}','${comercio}');
    GRANT SELECT,INSERT,UPDATE,DELETE ON ventas,detalles_venta,pagos_venta TO authenticated;
    CREATE POLICY anterior ON ventas FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY anterior ON detalles_venta FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE POLICY anterior ON pagos_venta FOR ALL TO authenticated USING(true) WITH CHECK(true);
    CREATE FUNCTION cierre_backend_prueba(p_id uuid) RETURNS void LANGUAGE sql
      SECURITY DEFINER SET search_path=pg_catalog,public AS $$
      UPDATE public.pagos_venta SET monto=100 WHERE venta_id=p_id;
    $$;
    REVOKE ALL ON FUNCTION cierre_backend_prueba(uuid) FROM PUBLIC,anon,authenticated;
    GRANT EXECUTE ON FUNCTION cierre_backend_prueba(uuid) TO service_role;
  `)
  await db.exec(sql)
  await db.exec(sql)
}, 30_000)

beforeEach(async () => {
  await db.exec(`RESET ROLE; SET test.dueno='false';
    DELETE FROM checkout_manual_entradas; DELETE FROM checkout_manuales;
    INSERT INTO checkout_manual_entradas VALUES ('${venta}','${comercio}');
    DELETE FROM ventas; DELETE FROM detalles_venta; DELETE FROM pagos_venta;
    INSERT INTO ventas VALUES ('${venta}','${comercio}',100),('${anterior}','${comercio}',50);
    INSERT INTO detalles_venta VALUES ('${venta}','${venta}',1),('${anterior}','${anterior}',1);
    INSERT INTO pagos_venta VALUES ('${venta}','${venta}',100),('${anterior}','${anterior}',50);
    SET ROLE authenticated;`)
})
afterAll(async () => { await db?.close() })

it.each([
  ['ventas','id','total'],
  ['detalles_venta','venta_id','cantidad'],
  ['pagos_venta','venta_id','monto'],
])('conserva lectura y bloquea cambios y borrado del cajero en %s', async (tabla,columna,valor) => {
  expect((await db.query(`SELECT * FROM ${tabla}`)).rows).toHaveLength(2)
  expect((await db.query(`UPDATE ${tabla} SET ${valor}=999 WHERE ${columna}='${venta}' RETURNING id`)).rows).toHaveLength(0)
  expect((await db.query(`DELETE FROM ${tabla} WHERE ${columna}='${venta}' RETURNING id`)).rows).toHaveLength(0)
  expect((await db.query(`UPDATE ${tabla} SET ${valor}=60 WHERE ${columna}='${anterior}' RETURNING id`)).rows).toHaveLength(1)
})

it.each(['detalles_venta','pagos_venta'])('rechaza agregar o mover filas a una venta protegida en %s', async (tabla) => {
  await expect(db.exec(`INSERT INTO ${tabla}(id,venta_id) VALUES (gen_random_uuid(),'${venta}')`)).rejects.toThrow(/row-level security/)
  await expect(db.exec(`UPDATE ${tabla} SET venta_id='${venta}' WHERE id='${anterior}'`)).rejects.toThrow(/row-level security/)
})

it('impide insertar cabecera preparada y conserva operaciones del dueño', async () => {
  await db.exec('RESET ROLE')
  await db.exec(`DELETE FROM ventas WHERE id='${venta}'; SET ROLE authenticated`)
  await expect(db.exec(`INSERT INTO ventas VALUES ('${venta}','${comercio}',100)`)).rejects.toThrow(/row-level security/)
  await db.exec("SET test.dueno='true'")
  await db.exec(`INSERT INTO ventas VALUES ('${venta}','${comercio}',100)`)
  expect((await db.query(`UPDATE ventas SET total=90 WHERE id='${venta}' RETURNING id`)).rows).toHaveLength(1)
})

it('protege también el registro de cierre y no revela identidades de otro comercio', async () => {
  await db.exec(`RESET ROLE;
    DELETE FROM checkout_manual_entradas;
    INSERT INTO checkout_manuales VALUES ('${venta}','${venta}','${comercio}');
    INSERT INTO checkout_manual_entradas VALUES ('30000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001');
    SET ROLE authenticated;`)
  expect((await db.query(`DELETE FROM pagos_venta WHERE venta_id='${venta}' RETURNING id`)).rows).toHaveLength(0)
  expect((await db.query<{ protegida: boolean }>(`SELECT venta_checkout_manual_protegida('30000000-0000-0000-0000-000000000001') AS protegida`)).rows[0].protegida).toBe(false)
})

it('permite escritura del backend privado sin conceder ejecución al cajero', async () => {
  await expect(db.exec(`SELECT cierre_backend_prueba('${venta}')`)).rejects.toThrow(/permission denied/)
  await db.exec(`RESET ROLE; SET ROLE service_role; SELECT cierre_backend_prueba('${venta}'); RESET ROLE`)
  expect((await db.query<{ monto: string }>(`SELECT monto FROM pagos_venta WHERE venta_id='${venta}'`)).rows[0].monto).toBe('100')
})
