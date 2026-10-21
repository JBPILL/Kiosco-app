// @vitest-environment node
// Esquema completo local: no acredita JWT/RLS ni concurrencia hospedados.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'

const db = new PGlite()
const kid = randomUUID(), foreignKid = randomUUID(), ownerAuth = randomUUID(), owner = randomUUID()
const sale = randomUUID(), foreignSale = randomUUID(), operation = randomUUID()
const context = { version: 1, cuit_emisor: '20123456786', punto_venta: 2, tipo_comprobante: 11,
  tipo_doc_receptor: 99, nro_doc_receptor: '0' }
interface Ack { id: string; kiosco_id: string; venta_id: string; entorno: string; estado: string; emision_habilitada: boolean }

beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  const root = 'supabase/bootstrap'
  for (const file of [join(root, '001_domain.sql'), join(root, '002_identity_helpers.sql'),
    ...readdirSync(join(root, 'steps')).sort().map(name => join(root, 'steps', name)), join(root, '900_final_security.sql')]) {
    await db.exec(readFileSync(file, 'utf8'))
  }
  const sql = readFileSync('supabase/pilot-fiscal/001_fiscal_journal.sql', 'utf8')
  await db.exec(sql)
  await db.exec('GRANT SELECT(id), UPDATE(estado) ON fiscal_operaciones_homologacion TO authenticated')
  await db.exec(sql)
  const reservations = readFileSync('supabase/pilot-fiscal/002_fiscal_reservations.sql', 'utf8')
  await db.exec(reservations); await db.exec(reservations)
  await db.query('INSERT INTO auth.users VALUES($1)', [ownerAuth])
  await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Fiscal local'),($2,'Ajeno')", [kid, foreignKid])
  await db.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Dueño','DUEÑO')", [owner, ownerAuth, kid])
  await db.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45),($4,$5,$3,200)', [sale,kid,owner,foreignSale,foreignKid])
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)", [ownerAuth])
}, 120_000)
beforeEach(async () => { await db.exec('BEGIN; SET ROLE authenticated') })
afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })
afterAll(async () => { await db.close() })

async function prepare(data: unknown = context, op = operation, venta = sale, target = kid): Promise<Ack> {
  const result = await db.query<{ack: Ack}>('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb) ack',
    [op,target,venta,JSON.stringify(data)])
  return result.rows[0].ack
}
async function denied(action: () => Promise<unknown>): Promise<void> {
  await db.exec('SAVEPOINT denied')
  await expect(action()).rejects.toThrow()
  await db.exec('ROLLBACK TO SAVEPOINT denied; RELEASE SAVEPOINT denied')
}

