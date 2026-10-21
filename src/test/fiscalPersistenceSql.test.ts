// @vitest-environment node
// PostgreSQL embebido: no acredita permisos JWT ni concurrencia hospedados.
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createHash, randomUUID } from 'node:crypto'
import { PGlite } from '@electric-sql/pglite'
import { afterAll, afterEach, beforeAll, beforeEach, expect, it } from 'vitest'
import { freezeFiscalRequest, serializeFiscalRequest } from '../../supabase/functions/_shared/fiscalReconciliation'

const db = new PGlite()
const kid=randomUUID(), auth=randomUUID(), owner=randomUUID(), sale=randomUUID(), op=randomUUID(), attempt=randomUUID()
const context={version:1,cuit_emisor:'20123456786',punto_venta:2,tipo_comprobante:11,tipo_doc_receptor:99,nro_doc_receptor:'0'}
const sample={version:1,entorno:'HOMOLOGACION',cuitEmisor:'20123456786',puntoVenta:2,tipoComprobante:11,numero:1,
  concepto:1,tipoDocumento:99,numeroDocumento:'0',condicionIvaReceptor:5,fecha:'20261021',
  servicioDesde:null,servicioHasta:null,vencimientoPago:null,moneda:'PES',cotizacion:'1',
  importes:{total:'123.45',neto:'123.45',iva:'0',noGravado:'0',exento:'0',tributos:'0'},iva:[],tributos:[]}
