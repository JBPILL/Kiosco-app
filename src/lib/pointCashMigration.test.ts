// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest'
let db: PGlite
const kid = '10000000-0000-0000-0000-000000000001'
const id = '20000000-0000-0000-0000-000000000001'
const caja = '30000000-0000-0000-0000-000000000001'
const usuario = '40000000-0000-0000-0000-000000000001'
const snapshot = { version: 2, sesionCajaId: caja, usuarioId: usuario }
const preparar = (solicitud: unknown = snapshot) => db.query(
  "SELECT preparar_intento_point($1,$2,$1,'terminal',15000,$3::jsonb,'123','456','sandbox')",
  [id, kid, JSON.stringify(solicitud)],
)
beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role' $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY); CREATE TABLE ventas(id uuid PRIMARY KEY);
    CREATE TABLE sesiones_caja(id uuid PRIMARY KEY,kiosco_id uuid,usuario_id uuid,estado text);
    INSERT INTO kioscos VALUES('${kid}');
    INSERT INTO sesiones_caja VALUES('${caja}','${kid}','${usuario}','ABIERTA');`)
  await db.exec(readFileSync('supabase_fase_point_intentos.sql', 'utf8'))
  const sql = readFileSync('supabase_fase_point_caja.sql', 'utf8')
  await db.exec(sql)
  await db.exec(sql)
  const cierre = readFileSync('supabase_fase_point_cierre_caja.sql', 'utf8')
  await db.exec(cierre)
  await db.exec(cierre)
}, 30000)
beforeEach(async () => {
  await db.exec("DELETE FROM point_intentos; UPDATE sesiones_caja SET estado='ABIERTA'")
})
afterAll(async () => db?.close())
it('reserva una caja válida y conserva el reintento después de cerrar el turno', async () => {
  await preparar()
  await db.exec("UPDATE point_intentos SET estado='VENTA_CONFIRMADA'")
  await db.exec("UPDATE sesiones_caja SET estado='CERRADA'")
  await preparar()
  expect((await db.query('SELECT id FROM point_intentos')).rows).toHaveLength(1)
})
it('revierte un intento nuevo cuando la caja ya se cerró', async () => {
  await db.exec("UPDATE sesiones_caja SET estado='CERRADA'")
  await expect(preparar()).rejects.toThrow('no está abierta')
  expect((await db.query('SELECT id FROM point_intentos')).rows).toHaveLength(0)
})
it('rechaza caja ausente, versión antigua y usuario ajeno', async () => {
  for (const sol of [{ version: 1 }, { ...snapshot, sesionCajaId: '' },
    { ...snapshot, usuarioId: '50000000-0000-0000-0000-000000000001' }]) {
    await expect(preparar(sol)).rejects.toThrow()
  }
  expect((await db.query('SELECT id FROM point_intentos')).rows).toHaveLength(0)
})
it('bloquea el cierre por cobros pendientes, inciertos o pagos sin venta', async () => {
  await preparar()
  for (const estado of ['PREPARADO','PENDIENTE','CONCILIAR','CANCELACION_SOLICITADA','PAGO_CONFIRMADO']) {
    await db.query('UPDATE point_intentos SET estado=$1', [estado])
    await expect(db.exec("UPDATE sesiones_caja SET estado='CERRADA'")).rejects.toThrow('POINT_COBRO_PENDIENTE:')
    expect((await db.query<{ estado: string }>('SELECT estado FROM sesiones_caja')).rows[0].estado).toBe('ABIERTA')
  }
  for (const estado of ['CANCELADO','RECHAZADO','VENTA_CONFIRMADA']) {
    await db.query('UPDATE point_intentos SET estado=$1', [estado])
    await db.exec("UPDATE sesiones_caja SET estado='CERRADA'; UPDATE sesiones_caja SET estado='ABIERTA'")
  }
})
