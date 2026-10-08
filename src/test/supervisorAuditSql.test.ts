// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
const kid = '10000000-0000-0000-0000-000000000001'
const otroKid = '10000000-0000-0000-0000-000000000002'
const dueno = '20000000-0000-0000-0000-000000000001'
const cajero = '20000000-0000-0000-0000-000000000002'
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY);
    CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid REFERENCES kioscos,activo boolean,rol text);
    INSERT INTO kioscos VALUES('${kid}'),('${otroKid}');
    INSERT INTO usuarios VALUES('${dueno}','${dueno}','${kid}',true,'DUEÑO'),('${cajero}','${cajero}','${kid}',true,'CAJERO');`)
  for (const archivo of ['supabase_fase_supervisor_pin_privado.sql', 'supabase_fase_supervisor_pin_intentos.sql', 'supabase_fase_supervisor_autorizacion_descuento.sql', 'supabase_fase_supervisor_auditoria_consulta.sql', 'supabase_fase_supervisor_politica_descuento.sql', 'supabase_fase_supervisor_auditoria_politica.sql', 'supabase_fase_supervisor_auditoria_politica.sql']) {
    await db.exec(readFileSync(archivo, 'utf8'))
  }
}, 30000)
beforeEach(async () => {
  await db.exec(`RESET ROLE; SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='${dueno}'; UPDATE usuarios SET activo=true;
    DELETE FROM supervisor_pin_config_auditoria;
    DELETE FROM supervisor_politica_auditoria;
    INSERT INTO supervisor_pin_config_auditoria(kiosco_id,revision,actor_auth_id) VALUES('${kid}',1,'${dueno}'),('${otroKid}',2,'${cajero}');`)
})
afterAll(async () => { await db.close() })
it('devuelve sólo eventos propios, sin hash ni solicitud comercial', async () => {
  await db.exec('SET ROLE authenticated')
  const filas = (await db.query<Record<string, unknown>>('SELECT * FROM consultar_auditoria_supervisor()')).rows
  expect(filas).toHaveLength(1)
  expect(filas[0]).toMatchObject({ evento: 'CONFIGURACION_PIN', resultado: 'CONFIGURADO', revision: 1 })
  expect(Object.keys(filas[0])).toEqual(['id','fecha','evento','resultado','accion','actor_auth_id','revision'])
  await expect(db.query('SELECT * FROM supervisor_pin_config_auditoria')).rejects.toThrow(/permission denied/)
})
it.each([0,101,null])('rechaza límite inválido %s', async limite => {
  await expect(db.query('SELECT * FROM consultar_auditoria_supervisor($1)', [limite])).rejects.toThrow(/Límite/)
})
it('rechaza cajero e identidad inactiva', async () => {
  await db.exec(`SET request.jwt.claim.sub='${cajero}'`)
  await expect(db.query('SELECT * FROM consultar_auditoria_supervisor()')).rejects.toThrow(/dueño/)
  await db.exec(`SET request.jwt.claim.sub='${dueno}'; UPDATE usuarios SET activo=false WHERE id='${dueno}'`)
  await expect(db.query('SELECT * FROM consultar_auditoria_supervisor()')).rejects.toThrow(/Perfil/)
})
it('sin identidad y como anónimo no puede consultar', async () => {
  await db.exec("SET request.jwt.claim.sub=''")
  await expect(db.query('SELECT * FROM consultar_auditoria_supervisor()')).rejects.toThrow(/Sesión/)
  await db.exec('SET ROLE anon')
  await expect(db.query('SELECT * FROM consultar_auditoria_supervisor()')).rejects.toThrow(/permission denied/)
})
it('incluye cambios de política propios con ambos valores y oculta el comercio ajeno', async () => {
  await db.exec(`INSERT INTO supervisor_politica_auditoria(kiosco_id,actor_auth_id,umbral_anterior,umbral_nuevo,revision)
    VALUES('${kid}','${dueno}',15,10.25,1),('${otroKid}','${cajero}',15,50,1); SET ROLE authenticated`)
  const filas = (await db.query<Record<string, unknown>>('SELECT * FROM consultar_auditoria_supervisor()')).rows
  expect(filas).toHaveLength(2)
  expect(filas.find(fila => fila.evento === 'POLITICA_DESCUENTO')).toMatchObject({ resultado: 'CONFIGURADO', accion: 'UMBRAL 15.00 -> 10.25', actor_auth_id: dueno, revision: 1 })
  await expect(db.query('SELECT * FROM supervisor_politica_auditoria')).rejects.toThrow(/permission denied/)
})
