// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

let db: PGlite
const kiosco = '10000000-0000-0000-0000-000000000001'
const intento = '20000000-0000-0000-0000-000000000001'
const checkout = '30000000-0000-0000-0000-000000000001'
const preparar = (id = intento, monto = 15000) => db.query<{ resultado: { id: string; estado: string } }>(
  "SELECT preparar_intento_point($1::uuid,$2::uuid,$3::uuid,$4,$5::bigint,$6::jsonb,'123','456','sandbox') AS resultado",
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
  await db.exec(readFileSync('supabase_fase_point_procesamiento.sql', 'utf8'))
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
    await expect(db.query("SELECT aplicar_resultado_point(NULL,NULL,NULL,'123','ORD123','PENDIENTE',NULL)")).rejects.toThrow('permission denied')
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

it('conserva cuenta, aplicación, modo e importe ante actualizaciones directas', async () => {
  await preparar()
  for (const [columna, valor] of [['account_id', '999'], ['application_id', '999'], ['modo', 'production'], ['monto_centavos', '20000']]) {
    await expect(db.query(`UPDATE point_intentos SET ${columna}=$1 WHERE id=$2`, [valor, intento])).rejects.toThrow('identidad del intento')
  }
  expect((await db.query('SELECT account_id,application_id,modo,monto_centavos FROM point_intentos')).rows).toEqual([
    { account_id: '456', application_id: '123', modo: 'sandbox', monto_centavos: 15000 },
  ])
})

it('rechaza crear un intento nuevo sin cuenta incluso desde el servicio', async () => {
  await expect(db.query(
    "INSERT INTO point_intentos(id,kiosco_id,checkout_id,terminal_id,monto_centavos,solicitud) VALUES($1,$2,$3,'terminal',15000,'{}')",
    [intento, kiosco, checkout],
  )).rejects.toThrow('Falta la identidad de la cuenta Point')
})

it('aplica pago y recepción en una transacción y no revierte un pago por un mensaje tardío', async () => {
  await preparar()
  await db.query("UPDATE point_intentos SET order_id='ORD123' WHERE id=$1", [intento])
  const recibir = async (requestId: string) => (await db.query<{ id: string }>(
    "SELECT registrar_notificacion_point('123','ORD123',$1,'123') AS id", [requestId],
  )).rows[0].id
  const aplicar = (id: string, estado: string, pago: string | null) => db.query<{ estado: string }>(
    "SELECT aplicar_resultado_point($1::uuid,$2::uuid,$3::uuid,'123','ORD123',$4,$5) AS estado",
    [id, intento, kiosco, estado, pago],
  )
  const primera = await recibir('req-1')
  expect((await aplicar(primera, 'PAGO_CONFIRMADO', 'PAY123')).rows[0].estado).toBe('PAGO_CONFIRMADO')
  await aplicar(primera, 'PAGO_CONFIRMADO', 'PAY123')
  const tardia = await recibir('req-2')
  expect((await aplicar(tardia, 'PENDIENTE', null)).rows[0].estado).toBe('PAGO_CONFIRMADO')
  expect((await db.query('SELECT estado,intentos_proceso FROM point_notificaciones ORDER BY request_id')).rows).toEqual([
    { estado: 'PROCESADA', intentos_proceso: 1 }, { estado: 'CONCILIAR', intentos_proceso: 1 },
  ])
})

it('no modifica el intento ni la recepción si la identidad no corresponde', async () => {
  await preparar()
  await db.query("UPDATE point_intentos SET order_id='ORD123' WHERE id=$1", [intento])
  const id = (await db.query<{ id: string }>("SELECT registrar_notificacion_point('123','ORD123','req-1','123') AS id")).rows[0].id
  await expect(db.query(
    "SELECT aplicar_resultado_point($1::uuid,$2::uuid,$3::uuid,'otra','ORD123','PAGO_CONFIRMADO','PAY123')",
    [id, intento, kiosco],
  )).rejects.toThrow('Identidad Point no coincide')
  expect((await db.query('SELECT estado,payment_id FROM point_intentos')).rows).toEqual([{ estado: 'PREPARADO', payment_id: null }])
  expect((await db.query('SELECT estado,intentos_proceso FROM point_notificaciones')).rows).toEqual([{ estado: 'PENDIENTE', intentos_proceso: 0 }])
})
