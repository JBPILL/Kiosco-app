// Ensayo PostgreSQL real y sintético. No lee .env ni accede a Supabase/ARCA.
// Requiere Docker iniciado e imagen postgres:17-alpine ya instalada (sin pull).
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import assert from 'node:assert/strict'
import pg from 'pg'

if (!process.argv.includes('--run-local')) throw new Error('Usar --run-local para crear un contenedor de ensayo aislado.')
const root = resolve(import.meta.dirname, '../..')
const image = 'postgres:17-alpine'
const name = `kiosko-pr03-local-${randomUUID().slice(0,8)}`
const label = 'kioskopos.fiscal.test=pr03-local'
const clients = []
const cases = []
const transportErrors = []
let created = false
let containerId
let port
let evidence
const evidenceIndex = process.argv.indexOf('--evidence')
const evidencePath = evidenceIndex >= 0 ? resolve(process.argv[evidenceIndex+1] ?? '') : null
if (evidencePath && !evidencePath.endsWith('.json')) throw new Error('La evidencia debe ser JSON.')
if (evidencePath && existsSync(evidencePath)) throw new Error('No sobrescribir evidencia anterior; elegir otro archivo JSON.')
const docker = args => execFileSync('docker', args, { encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe'] }).trim()
const delay = ms => new Promise(resolveDelay => setTimeout(resolveDelay,ms))
async function connect() {
  const client = new pg.Client({host:'127.0.0.1',port,user:'postgres',database:'kiosko_fiscal_ensayo',
    connectionTimeoutMillis:3000,query_timeout:15000,application_name:'kiosko-pr03-local'})
  client.on('error',error=>transportErrors.push(error.code??'CONNECTION_ERROR'))
  try { await client.connect() } catch(error) { await client.end().catch(()=>{}); throw error }
  clients.push(client); return client
}
async function start(client,role='service_role',subject='') {
  assert(['service_role','authenticated'].includes(role))
  await client.query('BEGIN')
  await client.query(`SET LOCAL ROLE ${role}`)
  await client.query("SELECT set_config('request.jwt.claim.role',$1,true),set_config('request.jwt.claim.sub',$2,true)",[role,subject])
}
async function waitForLock(observer,client) {
  const deadline=Date.now()+7000
  while (Date.now()<deadline) {
    const r=await observer.query('SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1',[client.processID])
    if (r.rows[0]?.wait_event_type==='Lock') return
    await delay(40)
  }
  throw new Error('No se observó el bloqueo PostgreSQL esperado.')
}
const capture = promise => promise.then(value=>({value}),error=>({error}))
const issuer='20123456786'
const context = point=>({version:1,cuit_emisor:issuer,punto_venta:point,tipo_comprobante:11,tipo_doc_receptor:99,nro_doc_receptor:'0'})
const prepare = async(client,fixture,op=randomUUID(),point=2)=>{
  const r=await client.query('SELECT preparar_operacion_fiscal_homologacion($1,$2,$3,$4::jsonb) ack',
    [op,fixture.kid,fixture.sale,JSON.stringify(context(point))])
  return r.rows[0].ack
}
const reserve = async(client,op,point=2)=>{
  const r=await client.query('SELECT reservar_numero_fiscal_homologacion($1,$2,$3,11,41,clock_timestamp()) ack',[op,issuer,point])
  return r.rows[0].ack
}
const attempt = async(client,op,id)=>{
  const r=await client.query('SELECT registrar_intento_fiscal_homologacion($1,$2) ack',[op,id])
  return r.rows[0].ack
}
try {
  docker(['image','inspect',image,'--format','{{.Id}}'])
  containerId=docker(['run','--pull=never','--detach','--name',name,'--label',label,
    '--publish','127.0.0.1::5432','--env','POSTGRES_HOST_AUTH_METHOD=trust',
    '--env','POSTGRES_DB=kiosko_fiscal_ensayo',image])
  created=true
  if (evidencePath) writeFileSync(evidencePath,JSON.stringify({status:'RUNNING',containerId,containerName:name,image,startedAt:new Date().toISOString()},null,2)+'\n')
  const binding=JSON.parse(docker(['inspect',name,'--format','{{json .NetworkSettings.Ports}}']))['5432/tcp']
  assert.equal(binding.length,1); assert.equal(binding[0].HostIp,'127.0.0.1')
  port=Number(binding[0].HostPort); assert(Number.isInteger(port)&&port>0)
  let observer
  const readinessDeadline=Date.now()+60000
  while (Date.now()<readinessDeadline) {
    try { observer=await connect(); break } catch { await delay(250) }
  }
  assert(observer,'PostgreSQL local no quedó listo.')
  console.log('POSTGRES_LOCAL=READY; REMOTE_CONNECTIONS=0')
  await observer.query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  const bootstrap=join(root,'supabase/bootstrap')
  for (const file of [join(bootstrap,'001_domain.sql'),join(bootstrap,'002_identity_helpers.sql'),
    ...readdirSync(join(bootstrap,'steps')).sort().map(file=>join(bootstrap,'steps',file)),join(bootstrap,'900_final_security.sql'),
    join(root,'supabase/pilot-fiscal/001_fiscal_journal.sql'),join(root,'supabase/pilot-fiscal/002_fiscal_reservations.sql')]) {
    await observer.query(readFileSync(file,'utf8'))
  }
  async function fixture() {
    const f={kid:randomUUID(),auth:randomUUID(),owner:randomUUID(),sale:randomUUID()}
    await observer.query('INSERT INTO auth.users VALUES($1)',[f.auth])
    await observer.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Fiscal sintético local')",[f.kid])
    await observer.query("INSERT INTO usuarios(id,auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,$3,'Dueño sintético','DUEÑO')",[f.owner,f.auth,f.kid])
    await observer.query('INSERT INTO ventas(id,kiosco_id,usuario_id,total) VALUES($1,$2,$3,123.45)',[f.sale,f.kid,f.owner])
    return f
  }
  const a=await connect(),b=await connect()
  const f=await fixture()
  await start(a,'authenticated',f.auth); const first=await prepare(a,f)
  await start(b,'authenticated',f.auth); const pendingPrepare=capture(prepare(b,f))
  await waitForLock(observer,b); await a.query('COMMIT')
  const repeated=await pendingPrepare; assert(!repeated.error); assert.equal(repeated.value.id,first.id)
  await b.query('COMMIT'); cases.push('dos_UUID_misma_venta_una_operacion')

  const foreign=await fixture()
  await start(b,'authenticated',foreign.auth); const other=await prepare(b,foreign); await b.query('COMMIT')
  await start(a); assert.equal((await reserve(a,first.id)).numero,42)
  await start(b); const pendingReserve=capture(reserve(b,other.id))
  await waitForLock(observer,b); await a.query('COMMIT')
  const collision=await pendingReserve; assert.equal(collision.error?.code,'55000'); await b.query('ROLLBACK')
  cases.push('dos_comercios_misma_serie_una_reserva')

  const id=randomUUID()
  await start(a); assert.equal((await attempt(a,first.id,id)).nuevo_intento,true)
  await start(b); const pendingAttempt=capture(attempt(b,first.id,randomUUID()))
  await waitForLock(observer,b); await a.query('COMMIT')
  const competing=await pendingAttempt; assert.equal(competing.error?.code,'55000'); await b.query('ROLLBACK')
  await start(b); assert.equal((await attempt(b,first.id,id)).nuevo_intento,false); await b.query('COMMIT')
  cases.push('dos_trabajadores_un_intento_ACK_perdido_sin_reenvio')

  const annul=async(client,fixture)=>client.query("SELECT anular_venta_atomica($1,'Anulación sintética local',NULL)",[fixture.sale])
  async function seedCheckout(fixture) {
    await observer.query(`INSERT INTO checkout_manuales(id,kiosco_id,venta_id,solicitud,resultado)
      VALUES($1,$2,$3,'{"total":123.45,"detalles":[],"pagos":[]}', '{}')`,[randomUUID(),fixture.kid,fixture.sale])
  }
  const cancelAfter=await fixture(); await seedCheckout(cancelAfter)
  await start(a,'authenticated',cancelAfter.auth); const opAfter=await prepare(a,cancelAfter,randomUUID(),3); await a.query('COMMIT')
  await start(a); await reserve(a,opAfter.id,3)
  await start(b,'authenticated',cancelAfter.auth); const pendingAnnul=capture(annul(b,cancelAfter))
  await waitForLock(observer,b); await a.query('COMMIT')
  const blockedAnnul=await pendingAnnul; assert.equal(blockedAnnul.error?.code,'55000'); await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM ventas WHERE id=$1',[cancelAfter.sale])).rows[0].estado,'COMPLETADA')
  assert.equal((await observer.query('SELECT count(*)::int n FROM anulaciones_venta_atomicas WHERE venta_id=$1',[cancelAfter.sale])).rows[0].n,0)
  cases.push('reserva_antes_anulacion_rechazo_sin_efectos')

  const cancelBefore=await fixture(); await seedCheckout(cancelBefore)
  await start(a,'authenticated',cancelBefore.auth); const opBefore=await prepare(a,cancelBefore,randomUUID(),4); await a.query('COMMIT')
  await start(a,'authenticated',cancelBefore.auth); await annul(a,cancelBefore)
  await start(b); const pendingAfterCancel=capture(reserve(b,opBefore.id,4))
  await waitForLock(observer,b); await a.query('COMMIT')
  const rejected=await pendingAfterCancel; assert.equal(rejected.error?.code,'22023'); await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[opBefore.id])).rows[0].n,0)
  cases.push('anulacion_antes_reserva_sin_numeracion')

  const crashed=await fixture()
  await start(a,'authenticated',crashed.auth); const opCrash=await prepare(a,crashed,randomUUID(),5); await a.query('COMMIT')
  await start(a); assert.equal((await reserve(a,opCrash.id,5)).numero,42); await a.query('ROLLBACK')
  await start(b); assert.equal((await reserve(b,opCrash.id,5)).numero,42); await b.query('COMMIT')
  cases.push('rollback_antes_ACK_sin_hueco_de_numeracion')
  const version=(await observer.query('SHOW server_version')).rows[0].server_version
  assert.equal(transportErrors.length,0,'No aceptar un ensayo con conexiones perdidas.')
  evidence={status:'PASS',environment:'PostgreSQL local sintético; no JWT hospedado ni ARCA',
    testedAt:new Date().toISOString(),postgresVersion:version,image,containerId,containerName:name,port,
    cases,caseCount:cases.length,externalRequests:0,invoicesIssued:0}
} catch(error) {
  console.error('FISCAL_CONCURRENCY=FAIL; CODE='+(error?.code??error?.name??'UNKNOWN')+'; STEP='+cases.length+'; DETAIL='+error.message)
  evidence={status:'FAIL',testedAt:new Date().toISOString(),containerId,containerName:name,port,cases,code:error?.code??error?.name??'UNKNOWN'}
  process.exitCode=1
} finally {
  // Liberar transacciones antes de cerrar conexiones, incluyendo carreras fallidas.
  await Promise.allSettled(clients.map(async client=>{ await client.query('ROLLBACK').catch(()=>{}); await client.end() }))
  if (created) {
    try {
      const owned=docker(['inspect',name,'--format','{{index .Config.Labels "kioskopos.fiscal.test"}}'])
      if (owned!=='pr03-local' || !name.startsWith('kiosko-pr03-local-')) throw new Error('Contenedor no verificado; no detener.')
      docker(['stop','--time','5',name])
      if (evidence) evidence.cleanup='contenedor detenido; datos locales conservados'
      console.log('OWNED_CONTAINER=STOPPED; EXISTING_CONTAINERS=UNCHANGED')
    } catch(error) {
      if (evidence) { evidence.cleanup='NO_CONFIRMADO: comprobar Docker y contenedor registrado'; evidence.status='FAIL' }
      process.exitCode=1
      console.error('OWNED_CONTAINER_STOP=NOT_CONFIRMED; CODE='+(error.code??error.name??'UNKNOWN'))
    }
  }
}

if (evidence) {
  if (evidencePath) writeFileSync(evidencePath,JSON.stringify(evidence,null,2)+'\n')
  console.log(JSON.stringify(evidence))
}