it('registra una sola operación durable, reintenta con otro UUID y no modifica el circuito comercial', async () => {
  const ack = await prepare()
  expect(ack).toEqual({id: operation,kiosco_id:kid,venta_id:sale,entorno:'HOMOLOGACION',estado:'PREPARADA',emision_habilitada:false})
  expect(await prepare()).toEqual(ack)
  expect(await prepare(context,randomUUID())).toEqual(ack)
  await db.exec('RESET ROLE')
  const rows = await db.query<{contexto: unknown;venta_snapshot: {total: number}}>('SELECT contexto,venta_snapshot FROM fiscal_operaciones_homologacion')
  expect(rows.rows).toHaveLength(1)
  expect(rows.rows[0].contexto).toEqual(context)
  expect(rows.rows[0].venta_snapshot.total).toBe(123.45)
  expect((await db.query<{total: string;estado: string}>('SELECT total,estado FROM ventas WHERE id=$1',[sale])).rows[0]).toMatchObject({estado:'COMPLETADA'})
  for (const table of ['pagos_venta','movimientos_stock','movimientos_caja','checkout_manuales']) {
    expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  }
})
it('rechaza otro contenido para la misma venta y conserva el original', async () => {
  await prepare()
  await denied(() => prepare({...context,punto_venta:3}))
  await denied(() => prepare({...context,tipo_comprobante:6},randomUUID()))
  expect((await prepare()).id).toBe(operation)
})
it('rechaza reutilizar una identidad de otra venta', async () => {
  await prepare()
  await db.exec('RESET ROLE')
  const second = randomUUID()
  await db.query('INSERT INTO ventas(id,kiosco_id,total) VALUES($1,$2,20)',[second,kid])
  await db.exec('SET ROLE authenticated')
  await denied(() => prepare(context,operation,second))
})
it('rechaza snapshot comercial modificado después de preparar', async () => {
  await prepare()
  await db.exec('RESET ROLE')
  await db.query('UPDATE ventas SET total=999 WHERE id=$1',[sale])
  await db.exec('SET ROLE authenticated')
  await denied(() => prepare())
})
it('snapshot de fecha estable aunque cambie la zona horaria de la conexión', async () => {
  const first = await prepare()
  await db.exec("SET LOCAL TIME ZONE 'Pacific/Auckland'")
  expect(await prepare()).toEqual(first)
})
it('rechaza venta ajena, inexistente, anulada, importe cero y comercio distinto', async () => {
  await denied(() => prepare(context,operation,foreignSale))
  await denied(() => prepare(context,operation,randomUUID()))
  await denied(() => prepare(context,operation,foreignSale,foreignKid))
  await db.exec('RESET ROLE')
  const cancelled = randomUUID()
  await db.query("INSERT INTO ventas(id,kiosco_id,total) VALUES($1,$2,20)",[cancelled,kid])
  await db.query("INSERT INTO checkout_manuales(id,kiosco_id,venta_id,solicitud,resultado) VALUES($1,$2,$3,'{\"total\":20,\"detalles\":[],\"pagos\":[]}', '{}')",[randomUUID(),kid,cancelled])
  await db.exec('SET ROLE authenticated')
  await db.query("SELECT anular_venta_atomica($1,'Anulación de ensayo',NULL)",[cancelled])
  await denied(() => prepare(context,operation,cancelled))
  await db.exec('RESET ROLE')
  await db.query("UPDATE ventas SET total=0 WHERE id=$1",[sale])
  await db.exec('SET ROLE authenticated')
  await denied(() => prepare())
})
it.each(['CAJERO','VISOR'])('rechaza rol %s', async role => {
  await db.exec('RESET ROLE')
  await db.query('UPDATE usuarios SET rol=$1 WHERE id=$2',[role,owner])
  await db.exec('SET ROLE authenticated')
  await denied(() => prepare())
})
it.each(['perfil_inactivo','superadmin','comercio_suspendido','sin_identidad'])('rechaza %s', async mode => {
  await db.exec('RESET ROLE')
  if (mode==='perfil_inactivo') await db.query('UPDATE usuarios SET activo=false WHERE id=$1',[owner])
  if (mode==='superadmin') {
    await db.exec("SELECT set_config('request.jwt.claim.role','service_role',true)")
    await db.query('UPDATE usuarios SET es_superadmin=true,kiosco_id=NULL WHERE id=$1',[owner])
    await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',true)")
  }
  if (mode==='comercio_suspendido') await db.query("UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id=$1",[kid])
  if (mode==='sin_identidad') await db.exec("SELECT set_config('request.jwt.claim.sub','',true)")
  await db.exec('SET ROLE authenticated')
  await denied(() => prepare())
})
it.each([null, [], {}, {...context,version:2}, {...context,total:1}, {...context,token:'not-accepted'},
  {...context,entorno:'PRODUCCION'}, {...context,cuit_emisor:'20123456780'}, {...context,punto_venta:0},
  {...context,punto_venta:1.5}, {...context,tipo_comprobante:999}, {...context,tipo_doc_receptor:1},
  {...context,nro_doc_receptor:'invalid'}])('rechaza contexto no admitido %#', async data => {
  await denied(() => prepare(data))
})
it.each(['anon','authenticated','service_role'])('bloquea DML y lectura directos para %s', async role => {
  await prepare()
  await db.exec(`RESET ROLE; SET ROLE ${role}`)
  await denied(() => db.exec('SELECT * FROM fiscal_operaciones_homologacion'))
  await denied(() => db.exec("UPDATE fiscal_operaciones_homologacion SET estado='PREPARADA'"))
  await denied(() => db.exec('DELETE FROM fiscal_operaciones_homologacion'))
  if (role!=='authenticated') await denied(() => prepare())
})

