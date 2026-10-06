// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest'
import { cotizarCobroPoint, type DatosCotizacionPoint, type LineaCotizacionPoint } from '../../supabase/functions/_shared/pointQuote'
import { crearProducto } from '../test/factories'

let db: PGlite
const kid = '10000000-0000-0000-0000-000000000001'
const attempt = '20000000-0000-0000-0000-000000000001'
const second = '20000000-0000-0000-0000-000000000002'
const caja = '30000000-0000-0000-0000-000000000001'
const user = '40000000-0000-0000-0000-000000000001'
const product = '50000000-0000-0000-0000-000000000001'
const lote1 = '60000000-0000-0000-0000-000000000001'
const lote2 = '60000000-0000-0000-0000-000000000002'
const client = '70000000-0000-0000-0000-000000000001'
const service = '80000000-0000-0000-0000-000000000001'
const returned = '80000000-0000-0000-0000-000000000002'
const payment = '90000000-0000-0000-0000-000000000001'
const lineas: LineaCotizacionPoint[] = [
  { tipo: 'PRODUCTO', id: product, productoId: product, cantidad: 2.5, sinEnvase: false },
  { tipo: 'SERVICIO', id: service, descripcion: 'Impresión', precio: 100, cantidad: 1 },
  { tipo: 'DEVOLUCION_ENVASE', id: returned, envaseId: '1lt', cantidad: 1 },
]

async function preparar(id = attempt, credito = 1500, articulos = lineas, ajuste = 1, receta: Partial<DatosCotizacionPoint> = {}) {
  const pagos = credito ? [{ id: payment, medio: 'CUENTA_CORRIENTE' as const, montoCentavos: credito }] : []
  const entrada = { intentoId: id, checkoutId: id, clienteId: credito ? client : null, lineas: articulos,
    pagos, tipoAjuste: 'DESCUENTO_FIJO' as const, valorAjuste: ajuste }
  const cotizacion = cotizarCobroPoint(articulos, entrada.tipoAjuste, ajuste, {
    kioscoId: kid, productos: [crearProducto({ id: product, kiosco_id: kid, precio_venta: 100,
      precio_costo: 0, stock_actual: 10, es_pesable: true })], promociones: [],
    envases: [{ id: '1lt', kioscoId: kid, nombre: '1 litro', precio: 50 }],
    permiteServicios: true, permiteAjustes: true, fecha: new Date('2026-10-06T12:00:00Z'), ...receta,
  }, pagos, entrada.clienteId)
  const solicitud = { version: 2, usuarioId: user, sesionCajaId: caja, entrada, cotizacion }
  await db.query("SELECT preparar_intento_point($1,$2,$1,'terminal',$3,$4::jsonb,'123','456','sandbox')",
    [id, kid, cotizacion.cobro.montoPointCentavos, JSON.stringify(solicitud)])
  await db.query('SELECT reservar_checkout_point($1,$2)', [id, kid])
  return solicitud
}
const pagar = (id = attempt) => db.query("UPDATE point_intentos SET estado='PAGO_CONFIRMADO',order_id=$2,payment_id=$3 WHERE id=$1",
  [id, id === attempt ? 'ORD123' : 'ORD456', id === attempt ? 'PAY123' : 'PAY456'])
const confirmar = (id = attempt, kiosco = kid) => db.query<{ confirmar_venta_point: string }>(
  'SELECT confirmar_venta_point($1,$2)', [id, kiosco])
const leer = async (sql: string) => (await db.query(sql)).rows

