// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
const kid = '10000000-0000-0000-0000-000000000001'
const otro = '10000000-0000-0000-0000-000000000002'
const dueno = '20000000-0000-0000-0000-000000000001'
const cajero = '20000000-0000-0000-0000-000000000002'
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS; CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY);
    CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid REFERENCES kioscos,activo boolean,rol text);
    INSERT INTO kioscos VALUES('${kid}'),('${otro}');
    INSERT INTO usuarios VALUES('${dueno}','${dueno}','${kid}',true,'DUEÑO'),('${cajero}','${cajero}','${kid}',true,'CAJERO');`)
  const sql = readFileSync('supabase_fase_supervisor_politica_descuento.sql', 'utf8')
  await db.exec(sql); await db.exec(sql)
}, 30000)
beforeEach(async () => {
  await db.exec(`RESET ROLE; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='${dueno}';
    DELETE FROM supervisor_politica_auditoria; DELETE FROM supervisor_politicas; UPDATE usuarios SET activo=true;`)
})
afterAll(async () => { await db.close() })
it('conserva 15 como default y una revisión explícita sin configurar', async () => {
  await db.exec('SET ROLE authenticated')
  expect((await db.query<{ politica: unknown }>('SELECT consultar_politica_descuento_supervisor() AS politica')).rows[0].politica)
    .toEqual({ umbralPorcentaje: 15, revision: 0 })
})
it('dueño configura su comercio y registra valores anterior/nuevo con identidad de sesión', async () => {
  await db.exec(`INSERT INTO supervisor_politicas VALUES('${otro}',40,1,clock_timestamp(),'${cajero}'); SET ROLE authenticated`)
  await db.query('SELECT configurar_politica_descuento_supervisor(10.25)')
  await db.query('SELECT configurar_politica_descuento_supervisor(20)')
  await db.exec('RESET ROLE')
  const registros = (await db.query('SELECT * FROM supervisor_politica_auditoria ORDER BY revision')).rows
  expect(registros).toHaveLength(2)
  expect(registros[0]).toMatchObject({ kiosco_id: kid, actor_auth_id: dueno, umbral_anterior: '15.00', umbral_nuevo: '10.25', revision: 1 })
  expect(registros[1]).toMatchObject({ umbral_anterior: '10.25', umbral_nuevo: '20.00', revision: 2 })
  expect((await db.query('SELECT umbral_descuento FROM supervisor_politicas WHERE kiosco_id=$1', [otro])).rows[0]).toMatchObject({ umbral_descuento: '40.00' })
})
it('cajero consulta su política pero no puede modificarla ni leer tablas privadas', async () => {
  await db.exec(`SET request.jwt.claim.sub='${cajero}'; SET ROLE authenticated`)
  await expect(db.query('SELECT consultar_politica_descuento_supervisor()')).resolves.toBeTruthy()
  await expect(db.query('SELECT configurar_politica_descuento_supervisor(30)')).rejects.toThrow(/dueño/)
  await expect(db.query('SELECT * FROM supervisor_politicas')).rejects.toThrow(/permission denied/)
  await expect(db.query('SELECT * FROM supervisor_politica_auditoria')).rejects.toThrow(/permission denied/)
})
it.each([-1,101,10.001,null,'NaN'])('rechaza umbral inválido %s sin escritura parcial', async valor => {
  await expect(db.query('SELECT configurar_politica_descuento_supervisor($1::numeric)', [valor])).rejects.toThrow(/Umbral/)
  expect((await db.query('SELECT * FROM supervisor_politica_auditoria')).rows).toHaveLength(0)
  expect((await db.query('SELECT * FROM supervisor_politicas')).rows).toHaveLength(0)
})
it('rechaza sesión ausente, dueño inactivo y acceso anónimo', async () => {
  await db.exec(`UPDATE usuarios SET activo=false WHERE id='${dueno}'`)
  await expect(db.query('SELECT configurar_politica_descuento_supervisor(10)')).rejects.toThrow(/Perfil/)
  await db.exec("SET request.jwt.claim.sub=''")
  await expect(db.query('SELECT consultar_politica_descuento_supervisor()')).rejects.toThrow(/Sesión/)
  await db.exec('SET ROLE anon')
  await expect(db.query('SELECT consultar_politica_descuento_supervisor()')).rejects.toThrow(/permission denied/)
})
it('rechaza identidad ambigua aunque ambos perfiles sean dueños', async () => {
  await db.exec(`INSERT INTO usuarios VALUES('20000000-0000-0000-0000-000000000003','${dueno}','${otro}',true,'DUEÑO')`)
  try {
    await expect(db.query('SELECT configurar_politica_descuento_supervisor(10)')).rejects.toThrow(/Perfil/)
    await expect(db.query('SELECT consultar_politica_descuento_supervisor()')).rejects.toThrow(/Perfil/)
  } finally {
    await db.exec("DELETE FROM usuarios WHERE id='20000000-0000-0000-0000-000000000003'")
  }
})
it('no concede escritura directa ni al dueño ni al servidor de cotización', async () => {
  for (const rol of ['authenticated','service_role']) {
    await db.exec(`SET ROLE ${rol}`)
    await expect(db.query('UPDATE supervisor_politicas SET umbral_descuento=100')).rejects.toThrow(/permission denied/)
    await expect(db.query('DELETE FROM supervisor_politica_auditoria')).rejects.toThrow(/permission denied/)
    await db.exec('RESET ROLE')
  }
})
