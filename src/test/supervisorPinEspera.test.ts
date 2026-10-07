// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
const kid = '10000000-0000-0000-0000-000000000001'
const actor = '20000000-0000-0000-0000-000000000001'
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY);
    CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid REFERENCES kioscos,activo boolean,rol text);
    INSERT INTO kioscos VALUES('${kid}'); INSERT INTO usuarios VALUES('${actor}','${actor}','${kid}',true,'DUEÑO');`)
  for (const archivo of ['supabase_fase_supervisor_pin_privado.sql', 'supabase_fase_supervisor_pin_intentos.sql', 'supabase_fase_supervisor_autorizacion_descuento.sql', 'supabase_fase_supervisor_pin_espera.sql', 'supabase_fase_supervisor_pin_espera.sql']) {
    await db.exec(readFileSync(archivo, 'utf8'))
  }
}, 30000)
beforeEach(async () => {
  await db.exec("RESET ROLE; SET request.jwt.claim.role='service_role'; DELETE FROM supervisor_autorizaciones; DELETE FROM supervisor_pin_intentos; DELETE FROM supervisor_pin_limites; DELETE FROM supervisor_pin_secretos;")
  const hash = { version: 1, algoritmo: 'PBKDF2-SHA256', iteraciones: 600000, sal: 'a'.repeat(32), hash: 'b'.repeat(64), pepperVersion: '1' }
  await db.query('SELECT configurar_hash_pin_supervisor($1::uuid,$2::jsonb)', [actor, JSON.stringify(hash)])
})
afterAll(async () => { await db.close() })
async function reservar() {
  return (await db.query<{ datos: { estado: string; id?: string; reintentar_en?: string; pin_hash?: unknown } }>('SELECT reservar_intento_pin_supervisor($1::uuid) AS datos', [actor])).rows[0].datos
}
it('espera inicial sin entregar hash ni aumentar intentos durante el bloqueo', async () => {
  expect((await reservar()).estado).toBe('RESERVADO')
  const bloqueado = await reservar()
  expect(bloqueado.estado).toBe('BLOQUEADO')
  expect(bloqueado.reintentar_en).toBeTruthy()
  expect(bloqueado.pin_hash).toBeUndefined()
  expect((await db.query<{ intentos: number }>('SELECT intentos FROM supervisor_pin_limites')).rows.map(r => r.intentos)).toEqual([1, 1])
})
it('aumenta la espera a cuatro segundos tras otro intento fallido', async () => {
  const primero = await reservar()
  await db.query('SELECT finalizar_intento_pin_supervisor($1::uuid,$2::uuid,false)', [actor, primero.id])
  await db.exec("UPDATE supervisor_pin_limites SET reintentar_en=clock_timestamp()-interval '1 second'")
  expect((await reservar()).estado).toBe('RESERVADO')
  const fila = (await db.query<{ segundos: number }>("SELECT extract(epoch FROM reintentar_en-clock_timestamp()) AS segundos FROM supervisor_pin_limites WHERE clave LIKE '%:actor:%'")).rows[0]
  expect(Number(fila.segundos)).toBeGreaterThan(3)
  expect(Number(fila.segundos)).toBeLessThanOrEqual(4)
})
it('éxito libera espera propia y una repetición de finalización no descuenta otra vez', async () => {
  const primero = await reservar()
  await db.query('SELECT finalizar_intento_pin_supervisor($1::uuid,$2::uuid,true)', [actor, primero.id])
  await db.query('SELECT finalizar_intento_pin_supervisor($1::uuid,$2::uuid,true)', [actor, primero.id])
  expect((await reservar()).estado).toBe('RESERVADO')
})
it('una reserva abandonada conserva espera y el cliente no puede borrarla', async () => {
  await reservar()
  await db.exec("SET ROLE authenticated; SET request.jwt.claim.role='authenticated'")
  await expect(db.exec('UPDATE supervisor_pin_limites SET reintentar_en=NULL')).rejects.toThrow(/permission denied/)
})
