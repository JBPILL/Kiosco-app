// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
import { validarAmpliacionBackup } from '../lib/backupAmpliado'

const db = new PGlite()
const kid = '00000000-0000-0000-0000-000000000001'
const other = '00000000-0000-0000-0000-000000000002'
const uid = '00000000-0000-0000-0000-000000000003'
const baseSql = readFileSync(new URL('../../supabase_fase_backup_integral.sql', import.meta.url), 'utf8')
const sql = readFileSync(new URL('../../supabase_fase_backup_ampliado.sql', import.meta.url), 'utf8')
type Snapshot = { version: string; clientes: Array<{ id: string; saldo_deudor: number }>; proveedores: Array<{ id: string; saldo_pendiente: number }>; configuracion_comercio: Record<string, unknown>; saldos_snapshot: { clientes: unknown[]; proveedores: unknown[] }; contenido: Record<string, unknown> }
beforeAll(async () => {
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth;
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.uid')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role') $$;
 CREATE TABLE kioscos(id uuid PRIMARY KEY,nombre text,direccion text,telefono text,rubro text,estado_suscripcion text,
 capacidades_operativas jsonb,equipos_comercio jsonb,cuit text,iibb text,inicio_actividades text,condicion_iva text,
 afip_punto_venta integer,afip_habilitado boolean,afip_entorno text,afip_alicuota_iva numeric,
 afip_token text,afip_certificado text,pin_supervisor_hash text,afip_ultimo_nro integer);
 CREATE TABLE usuarios(id uuid DEFAULT gen_random_uuid(),auth_user_id uuid,kiosco_id uuid,rol text,activo boolean);
 CREATE FUNCTION auth_es_superadmin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM usuarios WHERE auth_user_id=auth.uid() AND activo AND rol='SUPERADMIN') $$;
 CREATE FUNCTION auth_es_dueno_o_superadmin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM usuarios WHERE auth_user_id=auth.uid() AND activo AND rol IN ('DUEÑO','SUPERADMIN')) $$;
 CREATE FUNCTION auth_user_kiosco_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT kiosco_id FROM usuarios WHERE auth_user_id=auth.uid() AND activo LIMIT 1 $$;
 CREATE TABLE productos(id uuid,kiosco_id uuid); CREATE TABLE producto_costos(producto_id uuid,kiosco_id uuid,precio_costo numeric);
 CREATE TABLE categorias(id uuid,kiosco_id uuid); CREATE TABLE clientes(id uuid,kiosco_id uuid,saldo_deudor numeric);
 CREATE TABLE proveedores(id uuid,kiosco_id uuid,saldo_pendiente numeric); CREATE TABLE promociones(id uuid,kiosco_id uuid); CREATE TABLE lotes_producto(id uuid,kiosco_id uuid);
 INSERT INTO kioscos VALUES('${kid}','Local','Dirección','123','KIOSCO','ACTIVO','{"envases":true}','{"impresoraModelo":"T"}',
 '20123456789','IIBB','2020-01-01','MONOTRIBUTO',2,false,'HOMOLOGACION',21,'TOKEN_CANARY','CERT_CANARY','PIN_CANARY',777);
 INSERT INTO kioscos(id,nombre,rubro,estado_suscripcion) VALUES('${other}','Otro','KIOSCO','ACTIVO');
 INSERT INTO clientes SELECT md5(i::text)::uuid,'${kid}',i::numeric / 10 FROM generate_series(1,1500) i;
 INSERT INTO clientes VALUES(gen_random_uuid(),'${other}',999999);
 INSERT INTO proveedores VALUES(gen_random_uuid(),'${kid}',-23.45),(gen_random_uuid(),'${other}',555555);
 `)
 await db.exec(baseSql)
 await db.exec(sql)
 await db.exec(sql)
})
beforeEach(async () => {
 await db.exec(`SELECT set_config('test.uid','${uid}',false),set_config('test.role','authenticated',false);
 DELETE FROM usuarios; INSERT INTO usuarios(auth_user_id,kiosco_id,rol,activo) VALUES('${uid}','${kid}','DUEÑO',true);
 UPDATE kioscos SET nombre='Local',estado_suscripcion='ACTIVO',rubro='KIOSCO' WHERE id='${kid}';`)
})
afterAll(async () => { await db.close() })
async function snapshot(id = kid): Promise<Snapshot> {
 const result = await db.query<{ data: Snapshot }>('SELECT generar_snapshot_backup_ampliado($1) data', [id])
 return result.rows[0].data
}
it('la configuración y los saldos reales del SQL satisfacen el contrato del navegador', async () => {
 const datos = await snapshot()
 expect(validarAmpliacionBackup({ configuracion_comercio: datos.configuracion_comercio, saldos_snapshot: datos.saldos_snapshot }, datos.clientes, datos.proveedores).configuracion_comercio.nombre).toBe('Local')
})
async function restore(config: Record<string, unknown>, id = kid) {
 return db.query('SELECT restaurar_configuracion_backup($1,$2::jsonb)', [id, JSON.stringify(config)])
}
it('exporta 1500 saldos exactos del snapshot base sin truncamiento ni otros tenants', async () => {
 const s = await snapshot()
 expect(s.version).toBe('4.0')
 expect(s.clientes).toHaveLength(1500)
 expect(s.saldos_snapshot.clientes).toEqual(s.clientes.map(({ id, saldo_deudor }) => ({ id, saldo_deudor })))
 expect(s.saldos_snapshot.proveedores).toEqual(s.proveedores.map(({ id, saldo_pendiente }) => ({ id, saldo_pendiente })))
 expect(s.proveedores[0].saldo_pendiente).toBe(-23.45)
 expect(s.contenido).toMatchObject({ incluyeConfiguracion: true, incluyeSaldos: true, incluyeVentas: false, incluyeMovimientosCaja: false, incluyeCredenciales: false })
 expect(JSON.stringify(s)).not.toMatch(/TOKEN_CANARY|CERT_CANARY|PIN_CANARY|999999|555555/)
 expect(s.configuracion_comercio).not.toHaveProperty('afip_ultimo_nro')
})
it('mantiene permisos de lectura dueño, superadmin y service_role', async () => {
 await expect(snapshot(other)).rejects.toThrow('Solo el dueño')
 await db.exec("UPDATE usuarios SET rol='CAJERO'")
 await expect(snapshot()).rejects.toThrow('Solo el dueño')
 await db.exec("UPDATE usuarios SET rol='SUPERADMIN'")
 expect((await snapshot(other)).version).toBe('4.0')
 await db.exec("DELETE FROM usuarios; SELECT set_config('test.role','service_role',false)")
 expect((await snapshot(other)).version).toBe('4.0')
})
it('limita ACL de exportación y restauración incluso tras reaplicar SQL', async () => {
 const { rows } = await db.query<{ anon_export: boolean; authenticated_export: boolean; service_export: boolean; anon_restore: boolean; authenticated_restore: boolean; service_restore: boolean }>(`SELECT
 has_function_privilege('anon','generar_snapshot_backup_ampliado(uuid)','EXECUTE') anon_export,
 has_function_privilege('authenticated','generar_snapshot_backup_ampliado(uuid)','EXECUTE') authenticated_export,
 has_function_privilege('service_role','generar_snapshot_backup_ampliado(uuid)','EXECUTE') service_export,
 has_function_privilege('anon','restaurar_configuracion_backup(uuid,jsonb)','EXECUTE') anon_restore,
 has_function_privilege('authenticated','restaurar_configuracion_backup(uuid,jsonb)','EXECUTE') authenticated_restore,
 has_function_privilege('service_role','restaurar_configuracion_backup(uuid,jsonb)','EXECUTE') service_restore`)
 expect(rows[0]).toEqual({ anon_export: false, authenticated_export: true, service_export: true, anon_restore: false, authenticated_restore: true, service_restore: false })
})
it('perfil inactivo no exporta ni restaura', async () => {
 await db.exec('UPDATE usuarios SET activo=false')
 await expect(snapshot()).rejects.toThrow('Solo el dueño')
 await expect(restore({ rubro: 'KIOSCO', nombre: 'Nuevo' })).rejects.toThrow('único dueño activo')
})
it('restaura campos permitidos y preserva secretos, hardware, rubro y saldos', async () => {
 await restore({ rubro: 'KIOSCO', nombre: 'Nuevo', afip_alicuota_iva: 10.5, afip_punto_venta: 99, arqueo_ciego_obligatorio: false })
 const { rows } = await db.query<Record<string, unknown>>('SELECT * FROM kioscos WHERE id=$1', [kid])
 expect(rows[0]).toMatchObject({ nombre: 'Nuevo', afip_token: 'TOKEN_CANARY', afip_certificado: 'CERT_CANARY', pin_supervisor_hash: 'PIN_CANARY', afip_ultimo_nro: 777, afip_habilitado: false, rubro: 'KIOSCO', capacidades_operativas: { envases: true }, equipos_comercio: { impresoraModelo: 'T' }, arqueo_ciego_obligatorio: false })
 expect((await snapshot()).clientes).toHaveLength(1500)
})
it('bloquea cajero, superadmin, service_role, duplicados, comercio inactivo y tenant cruzado', async () => {
 for (const role of ['CAJERO', 'SUPERADMIN']) {
  await db.query('UPDATE usuarios SET rol=$1', [role])
  await expect(restore({ rubro: 'KIOSCO' })).rejects.toThrow('Solo el dueño')
 }
 await db.exec("DELETE FROM usuarios; SELECT set_config('test.role','service_role',false)")
 await expect(restore({ rubro: 'KIOSCO' })).rejects.toThrow('único dueño activo')
 await db.exec(`INSERT INTO usuarios(auth_user_id,kiosco_id,rol,activo) VALUES('${uid}','${kid}','DUEÑO',true),('${uid}','${kid}','DUEÑO',true)`)
 await expect(restore({ rubro: 'KIOSCO' })).rejects.toThrow('único dueño activo')
 await db.exec('DELETE FROM usuarios WHERE id IN (SELECT id FROM usuarios LIMIT 1)')
 await expect(restore({ rubro: 'KIOSCO' }, other)).rejects.toThrow('Solo el dueño')
 await db.exec(`UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id='${kid}'`)
 await expect(restore({ rubro: 'KIOSCO' })).rejects.toThrow('no habilitado')
})
it('rechaza parámetros inválidos sin modificar nada', async () => {
 const invalid = [
  { nombre: 'Nuevo' }, { rubro: 'GENERAL' }, { rubro: 'KIOSCO', nombre: null }, { rubro: 'KIOSCO', nombre: ' '.repeat(3) },
  { rubro: 'KIOSCO', cuit: '20-12345678-9' }, { rubro: 'KIOSCO', afip_punto_venta: 1.5 }, { rubro: 'KIOSCO', afip_punto_venta: 100000 },
  { rubro: 'KIOSCO', afip_alicuota_iva: 27 }, { rubro: 'KIOSCO', arqueo_ciego_obligatorio: 'true' },
  { rubro: 'KIOSCO', condicion_iva: 'INVENTADA' }, { rubro: 'KIOSCO', inicio_actividades: '2020-02-31' },
  { rubro: 'KIOSCO', nombre: 'x'.repeat(161) }, { rubro: 'KIOSCO', direccion: [] }, { rubro: 'KIOSCO', arqueo_ciego_obligatorio: null },
  ...['capacidades_operativas','equipos_comercio','afip_habilitado','afip_token','pin_supervisor_hash','estado_suscripcion'].map(key => ({ rubro: 'KIOSCO', nombre: 'Nuevo', [key]: true })),
 ]
 for (const config of invalid) await expect(restore(config)).rejects.toThrow()
 const { rows } = await db.query<{ nombre: string }>('SELECT nombre FROM kioscos WHERE id=$1', [kid])
 expect(rows[0].nombre).toBe('Local')
})
it('saldos ausentes o nulos generan error y no se convierten silenciosamente en cero', async () => {
 await db.exec(`UPDATE clientes SET saldo_deudor=NULL WHERE id=(SELECT id FROM clientes WHERE kiosco_id='${kid}' LIMIT 1)`)
 await expect(snapshot()).rejects.toThrow('saldos incompletos')
 await db.exec(`UPDATE clientes SET saldo_deudor=0 WHERE saldo_deudor IS NULL`)
})
