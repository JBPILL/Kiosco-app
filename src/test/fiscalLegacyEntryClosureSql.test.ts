// @vitest-environment node
// Scoped SQL054 acceptance in embedded PostgreSQL; no hosted identity or ARCA claims.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { prepareFiscalData } from '../../supabase/functions/_shared/fiscalPreparation'
import type { FiscalPreparationContext, FiscalPreparationInput } from '../../supabase/functions/_shared/fiscalPreparationContract'
import { wsfeSample } from './fixtures/fiscalWsfe'

const db=new PGlite(),actor=crypto.randomUUID(),owner=crypto.randomUUID(),kiosk=crypto.randomUUID(),sale=crypto.randomUUID(),product=crypto.randomUUID()
const signature='public.preparar_operacion_fiscal_homologacion(uuid,uuid,uuid,jsonb)'
const migration=readFileSync('supabase/pilot-fiscal/054_close_legacy_preparation_entry.sql','utf8')
const patch=migration.replace(/^BEGIN;\r?$/m,'').replace(/^COMMIT;\r?$/m,'')
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;
 CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
 const root='supabase/bootstrap'
 for(const file of [join(root,'001_domain.sql'),join(root,'002_identity_helpers.sql'),...readdirSync(join(root,'steps')).sort().map(name=>join(root,'steps',name)),join(root,'900_final_security.sql')])await db.exec(readFileSync(file,'utf8'))
 // The legacy entry and its actual private012 replacement, not fabricated RPC stubs.
 for(const name of readdirSync('supabase/pilot-fiscal').filter(name=>/^\d{3}_.*\.sql$/.test(name)&&Number(name.slice(0,3))<=12).sort())await db.exec(readFileSync(join('supabase/pilot-fiscal',name),'utf8'))
 await db.query('INSERT INTO auth.users VALUES($1)',[actor])
 await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'SQL054 synthetic')",[kiosk])
 await db.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Synthetic owner','DUEÑO')",[owner,actor,kiosk])
 await db.query("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta) VALUES($1,$2,'Synthetic product',123.45)",[product,kiosk])
 await db.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45)',[sale,kiosk,owner])
 await db.query('INSERT INTO detalles_venta(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,1,123.45,123.45)',[sale,product])
},120000)
beforeEach(async()=>{
 await db.exec('BEGIN')
 await db.query('INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado) VALUES($1,$2,2,$3,$4,true)',[kiosk,wsfeSample.cuitEmisor,crypto.randomUUID(),'a'.repeat(64)])
 await db.exec(`INSERT INTO fiscal_parametros_homologacion(revision,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado)
 VALUES(1,'[{"id":5,"descripcion":"Synthetic","comprobantes":[11]}]','[]',repeat('b',64),clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true)`)
})
afterEach(async()=>{await db.exec('ROLLBACK;RESET ROLE')})
afterAll(async()=>{await db.close()})
async function allowed(role:string):Promise<boolean>{return (await db.query<{ok:boolean}>('SELECT has_function_privilege($1,$2,\'EXECUTE\') AS ok',[role,signature])).rows[0].ok}
async function rejected(action:()=>Promise<unknown>,message:RegExp):Promise<void>{
 await db.exec('SAVEPOINT expected_failure')
 await expect(action()).rejects.toThrow(message)
 await db.exec('ROLLBACK TO SAVEPOINT expected_failure;RELEASE SAVEPOINT expected_failure;RESET ROLE')
}
it('pins the unchanged reviewed legacy body and contains no business DML or body replacement',()=>{
 const source=readFileSync('supabase/pilot-fiscal/001_fiscal_journal.sql','utf8').replaceAll('\r\n','\n')
 const body=source.match(/CREATE OR REPLACE FUNCTION public\.preparar_operacion_fiscal_homologacion\([\s\S]*?AS \$\$([\s\S]*?)\$\$;/)?.[1]
 expect(body).toBeTypeOf('string')
 expect(migration).toContain(createHash('sha256').update(body!).digest('hex'))
 expect(migration).not.toMatch(/\b(INSERT|UPDATE|DELETE|TRUNCATE|CREATE|DROP)\b/i)
})
it('revokes all external execution, preserves body/history and is idempotent',async()=>{
 expect(await allowed('authenticated')).toBe(true)
 const before=(await db.query('SELECT prosrc,proconfig,prosecdef FROM pg_proc WHERE oid=$1::regprocedure',[signature])).rows
 const rows=(await db.query('SELECT to_jsonb(v) AS data FROM ventas v WHERE id=$1',[sale])).rows
 await db.exec(patch);await db.exec(patch)
 for(const role of ['anon','authenticated','service_role'])expect(await allowed(role)).toBe(false)
 expect((await db.query('SELECT prosrc,proconfig,prosecdef FROM pg_proc WHERE oid=$1::regprocedure',[signature])).rows).toEqual(before)
 expect((await db.query('SELECT to_jsonb(v) AS data FROM ventas v WHERE id=$1',[sale])).rows).toEqual(rows)
 expect((await db.query<{count:number}>('SELECT count(*)::int AS count FROM fiscal_operaciones_homologacion')).rows[0].count).toBe(0)
})
it.each(['anon','authenticated','service_role'])('blocks direct legacy invocation by %s before inserting any context',async role=>{
 await db.exec(patch)
 await db.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[actor])
 const context={version:1,cuit_emisor:wsfeSample.cuitEmisor,punto_venta:2,tipo_comprobante:11,tipo_doc_receptor:99,nro_doc_receptor:'0'}
 await rejected(async()=>{
  await db.exec('SET LOCAL ROLE '+role)
  return db.query('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb)',[crypto.randomUUID(),kiosk,sale,JSON.stringify(context)])
 },/permission denied/)
 expect((await db.query<{count:number}>('SELECT count(*)::int AS count FROM fiscal_operaciones_homologacion')).rows[0].count).toBe(0)
})
it('keeps the genuine private012 preparation route working without invoking the legacy entry',async()=>{
 await db.exec(patch)
 await db.exec("SET LOCAL ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',true)")
 const context=(await db.query<{data:FiscalPreparationContext}>('SELECT cargar_datos_preparacion_homologacion($1,$2) AS data',[actor,sale])).rows[0].data
 const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,numero:_n,...datos}=wsfeSample
 const {total:_t,...importes}=datos.importes
 const input:FiscalPreparationInput={condicionEmisor:'MONOTRIBUTO',datos:{...datos,importes}}
 const prepared=await prepareFiscalData(context,input),operation=crypto.randomUUID()
 const result=await db.query<{data:{estado:string;operacion_id:string;emision_habilitada:boolean}}>('SELECT guardar_datos_preparacion_homologacion($1,$2,$3,$4,$5) AS data',[actor,sale,operation,prepared.canonico,prepared.sha256])
 expect(result.rows[0].data).toMatchObject({estado:'DATOS_PREPARADOS',operacion_id:operation,emision_habilitada:false})
 await db.exec('RESET ROLE')
 expect(await allowed('authenticated')).toBe(false)
 expect((await db.query<{count:number}>('SELECT count(*)::int AS count FROM fiscal_reservas_homologacion')).rows[0].count).toBe(0)
})
it.each(['body','security','owner','search_path'])('fails closed on legacy %s drift without changing ACL',async kind=>{
 if(kind==='body')await db.exec(`CREATE OR REPLACE FUNCTION public.preparar_operacion_fiscal_homologacion(p_operacion_id uuid,p_kiosco_id uuid,p_venta_id uuid,p_contexto jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN RETURN '{}'::jsonb;END $$`)
 if(kind==='security')await db.exec('ALTER FUNCTION '+signature+' SECURITY INVOKER')
 if(kind==='owner')await db.exec('ALTER FUNCTION '+signature+' OWNER TO authenticated')
 if(kind==='search_path')await db.exec('ALTER FUNCTION '+signature+' SET search_path=public,pg_catalog')
 await rejected(()=>db.exec(patch),/LEGACY_FISCAL_ENTRY_SOURCE_MISMATCH/)
 expect(await allowed('authenticated')).toBe(true)
})
it('requires a present private replacement before closing the old entry',async()=>{
 await db.exec('ALTER FUNCTION public.guardar_datos_preparacion_homologacion(uuid,uuid,uuid,text,text) RENAME TO synthetic_missing_private_preparation')
 await rejected(()=>db.exec(patch),/PRIVATE_PREPARATION_ROUTE_REQUIRED/)
 expect(await allowed('authenticated')).toBe(true)
})
it('rolls back the revoke when an unexpected grant remains instead of silently accepting it',async()=>{
 await db.exec('CREATE ROLE synthetic_unexpected_executor;GRANT EXECUTE ON FUNCTION '+signature+' TO synthetic_unexpected_executor')
 await rejected(()=>db.exec(patch),/LEGACY_FISCAL_ENTRY_NOT_CLOSED/)
 expect(await allowed('authenticated')).toBe(true)
 expect(await allowed('synthetic_unexpected_executor')).toBe(true)
})
