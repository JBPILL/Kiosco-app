// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest'
import type { TrabajoPoint } from '../../supabase/functions/_shared/pointDispatcher'

let db: PGlite
const kid = '10000000-0000-0000-0000-000000000001'
const id = '20000000-0000-0000-0000-000000000001'
const preparar = () => db.query("SELECT preparar_intento_point($1,$2,$1,'terminal',15000,'{}','123','456','sandbox')", [id,kid])
const vincular = () => db.query("SELECT vincular_orden_point($1,$2,'123','456','ORD123')", [id,kid])
const tomar = async () => (await db.query<{ trabajo: TrabajoPoint | null }>('SELECT tomar_trabajo_point() AS trabajo')).rows[0].trabajo
const terminar = async (trabajo: TrabajoPoint, resultado: string) => (await db.query<{ ok: boolean }>(
  'SELECT terminar_trabajo_point($1,$2,$3) AS ok', [trabajo.id,trabajo.leaseToken,resultado])).rows[0].ok
const conciliar = (estado: string,payment: string | null = null,account = '456') => db.query<{ resultado: { estado: string; revision: boolean } }>(
  "SELECT conciliar_intento_point($1,$2,'123',$3,'ORD123',$4,$5) AS resultado", [id,kid,account,estado,payment])
const recibir = async () => (await db.query<{ id: string }>(
  "SELECT registrar_notificacion_point('123','ORD123','req-1','123') AS id")).rows[0].id

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT coalesce(current_setting('request.jwt.claim.role',true),'service_role') $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY); CREATE TABLE ventas(id uuid PRIMARY KEY); INSERT INTO kioscos VALUES('${kid}');`)
  for (const file of ['supabase_fase_point_intentos.sql','supabase_fase_point_notificaciones.sql',
    'supabase_fase_point_procesamiento.sql','supabase_fase_point_vincular_orden.sql','supabase_fase_point_despacho.sql']) {
    await db.exec(readFileSync(file, 'utf8'))
  }
  await db.exec(readFileSync('supabase_fase_point_despacho.sql', 'utf8'))
}, 30000)
beforeEach(async () => db.exec("RESET ROLE; SET request.jwt.claim.role='service_role'; DELETE FROM point_trabajos; DELETE FROM point_notificaciones; DELETE FROM point_intentos;"))
afterAll(async () => db?.close())

it('encola una recepción durable una sola vez y sondea una orden conocida sin webhook', async () => {
  await preparar()
  expect(await tomar()).toBeNull()
  await vincular()
  const intento = await tomar()
  expect(intento?.intentoId).toBe(id)
  expect(intento?.notificacionId).toBeNull()
  const notificacion = await recibir()
  expect(await recibir()).toBe(notificacion)
  const recibido = await tomar()
  expect(recibido?.notificacionId).toBe(notificacion)
  expect(await tomar()).toBeNull()
  await db.exec(readFileSync('supabase_fase_point_despacho.sql', 'utf8'))
  expect((await db.query('SELECT * FROM point_trabajos')).rows).toHaveLength(2)
})

it('recupera una reserva vencida y rechaza el resultado del trabajador anterior', async () => {
  await preparar(); await vincular()
  const anterior = (await tomar())!
  expect(await tomar()).toBeNull()
  await db.exec("UPDATE point_trabajos SET lease_hasta=now()-interval '1 second'")
  const actual = (await tomar())!
  expect(actual.id).toBe(anterior.id)
  expect(actual.leaseToken).not.toBe(anterior.leaseToken)
  expect(await terminar(anterior,'ERROR')).toBe(false)
  expect(await terminar(actual,'PENDIENTE')).toBe(true)
  expect(await tomar()).toBeNull()
  expect((await db.query('SELECT intentos_proceso,ultimo_resultado FROM point_trabajos')).rows).toEqual([
    { intentos_proceso: 2,ultimo_resultado: 'PENDIENTE' },
  ])
})

it('aplica backoff acotado sin perder el trabajo y pausa discrepancias cinco minutos', async () => {
  await preparar(); await vincular()
  for (let numero=0;numero<12;numero++) {
    await db.exec('UPDATE point_trabajos SET proximo_proceso_at=now()')
    await terminar((await tomar())!,'ERROR')
  }
  const demora = (await db.query<{ segundos: number; fallos_consecutivos: number }>(
    'SELECT extract(epoch from proximo_proceso_at-now())::int AS segundos,fallos_consecutivos FROM point_trabajos')).rows[0]
  expect(demora.segundos).toBeGreaterThanOrEqual(899)
  expect(demora.segundos).toBeLessThanOrEqual(900)
  expect(demora.fallos_consecutivos).toBe(12)
  await db.exec('UPDATE point_trabajos SET proximo_proceso_at=now()')
  await terminar((await tomar())!,'CONCILIAR')
  expect((await db.query('SELECT fallos_consecutivos,ultimo_resultado FROM point_trabajos')).rows).toEqual([
    { fallos_consecutivos: 0,ultimo_resultado: 'CONCILIAR' },
  ])
})

it('no da por terminado un pago sin venta y deja de tomar estados finales', async () => {
  await preparar(); await vincular()
  const trabajo = (await tomar())!
  await conciliar('PAGO_CONFIRMADO','PAY123')
  expect(await terminar(trabajo,'FINALIZADO')).toBe(false)
  await terminar(trabajo,'ERROR')
  expect((await db.query('SELECT finalizado_at FROM point_trabajos')).rows).toEqual([{ finalizado_at: null }])
  await db.exec("UPDATE point_intentos SET estado='VENTA_CONFIRMADA'")
  expect(await tomar()).toBeNull()
})

it('una recepción procesada con estado pendiente no impide acreditar su consulta posterior', async () => {
  await preparar(); await vincular()
  const receipt = await recibir()
  const aplicar = (estado: string,pago: string | null) => db.query<{ estado: string }>(
    "SELECT aplicar_resultado_point($1,$2,$3,'123','ORD123',$4,$5) AS estado", [receipt,id,kid,estado,pago])
  expect((await aplicar('PENDIENTE',null)).rows[0].estado).toBe('PENDIENTE')
  expect((await aplicar('PAGO_CONFIRMADO','PAY123')).rows[0].estado).toBe('PAGO_CONFIRMADO')
  await expect(aplicar('PAGO_CONFIRMADO','PAY456')).rejects.toThrow('Identidad de pago')
  expect((await db.query('SELECT payment_id FROM point_intentos')).rows).toEqual([{ payment_id: 'PAY123' }])
})

it('conserva cancelación en curso y marca contradicciones sin revertir estados finales', async () => {
  await preparar(); await vincular()
  await db.exec("UPDATE point_intentos SET estado='CANCELACION_SOLICITADA'")
  expect((await conciliar('PENDIENTE')).rows[0].resultado.estado).toBe('CANCELACION_SOLICITADA')
  await conciliar('CANCELADO')
  expect((await conciliar('PAGO_CONFIRMADO','PAY123')).rows[0].resultado).toEqual({ estado: 'CANCELADO',revision: true })
  expect((await db.query('SELECT revision_pendiente_at IS NOT NULL AS revisar FROM point_intentos')).rows).toEqual([{ revisar: true }])
})

it('rechaza identidades de otra cuenta sin cambiar ni estado ni cola', async () => {
  await preparar(); await vincular()
  await expect(conciliar('PAGO_CONFIRMADO','PAY123','999')).rejects.toThrow('Identidad Point')
  expect((await db.query('SELECT estado,payment_id FROM point_intentos')).rows).toEqual([{ estado: 'PENDIENTE',payment_id: null }])
})

it('impide acceso del navegador y exige el rol servidor dentro del RPC', async () => {
  await db.exec('SET ROLE authenticated')
  try {
    await expect(tomar()).rejects.toThrow('permission denied')
    await expect(db.query('SELECT * FROM point_trabajos')).rejects.toThrow('permission denied')
    await expect(conciliar('PENDIENTE')).rejects.toThrow('permission denied')
  } finally { await db.exec("RESET ROLE; SET request.jwt.claim.role='authenticated'") }
  await expect(tomar()).rejects.toThrow('servidor de pagos')
})

it('persiste el checkpoint con CAS y rechaza avances del trabajador anterior', async () => {
  const receipt = await recibir()
  const checkpoint = { configuracion: 'a'.repeat(64), siguiente: 1, candidatos: [{ intentoId: id, kioscoId: kid }] }
  const guardar = (version: number, value: unknown) => db.query<{ version: number }>(
    'SELECT guardar_recuperacion_point($1,$2,$3::jsonb) AS version', [receipt,version,value === null ? null : JSON.stringify(value)])
  expect((await guardar(0,checkpoint)).rows[0].version).toBe(1)
  await expect(guardar(0,{ ...checkpoint, siguiente: 2 })).rejects.toThrow('otro trabajador')
  expect((await db.query('SELECT recuperacion_checkpoint,recuperacion_version FROM point_notificaciones')).rows)
    .toEqual([{ recuperacion_checkpoint: checkpoint,recuperacion_version: 1 }])
  expect((await guardar(1,null)).rows[0].version).toBe(2)
})

it('limita tamaño y entradas del checkpoint y protege su RPC del navegador', async () => {
  const receipt = await recibir()
  const guardar = (value: unknown) => db.query(
    'SELECT guardar_recuperacion_point($1,0,$2::jsonb)', [receipt,JSON.stringify(value)])
  const checkpoint = { configuracion: 'a'.repeat(64), siguiente: 1, candidatos: [] }
  await expect(guardar({ ...checkpoint, siguiente: 257 })).rejects.toThrow('inválida')
  await expect(guardar({ ...checkpoint, candidatos: [{},{}] })).rejects.toThrow('inválida')
  await expect(guardar({ ...checkpoint, adicional: 'x'.repeat(65536) })).rejects.toThrow('inválida')
  await db.exec('SET ROLE authenticated')
  try { await expect(guardar(checkpoint)).rejects.toThrow('permission denied') }
  finally { await db.exec('RESET ROLE') }
})
