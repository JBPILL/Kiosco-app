// @vitest-environment node
// Contrato SQL con esquema completo; no sustituye Auth/RLS/JWT hospedados.
import { readdirSync, readFileSync, mkdtempSync, rmSync } from 'node:fs'
import { join, resolve, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { createRestoreJournal, inspectRestoreJournal, executeNextRestoreAction, loadRestorePlan, valueHash } from '../../scripts/backup/restore-acceptance-engine.mjs'
import { randomUUID, createHash } from 'node:crypto'
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
  it('no entrega el ACK de otro Auth después de reasignar el mismo perfil', async () => {
    await restore(table, data)
    await reassignOwnerAuth()
    await rejects(() => restore(table, data), 'otra solicitud')
  })
  it('no infiere la identidad de una operación histórica sin Auth guardado', async () => {
    await restore(table, data)
    const legacy = await seedOperationWithoutAuth(operation)
    await rejects(() => restore(table, data, legacy), 'otra solicitud')
    await expectOperationStillUnbound(legacy)
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
async function reassignOwnerAuth(): Promise<void> {
  const replacement = randomUUID()
  await db.exec('RESET ROLE')
  await db.query('INSERT INTO auth.users VALUES($1)', [replacement])
  await db.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2', [replacement, owner])
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [replacement])
  await db.exec('SET ROLE authenticated')
}
async function seedOperationWithoutAuth(source: string): Promise<ReturnType<typeof randomUUID>> {
  const legacy = randomUUID()
  await db.exec('RESET ROLE')
  await db.query(`INSERT INTO operaciones_escritura(id,kiosco_id,usuario_id,tipo,solicitud,resultado)
    SELECT $1,kiosco_id,usuario_id,tipo,solicitud-'actor_auth_id',resultado FROM operaciones_escritura WHERE id=$2`, [legacy, source])
  await db.exec('SET ROLE authenticated')
  return legacy
}
async function expectOperationStillUnbound(id: string): Promise<void> {
  await db.exec('RESET ROLE')
  const saved = await db.query<{ bound: boolean; completed: boolean }>(
    "SELECT solicitud ? 'actor_auth_id' bound,resultado IS NOT NULL completed FROM operaciones_escritura WHERE id=$1", [id])
  expect(saved.rows).toEqual([{ bound: false, completed: true }])
}
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

it('no recupera el producto preparado por otro Auth del mismo perfil', async () => {
  await restoreProduct(productData, operation)
  await reassignOwnerAuth()
  await rejects(() => restoreProduct(productData, operation), 'otra solicitud')
})
it('no recupera el lote preparado por otro Auth del mismo perfil', async () => {
  await restoreProduct()
  await restoreBatch()
  await reassignOwnerAuth()
  await rejects(() => restoreBatch(), 'otra solicitud')
})
it('no infiere Auth histórico al recuperar un producto', async () => {
  await restoreProduct(productData, operation)
  const legacy = await seedOperationWithoutAuth(operation)
  await rejects(() => restoreProduct(productData, legacy), 'otra solicitud')
  await expectOperationStillUnbound(legacy)
})
it('no infiere Auth histórico al recuperar un lote', async () => {
  await restoreProduct()
  await restoreBatch()
  const legacy = await seedOperationWithoutAuth(operation)
  await rejects(() => restoreBatch(batchData, legacy), 'otra solicitud')
  await expectOperationStillUnbound(legacy)
})

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

interface RestoreAcceptanceStep {
  name: string
  rpc: 'restaurar_contacto_backup' | 'restaurar_producto_backup' | 'restaurar_lote_backup'
  params: Record<string, unknown>
  expected: 'ACK_AND_SINGLE_EXPLICIT_REPLAY' | 'REJECT'
  sqlstate?: string
}
it('prueba el paquete fijo de aceptacion con fixtures inactivos, replay, atomicidad y cierre sin borrar auditoria', async () => {
  const plan: { status: string; remoteExecutorIncluded: boolean; fixtureIds: Record<string,string>; sqlSha256Lf: Record<string,string>; steps: RestoreAcceptanceStep[]; expectedDurableOperationsIncludingNested: number; expectedStockMovements: number; cashierDeniedCalls: RestoreAcceptanceStep[] } = JSON.parse(readFileSync('scripts/backup/restore-acceptance-plan.json','utf8'))
  expect(plan.status).toBe('LOCAL_PREPARATION_NO_REMOTE_GO')
  expect(plan.remoteExecutorIncluded).toBe(false)
  for (const [file, expectedHash] of Object.entries(plan.sqlSha256Lf)) {
    expect(['001_contacts_restore.sql','002_inventory_restore.sql','003_restore_capability.sql']).toContain(file)
    expect(createHash('sha256').update(readFileSync(join('supabase/pilot-backup',file),'utf8').replaceAll('\r\n','\n')).digest('hex')).toBe(expectedHash)
  }
  async function call(step: RestoreAcceptanceStep): Promise<Record<string,unknown>> {
    const p=step.params
    // Only the target kiosk is remapped to this LOCAL synthetic test transaction.
    const args=[p.p_operacion_id,kid]
    if(step.rpc==='restaurar_contacto_backup') {
      const result=await db.query<{ack:Record<string,unknown>}>('SELECT restaurar_contacto_backup($1,$2,$3,$4,$5::jsonb) ack',[...args,p.p_tabla,p.p_registro_id,JSON.stringify(p.p_datos)])
      return result.rows[0].ack
    }
    if(step.rpc==='restaurar_producto_backup') {
      const result=await db.query<{ack:Record<string,unknown>}>('SELECT restaurar_producto_backup($1,$2,$3,$4::jsonb) ack',[...args,p.p_producto_id,JSON.stringify(p.p_datos)])
      return result.rows[0].ack
    }
    if(step.rpc!=='restaurar_lote_backup')throw Error('Unexpected restore RPC')
    const result=await db.query<{ack:Record<string,unknown>}>('SELECT restaurar_lote_backup($1,$2,$3,$4::jsonb) ack',[...args,p.p_lote_id,JSON.stringify(p.p_datos)])
    return result.rows[0].ack
  }
  async function snapshot():Promise<Record<string,unknown>> {
    await db.exec('RESET ROLE')
    const result=await db.query<Record<string,unknown>>(`SELECT
      (SELECT count(*)::int FROM operaciones_escritura) operations,
      (SELECT count(*)::int FROM movimientos_stock) stock_movements,
      (SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id),'[]'::jsonb) FROM productos p) products,
      (SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY l.id),'[]'::jsonb) FROM lotes_producto l) batches`)
    await db.exec('SET ROLE authenticated')
    return result.rows[0]
  }
  expect(plan.steps).toHaveLength(10)
  for(const step of plan.steps) {
    if(step.expected==='REJECT') {
      const before=await snapshot()
      await db.exec('SAVEPOINT plan_rejection')
      await expect(call(step)).rejects.toMatchObject({code:step.sqlstate})
      await db.exec('ROLLBACK TO SAVEPOINT plan_rejection; RELEASE SAVEPOINT plan_rejection')
      expect(await snapshot()).toEqual(before)
    } else {
      const ack=await call(step), after=await snapshot()
      expect(await call(step)).toEqual(ack)
      expect(await snapshot()).toEqual(after)
    }
  }
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[deniedActors[0].auth])
  expect(plan.cashierDeniedCalls).toHaveLength(3)
  for(const step of plan.cashierDeniedCalls) {
    const before=await snapshot()
    await db.exec('SAVEPOINT cashier_denial')
    await expect(call(step)).rejects.toMatchObject({code:'42501'})
    await db.exec('ROLLBACK TO SAVEPOINT cashier_denial; RELEASE SAVEPOINT cashier_denial')
    expect(await snapshot()).toEqual(before)
  }
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[auth])
  const final=await snapshot()
  expect(final.operations).toBe(plan.expectedDurableOperationsIncludingNested)
  expect(final.stock_movements).toBe(plan.expectedStockMovements)
  await db.exec('RESET ROLE')
  const contacts=await db.query<Record<string,unknown>>(`SELECT
    (SELECT saldo_deudor FROM clientes WHERE id=$1) client_balance,
    (SELECT saldo_pendiente FROM proveedores WHERE id=$2) provider_balance,
    (SELECT activo FROM clientes WHERE id=$1) client_active,
    (SELECT activo FROM proveedores WHERE id=$2) provider_active`,[plan.fixtureIds.client,plan.fixtureIds.provider])
  expect(contacts.rows[0]).toEqual({client_balance:'0.00',provider_balance:'0.00',client_active:false,provider_active:false})
  const product=await db.query<Record<string,unknown>>('SELECT stock_actual,activo,proveedor_id FROM productos WHERE id=$1',[plan.fixtureIds.product])
  expect(product.rows[0]).toEqual({stock_actual:'0.000',activo:false,proveedor_id:plan.fixtureIds.provider})
  const batch=await db.query<Record<string,unknown>>('SELECT cantidad_actual,activo,producto_id FROM lotes_producto WHERE id=$1',[plan.fixtureIds.batch])
  expect(batch.rows[0]).toEqual({cantidad_actual:'0.000',activo:false,producto_id:plan.fixtureIds.product})
  for(const table of ['ventas','movimientos_caja','movimientos_cuenta_corriente','movimientos_proveedor','pagos_proveedor']) {
    expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  }
})