it('revoca privilegios de tabla y columna al reaplicar', async () => {
  await db.exec('RESET ROLE')
  const result = await db.query<{tabla: boolean;columna: boolean}>(`SELECT
    has_table_privilege('authenticated','fiscal_operaciones_homologacion','SELECT,INSERT,UPDATE,DELETE') tabla,
    has_any_column_privilege('authenticated','fiscal_operaciones_homologacion','SELECT,INSERT,UPDATE') columna`)
  expect(result.rows[0]).toEqual({tabla:false,columna:false})
})
it('rechaza cambios en detalles aun cuando el total de la venta no cambió', async () => {
  await prepare()
  await db.exec('RESET ROLE')
  const product = randomUUID()
  await db.query("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta) VALUES($1,$2,'Ensayo',123.45)",[product,kid])
  await db.query('INSERT INTO detalles_venta(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,1,123.45,123.45)',[sale,product])
  await db.exec('SET ROLE authenticated')
  await denied(() => prepare())
})
it('un trigger que omite la inserción no produce confirmación falsa', async () => {
  await db.exec(`RESET ROLE;
    CREATE FUNCTION pg_temp.omitir_fiscal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir_fiscal BEFORE INSERT ON fiscal_operaciones_homologacion FOR EACH ROW EXECUTE FUNCTION pg_temp.omitir_fiscal();
    SET ROLE authenticated;`)
  await denied(() => prepare())
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_operaciones_homologacion')).rows[0].n).toBe(0)
})


