// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

let db: PGlite
const kiosco = '10000000-0000-0000-0000-000000000001'
const otro = '10000000-0000-0000-0000-000000000002'
const guardar = (tipos: unknown, comercio = kiosco) => db.query(
  'SELECT guardar_precios_envases($1::uuid,$2::jsonb)', [comercio, JSON.stringify(tipos)],
)
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('app.uid',true),'')::uuid $$;
    CREATE FUNCTION auth_user_kiosco_id() RETURNS uuid LANGUAGE sql AS $$
      SELECT nullif(current_setting('app.kiosco',true),'')::uuid $$;
    CREATE FUNCTION auth_es_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION auth_es_dueno_o_superadmin() RETURNS boolean LANGUAGE sql AS $$
      SELECT current_setting('app.rol',true)='DUEÑO' $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY);
    INSERT INTO kioscos VALUES('${kiosco}'),('${otro}');`)
  const sql = readFileSync('supabase_fase_envases_precios_compartidos.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql)
}, 30000)
beforeEach(async () => {
  await db.exec(`RESET ROLE; DELETE FROM envases_tipos_comercio;
    SET app.uid='20000000-0000-0000-0000-000000000001';
    SET app.kiosco='${kiosco}'; SET app.rol='DUEÑO'; SET ROLE authenticated;`)
})
afterAll(async () => db?.close())

it('guarda precios y desactiva tipos retirados al reemplazar el catálogo', async () => {
  await guardar([{ id: '1lt', nombre: 'Botella', precio: 50 }, { id: '2lt', nombre: 'Grande', precio: 100 }])
  await guardar([{ id: '1lt', nombre: 'Botella', precio: 60 }])
  const resultado = await db.query('SELECT id,precio,activo FROM envases_tipos_comercio ORDER BY id')
  expect(resultado.rows).toEqual([{ id: '1lt', precio: '60.00', activo: true },
    { id: '2lt', precio: '100.00', activo: false }])
})

it('revierte todo el reemplazo si un tipo es inválido', async () => {
  await guardar([{ id: '1lt', nombre: 'Botella', precio: 50 }])
  await expect(guardar([{ id: '1lt', nombre: 'Botella', precio: 60 },
    { id: '1lt', nombre: 'Repetido', precio: 70 }])).rejects.toThrow('inválido')
  expect((await db.query('SELECT precio FROM envases_tipos_comercio')).rows).toEqual([{ precio: '50.00' }])
})

it('impide escritura directa, otro comercio y actualización por cajero', async () => {
  await expect(db.query("INSERT INTO envases_tipos_comercio VALUES($1,'x','x',1,true,now())", [kiosco]))
    .rejects.toThrow('permission denied')
  await expect(guardar([], otro)).rejects.toThrow('No autorizado')
  await db.exec("SET app.rol='CAJERO'")
  await expect(guardar([])).rejects.toThrow('No autorizado')
})
