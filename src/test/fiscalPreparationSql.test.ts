// @vitest-environment node
// PostgreSQL embebido con parámetros sintéticos: no acredita ARCA ni JWT hospedados.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { prepareFiscalData, requestFromPreparedFiscalData } from '../../supabase/functions/_shared/fiscalPreparation'
import { freezeFiscalRequest, serializeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'
import type { FiscalPreparationContext, FiscalPreparationInput } from '../../supabase/functions/_shared/fiscalPreparationContract'
import { wsfeSample } from './fixtures/fiscalWsfe'

const db=new PGlite(),kid=crypto.randomUUID(),actor=crypto.randomUUID(),owner=crypto.randomUUID(),sale=crypto.randomUUID(),product=crypto.randomUUID(),op=crypto.randomUUID(),credential=crypto.randomUUID()
beforeAll(async()=>{
 await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
 const root='supabase/bootstrap'
 for(const file of [join(root,'001_domain.sql'),join(root,'002_identity_helpers.sql'),...readdirSync(join(root,'steps')).sort().map(n=>join(root,'steps',n)),join(root,'900_final_security.sql')])await db.exec(readFileSync(file,'utf8'))
 for(const file of readdirSync('supabase/pilot-fiscal').filter(n=>/^\d{3}_.*\.sql$/.test(n)).sort()){
  const sql=readFileSync(join('supabase/pilot-fiscal',file),'utf8');await db.exec(sql);await db.exec(sql)
 }
 await db.query('INSERT INTO auth.users VALUES($1)',[actor])
 await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Preparación sintética')",[kid])
 await db.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Dueño','DUEÑO')",[owner,actor,kid])
 await db.query("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta) VALUES($1,$2,'Ensayo',123.45)",[product,kid])
 await db.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45)',[sale,kid,owner])
 await db.query('INSERT INTO detalles_venta(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,1,123.45,123.45)',[sale,product])
},120000)
beforeEach(async()=>{
 await db.exec('BEGIN')
 await db.query('INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado) VALUES($1,$2,7,$3,$4,true)',[kid,wsfeSample.cuitEmisor,credential,'a'.repeat(64)])
 await db.exec(`INSERT INTO fiscal_parametros_homologacion(revision,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado)
 VALUES(1,'[{"id":5,"descripcion":"Ensayo","comprobantes":[11]}]','[]',repeat('b',64),clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true);
 SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true);`)
})
afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE')})
afterAll(async()=>{await db.close()})
async function context(who=actor,which=sale) {
 return (await db.query<{data:FiscalPreparationContext}>('SELECT cargar_datos_preparacion_homologacion($1,$2) data',[who,which])).rows[0].data
}
function input():FiscalPreparationInput {
 const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,numero:_n,...data}=wsfeSample
 const {total:_total,...importes}=data.importes
 return {condicionEmisor:'MONOTRIBUTO',datos:{...data,importes}}
}
async function prepared(){return prepareFiscalData(await context(),input())}
async function save(canonical:string,hash:string,id=op,who=actor,which=sale){
 return (await db.query<{data:Record<string,unknown>}>('SELECT guardar_datos_preparacion_homologacion($1,$2,$3,$4,$5) data',[who,which,id,canonical,hash])).rows[0].data
}
async function denied(run:()=>Promise<unknown>){await db.exec('SAVEPOINT denied');await expect(run()).rejects.toThrow();await db.exec('ROLLBACK TO SAVEPOINT denied; RELEASE SAVEPOINT denied')}
async function admin(sql:string,args:unknown[]=[]){await db.exec('RESET ROLE');await db.query(sql,args);await db.exec('SET ROLE service_role')}
const hash=(text:string)=>createHash('sha256').update(text).digest('hex')
it('devuelve sólo identidad/total/parámetros públicos desde servidor',async()=>{
 const c=await context();expect(c).toEqual({version:1,venta_id:sale,total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,incluye_recepcion_envases:false,revision_parametros:1,
 condiciones:[{id:5,descripcion:'Ensayo',comprobantes:[11]}],alicuotas:[]})
})
it('guarda datos y snapshot una vez, conserva ACK y no reserva ni altera stock/caja',async()=>{
 const p=await prepared(),ack=await save(p.canonico,p.sha256)
 expect(ack).toEqual({operacion_id:op,venta_id:sale,preparacion_sha256:p.sha256,estado:'DATOS_PREPARADOS',emision_habilitada:false})
 expect(await save(p.canonico,p.sha256)).toEqual(ack)
 await db.exec('RESET ROLE')
 const row=(await db.query<{datos:unknown;actor_auth_id:string}>('SELECT datos,actor_auth_id FROM fiscal_preparaciones_homologacion')).rows[0]
 expect(row.actor_auth_id).toBe(actor);expect(row.datos).toEqual(JSON.parse(p.canonico));expect(p.datos).not.toHaveProperty('numero')
 for(const table of ['fiscal_reservas_homologacion','fiscal_solicitudes_homologacion','movimientos_stock','movimientos_caja'])expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
 expect((await db.query<{total:string}>('SELECT total::text FROM ventas')).rows[0].total).toBe('123.45')
})
it('no cambia identidad al reintentar con otro UUID ni cuerpo',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 await denied(()=>save(p.canonico,p.sha256,crypto.randomUUID()))
 const changed=JSON.parse(p.canonico);changed.datos.fecha='20261022';const canon=JSON.stringify(changed)
 await denied(()=>save(canon,hash(canon)))
})
it.each(['anon','authenticated'])('rol %s no consulta ni escribe preparación privada',async role=>{
 const p=await prepared();await db.exec(`SET ROLE ${role}`)
 await denied(()=>context());await denied(()=>save(p.canonico,p.sha256))
 for(const table of ['fiscal_parametros_homologacion','fiscal_preparaciones_homologacion'])await denied(()=>db.query(`SELECT * FROM ${table}`))
})
it.each(['CAJERO','VISOR'])('rol de negocio %s no prepara',async role=>{
 await admin('UPDATE usuarios SET rol=$1 WHERE id=$2',[role,owner]);await denied(()=>context())
})
it('Auth ajeno, comercio suspendido y venta ajena no revelan el contexto',async()=>{
 await denied(()=>context(crypto.randomUUID()));await denied(()=>context(actor,crypto.randomUUID()))
 await admin("UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id=$1",[kid]);await denied(()=>context())
})
it.each(['habilitado=false','consultado_en=clock_timestamp()+interval \'2 hours\',vence_en=clock_timestamp()+interval \'3 hours\'','vence_en=clock_timestamp()-interval \'1 minute\''])('parámetros %s no se usan',async change=>{
 // Se crea otra fila en vez de mutar datos del catálogo inmutable.
 await admin('DELETE FROM fiscal_parametros_homologacion WHERE false')
 await admin('UPDATE fiscal_parametros_homologacion SET habilitado=false')
 if(change!=='habilitado=false')await admin(`INSERT INTO fiscal_parametros_homologacion SELECT 2,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,true FROM fiscal_parametros_homologacion`)
 if(change!=='habilitado=false'){
  await admin('ALTER TABLE fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables')
  await admin(`UPDATE fiscal_parametros_homologacion SET ${change} WHERE revision=2`)
  await admin('ALTER TABLE fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables')
 }
 await denied(()=>context())
})
it('cambio de Auth, emisor o snapshot invalida replay sin reatribuir la solicitud',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 const other=crypto.randomUUID();await admin('INSERT INTO auth.users VALUES($1)',[other]);await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[other,owner])
 await denied(()=>save(p.canonico,p.sha256,op,actor));await denied(()=>save(p.canonico,p.sha256,op,other))
 await admin('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[actor,owner]);await admin('UPDATE fiscal_emisores_homologacion SET revision=2')
 await denied(()=>save(p.canonico,p.sha256));await admin('UPDATE fiscal_emisores_homologacion SET revision=1')
 await admin('UPDATE detalles_venta SET cantidad=2 WHERE venta_id=$1',[sale]);await denied(()=>save(p.canonico,p.sha256))
})
it('error del validador hace rollback de la operación y no deja preparación parcial',async()=>{
 const p=await prepared(),bad=JSON.parse(p.canonico);bad.datos.importes.neto='1.00';const canon=JSON.stringify(bad)
 await denied(()=>save(canon,hash(canon)))
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_operaciones_homologacion')).rows[0].n).toBe(0)
})
it('condición del emisor nula no se interpreta como una declaración explícita',async()=>{
 const p=await prepared(),bad=JSON.parse(p.canonico);bad.condicionEmisor=null;const canon=JSON.stringify(bad)
 await denied(()=>save(canon,hash(canon)))
})
it('recepción de envases bloqueada en DB aunque se omita el formulario',async()=>{
 const p=await prepared();await admin('UPDATE detalles_venta SET es_devolucion_envase=true WHERE venta_id=$1',[sale])
 expect((await context()).incluye_recepcion_envases).toBe(true);await denied(()=>save(p.canonico,p.sha256))
})
it('preparación y catálogo conservan auditoría inmutable',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256);await db.exec('RESET ROLE')
 await denied(()=>db.exec("UPDATE fiscal_preparaciones_homologacion SET actor_auth_id=gen_random_uuid()"))
 await denied(()=>db.exec('DELETE FROM fiscal_preparaciones_homologacion'))
 await denied(()=>db.exec("UPDATE fiscal_parametros_homologacion SET condiciones='[]'"))
 await denied(()=>db.exec('DELETE FROM fiscal_parametros_homologacion'))
})
it('enlaza cuerpo final exacto a preparación y reserva un número sólo en ese paso',async()=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 const frozen=await requestFromPreparedFiscalData(p,1),canonical=await serializeFiscalRequest(frozen)
 const run=()=>db.query<{data:{numero:number}}>('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp()) data',[actor,op,canonical,frozen.sha256])
 const result=(await run()).rows[0].data
 expect(result.numero).toBe(1);expect((await run()).rows[0].data).toEqual(result)
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(1)
})
it.each(['fecha','actor','emisor','parametros'])('cambio de %s no permite reservar cuerpo desde preparación previa',async mode=>{
 const p=await prepared();await save(p.canonico,p.sha256)
 let frozen=await requestFromPreparedFiscalData(p,1)
 if(mode==='fecha')frozen=await freezeFiscalRequest({...frozen.solicitud,fecha:'20261022'})
 if(mode==='emisor')await admin('UPDATE fiscal_emisores_homologacion SET revision=2')
 if(mode==='parametros')await admin('INSERT INTO fiscal_parametros_homologacion SELECT 2,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,true FROM fiscal_parametros_homologacion')
 const canonical=await serializeFiscalRequest(frozen)
 await denied(()=>db.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[mode==='actor'?crypto.randomUUID():actor,op,canonical,frozen.sha256]))
 await db.exec('RESET ROLE');expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(0)
})
