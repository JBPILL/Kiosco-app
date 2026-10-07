// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, beforeEach, afterAll, it, expect } from 'vitest'
let db: PGlite
const kid = '10000000-0000-0000-0000-000000000001'
const kid2 = '10000000-0000-0000-0000-000000000002'
const owner = '20000000-0000-0000-0000-000000000001'
const cashier = '20000000-0000-0000-0000-000000000002'
const other = '20000000-0000-0000-0000-000000000003'
const inactive = '20000000-0000-0000-0000-000000000004'
const product = '30000000-0000-0000-0000-000000000001'
const sale = '40000000-0000-0000-0000-000000000001'
const detail = '50000000-0000-0000-0000-000000000001'
const request = '60000000-0000-0000-0000-000000000001'
const request2 = '60000000-0000-0000-0000-000000000002'
interface Unit { id: string; identificador: string; garantia_hasta: string | null }
interface Repair { id: string; version: number; estado: string }
const login = async (id = owner) => db.exec(`RESET ROLE; SET request.jwt.claim.sub='${id}'; SET ROLE authenticated;`)
const admin = async (sql: string) => { await db.exec('RESET ROLE'); await db.exec(sql); await login() }
const unit = async (ident = 'abc-1', req = request, hasta: string | null = null, condiciones: string | null = null, tipo = 'SERIE', det = detail) =>
 (await db.query<{ resultado: Unit }>('SELECT to_jsonb(electronica_registrar_unidad($1,$2,$3,$4,$5,$6)) AS resultado', [req,det,tipo,ident,hasta,condiciones])).rows[0].resultado
const data = { cliente_nombre: 'Ana', cliente_contacto: null, equipo: 'Telefono', identificador: null, informe_falla: 'Pantalla rota', diagnostico: null, estado: 'RECIBIDA', presupuesto: null }
const repair = async (datos: Record<string, unknown> = data, id: string | null = null, version: number | null = null, req = request) =>
 (await db.query<{ resultado: Repair }>('SELECT to_jsonb(electronica_guardar_reparacion($1,$2,$3,$4::jsonb)) AS resultado', [req,id,version,JSON.stringify(datos)])).rows[0].resultado
