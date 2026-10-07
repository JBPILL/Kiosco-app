// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
const kid = '10000000-0000-0000-0000-000000000001'
const dueno = '20000000-0000-0000-0000-000000000001'
const cajero = '20000000-0000-0000-0000-000000000002'
const hash = { version: 1, algoritmo: 'PBKDF2-SHA256', iteraciones: 600000, sal: 'a'.repeat(32), hash: 'b'.repeat(64), pepperVersion: '1' }
let db: PGlite
beforeAll(async () => {
 db = new PGlite()
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
 CREATE TABLE kioscos(id uuid PRIMARY KEY);
 CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid REFERENCES kioscos,activo boolean,rol text);
 INSERT INTO kioscos VALUES('${kid}');
 INSERT INTO usuarios VALUES('${dueno}','${dueno}','${kid}',true,'DUEÑO'),('${cajero}','${cajero}','${kid}',true,'CAJERO');`)
 await db.exec(readFileSync('supabase_fase_supervisor_pin_privado.sql', 'utf8'))
 await db.exec(readFileSync('supabase_fase_supervisor_pin_privado.sql', 'utf8'))
}, 30000)
beforeEach(async () => {
 await db.exec(`RESET ROLE; SET request.jwt.claim.role='service_role'; DELETE FROM supervisor_pin_config_auditoria; DELETE FROM supervisor_pin_secretos; UPDATE usuarios SET activo=true;`)
})
afterAll(async () => { await db.close() })
async function configurar(actor = dueno, datos: unknown = hash) {
 return db.query<{ revision: number }>('SELECT configurar_hash_pin_supervisor($1::uuid,$2::jsonb) AS revision', [actor, JSON.stringify(datos)])
}
it('configura y cambia revisión con auditoría sin PIN ni hash en el registro de auditoría', async () => {
 expect((await configurar()).rows[0].revision).toBe(1)
 expect((await configurar()).rows[0].revision).toBe(2)
 const filas = (await db.query('SELECT * FROM supervisor_pin_config_auditoria ORDER BY revision')).rows
 expect(filas).toHaveLength(2)
 expect(filas[1]).toMatchObject({ kiosco_id: kid, revision: 2, actor_auth_id: dueno })
 expect(Object.keys(filas[1] as object)).not.toContain('pin_hash')
})
it('rechaza actor cajero e inactivo', async () => {
 await expect(configurar(cajero)).rejects.toThrow(/Solo el dueño/)
 await db.exec(`UPDATE usuarios SET activo=false WHERE id='${dueno}'`)
 await expect(configurar()).rejects.toThrow(/Perfil no disponible/)
})
it.each([null, { ...hash, iteraciones: 1 }, { ...hash, sal: '00' }, { ...hash, extra: 'PIN' }, { ...hash, hash: 1234 }])('rechaza hash malformado %#', async datos => {
 await expect(configurar(dueno, datos)).rejects.toThrow(/Hash inválido/)
 expect((await db.query('SELECT * FROM supervisor_pin_secretos')).rows).toHaveLength(0)
})
it('el cliente autenticado no lee el hash ni configura o escribe tablas privadas', async () => {
 await configurar()
 await db.exec("SET ROLE authenticated; SET request.jwt.claim.role='authenticated'")
 await expect(db.query('SELECT * FROM supervisor_pin_secretos')).rejects.toThrow(/permission denied/)
 await expect(configurar()).rejects.toThrow(/permission denied/)
 await expect(db.query('DELETE FROM supervisor_pin_config_auditoria')).rejects.toThrow(/permission denied/)
})