it('el preflight fijo usa READ ONLY/ROLLBACK y detecta ausencia de fixtures sin leer cuerpos privados', async () => {
  const planBytes=readFileSync('scripts/backup/restore-acceptance-plan.json')
  const source=readFileSync('scripts/backup/restore-acceptance-preflight.sql','utf8')
  expect(source.startsWith('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;')).toBe(true)
  expect(source.trimEnd().endsWith('ROLLBACK;')).toBe(true)
  expect(source).toContain(createHash('sha256').update(planBytes).digest('hex'))
  // Existing synthetic profile substitutes only the target identity fuse locally.
  const local=source.replaceAll('b7254826-c767-4098-94b8-71013c12021d',kid).replaceAll('0e90b9a7-36d2-4762-ab1a-4982996cf9aa',auth)
  await db.exec('ROLLBACK; RESET ROLE')
  const results=await db.exec(local)
  const row=results.find(r=>r.rows.length>0)?.rows[0] as {evidence:{read_only:string;identity_fuse:boolean;public_overloads:number;operation_collisions:number;fixture_counts:Record<string,number>;functions:{present:boolean;metadata_matches:boolean}[]}} | undefined
  expect(row?.evidence).toMatchObject({read_only:'on',identity_fuse:true,public_overloads:4,operation_collisions:0,fixture_counts:{clientes:0,proveedores:0,productos:0,lotes_producto:0}})
  expect(row?.evidence.functions).toHaveLength(4)
  expect(row?.evidence.functions.every(f=>f.present&&f.metadata_matches)).toBe(true)
})

