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
let requiredPresentationInstalledAfterCase=null
let creditDraftInstalledAfterCase=null
let creditRecoveryInstalledAfterCase=null
let creditCommercialInstalledAfterCase=null
let checkoutUnitsInstalledAfterCase=null
let creditBindingInstalledAfterCase=null
let creditContextInstalledAfterCase=null
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
    join(root,'supabase/pilot-fiscal/005_fiscal_worker_authorization.sql'),join(root,'supabase/pilot-fiscal/006_fiscal_shared_tickets.sql'),join(root,'supabase/pilot-fiscal/007_fiscal_ticket_recovery.sql'),join(root,'supabase/pilot-fiscal/008_fiscal_ticket_ownership.sql'),join(root,'supabase/pilot-fiscal/009_fiscal_emission_permission.sql'),join(root,'supabase/pilot-fiscal/010_fiscal_return_exclusion.sql'),join(root,'supabase/pilot-fiscal/011_fiscal_owner_review.sql'),join(root,'supabase/pilot-fiscal/012_fiscal_preparation.sql'),join(root,'supabase/pilot-fiscal/013_fiscal_preparation_source.sql'),join(root,'supabase/pilot-fiscal/014_fiscal_receipt.sql'),join(root,'supabase/pilot-fiscal/015_fiscal_emission_receipts.sql'),join(root,'supabase/pilot-fiscal/016_fiscal_diagnosis.sql'),join(root,'supabase/pilot-fiscal/017_fiscal_preparation_cancellation.sql'),join(root,'supabase/pilot-fiscal/018_fiscal_reserved_replacement.sql'),join(root,'supabase/pilot-fiscal/019_fiscal_rejected_correction.sql'),join(root,'supabase/pilot-fiscal/020_fiscal_reconciliation_actor.sql'),join(root,'supabase/pilot-fiscal/021_fiscal_observation_receipt.sql'),join(root,'supabase/pilot-fiscal/022_fiscal_presentation_facts.sql'),join(root,'supabase/pilot-fiscal/023_fiscal_presentation_review.sql'),join(root,'supabase/pilot-fiscal/024_fiscal_presentation_source.sql')]) {
    await observer.query(readFileSync(file,'utf8'))
    if(file.endsWith('011_fiscal_owner_review.sql')){
      await observer.query('SELECT fiscal_exigir_actor_preparacion($1,$2)',[randomUUID(),randomUUID()])
      cases.push('SQL011_antes_SQL012_sin_dependencia_de_tabla_opcional')
    }
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
  async function emissionFixture(point,last,reviewed=true){
    const e=await fixture(),cred=randomUUID(),grant=randomUUID(),reviewId=randomUUID()
    await start(a,'authenticated',e.auth);const operation=await prepare(a,e,randomUUID(),point);await a.query('COMMIT')
    await observer.query(`INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado)
      VALUES($1,$2,$3,$4,$5,true)`,[e.kid,issuer,point,cred,'e'.repeat(64)])
    await start(a);const body=await reserve(a,operation.id,point,last);await a.query('COMMIT')
    if(reviewed){await start(a);await a.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[operation.id,e.auth,reviewId,body.solicitud_sha256]);await a.query('COMMIT')}
    await observer.query(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,vence_en)
      VALUES($1,$2,$3,$4,$5,1,true,clock_timestamp()+interval '30 minutes')`,[operation.id,grant,body.solicitud_sha256,cred,'e'.repeat(64)])
    return {op:operation.id,hash:body.solicitud_sha256,grant,last,reviewId,owner:e.owner,auth:e.auth,credential:cred}
  }
  // Series sintéticas independientes: los escenarios previos conservan su pendiente.
  const e=await emissionFixture(81,41),sendId=randomUUID()
  const markEmission=async(client,entry,id)=>(await client.query('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,$6,clock_timestamp()) ack',[entry.auth,entry.op,id,entry.hash,entry.grant,entry.last])).rows[0].ack
  await start(a);const firstGrant=await markEmission(a,e,sendId);assert.equal(firstGrant.emision_habilitada,true)
  await start(b);const duplicateGrant=capture(markEmission(b,e,sendId));await waitForLock(observer,b);await a.query('COMMIT')
  const recoveredGrant=await duplicateGrant;assert(!recoveredGrant.error);assert.equal(recoveredGrant.value.nuevo_intento,false);assert.equal(recoveredGrant.value.emision_habilitada,false);await b.query('COMMIT')
  cases.push('dos_workers_un_permiso_emision_hash_exacto_ACK_repetido_no_envia')
  const receivedRejection={estado:'RECHAZO_RECIBIDO',codigos:[10017],puedeReenviar:false}
  const writeReceipt=async(client,entry,id,response)=>(await client.query('SELECT registrar_respuesta_emision_homologacion($1,$2,$3,$4,$5::jsonb) data',[entry.auth,entry.op,id,entry.hash,JSON.stringify(response)])).rows[0].data
  await start(a);const firstReceipt=await writeReceipt(a,e,sendId,receivedRejection)
  await start(b);const duplicateReceipt=capture(writeReceipt(b,e,sendId,receivedRejection))
  await waitForLock(observer,b);await a.query('COMMIT');const secondReceipt=await duplicateReceipt;assert(!secondReceipt.error)
  assert.deepEqual(secondReceipt.value,firstReceipt);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_respuestas_emision_homologacion WHERE operacion_id=$1',[e.op])).rows[0].n,1)
  cases.push('dos_workers_recepcion_un_registro_ACK_perdido_conserva_identidad')
  await start(a);await writeReceipt(a,e,sendId,receivedRejection)
  await start(b);const conflictingReceipt=capture(writeReceipt(b,e,sendId,{...receivedRejection,estado:'APROBACION_RECIBIDA'}))
  await waitForLock(observer,b);await a.query('COMMIT');assert.equal((await conflictingReceipt).error?.code,'22023');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[e.op])).rows[0].estado,'ENVIO_INCIERTO')
  assert.deepEqual((await observer.query('SELECT respuesta FROM fiscal_respuestas_emision_homologacion WHERE operacion_id=$1',[e.op])).rows[0].respuesta,receivedRejection)
  cases.push('recepcion_contradictoria_tras_espera_no_sobrescribe_ni_libera_reserva')
  const revoked=await emissionFixture(82,41)
  await start(a);assert.equal((await a.query('SELECT cargar_preparacion_envio_homologacion($1) ctx',[revoked.op])).rows[0].ctx.permiso,revoked.grant);await a.query('COMMIT')
  await observer.query('UPDATE fiscal_permisos_emision_homologacion SET habilitado=false WHERE operacion_id=$1',[revoked.op])
  await start(b);const refused=await capture(markEmission(b,revoked,randomUUID()));assert.equal(refused.error?.code,'42501');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[revoked.op])).rows[0].estado,'RESERVADA')
  assert.equal((await observer.query('SELECT usado_por_intento FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[revoked.op])).rows[0].usado_por_intento,null)
  cases.push('revocar_permiso_antes_intencion_no_modifica_reserva')
  // Ambos órdenes reales, con espera de lock observada (no sleeps inferidos).
  const beforeReturn=await fixture()
  await start(a,'authenticated',beforeReturn.auth);const fiscalFirst=await prepare(a,beforeReturn,randomUUID(),83);await a.query('COMMIT')
  await start(a);await reserve(a,fiscalFirst.id,83,0)
  await b.query('BEGIN')
  await b.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[beforeReturn.auth])
  const blockedReturn=capture(b.query('INSERT INTO devoluciones_venta(venta_id,kiosco_id) VALUES($1,$2)',[beforeReturn.sale,beforeReturn.kid]))
  await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await blockedReturn).error?.code,'55000');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM devoluciones_venta WHERE venta_id=$1',[beforeReturn.sale])).rows[0].n,0)
  cases.push('reserva_antes_devolucion_bloquea_registro_heredado')
  const afterReturn=await fixture()
  await start(a,'authenticated',afterReturn.auth);const returnFirst=await prepare(a,afterReturn,randomUUID(),84);await a.query('COMMIT')
  await a.query('BEGIN');await a.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[afterReturn.auth])
  await a.query('INSERT INTO devoluciones_venta(venta_id,kiosco_id) VALUES($1,$2)',[afterReturn.sale,afterReturn.kid])
  await start(b);const blockedFiscal=capture(reserve(b,returnFirst.id,84,0))
  await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await blockedFiscal).error?.code,'55000');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[returnFirst.id])).rows[0].n,0)
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_series_homologacion WHERE punto_venta=84')).rows[0].n,0)
  cases.push('devolucion_antes_reserva_bloquea_total_original_sin_numero')
  const unreviewed=await emissionFixture(85,41,false)
  await start(a);const noReview=await capture(markEmission(a,unreviewed,randomUUID()));assert.equal(noReview.error?.code,'42501');await a.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[unreviewed.op])).rows[0].estado,'RESERVADA')
  assert.equal((await observer.query('SELECT usado_por_intento FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[unreviewed.op])).rows[0].usado_por_intento,null)
  cases.push('permiso_privado_sin_revision_no_consume_ni_crea_intencion')
  const reviewed=await emissionFixture(86,41)
  const reviewAgain=async client=>(await client.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1) ack',[reviewed.op,reviewed.auth,reviewed.reviewId,reviewed.hash])).rows[0].ack
  await start(a);const originalReview=await reviewAgain(a)
  await start(b);const duplicateReview=capture(reviewAgain(b));await waitForLock(observer,b);await a.query('COMMIT')
  const replayReview=await duplicateReview;assert(!replayReview.error);assert.deepEqual(replayReview.value,originalReview);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_revisiones_homologacion WHERE operacion_id=$1',[reviewed.op])).rows[0].n,1)
  cases.push('dos_workers_misma_revision_un_ACK_sin_extender_vigencia')
  // Un lock de auditoría no debe extender la vigencia mientras el envío espera.
  for(const kind of ['revision','permiso']){
    const late=await emissionFixture(kind==='revision'?87:88,41,kind!=='revision')
    if(kind==='revision')await observer.query(`WITH instante AS MATERIALIZED (SELECT clock_timestamp() t)
      INSERT INTO fiscal_revisiones_homologacion(id,operacion_id,usuario_id,actor_auth_id,solicitud_sha256,solicitud_revision,credencial_id,certificado_sha256,emisor_revision,creado_en,vence_en)
      SELECT $1,$2,$3,$4,$5,1,$6,$7,1,t-interval '9 minutes 57 seconds',t+interval '3 seconds' FROM instante`,[late.reviewId,late.op,late.owner,late.auth,late.hash,late.credential,'e'.repeat(64)])
    else await observer.query("UPDATE fiscal_permisos_emision_homologacion SET vence_en=clock_timestamp()+interval '3 seconds' WHERE operacion_id=$1",[late.op])
    await a.query('BEGIN');await a.query('SELECT id FROM fiscal_revisiones_homologacion WHERE id=$1 FOR UPDATE',[late.reviewId])
    await start(b);const blockedExpiry=capture(markEmission(b,late,randomUUID()));await waitForLock(observer,b)
    const expiryTable=kind==='revision'?'fiscal_revisiones_homologacion':'fiscal_permisos_emision_homologacion'
    const expiryDeadline=Date.now()+7000;let expired=false
    while(Date.now()<expiryDeadline){expired=(await observer.query(`SELECT vence_en<=clock_timestamp() expired FROM ${expiryTable} WHERE operacion_id=$1`,[late.op])).rows[0].expired;if(expired)break;await delay(40)}
    assert(expired,'No se confirmó el vencimiento en PostgreSQL.');await a.query('COMMIT')
    assert.equal((await blockedExpiry).error?.code,'42501');await b.query('ROLLBACK')
    assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[late.op])).rows[0].estado,'RESERVADA')
    assert.equal((await observer.query('SELECT usado_por_intento FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[late.op])).rows[0].usado_por_intento,null)
    cases.push(kind+'_vence_esperando_lock_no_consume_ni_envia')
  }
  await observer.query(`INSERT INTO fiscal_parametros_homologacion(revision,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado)
    VALUES(1,'[{"id":5,"descripcion":"Ensayo","comprobantes":[11]}]','[]',repeat('b',64),clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true)`)
  async function preparationFixture(point,revision=1,quantity=1) {
    const f=await fixture(),product=randomUUID(),operation=randomUUID()
    await observer.query("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta) VALUES($1,$2,'Ensayo',123.45)",[product,f.kid])
    await observer.query('INSERT INTO detalles_venta(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,$3,123.45/$3,123.45)',[f.sale,product,quantity])
    await observer.query('INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado) VALUES($1,$2,$3,$4,$5,true)',[f.kid,issuer,point,randomUUID(),'c'.repeat(64)])
    const datos={version:1,entorno:'HOMOLOGACION',cuitEmisor:issuer,puntoVenta:point,tipoComprobante:11,concepto:1,tipoDocumento:99,numeroDocumento:'0',condicionIvaReceptor:5,
      fecha:'20261021',servicioDesde:null,servicioHasta:null,vencimientoPago:null,moneda:'PES',cotizacion:'1',importes:{total:'123.45',neto:'123.45',iva:'0.00',noGravado:'0.00',exento:'0.00',tributos:'0.00'},iva:[],tributos:[]}
    const canonical=JSON.stringify({version:1,venta_id:f.sale,condicionEmisor:'MONOTRIBUTO',revision_parametros:revision,datos})
    return {...f,operation,canonical,hash:createHash('sha256').update(canonical).digest('hex')}
  }
  const savePreparation=async(client,f)=>(await client.query('SELECT guardar_datos_preparacion_homologacion($1,$2,$3,$4,$5) ack',[f.auth,f.sale,f.operation,f.canonical,f.hash])).rows[0].ack
  const samePreparation=await preparationFixture(90)
  await start(a);const firstPreparation=await savePreparation(a,samePreparation)
  await start(b);const duplicatePreparation=capture(savePreparation(b,samePreparation))
  await waitForLock(observer,b);await a.query('COMMIT')
  const secondPreparation=await duplicatePreparation;assert(!secondPreparation.error);assert.deepEqual(secondPreparation.value,firstPreparation);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_preparaciones_homologacion WHERE operacion_id=$1',[samePreparation.operation])).rows[0].n,1)
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[samePreparation.operation])).rows[0].n,0)
  cases.push('dos_workers_preparacion_explicita_un_ACK_sin_reserva')
  const cancelPreparation=async(client,f)=>(await client.query('SELECT cancelar_preparacion_fiscal_homologacion($1,$2,$3) ack',[f.auth,f.sale,f.operation])).rows[0].ack
  const persistPrepared=async(client,f)=>{
    const body=JSON.stringify({...JSON.parse(f.canonical).datos,numero:1}),hash=createHash('sha256').update(body).digest('hex')
    return client.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[f.auth,f.operation,body,hash])
  }
  const cancelBeforeSave=await preparationFixture(101)
  await start(a);await cancelPreparation(a,cancelBeforeSave)
  await start(b);const lateSave=capture(savePreparation(b,cancelBeforeSave));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await lateSave).error?.code,'55000');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_operaciones_homologacion WHERE id=$1',[cancelBeforeSave.operation])).rows[0].n,0)
  cases.push('cancelacion_antes_guardado_tardio_no_crea_operacion')
  const saveBeforeCancel=await preparationFixture(102)
  await start(a);await savePreparation(a,saveBeforeCancel)
  await start(b);const cancelAfterSave=capture(cancelPreparation(b,saveBeforeCancel));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await cancelAfterSave).value?.estado,'CANCELADA');await b.query('COMMIT')
  const correctedPreparation={...saveBeforeCancel,operation:randomUUID()};await start(a);await savePreparation(a,correctedPreparation);await a.query('COMMIT')
  assert.equal((await observer.query("SELECT count(*)::int n FROM fiscal_operaciones_homologacion WHERE venta_id=$1 AND estado='PREPARADA'",[saveBeforeCancel.sale])).rows[0].n,1)
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_operaciones_homologacion WHERE venta_id=$1',[saveBeforeCancel.sale])).rows[0].n,2)
  cases.push('guardado_antes_cancelacion_preserva_hechos_y_admite_identidad_corregida')
  const cancelBeforeNumber=await preparationFixture(103)
  await start(a);await savePreparation(a,cancelBeforeNumber);await a.query('COMMIT')
  await start(a);await cancelPreparation(a,cancelBeforeNumber)
  await start(b);const lateNumber=capture(persistPrepared(b,cancelBeforeNumber));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await lateNumber).error?.code,'22023');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[cancelBeforeNumber.operation])).rows[0].n,0)
  cases.push('cancelacion_antes_reserva_impide_cuerpo_numero_del_worker_tardio')
  const numberBeforeCancel=await preparationFixture(104)
  await start(a);await savePreparation(a,numberBeforeCancel);await a.query('COMMIT')
  await start(a);await persistPrepared(a,numberBeforeCancel)
  await start(b);const lateCancel=capture(cancelPreparation(b,numberBeforeCancel));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await lateCancel).error?.code,'55000');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=$1',[numberBeforeCancel.operation])).rows[0].n,0)
  cases.push('reserva_antes_cancelacion_no_libera_numero_ni_deja_cancelacion')
  const globalCancel=await preparationFixture(105),otherSale={...await preparationFixture(106),operation:globalCancel.operation}
  await start(a);await cancelPreparation(a,globalCancel)
  await start(b);const foreignLateSave=capture(savePreparation(b,otherSale));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await foreignLateSave).error?.code,'55000');await b.query('ROLLBACK')
  cases.push('UUID_global_cancelado_impide_guardado_concurrente_en_otra_venta')
  const globalOtherCancel=await preparationFixture(107),winningSale={...await preparationFixture(108),operation:globalOtherCancel.operation}
  await start(a);await savePreparation(a,winningSale)
  await start(b);const foreignLateCancel=capture(cancelPreparation(b,globalOtherCancel));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await foreignLateCancel).error?.code,'42501');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=$1',[globalOtherCancel.operation])).rows[0].n,0)
  cases.push('UUID_global_guardado_impide_cancelacion_concurrente_desde_otra_venta')
  const duplicateCancel=await preparationFixture(109)
  await start(a);const firstCancel=await cancelPreparation(a,duplicateCancel)
  await start(b);const pendingDuplicateCancel=capture(cancelPreparation(b,duplicateCancel));await waitForLock(observer,b);await a.query('COMMIT')
  const duplicateCancelResult=await pendingDuplicateCancel;assert(!duplicateCancelResult.error);assert.deepEqual(duplicateCancelResult.value,firstCancel);await b.query('COMMIT')
  cases.push('dos_cancelaciones_mismo_UUID_recuperan_ACK_identico_sin_borrar_historia')
  const resolvingPreparation=await preparationFixture(95)
  await start(a);await savePreparation(a,resolvingPreparation)
  await start(b);const waitingResolution=capture(b.query('SELECT resolver_preparacion_fiscal_homologacion($1,$2) ack',[resolvingPreparation.auth,resolvingPreparation.sale]))
  await waitForLock(observer,b);await a.query('COMMIT')
  const resolvedPreparation=await waitingResolution;assert(!resolvedPreparation.error)
  assert.equal(resolvedPreparation.value.rows[0].ack.estado,'DATOS_PREPARADOS');assert.equal(resolvedPreparation.value.rows[0].ack.operacion_id,resolvingPreparation.operation);await b.query('COMMIT')
  cases.push('resolver_espera_guardado_y_recupera_identidad_original')
  const replacementFixture=async(point)=>{
    const f=await preparationFixture(point)
    await start(a);await savePreparation(a,f);await persistPrepared(a,f);await a.query('COMMIT')
    const oldHash=(await observer.query('SELECT solicitud_sha256 FROM fiscal_solicitudes_homologacion WHERE operacion_id=$1',[f.operation])).rows[0].solicitud_sha256
    const data=JSON.parse(f.canonical);data.datos.fecha='20261023'
    const canonical=JSON.stringify(data),successor=randomUUID()
    const replace=async(client,candidate=successor,proposal=canonical)=>(await client.query('SELECT sustituir_reserva_fiscal_homologacion($1,$2,$3,$4,$5,$6,$7) ack',[f.auth,f.sale,f.operation,candidate,oldHash,proposal,createHash('sha256').update(proposal).digest('hex')])).rows[0].ack
    const permission=randomUUID()
    await observer.query(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,vence_en)
      SELECT $1,$2,$3,credencial_id,certificado_sha256,revision,true,clock_timestamp()+interval '30 minutes' FROM fiscal_emisores_homologacion WHERE kiosco_id=$4`,[f.operation,permission,oldHash,f.kid])
    await start(a);await a.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[f.operation,f.auth,randomUUID(),oldHash]);await a.query('COMMIT')
    const attempt=async(client)=>client.query('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,0,clock_timestamp())',[f.auth,f.operation,randomUUID(),oldHash,permission])
    return {...f,successor,replace,attempt}
  }
  const replacementWins=await replacementFixture(111)
  await start(a);await replacementWins.replace(a)
  await start(b);const staleAttempt=capture(replacementWins.attempt(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await staleAttempt).error?.code,'22023');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[replacementWins.successor])).rows[0].estado,'RESERVADA')
  cases.push('sustitucion_gana_intencion_tardia_no_envia_cuerpo_anterior')
  const attemptWins=await replacementFixture(112)
  await start(a);await attemptWins.attempt(a)
  await start(b);const lateReplacement=capture(attemptWins.replace(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await lateReplacement).error?.code,'55000');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_sustituciones_homologacion WHERE operacion_id=$1',[attemptWins.operation])).rows[0].n,0)
  cases.push('intencion_gana_sustitucion_no_transfiere_numero_incierto')
  const duplicateReplacement=await replacementFixture(113)
  await start(a);const replacementAck=await duplicateReplacement.replace(a)
  await start(b);const waitingReplacement=capture(duplicateReplacement.replace(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.deepEqual((await waitingReplacement).value,replacementAck);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE operacion_id=ANY($1::uuid[])',[[duplicateReplacement.operation,duplicateReplacement.successor]])).rows[0].n,1)
  cases.push('dos_sustituciones_mismo_contenido_recuperan_ACK_un_numero')
  const replacementRollback=await replacementFixture(114)
  await start(a);await replacementRollback.replace(a)
  await start(b);const afterRollback=capture(replacementRollback.attempt(b));await waitForLock(observer,b);await a.query('ROLLBACK')
  assert(!(await afterRollback).error);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_operaciones_homologacion WHERE id=$1',[replacementRollback.successor])).rows[0].n,0)
  cases.push('rollback_sustitucion_restituye_reserva_y_no_deja_sucesora')

  const discardWins=await replacementFixture(115)
  await start(a);await cancelPreparation(a,{...discardWins,operation:discardWins.successor})
  await start(b);const discardedReplacement=capture(discardWins.replace(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await discardedReplacement).error?.code,'55000');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_operaciones_homologacion WHERE id=$1',[discardWins.operation])).rows[0].estado,'PREPARADA')
  assert.equal((await observer.query('SELECT operacion_id FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[discardWins.operation])).rows[0].operacion_id,discardWins.operation)
  cases.push('descarte_sucesora_gana_sustitucion_tardia_conserva_reserva_original')
  const replacementBeforeDiscard=await replacementFixture(116)
  await start(a);await replacementBeforeDiscard.replace(a)
  await start(b);const lateDiscard=capture(cancelPreparation(b,{...replacementBeforeDiscard,operation:replacementBeforeDiscard.successor}));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await lateDiscard).error?.code,'55000');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=$1',[replacementBeforeDiscard.successor])).rows[0].n,0)
  cases.push('sustitucion_gana_descarte_no_cancela_cuerpo_ni_numero_sucesor')
  const differentReplacement=await replacementFixture(117),competingId=randomUUID()
  const competingData=JSON.parse(differentReplacement.canonical);competingData.datos.fecha='20261024'
  await start(a);await differentReplacement.replace(a)
  await start(b);const competingReplacement=capture(differentReplacement.replace(b,competingId,JSON.stringify(competingData)));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await competingReplacement).error?.code,'40001');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_operaciones_homologacion WHERE id=$1',[competingId])).rows[0].n,0)
  cases.push('dos_terminales_propuestas_distintas_una_sustitucion_sin_cuerpo_parcial')
  const rejectedFixture=async(point)=>{
    const f=await replacementFixture(point)
    await start(a);await f.attempt(a);await a.query('COMMIT')
    const r=(await observer.query('SELECT intento_id,solicitud_sha256 FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[f.operation])).rows[0]
    await start(a)
    await a.query('SELECT registrar_respuesta_emision_homologacion($1,$2,$3,$4,$5::jsonb)',[f.auth,f.operation,r.intento_id,r.solicitud_sha256,JSON.stringify({estado:'RECHAZO_RECIBIDO',codigos:[10017],puedeReenviar:false})])
    await a.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[randomUUID(),f.operation,r.intento_id,r.solicitud_sha256,JSON.stringify({estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false})]);await a.query('COMMIT')
    const data=JSON.parse(f.canonical);data.datos.fecha='20261024';const proposal=JSON.stringify(data),sha=createHash('sha256').update(proposal).digest('hex')
    const proof={version:1,resultado:'NO_ENCONTRADO',consulta:{entorno:'HOMOLOGACION',cuitEmisor:issuer,puntoVenta:point,tipoComprobante:11,numero:1},codigo:602,
      consultado_en:new Date(Date.now()-5).toISOString(),ultimo_autorizado:0,ultimo_consultado_en:new Date().toISOString()}
    const correct=async(client,candidate=f.successor,check=proof)=>(await client.query('SELECT corregir_rechazo_fiscal_homologacion($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb) ack',[f.auth,f.sale,f.operation,candidate,r.intento_id,r.solicitud_sha256,proposal,sha,JSON.stringify(check)])).rows[0].ack
    const authorize=async(client)=>client.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[randomUUID(),f.operation,r.intento_id,r.solicitud_sha256,JSON.stringify({estado:'AUTORIZACION_COINCIDENTE',cae:'11111111111111',vencimiento:'20261031',procesadoEn:null,solicitudSha256:r.solicitud_sha256,puedeReenviar:false})])
    return {...f,correct,authorize,proof}
  }
  const boundReconciliation=async(client,f,expected,id)=>{
    const intentRow=(await observer.query('SELECT intento_id,solicitud_sha256 FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[f.operation])).rows[0]
    return client.query('SELECT registrar_conciliacion_revisada_homologacion($1,$2::jsonb,$3,$4,$5,$6,1,$7::jsonb) data',
      [f.auth,JSON.stringify(expected),id,f.operation,intentRow.intento_id,intentRow.solicitud_sha256,JSON.stringify({estado:'CONCILIAR',codigo:'SIN_CONFIRMACION',puedeReenviar:false})])
  }
  const boundIdentity=await rejectedFixture(131),boundNewAuth=randomUUID(),boundObservation=randomUUID()
  await observer.query('INSERT INTO auth.users VALUES($1)',[boundNewAuth])
  await start(a);const boundExpected=(await a.query('SELECT autorizar_conciliacion_revisada_homologacion($1,$2) data',[boundIdentity.auth,boundIdentity.operation])).rows[0].data;await a.query('COMMIT')
  await a.query('BEGIN');await a.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[boundNewAuth,boundIdentity.owner])
  await start(b);const pendingBoundIdentity=capture(boundReconciliation(b,boundIdentity,boundExpected,boundObservation));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await pendingBoundIdentity).error?.code,'42501');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reconciliaciones_homologacion WHERE id=$1',[boundObservation])).rows[0].n,0)
  cases.push('conciliacion_Auth_reasignado_primero_bloquea_registro_con_binding_anterior')
  const boundFirst=await rejectedFixture(132),laterBoundAuth=randomUUID(),firstBoundObservation=randomUUID()
  await observer.query('INSERT INTO auth.users VALUES($1)',[laterBoundAuth])
  await start(a);const firstBoundExpected=(await a.query('SELECT autorizar_conciliacion_revisada_homologacion($1,$2) data',[boundFirst.auth,boundFirst.operation])).rows[0].data
  await boundReconciliation(a,boundFirst,firstBoundExpected,firstBoundObservation)
  await b.query('BEGIN');const pendingBoundSwap=capture(b.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[laterBoundAuth,boundFirst.owner]));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await pendingBoundSwap).error,undefined);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reconciliaciones_homologacion WHERE id=$1',[firstBoundObservation])).rows[0].n,1)
  cases.push('conciliacion_primero_retiene_lock_Auth_hasta_commit_sin_atribuir_actor_nuevo')
  const rotatedBound=await rejectedFixture(133),rotatedBoundObservation=randomUUID()
  await start(a);const rotatedExpected=(await a.query('SELECT autorizar_conciliacion_revisada_homologacion($1,$2) data',[rotatedBound.auth,rotatedBound.operation])).rows[0].data;await a.query('COMMIT')
  await a.query('BEGIN');await a.query('UPDATE fiscal_emisores_homologacion SET revision=revision+1 WHERE kiosco_id=$1',[rotatedBound.kid])
  await start(b);const pendingBoundRotation=capture(boundReconciliation(b,rotatedBound,rotatedExpected,rotatedBoundObservation));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await pendingBoundRotation).error?.code,'42501');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reconciliaciones_homologacion WHERE id=$1',[rotatedBoundObservation])).rows[0].n,0)
  cases.push('conciliacion_emisor_rota_esperando_lock_no_registra_binding_obsoleto')
  const rejectionDuplicate=await rejectedFixture(121)
  await start(a);const rejectionAck=await rejectionDuplicate.correct(a)
  await start(b);const duplicateRejection=capture(rejectionDuplicate.correct(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.deepEqual((await duplicateRejection).value,rejectionAck);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reconciliaciones_homologacion WHERE operacion_id=$1',[rejectionDuplicate.operation])).rows[0].n,1)
  cases.push('rechazo_dos_correctores_un_ACK_conserva_intento_y_consulta')
  const archivedObservation=(await observer.query('SELECT id FROM fiscal_reconciliaciones_homologacion WHERE operacion_id=$1',[rejectionDuplicate.operation])).rows[0].id
  await observer.query('UPDATE fiscal_emisores_homologacion SET habilitado=false WHERE kiosco_id=$1',[rejectionDuplicate.kid])
  await start(a);const archivedReceipt=(await a.query('SELECT cargar_observacion_fiscal_homologacion($1,$2,$3,$4) data',[rejectionDuplicate.auth,rejectionDuplicate.sale,rejectionDuplicate.operation,archivedObservation])).rows[0].data;await a.query('COMMIT')
  assert.equal(archivedReceipt.estado,'PENDIENTE_CONCILIACION');assert.equal(archivedReceipt.operacion_id,rejectionDuplicate.operation)
  cases.push('observacion_historica_tras_rechazo_corregido_sin_emisor_activo_no_degrada_sucesora')
  const observationIdentity=await rejectedFixture(134),observationNewAuth=randomUUID()
  const historicalId=(await observer.query('SELECT id FROM fiscal_reconciliaciones_homologacion WHERE operacion_id=$1',[observationIdentity.operation])).rows[0].id
  await observer.query('INSERT INTO auth.users VALUES($1)',[observationNewAuth])
  await a.query('BEGIN');await a.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[observationNewAuth,observationIdentity.owner])
  await start(b);const pendingObservationRead=capture(b.query('SELECT cargar_observacion_fiscal_homologacion($1,$2,$3,$4)',[observationIdentity.auth,observationIdentity.sale,observationIdentity.operation,historicalId]));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await pendingObservationRead).error?.code,'42501');await b.query('ROLLBACK')
  await start(b);const foreignObservationRead=await capture(b.query('SELECT cargar_observacion_fiscal_homologacion($1,$2,$3,$4)',[observationNewAuth,observationIdentity.sale,observationIdentity.operation,historicalId]));assert.equal(foreignObservationRead.error?.code,'42501');await b.query('ROLLBACK')
  cases.push('observacion_Auth_reasignado_esperando_no_revela_ACK_a_ninguna_cuenta')
  const authorizationFirst=await rejectedFixture(122)
  await start(a);await authorizationFirst.authorize(a)
  await start(b);const lateRejectedCorrection=capture(authorizationFirst.correct(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await lateRejectedCorrection).error?.code,'55000');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_rechazos_corregidos_homologacion WHERE operacion_id=$1',[authorizationFirst.operation])).rows[0].n,0)
  cases.push('CAE_gana_correccion_rechazo_no_archiva_autorizacion')
  const correctionFirst=await rejectedFixture(123)
  await start(a);await correctionFirst.correct(a)
  await start(b);const lateOriginalAuthorization=capture(correctionFirst.authorize(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await lateOriginalAuthorization).error?.code,'22023');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[correctionFirst.successor])).rows[0].estado,'RESERVADA')
  cases.push('correccion_rechazo_gana_conciliador_original_no_autoriza_cuerpo_distinto')
  const rejectedRollback=await rejectedFixture(124)
  await start(a);await rejectedRollback.correct(a)
  await start(b);const afterRejectedRollback=capture(rejectedRollback.correct(b));await waitForLock(observer,b);await a.query('ROLLBACK')
  assert(!(await afterRejectedRollback).error);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reservas_homologacion r JOIN fiscal_operaciones_homologacion o ON o.id=r.operacion_id WHERE o.venta_id=$1',[rejectedRollback.sale])).rows[0].n,2)
  cases.push('rollback_correccion_rechazo_sin_perder_reserva_ni_historia')
  const expiredProof=await rejectedFixture(125)
  const staleProof={...expiredProof.proof,consultado_en:new Date(Date.now()-119800).toISOString()}
  await a.query('BEGIN');await a.query('SELECT * FROM ventas WHERE id=$1 FOR UPDATE',[expiredProof.sale])
  await start(b);const expiredCorrection=capture(expiredProof.correct(b,expiredProof.successor,staleProof));await waitForLock(observer,b);await delay(400);await a.query('COMMIT')
  assert.equal((await expiredCorrection).error?.code,'22023');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[expiredProof.operation])).rows[0].estado,'ENVIO_INCIERTO')
  cases.push('prueba_rechazo_vence_esperando_lock_no_archiva_numero')
  const expiryAfterCatalog=await rejectedFixture(126)
  const catalogProof={...expiryAfterCatalog.proof,consultado_en:new Date(Date.now()-118000).toISOString()}
  await a.query('BEGIN');await a.query('SELECT revision FROM fiscal_parametros_homologacion WHERE revision=1 FOR UPDATE')
  await start(b);const catalogWait=capture(expiryAfterCatalog.correct(b,expiryAfterCatalog.successor,catalogProof));await waitForLock(observer,b);await delay(2600);await a.query('COMMIT')
  const rejectionCatalogExpired=await catalogWait;assert.equal(rejectionCatalogExpired.error?.code,'22023');assert.match(rejectionCatalogExpired.error?.message??'',/venció antes del cierre/);await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[expiryAfterCatalog.operation])).rows[0].estado,'ENVIO_INCIERTO')
  cases.push('prueba_rechazo_vence_esperando_catalogo_rollback_del_archivo_y_sucesora')
  const rejectionGlobal=await rejectedFixture(127),otherBusiness=await preparationFixture(127)
  await start(a);await savePreparation(a,otherBusiness);await a.query('COMMIT')
  await start(a);await rejectionGlobal.correct(a)
  await start(b);const competingSeries=capture(persistPrepared(b,otherBusiness));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await competingSeries).error?.code,'55000');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE cuit_emisor=$1 AND punto_venta=127 AND estado<>$2',[issuer,'RECHAZO_CORREGIDO'])).rows[0].n,1)
  cases.push('correccion_rechazo_serie_global_no_deja_numero_libre_para_otro_comercio')
  const reviewedPreparation=await preparationFixture(96)
  await start(a);await savePreparation(a,reviewedPreparation)
  const preparedBody=JSON.stringify({...JSON.parse(reviewedPreparation.canonical).datos,numero:1}),preparedHash=createHash('sha256').update(preparedBody).digest('hex')
  await a.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[reviewedPreparation.auth,reviewedPreparation.operation,preparedBody,preparedHash]);await a.query('COMMIT')
  const replacementAuth=randomUUID();await observer.query('INSERT INTO auth.users VALUES($1)',[replacementAuth]);await observer.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[replacementAuth,reviewedPreparation.owner])
  await start(b);const foreignReview=await capture(b.query('SELECT cargar_revision_fiscal_homologacion($1,$2)',[reviewedPreparation.operation,replacementAuth]));assert.equal(foreignReview.error?.code,'42501');await b.query('ROLLBACK')
  await start(b);const foreignApproval=await capture(b.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[reviewedPreparation.operation,replacementAuth,randomUUID(),preparedHash]));assert.equal(foreignApproval.error?.code,'42501');await b.query('ROLLBACK')
  cases.push('Auth_nuevo_no_revisa_ni_aprueba_preparacion_del_Auth_original')
  const sourcePreparation=await preparationFixture(97)
  await start(a);await savePreparation(a,sourcePreparation);await a.query('COMMIT')
  await start(a)
  const sourceBefore=(await a.query('SELECT cargar_fuente_preparacion_homologacion($1,$2) data',[sourcePreparation.auth,sourcePreparation.operation])).rows[0].data
  assert.equal(sourceBefore.estado,'DATOS_PREPARADOS');assert.equal(sourceBefore.preparacion_sha256,sourcePreparation.hash)
  const sourceBody=JSON.stringify({...JSON.parse(sourcePreparation.canonical).datos,numero:1}),sourceHash=createHash('sha256').update(sourceBody).digest('hex')
  await a.query('SELECT persistir_preparacion_fiscal_homologacion($1,$2,$3,$4,0,clock_timestamp())',[sourcePreparation.auth,sourcePreparation.operation,sourceBody,sourceHash])
  await start(b);const waitingSource=capture(b.query('SELECT cargar_fuente_preparacion_homologacion($1,$2) data',[sourcePreparation.auth,sourcePreparation.operation]))
  await waitForLock(observer,b);await a.query('COMMIT')
  const sourceAfter=await waitingSource;assert(!sourceAfter.error)
  assert.deepEqual(sourceAfter.value.rows[0].data,{operacion_id:sourcePreparation.operation,estado:'CUERPO_EXISTENTE',contexto:null,canonico:null,preparacion_sha256:null});await b.query('COMMIT')
  cases.push('fuente_espera_reserva_y_recupera_cuerpo_sin_pedir_otra_numeracion')
  const receiptPermission=randomUUID(),receiptAttempt=randomUUID()
  await observer.query(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,creado_en,vence_en)
    SELECT $1,$2,$3,credencial_id,certificado_sha256,revision,true,clock_timestamp(),clock_timestamp()+interval '30 minutes' FROM fiscal_emisores_homologacion WHERE kiosco_id=$4`,[sourcePreparation.operation,receiptPermission,sourceHash,sourcePreparation.kid])
  await start(a)
  await a.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[sourcePreparation.operation,sourcePreparation.auth,randomUUID(),sourceHash])
  await a.query('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,0,clock_timestamp())',[sourcePreparation.auth,sourcePreparation.operation,receiptAttempt,sourceHash,receiptPermission])
  await a.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[randomUUID(),sourcePreparation.operation,receiptAttempt,sourceHash,JSON.stringify({estado:'AUTORIZACION_COINCIDENTE',cae:'11111111111111',vencimiento:'20261031',procesadoEn:null,solicitudSha256:sourceHash,puedeReenviar:false})])
  await start(b);const waitingReceipt=capture(b.query('SELECT cargar_constancia_fiscal_homologacion($1,$2,$3) data',[sourcePreparation.auth,sourcePreparation.sale,sourcePreparation.operation]))
  const diagnosisReader=await connect();await start(diagnosisReader)
  const waitingDiagnosis=capture(diagnosisReader.query('SELECT cargar_diagnostico_fiscal_homologacion($1,$2,$3) data',[sourcePreparation.auth,sourcePreparation.sale,sourcePreparation.operation]))
  await waitForLock(observer,diagnosisReader)
  await waitForLock(observer,b);await a.query('COMMIT')
  const receiptAfter=await waitingReceipt;assert(!receiptAfter.error);assert.equal(receiptAfter.value.rows[0].data.autorizacion.cae,'11111111111111')
  assert.equal(receiptAfter.value.rows[0].data.solicitud.sha256,sourceHash);await b.query('COMMIT')
  cases.push('constancia_espera_cierre_atomico_y_recupera_CAE_guardado')
  const diagnosisAfter=await waitingDiagnosis;assert(!diagnosisAfter.error)
  assert.equal(diagnosisAfter.value.rows[0].data.estado,'AUTORIZADA');assert.equal(diagnosisAfter.value.rows[0].data.solicitud_sha256,sourceHash)
  assert.deepEqual(diagnosisAfter.value.rows[0].data.ultima_consulta,{estado:'AUTORIZACION_COINCIDENTE',codigo:null});await diagnosisReader.query('COMMIT')
  cases.push('diagnostico_espera_cierre_y_no_confunde_envio_con_autorizacion')
  const receiptReplacement=randomUUID();await observer.query('INSERT INTO auth.users VALUES($1)',[receiptReplacement])
  await a.query('BEGIN');await a.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[receiptReplacement,sourcePreparation.owner])
  await start(b);const reassignedReceipt=capture(b.query('SELECT cargar_constancia_fiscal_homologacion($1,$2,$3)',[sourcePreparation.auth,sourcePreparation.sale,sourcePreparation.operation]))
  await start(diagnosisReader);const reassignedDiagnosis=capture(diagnosisReader.query('SELECT cargar_diagnostico_fiscal_homologacion($1,$2,$3)',[sourcePreparation.auth,sourcePreparation.sale,sourcePreparation.operation]));await waitForLock(observer,diagnosisReader)
  await waitForLock(observer,b);await a.query('COMMIT');assert.equal((await reassignedReceipt).error?.code,'42501');await b.query('ROLLBACK')
  await start(b);const foreignReceipt=await capture(b.query('SELECT cargar_constancia_fiscal_homologacion($1,$2,$3)',[receiptReplacement,sourcePreparation.sale,sourcePreparation.operation]))
  assert.equal(foreignReceipt.error?.code,'42501');await b.query('ROLLBACK')
  cases.push('Auth_reasignado_durante_lectura_no_revela_constancia_a_ninguna_cuenta')
  assert.equal((await reassignedDiagnosis).error?.code,'42501');await diagnosisReader.query('ROLLBACK')
  await start(diagnosisReader);const foreignDiagnosis=await capture(diagnosisReader.query('SELECT cargar_diagnostico_fiscal_homologacion($1,$2,$3)',[receiptReplacement,sourcePreparation.sale,sourcePreparation.operation]));assert.equal(foreignDiagnosis.error?.code,'42501');await diagnosisReader.query('ROLLBACK')
  cases.push('Auth_reasignado_durante_lectura_no_revela_diagnostico_a_ninguna_cuenta')
  const returnedPreparation=await preparationFixture(98)
  await start(a);await savePreparation(a,returnedPreparation);await a.query('COMMIT')
  await a.query('BEGIN');await a.query("SELECT set_config('request.jwt.claim.sub',$1,true)",[returnedPreparation.auth])
  await a.query('INSERT INTO devoluciones_venta(venta_id,kiosco_id) VALUES($1,$2)',[returnedPreparation.sale,returnedPreparation.kid])
  await start(b);const waitingReturnSource=capture(b.query('SELECT cargar_fuente_preparacion_homologacion($1,$2)',[returnedPreparation.auth,returnedPreparation.operation]))
  await waitForLock(observer,b);await a.query('COMMIT');assert.equal((await waitingReturnSource).error?.code,'22023');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[returnedPreparation.operation])).rows[0].n,0)
  cases.push('devolucion_durante_espera_fuente_bloquea_antes_consulta_numeracion')
  const replacedActor=await preparationFixture(91),newActor=randomUUID()
  await observer.query('INSERT INTO auth.users VALUES($1)',[newActor])
  await a.query('BEGIN');await a.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[newActor,replacedActor.owner])
  await start(b);const blockedActor=capture(savePreparation(b,replacedActor));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await blockedActor).error?.code,'42501');await b.query('ROLLBACK')
  cases.push('Auth_reasignado_durante_espera_no_crea_preparacion')
  const changedSale=await preparationFixture(92)
  await a.query('BEGIN');await a.query('UPDATE ventas SET total=124 WHERE id=$1',[changedSale.sale])
  await start(b);const blockedSale=capture(savePreparation(b,changedSale));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await blockedSale).error?.code,'22023');await b.query('ROLLBACK')
  cases.push('venta_cambia_durante_espera_no_guarda_importe_anterior')
  async function presentationFixture(point,revision=1,quantity=1){
    const f=await preparationFixture(point,revision,quantity)
    await start(a);await savePreparation(a,f);await persistPrepared(a,f);await a.query('COMMIT')
    const body=(await observer.query('SELECT solicitud_sha256 FROM fiscal_solicitudes_homologacion WHERE operacion_id=$1',[f.operation])).rows[0].solicitud_sha256
    const detail=(await observer.query('SELECT id FROM detalles_venta WHERE venta_id=$1',[f.sale])).rows[0].id
    const facts={version:1,emisor:{razon_social:'Comercio ñ',domicilio_comercial:'Calle 1',ingresos_brutos:'Exento',inicio_actividades:'20200101'},receptor:{nombre:'Consumidor final',domicilio:'Sin identificar'},lineas:[{detalle_id:detail,descripcion:'Artículo'}],otros_impuestos_nacionales_indirectos:'0.00'}
    const canonical=(await observer.query('SELECT fiscal_json_canonico_homologacion($1::jsonb) value',[JSON.stringify(facts)])).rows[0].value
    const sha=createHash('sha256').update(canonical).digest('hex')
    const write=async(client)=>(await client.query('SELECT guardar_presentacion_fiscal_homologacion($1,$2,$3,$4,$5,$6) ack',[f.auth,f.sale,f.operation,body,canonical,sha])).rows[0].ack
    return {...f,write,sha,body}
  }
  const presentationDuplicate=await presentationFixture(135)
  await start(a);const presentationAck=await presentationDuplicate.write(a)
  await start(b);const duplicatePresentation=capture(presentationDuplicate.write(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.deepEqual((await duplicatePresentation).value,presentationAck);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_presentaciones_homologacion WHERE operacion_id=$1',[presentationDuplicate.operation])).rows[0].n,1)
  cases.push('representacion_dos_guardados_un_ACK_historico_sin_emision')
  await start(a);const historicalPresentation=(await a.query('SELECT cargar_contexto_presentacion_homologacion($1,$2,$3) value',[presentationDuplicate.auth,presentationDuplicate.sale,presentationDuplicate.operation])).rows[0].value;await a.query('COMMIT')
  assert.equal(historicalPresentation.lineas[0].cantidad,'1.000');assert.equal(historicalPresentation.lineas[0].precio_unitario,'123.45')
  assert.deepEqual(Object.keys(historicalPresentation).sort(),['lineas','operacion_id','solicitud_sha256','venta_id'])
  await observer.query("UPDATE productos SET descripcion='Nombre posterior',precio_venta=999 WHERE id IN(SELECT producto_id FROM detalles_venta WHERE venta_id=$1)",[presentationDuplicate.sale])
  await start(a);assert.deepEqual((await a.query('SELECT cargar_contexto_presentacion_homologacion($1,$2,$3) value',[presentationDuplicate.auth,presentationDuplicate.sale,presentationDuplicate.operation])).rows[0].value,historicalPresentation);await a.query('COMMIT')
  cases.push('fuente_representacion_historica_no_cambia_con_catalogo_actual')
  const presentationRollback=await presentationFixture(136)
  await start(a);await presentationRollback.write(a)
  await start(b);const presentationRetry=capture(presentationRollback.write(b));await waitForLock(observer,b);await a.query('ROLLBACK')
  assert.equal((await presentationRetry).value.presentacion_sha256,presentationRollback.sha);await b.query('COMMIT')
  cases.push('representacion_rollback_primer_guardado_segundo_confirma_mismo_hash')
  const presentationActor=await presentationFixture(137),presentationNewActor=randomUUID()
  await observer.query('INSERT INTO auth.users VALUES($1)',[presentationNewActor])
  await a.query('BEGIN');await a.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[presentationNewActor,presentationActor.owner])
  await start(b);const blockedPresentationActor=capture(presentationActor.write(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await blockedPresentationActor).error?.code,'42501');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_presentaciones_homologacion WHERE operacion_id=$1',[presentationActor.operation])).rows[0].n,0)
  cases.push('representacion_Auth_reasignado_esperando_no_guarda_hechos')
  for(const actor of [presentationActor.auth,presentationNewActor]){
    await start(a);const sourceDenied=await capture(a.query('SELECT cargar_contexto_presentacion_homologacion($1,$2,$3)',[actor,presentationActor.sale,presentationActor.operation]));assert.equal(sourceDenied.error?.code,'42501');await a.query('ROLLBACK')
  }
  cases.push('fuente_representacion_Auth_reasignado_no_revela_lineas_a_ninguna_cuenta')
  const presentationIssuer=await presentationFixture(138)
  await a.query('BEGIN');await a.query('UPDATE fiscal_emisores_homologacion SET habilitado=false WHERE kiosco_id=$1',[presentationIssuer.kid])
  await start(b);const blockedPresentationIssuer=capture(presentationIssuer.write(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await blockedPresentationIssuer).error?.code,'42501');await b.query('ROLLBACK')
  cases.push('representacion_emisor_revocado_esperando_no_guarda_hechos')
  const boundReview=await presentationFixture(139),boundReviewId=randomUUID()
  await start(a);await boundReview.write(a);await a.query('COMMIT')
  const approveBound=async(client,sha=boundReview.sha)=>(await client.query('SELECT aprobar_revision_presentacion_homologacion($1,$2,$3,$4,$5,1,$6) ack',[boundReview.auth,boundReview.sale,boundReview.operation,boundReviewId,boundReview.body,sha])).rows[0].ack
  await start(a);const boundApproval=await approveBound(a)
  await start(b);const duplicateBoundApproval=capture(approveBound(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.deepEqual((await duplicateBoundApproval).value,boundApproval);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_revisiones_presentacion_homologacion WHERE revision_id=$1',[boundReviewId])).rows[0].n,1)
  cases.push('revision_representacion_dos_workers_mismo_UUID_un_ACK_sin_renovar_vigencia')
  await start(a);const changedRepresentation=await capture(approveBound(a,'d'.repeat(64)));assert.equal(changedRepresentation.error?.code,'40001');await a.query('ROLLBACK')
  await start(a);const oldApprovalPath=await capture(a.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[boundReview.operation,boundReview.auth,randomUUID(),boundReview.body]));assert.equal(oldApprovalPath.error?.code,'42501');await a.query('ROLLBACK')
  cases.push('revision_representacion_hash_distinto_y_ruta_antigua_no_aprueban')
  const reviewBeforePresentation=await presentationFixture(140)
  await start(a);await a.query('SELECT aprobar_revision_fiscal_homologacion($1,$2,$3,$4,1)',[reviewBeforePresentation.operation,reviewBeforePresentation.auth,randomUUID(),reviewBeforePresentation.body])
  await start(b);const latePresentation=capture(reviewBeforePresentation.write(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await latePresentation).error?.code,'55000');await b.query('ROLLBACK')
  cases.push('revision_primero_impide_agregar_hechos_tardios_durante_espera')
  // Actualización sobre historia previa: los escenarios anteriores acreditan 001–024.
  requiredPresentationInstalledAfterCase=cases.length
  const historyBefore=(await observer.query('SELECT jsonb_agg(to_jsonb(r) ORDER BY operacion_id) value FROM fiscal_reservas_homologacion r')).rows[0].value
  await observer.query(readFileSync(join(root,'supabase/pilot-fiscal/025_fiscal_required_presentation.sql'),'utf8'))
  await observer.query(readFileSync(join(root,'supabase/pilot-fiscal/025_fiscal_required_presentation.sql'),'utf8'))
  await observer.query(readFileSync(join(root,'supabase/pilot-fiscal/026_fiscal_representation_source.sql'),'utf8'))
  await observer.query(readFileSync(join(root,'supabase/pilot-fiscal/026_fiscal_representation_source.sql'),'utf8'))
  assert.deepEqual((await observer.query('SELECT jsonb_agg(to_jsonb(r) ORDER BY operacion_id) value FROM fiscal_reservas_homologacion r')).rows[0].value,historyBefore)
  await start(a);const oldReplay=await markEmission(a,e,sendId);assert.equal(oldReplay.nuevo_intento,false);await a.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_presentaciones_homologacion WHERE operacion_id=$1',[e.op])).rows[0].n,0)
  cases.push('025_instalacion_repetida_preserva_historia_y_replay_heredado_sin_crear_hechos')
  const newLegacy=await emissionFixture(141,0)
  await start(a);const forbiddenLegacy=await capture(markEmission(a,newLegacy,randomUUID()));assert.equal(forbiddenLegacy.error?.code,'42501');await a.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[newLegacy.op])).rows[0].estado,'RESERVADA')
  cases.push('025_operacion_heredada_nueva_sin_012_no_crea_intencion_aunque_tenga_permiso_revision')
  await start(a);const directIntent=await capture(a.query('SELECT registrar_intento_fiscal_homologacion($1,$2)',[boundReview.operation,randomUUID()]));assert.equal(directIntent.error?.code,'42501');await a.query('ROLLBACK')
  cases.push('025_helper_directo_cerrado_incluso_con_hechos_y_revision_validos')
  async function strictPresentationFixture(point,parameterRevision=1,quantity=1){
    const f=await presentationFixture(point,parameterRevision,quantity),revision=randomUUID(),grant=randomUUID()
    await start(a);await f.write(a)
    await a.query('SELECT aprobar_revision_presentacion_homologacion($1,$2,$3,$4,$5,1,$6)',[f.auth,f.sale,f.operation,revision,f.body,f.sha]);await a.query('COMMIT')
    await observer.query(`INSERT INTO fiscal_permisos_emision_homologacion(operacion_id,autorizacion_id,solicitud_sha256,credencial_id,certificado_sha256,emisor_revision,habilitado,vence_en)
      SELECT $1,$2,$3,credencial_id,certificado_sha256,revision,true,clock_timestamp()+interval '30 minutes' FROM fiscal_emisores_homologacion WHERE kiosco_id=$4`,[f.operation,grant,f.body,f.kid])
    const authorize=async(client)=>(await client.query('SELECT autorizar_envio_presentado_homologacion($1,$2,$3,$4) ack',[f.auth,f.operation,f.body,revision])).rows[0].ack
    const send=async(client,attempt)=>(await client.query('SELECT registrar_envio_revisado_homologacion($1,$2,$3,$4,$5,0,clock_timestamp()) ack',[f.auth,f.operation,attempt,f.body,grant])).rows[0].ack
    return {...f,revision,grant,authorize,send}
  }
  const strict=await strictPresentationFixture(142),strictAttempt=randomUUID()
  await start(a);assert.equal((await strict.authorize(a)).presentacion_sha256,strict.sha);await a.query('COMMIT')
  await start(a);const strictFirst=await strict.send(a,strictAttempt);assert.equal(strictFirst.nuevo_intento,true)
  await start(b);const strictDuplicate=capture(strict.send(b,strictAttempt));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await strictDuplicate).value.nuevo_intento,false);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT revision_aprobada_id FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[strict.operation])).rows[0].revision_aprobada_id,strict.revision)
  cases.push('025_dos_workers_intencion_completa_mismo_intento_un_consumo_revision_exacta')
  const strictExpired=await strictPresentationFixture(143)
  await observer.query('ALTER TABLE fiscal_revisiones_homologacion DISABLE TRIGGER fiscal_revision_inmutable')
  await observer.query("UPDATE fiscal_revisiones_homologacion SET creado_en=clock_timestamp()-interval '1 minute',vence_en=clock_timestamp()+interval '2 seconds' WHERE id=$1",[strictExpired.revision])
  await observer.query('ALTER TABLE fiscal_revisiones_homologacion ENABLE TRIGGER fiscal_revision_inmutable')
  await a.query('BEGIN');await a.query('SELECT id FROM fiscal_operaciones_homologacion WHERE id=$1 FOR UPDATE',[strictExpired.operation])
  await start(b);const lateStrict=capture(strictExpired.authorize(b));await waitForLock(observer,b)
  const strictDeadline=Date.now()+7000;let strictReviewExpired=false
  while(Date.now()<strictDeadline){strictReviewExpired=(await observer.query('SELECT vence_en<=clock_timestamp() expired FROM fiscal_revisiones_homologacion WHERE id=$1',[strictExpired.revision])).rows[0].expired;if(strictReviewExpired)break;await delay(40)}
  assert(strictReviewExpired);await a.query('COMMIT');assert.equal((await lateStrict).error?.code,'42501');await b.query('ROLLBACK')
  cases.push('025_revision_ligada_vence_esperando_lock_no_autoriza_TA_ni_intencion')
  const strictActor=await strictPresentationFixture(144),strictNewActor=randomUUID()
  await observer.query('INSERT INTO auth.users VALUES($1)',[strictNewActor])
  await a.query('BEGIN');await a.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[strictNewActor,strictActor.owner])
  await start(b);const lateStrictActor=capture(strictActor.authorize(b));await waitForLock(observer,b);await a.query('COMMIT');assert.equal((await lateStrictActor).error?.code,'42501');await b.query('ROLLBACK')
  await start(b);const newStrictActor=await capture(b.query('SELECT autorizar_envio_presentado_homologacion($1,$2,$3,$4)',[strictNewActor,strictActor.operation,strictActor.body,strictActor.revision]));assert.equal(newStrictActor.error?.code,'42501');await b.query('ROLLBACK')
  cases.push('025_Auth_reasignado_esperando_no_autoriza_cuenta_original_ni_nueva')
  const strictIssuer=await strictPresentationFixture(145)
  await a.query('BEGIN');await a.query('UPDATE fiscal_emisores_homologacion SET revision=revision+1 WHERE kiosco_id=$1',[strictIssuer.kid])
  await start(b);const lateStrictIssuer=capture(strictIssuer.authorize(b));await waitForLock(observer,b);await a.query('COMMIT');assert.equal((await lateStrictIssuer).error?.code,'42501');await b.query('ROLLBACK')
  cases.push('025_emisor_rota_esperando_lock_no_autoriza_hechos_revision_anteriores')
  const strictRollback=await strictPresentationFixture(146)
  await start(a);await strictRollback.send(a,randomUUID());await a.query('ROLLBACK')
  assert.equal((await observer.query('SELECT estado FROM fiscal_reservas_homologacion WHERE operacion_id=$1',[strictRollback.operation])).rows[0].estado,'RESERVADA')
  assert.equal((await observer.query('SELECT usado_por_intento FROM fiscal_permisos_emision_homologacion WHERE operacion_id=$1',[strictRollback.operation])).rows[0].usado_por_intento,null)
  cases.push('025_rollback_intencion_restituye_reserva_permiso_y_conserva_revision_hechos')
  const strictLinkExpired=await strictPresentationFixture(147)
  await observer.query('ALTER TABLE fiscal_revisiones_homologacion DISABLE TRIGGER fiscal_revision_inmutable')
  await observer.query("UPDATE fiscal_revisiones_homologacion SET creado_en=clock_timestamp()-interval '1 minute',vence_en=clock_timestamp()+interval '2 seconds' WHERE id=$1",[strictLinkExpired.revision])
  await observer.query('ALTER TABLE fiscal_revisiones_homologacion ENABLE TRIGGER fiscal_revision_inmutable')
  await a.query('BEGIN');await a.query('SELECT revision_id FROM fiscal_revisiones_presentacion_homologacion WHERE revision_id=$1 FOR UPDATE',[strictLinkExpired.revision])
  await start(b);const lateStrictLink=capture(strictLinkExpired.authorize(b));await waitForLock(observer,b)
  const strictLinkDeadline=Date.now()+7000;let strictLinkReviewExpired=false
  while(Date.now()<strictLinkDeadline){strictLinkReviewExpired=(await observer.query('SELECT vence_en<=clock_timestamp() expired FROM fiscal_revisiones_homologacion WHERE id=$1',[strictLinkExpired.revision])).rows[0].expired;if(strictLinkReviewExpired)break;await delay(40)}
  assert(strictLinkReviewExpired);await a.query('COMMIT');assert.equal((await lateStrictLink).error?.code,'42501');await b.query('ROLLBACK')
  cases.push('025_revision_vence_esperando_ultimo_lock_del_vinculo_no_autoriza_TA')
  const historicalRepresentation=await strictPresentationFixture(149),historicalAttempt=randomUUID()
  const readHistorical=async(client,actor=historicalRepresentation.auth)=>(await client.query('SELECT cargar_representacion_fiscal_homologacion($1,$2,$3) value',[actor,historicalRepresentation.sale,historicalRepresentation.operation])).rows[0].value
  await start(a);const representationBeforeAuthorization=await capture(readHistorical(a));assert.equal(representationBeforeAuthorization.error?.code,'22023');await a.query('ROLLBACK')
  await observer.query('ALTER TABLE fiscal_revisiones_homologacion DISABLE TRIGGER fiscal_revision_inmutable')
  await observer.query("UPDATE fiscal_revisiones_homologacion SET vence_en=clock_timestamp()+interval '3 seconds' WHERE id=$1",[historicalRepresentation.revision])
  await observer.query('ALTER TABLE fiscal_revisiones_homologacion ENABLE TRIGGER fiscal_revision_inmutable')
  await start(a);await historicalRepresentation.send(a,historicalAttempt);await a.query('COMMIT')
  await start(a);await a.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[randomUUID(),historicalRepresentation.operation,historicalAttempt,historicalRepresentation.body,JSON.stringify({estado:'AUTORIZACION_COINCIDENTE',cae:'11111111111111',vencimiento:'20261031',procesadoEn:null,solicitudSha256:historicalRepresentation.body,puedeReenviar:false})]);await a.query('COMMIT')
  const strictCatalogExpired=await strictPresentationFixture(148)
  await observer.query('ALTER TABLE fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables')
  await observer.query("UPDATE fiscal_parametros_homologacion SET vence_en=clock_timestamp()+interval '2 seconds' WHERE revision=1")
  await observer.query('ALTER TABLE fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables')
  await a.query('BEGIN');await a.query('SELECT revision_id FROM fiscal_revisiones_presentacion_homologacion WHERE revision_id=$1 FOR UPDATE',[strictCatalogExpired.revision])
  await start(b);const lateStrictCatalog=capture(strictCatalogExpired.authorize(b));await waitForLock(observer,b)
  const strictCatalogDeadline=Date.now()+7000;let strictCatalogExpiredNow=false
  while(Date.now()<strictCatalogDeadline){strictCatalogExpiredNow=(await observer.query('SELECT vence_en<=clock_timestamp() expired FROM fiscal_parametros_homologacion WHERE revision=1')).rows[0].expired;if(strictCatalogExpiredNow)break;await delay(40)}
  assert(strictCatalogExpiredNow);await a.query('COMMIT');assert.equal((await lateStrictCatalog).error?.code,'22023');await b.query('ROLLBACK')
  cases.push('025_parametros_vencen_esperando_ultimo_lock_no_autoriza_TA')
  const historicalReviewDeadline=Date.now()+8000;let historicalReviewExpired=false
  while(Date.now()<historicalReviewDeadline){historicalReviewExpired=(await observer.query('SELECT vence_en<=clock_timestamp() expired FROM fiscal_revisiones_homologacion WHERE id=$1',[historicalRepresentation.revision])).rows[0].expired;if(historicalReviewExpired)break;await delay(40)}
  assert(historicalReviewExpired)
  await observer.query('UPDATE fiscal_emisores_homologacion SET habilitado=false WHERE kiosco_id=$1',[historicalRepresentation.kid])
  await observer.query('UPDATE fiscal_parametros_homologacion SET habilitado=false WHERE revision=1')
  await observer.query("UPDATE productos SET descripcion='Posterior',precio_venta=999 WHERE id IN(SELECT producto_id FROM detalles_venta WHERE venta_id=$1)",[historicalRepresentation.sale])
  await start(a);const historicalSource=await readHistorical(a);await a.query('COMMIT')
  assert.equal(historicalSource.estado,'AUTORIZADA');assert.equal(historicalSource.contexto.lineas[0].precio_unitario,'123.45');assert.equal(historicalSource.condicion_receptor,'Ensayo')
  assert.equal(historicalSource.hechos.presentacion_sha256,historicalRepresentation.sha)
  cases.push('026_representacion_solo_autorizada_historica_tras_vencer_revision_parametros_y_revocar_emisor')
  const historicalNewActor=randomUUID();await observer.query('INSERT INTO auth.users VALUES($1)',[historicalNewActor]);await observer.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[historicalNewActor,historicalRepresentation.owner])
  for(const actor of [historicalRepresentation.auth,historicalNewActor]){await start(a);const forbiddenSource=await capture(readHistorical(a,actor));assert.equal(forbiddenSource.error?.code,'42501');await a.query('ROLLBACK')}
  cases.push('026_representacion_Auth_reasignado_no_revela_datos_a_cuenta_original_ni_nueva')
  const expiredCatalog=await preparationFixture(93)
  await observer.query('UPDATE fiscal_parametros_homologacion SET habilitado=false')
  await observer.query(`INSERT INTO fiscal_parametros_homologacion SELECT 2,condiciones,alicuotas,fuente_sha256,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '3 seconds',true FROM fiscal_parametros_homologacion WHERE revision=1`)
  await a.query('BEGIN');await a.query('SELECT revision FROM fiscal_parametros_homologacion WHERE revision=2 FOR UPDATE')
  await start(b);const blockedCatalog=capture(b.query('SELECT cargar_datos_preparacion_homologacion($1,$2)',[expiredCatalog.auth,expiredCatalog.sale]));await waitForLock(observer,b)
  const catalogDeadline=Date.now()+7000;let catalogExpired=false
  while(Date.now()<catalogDeadline){catalogExpired=(await observer.query('SELECT vence_en<=clock_timestamp() expired FROM fiscal_parametros_homologacion WHERE revision=2')).rows[0].expired;if(catalogExpired)break;await delay(40)}
  assert(catalogExpired);await a.query('COMMIT');assert.equal((await blockedCatalog).error?.code,'22023');await b.query('ROLLBACK')
  cases.push('parametros_vencen_esperando_lock_no_devuelve_contexto_vigente')
  await observer.query('ALTER TABLE ventas ADD COLUMN afip_cae text')
  await observer.query(`INSERT INTO fiscal_parametros_homologacion SELECT 3,condiciones,alicuotas,fuente_sha256,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true FROM fiscal_parametros_homologacion WHERE revision=1`)
  const legacyInvoice=await preparationFixture(94)
  await start(a);assert.equal((await a.query('SELECT cargar_datos_preparacion_homologacion($1,$2) ctx',[legacyInvoice.auth,legacyInvoice.sale])).rows[0].ctx.revision_parametros,3);await a.query('COMMIT')
  await a.query('BEGIN');await a.query("UPDATE ventas SET afip_cae='SYNTHETIC_REGISTERED_CAE' WHERE id=$1",[legacyInvoice.sale])
  await start(b);const waitingLegacy=capture(b.query('SELECT cargar_datos_preparacion_homologacion($1,$2)',[legacyInvoice.auth,legacyInvoice.sale]))
  await waitForLock(observer,b);await a.query('COMMIT');assert.equal((await waitingLegacy).error?.code,'22023');await b.query('ROLLBACK')
  await start(b);assert.equal((await b.query('SELECT resolver_preparacion_fiscal_homologacion($1,$2) ack',[legacyInvoice.auth,legacyInvoice.sale])).rows[0].ack.estado,'REGISTRO_FISCAL_HEREDADO');await b.query('COMMIT')
  cases.push('CAE_heredado_confirmado_durante_espera_impide_nueva_preparacion')
  for(const f of [replacedActor,changedSale,expiredCatalog])assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_operaciones_homologacion WHERE venta_id=$1',[f.sale])).rows[0].n,0)
  creditDraftInstalledAfterCase=cases.length
  await observer.query(readFileSync(join(root,'supabase/pilot-fiscal/027_fiscal_credit_drafts.sql'),'utf8'))
  await observer.query(readFileSync(join(root,'supabase/pilot-fiscal/027_fiscal_credit_drafts.sql'),'utf8'))
  async function creditFixture(point,parameterRevision=3){
    const f=await strictPresentationFixture(point,parameterRevision,2),attempt=randomUUID()
    await start(a);await f.send(a,attempt);await a.query('COMMIT')
    await start(a);await a.query('SELECT registrar_reconciliacion_fiscal_homologacion($1,$2,$3,$4,1,$5::jsonb)',[randomUUID(),f.operation,attempt,f.body,JSON.stringify({estado:'AUTORIZACION_COINCIDENTE',cae:'11111111111111',vencimiento:'20261031',procesadoEn:null,solicitudSha256:f.body,puedeReenviar:false})]);await a.query('COMMIT')
    await start(a);const source=(await a.query('SELECT cargar_representacion_fiscal_homologacion($1,$2,$3) v',[f.auth,f.sale,f.operation])).rows[0].v;await a.query('COMMIT')
    const body=source.constancia.solicitud.solicitud,today=(await observer.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'America/Argentina/Buenos_Aires','YYYYMMDD') v`)).rows[0].v
    const make=async(amount='123.45',quantity='2.000',id=randomUUID())=>{
      const data={version:1,solicitud_id:id,fecha:today,motivo:'NC sintética',condicion_iva_receptor:5,lineas:[{detalle_id:source.contexto.lineas[0].detalle_id,cantidad:quantity,importe:amount,reingresa_stock:true}],
        importes:{total:amount,neto:amount,iva:'0.00',noGravado:'0.00',exento:'0.00',tributos:'0.00'},iva:[],tributos:[],clase:'DEVOLUCION',entorno:'HOMOLOGACION',tipo_nota_credito:13,
        origen:{venta_id:f.sale,operacion_id:f.operation,solicitud_sha256:f.body,presentacion_sha256:f.sha,cae:'11111111111111',cuit:body.cuitEmisor,tipo:11,punto_venta:point,numero:body.numero,fecha:body.fecha,tipo_documento_receptor:99,numero_documento_receptor:'0'}}
      const canonical=(await observer.query('SELECT fiscal_json_canonico_homologacion($1::jsonb) v',[JSON.stringify(data)])).rows[0].v
      return {id,canonical,sha:createHash('sha256').update(canonical).digest('hex')}
    }
    const write=async(client,p,actor=f.auth)=>(await client.query('SELECT guardar_borrador_nc_homologacion($1,$2,$3,$4,$5) v',[actor,f.sale,f.operation,p.canonical,p.sha])).rows[0].v
    const read=async(client,p,actor=f.auth)=>(await client.query('SELECT cargar_borrador_nc_homologacion($1,$2,$3,$4) v',[actor,f.sale,f.operation,p.id])).rows[0].v
    const cancel=async(client,p,actor=f.auth)=>(await client.query('SELECT cancelar_borrador_nc_homologacion($1,$2,$3,$4,$5) v',[actor,f.sale,f.operation,p.id,p.sha])).rows[0].v
    return {...f,make,write,read,cancel}
  }
  const duplicateCredit=await creditFixture(160),sameCredit=await duplicateCredit.make()
  await start(a);const firstCredit=await duplicateCredit.write(a,sameCredit)
  await start(b);const waitingDuplicateCredit=capture(duplicateCredit.write(b,sameCredit));await waitForLock(observer,b);await a.query('COMMIT')
  assert.deepEqual((await waitingDuplicateCredit).value,firstCredit);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_nc_borradores_homologacion WHERE operacion_origen_id=$1',[duplicateCredit.operation])).rows[0].n,1)
  cases.push('027_dos_workers_mismo_UUID_un_caso_ACK_recuperable_sin_efectos_comerciales')
  const competingCredit=await creditFixture(161),creditA=await competingCredit.make(),creditB=await competingCredit.make()
  await start(a);await competingCredit.write(a,creditA)
  await start(b);const waitingCreditBalance=capture(competingCredit.write(b,creditB));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingCreditBalance).error?.code,'22023');await b.query('ROLLBACK')
  cases.push('027_UUID_distintos_no_reservan_dos_veces_cantidad_ni_importe')
  await start(a);await competingCredit.cancel(a,creditA)
  await start(b);const waitingReleasedBalance=capture(competingCredit.write(b,creditB));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingReleasedBalance).value.estado,'SALDO_RESERVADO_NO_EMITIR');await b.query('COMMIT')
  await start(a);assert.equal((await competingCredit.write(a,creditA)).estado,'CANCELADA');await a.query('COMMIT')
  cases.push('027_cancelacion_libera_saldo_sin_borrar_historia_ni_reactivar_UUID')
  const rollbackCredit=await creditFixture(162),rollingCredit=await rollbackCredit.make(),afterRollbackCredit=await rollbackCredit.make()
  await start(a);await rollbackCredit.write(a,rollingCredit)
  await start(b);const waitingRolledBalance=capture(rollbackCredit.write(b,afterRollbackCredit));await waitForLock(observer,b);await a.query('ROLLBACK')
  assert.equal((await waitingRolledBalance).value.estado,'SALDO_RESERVADO_NO_EMITIR');await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_nc_borradores_homologacion WHERE id=$1',[rollingCredit.id])).rows[0].n,0)
  cases.push('027_rollback_no_consume_saldo_para_worker_que_espera')
  const centsCredit=await creditFixture(163),centsFirst=await centsCredit.make('61.73','1.000'),centsLast=await centsCredit.make('61.72','1.000')
  await start(a);await centsCredit.write(a,centsFirst)
  await start(b);const waitingCents=capture(centsCredit.write(b,centsLast));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingCents).value.estado,'SALDO_RESERVADO_NO_EMITIR');await b.query('COMMIT')
  await start(a);assert.equal((await capture(centsCredit.cancel(a,centsFirst))).error?.code,'55000');await a.query('ROLLBACK')
  assert.equal((await observer.query(`SELECT sum((l->>'importe')::numeric)::text v FROM fiscal_nc_borradores_homologacion x CROSS JOIN LATERAL jsonb_array_elements(x.datos->'lineas') l WHERE operacion_origen_id=$1`,[centsCredit.operation])).rows[0].v,'123.45')
  cases.push('027_dos_parciales_conservan_centavo_y_cancelacion_exige_orden_inverso')
  const changedCreditAuth=await creditFixture(164),authCredit=await changedCreditAuth.make(),newCreditAuth=randomUUID()
  await observer.query('INSERT INTO auth.users VALUES($1)',[newCreditAuth])
  await a.query('BEGIN');await a.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[newCreditAuth,changedCreditAuth.owner])
  await start(b);const waitingCreditAuth=capture(changedCreditAuth.write(b,authCredit));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingCreditAuth).error?.code,'42501');await b.query('ROLLBACK')
  for(const actor of [changedCreditAuth.auth,newCreditAuth]){await start(a);assert.equal((await capture(changedCreditAuth.read(a,authCredit,actor))).error?.code,'42501');await a.query('ROLLBACK')}
  cases.push('027_Auth_reasignado_esperando_no_reserva_ni_revela_caso')
  const revokedCreditIssuer=await creditFixture(165),revokedCredit=await revokedCreditIssuer.make()
  await a.query('BEGIN');await a.query('UPDATE fiscal_emisores_homologacion SET habilitado=false WHERE kiosco_id=$1',[revokedCreditIssuer.kid])
  await start(b);const waitingCreditIssuer=capture(revokedCreditIssuer.write(b,revokedCredit));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingCreditIssuer).error?.code,'42501');await b.query('ROLLBACK')
  cases.push('027_emisor_revocado_esperando_no_reserva_caso_nuevo')
  const expiredCreditCatalog=await creditFixture(166),expiringCredit=await expiredCreditCatalog.make()
  await observer.query('ALTER TABLE fiscal_parametros_homologacion DISABLE TRIGGER fiscal_parametros_inmutables')
  await observer.query(`UPDATE fiscal_parametros_homologacion SET vence_en=clock_timestamp()+interval '2 seconds' WHERE revision=3`)
  await observer.query('ALTER TABLE fiscal_parametros_homologacion ENABLE TRIGGER fiscal_parametros_inmutables')
  await a.query('BEGIN');await a.query('SELECT revision FROM fiscal_parametros_homologacion WHERE revision=3 FOR UPDATE')
  await start(b);const waitingCreditCatalog=capture(expiredCreditCatalog.write(b,expiringCredit));await waitForLock(observer,b)
  const ncCatalogDeadline=Date.now()+7000;let ncCatalogExpired=false
  while(Date.now()<ncCatalogDeadline){ncCatalogExpired=(await observer.query('SELECT vence_en<=clock_timestamp() expired FROM fiscal_parametros_homologacion WHERE revision=3')).rows[0].expired;if(ncCatalogExpired)break;await delay(40)}
  assert(ncCatalogExpired);await a.query('COMMIT');assert.equal((await waitingCreditCatalog).error?.code,'22023');await b.query('ROLLBACK')
  cases.push('027_catalogo_vence_durante_lock_no_reserva_caso')
  for(const f of [duplicateCredit,competingCredit,rollbackCredit,centsCredit,changedCreditAuth,revokedCreditIssuer,expiredCreditCatalog]){
    for(const table of ['movimientos_stock','movimientos_caja','devoluciones_venta'])assert.equal((await observer.query(`SELECT count(*)::int n FROM ${table} WHERE kiosco_id=$1`,[f.kid])).rows[0].n,0)
  }
  creditRecoveryInstalledAfterCase=cases.length
  for(const file of ['028_fiscal_credit_abandonment.sql','029_fiscal_credit_history.sql']){
    await observer.query(readFileSync(join(root,'supabase/pilot-fiscal',file),'utf8'))
    await observer.query(readFileSync(join(root,'supabase/pilot-fiscal',file),'utf8'))
  }
  await observer.query(`INSERT INTO fiscal_parametros_homologacion SELECT 4,condiciones,alicuotas,fuente_sha256,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true FROM fiscal_parametros_homologacion WHERE revision=1`)
  const abandoned=await creditFixture(170,4),abandonedProposal=await abandoned.make()
  await start(a);const abandonment=await abandoned.cancel(a,abandonedProposal)
  await start(b);const lateWrite=capture(abandoned.write(b,abandonedProposal));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await lateWrite).error?.code,'55000');await b.query('ROLLBACK')
  await start(b);assert.deepEqual(await abandoned.read(b,abandonedProposal),abandonment);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_nc_borradores_homologacion WHERE id=$1',[abandonedProposal.id])).rows[0].n,0)
  cases.push('028_desistimiento_confirmado_impide_guardado_tardio_esperando_lock')
  const savedFirst=await creditFixture(171,4),savedProposal=await savedFirst.make()
  await start(a);await savedFirst.write(a,savedProposal)
  await start(b);const cancelWaiting=capture(savedFirst.cancel(b,savedProposal));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await cancelWaiting).value.estado,'CANCELADA');await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_nc_desistimientos_homologacion WHERE solicitud_id=$1',[savedProposal.id])).rows[0].n,0)
  cases.push('028_guardado_previo_se_cancela_sin_crear_desistimiento_contradictorio')
  const duplicateAbandon=await creditFixture(172,4),duplicateAbandonProposal=await duplicateAbandon.make()
  await start(a);const firstAbandon=await duplicateAbandon.cancel(a,duplicateAbandonProposal)
  await start(b);const secondAbandon=capture(duplicateAbandon.cancel(b,duplicateAbandonProposal));await waitForLock(observer,b);await a.query('COMMIT')
  assert.deepEqual((await secondAbandon).value,firstAbandon);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_nc_desistimientos_homologacion WHERE solicitud_id=$1',[duplicateAbandonProposal.id])).rows[0].n,1)
  cases.push('028_desistimiento_concurrente_mismo_UUID_un_registro_un_ACK')
  const rollbackAbandon=await creditFixture(173,4),rollbackAbandonProposal=await rollbackAbandon.make()
  await start(a);await rollbackAbandon.cancel(a,rollbackAbandonProposal)
  await start(b);const afterAbandonRollback=capture(rollbackAbandon.write(b,rollbackAbandonProposal));await waitForLock(observer,b);await a.query('ROLLBACK')
  assert.equal((await afterAbandonRollback).value.estado,'SALDO_RESERVADO_NO_EMITIR');await b.query('COMMIT')
  cases.push('028_rollback_desistimiento_no_bloquea_guardado_que_espera')
  await start(a);await rollbackAbandon.cancel(a,rollbackAbandonProposal)
  await start(b);const historyWaiting=capture(b.query('SELECT cargar_historial_nc_homologacion($1,$2,$3,0) v',[rollbackAbandon.auth,rollbackAbandon.sale,rollbackAbandon.operation]));await waitForLock(observer,b);await a.query('COMMIT')
  const recoveredHistory=(await historyWaiting).value.rows[0].v;await b.query('COMMIT')
  assert.equal(recoveredHistory.casos.length,1);assert.equal(recoveredHistory.casos[0].acuse.estado,'CANCELADA');assert.equal(recoveredHistory.casos[0].propuesta.sha256,rollbackAbandonProposal.sha)
  cases.push('029_historial_espera_y_recupera_cancelacion_confirmada')
  for(const f of [abandoned,savedFirst,duplicateAbandon,rollbackAbandon])for(const table of ['movimientos_stock','movimientos_caja','devoluciones_venta'])assert.equal((await observer.query(`SELECT count(*)::int n FROM ${table} WHERE kiosco_id=$1`,[f.kid])).rows[0].n,0)
  creditCommercialInstalledAfterCase=cases.length
  for(let repeat=0;repeat<2;repeat++)await observer.query(readFileSync(join(root,'supabase/pilot-fiscal/030_fiscal_credit_commercial_source.sql'),'utf8'))
  async function commercialFixture(point){
    const f=await creditFixture(point,4),cash=randomUUID(),payment=randomUUID()
    await observer.query('INSERT INTO sesiones_caja(id,kiosco_id,usuario_id) VALUES($1,$2,$3)',[cash,f.kid,f.owner])
    await observer.query('UPDATE ventas SET sesion_caja_id=$1 WHERE id=$2',[cash,f.sale])
    await observer.query("INSERT INTO pagos_venta(id,venta_id,medio_pago,monto) VALUES($1,$2,'EFECTIVO',123.45)",[payment,f.sale])
    const snapshot=(await observer.query(`SELECT jsonb_build_object('version',1,'id',v.id,'kiosco_id',v.kiosco_id,'usuario_id',v.usuario_id,'sesion_caja_id',v.sesion_caja_id,'fecha_hora',v.fecha_hora,'total',v.total,'notas',null,'cliente_id',null,
      'detalles',(SELECT jsonb_agg((to_jsonb(d)-'venta_id')||jsonb_build_object('articulo_libre',null,'componentes','[]'::jsonb) ORDER BY d.id) FROM detalles_venta d WHERE d.venta_id=v.id),
      'pagos',(SELECT jsonb_agg(to_jsonb(p)-'venta_id' ORDER BY p.id) FROM pagos_venta p WHERE p.venta_id=v.id))::text v FROM ventas v WHERE v.id=$1`,[f.sale])).rows[0].v
    await observer.query('INSERT INTO checkout_manual_entradas(id,kiosco_id,usuario_id,entrada,snapshot,autorizado_por_auth_id) VALUES($1,$2,$3,$4::jsonb,$5::jsonb,$6)',[f.sale,f.kid,f.owner,'{"version":1}',snapshot,f.auth])
    await observer.query('INSERT INTO checkout_manuales(id,kiosco_id,venta_id,solicitud,resultado) VALUES($1,$2,$1,$3::jsonb,jsonb_build_object(\'venta_id\',$1::uuid,\'kiosco_id\',$2::uuid,\'total\',123.45))',[f.sale,f.kid,snapshot])
    const product=(await observer.query('SELECT producto_id FROM detalles_venta WHERE venta_id=$1',[f.sale])).rows[0].producto_id
    await observer.query("INSERT INTO movimientos_stock(kiosco_id,producto_id,tipo,cantidad,motivo,notas,usuario_id) VALUES($1,$2,'EGRESO',2,'VENTA',$3,$4)",[f.kid,product,'Checkout manual '+f.sale,f.owner])
    const load=async(client,actor=f.auth)=>(await client.query('SELECT cargar_fuente_comercial_nc_homologacion($1,$2,$3) v',[actor,f.sale,f.operation])).rows[0].v
    return {...f,cash,payment,load}
  }
  const lockedCommercial=await commercialFixture(180)
  await a.query('BEGIN');await a.query('SELECT id FROM checkout_manuales WHERE id=$1 FOR UPDATE',[lockedCommercial.sale])
  await start(b);assert.equal((await capture(lockedCommercial.load(b))).error?.code,'55P03');await b.query('ROLLBACK');await a.query('ROLLBACK')
  await start(b);assert.equal((await lockedCommercial.load(b)).pago_integro_efectivo,true);await b.query('COMMIT')
  cases.push('030_checkout_bloqueado_falla_NOWAIT_sin_invertir_espera_venta_checkout')
  const changedCommercial=await commercialFixture(181)
  await a.query('BEGIN');await a.query('UPDATE pagos_venta SET monto=1 WHERE id=$1',[changedCommercial.payment])
  await start(b);const waitingCommercialPayment=capture(changedCommercial.load(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingCommercialPayment).error?.code,'22023');await b.query('ROLLBACK')
  cases.push('030_pago_cambiado_durante_espera_no_acredita_fuente_comercial')
  const duplicateCommercial=await commercialFixture(182)
  await start(a);const firstCommercialSource=await duplicateCommercial.load(a)
  await start(b);const waitingCommercialSource=capture(duplicateCommercial.load(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.deepEqual((await waitingCommercialSource).value,firstCommercialSource);await b.query('COMMIT')
  assert.equal(firstCommercialSource.unidades_historicas,'NO_REGISTRADAS');assert.equal(firstCommercialSource.reintegro_habilitado,false)
  cases.push('030_dos_lectores_recuperan_misma_fuente_sin_efectos')
  const authCommercial=await commercialFixture(183),nextCommercialAuth=randomUUID()
  await observer.query('INSERT INTO auth.users VALUES($1)',[nextCommercialAuth])
  await a.query('BEGIN');await a.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[nextCommercialAuth,authCommercial.owner])
  await start(b);const waitingCommercialAuth=capture(authCommercial.load(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingCommercialAuth).error?.code,'42501');await b.query('ROLLBACK')
  await start(b);assert.equal((await capture(authCommercial.load(b,nextCommercialAuth))).error?.code,'42501');await b.query('ROLLBACK')
  cases.push('030_Auth_reasignado_esperando_no_revela_pagos_receta_a_ninguna_cuenta')
  for(const f of [lockedCommercial,changedCommercial,duplicateCommercial,authCommercial]){
    assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_nc_borradores_homologacion WHERE operacion_origen_id=$1',[f.operation])).rows[0].n,0)
    assert.equal((await observer.query('SELECT count(*)::int n FROM devoluciones_venta WHERE venta_id=$1',[f.sale])).rows[0].n,0)
  }
  checkoutUnitsInstalledAfterCase=cases.length
  for(let repeat=0;repeat<2;repeat++)await observer.query(readFileSync(join(root,'supabase/pilot-fiscal/031_checkout_unit_evidence.sql'),'utf8'))
  async function unitsFixture(){
    const f=await fixture(),product=randomUUID(),cash=randomUUID(),detail=randomUUID(),payment=randomUUID(),fecha=new Date().toISOString()
    await observer.query('DELETE FROM ventas WHERE id=$1',[f.sale])
    await observer.query("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta,stock_actual) VALUES($1,$2,'Unidad local',124,10)",[product,f.kid])
    await observer.query(`INSERT INTO sesiones_caja(id,kiosco_id,usuario_id,fecha_apertura) VALUES($1,$2,$3,clock_timestamp()-interval '1 minute')`,[cash,f.kid,f.owner])
    await observer.query('INSERT INTO checkout_unidades_config_homologacion(kiosco_id,habilitado) VALUES($1,true)',[f.kid])
    const snapshot={version:1,id:f.sale,kiosco_id:f.kid,usuario_id:f.owner,sesion_caja_id:cash,fecha_hora:fecha,total:124,notas:null,cliente_id:null,
      detalles:[{id:detail,producto_id:product,cantidad:1,precio_unitario:124,subtotal:124,sin_envase:false,precio_envase_unitario:0,es_devolucion_envase:false,articulo_libre:null,componentes:[]}],pagos:[{id:payment,medio_pago:'EFECTIVO',monto:124,referencia:null}]}
    const entry={version:1,checkoutId:f.sale,kioscoId:f.kid,usuarioId:f.owner,sesionCajaId:cash,fechaHora:fecha,clienteId:null,notas:null,tipoAjuste:'NINGUNO',valorAjuste:0,totalEsperado:124,subtotalesEsperados:[124],componentesEsperados:[],lineas:[{tipo:'PRODUCTO',id:product,productoId:product,cantidad:1,sinEnvase:false}],pagos:[{id:payment,medio:'EFECTIVO',montoCentavos:12400,referencia:null}]}
    const prepare=async(client)=>(await client.query('SELECT preparar_checkout_manual($1,$2::jsonb,$3::jsonb,false,15,0::bigint) v',[f.auth,JSON.stringify(entry),JSON.stringify(snapshot)])).rows[0].v
    const close=async(client)=>(await client.query('SELECT confirmar_venta_manual($1,$2::jsonb) v',[f.auth,JSON.stringify(snapshot)])).rows[0].v
    const metadata=async()=>(await observer.query('SELECT datos FROM checkout_unidades_homologacion WHERE checkout_id=$1',[f.sale])).rows[0]?.datos??null
    return {...f,product,prepare,close,metadata}
  }
  const duplicateUnits=await unitsFixture()
  await start(a);const firstUnitAck=await duplicateUnits.prepare(a)
  await start(b);const waitingUnitAck=capture(duplicateUnits.prepare(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.deepEqual((await waitingUnitAck).value,firstUnitAck);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM checkout_unidades_homologacion WHERE checkout_id=$1',[duplicateUnits.sale])).rows[0].n,1)
  cases.push('031_dos_preparadores_mismo_UUID_un_ACK_una_evidencia_unidades')
  const changedUnits=await unitsFixture()
  await start(a);await changedUnits.prepare(a);await a.query('COMMIT')
  await a.query('BEGIN');await a.query("UPDATE productos SET unidad_medida='KG' WHERE id=$1",[changedUnits.product])
  await start(b);const waitingUnitClose=capture(changedUnits.close(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingUnitClose).error?.code,'55000');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT stock_actual::text v FROM productos WHERE id=$1',[changedUnits.product])).rows[0].v,'10.000')
  assert.equal((await observer.query('SELECT count(*)::int n FROM ventas WHERE id=$1',[changedUnits.sale])).rows[0].n,0)
  assert.equal((await changedUnits.metadata()).lineas[0].unidad_medida,'UN')
  cases.push('031_unidad_cambia_durante_espera_cierre_revierte_venta_stock_y_conserva_preparacion')
  const rollbackUnits=await unitsFixture()
  await start(a);await rollbackUnits.prepare(a)
  await b.query('BEGIN');const waitingUnitEdit=capture(b.query("UPDATE productos SET unidad_medida='GR' WHERE id=$1",[rollbackUnits.product]));await waitForLock(observer,b);await a.query('ROLLBACK')
  assert(!(await waitingUnitEdit).error);await b.query('COMMIT');assert.equal(await rollbackUnits.metadata(),null)
  await start(a);await rollbackUnits.prepare(a);await a.query('COMMIT');assert.equal((await rollbackUnits.metadata()).lineas[0].unidad_medida,'GR')
  cases.push('031_rollback_preparacion_no_deja_evidencia_y_libera_edicion_unidad')
  const committedUnits=await unitsFixture()
  await start(a);await committedUnits.prepare(a);await a.query('COMMIT')
  await start(a);const firstUnitClose=await committedUnits.close(a)
  await b.query('BEGIN');const postCloseEdit=capture(b.query("UPDATE productos SET unidad_medida='LT' WHERE id=$1",[committedUnits.product]));await waitForLock(observer,b);await a.query('COMMIT')
  assert(!(await postCloseEdit).error);await b.query('COMMIT')
  await start(a);assert.deepEqual(await committedUnits.close(a),firstUnitClose);await a.query('COMMIT')
  assert.equal((await committedUnits.metadata()).lineas[0].unidad_medida,'UN')
  assert.equal((await observer.query('SELECT stock_actual::text v FROM productos WHERE id=$1',[committedUnits.product])).rows[0].v,'9.000')
  assert.equal((await observer.query("SELECT count(*)::int n FROM movimientos_stock WHERE kiosco_id=$1 AND notas=$2",[committedUnits.kid,'Checkout manual '+committedUnits.sale])).rows[0].n,1)
  cases.push('031_cierre_gana_edicion_posterior_replay_sin_doble_stock_ni_recaptura_unidades')
  creditBindingInstalledAfterCase=cases.length
  for(let repeat=0;repeat<2;repeat++)await observer.query(readFileSync(join(root,'supabase/pilot-fiscal/032_fiscal_credit_commercial_binding.sql'),'utf8'))
  async function bindingFixture(point){
    const f=await commercialFixture(point)
    await start(a);const source=await f.load(a);await a.query('COMMIT')
    // Metadata privada SINTÉTICA para aislar carreras032. Los escenarios031
    // anteriores prueban captura real; no se ejecuta backfill de datos reales.
    const data={version:1,venta_id:f.sale,checkout_sha256:source.checkout_sha256,lineas:source.lineas.map(line=>({detalle_id:line.detalle_id,producto_id:line.producto_id,tipo:line.tipo,es_pesable:false,unidad_medida:'UN',componentes:line.componentes.map(c=>({producto_id:c.producto_id,es_pesable:false,unidad_medida:'UN'}))}))}
    const canonical=(await observer.query('SELECT fiscal_json_canonico_homologacion($1::jsonb) v',[JSON.stringify(data)])).rows[0].v
    await observer.query('INSERT INTO checkout_unidades_homologacion(checkout_id,kiosco_id,actor_auth_id,snapshot_sha256,canonico,datos,unidades_sha256) VALUES($1,$2,$3,$4,$5,$6::jsonb,$7)',[f.sale,f.kid,f.auth,source.checkout_sha256,canonical,JSON.stringify(data),createHash('sha256').update(canonical).digest('hex')])
    return f
  }
  const duplicateBinding=await bindingFixture(190),sameBoundCase=await duplicateBinding.make()
  await start(a);const boundAck=await duplicateBinding.write(a,sameBoundCase)
  await start(b);const waitingBoundAck=capture(duplicateBinding.write(b,sameBoundCase));await waitForLock(observer,b);await a.query('COMMIT')
  assert.deepEqual((await waitingBoundAck).value,boundAck);await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_nc_comercial_homologacion WHERE solicitud_id=$1',[sameBoundCase.id])).rows[0].n,1)
  cases.push('032_dos_workers_mismo_UUID_un_caso_un_vinculo_inmutable')
  const paymentBinding=await bindingFixture(191),badPaymentCase=await paymentBinding.make()
  await a.query('BEGIN');await a.query('SELECT id FROM pagos_venta WHERE id=$1 FOR UPDATE',[paymentBinding.payment])
  await start(b);assert.equal((await capture(paymentBinding.write(b,badPaymentCase))).error?.code,'55P03');await b.query('ROLLBACK');await a.query('ROLLBACK')
  // UPDATE de pagos toma primero venta FOR UPDATE por el guard029 de anulación.
  // Verificar esa espera previa y el rechazo tras COMMIT, además de NOWAIT032.
  await a.query('BEGIN');assert.equal((await a.query('UPDATE pagos_venta SET monto=1 WHERE id=$1',[paymentBinding.payment])).rowCount,1)
  await start(b);const waitingPaymentBinding=capture(paymentBinding.write(b,badPaymentCase));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingPaymentBinding).error?.code,'22023');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_nc_borradores_homologacion WHERE id=$1',[badPaymentCase.id])).rows[0].n,0)
  cases.push('032_pago_bloqueado_NOWAIT_y_cambio_confirmado_no_dejan_caso_ni_vinculo')
  const rollbackBinding=await bindingFixture(192),rolledBoundCase=await rollbackBinding.make()
  await start(a);await rollbackBinding.write(a,rolledBoundCase)
  await start(b);const waitingRollbackBinding=capture(rollbackBinding.write(b,rolledBoundCase));await waitForLock(observer,b);await a.query('ROLLBACK')
  assert.equal((await waitingRollbackBinding).value.estado,'SALDO_RESERVADO_NO_EMITIR');await b.query('COMMIT')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_nc_comercial_homologacion WHERE solicitud_id=$1',[rolledBoundCase.id])).rows[0].n,1)
  cases.push('032_rollback_caso_y_vinculo_no_consume_saldo_para_worker_en_espera')
  const authBinding=await bindingFixture(193),boundActorCase=await authBinding.make(),nextBoundAuth=randomUUID()
  await observer.query('INSERT INTO auth.users VALUES($1)',[nextBoundAuth]);await a.query('BEGIN');await a.query('UPDATE usuarios SET auth_user_id=$1 WHERE id=$2',[nextBoundAuth,authBinding.owner])
  await start(b);const waitingBoundAuth=capture(authBinding.write(b,boundActorCase));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingBoundAuth).error?.code,'42501');await b.query('ROLLBACK')
  assert.equal((await observer.query('SELECT count(*)::int n FROM fiscal_nc_comercial_homologacion WHERE solicitud_id=$1',[boundActorCase.id])).rows[0].n,0)
  cases.push('032_Auth_reasignado_esperando_no_crea_caso_ni_vinculo')
  creditContextInstalledAfterCase=cases.length
  for(let repeat=0;repeat<2;repeat++)await observer.query(readFileSync(join(root,'supabase/pilot-fiscal/033_fiscal_credit_context.sql'),'utf8'))
  async function creditContextFixture(point){
    const f=await bindingFixture(point),proposal=await f.make()
    await start(a);await f.write(a,proposal);await a.query('COMMIT')
    const load=async(client)=>(await client.query('SELECT cargar_contexto_nc_homologacion($1,$2,$3,$4,$5) v',[f.auth,f.sale,f.operation,proposal.id,proposal.sha])).rows[0].v
    return {...f,proposal,load}
  }
  await observer.query(`INSERT INTO fiscal_parametros_nc_homologacion(revision,tipos,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,habilitado)
    VALUES(1,'[{"id":13,"descripcion":"NC C sintética","desde":"20200101","hasta":null}]','[{"id":5,"descripcion":"Condición NC sintética","comprobantes":[13]}]','[]',repeat('c',64),clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour',true)`)
  const dualContext=await creditContextFixture(194)
  await start(a);const firstContext=await dualContext.load(a)
  await start(b);const waitingContext=capture(dualContext.load(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.deepEqual((await waitingContext).value,firstContext);await b.query('COMMIT');assert.equal(firstContext.emision_habilitada,false)
  cases.push('033_dos_lectores_mismo_contexto_ligado_sin_permiso_ni_mutaciones')
  const canceledContext=await creditContextFixture(195)
  await start(a);await canceledContext.cancel(a,canceledContext.proposal)
  await start(b);const waitingCanceledContext=capture(canceledContext.load(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingCanceledContext).error?.code,'42501');await b.query('ROLLBACK')
  cases.push('033_cancelacion_antes_lectura_esperando_no_devuelve_contexto')
  const revokedContext=await creditContextFixture(196)
  await a.query('BEGIN');await a.query('UPDATE fiscal_parametros_nc_homologacion SET habilitado=false WHERE revision=1')
  await start(b);const waitingRevokedContext=capture(revokedContext.load(b));await waitForLock(observer,b);await a.query('COMMIT')
  assert.equal((await waitingRevokedContext).error?.code,'55000');await b.query('ROLLBACK')
  cases.push('033_catalogo_revocado_esperando_no_ofrece_parametros_obsoletos')
  const expiredContext=await creditContextFixture(197)
  await observer.query(`INSERT INTO fiscal_parametros_nc_homologacion SELECT 2,tipos,condiciones,alicuotas,fuente_sha256,clock_timestamp()-interval '1 hour',clock_timestamp()+interval '3 seconds',true FROM fiscal_parametros_nc_homologacion WHERE revision=1`)
  await a.query('BEGIN');await a.query('SELECT revision FROM fiscal_parametros_nc_homologacion WHERE revision=2 FOR UPDATE')
  await start(b);const waitingExpiredContext=capture(expiredContext.load(b));await waitForLock(observer,b)
  const creditContextDeadline=Date.now()+7000;let creditContextExpired=false
  while(Date.now()<creditContextDeadline){creditContextExpired=(await observer.query('SELECT vence_en<=clock_timestamp() expired FROM fiscal_parametros_nc_homologacion WHERE revision=2')).rows[0].expired;if(creditContextExpired)break;await delay(40)}
  assert(creditContextExpired);await a.query('COMMIT');assert.equal((await waitingExpiredContext).error?.code,'22023');await b.query('ROLLBACK')
  cases.push('033_catalogo_vence_durante_ultimo_lock_no_devuelve_contexto_vigente')
  const version=(await observer.query('SHOW server_version')).rows[0].server_version
  assert.equal(transportErrors.length,0,'No aceptar un ensayo con conexiones perdidas.')
  evidence={status:'PASS',environment:'PostgreSQL local sintético; no JWT hospedado ni ARCA',
    testedAt:new Date().toISOString(),postgresVersion:version,image,containerId,containerName:name,port,
    cases,caseCount:cases.length,requiredPresentationInstalledAfterCase,postRequiredPresentationCaseCount:requiredPresentationInstalledAfterCase===null?0:cases.length-requiredPresentationInstalledAfterCase,creditDraftInstalledAfterCase,postCreditDraftCaseCount:creditDraftInstalledAfterCase===null?0:cases.length-creditDraftInstalledAfterCase,creditRecoveryInstalledAfterCase,postCreditRecoveryCaseCount:creditRecoveryInstalledAfterCase===null?0:cases.length-creditRecoveryInstalledAfterCase,creditCommercialInstalledAfterCase,postCreditCommercialCaseCount:creditCommercialInstalledAfterCase===null?0:cases.length-creditCommercialInstalledAfterCase,checkoutUnitsInstalledAfterCase,postCheckoutUnitsCaseCount:checkoutUnitsInstalledAfterCase===null?0:cases.length-checkoutUnitsInstalledAfterCase,creditBindingInstalledAfterCase,postCreditBindingCaseCount:creditBindingInstalledAfterCase===null?0:cases.length-creditBindingInstalledAfterCase,creditContextInstalledAfterCase,postCreditContextCaseCount:creditContextInstalledAfterCase===null?0:cases.length-creditContextInstalledAfterCase,externalRequests:0,invoicesIssued:0}
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
