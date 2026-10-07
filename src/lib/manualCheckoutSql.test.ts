// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'

const kid = '10000000-0000-0000-0000-000000000001'
const otroKid = '10000000-0000-0000-0000-000000000002'
const actor = '20000000-0000-0000-0000-000000000001'
const cajero = '20000000-0000-0000-0000-000000000002'
const caja = '30000000-0000-0000-0000-000000000001'
const venta = '40000000-0000-0000-0000-000000000001'
const producto = '50000000-0000-0000-0000-000000000001'
const combo = '50000000-0000-0000-0000-000000000002'
const libre = '50000000-0000-0000-0000-000000000003'
const cliente = '60000000-0000-0000-0000-000000000001'
const lote1 = '70000000-0000-0000-0000-000000000001'
const lote2 = '70000000-0000-0000-0000-000000000002'
const detalle = '80000000-0000-0000-0000-000000000001'
const pago = '90000000-0000-0000-0000-000000000001'
let db: PGlite
function solicitud() {
  return { version: 1, id: venta, kiosco_id: kid, usuario_id: actor, sesion_caja_id: caja,
    fecha_hora: '2026-10-06T12:00:00Z', total: 250, notas: 'Venta de ensayo', cliente_id: cliente,
    detalles: [{ id: detalle, producto_id: producto, cantidad: 2.5, precio_unitario: 100, subtotal: 250,
      sin_envase: false, precio_envase_unitario: 0, es_devolucion_envase: false,
      articulo_libre: null as { descripcion: string; precio_venta: number } | null,
      componentes: [] as Array<{ producto_id: string; cantidad: number }> }],
    pagos: [{ id: pago, medio_pago: 'CUENTA_CORRIENTE', monto: 250, referencia: null as string | null }] }
}
async function confirmar(datos: unknown = solicitud(), authId = actor) {
  return db.query<{ confirmar_venta_manual: { venta_id: string; total: number; stock: Array<{ producto_id: string; stock_actual: number }> } }>(
    'SELECT public.confirmar_venta_manual($1::uuid,$2::jsonb)', [authId, JSON.stringify(datos)])
}
async function leer(sql: string) { return (await db.query(sql)).rows }