it('ejecuta el motor durable contra los ACK SQL reales locales para las21 acciones fijadas', async () => {
  const plan=loadRestorePlan(),folder=mkdtempSync(join(tmpdir(),'kiosko-restore-sql-'))
  if(dirname(folder)!==resolve(tmpdir())||!basename(folder).startsWith('kiosko-restore-sql-'))throw Error('Unsafe local folder')
  try {
    // This UUID is only a synthetic row inside PGlite; no hosted connection exists.
    await db.exec('RESET ROLE')
    await db.exec("SELECT set_config('request.jwt.claim.sub','',true),set_config('request.jwt.claim.role','',true)")
    await db.query('INSERT INTO kioscos(id,nombre) VALUES($1,$2)',[plan.kioskId,'LOCAL SYNTHETIC PLAN'])
    await db.query('UPDATE usuarios SET kiosco_id=$1 WHERE kiosco_id=$2',[plan.kioskId,kid])
    await db.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[auth])
    await db.exec('SET ROLE authenticated')
    const journal=createRestoreJournal(join(folder,'journal.jsonl'),{OWNER:auth,CASHIER:deniedActors[0].auth})
    let count=0
    while(!inspectRestoreJournal(journal).complete){
      const role=inspectRestoreJournal(journal).cursor>=18?'CASHIER':'OWNER'
      const authId=role==='OWNER'?auth:deniedActors[0].auth
      await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[authId])
      await executeNextRestoreAction(journal,{role,authId,kioskId:plan.kioskId},async(rpc:string,p:Record<string,unknown>)=>{
        count++
        await db.exec('SAVEPOINT operator_http_response')
        try {
          const args=[p.p_operacion_id,p.p_kiosco_id]
          let result
          if(rpc==='restaurar_contacto_backup')result=await db.query<{ack:Record<string,unknown>}>('SELECT restaurar_contacto_backup($1,$2,$3,$4,$5::jsonb) ack',[...args,p.p_tabla,p.p_registro_id,JSON.stringify(p.p_datos)])
          else if(rpc==='restaurar_producto_backup')result=await db.query<{ack:Record<string,unknown>}>('SELECT restaurar_producto_backup($1,$2,$3,$4::jsonb) ack',[...args,p.p_producto_id,JSON.stringify(p.p_datos)])
          else if(rpc==='restaurar_lote_backup')result=await db.query<{ack:Record<string,unknown>}>('SELECT restaurar_lote_backup($1,$2,$3,$4::jsonb) ack',[...args,p.p_lote_id,JSON.stringify(p.p_datos)])
          else throw Error('Unexpected RPC')
          await db.exec('RELEASE SAVEPOINT operator_http_response')
          return {status:200,data:result.rows[0].ack}
        } catch(error:unknown) {
          await db.exec('ROLLBACK TO SAVEPOINT operator_http_response; RELEASE SAVEPOINT operator_http_response')
          const code=error&&typeof error==='object'&&'code' in error?String(error.code):'UNKNOWN'
          if(!['22023','42501'].includes(code))throw Error('Unexpected SQL failure')
          return {status:code==='42501'?403:400,data:{code}}
        }
      })
      const rows=journal.records(), completed=rows.at(-1)!, intent=rows.at(-2)!
      if(completed.kind==='CONFIRMED') {
        await db.exec('RESET ROLE')
        const saved=await db.query<{solicitud:Record<string,unknown>;resultado:Record<string,unknown>}>('SELECT solicitud,resultado FROM operaciones_escritura WHERE id=$1',[completed.operationId])
        expect(valueHash(saved.rows[0].solicitud)).toBe(intent.requestHash)
        expect(valueHash(saved.rows[0].resultado)).toBe(completed.ackHash)
        await db.exec('SET ROLE authenticated')
      }
    }
    expect(count).toBe(21)
    expect(inspectRestoreJournal(journal)).toMatchObject({cursor:21,complete:true,pending:null})
    await db.exec('RESET ROLE')
    expect((await db.query<{n:number}>('SELECT count(*)::int n FROM operaciones_escritura')).rows[0].n).toBe(14)
    expect((await db.query<{stock_actual:string;activo:boolean}>('SELECT stock_actual,activo FROM productos WHERE id=$1',[plan.fixtureIds.product])).rows[0]).toEqual({stock_actual:'0.000',activo:false})
  } finally {rmSync(folder,{recursive:true,force:true})}
})