let canonical: string, digest: string
beforeAll(async()=>{
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  const root='supabase/bootstrap'
  for(const file of [join(root,'001_domain.sql'),join(root,'002_identity_helpers.sql'),
    ...readdirSync(join(root,'steps')).sort().map(name=>join(root,'steps',name)),join(root,'900_final_security.sql')]) {
    await db.exec(readFileSync(file,'utf8'))
  }
  for(const file of ['001_fiscal_journal.sql','002_fiscal_reservations.sql','003_fiscal_requests.sql']) {
    const sql=readFileSync(join('supabase/pilot-fiscal',file),'utf8')
    await db.exec(sql); await db.exec(sql)
  }
  await db.query('INSERT INTO auth.users VALUES($1)',[auth])
  await db.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Ensayo fiscal')",[kid])
  await db.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Dueño','DUEÑO')",[owner,auth,kid])
  await db.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45)',[sale,kid,owner])
  await db.query("SELECT set_config('request.jwt.claim.sub',$1,false)",[auth])
  const frozen=await freezeFiscalRequest(sample)
  canonical=await serializeFiscalRequest(frozen); digest=frozen.sha256
},120_000)
beforeEach(async()=>{
  await db.exec('BEGIN; SET ROLE authenticated')
  await db.query('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb)',[op,kid,sale,JSON.stringify(context)])
  await db.exec("RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true)")
})
afterEach(async()=>{await db.exec('ROLLBACK; RESET ROLE')})
afterAll(async()=>{await db.close()})
async function persist(body=canonical,hash=digest) {
  return (await db.query<{ack:Record<string,unknown>}>(`SELECT persistir_solicitud_fiscal_homologacion($1,$2,$3,0,clock_timestamp()) ack`,[op,body,hash])).rows[0].ack
}
async function intent(id=attempt) {
  return (await db.query<{ack:Record<string,unknown>}>('SELECT registrar_intento_fiscal_homologacion($1,$2) ack',[op,id])).rows[0].ack
}
async function denied(action:()=>Promise<unknown>) {
  await db.exec('SAVEPOINT denied'); await expect(action()).rejects.toThrow()
  await db.exec('ROLLBACK TO SAVEPOINT denied; RELEASE SAVEPOINT denied')
}
function hash(text:string) {return createHash('sha256').update(text).digest('hex')}
it('persiste cuerpo y reserva atómicos con SHA nativo compatible con el contrato',async()=>{
  expect(hash(canonical)).toBe(digest)
  const ack=await persist()
  expect(ack).toMatchObject({operacion_id:op,numero:1,estado:'RESERVADA',solicitud_sha256:digest,revision:1,emision_habilitada:false})
  expect(await persist()).toEqual(ack)
  await db.exec('RESET ROLE')
  expect((await db.query('SELECT cuerpo_canonico,solicitud_sha256 FROM fiscal_solicitudes_homologacion')).rows)
    .toEqual([{cuerpo_canonico:canonical,solicitud_sha256:digest}])
  for(const table of ['pagos_venta','movimientos_stock','movimientos_caja','checkout_manuales']) {
    expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  }
})
it('requiere cuerpo durable antes de registrar intención y conserva un único intento',async()=>{
  await denied(()=>intent())
  await persist()
  expect(await intent()).toMatchObject({nuevo_intento:true,solicitud_sha256:digest,revision:1})
  expect(await intent()).toMatchObject({nuevo_intento:false,requiere_conciliacion:true})
  await denied(()=>intent(randomUUID()))
})
it('rechaza sustitución del cuerpo incluso con hash correcto',async()=>{
  await persist()
  const other=canonical.replace('20261021','20261020')
  await denied(()=>persist(other,hash(other)))
  expect((await persist()).solicitud_sha256).toBe(digest)
})
it.each(['hash','numero','total','contexto','fecha','extra','decimal','iva','tipoTexto'])('rechaza %s sin reservar número',async mode=>{
  const body=JSON.parse(canonical)
  if(mode==='numero')body.numero=2
  if(mode==='total'){body.importes.total='124.45';body.importes.neto='124.45'}
  if(mode==='contexto')body.puntoVenta=3
  if(mode==='fecha')body.fecha='20260230'
  if(mode==='extra')body.token='no-admitido'
  if(mode==='decimal')body.importes.total='123,45'
  if(mode==='iva')body.importes.iva='1.00'
  if(mode==='tipoTexto')body.numeroDocumento=0
  const text=JSON.stringify(body)
  await denied(()=>persist(text,mode==='hash'?'0'.repeat(64):hash(text)))
  await db.exec('RESET ROLE')
  for(const table of ['fiscal_series_homologacion','fiscal_reservas_homologacion','fiscal_solicitudes_homologacion']) {
    expect((await db.query<{n:number}>(`SELECT count(*)::int n FROM ${table}`)).rows[0].n).toBe(0)
  }
})
it('el replay tras perder el ACK conserva cuerpo, hash y número',async()=>{
  const first=await persist()
  await intent()
  // El consumidor perdió ambas respuestas: recupera la misma identidad durable.
  expect(await persist()).toMatchObject({...first,estado:'ENVIO_INCIERTO'})
  expect(await intent()).toMatchObject({nuevo_intento:false,requiere_conciliacion:true})
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_solicitudes_homologacion')).rows[0].n).toBe(1)
  expect((await db.query<{ultimo_observado:number}>('SELECT ultimo_observado FROM fiscal_series_homologacion')).rows[0].ultimo_observado).toBe(0)
})
it('no confunde claim de servicio con permiso SQL de ejecución',async()=>{
  await db.exec('RESET ROLE; SET ROLE authenticated')
  await denied(()=>persist())
  await db.exec("RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claim.role','authenticated',true)")
  await denied(()=>persist())
})
it('conserva la operación al iniciar otra transacción después del commit',async()=>{
  await persist(); await intent(); await db.exec('COMMIT; RESET ROLE')
  // Nueva transacción representa otra conexión del trabajador; PGlite es monoconexión.
  await db.exec("BEGIN; SET ROLE service_role; SELECT set_config('request.jwt.claim.role','service_role',true)")
  expect(await intent()).toMatchObject({nuevo_intento:false,requiere_conciliacion:true,solicitud_sha256:digest})
  // Limpieza explícita del único caso que confirmó datos fuera del rollback por prueba.
  await db.exec('RESET ROLE')
  await db.query('DELETE FROM fiscal_solicitudes_homologacion WHERE operacion_id=$1',[op])
  await db.query('DELETE FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[op])
  await db.exec('DELETE FROM fiscal_series_homologacion')
  await db.query('DELETE FROM fiscal_operaciones_homologacion WHERE id=$1',[op])
  await db.exec('COMMIT; BEGIN')
})
it.each(['anon','authenticated','service_role'])('no permite lectura ni escritura directa a %s',async role=>{
  await persist()
  await db.exec(`RESET ROLE; SET ROLE ${role}`)
  await denied(()=>db.exec('SELECT * FROM fiscal_solicitudes_homologacion'))
  await denied(()=>db.exec('DELETE FROM fiscal_solicitudes_homologacion'))
  if(role!=='service_role')await denied(()=>persist())
})
it('el CHECK rechaza explícitamente un intento sin hash aunque lo escriba el propietario SQL',async()=>{
  await persist(); await intent(); await db.exec('RESET ROLE')
  await denied(()=>db.exec('UPDATE fiscal_reservas_homologacion SET solicitud_sha256=NULL'))
})
it.each(['solicitud','vinculo'])('revierte todo si un trigger omite %s',async mode=>{
  await db.exec('RESET ROLE')
  await db.exec(`CREATE FUNCTION omitir_fiscal() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
    CREATE TRIGGER omitir BEFORE ${mode==='solicitud'?'INSERT ON fiscal_solicitudes_homologacion':'UPDATE ON fiscal_reservas_homologacion'}
    FOR EACH ROW EXECUTE FUNCTION omitir_fiscal(); SET ROLE service_role`)
  await denied(()=>persist())
  await db.exec('RESET ROLE')
  expect((await db.query<{n:number}>('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n).toBe(0)
})
