// @vitest-environment node
// Contrato SQL con esquema completo; no sustituye Auth/RLS/JWT hospedados.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'

const db = new PGlite()
const kid = randomUUID(), foreignKid = randomUUID(), auth = randomUUID(), owner = randomUUID()
const recordId = randomUUID(), operation = randomUUID()
const deniedActors = [
  { auth: randomUUID(), role: 'CAJERO', active: true },
  { auth: randomUUID(), role: 'VISOR', active: true },
  { auth: randomUUID(), role: 'DUEÑO', active: false },
]
const moduleSql = readFileSync('supabase/pilot-backup/001_contacts_restore.sql', 'utf8')
interface Ack { id: string; kiosco_id: string; creado: boolean; saldo_conservado: boolean; registro: Record<string, unknown> }

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
  await db.exec(moduleSql); await db.exec(moduleSql)
  const inventorySql = readFileSync('supabase/pilot-backup/002_inventory_restore.sql', 'utf8')
  await db.exec(inventorySql); await db.exec(inventorySql)
  const capabilitySql = readFileSync('supabase/pilot-backup/003_restore_capability.sql', 'utf8')
  await db.exec(capabilitySql); await db.exec(capabilitySql)
  await db.query<Record<string, unknown>>('INSERT INTO auth.users VALUES($1)', [auth])
  await db.query<Record<string, unknown>>('INSERT INTO kioscos(id,nombre) VALUES($1,\'Ensayo\'),($2,\'Ajeno\')', [kid, foreignKid])
  await db.query<Record<string, unknown>>("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Dueño','DUEÑO')", [owner, auth, kid])
  for (const actor of deniedActors) {
    await db.query<Record<string, unknown>>('INSERT INTO auth.users VALUES($1)', [actor.auth])
    await db.query<Record<string, unknown>>("INSERT INTO usuarios(auth_user_id,kiosco_id,nombre,rol,activo) VALUES($1,$2,'Actor de ensayo',$3,$4)", [actor.auth, kid, actor.role, actor.active])
  }
  await db.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.role','authenticated',false)", [auth])
}, 120_000)
beforeEach(async () => { await db.exec('BEGIN; SET ROLE authenticated') })
afterEach(async () => { await db.exec('ROLLBACK; RESET ROLE') })
afterAll(async () => { await db.close() })

async function restore(table: string, data: Record<string, unknown>, op = operation, id = recordId, target = kid): Promise<Ack> {
  const result = await db.query<{ ack: Ack }>('SELECT restaurar_contacto_backup($1,$2,$3,$4,$5::jsonb) ack', [op, target, table, id, JSON.stringify(data)])
  return result.rows[0].ack
}
// Rechazos dentro de una transacción de ensayo necesitan savepoint para seguir comprobando.
async function rejects(action: () => Promise<unknown>, message?: string): Promise<void> {
  await db.exec('SAVEPOINT expected_rejection')
  if (message) await expect(action()).rejects.toThrow(message)
  else await expect(action()).rejects.toThrow()
  await db.exec('ROLLBACK TO SAVEPOINT expected_rejection; RELEASE SAVEPOINT expected_rejection')
}

