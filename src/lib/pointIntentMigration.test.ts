// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

let db: PGlite
const kiosco = '10000000-0000-0000-0000-000000000001'
const intento = '20000000-0000-0000-0000-000000000001'
const checkout = '30000000-0000-0000-0000-000000000001'
const preparar = (id = intento, monto = 15000) => db.query<{ resultado: { id: string; estado: string } }>(
  'SELECT preparar_intento_point($1::uuid,$2::uuid,$3::uuid,$4,$5::bigint,$6::jsonb) AS resultado',
  [id, kiosco, checkout, 'terminal', monto, JSON.stringify({ items: [] })],
)

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY);
    CREATE TABLE ventas(id uuid PRIMARY KEY);
    INSERT INTO kioscos VALUES('${kiosco}');`)
  const sql = readFileSync('supabase_fase_point_intentos.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const notificaciones = readFileSync('supabase_fase_point_notificaciones.sql', 'utf8')
  await db.exec(notificaciones)
  await db.exec(notificaciones)
}, 30000)

beforeEach(async () => {
  await db.exec("RESET ROLE; DELETE FROM point_notificaciones; DELETE FROM point_intentos; SET request.jwt.claim.role='service_role'; SET ROLE service_role;")
})
afterAll(async () => db?.close())

it('reserva el intento y devuelve el mismo registro en reintentos', async () => {
  expect((await preparar()).rows[0].resultado).toMatchObject({ id: intento, estado: 'PREPARADO' })
  await preparar()
  expect((await db.query('SELECT id FROM point_intentos')).rows).toHaveLength(1)
})

it('rechaza reutilizar el intento con otro importe y bloquea un segundo intento activo', async () => {
  await preparar()
  await expect(preparar(intento, 20000)).rejects.toThrow('otra solicitud')
  await expect(preparar('20000000-0000-0000-0000-000000000002')).rejects.toThrow('point_checkout_activo')
})

it('un resultado incierto bloquea un cobro nuevo; una cancelación confirmada permite otro intento', async () => {
  await preparar()
  await db.query("UPDATE point_intentos SET estado='CONCILIAR' WHERE id=$1", [intento])
  const otro = '20000000-0000-0000-0000-000000000002'
  await expect(preparar(otro)).rejects.toThrow('point_checkout_activo')
  await db.query("UPDATE point_intentos SET estado='CANCELADO' WHERE id=$1", [intento])
  await preparar(otro)
  expect((await db.query('SELECT id FROM point_intentos')).rows).toHaveLength(2)
})

it('no permite al navegador leer ni escribir intentos ni ejecutar la reserva', async () => {
  for (const rol of ['authenticated', 'anon']) {
    await db.exec(`RESET ROLE; SET request.jwt.claim.role='${rol}'; SET ROLE ${rol};`)
    await expect(db.query('SELECT * FROM point_intentos')).rejects.toThrow('permission denied')
    await expect(preparar()).rejects.toThrow('permission denied')
    await expect(db.query('SELECT * FROM point_notificaciones')).rejects.toThrow('permission denied')
    await expect(db.query("SELECT registrar_notificacion_point('123','ORD123','req-1','123')")).rejects.toThrow('permission denied')
  }
})

it('guarda una sola recepción por identidad firmada y conserva el trabajo pendiente', async () => {
  const recibir = () => db.query<{ id: string }>("SELECT registrar_notificacion_point('123','ORD123','req-1','123') AS id")
  const primera = (await recibir()).rows[0].id
  expect((await recibir()).rows[0].id).toBe(primera)
  expect((await db.query('SELECT estado FROM point_notificaciones')).rows).toEqual([{ estado: 'PENDIENTE' }])
})

it('rechaza importes inválidos', async () => {
  await expect(preparar(intento, 0)).rejects.toThrow('check constraint')
})