interface Reservation { operacion_id: string; numero: number; estado: string; emision_habilitada: boolean }
async function worker(): Promise<void> {
  await db.exec("RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true)")
}
async function reserve(op: string = operation, last = 41, point = 2, issuer = context.cuit_emisor, observed = new Date().toISOString()): Promise<Reservation> {
  const result = await db.query<{ack: Reservation}>(
    'SELECT reservar_numero_fiscal_homologacion($1,$2,$3,$4,$5,$6) ack',[op,issuer,point,11,last,observed])
  return result.rows[0].ack
}
async function attempt(id: string, op: string = operation): Promise<Record<string, unknown>> {
  const result = await db.query<{ack: Record<string, unknown>}>('SELECT registrar_intento_fiscal_homologacion($1,$2) ack',[op,id])
  return result.rows[0].ack
}
async function secondOperation(point = 2): Promise<string> {
  await db.exec('RESET ROLE')
  const second = randomUUID(), op = randomUUID()
  await db.query('INSERT INTO ventas(id,kiosco_id,total) VALUES($1,$2,30)',[second,kid])
  await db.exec('SET ROLE authenticated')
  await prepare({...context,punto_venta:point},op,second)
  return op
}
it('reserva el número observado + 1 una sola vez y conserva el ACK', async () => {
  await prepare(); await worker()
  const first = await reserve()
  expect(first).toEqual({operacion_id:operation,numero:42,estado:'RESERVADA',entorno:'HOMOLOGACION',emision_habilitada:false})
  expect(await reserve()).toEqual(first)
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(1)
})
it('mantiene una sola operación pendiente por serie y separa otra serie', async () => {
  await prepare()
  const same = await secondOperation(), other = await secondOperation(3)
  await worker(); await reserve()
  await denied(() => reserve(same))
  expect((await reserve(other,0,3)).numero).toBe(1)
})
it('la serie es global aunque dos comercios compartan emisor/punto/tipo', async () => {
  await prepare(); await worker(); await reserve()
  await db.exec('RESET ROLE')
  const otherAuth=randomUUID(), otherOwner=randomUUID(), otherOp=randomUUID()
  await db.query('INSERT INTO auth.users VALUES($1)',[otherAuth])
  await db.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Otro dueño','DUEÑO')",[otherOwner,otherAuth,foreignKid])
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[otherAuth])
  await db.exec('SET ROLE authenticated')
  await prepare(context,otherOp,foreignSale,foreignKid)
  await worker(); await denied(() => reserve(otherOp))
})
it.each([-1,99999999])('rechaza último número fuera de rango %s sin crear reservas', async last => {
  await prepare(); await worker(); await denied(() => reserve(operation,last))
})
it('admite el último número permitido y bloquea deriva de observación', async () => {
  await prepare(); await worker()
  expect((await reserve(operation,99999998)).numero).toBe(99999999)
  await denied(() => reserve(operation,12))
})
it.each(['2000-01-01T00:00:00Z','2099-01-01T00:00:00Z'])('rechaza observación temporal no válida %s', async date => {
  await prepare(); await worker(); await denied(() => reserve(operation,41,2,context.cuit_emisor,date))
})
it('rechaza observación de otro emisor o punto', async () => {
  await prepare(); await worker()
  await denied(() => reserve(operation,41,2,'30123456789'))
  await denied(() => reserve(operation,41,3))
})
it.each(['anon','authenticated'])('no concede reserva ni intento al rol %s', async role => {
  await prepare()
  await db.exec(`RESET ROLE; SET ROLE ${role}`)
  await denied(() => reserve())
  await denied(() => attempt(randomUUID()))
})
it('comprueba claim privado además de EXECUTE', async () => {
  await prepare(); await worker()
  await db.exec("SELECT set_config('request.jwt.claim.role','authenticated',true)")
  await denied(() => reserve())
  await denied(() => attempt(randomUUID()))
})
it('requiere reserva antes del intento y revalida actor/comercio', async () => {
  await prepare(); await worker(); await denied(() => attempt(randomUUID()))
  await db.exec('RESET ROLE')
  await db.query('UPDATE usuarios SET activo=false WHERE id=$1',[owner])
  await worker(); await denied(() => reserve())
})
it('rechaza snapshot modificado antes de reservar', async () => {
  await prepare(); await db.exec('RESET ROLE')
  await db.query('UPDATE ventas SET total=50 WHERE id=$1',[sale])
  await worker(); await denied(() => reserve())
})
it('persiste intención antes de red; ACK perdido no concede un segundo intento', async () => {
  await prepare(); await worker(); await reserve()
  const id=randomUUID()
  expect(await attempt(id)).toMatchObject({estado:'ENVIO_INCIERTO',numero:42,nuevo_intento:true,requiere_conciliacion:false,emision_habilitada:false})
  expect(await attempt(id)).toMatchObject({estado:'ENVIO_INCIERTO',numero:42,nuevo_intento:false,requiere_conciliacion:true,emision_habilitada:false})
  await denied(() => attempt(randomUUID()))
  expect((await reserve()).numero).toBe(42)
})
it('un intento incierto no libera la serie para otra venta', async () => {
  await prepare(); const second=await secondOperation()
  await worker(); await reserve(); await attempt(randomUUID())
  await denied(() => reserve(second))
})
it('bloquea cambios de cabecera y detalles después de reservar', async () => {
  await prepare(); await worker(); await reserve(); await db.exec('RESET ROLE')
  await denied(() => db.query('UPDATE ventas SET total=50 WHERE id=$1',[sale]))
  await denied(() => db.query("UPDATE ventas SET fecha_hora=now()+interval '1 day' WHERE id=$1",[sale]))
  const product=randomUUID()
  await db.query("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta) VALUES($1,$2,'Ensayo',1)",[product,kid])
  await denied(() => db.query('INSERT INTO detalles_venta(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,1,1,1)',[sale,product]))
})
it('rechaza anulación atómica con reserva y revierte sus efectos', async () => {
  await prepare(); await worker(); await reserve(); await db.exec('RESET ROLE')
  await db.query(`INSERT INTO checkout_manuales(id,kiosco_id,venta_id,solicitud,resultado)
    VALUES($1,$2,$3,'{"total":123.45,"detalles":[],"pagos":[]}', '{}')`,[randomUUID(),kid,sale])
  await db.exec('SET ROLE authenticated')
  await denied(() => db.query("SELECT anular_venta_atomica($1,'Anulación de ensayo',NULL)",[sale]))
  await db.exec('RESET ROLE')
  expect((await db.query<{estado:string}>('SELECT estado FROM ventas WHERE id=$1',[sale])).rows[0].estado).toBe('COMPLETADA')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM anulaciones_venta_atomicas')).rows[0].n).toBe(0)
})
it.each(['anon','authenticated','service_role'])('tablas de reserva sin lectura/DML directo para %s', async role => {
  await prepare(); await worker(); await reserve()
  await db.exec(`RESET ROLE; SET ROLE ${role}`)
  for (const table of ['fiscal_series_homologacion','fiscal_reservas_homologacion']) {
    await denied(() => db.exec(`SELECT * FROM ${table}`))
    await denied(() => db.exec(`DELETE FROM ${table}`))
  }
  await denied(() => db.query('SELECT fiscal_operacion_vigente_homologacion($1)',[operation]))
})

