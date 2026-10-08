// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll,beforeEach,afterAll,it,expect } from 'vitest'
const kid='614a2e8c-2488-4caa-a95a-22a04db115b8',venta='ef754442-ec79-480c-844e-4091d1ff71ea'
const producto='de9823cd-2bcf-4005-9e1f-ca88ead0a9a2',original='5ab96f45-f1f8-4337-80a0-06501a0dcec5',duplicado='52f05b1f-820f-47bd-9f33-87a41d6d9cbb'
const sql=readFileSync('sql_conciliar_anulacion_ef754442.sql','utf8')
let db:PGlite
beforeAll(async()=>{
  db=new PGlite()
  await db.exec(`CREATE SCHEMA auth; CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE TABLE ventas(id uuid PRIMARY KEY,kiosco_id uuid,estado text);
    CREATE TABLE anulaciones_venta_atomicas(venta_id uuid PRIMARY KEY,kiosco_id uuid,resultado jsonb,creado_en timestamptz);
    CREATE TABLE productos(id uuid PRIMARY KEY,kiosco_id uuid,descripcion text,stock_actual numeric,fecha_actualizacion timestamptz);
    CREATE TABLE movimientos_stock(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),kiosco_id uuid,producto_id uuid,
      tipo text,cantidad numeric,motivo text,notas text,fecha timestamptz,lote_producto_id uuid);
    CREATE TABLE movimiento_stock_costos(movimiento_id uuid PRIMARY KEY REFERENCES movimientos_stock ON DELETE CASCADE,kiosco_id uuid,precio_costo numeric);
    CREATE FUNCTION costo_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
      INSERT INTO movimiento_stock_costos VALUES(NEW.id,NEW.kiosco_id,2000); RETURN NEW; END $$;
    CREATE TRIGGER costo_test AFTER INSERT ON movimientos_stock FOR EACH ROW EXECUTE FUNCTION costo_test();
    CREATE TABLE auditoria_operaciones(kiosco_id uuid,actor_auth_id uuid,actor_rol text,accion text,entidad text,entidad_id uuid,motivo text);
    CREATE FUNCTION legacy_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NEW; END $$;
    CREATE FUNCTION fallo_auditoria_test() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'FALLO_AUDITORIA'; END $$;`)
},30_000)
beforeEach(async()=>{
  await db.exec(`DROP TRIGGER IF EXISTS trg_devolver_stock_anulacion ON ventas;
    DROP TRIGGER IF EXISTS fallo ON auditoria_operaciones;
    DELETE FROM auditoria_operaciones; DELETE FROM movimientos_stock;
    DELETE FROM productos; DELETE FROM ventas; DELETE FROM anulaciones_venta_atomicas;
    INSERT INTO ventas VALUES('${venta}','${kid}','ANULADA');
    INSERT INTO productos VALUES('${producto}','${kid}','Quilmes',18,NULL);
    INSERT INTO anulaciones_venta_atomicas VALUES('${venta}','${kid}',
      jsonb_build_object('stock',jsonb_build_array(jsonb_build_object('producto_id','${producto}','stock_actual',17))),
      '2026-10-08T10:41:51.46548Z');
    INSERT INTO movimientos_stock(id,kiosco_id,producto_id,tipo,cantidad,motivo,notas,fecha) VALUES
      ('${original}','${kid}','${producto}','INGRESO',1,'DEVOLUCION','Anulación atómica ${venta}','2026-10-08T10:41:51.46548Z'),
      ('${duplicado}','${kid}','${producto}','INGRESO',1,'DEVOLUCION','Devolución por anulación de venta ${venta}','2026-10-08T10:41:51.46548Z');
    UPDATE movimiento_stock_costos SET precio_costo=1900 WHERE movimiento_id='${original}';`)
})
afterAll(async()=>{await db.close()})
async function ejecutar(){try{return await db.exec(sql)}catch(error){await db.exec('ROLLBACK');throw error}}
async function estado(){return(await db.query(`SELECT (SELECT stock_actual FROM productos) stock,
  (SELECT count(*)::int FROM movimientos_stock) movimientos,(SELECT count(*)::int FROM auditoria_operaciones) auditorias`)).rows[0]}
it('compensa una unidad con costo histórico y auditoría, conserva originales y no repite',async()=>{
  await ejecutar();await ejecutar()
  expect(await estado()).toEqual({stock:'17',movimientos:3,auditorias:1})
  expect((await db.query(`SELECT m.cantidad,c.precio_costo FROM movimientos_stock m
    JOIN movimiento_stock_costos c ON c.movimiento_id=m.id WHERE m.tipo='EGRESO'`)).rows).toEqual([{cantidad:'1',precio_costo:'1900'}])
  expect((await db.query('SELECT actor_auth_id,actor_rol FROM auditoria_operaciones')).rows[0]).toMatchObject({actor_auth_id:null,actor_rol:expect.stringContaining('SQL_EDITOR:')})
})
it.each([
  'UPDATE productos SET stock_actual=17',
  `INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad,fecha) VALUES('${kid}','${producto}','EGRESO',1,now())`,
  `INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad) VALUES('${kid}','${producto}','EGRESO',1)`,
  'UPDATE movimientos_stock SET cantidad=2',
  `UPDATE ventas SET estado='COMPLETADA'`,
  'CREATE TRIGGER trg_devolver_stock_anulacion AFTER UPDATE ON ventas FOR EACH ROW EXECUTE FUNCTION legacy_test()',
])('aborta ante contexto cambiado %s',async cambio=>{
  await db.exec(cambio);const antes=await estado()
  await expect(ejecutar()).rejects.toThrow()
  expect(await estado()).toEqual(antes)
})
it('fallo de auditoría revierte cantidad, egreso y costo',async()=>{
  await db.exec('CREATE TRIGGER fallo BEFORE INSERT ON auditoria_operaciones FOR EACH ROW EXECUTE FUNCTION fallo_auditoria_test()')
  await expect(ejecutar()).rejects.toThrow('FALLO_AUDITORIA')
  expect(await estado()).toEqual({stock:'18',movimientos:2,auditorias:0})
})
