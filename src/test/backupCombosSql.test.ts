// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest'
const db = new PGlite()
const kid = '00000000-0000-0000-0000-000000000001'
const uid = '00000000-0000-0000-0000-000000000002'
const combo = '00000000-0000-0000-0000-000000000003'
const fisico = '00000000-0000-0000-0000-000000000004'
const ajeno = '00000000-0000-0000-0000-000000000005'
const otroKid = '00000000-0000-0000-0000-000000000006'
const sql = readFileSync('supabase_fase_restaurar_combos_backup.sql', 'utf8')
const snapshotSql = readFileSync('supabase_fase_backup_combos.sql', 'utf8')
beforeAll(async () => {
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth;
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT current_setting('test.uid')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT current_setting('test.role') $$;
    CREATE FUNCTION auth_es_superadmin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT false $$;
    CREATE TABLE kioscos(id uuid PRIMARY KEY,nombre text,estado_suscripcion text);
    CREATE TABLE usuarios(auth_user_id uuid,kiosco_id uuid,rol text,activo boolean);
    CREATE FUNCTION auth_es_dueno_o_superadmin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT EXISTS(SELECT 1 FROM usuarios WHERE auth_user_id=auth.uid() AND activo AND rol='DUEÑO') $$;
    CREATE FUNCTION auth_user_kiosco_id() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT kiosco_id FROM usuarios WHERE auth_user_id=auth.uid() AND activo LIMIT 1 $$;
    CREATE TABLE productos(id uuid PRIMARY KEY,kiosco_id uuid,es_combo boolean DEFAULT false,es_pesable boolean DEFAULT false);
    CREATE TABLE combo_items(id uuid PRIMARY KEY,kiosco_id uuid,combo_producto_id uuid REFERENCES productos(id),componente_producto_id uuid REFERENCES productos(id),cantidad numeric);
    CREATE TABLE producto_costos(producto_id uuid,kiosco_id uuid,precio_costo numeric);
    CREATE TABLE categorias(id uuid,kiosco_id uuid); CREATE TABLE clientes(id uuid,kiosco_id uuid);
    CREATE TABLE proveedores(id uuid,kiosco_id uuid); CREATE TABLE promociones(id uuid,kiosco_id uuid); CREATE TABLE lotes_producto(id uuid,kiosco_id uuid);
    INSERT INTO kioscos VALUES('${kid}','Local','ACTIVO'),('${otroKid}','Otro','ACTIVO');
    INSERT INTO usuarios VALUES('${uid}','${kid}','DUEÑO',true);
    INSERT INTO productos(id,kiosco_id,es_combo) VALUES('${combo}','${kid}',false),('${fisico}','${kid}',false),('${ajeno}','${otroKid}',false);
    SELECT set_config('test.uid','${uid}',false),set_config('test.role','authenticated',false);`)
  await db.exec(sql); await db.exec(sql)
  await db.exec(snapshotSql); await db.exec(snapshotSql)
})
beforeEach(async () => {
  await db.exec(`RESET ROLE; UPDATE usuarios SET rol='DUEÑO',activo=true; DELETE FROM combo_items;
    UPDATE productos SET es_combo=false,es_pesable=false; UPDATE kioscos SET estado_suscripcion='ACTIVO';`)
})
afterAll(async () => db.close())
const items = (id = fisico, cantidad = 2) => [{ componente_producto_id: id, cantidad }]
async function restore(componentes: unknown = items(), esCombo = true) {
  return db.query<{ result: { componentes: number; es_combo: boolean } }>('SELECT restaurar_combo_backup($1,$2,$3,$4::jsonb) result', [kid,combo,esCombo,JSON.stringify(componentes)])
}
it('restaura y reintenta sin duplicar componentes', async () => {
  await db.exec('SET ROLE authenticated')
  expect((await restore()).rows[0].result).toEqual({ producto_id: combo, componentes: 1, es_combo: true })
  await restore()
  await db.exec('RESET ROLE')
  const { rows } = await db.query<{ cantidad: string | number }>('SELECT cantidad FROM combo_items')
  expect(rows).toHaveLength(1); expect(Number(rows[0].cantidad)).toBe(2)
})
it('rechaza cajero, usuario inactivo y comercio suspendido', async () => {
  await db.exec("UPDATE usuarios SET rol='CAJERO'"); await expect(restore()).rejects.toThrow('dueño')
  await db.exec("UPDATE usuarios SET rol='DUEÑO',activo=false"); await expect(restore()).rejects.toThrow('dueño')
  await db.exec("UPDATE usuarios SET activo=true; UPDATE kioscos SET estado_suscripcion='SUSPENDIDO'")
  await expect(restore()).rejects.toThrow('habilitado')
})
it('conserva la composición original ante entradas inválidas', async () => {
  await restore()
  for (const entrada of [items(ajeno),items(combo),items(fisico,0),items(fisico,-1),items(fisico,0.0001),items(fisico,1000000),[...items(),...items()],[],{},[{ cantidad:2 }]]) {
    await expect(restore(entrada)).rejects.toThrow()
    expect((await db.query('SELECT * FROM combo_items')).rows).toHaveLength(1)
  }
})
it('admite fracciones de tres decimales únicamente en productos pesables', async () => {
  await expect(restore(items(fisico,0.5))).rejects.toThrow('fracciones')
  await db.exec(`UPDATE productos SET es_pesable=true WHERE id='${fisico}'`)
  await restore(items(fisico,0.125))
  await expect(restore(items(fisico,0.1255))).rejects.toThrow('Cantidades')
})
it('rechaza componentes virtuales y elimina componentes al convertir a físico', async () => {
  await db.exec(`UPDATE productos SET es_combo=true WHERE id='${fisico}'`)
  await expect(restore()).rejects.toThrow('virtual')
  await db.exec(`UPDATE productos SET es_combo=false WHERE id='${fisico}'`)
  await restore(); await restore([],false)
  expect((await db.query('SELECT * FROM combo_items')).rows).toHaveLength(0)
})
it('revoca ejecución anónima y de service_role', async () => {
  const { rows } = await db.query(`SELECT has_function_privilege('anon','restaurar_combo_backup(uuid,uuid,boolean,jsonb)','EXECUTE') anon,
    has_function_privilege('service_role','restaurar_combo_backup(uuid,uuid,boolean,jsonb)','EXECUTE') servicio`)
  expect(rows[0]).toEqual({ anon:false,servicio:false })
})
it('revierte la eliminación si una inserción posterior falla', async () => {
  await restore()
  await db.exec(`CREATE FUNCTION fallar_componente() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN
    IF NEW.cantidad=99 THEN RAISE EXCEPTION 'Falla simulada'; END IF; RETURN NEW; END $$;
    CREATE TRIGGER fallo_insert BEFORE INSERT ON combo_items FOR EACH ROW EXECUTE FUNCTION fallar_componente();`)
  await expect(restore(items(fisico,99))).rejects.toThrow('Falla simulada')
  const { rows } = await db.query<{ cantidad: string | number }>('SELECT cantidad FROM combo_items')
  expect(rows).toHaveLength(1); expect(Number(rows[0].cantidad)).toBe(2)
  await db.exec('DROP TRIGGER fallo_insert ON combo_items; DROP FUNCTION fallar_componente()')
})
it('exporta componentes en el mismo snapshot sin incluir otro comercio', async () => {
  await restore()
  const { rows } = await db.query<{ data: { productos: Array<{ id:string; componentes_combo: unknown[] }> } }>('SELECT generar_snapshot_backup($1) data',[kid])
  expect(rows[0].data.productos.find(p => p.id===combo)?.componentes_combo).toEqual(items())
  expect(rows[0].data.productos.some(p => p.id===ajeno)).toBe(false)
  expect(rows[0].data.productos.find(p => p.id===fisico)?.componentes_combo).toEqual([])
})
it('revierte componentes si un trigger impide activar el combo', async () => {
  await db.exec(`CREATE FUNCTION omitir_tipo() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir_update BEFORE UPDATE ON productos FOR EACH ROW EXECUTE FUNCTION omitir_tipo();`)
  await expect(restore()).rejects.toThrow('tipo del producto')
  expect((await db.query('SELECT * FROM combo_items')).rows).toHaveLength(0)
  await db.exec('DROP TRIGGER omitir_update ON productos; DROP FUNCTION omitir_tipo()')
})