it.each(['reserva','intento'])('rechaza ACK falso si un trigger omite %s', async mode => {
  await prepare(); await worker()
  if (mode==='intento') await reserve()
  await db.exec('RESET ROLE')
  const event=mode==='reserva'?'INSERT':'UPDATE'
  await db.exec(`CREATE FUNCTION pg_temp.omitir_reserva() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir_reserva BEFORE ${event} ON fiscal_reservas_homologacion FOR EACH ROW EXECUTE FUNCTION pg_temp.omitir_reserva();`)
  await worker()
  if (mode==='reserva') await denied(() => reserve())
  else await denied(() => attempt(randomUUID()))
  await db.exec('RESET ROLE')
  const rows=await db.query<{estado:string}>('SELECT estado FROM fiscal_reservas_homologacion')
  expect(rows.rows).toEqual(mode==='reserva'?[]:[{estado:'RESERVADA'}])
  if (mode==='reserva') expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_series_homologacion')).rows[0].n).toBe(0)
})
it('no permite reutilizar identidad de intento entre series', async () => {
  await prepare(); const other=await secondOperation(3)
  await worker(); await reserve(); await reserve(other,41,3)
  const id=randomUUID()
  await attempt(id)
  await denied(() => attempt(id,other))
  expect(await attempt(randomUUID(),other)).toMatchObject({nuevo_intento:true,estado:'ENVIO_INCIERTO'})
})
it('no pierde numeración por representación JSON decimal equivalente', async () => {
  const result=await db.query<{ack:Ack}>('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb) ack',
    [operation,kid,sale,JSON.stringify(context).replace('"punto_venta":2','"punto_venta":2.0').replace('"tipo_comprobante":11','"tipo_comprobante":11.0')])
  expect(result.rows[0].ack.id).toBe(operation)
  await worker()
  expect((await reserve()).numero).toBe(42)
})
it('bloquea modificar o eliminar detalles existentes de una venta reservada', async () => {
  await db.exec('RESET ROLE')
  const product=randomUUID(), detail=randomUUID()
  await db.query("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta) VALUES($1,$2,'Ensayo',123.45)",[product,kid])
  await db.query('INSERT INTO detalles_venta(id,venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,$3,1,123.45,123.45)',[detail,sale,product])
  await db.exec('SET ROLE authenticated')
  await prepare(); await worker(); await reserve(); await db.exec('RESET ROLE')
  await denied(() => db.query('UPDATE detalles_venta SET cantidad=2 WHERE id=$1',[detail]))
  await denied(() => db.query('DELETE FROM detalles_venta WHERE id=$1',[detail]))
})
