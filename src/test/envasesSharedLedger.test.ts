// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

const db = new PGlite()
const id = (n: number) => `ee000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const owner = id(1), cashier = id(2), viewer = id(3), other = id(4)
const kid = id(10), foreign = id(11), caja = id(20), foreignCaja = id(21)
const source = () => readFileSync('supabase/bootstrap/envases/001_shared_ledger.sql', 'utf8')
async function actor(uid = owner, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [uid, role])
  await db.exec(`SET ROLE ${role}`)
}
async function operar(accion: string, datos: unknown, n = 100, tipoId = 'vidrio') {
  return (await db.query<{ r: { id: string; stock_vacios: number; importe: number; pendientes: number } }>('SELECT public.operar_envases_atomico($1::jsonb) r',
    [JSON.stringify({ version: 1, id: id(n), accion, tipoId, datos })])).rows[0].r
}
async function rechazo(action: () => Promise<unknown>, patron: RegExp) {
  await db.exec('SAVEPOINT rechazo')
  try { await expect(action()).rejects.toThrow(patron) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT rechazo; RELEASE SAVEPOINT rechazo') }
}
const recibir = (sesion = caja, cantidad = 2) => operar('RECIBIR_EFECTIVO', { cantidad, sesionCajaId: sesion, precioEsperado: 1500.25, notas: null }, 110)

it('un Cajero no puede egresar dinero de la caja de otro operador del mismo comercio', async () => {
  await db.exec('RESET ROLE')
  await db.query('UPDATE sesiones_caja SET usuario_id=$1 WHERE id=$2', [owner, caja])
  await actor(cashier)
  await rechazo(() => recibir(), /caja abierta/)
  await db.exec('RESET ROLE')
  expect((await db.query('SELECT count(*)::int n FROM movimientos_caja')).rows).toEqual([{ n: 0 }])
})
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  for (const path of ['001_domain.sql', '002_identity_helpers.sql', ...readdirSync('supabase/bootstrap/steps').sort().map(n => `steps/${n}`), '900_final_security.sql',
    'commercial/001_commercial_subscription.sql', 'commercial/002_commercial_write_gate.sql']) await db.exec(readFileSync(`supabase/bootstrap/${path}`, 'utf8'))
  await db.exec(readFileSync('supabase/bootstrap/pilot-operations/001_capabilities.sql', 'utf8'))
  await db.exec(source()); await db.exec(source())
  await db.exec(readFileSync('supabase/bootstrap/envases/003_pending_totals.sql', 'utf8'))
  await db.exec(readFileSync('supabase/bootstrap/envases/003_pending_totals.sql', 'utf8'))
  await db.exec(`INSERT INTO auth.users(id) VALUES('${owner}'),('${cashier}'),('${viewer}'),('${other}');
    INSERT INTO kioscos(id,nombre) VALUES('${kid}','Ensayo'),('${foreign}','Otro');
    INSERT INTO piloto_operaciones_capacidades(kiosco_id,envases) VALUES('${kid}',true),('${foreign}',true);
    INSERT INTO planes(id,nombre,precio_mensual,max_usuarios) VALUES('${id(30)}','Ensayo',0,3);
    INSERT INTO suscripciones(kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado)
      VALUES('${kid}','${id(30)}',public.comercial_hoy(),public.comercial_hoy()+30,'ACTIVA'),
      ('${foreign}','${id(30)}',public.comercial_hoy(),public.comercial_hoy()+30,'ACTIVA');
    INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES
      ('${owner}','${owner}','${kid}','Dueño','DUEÑO'),('${cashier}','${cashier}','${kid}','Caja','CAJERO'),
      ('${viewer}','${viewer}','${kid}','Visor','VISOR'),('${other}','${other}','${foreign}','Otro','DUEÑO');
    INSERT INTO sesiones_caja(id,kiosco_id,usuario_id) VALUES('${caja}','${kid}','${cashier}'),('${foreignCaja}','${foreign}','${other}');`)
}, 120_000)
beforeEach(async () => {
  await db.exec('RESET ROLE; BEGIN;')
  await actor()
  await operar('CONFIGURAR_TIPO', { nombre: 'Vidrio', precio: 1500.25, activo: true }, 90)
})
afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE;') })
afterAll(async () => { await db.close() })

it('confirma recepción y efectivo juntos; replay devuelve ACK sin duplicar vacíos ni egreso', async () => {
  await actor(cashier)
  const primero = await recibir()
  expect(primero.stock_vacios).toBe(2); expect(primero.importe).toBe(3000.5)
  expect(await recibir()).toEqual(primero)
  await db.exec('RESET ROLE')
  expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM movimientos_caja')).rows[0].n).toBe(1)
  expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM envases_movimientos')).rows[0].n).toBe(1)
})
it('un ID confirmado no admite cambiar cuerpo o actor', async () => {
  await recibir()
  await rechazo(() => recibir(caja, 3), /solicitud original/)
  await actor(cashier)
  await rechazo(() => recibir(), /actor y solicitud/)
})
it('entrega exacta al distribuidor; nunca recorta una entrega excesiva', async () => {
  await operar('AJUSTAR_SALDO', { stockEsperado: 0, nuevoStock: 5, notas: 'Conteo físico' })
  await rechazo(() => operar('ENTREGAR_DISTRIBUIDOR', { cantidad: 6, distribuidor: 'Distribuidor', notas: null }, 101), /insuficiente/)
  const r = await operar('ENTREGAR_DISTRIBUIDOR', { cantidad: 3, distribuidor: 'Distribuidor', notas: null }, 102)
  expect(r.stock_vacios).toBe(2)
})
it('un conteo viejo no sobrescribe recepciones realizadas por otra caja', async () => {
  await recibir()
  await rechazo(() => operar('AJUSTAR_SALDO', { stockEsperado: 0, nuevoStock: 5, notas: null }), /Stock cambió/)
})
it('un precio cambiado no produce egreso ni recepción al precio inesperado', async () => {
  await operar('CONFIGURAR_TIPO', { nombre: 'Vidrio', precio: 2000, activo: true }, 91)
  await rechazo(() => recibir(), /precio del envase cambió/)
  await db.exec('RESET ROLE')
  expect((await db.query<{ cantidad: number }>('SELECT cantidad FROM envases_saldos')).rows[0].cantidad).toBe(0)
  expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM movimientos_caja')).rows[0].n).toBe(0)
})
it.each([cashier, viewer])('rol %s no configura tipos ni ajusta vacíos', async uid => {
  await actor(uid)
  await rechazo(() => operar('CONFIGURAR_TIPO', { nombre: 'Otro', precio: 1, activo: true }), /no autorizado/)
  await rechazo(() => operar('AJUSTAR_SALDO', { stockEsperado: 0, nuevoStock: 5, notas: null }), /no autorizado/)
})
it.each([0, -1, 1.5, 1000000])('recepción rechaza cantidad %s', async cantidad => {
  await rechazo(() => recibir(caja, cantidad), /Cantidad/)
})
it('rechaza caja de otro comercio, caja cerrada y tipo inexistente', async () => {
  await rechazo(() => recibir(foreignCaja), /caja abierta/)
  await db.exec('RESET ROLE')
  await db.query("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=now() WHERE id=$1", [caja])
  await actor()
  await rechazo(() => recibir(), /caja abierta/)
  await rechazo(() => operar('ENTREGAR_DISTRIBUIDOR', { cantidad: 1, distribuidor: 'D', notas: null }, 100, 'ajeno'), /no disponible/)
})
it('rollback total si un trigger rechaza el egreso después de calcular el stock', async () => {
  await db.exec(`RESET ROLE; CREATE FUNCTION public.fallo_envase_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'egreso rechazado'; END $$;
    CREATE TRIGGER fallo_envase_test BEFORE INSERT ON movimientos_caja FOR EACH ROW EXECUTE FUNCTION public.fallo_envase_test();`)
  await actor(cashier)
  await rechazo(() => recibir(), /egreso rechazado/)
  await db.exec('RESET ROLE')
  expect((await db.query<{ cantidad: number }>('SELECT cantidad FROM envases_saldos')).rows[0].cantidad).toBe(0)
  expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM envases_movimientos')).rows[0].n).toBe(0)
})
it('un trigger que omite silenciosamente el egreso tampoco permite confirmar ni aumentar vacíos', async () => {
  await db.exec(`RESET ROLE; CREATE FUNCTION public.omitir_envase_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir_envase_test BEFORE INSERT ON movimientos_caja FOR EACH ROW EXECUTE FUNCTION public.omitir_envase_test();`)
  await actor(cashier)
  await rechazo(() => recibir(), /No se confirmó el egreso/)
  await db.exec('RESET ROLE')
  expect((await db.query<{ cantidad: number }>('SELECT cantidad FROM envases_saldos')).rows[0].cantidad).toBe(0)
  expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM envases_movimientos')).rows[0].n).toBe(0)
})
it('RLS aísla comercios aun ante una política permisiva heredada; APIs no escriben directo', async () => {
  await db.exec('RESET ROLE; CREATE POLICY heredada_envases ON envases_tipos_comercio FOR SELECT TO authenticated USING(true);')
  await actor(other)
  expect((await db.query('SELECT * FROM envases_tipos_comercio')).rows).toEqual([])
  await rechazo(() => db.query("UPDATE envases_saldos SET cantidad=999"), /permission denied/)
  await rechazo(() => db.query('SELECT * FROM envases_operaciones'), /permission denied/)
})
it('vencimiento bloquea operaciones nuevas pero permite recuperar un ACK confirmado', async () => {
  const anterior = await recibir()
  await db.exec('RESET ROLE')
  await db.query("UPDATE suscripciones SET fecha_inicio=public.comercial_hoy()-3,fecha_vencimiento=public.comercial_hoy()-1 WHERE kiosco_id=$1", [kid])
  await actor()
  expect(await recibir()).toEqual(anterior)
  await rechazo(() => operar('ENTREGAR_DISTRIBUIDOR', { cantidad: 1, distribuidor: 'D', notas: null }), /estado comercial/)
})
it('el gate remoto bloquea operaciones nuevas sin perder la recuperación de ACK', async () => {
  const anterior=await recibir()
  await db.exec('RESET ROLE')
  await db.query('UPDATE piloto_operaciones_capacidades SET envases=false WHERE kiosco_id=$1',[kid])
  await actor()
  expect(await recibir()).toEqual(anterior)
  await rechazo(()=>operar('ENTREGAR_DISTRIBUIDOR',{cantidad:1,distribuidor:'D',notas:null}),/no habilitado/)
  await rechazo(()=>db.query('UPDATE piloto_operaciones_capacidades SET envases=true'),/permission denied/)
})

it('pendientes por tipo se reciben sin dinero; replay no duplica ni permite sobregiro', async () => {
  const inicio = await operar('AJUSTAR_PENDIENTES', { pendientesEsperados: 0, nuevosPendientes: 3, notas: 'Préstamos sin cobrar' })
  expect(inicio.pendientes).toBe(3); expect(inicio.stock_vacios).toBe(0)
  await actor(cashier)
  const datos = { cantidad: 2, notas: null }
  const ack = await operar('RECIBIR_PENDIENTES', datos, 101)
  expect(ack).toMatchObject({ pendientes: 1, stock_vacios: 2, importe: 0 })
  expect(await operar('RECIBIR_PENDIENTES', datos, 101)).toEqual(ack)
  await rechazo(() => operar('RECIBIR_PENDIENTES', { cantidad: 2, notas: null }, 102), /supera pendientes/)
  await rechazo(() => operar('RECIBIR_PENDIENTES', { cantidad: 0.5, notas: null }, 103), /Cantidad/)
  await db.exec('RESET ROLE')
  expect((await db.query('SELECT count(*)::int n FROM movimientos_caja')).rows).toEqual([{ n: 0 }])
  expect((await db.query('SELECT cantidad FROM envases_pendientes')).rows).toEqual([{ cantidad: 1 }])
})
it('sólo Dueño corrige pendientes con saldo esperado y motivo; sin modificar vacíos', async () => {
  await operar('AJUSTAR_PENDIENTES', { pendientesEsperados: 0, nuevosPendientes: 2, notas: 'Conteo inicial' })
  await rechazo(() => operar('AJUSTAR_PENDIENTES', { pendientesEsperados: 0, nuevosPendientes: 5, notas: 'Viejo' }, 101), /cambiaron/)
  await rechazo(() => operar('AJUSTAR_PENDIENTES', { pendientesEsperados: 2, nuevosPendientes: 3, notas: ' ' }, 102), /inválidos/)
  await actor(cashier)
  await rechazo(() => operar('AJUSTAR_PENDIENTES', { pendientesEsperados: 2, nuevosPendientes: 3, notas: 'No autorizado' }, 103), /Rol/)
  await actor(viewer)
  await rechazo(() => operar('RECIBIR_PENDIENTES', { cantidad: 1, notas: null }, 104), /Rol/)
  await actor(other)
  await rechazo(() => operar('RECIBIR_PENDIENTES', { cantidad: 1, notas: null }, 105), /Tipo de envase/)
  expect((await db.query('SELECT cantidad FROM envases_pendientes')).rows).toEqual([])
  await db.exec('RESET ROLE')
  expect((await db.query('SELECT cantidad FROM envases_saldos')).rows).toEqual([{ cantidad: 0 }])
})
it('pendientes no admiten escritura REST ni operar suspendido, pero el ACK sí se recupera', async () => {
  const datos = { pendientesEsperados: 0, nuevosPendientes: 3, notas: 'Ensayo' }
  const ack = await operar('AJUSTAR_PENDIENTES', datos)
  await rechazo(() => db.exec('UPDATE envases_pendientes SET cantidad=9'), /permission denied/)
  await db.exec('RESET ROLE'); await db.exec(`UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id='${kid}'`); await actor()
  expect(await operar('AJUSTAR_PENDIENTES', datos)).toEqual(ack)
  await rechazo(() => operar('RECIBIR_PENDIENTES', { cantidad: 1, notas: null }, 101), /suspendido|operativo|habilitado/i)
})