describe.each([
  { table: 'clientes', balance: 'saldo_deudor', fields: { dni_cuit: 'Documento de ensayo', direccion: 'Dirección', limite_credito: 1000, notas: 'Prueba' } },
  { table: 'proveedores', balance: 'saldo_pendiente', fields: { contacto_nombre: 'Contacto', cuit: 'Identificador de ensayo', dias_visita: 'Lunes', cbu_alias: 'alias.ensayo' } },
])('$table', ({ table, balance, fields }) => {
  const data = { nombre: ' Contacto de ensayo ', telefono: '123', email: 'contacto@example.test', activo: false, ...fields, [balance]: 135.25 }
  it('restaura datos y saldo inicial sin movimientos financieros y reintenta con el mismo ACK', async () => {
    const first = await restore(table, data)
    expect(first).toMatchObject({ id: recordId, kiosco_id: kid, creado: true, saldo_conservado: false,
      registro: { nombre: 'Contacto de ensayo', activo: false, email: 'contacto@example.test', [balance]: 135.25, ...fields } })
    expect(await restore(table, data)).toEqual(first)
    await db.exec('RESET ROLE')
    expect((await db.query<Record<string, unknown>>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(1)
    for (const financial of ['movimientos_cuenta_corriente', 'movimientos_proveedor', 'pagos_proveedor', 'movimientos_caja']) {
      expect((await db.query<Record<string, unknown>>(`SELECT count(*)::int n FROM ${financial}`)).rows[0].n).toBe(0)
    }
  })
  it('conserva saldo actual después de pagos y restaura contacto con otra operación', async () => {
    await restore(table, data)
    await db.exec(`RESET ROLE; UPDATE ${table} SET ${balance}=12.50; SET ROLE authenticated`)
    const ack = await restore(table, { ...data, nombre: 'Actualizado' }, randomUUID())
    expect(ack).toMatchObject({ creado: false, saldo_conservado: true, registro: { nombre: 'Actualizado', [balance]: 12.5 } })
  })
  it('rechaza cambio de solicitud para una operación ya confirmada', async () => {
    await restore(table, data)
    await rejects(() => restore(table, { ...data, nombre: 'Otra solicitud' }), 'otra solicitud')
  })
  it('rechaza registros ajenos y destino distinto del dueño sin dejar operaciones', async () => {
    await db.exec('RESET ROLE')
    await db.query<Record<string, unknown>>(`INSERT INTO ${table}(id,kiosco_id,nombre) VALUES($1,$2,'Ajeno')`, [recordId, foreignKid])
    await db.exec('SET ROLE authenticated')
    await rejects(() => restore(table, data), 'ajeno')
    await rejects(() => restore(table, data, operation, recordId, foreignKid), 'mismo comercio')
    await db.exec('RESET ROLE')
    expect((await db.query<Record<string, unknown>>('SELECT count(*)::int n FROM operaciones_escritura')).rows[0].n).toBe(0)
  })
  it('rechaza entradas malformadas y campos no permitidos antes de guardar', async () => {
    for (const input of [{ ...data, nombre: '' }, { ...data, nombre: 'x'.repeat(181) }, { ...data, activo: 'false' },
      { ...data, kiosco_id: foreignKid }, { ...data, [balance]: -1 }, { ...data, [balance]: '10' },
      { ...data, [balance]: null }, { ...data, [balance]: 1.005 }, { ...data, telefono: {} }]) {
      await rejects(() => restore(table, input))
    }
    await db.exec('RESET ROLE')
    expect((await db.query<Record<string, unknown>>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  })
  it('revierte el registro y la operación si un trigger omite o altera la escritura', async () => {
    await db.exec(`RESET ROLE;
      CREATE FUNCTION public.test_omit_contact() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
      CREATE TRIGGER test_omit BEFORE INSERT ON ${table} FOR EACH ROW EXECUTE FUNCTION public.test_omit_contact();
      SET ROLE authenticated;`)
    await rejects(() => restore(table, data), 'no confirmó')
    await db.exec('RESET ROLE')
    expect((await db.query<Record<string, unknown>>('SELECT count(*)::int n FROM operaciones_escritura')).rows[0].n).toBe(0)
    expect((await db.query<Record<string, unknown>>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  })
})

it('rechaza cajero, visor, perfil inactivo, falta de identidad y comercio suspendido', async () => {
  for (const actor of deniedActors) {
    await db.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub',$1,true)", [actor.auth])
    await rejects(() => restore('clientes', { nombre: 'Ensayo' }), 'dueño')
  }
  await db.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub',$1,true)", [auth])
  await db.exec("RESET ROLE; UPDATE kioscos SET estado_suscripcion='SUSPENDIDO'; SET ROLE authenticated")
  await rejects(() => restore('clientes', { nombre: 'Ensayo' }), 'habilitado')
  await db.exec("SELECT set_config('request.jwt.claim.sub','',true)")
  await rejects(() => restore('clientes', { nombre: 'Ensayo' }), 'dueño')
})
it('rechaza puntos no recuperables en vez de perderlos silenciosamente', async () => {
  await rejects(() => restore('clientes', { nombre: 'Ensayo', puntos_fidelidad: 10 }), 'fidelidad')
  expect((await restore('clientes', { nombre: 'Ensayo', puntos_fidelidad: 0 })).registro.nombre).toBe('Ensayo')
})
it('no permite ejecutar anónimo/service_role ni ampliar permisos de tablas', async () => {
  await db.exec('RESET ROLE')
  const { rows } = await db.query<Record<string, unknown>>(`SELECT
    has_function_privilege('anon','restaurar_contacto_backup(uuid,uuid,text,uuid,jsonb)','EXECUTE') anon,
    has_function_privilege('service_role','restaurar_contacto_backup(uuid,uuid,text,uuid,jsonb)','EXECUTE') servicio,
    has_table_privilege('authenticated','operaciones_escritura','INSERT') op_insert`)
  expect(rows[0]).toEqual({ anon: false, servicio: false, op_insert: false })
})

const productId = randomUUID(), providerId = randomUUID(), batchId = randomUUID()
const productData = { descripcion: 'Artículo de prueba', precio_venta: 200, precio_costo: 50,
  stock_actual: 5, es_pesable: false, proveedor_id: null }
async function restoreProduct(data: Record<string, unknown> = productData, op = randomUUID()) {
  return (await db.query<{ ack: { producto: Record<string, unknown> } }>('SELECT restaurar_producto_backup($1,$2,$3,$4::jsonb) ack',
    [op, kid, productId, JSON.stringify(data)])).rows[0].ack
}
const batchData = { producto_id: productId, numero_lote: 'ENSAYO', fecha_vencimiento: '2027-01-01',
  cantidad_inicial: 5, cantidad_actual: 3, fecha_ingreso: '2026-10-01T10:00:00Z', activo: true }
async function restoreBatch(data: Record<string, unknown> = batchData, op = operation, id = batchId) {
  return (await db.query<{ ack: Ack }>('SELECT restaurar_lote_backup($1,$2,$3,$4::jsonb) ack',
    [op, kid, id, JSON.stringify(data)])).rows[0].ack
}

it('restaura proveedor y producto/costo/stock atómicos sin duplicar al reintentar', async () => {
  await restore('proveedores', { nombre: 'Distribuidor de ensayo', saldo_pendiente: 200 }, randomUUID(), providerId)
  const data = { ...productData, proveedor_id: providerId }
  const first = await restoreProduct(data, operation)
  expect(first.producto).toMatchObject({ id: productId, kiosco_id: kid, proveedor_id: providerId, stock_actual: 5 })
  expect(await restoreProduct(data, operation)).toEqual(first)
  await rejects(() => restoreProduct({ ...data, stock_actual: 2 }, operation), 'otra solicitud')
  await db.exec('RESET ROLE')
  expect((await db.query<Record<string, unknown>>('SELECT count(*)::int n FROM movimientos_stock')).rows[0].n).toBe(1)
  expect((await db.query<Record<string, unknown>>('SELECT precio_costo FROM producto_costos')).rows[0].precio_costo).toBe('50.00')
})

it('rechaza proveedor ajeno antes de crear producto, stock, costos u operación', async () => {
  await db.exec('RESET ROLE')
  await db.query<Record<string, unknown>>("INSERT INTO proveedores(id,kiosco_id,nombre) VALUES($1,$2,'Ajeno')", [providerId, foreignKid])
  await db.exec('SET ROLE authenticated')
  await rejects(() => restoreProduct({ ...productData, proveedor_id: providerId }), 'ajeno')
  await db.exec('RESET ROLE')
  for (const table of ['productos', 'producto_costos', 'movimientos_stock', 'operaciones_escritura']) {
    expect((await db.query<Record<string, unknown>>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  }
})

it('revierte producto, stock, costos y operación si no se confirma la asociación', async () => {
  await restore('proveedores', { nombre: 'Proveedor' }, randomUUID(), providerId)
  await db.exec(`RESET ROLE;
    CREATE FUNCTION test_omit_association() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      IF NEW.proveedor_id IS DISTINCT FROM OLD.proveedor_id THEN RETURN NULL; END IF; RETURN NEW; END $$;
    CREATE TRIGGER test_association BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION test_omit_association();
    SET ROLE authenticated;`)
  await rejects(() => restoreProduct({ ...productData, proveedor_id: providerId }), 'no confirmó')
  await db.exec('RESET ROLE')
  for (const table of ['productos', 'producto_costos', 'movimientos_stock']) {
    expect((await db.query<Record<string, unknown>>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  }
  expect((await db.query<Record<string, unknown>>("SELECT count(*)::int n FROM operaciones_escritura WHERE tipo<>'BACKUP_CONTACTO'")).rows[0].n).toBe(0)
})

it('restaura lotes y fechas FEFO sin sumar stock ni crear kardex al repetir', async () => {
  await restoreProduct()
  const first = await restoreBatch()
  expect(first.registro).toMatchObject({ producto_id: productId, cantidad_actual: 3, cantidad_inicial: 5,
    fecha_vencimiento: '2027-01-01' })
  expect(new Date(String(first.registro.fecha_ingreso)).toISOString()).toBe('2026-10-01T10:00:00.000Z')
  expect(await restoreBatch()).toEqual(first)
  await db.exec('RESET ROLE')
  expect((await db.query<Record<string, unknown>>('SELECT stock_actual FROM productos')).rows[0].stock_actual).toBe('5.000')
  expect((await db.query<Record<string, unknown>>('SELECT count(*)::int n FROM movimientos_stock')).rows[0].n).toBe(1)
  expect((await db.query<Record<string, unknown>>('SELECT count(*)::int n FROM lotes_producto')).rows[0].n).toBe(1)
})

it('rechaza exceso de stock entre lotes y cantidades fraccionarias de unidades', async () => {
  await restoreProduct(); await restoreBatch()
  await rejects(() => restoreBatch({ ...batchData, cantidad_actual: 3 }, randomUUID(), randomUUID()), 'stock físico')
  await rejects(() => restoreBatch({ ...batchData, cantidad_actual: 0.5 }, randomUUID()), 'fracciones')
  await rejects(() => restoreBatch({ ...batchData, cantidad_actual: 6 }, randomUUID()), 'Cantidades')
  await rejects(() => restoreBatch({ ...batchData, cantidad_actual: '2' }, randomUUID()), 'inválida')
  await rejects(() => restoreBatch({ ...batchData, fecha_vencimiento: '2027-02-30' }, randomUUID()))
  await rejects(() => restoreBatch({ ...batchData, fecha_ingreso: '2026-10-01' }, randomUUID()), 'ingreso')
  await rejects(() => restoreBatch({ ...batchData, kiosco_id: foreignKid }, randomUUID()), 'inválida')
  await db.exec('RESET ROLE')
  expect((await db.query<Record<string, unknown>>('SELECT cantidad_actual FROM lotes_producto')).rows[0].cantidad_actual).toBe('3.000')
})

it('admite lotes pesables de tres decimales y conserva fecha al omitir ingreso en una copia antigua', async () => {
  await restoreProduct({ ...productData, es_pesable: true })
  await restoreBatch({ ...batchData, cantidad_actual: 0.125 })
  const { fecha_ingreso: _ingreso, ...older } = batchData
  const ack = await restoreBatch({ ...older, cantidad_actual: 0.25 }, randomUUID())
  expect(new Date(String(ack.registro.fecha_ingreso)).toISOString()).toBe('2026-10-01T10:00:00.000Z')
  await rejects(() => restoreBatch({ ...batchData, cantidad_actual: 0.1255 }, randomUUID()), 'Cantidades')
})

it('no reasigna un lote existente a otro producto ni a otro comercio', async () => {
  await restoreProduct(); await restoreBatch()
  const otherProduct = randomUUID()
  await db.exec('RESET ROLE')
  await db.query<Record<string, unknown>>("INSERT INTO productos(id,kiosco_id,descripcion,stock_actual) VALUES($1,$2,'Otro',5)", [otherProduct, kid])
  await db.exec('SET ROLE authenticated')
  await rejects(() => restoreBatch({ ...batchData, producto_id: otherProduct }, randomUUID()), 'otro producto')
  await db.exec('RESET ROLE')
  await db.query<Record<string, unknown>>('UPDATE lotes_producto SET kiosco_id=$1', [foreignKid])
  await db.exec('SET ROLE authenticated')
  await rejects(() => restoreBatch(batchData, randomUUID()), 'otro producto')
})

it('revierte un lote si un trigger altera stock físico', async () => {
  await restoreProduct()
  await db.exec(`RESET ROLE;
    CREATE FUNCTION test_batch_stock() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      UPDATE productos SET stock_actual=stock_actual+1 WHERE id=NEW.producto_id; RETURN NEW; END $$;
    CREATE TRIGGER test_batch_stock AFTER INSERT ON lotes_producto FOR EACH ROW EXECUTE FUNCTION test_batch_stock();
    SET ROLE authenticated;`)
  await rejects(() => restoreBatch(), 'alteró el stock')
  await db.exec('RESET ROLE')
  expect((await db.query<Record<string, unknown>>('SELECT stock_actual FROM productos')).rows[0].stock_actual).toBe('5.000')
  expect((await db.query<Record<string, unknown>>('SELECT count(*)::int n FROM lotes_producto')).rows[0].n).toBe(0)
})

it('los contratos de inventario rechazan cajero y no conceden acceso anónimo ni de servicio', async () => {
  await db.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub',$1,true)", [deniedActors[0].auth])
  await rejects(() => restoreProduct(), 'dueño')
  await rejects(() => restoreBatch(), 'dueño')
  await db.exec('RESET ROLE')
  for (const signature of ['restaurar_producto_backup(uuid,uuid,uuid,jsonb)', 'restaurar_lote_backup(uuid,uuid,uuid,jsonb)']) {
    const { rows } = await db.query<Record<string, unknown>>("SELECT has_function_privilege('anon',$1,'EXECUTE') anon,has_function_privilege('service_role',$1,'EXECUTE') servicio", [signature])
    expect(rows[0]).toEqual({ anon: false, servicio: false })
  }
})

it('sólo informa capacidad completa al dueño habilitado y no escribe operaciones', async () => {
  expect((await db.query<{ cap: unknown }>('SELECT capacidades_restauracion_backup($1) cap', [kid])).rows[0].cap)
    .toEqual({ version: 1, kiosco_id: kid, modulos: ['contactos', 'producto_proveedor', 'lotes'] })
  await rejects(() => db.query<Record<string, unknown>>('SELECT capacidades_restauracion_backup($1)', [foreignKid]), 'comercio habilitado')
  await db.query<Record<string, unknown>>("SELECT set_config('request.jwt.claim.sub',$1,true)", [deniedActors[0].auth])
  await rejects(() => db.query<Record<string, unknown>>('SELECT capacidades_restauracion_backup($1)', [kid]), 'dueño')
  await db.exec('RESET ROLE')
  expect((await db.query<Record<string, unknown>>('SELECT count(*)::int n FROM operaciones_escritura')).rows[0].n).toBe(0)
})

it('rechaza anunciar capacidad cuando falta uno de los contratos instalables', async () => {
  await db.exec('RESET ROLE; DROP FUNCTION restaurar_lote_backup(uuid,uuid,uuid,jsonb); SET ROLE authenticated')
  await rejects(() => db.query<Record<string, unknown>>('SELECT capacidades_restauracion_backup($1)', [kid]), 'incompleto')
})

it('restaura stock y varios lotes existentes en una única transacción aunque reduzca sus cantidades', async () => {
  const secondId = randomUUID()
  const initial = [{ ...batchData, id: batchId, cantidad_actual: 3 }, { ...batchData, id: secondId, cantidad_actual: 2 }]
  await restoreProduct({ ...productData, lotes_backup: initial })
  const data = { ...productData, stock_actual: 2, lotes_backup: initial.map(l => ({ ...l, cantidad_actual: 1 })) }
  const ack = await restoreProduct(data, operation)
  expect(ack.producto.stock_actual).toBe(2)
  expect(await restoreProduct(data, operation)).toEqual(ack)
  await db.exec('RESET ROLE')
  expect((await db.query<Record<string, unknown>>('SELECT sum(cantidad_actual) total FROM lotes_producto WHERE activo')).rows[0].total).toBe('2.000')
  expect((await db.query<Record<string, unknown>>('SELECT count(*)::int n FROM movimientos_stock')).rows[0].n).toBe(2)
})

it('un lote inválido revierte también el cambio de stock y los lotes anteriores', async () => {
  await restoreProduct({ ...productData, lotes_backup: [{ ...batchData, id: batchId }] })
  await rejects(() => restoreProduct({ ...productData, stock_actual: 1,
    lotes_backup: [{ ...batchData, id: batchId, cantidad_actual: 1 },
      { ...batchData, id: randomUUID(), fecha_vencimiento: '2027-02-30' }] }), 'date/time')
  await db.exec('RESET ROLE')
  expect((await db.query<Record<string, unknown>>('SELECT stock_actual FROM productos')).rows[0].stock_actual).toBe('5.000')
  expect((await db.query<Record<string, unknown>>('SELECT cantidad_actual,activo FROM lotes_producto')).rows[0]).toMatchObject({ cantidad_actual: '3.000', activo: true })
  expect((await db.query<Record<string, unknown>>('SELECT count(*)::int n FROM movimientos_stock')).rows[0].n).toBe(1)
})

it('un catálogo sin lotes ajusta stock y lotes retenidos coherentemente mediante el contrato FEFO existente', async () => {
  await restoreProduct({ ...productData, lotes_backup: [{ ...batchData, id: batchId }] })
  await restoreProduct({ ...productData, stock_actual: 1, lotes_backup: [] })
  await db.exec('RESET ROLE')
  expect((await db.query<Record<string, unknown>>('SELECT stock_actual FROM productos')).rows[0].stock_actual).toBe('1.000')
  // Ajustar de 5 a 1 consume las 3 unidades del lote y una sin lote: no inventa trazabilidad.
  expect((await db.query<Record<string, unknown>>('SELECT cantidad_actual,activo,numero_lote FROM lotes_producto')).rows[0]).toMatchObject({ cantidad_actual: '0.000', activo: false, numero_lote: 'ENSAYO' })
})