beforeAll(async () => {
  db = new PGlite()
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
    CREATE FUNCTION auth_es_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION auth_es_dueno_o_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION auth_user_kiosco_id() RETURNS uuid LANGUAGE sql AS $$ SELECT '${kid}'::uuid $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY,estado_suscripcion text);
    CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid REFERENCES kioscos,activo boolean,rol text);
    CREATE TABLE sesiones_caja(id uuid PRIMARY KEY,kiosco_id uuid REFERENCES kioscos,usuario_id uuid REFERENCES usuarios,
      estado text,fecha_apertura timestamptz,fecha_cierre timestamptz);
    CREATE TABLE productos(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid NOT NULL REFERENCES kioscos,
      descripcion text NOT NULL,precio_venta numeric(12,2) NOT NULL DEFAULT 0,precio_costo numeric(12,2) NOT NULL DEFAULT 0,
      stock_actual numeric(12,3) NOT NULL DEFAULT 0,activo boolean DEFAULT true,es_combo boolean DEFAULT false,
      es_pesable boolean DEFAULT false,requiere_vencimiento boolean DEFAULT false,fecha_actualizacion timestamptz DEFAULT now());
    CREATE TABLE combo_items(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid REFERENCES kioscos,
      combo_producto_id uuid REFERENCES productos,componente_producto_id uuid REFERENCES productos,cantidad numeric);
    CREATE TABLE lotes_producto(id uuid PRIMARY KEY,producto_id uuid REFERENCES productos,kiosco_id uuid REFERENCES kioscos,
      cantidad_actual numeric(12,3),activo boolean,fecha_vencimiento date,fecha_ingreso timestamptz);
    CREATE TABLE clientes(id uuid PRIMARY KEY,kiosco_id uuid REFERENCES kioscos,saldo_deudor numeric(12,2),
      limite_credito numeric(12,2),activo boolean);
    CREATE TABLE ventas(id uuid PRIMARY KEY,kiosco_id uuid REFERENCES kioscos,usuario_id uuid REFERENCES usuarios,
      sesion_caja_id uuid REFERENCES sesiones_caja,fecha_hora timestamptz,total numeric(12,2),estado text,notas text,sincronizado boolean);
    CREATE TABLE detalles_venta(id uuid PRIMARY KEY,venta_id uuid REFERENCES ventas,producto_id uuid REFERENCES productos,
      cantidad numeric(12,3),precio_unitario numeric(12,2),subtotal numeric(12,2),sin_envase boolean,
      precio_envase_unitario numeric(12,2),es_devolucion_envase boolean);
    CREATE TABLE pagos_venta(id uuid PRIMARY KEY,venta_id uuid REFERENCES ventas,medio_pago text,monto numeric(12,2),referencia text);
    CREATE TABLE movimientos_stock(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid REFERENCES kioscos,
      producto_id uuid REFERENCES productos,tipo text,cantidad numeric(12,3),motivo text,notas text,
      usuario_id uuid REFERENCES usuarios,fecha timestamptz,costo_unitario_referencia numeric(12,2),lote_producto_id uuid REFERENCES lotes_producto);
    CREATE TABLE movimientos_cuenta_corriente(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),cliente_id uuid REFERENCES clientes,
      kiosco_id uuid REFERENCES kioscos,venta_id uuid REFERENCES ventas,tipo text,monto numeric(12,2),saldo_resultante numeric(12,2),
      usuario_id uuid REFERENCES usuarios,notas text,fecha_hora timestamptz);
    INSERT INTO kioscos VALUES('${kid}','ACTIVO'),('${otroKid}','ACTIVO');
    INSERT INTO usuarios VALUES('${actor}','${actor}','${kid}',true,'DUEÑO'),('${cajero}','${cajero}','${kid}',true,'CAJERO');
    INSERT INTO sesiones_caja VALUES('${caja}','${kid}','${actor}','ABIERTA','2026-10-06T10:00:00Z',null);
    INSERT INTO productos(id,kiosco_id,descripcion,precio_venta,precio_costo,stock_actual,es_pesable)
      VALUES('${producto}','${kid}','Granel',100,40,10,true);
    INSERT INTO productos(id,kiosco_id,descripcion,es_combo) VALUES('${combo}','${kid}','Pack',true);
    INSERT INTO combo_items(kiosco_id,combo_producto_id,componente_producto_id,cantidad) VALUES('${kid}','${combo}','${producto}',2);
    INSERT INTO clientes VALUES('${cliente}','${kid}',0,1000,true);`)
  for (const archivo of ['supabase_fase_seguridad_costos_privados.sql', 'supabase_fase_costos_movimientos_privados.sql']) {
    await db.exec(readFileSync(archivo, 'utf8'))
  }
  await db.exec(readFileSync('supabase_fase_checkout_manual.sql', 'utf8'))
  await db.exec(readFileSync('supabase_fase_checkout_manual.sql', 'utf8'))
  await db.exec(readFileSync('supabase_fase_checkout_manual_backend.sql', 'utf8'))
  await db.exec(readFileSync('supabase_fase_checkout_manual_backend.sql', 'utf8'))
  await db.exec(readFileSync('supabase_fase_checkout_manual_cancelacion.sql', 'utf8'))
  await db.exec(readFileSync('supabase_fase_checkout_manual_cancelacion.sql', 'utf8'))
  await db.exec(readFileSync('supabase_fase_checkout_manual_cierre_caja.sql', 'utf8'))
  await db.exec(readFileSync('supabase_fase_checkout_manual_cierre_caja.sql', 'utf8'))
}, 30000)
beforeEach(async () => {
  await db.exec(`RESET ROLE; SET request.jwt.claim.role='service_role'; SET request.jwt.claim.sub='${actor}';
    DROP TRIGGER IF EXISTS fallo_ensayo ON movimientos_stock;
    DROP TRIGGER IF EXISTS fallo_ensayo ON movimientos_cuenta_corriente;
    DROP TABLE IF EXISTS point_reservas_credito; DROP TABLE IF EXISTS point_reservas_lotes;
    DROP TABLE IF EXISTS point_reservas_stock; DROP TABLE IF EXISTS point_intentos;
    DELETE FROM checkout_manual_cancelaciones; DELETE FROM checkout_manual_entradas; DELETE FROM checkout_manuales; DELETE FROM movimientos_cuenta_corriente; DELETE FROM movimientos_stock;
    DELETE FROM pagos_venta; DELETE FROM detalles_venta; DELETE FROM ventas; DELETE FROM lotes_producto;
    DELETE FROM productos WHERE id='${libre}'; UPDATE productos SET kiosco_id='${kid}',stock_actual=10,activo=true,requiere_vencimiento=false,es_pesable=true WHERE id='${producto}';
    UPDATE usuarios SET activo=true,rol='DUEÑO' WHERE id='${actor}'; UPDATE kioscos SET estado_suscripcion='ACTIVO';
    UPDATE clientes SET saldo_deudor=0,limite_credito=1000,activo=true;
    UPDATE sesiones_caja SET estado='ABIERTA',fecha_cierre=null,usuario_id='${actor}';
    UPDATE combo_items SET cantidad=2;
    INSERT INTO lotes_producto VALUES('${lote1}','${producto}','${kid}',2,true,'2026-10-20','2026-10-01'),
      ('${lote2}','${producto}','${kid}',3,true,'2026-11-20','2026-10-01');`)
})
afterAll(async () => { await db?.close() })

it('confirma todo una sola vez y devuelve stock sin costos privados', async () => {
  const primera = await confirmar()
  expect(primera.rows[0].confirmar_venta_manual).toMatchObject({ venta_id: venta, total: 250,
    stock: [{ producto_id: producto, stock_actual: 7.5 }] })
  await confirmar()
  expect(await leer('SELECT count(*)::int AS cantidad FROM ventas')).toEqual([{ cantidad: 1 }])
  expect(await leer('SELECT sum(subtotal) AS total FROM detalles_venta')).toEqual([{ total: '250.00' }])
  expect(await leer('SELECT sum(monto) AS total FROM pagos_venta')).toEqual([{ total: '250.00' }])
  expect(await leer('SELECT saldo_deudor FROM clientes')).toEqual([{ saldo_deudor: '250.00' }])
  expect(await leer('SELECT cantidad_actual FROM lotes_producto ORDER BY id')).toEqual([{ cantidad_actual: '0.000' }, { cantidad_actual: '2.500' }])
  expect(await leer('SELECT precio_costo FROM movimiento_stock_costos')).toEqual([{ precio_costo: '40.00' }, { precio_costo: '40.00' }])
  expect(JSON.stringify(primera.rows)).not.toContain('precio_costo')
  expect(await leer('SELECT fecha_hora FROM ventas')).toEqual([{ fecha_hora: new Date('2026-10-06T12:00:00Z') }])
})
it('rechaza otra solicitud con la misma identidad y una venta luego anulada', async () => {
  await confirmar()
  await expect(confirmar({ ...solicitud(), notas: 'Otra' })).rejects.toThrow(/identificador/i)
  await db.exec(`UPDATE ventas SET estado='ANULADA' WHERE id='${venta}'`)
  await expect(confirmar()).rejects.toThrow(/anulada/i)
})
it('recupera exactamente el cierre anterior aunque la caja ya esté cerrada', async () => {
  await confirmar()
  await db.exec("UPDATE sesiones_caja SET estado='CERRADA'")
  expect((await confirmar()).rows[0].confirmar_venta_manual.venta_id).toBe(venta)
})
it('un reintento no declara completo un cierre cuyos pagos fueron eliminados', async () => {
  await confirmar()
  await db.exec('DELETE FROM pagos_venta')
  await expect(confirmar()).rejects.toThrow(/conciliación/i)
  expect(await leer(`SELECT stock_actual FROM productos WHERE id='${producto}'`)).toEqual([{ stock_actual: '7.500' }])
})
it('un combo consume componentes físicos con receta congelada y nunca su stock virtual', async () => {
  const datos = solicitud()
  datos.detalles[0] = { ...datos.detalles[0], producto_id: combo, cantidad: 1,
    componentes: [{ producto_id: producto, cantidad: 2 }] }
  await confirmar(datos)
  expect(await leer(`SELECT stock_actual FROM productos WHERE id='${producto}'`)).toEqual([{ stock_actual: '8.000' }])
  expect(await leer(`SELECT stock_actual FROM productos WHERE id='${combo}'`)).toEqual([{ stock_actual: '0.000' }])
})
it('receta alterada queda en conflicto y no cambia stock', async () => {
  const datos = solicitud()
  datos.detalles[0] = { ...datos.detalles[0], producto_id: combo, cantidad: 1,
    componentes: [{ producto_id: producto, cantidad: 3 }] }
  await expect(confirmar(datos)).rejects.toThrow(/receta/i)
  expect(await leer('SELECT count(*)::int AS cantidad FROM ventas')).toEqual([{ cantidad: 0 }])
})
it.each(['movimientos_stock', 'movimientos_cuenta_corriente'])('revierte todos los efectos si falla %s', async (tabla) => {
  await db.exec(`CREATE OR REPLACE FUNCTION fallo_ensayo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FALLO_CONTROLADO'; END $$;
    CREATE TRIGGER fallo_ensayo BEFORE INSERT ON ${tabla} FOR EACH ROW EXECUTE FUNCTION fallo_ensayo();`)
  await expect(confirmar()).rejects.toThrow('FALLO_CONTROLADO')
  expect(await leer('SELECT count(*)::int AS cantidad FROM ventas')).toEqual([{ cantidad: 0 }])
  expect(await leer(`SELECT stock_actual FROM productos WHERE id='${producto}'`)).toEqual([{ stock_actual: '10.000' }])
  expect(await leer('SELECT saldo_deudor FROM clientes')).toEqual([{ saldo_deudor: '0.00' }])
  expect(await leer('SELECT cantidad_actual FROM lotes_producto ORDER BY id')).toEqual([{ cantidad_actual: '2.000' }, { cantidad_actual: '3.000' }])
  expect(await leer('SELECT count(*)::int AS cantidad FROM checkout_manuales')).toEqual([{ cantidad: 0 }])
})
it('acepta conceptos libres sin sobrescribir productos ni descontar inventario', async () => {
  const datos = solicitud()
  datos.detalles[0] = { ...datos.detalles[0], producto_id: libre, cantidad: 1,
    articulo_libre: { descripcion: 'Fotocopia', precio_venta: 250 } }
  await confirmar(datos)
  expect(await leer(`SELECT activo,stock_actual FROM productos WHERE id='${libre}'`)).toEqual([{ activo: false, stock_actual: '0.000' }])
  expect(await leer('SELECT count(*)::int AS cantidad FROM movimientos_stock')).toEqual([{ cantidad: 0 }])
})
it('rechaza conceptos virtuales que reutilizan un producto real', async () => {
  const datos = solicitud()
  datos.detalles[0].articulo_libre = { descripcion: 'Falso', precio_venta: 250 }
  await expect(confirmar(datos)).rejects.toThrow(/virtual/i)
})
it('rechaza stock insuficiente, crédito excedido y cierre original no disponible', async () => {
  await db.exec(`UPDATE productos SET stock_actual=1 WHERE id='${producto}'`)
  await expect(confirmar()).rejects.toThrow(/stock/i)
  await db.exec(`UPDATE productos SET stock_actual=10 WHERE id='${producto}'; UPDATE clientes SET limite_credito=100;`)
  await expect(confirmar()).rejects.toThrow(/crédito/i)
  await db.exec("UPDATE clientes SET limite_credito=1000; UPDATE sesiones_caja SET estado='CERRADA'")
  await expect(confirmar()).rejects.toThrow(/caja/i)
})
it('ni cajero, dueño ni anónimo pueden invocar la RPC privada directamente', async () => {
  for (const rol of ['authenticated', 'anon']) {
    await db.exec(`SET request.jwt.claim.role='${rol}'; SET ROLE ${rol}`)
    await expect(confirmar()).rejects.toThrow(/permission denied/i)
    await expect(leer('SELECT * FROM checkout_manuales')).rejects.toThrow(/permission denied/i)
    await db.exec('RESET ROLE')
  }
  await db.exec("SET request.jwt.claim.role='authenticated'")
  await expect(confirmar()).rejects.toThrow(/servidor/i)
})
it('revalida perfil, comercio, caja, fecha y sumas antes de escribir', async () => {
  await expect(confirmar({ ...solicitud(), kiosco_id: otroKid })).rejects.toThrow()
  await expect(confirmar({ ...solicitud(), total: 251 })).rejects.toThrow()
  await expect(confirmar({ ...solicitud(), fecha_hora: '2026-10-06T09:00:00Z' })).rejects.toThrow()
  await expect(confirmar({ ...solicitud(), costo: 1 })).rejects.toThrow()
  await expect(confirmar(solicitud(), cajero)).rejects.toThrow()
  await db.exec(`UPDATE usuarios SET activo=false WHERE id='${actor}'`)
  await expect(confirmar()).rejects.toThrow()
  expect(await leer('SELECT count(*)::int AS cantidad FROM ventas')).toEqual([{ cantidad: 0 }])
})

it('un perfil sin rol no puede confirmar ventas de otro operador', async () => {
  await db.exec(`UPDATE usuarios SET rol=null WHERE id='${actor}'; UPDATE sesiones_caja SET usuario_id='${cajero}';`)
  await expect(confirmar({ ...solicitud(), usuario_id: cajero }, actor)).rejects.toThrow(/autorizado/i)
})
it.each(['now', 'yesterday', '2026-10-06', '2026-10-06T12:00:00'])('rechaza fechas no absolutas %s', async (fecha_hora) => {
  await expect(confirmar({ ...solicitud(), fecha_hora })).rejects.toThrow(/fecha|texto/i)
})

it('service_role puede ejecutar la función privada y consultar su resultado bajo RLS', async () => {
  await db.exec('SET ROLE service_role')
  await confirmar()
  expect(await leer('SELECT count(*)::int AS cantidad FROM checkout_manuales')).toEqual([{ cantidad: 1 }])
  await expect(db.exec("UPDATE checkout_manuales SET resultado='{}'")).rejects.toThrow(/permission denied/i)
})

it('un cajero sólo confirma su caja y el dueño puede conciliar esa misma solicitud', async () => {
  await db.exec(`UPDATE sesiones_caja SET usuario_id='${cajero}'`)
  const datos = { ...solicitud(), usuario_id: cajero }
  await confirmar(datos, cajero)
  await confirmar(datos, actor)
  expect(await leer('SELECT usuario_id FROM ventas')).toEqual([{ usuario_id: cajero }])
  await db.exec(`UPDATE usuarios SET rol='VISOR' WHERE id='${actor}'`)
  await expect(confirmar(datos, actor)).rejects.toThrow(/autorizado/i)
})

it.each(['detalles_venta', 'pagos_venta'])('un fallo de inserción en %s revierte el alta virtual y la cabecera', async (tabla) => {
  await db.exec(`ALTER TABLE ${tabla} ADD CONSTRAINT fallo_temporal CHECK(false) NOT VALID`)
  try {
    const datos = solicitud()
    datos.detalles[0] = { ...datos.detalles[0], producto_id: libre, cantidad: 1,
      articulo_libre: { descripcion: 'Servicio', precio_venta: 250 } }
    await expect(confirmar(datos)).rejects.toThrow('fallo_temporal')
    expect(await leer(`SELECT count(*)::int AS cantidad FROM productos WHERE id='${libre}'`)).toEqual([{ cantidad: 0 }])
    expect(await leer('SELECT count(*)::int AS cantidad FROM ventas')).toEqual([{ cantidad: 0 }])
  } finally { await db.exec(`ALTER TABLE ${tabla} DROP CONSTRAINT fallo_temporal`) }
})

it.each([0, -1, 0.0001, 2.5555, 1000000])('rechaza cantidad inválida %s sin efectos parciales', async (cantidad) => {
  const datos = solicitud()
  datos.detalles[0].cantidad = cantidad
  await expect(confirmar(datos)).rejects.toThrow()
  expect(await leer('SELECT count(*)::int AS cantidad FROM checkout_manuales')).toEqual([{ cantidad: 0 }])
})

it('permite ventas con total cero y reintegros negativos sólo como conceptos virtuales', async () => {
  const datos = solicitud()
  datos.total = 0
  datos.pagos[0] = { ...datos.pagos[0], medio_pago: 'EFECTIVO', monto: 0 }
  datos.detalles.push({ ...datos.detalles[0], id: '80000000-0000-0000-0000-000000000002', producto_id: libre,
    cantidad: 1, precio_unitario: 0, subtotal: -250, es_devolucion_envase: true,
    articulo_libre: { descripcion: 'Devolución botella', precio_venta: -250 } })
  await confirmar(datos)
  expect(await leer('SELECT total FROM ventas')).toEqual([{ total: '0.00' }])
  expect(await leer(`SELECT stock_actual FROM productos WHERE id='${producto}'`)).toEqual([{ stock_actual: '7.500' }])
})

it('un producto por unidad y sus componentes no aceptan fracciones', async () => {
  await db.exec(`UPDATE productos SET es_pesable=false WHERE id='${producto}'`)
  await expect(confirmar()).rejects.toThrow(/cantidad/i)
  const datos = solicitud()
  datos.detalles[0] = { ...datos.detalles[0], producto_id: combo, cantidad: 1,
    componentes: [{ producto_id: producto, cantidad: 0.5 }] }
  await db.exec('UPDATE combo_items SET cantidad=0.5')
  await expect(confirmar(datos)).rejects.toThrow(/cantidad/i)
})

it('no transforma lotes vencidos o inactivos en existencias sin lote', async () => {
  await db.exec(`UPDATE productos SET stock_actual=5,requiere_vencimiento=true WHERE id='${producto}';
    UPDATE lotes_producto SET fecha_vencimiento='2026-10-01' WHERE id='${lote1}';
    UPDATE lotes_producto SET activo=false WHERE id='${lote2}';`)
  await expect(confirmar()).rejects.toThrow(/lotes/i)
  await db.exec(`UPDATE productos SET requiere_vencimiento=false WHERE id='${producto}'`)
  await expect(confirmar()).rejects.toThrow(/lotes/i)
})

it('valida lotes para la fecha original y conserva fecha en kardex y deuda', async () => {
  await db.exec("UPDATE lotes_producto SET fecha_vencimiento='2026-10-06'")
  await confirmar()
  expect(await leer('SELECT DISTINCT fecha FROM movimientos_stock')).toEqual([{ fecha: new Date('2026-10-06T12:00:00Z') }])
  expect(await leer('SELECT fecha_hora FROM movimientos_cuenta_corriente')).toEqual([{ fecha_hora: new Date('2026-10-06T12:00:00Z') }])
})

it('no permite que otro lote o producto del comercio vecino reciba el consumo', async () => {
  await db.exec(`UPDATE productos SET kiosco_id='${otroKid}' WHERE id='${producto}'`)
  await expect(confirmar()).rejects.toThrow(/producto/i)
  await db.exec(`UPDATE productos SET kiosco_id='${kid}' WHERE id='${producto}';
    UPDATE lotes_producto SET kiosco_id='${otroKid}' WHERE id='${lote1}';`)
  await confirmar()
  expect(await leer(`SELECT cantidad_actual FROM lotes_producto WHERE id='${lote1}'`)).toEqual([{ cantidad_actual: '2.000' }])
})

async function reservas() {
  await db.exec(`CREATE TABLE point_intentos(id uuid PRIMARY KEY,estado text);
    CREATE TABLE point_reservas_stock(intento_id uuid,producto_id uuid,cantidad numeric);
    CREATE TABLE point_reservas_lotes(intento_id uuid,lote_id uuid,cantidad numeric);
    CREATE TABLE point_reservas_credito(intento_id uuid,cliente_id uuid,monto_centavos bigint);
    INSERT INTO point_intentos VALUES('${venta}','PENDIENTE');`)
}
it('respeta stock y crédito retenidos por Point sin activarlo ni liberar sus reservas', async () => {
  await reservas()
  await db.exec(`INSERT INTO point_reservas_stock VALUES('${venta}','${producto}',8)`)
  await expect(confirmar()).rejects.toThrow(/stock/i)
  await db.exec(`UPDATE point_reservas_stock SET cantidad=1;
    INSERT INTO point_reservas_credito VALUES('${venta}','${cliente}',90000);`)
  await expect(confirmar()).rejects.toThrow(/crédito/i)
  await db.exec("UPDATE point_intentos SET estado='CANCELADO'")
  await confirmar()
  expect(await leer('SELECT cantidad FROM point_reservas_stock')).toEqual([{ cantidad: '1' }])
})
it('salta cantidades FEFO retenidas por Point y conserva el remanente de ese lote', async () => {
  await reservas()
  await db.exec(`INSERT INTO point_reservas_stock VALUES('${venta}','${producto}',1.5);
    INSERT INTO point_reservas_lotes VALUES('${venta}','${lote1}',1.5);`)
  await confirmar()
  expect(await leer('SELECT cantidad_actual FROM lotes_producto ORDER BY id')).toEqual([{ cantidad_actual: '1.500' }, { cantidad_actual: '1.000' }])
  expect(await leer('SELECT estado FROM point_intentos')).toEqual([{ estado: 'PENDIENTE' }])
})

function entradaBackend() {
  const s = solicitud()
  return { version: 1, checkoutId: s.id, kioscoId: s.kiosco_id, usuarioId: s.usuario_id, sesionCajaId: s.sesion_caja_id,
    fechaHora: s.fecha_hora, clienteId: s.cliente_id, notas: s.notas, tipoAjuste: 'NINGUNO', valorAjuste: 0,
    totalEsperado: s.total, subtotalesEsperados: [250], componentesEsperados: [],
    lineas: [{ tipo: 'PRODUCTO', id: detalle, productoId: producto, cantidad: 2.5, sinEnvase: false }],
    pagos: [{ id: pago, medio: 'CUENTA_CORRIENTE', montoCentavos: 25000, referencia: null }] }
}
async function prepararBackend(entrada: unknown = entradaBackend(), snapshot: unknown = solicitud(), authId = actor) {
  return db.query<{ preparar_checkout_manual: { entrada: unknown; snapshot: unknown } }>(
    'SELECT preparar_checkout_manual($1::uuid,$2::jsonb,$3::jsonb)', [authId, JSON.stringify(entrada), JSON.stringify(snapshot)])
}
it('la preparación durable conserva el primer snapshot y rechaza otra entrada', async () => {
  const primero = await prepararBackend()
  const cambiado = solicitud()
  cambiado.detalles[0].precio_unitario = 99
  expect((await prepararBackend(entradaBackend(), cambiado)).rows).toEqual(primero.rows)
  await expect(prepararBackend({ ...entradaBackend(), notas: 'Otra' }, { ...solicitud(), notas: 'Otra' })).rejects.toThrow(/identificador/i)
  expect(await leer('SELECT count(*)::int AS cantidad FROM ventas')).toEqual([{ cantidad: 0 }])
})
it('la entrada privada verifica perfil, identidad, caja y permisos de tablas', async () => {
  await expect(prepararBackend(entradaBackend(), { ...solicitud(), id: producto })).rejects.toThrow(/identidad/i)
  await db.exec("UPDATE sesiones_caja SET estado='CERRADA'")
  await expect(prepararBackend()).rejects.toThrow(/caja/i)
  await db.exec('SET ROLE authenticated')
  await expect(prepararBackend()).rejects.toThrow(/permission denied/i)
  await expect(leer('SELECT * FROM checkout_manual_entradas')).rejects.toThrow(/permission denied/i)
})

async function cancelarManual(entrada: unknown = entradaBackend(), authId = actor, resolucion = 'NO_COBRADO', referencia: string | null = null) {
  await db.exec(`SET request.jwt.claim.role='authenticated'; SET request.jwt.claim.sub='${authId}';`)
  return db.query<{ cancelar_checkout_manual: { estado: string; checkout_id: string; cancelado_en: string } }>(
    'SELECT public.cancelar_checkout_manual($1::jsonb,$2::text,$3::text,$4::text)',
    [JSON.stringify(entrada), 'Cancelación solicitada en ensayo', resolucion, referencia])
}

it('cancela un pendiente preparado con auditoría y reintento idempotente', async () => {
  await prepararBackend()
  const primero = await cancelarManual()
  const segundo = await cancelarManual()
  expect(primero.rows).toEqual(segundo.rows)
  expect(primero.rows[0].cancelar_checkout_manual.estado).toBe('CANCELADO')
  expect(await leer('SELECT autorizado_por FROM checkout_manual_cancelaciones')).toEqual([{ autorizado_por: actor }])
  expect(await leer(`SELECT stock_actual FROM productos WHERE id='${producto}'`)).toEqual([{ stock_actual: '10.000' }])
  expect(await leer('SELECT id FROM ventas')).toEqual([])
})
it('bloquea preparación y confirmación tardías de un ID cancelado incluso sin snapshot previo', async () => {
  await cancelarManual()
  await db.exec("SET request.jwt.claim.role='service_role'")
  await expect(prepararBackend()).rejects.toThrow(/cancelado/)
  await expect(confirmar()).rejects.toThrow(/cancelado/)
  expect(await leer('SELECT id FROM ventas')).toEqual([])
})
it('deniega cancelación al cajero y a otro comercio', async () => {
  await expect(cancelarManual(entradaBackend(), cajero)).rejects.toThrow(/Solo el dueño/)
  await expect(cancelarManual({ ...entradaBackend(), kioscoId: otroKid })).rejects.toThrow(/Comercio no autorizado/)
})
it('rechaza entrada modificada y reintegro sin referencia', async () => {
  await prepararBackend()
  await expect(cancelarManual({ ...entradaBackend(), notas: 'Otra entrada' })).rejects.toThrow(/otra entrada/)
  await expect(cancelarManual(entradaBackend(), actor, 'REINTEGRADO')).rejects.toThrow(/referencia/)
  expect(await leer('SELECT id FROM checkout_manual_cancelaciones')).toEqual([])
})
it('permite resolver caja cerrada pero nunca cancelar una venta registrada', async () => {
  await prepararBackend()
  await expect(db.exec("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=now()")).rejects.toThrow(/CHECKOUT_MANUAL_PENDIENTE/)
  await cancelarManual()
  await db.exec("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=now()")
  expect(await leer('SELECT id FROM checkout_manual_cancelaciones')).toHaveLength(1)
})
it('rechaza cancelar una confirmación y preserva sus efectos comerciales', async () => {
  await confirmar()
  await expect(cancelarManual()).rejects.toThrow(/revisar la venta en Reportes/)
  expect(await leer('SELECT id FROM checkout_manual_cancelaciones')).toEqual([])
  expect(await leer('SELECT id FROM ventas')).toHaveLength(1)
})
it('no permite sobrescribir la resolución auditada', async () => {
  await cancelarManual()
  await expect(cancelarManual(entradaBackend(), actor, 'REINTEGRADO', 'Devolución manual comprobante 123')).rejects.toThrow(/no puede modificarse/)
})
it('restringe el RPC al dueño activo y mantiene el registro privado sin escrituras directas', async () => {
  await db.exec("UPDATE usuarios SET activo=false WHERE id='" + actor + "'")
  await expect(cancelarManual()).rejects.toThrow(/Perfil no disponible/)
  await db.exec("UPDATE usuarios SET activo=true WHERE id='" + actor + "'; SET request.jwt.claim.role='service_role'")
  await expect(db.query('SELECT public.cancelar_checkout_manual($1::jsonb,$2,$3,NULL)', [JSON.stringify(entradaBackend()), 'Motivo de ensayo', 'NO_COBRADO'])).rejects.toThrow(/sesión del dueño/)
  await db.exec('SET ROLE authenticated')
  await expect(db.exec('SELECT * FROM public.checkout_manual_cancelaciones')).rejects.toThrow(/permission denied/)
  await expect(db.exec('DELETE FROM public.checkout_manual_cancelaciones')).rejects.toThrow(/permission denied/)
  await db.exec('RESET ROLE; SET ROLE service_role')
  await expect(db.exec('DELETE FROM public.checkout_manual_cancelaciones')).rejects.toThrow(/permission denied/)
  await db.exec('RESET ROLE')
})

it('el servidor bloquea fecha de cierre e identidad mientras existe una preparación pendiente', async () => {
 await prepararBackend()
 await expect(db.exec('UPDATE sesiones_caja SET fecha_cierre=now()')).rejects.toThrow(/CHECKOUT_MANUAL_PENDIENTE/)
 await expect(db.exec(`UPDATE sesiones_caja SET usuario_id='${cajero}'`)).rejects.toThrow(/CHECKOUT_MANUAL_PENDIENTE/)
 expect(await leer('SELECT estado FROM sesiones_caja')).toEqual([{ estado: 'ABIERTA' }])
})
it('permite cerrar luego de confirmación transaccional y rechaza nuevas preparaciones', async () => {
 await prepararBackend()
 await confirmar()
 await db.exec("UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=now()")
 await expect(prepararBackend()).rejects.toThrow(/Caja original no disponible/)
 expect(await leer('SELECT estado FROM sesiones_caja')).toEqual([{ estado: 'CERRADA' }])
})
