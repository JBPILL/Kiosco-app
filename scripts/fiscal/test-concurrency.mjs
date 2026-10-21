// Ensayo PostgreSQL real y sintético. No lee .env ni accede a Supabase/ARCA.
// Requiere Docker iniciado e imagen postgres:17-alpine ya instalada (sin pull).
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
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
const reserve = async(client,op,point=2,last=41)=>{
  // Mismo cuerpo durable para los reintentos; ninguna credencial ni red fiscal.
  const body=JSON.stringify({version:1,entorno:'HOMOLOGACION',cuitEmisor:issuer,puntoVenta:point,tipoComprobante:11,numero:last+1,
    concepto:1,tipoDocumento:99,numeroDocumento:'0',condicionIvaReceptor:5,fecha:'20261021',servicioDesde:null,
    servicioHasta:null,vencimientoPago:null,moneda:'PES',cotizacion:'1',
    importes:{total:'123.45',neto:'123.45',iva:'0.00',noGravado:'0.00',exento:'0.00',tributos:'0.00'},iva:[],tributos:[]})
  const hash=createHash('sha256').update(body).digest('hex')
  const r=await client.query('SELECT persistir_solicitud_fiscal_homologacion($1,$2,$3,$4,clock_timestamp()) ack',[op,body,hash,last])
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
    join(root,'supabase/pilot-fiscal/001_fiscal_journal.sql'),join(root,'supabase/pilot-fiscal/002_fiscal_reservations.sql'),
    join(root,'supabase/pilot-fiscal/003_fiscal_requests.sql'),join(root,'supabase/pilot-fiscal/004_fiscal_reconciliation.sql'),
    join(root,'supabase/pilot-fiscal/005_fiscal_worker_authorization.sql'),join(root,'supabase/pilot-fiscal/006_fiscal_shared_tickets.sql'),join(root,'supabase/pilot-fiscal/007_fiscal_ticket_recovery.sql'),join(root,'supabase/pilot-fiscal/008_fiscal_ticket_ownership.sql'),join(root,'supabase/pilot-fiscal/009_fiscal_emission_permission.sql')]) {
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
  await start(b)
  const recovered=await reserve(b,first.id)
  assert.equal(recovered.estado,'ENVIO_INCIERTO'); assert.match(recovered.solicitud_sha256,/^[0-9a-f]{64}$/)
  await b.query('COMMIT')
  cases.push('dos_trabajadores_cuerpo_durable_un_intento_ACK_perdido_sin_reenvio')

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
  const close=async(client,operation,intent,sha,cae='11111111111111')=>{
    const decision={estado:'AUTORIZACION_COINCIDENTE',cae,vencimiento:'20261031',procesadoEn:'20261021120000',solicitudSha256:sha,puedeReenviar:false}
    return (await client.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb) ack',
      [randomUUID(),operation,intent,sha,JSON.stringify(decision)])).rows[0].ack
  }
  await start(a); const closed=await close(a,first.id,id,recovered.solicitud_sha256)
  await start(b); const pendingClose=capture(close(b,first.id,id,recovered.solicitud_sha256))
  await waitForLock(observer,b); await a.query('COMMIT')
  const closing=await pendingClose; assert(!closing.error); assert.deepEqual(closing.value,closed); await b.query('COMMIT')
  assert.equal((await observer.query('SELECT ultimo_observado FROM fiscal_series_homologacion WHERE punto_venta=2')).rows[0].ultimo_observado,42)
  cases.push('dos_conciliadores_un_CAE_un_avance')
  await start(b); const contradiction=await capture(close(b,first.id,id,recovered.solicitud_sha256,'22222222222222'))
  assert.equal(contradiction.error?.code,'22023'); await b.query('ROLLBACK')
  cases.push('CAE_contradictorio_rechazado_sin_downgrade')
  await start(a); const next=await reserve(a,other.id,2,42); const nextIntent=randomUUID()
  await attempt(a,other.id,nextIntent); await a.query('COMMIT')
  const third=await fixture()
  await start(b,'authenticated',third.auth); const thirdOp=await prepare(b,third); await b.query('COMMIT')
  await start(a); await close(a,other.id,nextIntent,next.solicitud_sha256)
  await start(b); const pendingNext=capture(reserve(b,thirdOp.id,2,43))
  await waitForLock(observer,b); await a.query('COMMIT')
  const afterClose=await pendingNext; assert(!afterClose.error); assert.equal(afterClose.value.numero,44); await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE punto_venta=2')).rows[0].n,3)
  cases.push('cierre_antes_siguiente_reserva_sin_perder_historia')
  await start(a)
  const unprovisioned=await capture(a.query('SELECT autorizar_consulta_fiscal_homologacion($1,$2)',[f.auth,first.id]))
  assert.equal(unprovisioned.error?.code,'42501');await a.query('ROLLBACK')
  await observer.query(`INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado)
    VALUES($1,$2,2,$3,$4,true)`,[f.kid,issuer,randomUUID(),'a'.repeat(64)])
  await start(a)
  const permitted=await a.query('SELECT autorizar_consulta_fiscal_homologacion($1,$2) ack',[f.auth,first.id])
  assert.equal(permitted.rows[0].ack.kiosco_id,f.kid);await a.query('COMMIT')
  await start(b)
  const crossActor=await capture(b.query('SELECT autorizar_consulta_fiscal_homologacion($1,$2)',[foreign.auth,first.id]))
  assert.equal(crossActor.error?.code,'42501');await b.query('ROLLBACK')
  cases.push('gate_emisor_privado_y_actor_ajeno_rechazado')
  const credentialA=permitted.rows[0].ack.credencial_id,credentialB=randomUUID(),fingerprint='a'.repeat(64)
  await observer.query(`INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado)
    VALUES($1,$2,2,$3,$4,true)`,[foreign.kid,issuer,credentialB,fingerprint])
  const acquire=async(client,operation,credential,attemptId)=>
    (await client.query('SELECT solicitar_ta_homologacion($1,$2,$3,1,$4) ack',[operation,credential,fingerprint,attemptId])).rows[0].ack
  const taAttempt=randomUUID()
  await start(a);const taLease=await acquire(a,first.id,credentialA,taAttempt)
  assert.equal(taLease.nuevo_intento,true)
  await start(b);const pendingTa=capture(acquire(b,other.id,credentialB,randomUUID()))
  await waitForLock(observer,b);await a.query('COMMIT')
  const taBlocked=await pendingTa;assert(!taBlocked.error);assert.equal(taBlocked.value.estado,'RENOVACION_PENDIENTE')
  assert.equal(taBlocked.value.nuevo_intento,false);await b.query('COMMIT')
  cases.push('dos_comercios_mismo_certificado_una_renovacion_TA')
  // Sobre opaco sintético: comprueba CAS SQL; cifrado/descifrado real se prueba
  // por separado. Este fixture jamás representa un TA de ARCA.
  const cipher={version:1,keyId:randomUUID(),nonce:'0'.repeat(24),ciphertext:'0'.repeat(32),expiresAt:Date.now()+120000}
  await start(a)
  await a.query('SELECT iniciar_envio_ta_homologacion($1,$2,$3,1,$4,$5)',[first.id,credentialA,fingerprint,taAttempt,taLease.revision])
  await a.query('SELECT confirmar_ta_homologacion($1,$2,$3,1,$4,$5,$6::jsonb)',[first.id,credentialA,fingerprint,taAttempt,taLease.revision,JSON.stringify(cipher)])
  await start(b);const pendingRead=capture(acquire(b,other.id,credentialB,randomUUID()))
  await waitForLock(observer,b);await a.query('COMMIT')
  const shared=await pendingRead;assert(!shared.error);assert.equal(shared.value.estado,'DISPONIBLE')
  assert.equal(shared.value.nuevo_intento,false);assert.deepEqual(shared.value.cifrado,cipher);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_ta_intentos_homologacion')).rows[0].n,1)
  cases.push('TA_confirmado_compartido_sin_nuevo_intento')
  // Una cancelación sólo gana antes de la intención durable; ambas operaciones
  // bloquean la misma fila global incluso desde comercios distintos.
  async function recoveryBinding(huella,revision){
    await observer.query('UPDATE fiscal_emisores_homologacion SET certificado_sha256=$1,revision=$2 WHERE kiosco_id=ANY($3::uuid[])',[huella,revision,[f.kid,foreign.kid]])
    const call=async(client,fn,operation,credential,id,generation)=>{
      const base=[operation,credential,huella,revision,id]
      if(generation!==undefined)base.push(generation)
      return (await client.query(`SELECT ${fn}(${base.map((_,i)=>'$'+(i+1)).join(',')}) ack`,base)).rows[0].ack
    }
    return call
  }
  let callTa=await recoveryBinding('c'.repeat(64),2),raceId=randomUUID()
  await start(a);let lease=await callTa(a,'solicitar_ta_homologacion',first.id,credentialA,raceId);await a.query('COMMIT')
  await start(b);const hidden=(await b.query('SELECT consultar_preparacion_ta_homologacion($1,$2,$3,2) ack',[other.id,credentialB,'c'.repeat(64)])).rows[0].ack;assert.deepEqual(hidden,{estado:'COMPARTIDA',intento_id:null,revision:0});await b.query('COMMIT')
  for(const fn of ['cancelar_preparacion_ta_homologacion','iniciar_envio_ta_homologacion']){
    await start(b);const deniedForeign=await capture(callTa(b,fn,other.id,credentialB,raceId,lease.revision));assert.equal(deniedForeign.error?.code,'42501');await b.query('ROLLBACK')
  }
  cases.push('TA_origen_ajeno_no_expuesto_ni_cancelable')
  await start(a);const send=await callTa(a,'iniciar_envio_ta_homologacion',first.id,credentialA,raceId,lease.revision)
  assert.equal(send.nuevo_envio,true)
  await start(b);let competingTa=capture(callTa(b,'cancelar_preparacion_ta_homologacion',first.id,credentialA,raceId,lease.revision))
  await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await competingTa).error?.code,'40001');await b.query('ROLLBACK')
  cases.push('TA_envio_gana_cancelacion_no_libera_incertidumbre')
  callTa=await recoveryBinding('d'.repeat(64),3);raceId=randomUUID()
  await start(a);lease=await callTa(a,'solicitar_ta_homologacion',first.id,credentialA,raceId);await a.query('COMMIT')
  await start(a);const cancelled=await callTa(a,'cancelar_preparacion_ta_homologacion',first.id,credentialA,raceId,lease.revision)
  await start(b);competingTa=capture(callTa(b,'iniciar_envio_ta_homologacion',first.id,credentialA,raceId,lease.revision))
  await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await competingTa).error?.code,'40001');await b.query('ROLLBACK')
  const newId=randomUUID()
  await start(a);const nextTa=await callTa(a,'solicitar_ta_homologacion',first.id,credentialA,newId);await a.query('COMMIT')
  assert.equal(nextTa.revision,2)
  await start(b);assert.deepEqual(await callTa(b,'cancelar_preparacion_ta_homologacion',first.id,credentialA,raceId,lease.revision),cancelled);await b.query('COMMIT')
  const audit=(await observer.query('SELECT cancelado_en,envio_iniciado_en FROM fiscal_ta_intentos_homologacion WHERE id=$1',[raceId])).rows[0]
  assert(audit.cancelado_en);assert.equal(audit.envio_iniciado_en,null)
  cases.push('TA_cancelacion_gana_envio_obsoleto_rechazado_historial_conservado')
  await start(a);assert.equal((await callTa(a,'iniciar_envio_ta_homologacion',first.id,credentialA,newId,nextTa.revision)).nuevo_envio,true)
  await start(b);competingTa=capture(callTa(b,'iniciar_envio_ta_homologacion',first.id,credentialA,newId,nextTa.revision))
  await waitForLock(observer,b);await a.query('COMMIT')
  const secondSend=await competingTa;assert(!secondSend.error);assert.equal(secondSend.value.nuevo_envio,false);await b.query('COMMIT')
  cases.push('TA_dos_trabajadores_solo_un_permiso_de_envio')
  async function emissionFixture(point,last){
    const e=await fixture(),cred=randomUUID(),grant=randomUUID()
    await start(a,'authenticated',e.auth);const operation=await prepare(a,e,randomUUID(),point);await a.query('COMMIT')
    await observer.query(`INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado)
      VALUES($1,$2,$3,$4,$5,true)`,[e.kid,issuer,point,cred,'e'.repeat(64)])
    await start(a);const body=await reserve(a,operation.id,point,last);await a.query('COMMIT')
    await observer.query(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,vence_en)
      VALUES($1,$2,$3,$4,$5,1,true,clock_timestamp()+interval '30 minutes')`,[operation.id,grant,body.solicitud_sha256,cred,'e'.repeat(64)])
    return {op:operation.id,hash:body.solicitud_sha256,grant,last}
  }
  // Series sintéticas independientes: los escenarios previos conservan su pendiente.
  const e=await emissionFixture(81,41),sendId=randomUUID()
  const markEmission=async(client,entry,id)=>(await client.query('SELECT registrar_envio_fiscal_homologacion($1,$2,$3,$4,$5,clock_timestamp()) ack',[entry.op,id,entry.hash,entry.grant,entry.last])).rows[0].ack
  await start(a);const firstGrant=await markEmission(a,e,sendId);assert.equal(firstGrant.emision_habilitada,true)
  await start(b);const duplicateGrant=capture(markEmission(b,e,sendId));await waitForLock(observer,b);await a.query('COMMIT')
  const recoveredGrant=await duplicateGrant;assert(!recoveredGrant.error);assert.equal(recoveredGrant.value.nuevo_intento,false);assert.equal(recoveredGrant.value.emision_habilitada,false);await b.query('COMMIT')
  cases.push('dos_workers_un_permiso_emision_hash_exacto_ACK_repetido_no_envia')
  const revoked=await emissionFixture(82,41)
  await start(a);assert.equal((await a.query('SELECT cargar_preparacion_envio_homologacion($1) ctx',[revoked.op])).rows[0].ctx.permiso,revoked.grant);await a.query('COMMIT')
  await observer.query('UPDATE fiscal_permisos_emision_homologacion SET habilitado=false WHERE operacion_id=$1',[revoked.op])
  await start(b);const refused=await capture(markEmission(b,revoked,randomUUID()));assert.equal(refused.error?.code,'42501');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[revoked.op])).rows[0].estado,'RESERVADA')
  assert.equal((await observer.query('SELECT usado_por_intento FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[revoked.op])).rows[0].usado_por_intento,null)
  cases.push('revocar_permiso_antes_intencion_no_modifica_reserva')
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