beforeAll(async () => {
  db = new PGlite()
  // Esquema mínimo con las FK, precisiones y columnas usadas por las migraciones reales.
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'service_role' $$;
    CREATE FUNCTION auth_es_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION auth_es_dueno_o_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION auth_user_kiosco_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${kid}'::uuid $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY);
    CREATE TABLE usuarios(id uuid PRIMARY KEY,kiosco_id uuid REFERENCES kioscos);
    CREATE TABLE sesiones_caja(id uuid PRIMARY KEY,kiosco_id uuid REFERENCES kioscos,usuario_id uuid REFERENCES usuarios,estado text);
    CREATE TABLE productos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid NOT NULL REFERENCES kioscos,
      descripcion text NOT NULL,precio_venta numeric(12,2) NOT NULL DEFAULT 0,precio_costo numeric(12,2) NOT NULL DEFAULT 0,
      stock_actual numeric(12,3) NOT NULL DEFAULT 0,activo boolean NOT NULL DEFAULT true,es_combo boolean DEFAULT false,
      fecha_actualizacion timestamptz DEFAULT now());
    CREATE TABLE lotes_producto(id uuid PRIMARY KEY,producto_id uuid REFERENCES productos,kiosco_id uuid REFERENCES kioscos,
      cantidad_actual numeric(12,3) NOT NULL,activo boolean,fecha_vencimiento date,fecha_ingreso timestamptz);
    CREATE TABLE clientes(id uuid PRIMARY KEY,kiosco_id uuid REFERENCES kioscos,saldo_deudor numeric(12,2),limite_credito numeric(12,2),activo boolean);
    CREATE TABLE ventas(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid NOT NULL REFERENCES kioscos,
      usuario_id uuid REFERENCES usuarios,sesion_caja_id uuid REFERENCES sesiones_caja,fecha_hora timestamptz NOT NULL DEFAULT now(),
      total numeric(12,2) NOT NULL,estado text NOT NULL CHECK(estado IN ('COMPLETADA','ANULADA')),notas text);
    CREATE TABLE detalles_venta(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),venta_id uuid NOT NULL REFERENCES ventas,
      producto_id uuid NOT NULL REFERENCES productos,cantidad numeric(12,3) NOT NULL,precio_unitario numeric(12,2) NOT NULL,
      subtotal numeric(12,2) NOT NULL,sin_envase boolean,precio_envase_unitario numeric(12,2),es_devolucion_envase boolean);
    CREATE TABLE pagos_venta(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),venta_id uuid NOT NULL REFERENCES ventas,
      medio_pago text NOT NULL CHECK(medio_pago IN ('EFECTIVO','MERCADOPAGO','TRANSFERENCIA','TARJETA','CUENTA_CORRIENTE')),
      monto numeric(12,2) NOT NULL,referencia text);
    CREATE TABLE movimientos_stock(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid REFERENCES kioscos,
      producto_id uuid REFERENCES productos,tipo text NOT NULL,cantidad numeric(12,3) NOT NULL,motivo text NOT NULL,notas text,
      usuario_id uuid REFERENCES usuarios,fecha timestamptz DEFAULT now(),costo_unitario_referencia numeric(12,2),
      lote_producto_id uuid REFERENCES lotes_producto);
    CREATE TABLE movimientos_cuenta_corriente(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid REFERENCES clientes,
      kiosco_id uuid REFERENCES kioscos,venta_id uuid REFERENCES ventas,tipo text NOT NULL,monto numeric(12,2) NOT NULL,
      saldo_resultante numeric(12,2) NOT NULL,usuario_id uuid REFERENCES usuarios,notas text,fecha_hora timestamptz DEFAULT now());
    INSERT INTO kioscos VALUES('${kid}'); INSERT INTO usuarios VALUES('${user}','${kid}');
    INSERT INTO sesiones_caja VALUES('${caja}','${kid}','${user}','ABIERTA');
    INSERT INTO productos(id,kiosco_id,descripcion,precio_venta,precio_costo,stock_actual)
      VALUES('${product}','${kid}','Pesable',100,40,10);
    INSERT INTO clientes VALUES('${client}','${kid}',0,20,true);`)
  for (const file of ['supabase_fase_seguridad_costos_privados.sql','supabase_fase_costos_movimientos_privados.sql',
    'supabase_fase_point_intentos.sql','supabase_fase_point_notificaciones.sql','supabase_fase_point_procesamiento.sql',
    'supabase_fase_point_caja.sql','supabase_fase_point_cierre_caja.sql',
    'supabase_fase_point_reserva_stock.sql','supabase_fase_point_reserva_lotes.sql','supabase_fase_point_reserva_credito.sql',
    'supabase_fase_point_confirmar_venta.sql']) {
    await db.exec(readFileSync(file, 'utf8'))
  }
  await db.exec(readFileSync('supabase_fase_point_confirmar_venta.sql', 'utf8'))
}, 30000)
beforeEach(async () => {
  await db.exec(`DELETE FROM point_reservas_credito; DELETE FROM point_reservas_lotes; DELETE FROM point_reservas_stock;
    DELETE FROM point_notificaciones; DELETE FROM point_intentos; DELETE FROM movimientos_cuenta_corriente; DELETE FROM movimientos_stock;
    DELETE FROM pagos_venta; DELETE FROM detalles_venta; DELETE FROM ventas; DELETE FROM lotes_producto;
    DELETE FROM productos WHERE id<>'${product}'; UPDATE productos SET stock_actual=10,activo=true;
    UPDATE clientes SET saldo_deudor=0,limite_credito=20,activo=true; UPDATE sesiones_caja SET estado='ABIERTA';
    INSERT INTO lotes_producto VALUES('${lote1}','${product}','${kid}',2,true,'2026-10-20','2026-10-01'),
      ('${lote2}','${product}','${kid}',3,true,'2026-11-20','2026-10-01');`)
})
afterAll(async () => db?.close())

it('confirma una sola venta, conserva pagos, FEFO y costo privado y permite cerrar caja', async () => {
  await preparar(); await pagar()
  expect((await confirmar()).rows[0].confirmar_venta_point).toBe(attempt)
  expect((await confirmar()).rows[0].confirmar_venta_point).toBe(attempt)
  expect(await leer('SELECT total,estado FROM ventas')).toEqual([{ total: '299.00', estado: 'COMPLETADA' }])
  expect(await leer('SELECT sum(subtotal) AS total FROM detalles_venta')).toEqual([{ total: '299.00' }])
  expect(await leer('SELECT sum(monto) AS total FROM pagos_venta')).toEqual([{ total: '299.00' }])
  expect(await leer('SELECT medio_pago,monto,referencia FROM pagos_venta ORDER BY medio_pago')).toEqual([
    { medio_pago: 'CUENTA_CORRIENTE', monto: '15.00', referencia: null },
    { medio_pago: 'MERCADOPAGO', monto: '284.00', referencia: 'PAY123' },
  ])
  expect(await leer(`SELECT stock_actual FROM productos WHERE id='${product}'`)).toEqual([{ stock_actual: '7.500' }])
  expect(await leer('SELECT cantidad_actual,activo FROM lotes_producto ORDER BY id')).toEqual([
    { cantidad_actual: '0.000', activo: false }, { cantidad_actual: '2.500', activo: true },
  ])
  expect(await leer('SELECT cantidad,usuario_id,costo_unitario_referencia,lote_producto_id FROM movimientos_stock ORDER BY lote_producto_id')).toEqual([
    { cantidad: '2.000', usuario_id: user, costo_unitario_referencia: null, lote_producto_id: lote1 },
    { cantidad: '0.500', usuario_id: user, costo_unitario_referencia: null, lote_producto_id: lote2 },
  ])
  expect(await leer('SELECT precio_costo FROM movimiento_stock_costos')).toEqual([{ precio_costo: '40.00' },{ precio_costo: '40.00' }])
  expect(await leer('SELECT monto,saldo_resultante FROM movimientos_cuenta_corriente')).toEqual([
    { monto: '15.00', saldo_resultante: '15.00' },
  ])
  expect(await leer('SELECT saldo_deudor FROM clientes')).toEqual([{ saldo_deudor: '15.00' }])
  await db.exec("UPDATE sesiones_caja SET estado='CERRADA'")
  expect((await confirmar()).rows[0].confirmar_venta_point).toBe(attempt)
})

it('no libera las retenciones de otro intento al consumir su stock y crédito', async () => {
  await preparar()
  await preparar(second, 400, [{ tipo: 'PRODUCTO', id: product, productoId: product, cantidad: 1.5, sinEnvase: false }], 0)
  await pagar(); await confirmar()
  await expect(db.exec('UPDATE clientes SET saldo_deudor=17')).rejects.toThrow('POINT_CREDITO_RESERVADO')
  await expect(db.exec(`UPDATE productos SET stock_actual=1 WHERE id='${product}'`)).rejects.toThrow('POINT_STOCK_RESERVADO')
  expect(await leer(`SELECT estado FROM point_intentos WHERE id='${second}'`)).toEqual([{ estado: 'PREPARADO' }])
})

it('revierte todos los efectos si falla el kardex y permite reintentar el mismo pago', async () => {
  await preparar(); await pagar()
  await db.exec("ALTER TABLE movimientos_stock ADD CONSTRAINT fallo_controlado CHECK(motivo<>'VENTA')")
  try {
    await expect(confirmar()).rejects.toThrow('fallo_controlado')
    for (const tabla of ['ventas','detalles_venta','pagos_venta','movimientos_stock','movimientos_cuenta_corriente']) {
      expect(await leer(`SELECT * FROM ${tabla}`)).toHaveLength(0)
    }
    expect(await leer(`SELECT id FROM productos WHERE id<>'${product}'`)).toHaveLength(0)
    expect(await leer('SELECT estado,venta_id FROM point_intentos')).toEqual([{ estado: 'PAGO_CONFIRMADO', venta_id: null }])
    expect(await leer(`SELECT stock_actual FROM productos WHERE id='${product}'`)).toEqual([{ stock_actual: '10.000' }])
    expect(await leer('SELECT saldo_deudor FROM clientes')).toEqual([{ saldo_deudor: '0.00' }])
  } finally { await db.exec('ALTER TABLE movimientos_stock DROP CONSTRAINT fallo_controlado') }
  await confirmar()
  expect(await leer('SELECT * FROM ventas')).toHaveLength(1)
})

it('rechaza un intento pendiente, comercio ajeno y reserva alterada', async () => {
  await preparar()
  await expect(confirmar()).rejects.toThrow('conciliación')
  await pagar()
  await expect(confirmar(attempt, '10000000-0000-0000-0000-000000000002')).rejects.toThrow('no disponible')
  await db.exec('DELETE FROM point_reservas_stock')
  await expect(confirmar()).rejects.toThrow('Reservas físicas inconsistentes')
  expect(await leer('SELECT * FROM ventas')).toHaveLength(0)
})

it('no sobrescribe una venta o un concepto virtual que ya existe', async () => {
  await preparar(); await pagar()
  await db.query('INSERT INTO productos(id,kiosco_id,descripcion) VALUES($1,$2,$3)', [service,kid,'Existente'])
  await expect(confirmar()).rejects.toThrow('duplicate key')
  await db.query('DELETE FROM productos WHERE id=$1', [service])
  await db.query("INSERT INTO ventas(id,kiosco_id,total,estado) VALUES($1,$2,10,'COMPLETADA')", [attempt,kid])
  await expect(confirmar()).rejects.toThrow('duplicate key')
  expect(await leer('SELECT total FROM ventas')).toEqual([{ total: '10.00' }])
  expect(await leer('SELECT * FROM detalles_venta')).toHaveLength(0)
})

it('niega ejecución a navegadores y no agrega deuda si no hay cuenta corriente', async () => {
  await preparar(attempt, 0); await pagar()
  await db.exec('SET ROLE authenticated')
  try { await expect(confirmar()).rejects.toThrow('permission denied') }
  finally { await db.exec('RESET ROLE') }
  await confirmar()
  expect(await leer('SELECT * FROM movimientos_cuenta_corriente')).toHaveLength(0)
  expect(await leer('SELECT saldo_deudor FROM clientes')).toEqual([{ saldo_deudor: '0.00' }])
})

it('revierte stock, lotes, costos y saldo si falla el último movimiento de deuda', async () => {
  await preparar(); await pagar()
  await db.exec("ALTER TABLE movimientos_cuenta_corriente ADD CONSTRAINT fallo_deuda CHECK(tipo<>'CARGO_VENTA')")
  try {
    await expect(confirmar()).rejects.toThrow('fallo_deuda')
    expect(await leer('SELECT * FROM ventas')).toHaveLength(0)
    expect(await leer('SELECT * FROM movimientos_stock')).toHaveLength(0)
    expect(await leer('SELECT * FROM movimiento_stock_costos')).toHaveLength(0)
    expect(await leer(`SELECT stock_actual FROM productos WHERE id='${product}'`)).toEqual([{ stock_actual: '10.000' }])
    expect(await leer('SELECT cantidad_actual FROM lotes_producto ORDER BY id')).toEqual([
      { cantidad_actual: '2.000' }, { cantidad_actual: '3.000' },
    ])
    expect(await leer('SELECT saldo_deudor FROM clientes')).toEqual([{ saldo_deudor: '0.00' }])
    expect(await leer('SELECT estado FROM point_intentos')).toEqual([{ estado: 'PAGO_CONFIRMADO' }])
  } finally { await db.exec('ALTER TABLE movimientos_cuenta_corriente DROP CONSTRAINT fallo_deuda') }
})

it('consume componentes físicos congelados de un combo y mantiene el stock virtual', async () => {
  const combo = '50000000-0000-0000-0000-000000000002'
  await db.query(`INSERT INTO productos(id,kiosco_id,descripcion,precio_venta,stock_actual,es_combo)
    VALUES($1,$2,'Combo',200,99,true)`, [combo,kid])
  await preparar(attempt, 0, [{ tipo: 'PRODUCTO', id: combo, productoId: combo, cantidad: 2, sinEnvase: false }], 0, {
    productos: [crearProducto({ id: product,kiosco_id: kid,precio_venta: 100,stock_actual: 10 }),
      crearProducto({ id: combo,kiosco_id: kid,precio_venta: 200,stock_actual: 99,es_combo: true })],
    componentes: [{ id: service,kiosco_id: kid,combo_producto_id: combo,componente_producto_id: product,cantidad: 1.5 }],
  })
  await pagar(); await confirmar()
  expect(await leer('SELECT id,stock_actual FROM productos ORDER BY id')).toEqual([
    { id: product,stock_actual: '7.000' }, { id: combo,stock_actual: '99.000' },
  ])
  expect(await leer('SELECT producto_id,cantidad FROM movimientos_stock ORDER BY lote_producto_id')).toEqual([
    { producto_id: product,cantidad: '2.000' }, { producto_id: product,cantidad: '1.000' },
  ])
})

it('conserva el vínculo y no recrea una venta posteriormente anulada', async () => {
  await preparar(); await pagar(); await confirmar()
  await expect(db.exec('UPDATE point_intentos SET venta_id=NULL')).rejects.toThrow('cambiar la venta')
  await db.exec("UPDATE ventas SET estado='ANULADA'")
  expect((await confirmar()).rows[0].confirmar_venta_point).toBe(attempt)
  expect(await leer('SELECT estado FROM ventas')).toEqual([{ estado: 'ANULADA' }])
})

it('registra por separado la cantidad física que no estaba asignada a un lote', async () => {
  await db.exec('DELETE FROM lotes_producto')
  await preparar(attempt, 0); await pagar(); await confirmar()
  expect(await leer('SELECT cantidad,lote_producto_id FROM movimientos_stock')).toEqual([
    { cantidad: '2.500', lote_producto_id: null },
  ])
})

it('conserva el pago verificado si falla el cierre y permite repetir una recepción ya procesada', async () => {
  await preparar()
  await db.exec("UPDATE point_intentos SET order_id='ORD123',estado='PENDIENTE'")
  const notificacion = (await db.query<{ id: string }>(
    "SELECT registrar_notificacion_point('123','ORD123','req-1','123') AS id")).rows[0].id
  const aplicar = () => db.query<{ estado: string }>(
    "SELECT aplicar_resultado_point($1,$2,$3,'123','ORD123','PAGO_CONFIRMADO','PAY123') AS estado",
    [notificacion,attempt,kid])
  expect((await aplicar()).rows[0].estado).toBe('PAGO_CONFIRMADO')
  await db.exec("ALTER TABLE movimientos_stock ADD CONSTRAINT fallo_controlado CHECK(motivo<>'VENTA')")
  try { await expect(confirmar()).rejects.toThrow('fallo_controlado') }
  finally { await db.exec('ALTER TABLE movimientos_stock DROP CONSTRAINT fallo_controlado') }
  expect(await leer('SELECT estado,payment_id FROM point_intentos')).toEqual([
    { estado: 'PAGO_CONFIRMADO',payment_id: 'PAY123' },
  ])
  expect((await aplicar()).rows[0].estado).toBe('PAGO_CONFIRMADO')
  await confirmar()
  expect((await aplicar()).rows[0].estado).toBe('VENTA_CONFIRMADA')
  await confirmar()
  expect(await leer('SELECT * FROM ventas')).toHaveLength(1)
})
