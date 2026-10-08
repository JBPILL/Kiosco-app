// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
const db = new PGlite()
const kid='10000000-0000-0000-0000-000000000001',uid='20000000-0000-0000-0000-000000000001'
const venta='40000000-0000-0000-0000-000000000001',producto='50000000-0000-0000-0000-000000000001'
const caja='30000000-0000-0000-0000-000000000001',otraCaja='30000000-0000-0000-0000-000000000002'
const cliente='60000000-0000-0000-0000-000000000001',lote='70000000-0000-0000-0000-000000000001'
const combo='50000000-0000-0000-0000-000000000002'
const snapshot={ total:250,cliente_id:cliente,pagos:[{ medio_pago:'EFECTIVO',monto:100 },{ medio_pago:'CUENTA_CORRIENTE',monto:150 }],
  detalles:[{ producto_id:combo,cantidad:2,es_devolucion_envase:false,articulo_libre:null,componentes:[{ producto_id:producto,cantidad:2 }] }] }
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT current_setting('test.uid')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT 'authenticated' $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY,estado_suscripcion text);
    CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid,rol text,activo boolean);
    CREATE FUNCTION auth_user_kiosco_id() RETURNS uuid LANGUAGE sql AS $$ SELECT kiosco_id FROM usuarios WHERE auth_user_id=auth.uid() $$;
    CREATE FUNCTION auth_es_dueno_o_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT rol='DUEÑO' FROM usuarios WHERE auth_user_id=auth.uid() $$;
    CREATE FUNCTION auth_es_superadmin() RETURNS boolean LANGUAGE sql AS $$ SELECT false $$;
    CREATE FUNCTION auth_user_rol() RETURNS text LANGUAGE sql AS $$ SELECT rol FROM usuarios WHERE auth_user_id=auth.uid() $$;
    CREATE TABLE sesiones_caja(id uuid PRIMARY KEY,kiosco_id uuid,estado text,fecha_cierre timestamptz);
    CREATE TABLE ventas(id uuid PRIMARY KEY,kiosco_id uuid REFERENCES kioscos,estado text,total numeric,sesion_caja_id uuid,afip_cae text);
    CREATE TABLE checkout_manuales(id uuid PRIMARY KEY,kiosco_id uuid,venta_id uuid,solicitud jsonb,resultado jsonb);
    CREATE TABLE productos(id uuid PRIMARY KEY,kiosco_id uuid,stock_actual numeric,fecha_actualizacion timestamptz,descripcion text DEFAULT 'Ensayo');
    CREATE TABLE combo_items(combo_producto_id uuid,componente_producto_id uuid,cantidad numeric);
    CREATE TABLE lotes_producto(id uuid PRIMARY KEY,producto_id uuid,kiosco_id uuid,cantidad_actual numeric,activo boolean);
    CREATE TABLE pagos_venta(venta_id uuid,medio_pago text,monto numeric);
    CREATE TABLE detalles_venta(venta_id uuid,cantidad numeric);
    CREATE TABLE devoluciones_venta(id uuid DEFAULT gen_random_uuid(),venta_id uuid,kiosco_id uuid);
    CREATE TABLE movimientos_stock(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid,producto_id uuid,tipo text,
      cantidad numeric,motivo text,notas text,usuario_id uuid,fecha timestamptz,lote_producto_id uuid);
    CREATE TABLE movimiento_stock_costos(movimiento_id uuid PRIMARY KEY REFERENCES movimientos_stock ON DELETE CASCADE,kiosco_id uuid,precio_costo numeric);
    CREATE FUNCTION costo_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO movimiento_stock_costos VALUES(NEW.id,NEW.kiosco_id,40); RETURN NEW; END $$;
    CREATE TRIGGER costo_test AFTER INSERT ON movimientos_stock FOR EACH ROW EXECUTE FUNCTION costo_test();
    CREATE TABLE clientes(id uuid PRIMARY KEY,kiosco_id uuid,saldo_deudor numeric);
    CREATE TABLE movimientos_cuenta_corriente(cliente_id uuid,kiosco_id uuid,venta_id uuid,tipo text,monto numeric,
      saldo_resultante numeric,usuario_id uuid,notas text,fecha_hora timestamptz);
    CREATE TABLE movimientos_caja(kiosco_id uuid,sesion_caja_id uuid,usuario_id uuid,tipo text,motivo text,monto numeric,descripcion text,fecha_hora timestamptz);
    INSERT INTO kioscos VALUES('${kid}','ACTIVO'); INSERT INTO usuarios VALUES('${uid}','${uid}','${kid}','DUEÑO',true);
    SELECT set_config('test.uid','${uid}',false);`)
  await db.exec(readFileSync('supabase_fase_auditoria_anulaciones.sql','utf8'))
  const sql=readFileSync('supabase_fase_anulacion_venta_atomica.sql','utf8')
  await db.exec(sql); await db.exec(sql)
})
beforeEach(async () => {
  await db.exec(`RESET ROLE; DROP TRIGGER IF EXISTS reposicion_legacy ON ventas;
    DROP TRIGGER IF EXISTS trg_devolver_stock_anulacion ON ventas;
    DROP TRIGGER IF EXISTS fallo ON movimientos_cuenta_corriente;
    DROP TRIGGER IF EXISTS omitir_auditoria ON auditoria_operaciones;
    DELETE FROM auditoria_operaciones; DELETE FROM anulaciones_venta_atomicas; DELETE FROM devoluciones_venta;
    DELETE FROM ventas; DELETE FROM detalles_venta; DELETE FROM checkout_manuales; DELETE FROM productos; DELETE FROM lotes_producto;
    DELETE FROM pagos_venta; DELETE FROM movimientos_stock; DELETE FROM movimientos_cuenta_corriente; DELETE FROM movimientos_caja; DELETE FROM clientes; DELETE FROM sesiones_caja;
    UPDATE usuarios SET activo=true,rol='DUEÑO',kiosco_id='${kid}'; UPDATE kioscos SET estado_suscripcion='ACTIVO';
    INSERT INTO sesiones_caja VALUES('${caja}','${kid}','ABIERTA',null),('${otraCaja}','${kid}','ABIERTA',null);
    INSERT INTO ventas(id,kiosco_id,estado,total,sesion_caja_id) VALUES('${venta}','${kid}','COMPLETADA',250,'${caja}');
    INSERT INTO productos(id,kiosco_id,stock_actual) VALUES('${producto}','${kid}',6),('${combo}','${kid}',0);
    DELETE FROM combo_items; INSERT INTO combo_items VALUES('${combo}','${producto}',99);
    INSERT INTO lotes_producto VALUES('${lote}','${producto}','${kid}',0,false);
    INSERT INTO pagos_venta VALUES('${venta}','EFECTIVO',100),('${venta}','CUENTA_CORRIENTE',150);
    INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,lote_producto_id) VALUES
      ('${kid}','${producto}','EGRESO',3,'VENTA','Checkout manual ${venta}','${lote}'),
      ('${kid}','${producto}','EGRESO',1,'VENTA','Checkout manual ${venta}',null);
    INSERT INTO clientes VALUES('${cliente}','${kid}',300);
    INSERT INTO movimientos_cuenta_corriente(cliente_id,kiosco_id,venta_id,tipo,monto) VALUES('${cliente}','${kid}','${venta}','CARGO_VENTA',150);`)
  await db.query('INSERT INTO checkout_manuales VALUES($1,$2,$1,$3::jsonb,$4::jsonb)',[venta,kid,JSON.stringify(snapshot),JSON.stringify({ venta_id:venta })])
})
afterAll(async () => db.close())
async function anular(sesion: string|null=null) {
  return db.query<{ result: { estado:string; stock:unknown[] } }>('SELECT anular_venta_atomica($1,$2,$3) result',[venta,'Error de carga comprobado',sesion])
}
async function estado() {
  return (await db.query(`SELECT (SELECT estado FROM ventas) estado,(SELECT stock_actual FROM productos WHERE id='${producto}') stock,
    (SELECT saldo_deudor FROM clientes) saldo,(SELECT cantidad_actual FROM lotes_producto) lote,
    (SELECT count(*)::int FROM anulaciones_venta_atomicas) anulaciones`)).rows[0]
}
it('recupera receta y lotes históricos, deuda y auditoría una sola vez', async () => {
  await db.exec('SET ROLE authenticated')
  const primera=await anular(); expect(primera.rows[0].result.estado).toBe('ANULADA')
  expect((await anular()).rows).toEqual(primera.rows)
  await db.exec('RESET ROLE')
  expect(await estado()).toEqual({ estado:'ANULADA',stock:'10',saldo:'150',lote:'3',anulaciones:1 })
  expect((await db.query('SELECT accion,actor_auth_id FROM auditoria_operaciones')).rows).toEqual([{ accion:'VENTA_ANULADA',actor_auth_id:uid }])
  expect((await db.query('SELECT * FROM movimientos_caja')).rows).toHaveLength(0)
})
it.each([true,false])('revierte anulación si un trigger antiguo duplica el movimiento (repone stock: %s)', async repone => {
  await db.exec(`CREATE OR REPLACE FUNCTION reposicion_legacy_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.estado='ANULADA' AND OLD.estado IS DISTINCT FROM 'ANULADA' THEN
      ${repone ? `UPDATE productos SET stock_actual=stock_actual+4 WHERE id='${producto}';` : ''}
      INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas)
        VALUES(NEW.kiosco_id,'${producto}','INGRESO',4,'DEVOLUCION','Devolución por anulación de venta '||NEW.id::text);
    END IF;
    RETURN NEW;
  END $$;
  CREATE TRIGGER reposicion_legacy AFTER UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION reposicion_legacy_test();`)
  await expect(anular()).rejects.toThrow('reposición adicional')
  expect(await estado()).toEqual({estado:'COMPLETADA',stock:'6',saldo:'300',lote:'0',anulaciones:0})
  expect((await db.query("SELECT * FROM movimientos_stock WHERE tipo='INGRESO'")).rows).toHaveLength(0)
  expect((await db.query('SELECT * FROM auditoria_operaciones')).rows).toHaveLength(0)
})
it('diagnóstico de duplicación enumera movimientos y triggers sin cambiar stock', async () => {
  const consulta=readFileSync('sql_diagnosticar_stock_anulacion_duplicado.sql','utf8')
    .replace('ef754442-ec79-480c-844e-4091d1ff71ea',venta)
  const {rows}=await db.query<{diagnostico_stock_anulacion:{movimientos_relacionados:unknown[];triggers_ventas:unknown[]}}>(consulta)
  expect(rows[0].diagnostico_stock_anulacion.movimientos_relacionados).toHaveLength(2)
  expect(rows[0].diagnostico_stock_anulacion.triggers_ventas.length).toBeGreaterThan(0)
  expect(await estado()).toEqual({estado:'COMPLETADA',stock:'6',saldo:'300',lote:'0',anulaciones:0})
})
it('la migración retira únicamente el trigger legado conocido y no duplica la reposición', async () => {
  await db.exec(`CREATE OR REPLACE FUNCTION fn_devolver_stock_anulacion() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.estado='ANULADA' AND OLD.estado='COMPLETADA' THEN
      UPDATE productos SET stock_actual=stock_actual+4 WHERE id='${producto}';
      INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas)
        VALUES(NEW.kiosco_id,'${producto}','INGRESO',4,'DEVOLUCION','Devolución por anulación de venta '||NEW.id::text);
    END IF; RETURN NEW; END $$;
    CREATE TRIGGER trg_devolver_stock_anulacion AFTER UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION fn_devolver_stock_anulacion();`)
  const sql=readFileSync('supabase_fase_anulacion_venta_atomica.sql','utf8')
  await db.exec(sql); await db.exec(sql)
  expect((await db.query("SELECT tgname FROM pg_trigger WHERE tgrelid='ventas'::regclass AND tgname='trg_devolver_stock_anulacion'")).rows).toHaveLength(0)
  await anular()
  expect(await estado()).toEqual({estado:'ANULADA',stock:'10',saldo:'150',lote:'3',anulaciones:1})
  expect((await db.query("SELECT sum(cantidad) cantidad FROM movimientos_stock WHERE tipo='INGRESO'")).rows).toEqual([{cantidad:'4'}])
})
it('no retira un trigger con el mismo nombre si apunta a otra función', async () => {
  await db.exec(`CREATE OR REPLACE FUNCTION otro_trigger_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER trg_devolver_stock_anulacion AFTER UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION otro_trigger_test();`)
  await expect(db.exec(readFileSync('supabase_fase_anulacion_venta_atomica.sql','utf8'))).rejects.toThrow('otra función')
  await db.exec('ROLLBACK')
  expect((await db.query("SELECT tgname FROM pg_trigger WHERE tgrelid='ventas'::regclass AND tgname='trg_devolver_stock_anulacion'")).rows).toHaveLength(1)
})
it('reintegra desde otra caja cuando la original está cerrada', async () => {
  await db.exec(`UPDATE sesiones_caja SET estado='CERRADA',fecha_cierre=now() WHERE id='${caja}'`)
  await expect(anular()).rejects.toThrow('caja abierta')
  await anular(otraCaja); await anular(otraCaja)
  expect((await db.query('SELECT monto,sesion_caja_id FROM movimientos_caja')).rows).toEqual([{ monto:'100',sesion_caja_id:otraCaja }])
})
it('revierte todo si falla una operación posterior al stock', async () => {
  await db.exec(`CREATE FUNCTION fallo_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.tipo='ABONO_PAGO' THEN RAISE EXCEPTION 'FALLO'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fallo BEFORE INSERT ON movimientos_cuenta_corriente FOR EACH ROW EXECUTE FUNCTION fallo_test();`)
  await expect(anular()).rejects.toThrow('FALLO')
  expect(await estado()).toEqual({ estado:'COMPLETADA',stock:'6',saldo:'300',lote:'0',anulaciones:0 })
  expect((await db.query("SELECT * FROM movimientos_stock WHERE tipo='INGRESO'")).rows).toHaveLength(0)
})
it.each(['CAJERO','VISOR'])('rechaza el rol %s', async rol => {
  await db.query('UPDATE usuarios SET rol=$1',[rol]); await expect(anular()).rejects.toThrow('dueño')
  expect(await estado()).toMatchObject({ estado: 'COMPLETADA' })
})
it('rechaza venta sin histórico, fiscal, parcial o con stock histórico adulterado', async () => {
  await db.exec('UPDATE checkout_manuales SET resultado=NULL'); await expect(anular()).rejects.toThrow('histórico')
  await db.exec("UPDATE checkout_manuales SET resultado='{}'; UPDATE ventas SET afip_cae='CAE'"); await expect(anular()).rejects.toThrow('fiscal')
  await db.exec('UPDATE ventas SET afip_cae=NULL'); await db.query('INSERT INTO devoluciones_venta(venta_id,kiosco_id) VALUES($1,$2)',[venta,kid])
  await expect(anular()).rejects.toThrow('parciales')
  await db.exec('DELETE FROM devoluciones_venta; UPDATE movimientos_stock SET cantidad=99')
  await expect(anular()).rejects.toThrow('Stock histórico')
})
it('impide anulación directa y devoluciones posteriores a la anulación', async () => {
  await expect(db.exec("UPDATE ventas SET estado='ANULADA',motivo_anulacion='Error de carga'")).rejects.toThrow('atómica')
  await anular()
  await expect(db.query('INSERT INTO devoluciones_venta(venta_id,kiosco_id) VALUES($1,$2)',[venta,kid])).rejects.toThrow('no admite')
})
it('mantiene privadas las escrituras y bloquea ejecución anónima', async () => {
  expect((await db.query(`SELECT has_function_privilege('anon','anular_venta_atomica(uuid,text,uuid)','EXECUTE') ejecutar,
    has_table_privilege('authenticated','anulaciones_venta_atomicas','INSERT') escribir`)).rows).toEqual([{ ejecutar:false,escribir:false }])
})
it('el diagnóstico de despliegue detecta la versión actual y sus triggers', async () => {
  const lectura = readFileSync('sql_verificar_anulacion_atomica.sql','utf8')
  const { rows } = await db.query<{ diagnostico_anulacion: {
    version_actual: Record<string, boolean>;
    triggers: { existe:boolean; habilitado:boolean }[];
    registro_privado: { puede_insertar:boolean; puede_actualizar:boolean; puede_borrar:boolean }[];
  } }>(lectura)
  const resultado = rows[0].diagnostico_anulacion
  expect(resultado.version_actual).toEqual({ conserva_costo_original:true, exige_auditoria:true, registro_con_rls:true,
    detecta_reposicion_adicional:true,sin_trigger_legado:true })
  expect(resultado.triggers).toHaveLength(6)
  expect(resultado.triggers.every(trigger => trigger.existe && trigger.habilitado)).toBe(true)
  expect(resultado.registro_privado.every(rol => !rol.puede_insertar && !rol.puede_actualizar && !rol.puede_borrar)).toBe(true)
  expect(await estado()).toMatchObject({ estado:'COMPLETADA',stock:'6' })
})
it('el diagnóstico detecta el trigger legado aunque esté deshabilitado', async () => {
  await db.exec(`CREATE OR REPLACE FUNCTION legado_diagnostico_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE TRIGGER trg_devolver_stock_anulacion AFTER UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION legado_diagnostico_test();
    ALTER TABLE ventas DISABLE TRIGGER trg_devolver_stock_anulacion;`)
  const {rows}=await db.query<{diagnostico_anulacion:{version_actual:{sin_trigger_legado:boolean}}}>(
    readFileSync('sql_verificar_anulacion_atomica.sql','utf8'))
  expect(rows[0].diagnostico_anulacion.version_actual.sin_trigger_legado).toBe(false)
})
it('el diagnóstico señala una RPC ausente y un trigger deshabilitado', async () => {
  await db.exec('BEGIN')
  try {
    await db.exec(`DROP FUNCTION anular_venta_atomica(uuid,text,uuid);
      ALTER TABLE pagos_venta DISABLE TRIGGER trg_pagos_venta_anulada;`)
    const { rows } = await db.query<{ diagnostico_anulacion: {
      version_actual: { conserva_costo_original:boolean; exige_auditoria:boolean; detecta_reposicion_adicional:boolean };
      triggers: { trigger:string; habilitado:boolean }[];
    } }>(readFileSync('sql_verificar_anulacion_atomica.sql','utf8'))
    expect(rows[0].diagnostico_anulacion.version_actual).toMatchObject({ conserva_costo_original:false, exige_auditoria:false,
      detecta_reposicion_adicional:false })
    expect(rows[0].diagnostico_anulacion.triggers.find(trigger => trigger.trigger==='trg_pagos_venta_anulada')?.habilitado).toBe(false)
  } finally {
    await db.exec('ROLLBACK')
  }
})
it('detecta permisos por columna y la migración los revoca al reaplicarse', async () => {
  await db.exec('GRANT INSERT(venta_id),UPDATE(motivo) ON anulaciones_venta_atomicas TO anon')
  const diagnostico = await db.query<{ diagnostico_anulacion: {
    registro_privado: { rol:string; puede_insertar_columnas:boolean; puede_actualizar_columnas:boolean }[];
  } }>(readFileSync('sql_verificar_anulacion_atomica.sql','utf8'))
  expect(diagnostico.rows[0].diagnostico_anulacion.registro_privado.find(rol => rol.rol==='anon'))
    .toMatchObject({ puede_insertar_columnas:true, puede_actualizar_columnas:true })
  await db.exec(readFileSync('supabase_fase_anulacion_venta_atomica.sql','utf8'))
  expect((await db.query(`SELECT has_any_column_privilege('anon','anulaciones_venta_atomicas','INSERT') insertar,
    has_any_column_privilege('anon','anulaciones_venta_atomicas','UPDATE') actualizar`)).rows)
    .toEqual([{ insertar:false, actualizar:false }])
})
it('conserva cabecera, pagos y detalles después de anular', async () => {
  await db.query('INSERT INTO detalles_venta VALUES($1,2)',[venta])
  await anular()
  await expect(db.exec('UPDATE ventas SET total=999')).rejects.toThrow('inmutable')
  await expect(db.exec("UPDATE ventas SET motivo_anulacion='Otro motivo'")).rejects.toThrow('inmutable')
  await expect(db.exec('UPDATE pagos_venta SET monto=999')).rejects.toThrow('inmutables')
  await expect(db.exec('DELETE FROM pagos_venta')).rejects.toThrow('inmutables')
  await expect(db.query("INSERT INTO pagos_venta VALUES($1,'EFECTIVO',1)",[venta])).rejects.toThrow('inmutables')
  await expect(db.exec('UPDATE detalles_venta SET cantidad=99')).rejects.toThrow('inmutables')
  await expect(db.exec('DELETE FROM detalles_venta')).rejects.toThrow('inmutables')
  expect((await db.query('SELECT total FROM ventas')).rows).toEqual([{ total:'250' }])
})
it('rechaza un perfil inactivo sin alterar la venta', async () => {
  await db.exec('UPDATE usuarios SET activo=false')
  await expect(anular()).rejects.toThrow('dueño activo')
  expect(await estado()).toMatchObject({ estado:'COMPLETADA', stock:'6' })
})
it('revierte stock y lotes si falta el costo histórico privado', async () => {
  await db.exec('DELETE FROM movimiento_stock_costos')
  await expect(anular()).rejects.toThrow('Costo histórico')
  expect(await estado()).toEqual({ estado:'COMPLETADA',stock:'6',saldo:'300',lote:'0',anulaciones:0 })
})
it('la comprobación del ticket exige las cantidades del snapshot aunque falten todos los movimientos', async () => {
  const consulta = readFileSync('sql_comprobar_anulacion_venta.sql','utf8')
    .replace('ef754442-ec79-480c-844e-4091d1ff71ea',venta)
  await anular()
  const confirmado = await db.query<{ estado:string; registro_atomico:boolean; auditorias:number;
    cantidades_restituidas:boolean; egresos_caja:number; pagos_conservados:string }>(consulta)
  expect(confirmado.rows[0]).toMatchObject({ estado:'ANULADA',registro_atomico:true,
    auditorias:1,cantidades_restituidas:true,egresos_caja:0,pagos_conservados:'250' })
  await db.exec('DELETE FROM movimientos_stock')
  const incompleto = await db.query<{ cantidades_restituidas:boolean }>(consulta)
  expect(incompleto.rows[0].cantidades_restituidas).toBe(false)
})
it('revierte la anulación si un trigger omite su auditoría', async () => {
  await db.exec(`CREATE OR REPLACE FUNCTION omitir_auditoria_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir_auditoria BEFORE INSERT ON auditoria_operaciones FOR EACH ROW EXECUTE FUNCTION omitir_auditoria_test();`)
  await expect(anular()).rejects.toThrow('auditoría')
  expect(await estado()).toEqual({ estado:'COMPLETADA',stock:'6',saldo:'300',lote:'0',anulaciones:0 })
})
it('preserva un lote retenido que todavía tenía existencias', async () => {
  await db.exec('UPDATE lotes_producto SET cantidad_actual=2,activo=false')
  await anular()
  expect((await db.query('SELECT cantidad_actual,activo FROM lotes_producto')).rows).toEqual([{ cantidad_actual:'5',activo:false }])
})
it('revierte todo cuando un trigger omite el movimiento de crédito', async () => {
  await db.exec(`CREATE OR REPLACE FUNCTION fallo_test() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN IF NEW.tipo='ABONO_PAGO' THEN RETURN NULL; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fallo BEFORE INSERT ON movimientos_cuenta_corriente FOR EACH ROW EXECUTE FUNCTION fallo_test();`)
  await expect(anular()).rejects.toThrow()
  expect(await estado()).toEqual({ estado:'COMPLETADA',stock:'6',saldo:'300',lote:'0',anulaciones:0 })
})