beforeAll(async () => {
 db = new PGlite()
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claim.role',true) $$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TABLE kioscos(id uuid PRIMARY KEY,rubro text,estado_suscripcion text DEFAULT 'ACTIVO');
 CREATE TABLE usuarios(id uuid PRIMARY KEY,auth_user_id uuid,kiosco_id uuid,rol text,activo boolean,es_superadmin boolean DEFAULT false);
 CREATE TABLE productos(id uuid PRIMARY KEY,kiosco_id uuid REFERENCES kioscos,activo boolean DEFAULT true,es_combo boolean DEFAULT false,es_pesable boolean DEFAULT false,stock_actual numeric DEFAULT 5);
 CREATE TABLE ventas(id uuid PRIMARY KEY,kiosco_id uuid REFERENCES kioscos,estado text,sincronizado boolean,fecha_hora timestamptz,total numeric DEFAULT 100);
 CREATE TABLE detalles_venta(id uuid PRIMARY KEY,venta_id uuid REFERENCES ventas,producto_id uuid REFERENCES productos,cantidad numeric);
 CREATE TABLE pagos_venta(id uuid PRIMARY KEY,venta_id uuid,monto numeric);
 CREATE TABLE movimientos_caja(id uuid PRIMARY KEY,monto numeric);
 INSERT INTO kioscos(id,rubro) VALUES('${kid}','ELECTRONICA_CELULARES'),('${kid2}','ELECTRONICA_CELULARES');
 INSERT INTO usuarios(id,auth_user_id,kiosco_id,rol,activo) VALUES
 ('${owner}','${owner}','${kid}','DUEÑO',true),('${cashier}','${cashier}','${kid}','CAJERO',true),
 ('${other}','${other}','${kid2}','DUEÑO',true),('${inactive}','${inactive}','${kid}','DUEÑO',false);
 INSERT INTO productos(id,kiosco_id) VALUES('${product}','${kid}');
 INSERT INTO ventas(id,kiosco_id,estado,sincronizado,fecha_hora) VALUES('${sale}','${kid}','COMPLETADA',true,'2026-10-06T01:00:00Z');
 INSERT INTO detalles_venta VALUES('${detail}','${sale}','${product}',2);
 INSERT INTO pagos_venta VALUES(gen_random_uuid(),'${sale}',100);
 INSERT INTO movimientos_caja VALUES(gen_random_uuid(),20);`)
 const roles = readFileSync('supabase_seguridad_roles_rls.sql','utf8')
 await db.exec(roles.slice(roles.indexOf('CREATE OR REPLACE FUNCTION public.auth_user_kiosco_id()'), roles.indexOf('-- 3. SOLUCIÓN ADVISOR:')))
 await db.exec(`ALTER TABLE ventas ENABLE ROW LEVEL SECURITY; GRANT SELECT ON ventas TO authenticated;
 CREATE POLICY venta_tenant ON ventas FOR SELECT TO authenticated USING(kiosco_id=auth_user_kiosco_id());`)
 await db.exec(readFileSync('supabase_fase_electronica.sql','utf8'))
 await db.exec(readFileSync('supabase_fase_electronica.sql','utf8'))
}, 30000)
beforeEach(async () => {
 await db.exec(`RESET ROLE; TRUNCATE electronica_solicitudes,electronica_unidades,electronica_reparaciones;
 DELETE FROM usuarios WHERE id='90000000-0000-0000-0000-000000000001';
 UPDATE usuarios SET activo=true WHERE id='${owner}'; UPDATE kioscos SET rubro='ELECTRONICA_CELULARES',estado_suscripcion='ACTIVO';
 UPDATE productos SET activo=true,es_combo=false,es_pesable=false,stock_actual=5,kiosco_id='${kid}';
 UPDATE ventas SET estado='COMPLETADA',sincronizado=true; UPDATE detalles_venta SET cantidad=2;`)
 await login()
})
afterAll(async () => db?.close())
it('registra unidad y garantia internamente normalizadas, idempotente sin doble consumo', async () => {
 const a = await unit(' abc-1 ',request,'2027-10-05',' Condiciones internas ')
 expect(a.identificador).toBe('ABC-1')
 expect(await unit('ABC-1',request,'2027-10-05','Condiciones internas')).toEqual(a)
 await expect(unit('OTRA',request,'2027-10-05','Condiciones internas')).rejects.toThrow('otro contenido')
 expect((await db.query('SELECT * FROM electronica_unidades')).rows).toHaveLength(1)
})
it('cantidad y duplicados hacen rollback sin consumir solicitud', async () => {
 await unit(); await expect(unit('ABC-1',request2)).rejects.toThrow('duplicate key')
 await unit('ABC-2',request2)
 await expect(unit('ABC-3','60000000-0000-0000-0000-000000000003')).rejects.toThrow('agotada')
 await db.exec('RESET ROLE')
 expect((await db.query('SELECT * FROM electronica_solicitudes')).rows).toHaveLength(2)
})
it('garantia compara fecha local de venta, limita10años y exige condiciones', async () => {
 for (const [hasta,condiciones] of [['2026-10-04','a'],['2036-10-06','a'],['2027-01-01',null],[null,'a'],['2027-01-01','x'.repeat(2001)]]) {
  await expect(unit('ABC',request,hasta,condiciones)).rejects.toThrow()
 }
 expect((await unit('ABC',request,'2026-10-05','Interna')).garantia_hasta).toBe('2026-10-05')
})
it('valida IMEI Luhn y series, no permite espacios internos o longitud excesiva', async () => {
 for (const ident of ['123','490154203237519','49015420323751x']) await expect(unit(ident,request,null,null,'IMEI')).rejects.toThrow('IMEI')
 await expect(unit('serie con espacios')).rejects.toThrow('Identificador')
 await expect(unit('x'.repeat(81))).rejects.toThrow('Identificador')
 expect((await unit('490154203237518',request,null,null,'IMEI')).identificador).toBe('490154203237518')
})
it('rechaza venta anulada/offline, fracciones, combos, pesables y productos de otro tenant', async () => {
 for (const cambio of ["UPDATE ventas SET estado='ANULADA'",'UPDATE ventas SET sincronizado=false','UPDATE detalles_venta SET cantidad=1.5','UPDATE productos SET es_combo=true','UPDATE productos SET es_pesable=true',`UPDATE productos SET kiosco_id='${kid2}'`]) {
  await admin(cambio); await expect(unit()).rejects.toThrow()
  await admin(`UPDATE ventas SET estado='COMPLETADA',sincronizado=true; UPDATE detalles_venta SET cantidad=2; UPDATE productos SET es_combo=false,es_pesable=false,kiosco_id='${kid}'`)
 }
 expect((await db.query('SELECT * FROM electronica_unidades')).rows).toHaveLength(0)
})
it('aisla lectura/RPC por dueño activo y rubro, y bloquea escritura directa', async () => {
 await unit()
 const original=await repair(data,null,null,request2)
 for (const id of [cashier,inactive,other]) {
  await login(id); expect((await db.query('SELECT * FROM electronica_unidades')).rows).toHaveLength(0)
  await expect(unit('OTRA',request2)).rejects.toThrow()
  expect((await db.query('SELECT * FROM electronica_reparaciones')).rows).toHaveLength(0)
  await expect(repair({...data,estado:'DIAGNOSTICO'},original.id,1)).rejects.toThrow()
 }
 await login(); await expect(db.query('DELETE FROM electronica_unidades')).rejects.toThrow('permission denied')
 await admin(`UPDATE kioscos SET rubro='KIOSCO' WHERE id='${kid}'`)
 await expect(unit()).rejects.toThrow('dueño activo')
 await db.exec('RESET ROLE; SET ROLE anon'); await expect(unit()).rejects.toThrow('permission denied')
})
it('vista refleja anulación posterior sin borrar historial ni reponer stock', async () => {
 await unit(); await admin("UPDATE ventas SET estado='ANULADA'")
 expect((await db.query<{ venta_estado: string }>('SELECT venta_estado FROM v_electronica_unidades')).rows[0].venta_estado).toBe('ANULADA')
})
it('admite producto vendido que luego se desactiva, sin reactivar ni afectar inventario', async () => {
 await admin('UPDATE productos SET activo=false')
 expect((await unit()).identificador).toBe('ABC-1')
})
it('rechaza perfiles activos ambiguos incluso si sólo uno cumple rol/rubro', async () => {
 await unit()
 await admin(`INSERT INTO usuarios(id,auth_user_id,kiosco_id,rol,activo) VALUES('90000000-0000-0000-0000-000000000001','${owner}','${kid2}','CAJERO',true)`)
 expect((await db.query('SELECT * FROM electronica_unidades')).rows).toHaveLength(0)
 await expect(unit('OTRA',request2)).rejects.toThrow('único dueño activo')
 await expect(repair()).rejects.toThrow('único dueño activo')
})
it('las FK compuestas rechazan una unidad mezclada entre comercios incluso fuera de RPC', async () => {
 await db.exec('RESET ROLE')
 await expect(db.query(`INSERT INTO electronica_unidades(kiosco_id,detalle_venta_id,venta_id,producto_id,tipo_identificador,identificador) VALUES($1,$2,$3,$4,'SERIE','AJENA')`,[kid2,detail,sale,product])).rejects.toThrow('foreign key')
})
it('comercio SOLO_LECTURA o SUSPENDIDO conserva lectura pero no acepta cambios', async () => {
 await unit(); const r=await repair(data,null,null,request2)
 for (const estado of ['SOLO_LECTURA','SUSPENDIDO']) {
  await admin(`UPDATE kioscos SET estado_suscripcion='${estado}' WHERE id='${kid}'`)
  expect((await db.query('SELECT * FROM electronica_unidades')).rows).toHaveLength(1)
  await expect(unit('OTRA',request2)).rejects.toThrow('no habilitado')
  await expect(repair({...data,estado:'DIAGNOSTICO'},r.id,1)).rejects.toThrow('no habilitado')
 }
})
it('crea reparación RECIBIDA, CAS/retry protege edición y claves no cambian operación', async () => {
 const a=await repair(); expect(a.version).toBe(1); expect(await repair()).toEqual(a)
 await expect(unit('ABC',request)).rejects.toThrow('otro contenido')
 const b=await repair({...data,estado:'DIAGNOSTICO'},a.id,1,request2); expect(b.version).toBe(2)
 expect(await repair({...data,estado:'DIAGNOSTICO'},a.id,1,request2)).toEqual(b)
 await expect(repair({...data,estado:'DIAGNOSTICO'},a.id,1,'60000000-0000-0000-0000-000000000003')).rejects.toThrow('desactualizada')
 await expect(repair({...data,equipo:'Otro'},a.id,1,request2)).rejects.toThrow('otro contenido')
})
it('valida transiciones y terminales; no acepta alta ya entregada', async () => {
 await expect(repair({...data,estado:'ENTREGADA'})).rejects.toThrow('RECIBIDA')
 let r=await repair()
 await expect(repair({...data,estado:'LISTA'},r.id,r.version,request2)).rejects.toThrow('Transición')
 let n=2
 for (const estado of ['DIAGNOSTICO','PRESUPUESTADA','DIAGNOSTICO','PRESUPUESTADA','AUTORIZADA','EN_REPARACION','LISTA','EN_REPARACION','LISTA','ENTREGADA']) {
  r=await repair({...data,estado,presupuesto:100},r.id,r.version,`60000000-0000-0000-0000-${String(n++).padStart(12,'0')}`)
 }
 await expect(repair({...data,estado:'ENTREGADA',presupuesto:100},r.id,r.version,`60000000-0000-0000-0000-${String(n).padStart(12,'0')}`)).rejects.toThrow('no editable')
})
it('presupuestos y datos rechazados no crean ni actualizan reparaciones', async () => {
 for (const presupuesto of [-1,0.001,10000000000,'100']) await expect(repair({...data,presupuesto})).rejects.toThrow('Presupuesto')
 for (const extra of [{cliente_nombre:''},{equipo:'x'.repeat(161)},{informe_falla:'x'.repeat(2001)},{cliente_contacto:'x'.repeat(121)},{identificador:'x'.repeat(81)},{diagnostico:42},{campo_desconocido:'x'}]) await expect(repair({...data,...extra})).rejects.toThrow()
 expect((await db.query('SELECT * FROM electronica_reparaciones')).rows).toHaveLength(0)
})
it('no muta stock, ventas, pagos ni movimientos de caja', async () => {
 await db.exec('RESET ROLE')
 const antes=await db.query('SELECT (SELECT jsonb_agg(p) FROM productos p) AS productos,(SELECT jsonb_agg(v) FROM ventas v) AS ventas,(SELECT jsonb_agg(p) FROM pagos_venta p) AS pagos,(SELECT jsonb_agg(m) FROM movimientos_caja m) AS caja')
 await login(); await unit(); await repair(data,null,null,request2)
 await db.exec('RESET ROLE')
 const despues=await db.query('SELECT (SELECT jsonb_agg(p) FROM productos p) AS productos,(SELECT jsonb_agg(v) FROM ventas v) AS ventas,(SELECT jsonb_agg(p) FROM pagos_venta p) AS pagos,(SELECT jsonb_agg(m) FROM movimientos_caja m) AS caja')
 expect(despues.rows).toEqual(antes.rows)
})
