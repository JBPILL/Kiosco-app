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
    join(root,'supabase/pilot-fiscal/005_fiscal_worker_authorization.sql'),join(root,'supabase/pilot-fiscal/006_fiscal_shared_tickets.sql'),join(root,'supabase/pilot-fiscal/007_fiscal_ticket_recovery.sql'),join(root,'supabase/pilot-fiscal/008_fiscal_ticket_ownership.sql'),join(root,'supabase/pilot-fiscal/009_fiscal_emission_permission.sql'),join(root,'supabase/pilot-fiscal/010_fiscal_return_exclusion.sql'),join(root,'supabase/pilot-fiscal/011_fiscal_owner_review.sql'),join(root,'supabase/pilot-fiscal/012_fiscal_preparation.sql'),join(root,'supabase/pilot-fiscal/013_fiscal_preparation_source.sql'),join(root,'supabase/pilot-fiscal/014_fiscal_receipt.sql'),join(root,'supabase/pilot-fiscal/015_fiscal_emission_receipts.sql'),join(root,'supabase/pilot-fiscal/016_fiscal_diagnosis.sql')]) {
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
  async function preparationFixture(point) {
    const f=await fixture(),product=randomUUID(),operation=randomUUID()
    await observer.query("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta) VALUES($1,$2,'Ensayo',123.45)",[product,f.kid])
    await observer.query('INSERT INTO detalles_venta(venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,1,123.45,123.45)',[f.sale,product])
    await observer.query('INSERT INTO fiscal_emisores_homologacion(kiosco_id,cuit_emisor,punto_venta,credencial_id,certificado_sha256,habilitado) VALUES($1,$2,$3,$4,$5,true)',[f.kid,issuer,point,randomUUID(),'c'.repeat(64)])
    const datos={version:1,entorno:'HOMOLOGACION',cuitEmisor:issuer,puntoVenta:point,tipoComprobante:11,concepto:1,tipoDocumento:99,numeroDocumento:'0',condicionIvaReceptor:5,
      fecha:'20261021',servicioDesde:null,servicioHasta:null,vencimientoPago:null,moneda:'PES',cotizacion:'1',importes:{total:'123.45',neto:'123.45',iva:'0.00',noGravado:'0.00',exento:'0.00',tributos:'0.00'},iva:[],tributos:[]}
    const canonical=JSON.stringify({version:1,venta_id:f.sale,condicionEmisor:'MONOTRIBUTO',revision_parametros:1,datos})
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
  const resolvingPreparation=await preparationFixture(95)
  await start(a);await savePreparation(a,resolvingPreparation)
  await start(b);const waitingResolution=capture(b.query('SELECT resolver_preparacion_fiscal_homologacion($1,$2) ack',[resolvingPreparation.auth,resolvingPreparation.sale]))
  await waitForLock(observer,b);await a.query('COMMIT')
  const resolvedPreparation=await waitingResolution;assert(!resolvedPreparation.error)
  assert.equal(resolvedPreparation.value.rows[0].ack.estado,'DATOS_PREPARADOS');assert.equal(resolvedPreparation.value.rows[0].ack.operacion_id,resolvingPreparation.operation);await b.query('COMMIT')
  cases.push('resolver_espera_guardado_y_recupera_identidad_original')
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
