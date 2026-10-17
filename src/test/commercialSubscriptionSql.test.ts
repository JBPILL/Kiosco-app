// @vitest-environment node
// Local PostgreSQL engine checks; hosted JWT/PostgREST and concurrency remain separate gates.
import { readFileSync, readdirSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterEach, afterAll, expect, it } from 'vitest'

const db = new PGlite()
const id = (n: number) => `cc000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const admin = id(1), owner = id(2), cashier = id(3), viewer = id(4), other = id(5)
const kiosk = id(10), foreign = id(11), plan = id(20), sub = id(30)
async function rechazo(action: () => Promise<unknown>, pattern: RegExp) {
  await db.exec('SAVEPOINT rechazo')
  try { await expect(action()).rejects.toThrow(pattern) }
  finally { await db.exec('ROLLBACK TO SAVEPOINT rechazo; RELEASE SAVEPOINT rechazo') }
}
const sql = (s: string) => readFileSync(s, 'utf8')
async function actor(uid: string, role = 'authenticated') {
  await db.exec('RESET ROLE')
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role',$2,false)", [uid, role])
  await db.exec(`SET ROLE ${role}`)
}
async function renew(op = id(100), amount = 100, months = 1) {
  return db.query<{ result: Record<string, unknown> }>('SELECT public.renovar_suscripcion_comercial($1,$2,$3,$4,$5,$6) result',
    [op, kiosk, months, amount, 'TRANSFERENCIA', 'nota interna'])
}
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY,raw_app_meta_data jsonb);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  for (const path of ['001_domain.sql', '002_identity_helpers.sql',
    ...readdirSync('supabase/bootstrap/steps').sort().map(n => `steps/${n}`), '900_final_security.sql']) await db.exec(sql(`supabase/bootstrap/${path}`))
  // Simulate historical access that a hardened incremental install must remove.
  await db.exec(`CREATE FUNCTION public.actualizar_plan(uuid,numeric) RETURNS boolean LANGUAGE sql SECURITY DEFINER AS $$ SELECT true $$;
    GRANT EXECUTE ON FUNCTION public.actualizar_plan(uuid,numeric) TO PUBLIC,anon,authenticated,service_role;
    CREATE VIEW public.v_admin_kioscos AS SELECT id FROM public.kioscos;
    GRANT SELECT(id) ON public.v_admin_kioscos TO authenticated;
    GRANT UPDATE(estado_suscripcion) ON public.kioscos TO authenticated;
    CREATE POLICY legacy_broad_read ON public.kioscos FOR SELECT TO authenticated USING(true);`)
  for (const name of ['001_commercial_subscription.sql','002_commercial_write_gate.sql','003_commerce_provisioning.sql'])
    await db.exec(sql(`supabase/bootstrap/commercial/${name}`))
  await db.exec(`INSERT INTO auth.users(id) VALUES('${admin}'),('${owner}'),('${cashier}'),('${viewer}'),('${other}');
    INSERT INTO public.kioscos(id,nombre) VALUES('${kiosk}','Local'),('${foreign}','Otro');
    INSERT INTO public.planes(id,nombre,precio_mensual,max_usuarios) VALUES('${plan}','Real',100,3);
    INSERT INTO public.suscripciones(id,kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado)
      VALUES('${sub}','${kiosk}','${plan}',public.comercial_hoy()-30,public.comercial_hoy()+10,'ACTIVA'),
      ('${id(31)}','${foreign}','${plan}',public.comercial_hoy()-30,public.comercial_hoy()+10,'ACTIVA');
    INSERT INTO public.usuarios(id,auth_user_id,kiosco_id,nombre,rol,es_superadmin) VALUES
      ('${id(40)}','${admin}',NULL,'Admin','VISOR',true),
      ('${id(41)}','${owner}','${kiosk}','Dueño','DUEÑO',false),
      ('${id(42)}','${cashier}','${kiosk}','Caja','CAJERO',false),
      ('${id(43)}','${viewer}','${kiosk}','Visor','VISOR',false),
      ('${id(44)}','${other}','${foreign}','Otro dueño','DUEÑO',false);
  `)
}, 120_000)
beforeEach(async () => { await db.exec('RESET ROLE; BEGIN;') })
afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE;') })
afterAll(async () => { await db.close() })

it.each([owner, cashier, viewer, other])('rechaza renovación de actor no SuperAdmin %s', async uid => {
  await actor(uid)
  await rechazo(() => renew(), /no autorizada/)
})
it.each(['cambiar_estado_comercial', 'cambiar_plan_comercial'])('un Dueño no puede invocar %s', async fn => {
  await actor(owner)
  await rechazo(() => db.query(`SELECT public.${fn}($1,$2,$3)`, [id(100), kiosk, fn.includes('estado') ? 'ACTIVO' : plan]), /no autorizada/)
})
it('renovación repetida conserva vencimiento y resultado, un pago y una auditoría', async () => {
  await actor(admin)
  const first = await renew()
  expect((await renew()).rows).toEqual(first.rows)
  await db.exec('RESET ROLE')
  expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM public.pagos_suscripcion')).rows[0].n).toBe(1)
  expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM public.auditoria_comercial_admin')).rows[0].n).toBe(1)
  expect((await db.query<{ date: string }>('SELECT fecha_vencimiento::text date FROM public.suscripciones WHERE id=$1', [sub])).rows[0].date)
    .toBe(first.rows[0].result.fecha_vencimiento)
})
it('rechaza operation ID con otro monto sin ampliar ni duplicar', async () => {
  await actor(admin)
  await renew()
  await rechazo(() => renew(id(100), 999), /otra solicitud/)
})
it.each([-1, Number.NaN, Number.POSITIVE_INFINITY, 10.123])('rechaza monto inválido %s', async monto => {
  await actor(admin)
  await rechazo(() => renew(id(100), monto), /inválida/)
})
it.each([0, 13])('rechaza meses no permitidos %s', async months => {
  await actor(admin)
  await rechazo(() => renew(id(100), 0, months), /inválida/)
})
it('Dueño sólo obtiene su plan y pagos sin notas ni actor interno', async () => {
  await actor(admin)
  await renew()
  await actor(owner)
  const result = (await db.query<{ r: { suscripcion: { kiosco_id: string }; pagos: Record<string, unknown>[] } }>('SELECT public.obtener_mi_suscripcion_comercial() r')).rows[0].r
  expect(result.suscripcion.kiosco_id).toBe(kiosk)
  expect(result.pagos).toHaveLength(1)
  expect(result.pagos[0]).not.toHaveProperty('notas')
  expect(result.pagos[0]).not.toHaveProperty('actor_usuario_id')
  await rechazo(() => db.query('SELECT * FROM public.suscripciones WHERE kiosco_id=$1', [foreign]), /permission denied/)
  await rechazo(() => db.query('SELECT public.leer_administracion_comercial()'), /no autorizada/)
})
it.each([cashier, viewer])('personal sin acceso comercial sensible %s', async uid => {
  await actor(uid)
  await rechazo(() => db.query('SELECT public.obtener_mi_suscripcion_comercial()'), /no autorizada/)
  await rechazo(() => db.query('SELECT public.leer_configuracion_comercial()'), /no autorizada/)
})
it('SuperAdmin puede cambiar plan y estado de forma auditada e idempotente', async () => {
  await actor(admin)
  const args = [id(101), kiosk, 'SUSPENDIDO']
  const first = await db.query('SELECT public.cambiar_estado_comercial($1,$2,$3)', args)
  expect((await db.query('SELECT public.cambiar_estado_comercial($1,$2,$3)', args)).rows).toEqual(first.rows)
  const body = [id(102), id(21), 'Plan nuevo', 0, 5, true, null]
  await db.query('SELECT public.actualizar_plan($1,$2,$3,$4,$5,$6,$7)', body)
  const changed = await db.query('SELECT public.cambiar_plan_comercial($1,$2,$3)', [id(103), kiosk, id(21)])
  expect((await db.query('SELECT public.cambiar_plan_comercial($1,$2,$3)', [id(103), kiosk, id(21)])).rows).toEqual(changed.rows)
  const data = (await db.query<{ r: { kioscos: unknown[]; auditoria: unknown[] } }>('SELECT public.leer_administracion_comercial() r')).rows[0].r
  expect(data.kioscos).toHaveLength(2)
  expect(data.auditoria).toHaveLength(3)
})
it('renovar reactiva SOLO_LECTURA pero conserva suspensión manual', async () => {
  await actor(admin)
  await db.query('SELECT public.cambiar_estado_comercial($1,$2,$3)', [id(101), kiosk, 'SOLO_LECTURA'])
  expect((await renew()).rows[0].result.estado).toBe('ACTIVO')
  await db.query('SELECT public.cambiar_estado_comercial($1,$2,$3)', [id(102), kiosk, 'SUSPENDIDO'])
  expect((await renew(id(103))).rows[0].result.estado).toBe('SUSPENDIDO')
})
it('anon, PUBLIC y service_role no ejecutan mutaciones comerciales de usuario', async () => {
  const result = await db.query<{ auth: boolean; anon: boolean; service: boolean; direct: boolean }>(`
    SELECT has_function_privilege('authenticated','public.cambiar_estado_comercial(uuid,uuid,text)','EXECUTE') auth,
      has_function_privilege('anon','public.cambiar_estado_comercial(uuid,uuid,text)','EXECUTE') anon,
      has_function_privilege('service_role','public.cambiar_estado_comercial(uuid,uuid,text)','EXECUTE') service,
      has_table_privilege('authenticated','public.planes','UPDATE') direct`)
  expect(result.rows[0]).toEqual({ auth: true, anon: false, service: false, direct: false })
})
it('cierra overloads, vistas y grants por columna heredados', async () => {
  await actor(owner)
  await rechazo(() => db.query('SELECT public.actualizar_plan($1,100)', [plan]), /permission denied/)
  await rechazo(() => db.query('SELECT id FROM public.v_admin_kioscos'), /permission denied/)
  await rechazo(() => db.query("UPDATE public.kioscos SET estado_suscripcion='ACTIVO' WHERE id=$1", [kiosk]), /permission denied/)
  expect((await db.query('SELECT id FROM public.kioscos')).rows).toEqual([{ id: kiosk }])
})

it.each(['ACTIVO', 'SOLO_LECTURA', 'SUSPENDIDO'])('gate central de escrituras en estado %s', async estado => {
  await actor(admin)
  await db.query('SELECT public.cambiar_estado_comercial($1,$2,$3)', [id(110), kiosk, estado])
  await actor(owner)
  const args = [id(111), id(112), JSON.stringify({ descripcion: 'Producto', precio_venta: 10, precio_costo: 0, stock_actual: 0 })]
  const call = () => db.query('SELECT public.guardar_producto_transaccional($1,$2,$3)', args)
  if (estado === 'ACTIVO') expect((await call()).rows).toHaveLength(1)
  else await rechazo(call, /estado comercial/)
  // Login/minimum tenant read remains available to all authenticated staff.
  expect((await db.query('SELECT id FROM public.kioscos')).rows).toHaveLength(1)
})
it('el vencimiento bloquea nuevas escrituras aunque kioscos siga almacenado ACTIVO', async () => {
  await db.query("UPDATE public.suscripciones SET fecha_vencimiento=public.comercial_hoy()-1 WHERE id=$1", [sub])
  await actor(owner)
  const state = (await db.query<{ r: { estado: string } }>('SELECT public.obtener_mi_suscripcion_comercial() r')).rows[0].r
  expect(state.estado).toBe('SOLO_LECTURA')
  await rechazo(() => db.query('SELECT public.abrir_sesion_caja_transaccional($1,0)', [id(111)]), /estado comercial/)
})
it('SQL de provisioning sólo acepta canal service_role y SuperAdmin real', async () => {
  await actor(owner)
  await rechazo(() => db.query('SELECT public.reservar_provision_comercio($1,$2,$3,$4)', [id(120), owner, '{}', 'a'.repeat(64)]), /permission denied/)
  await actor(owner, 'service_role')
  await rechazo(() => db.query('SELECT public.reservar_provision_comercio($1,$2,$3,$4)', [id(120), owner, '{}', 'a'.repeat(64)]), /SuperAdmin/)
})
it('creación comercio/Dueño se confirma atómicamente y el retry no duplica filas', async () => {
  await actor(admin, 'service_role')
  const data = { email: 'owner@example.test', nombreDueno: 'Nuevo dueño', nombreKiosco: 'Nuevo',
    direccion: '', telefono: '', rubro: 'KIOSCO', planId: plan, diasValidez: 30 }
  const reserve = () => db.query<{ r: { claimed: boolean } }>('SELECT public.reservar_provision_comercio($1,$2,$3,$4) r',
    [id(120), admin, JSON.stringify(data), 'a'.repeat(64)])
  expect((await reserve()).rows[0].r.claimed).toBe(true)
  expect((await reserve()).rows[0].r.claimed).toBe(false)
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [id(121)])
  await actor(admin, 'service_role')
  await db.query("SELECT public.transicionar_provision_comercio($1,$2,'AUTH_READY',$3)", [id(120), admin, id(121)])
  const first = await db.query('SELECT public.finalizar_provision_comercio($1,$2)', [id(120), admin])
  expect((await db.query('SELECT public.finalizar_provision_comercio($1,$2)', [id(120), admin])).rows).toEqual(first.rows)
  await db.exec('RESET ROLE')
  const perfil = (await db.query<{ rol: string; es_superadmin: boolean; activo: boolean }>('SELECT rol,es_superadmin,activo FROM public.usuarios WHERE auth_user_id=$1', [id(121)])).rows
  expect(perfil).toEqual([{ rol: 'DUEÑO', es_superadmin: false, activo: true }])
  expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM public.kioscos WHERE nombre='Nuevo'")).rows[0].n).toBe(1)
})

it.each(['ACTIVO','SOLO_LECTURA','SUSPENDIDO','VENCIDO'])('checkout real por service RPC respeta %s', async estado => {
  await actor(owner)
  await db.query('SELECT public.abrir_sesion_caja_transaccional($1,0)', [id(130)])
  await db.query('SELECT public.guardar_producto_transaccional($1,$2,$3)', [id(131), id(132),
    JSON.stringify({ descripcion: 'Para venta', precio_venta: 10, precio_costo: 0, stock_actual: 5 })])
  if (estado === 'VENCIDO') {
    await db.exec('RESET ROLE')
    await db.query('UPDATE public.suscripciones SET fecha_vencimiento=public.comercial_hoy()-1 WHERE id=$1', [sub])
  } else if (estado !== 'ACTIVO') {
    await actor(admin)
    await db.query('SELECT public.cambiar_estado_comercial($1,$2,$3)', [id(133), kiosk, estado])
  }
  const snapshot = { version: 1, id: id(134), kiosco_id: kiosk, usuario_id: id(41), sesion_caja_id: id(130),
    fecha_hora: new Date().toISOString(), total: 10, notas: null, cliente_id: null,
    detalles: [{ id: id(135), producto_id: id(132), cantidad: 1, precio_unitario: 10, subtotal: 10,
      sin_envase: false, precio_envase_unitario: 0, es_devolucion_envase: false, articulo_libre: null, componentes: [] }],
    pagos: [{ id: id(136), medio_pago: 'EFECTIVO', monto: 10, referencia: null }] }
  await actor(owner, 'service_role')
  const call = () => db.query('SELECT public.confirmar_venta_manual($1,$2)', [owner, JSON.stringify(snapshot)])
  if (estado === 'ACTIVO') {
    const first = await call()
    expect((await call()).rows).toEqual(first.rows)
  } else await rechazo(call, /estado comercial|sin cobros habilitados/)
  await db.exec('RESET ROLE')
  expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM public.ventas WHERE id=$1',[id(134)])).rows[0].n)
    .toBe(estado === 'ACTIVO' ? 1 : 0)
})
it('rollback de perfil no deja comercio, suscripción ni auditoría y exige claim para compensar', async () => {
  await db.query('INSERT INTO auth.users(id) VALUES($1)', [id(150)])
  await db.exec(`CREATE FUNCTION public.test_reject_owner() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'TEST profile failed'; END $$;
    CREATE TRIGGER test_reject_owner BEFORE INSERT ON public.usuarios FOR EACH ROW
      WHEN(NEW.auth_user_id='${id(150)}'::uuid) EXECUTE FUNCTION public.test_reject_owner();`)
  await actor(admin, 'service_role')
  const body = { email: 'retry@example.test', nombreDueno: 'Owner', nombreKiosco: 'Fallido',
    direccion: '', telefono: '', rubro: 'KIOSCO', planId: plan, diasValidez: 30 }
  await db.query('SELECT public.reservar_provision_comercio($1,$2,$3,$4)', [id(151),admin,JSON.stringify(body),'b'.repeat(64)])
  await db.query("SELECT public.transicionar_provision_comercio($1,$2,'AUTH_READY',$3)", [id(151),admin,id(150)])
  await rechazo(() => db.query('SELECT public.finalizar_provision_comercio($1,$2)', [id(151),admin]), /TEST profile failed/)
  await db.query("SELECT public.transicionar_provision_comercio($1,$2,'COMPENSATING',$3)", [id(151),admin,id(150)])
  await rechazo(() => db.query('SELECT public.finalizar_provision_comercio($1,$2)', [id(151),admin]), /Conciliación/)
  await db.exec('RESET ROLE')
  expect((await db.query<{ n: number }>("SELECT count(*)::int n FROM public.kioscos WHERE nombre='Fallido'")).rows[0].n).toBe(0)
  expect((await db.query<{ n: number }>('SELECT count(*)::int n FROM public.auditoria_comercial_admin WHERE operacion_id=$1', [id(151)])).rows[0].n).toBe(0)
  expect((await db.query('SELECT id FROM auth.users WHERE id=$1', [id(150)])).rows).toHaveLength(1)
})
it.each(['SOLO_LECTURA','SUSPENDIDO'])('backup exportable sin reactivar comercio %s', async estado => {
  await actor(admin)
  await db.query('SELECT public.cambiar_estado_comercial($1,$2,$3)', [id(160),kiosk,estado])
  await actor(owner)
  expect((await db.query('SELECT public.generar_snapshot_backup_ampliado($1)', [kiosk])).rows).toHaveLength(1)
  expect((await db.query<{ r: { estado: string } }>('SELECT public.obtener_estado_operativo_comercial() r')).rows[0].r).toEqual({ estado })
})
