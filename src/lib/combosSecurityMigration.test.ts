// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

let db: PGlite
const kiosco = '10000000-0000-0000-0000-000000000001'
const otro = '10000000-0000-0000-0000-000000000002'
const padre = '20000000-0000-0000-0000-000000000001'
const componente = '20000000-0000-0000-0000-000000000002'
const ajeno = '20000000-0000-0000-0000-000000000003'

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE FUNCTION auth_user_kiosco_id() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('app.kiosco',true),'')::uuid $$;
    CREATE FUNCTION auth_es_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION auth_es_dueno_o_superadmin() RETURNS boolean LANGUAGE sql AS $$
      SELECT current_setting('app.rol',true)='DUEÑO' $$;
    CREATE TABLE productos(id uuid PRIMARY KEY,kiosco_id uuid);
    INSERT INTO productos VALUES('${padre}','${kiosco}'),('${componente}','${kiosco}'),('${ajeno}','${otro}');
    GRANT SELECT ON productos TO authenticated;
    CREATE TABLE combo_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid,
      combo_producto_id uuid REFERENCES productos(id),componente_producto_id uuid REFERENCES productos(id),cantidad numeric);
    INSERT INTO combo_items(kiosco_id,combo_producto_id,componente_producto_id,cantidad)
      VALUES('${kiosco}','${padre}','${componente}',1);`)
  const sql = readFileSync('supabase_fase_seguridad_combos.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  // Simula reaplicar la política permisiva del script antiguo después de la protección.
  await db.exec('CREATE POLICY legacy_allow_all ON combo_items FOR ALL USING(true) WITH CHECK(true)')
}, 30000)
beforeEach(async () => {
  await db.exec(`RESET ROLE; SET app.kiosco='${kiosco}'; SET app.rol='DUEÑO'; SET ROLE authenticated;`)
})
afterAll(async () => db?.close())

it('mantiene aislado el otro comercio aunque exista una política antigua permisiva', async () => {
  expect((await db.query('SELECT * FROM combo_items')).rows).toHaveLength(1)
  await db.exec(`SET app.kiosco='${otro}'`)
  expect((await db.query('SELECT * FROM combo_items')).rows).toHaveLength(0)
  await expect(db.query('INSERT INTO combo_items(kiosco_id,combo_producto_id,componente_producto_id,cantidad) VALUES($1,$2,$3,1)',
    [kiosco,padre,componente])).rejects.toThrow('row-level security')
})

it('permite lectura al cajero y bloquea la modificación de componentes', async () => {
  await db.exec("SET app.rol='CAJERO'")
  expect((await db.query('SELECT * FROM combo_items')).rows).toHaveLength(1)
  expect((await db.query('UPDATE combo_items SET cantidad=2 RETURNING id')).rows).toHaveLength(0)
  expect((await db.query('DELETE FROM combo_items RETURNING id')).rows).toHaveLength(0)
})

it('rechaza componentes ajenos y acceso anónimo incluso con un grant posterior', async () => {
  await expect(db.query('INSERT INTO combo_items(kiosco_id,combo_producto_id,componente_producto_id,cantidad) VALUES($1,$2,$3,1)',
    [kiosco,padre,ajeno])).rejects.toThrow('row-level security')
  await db.exec('RESET ROLE; GRANT SELECT ON combo_items TO anon; SET ROLE anon')
  expect((await db.query('SELECT * FROM combo_items')).rows).toHaveLength(0)
})

it('permite cantidades físicas válidas al dueño y rechaza cantidades no finitas o imprecisas', async () => {
  expect((await db.query('UPDATE combo_items SET cantidad=0.125 RETURNING cantidad')).rows)
    .toEqual([{ cantidad: '0.125' }])
  for (const cantidad of ['0','-1','NaN','Infinity','1.0001']) {
    await expect(db.query('INSERT INTO combo_items(kiosco_id,combo_producto_id,componente_producto_id,cantidad) VALUES($1,$2,$3,$4::numeric)',
      [kiosco,padre,componente,cantidad])).rejects.toThrow('row-level security')
  }
})
