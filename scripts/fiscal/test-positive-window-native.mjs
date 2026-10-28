// Local PostgreSQL + REAL fiscal HTTP/SQL/custody pipeline, SYNTHETIC Auth/ARCA.
// No .env, original certificate/key, real credential or external request.
import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { existsSync, readFileSync, readdirSync, writeFileSync, mkdtempSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
import pg from 'pg'
import { ContentInfo, SignedData, CryptoEngine } from 'pkijs'
import { syntheticEncryptedCustody } from '../../src/test/fixtures/fiscalEncryptedCustody.ts'
import { positivePlanFixture } from '../../src/test/fixtures/fiscalPositivePlan.ts'
import { wsfeLast } from '../../src/test/fixtures/fiscalWsfe.ts'
import { createFiscalHttpHandler } from '../../supabase/functions/_shared/fiscalHttp.ts'
import { planFiscalPreparationToggle } from '../plan-fiscal-preparation-toggle.mjs'
import { positiveWindowReadOnlySql, createPositiveWindowDatabase } from '../fiscal-positive-window-database.mjs'
import { executePositiveWindow } from '../fiscal-positive-window-operator.mjs'
import { authenticatePrivateOwner } from '../fiscal-private-owner-session.mjs'
import { createPreparationManagement } from '../fiscal-preparation-management.mjs'
import { buildPositiveWindowPackage } from '../fiscal-positive-window-package.mjs'
import { executePrivateWindowPacket } from '../fiscal-positive-window-private.mjs'

if(!process.argv.includes('--run-local'))throw Error('LOCAL_ONLY_REQUIRED')
const root=resolve(import.meta.dirname,'../..'), name='kiosko-positive-local-'+randomUUID().slice(0,8)
const evidenceIndex=process.argv.indexOf('--evidence'), path=evidenceIndex<0?null:resolve(process.argv[evidenceIndex+1]??'')
if(!path||!path.endsWith('.json')||existsSync(path))throw Error('FRESH_EVIDENCE_PATH_REQUIRED')
const sha=value=>createHash('sha256').update(value).digest('hex')
const docker=args=>execFileSync('docker',args,{encoding:'utf8',timeout:60000,stdio:['ignore','pipe','pipe']}).trim()
const clients=[], cases=[], rpcFailures=[]
let created=false,containerId,port,stage='DOCKER',evidence
const runtimeRoot=mkdtempSync(join(tmpdir(),'kiosko-positive-native-')) // Safe journals retained as evidence.
async function connect(database='postgres'){
  const client=new pg.Client({host:'127.0.0.1',port,user:'postgres',database,application_name:'kiosko-positive-native',connectionTimeoutMillis:3000,query_timeout:20000})
  client.on('error',()=>{})
  await client.connect();clients.push(client);return client
}
const escape=value=>value.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;')
const deferred=()=>{let resolve;const promise=new Promise(done=>{resolve=done});return{promise,resolve}}
const rpcAllowed=new Set(['autorizar_consulta_fiscal_homologacion','resolver_preparacion_fiscal_homologacion','cargar_datos_preparacion_homologacion',
  'guardar_datos_preparacion_homologacion','cargar_fuente_preparacion_homologacion','persistir_preparacion_fiscal_homologacion',
  'cargar_revision_fiscal_homologacion','solicitar_ta_homologacion','cancelar_preparacion_ta_homologacion','iniciar_envio_ta_homologacion','confirmar_ta_homologacion'])
try{
  docker(['image','inspect','postgres:17-alpine','--format','{{.Id}}'])
  containerId=docker(['run','--pull=never','--detach','--name',name,'--label','kioskopos.fiscal.test=positive-window-native',
    '--publish','127.0.0.1::5432','--env','POSTGRES_HOST_AUTH_METHOD=trust','--env','POSTGRES_DB=kiosko_window_template','postgres:17-alpine'])
  created=true
  writeFileSync(path,JSON.stringify({status:'RUNNING',containerId,containerName:name,runtimeRoot,startedAt:new Date().toISOString()},null,2)+'\n',{flag:'wx'})
  const binding=JSON.parse(docker(['inspect',name,'--format','{{json .NetworkSettings.Ports}}']))['5432/tcp']
  assert.equal(binding.length,1);assert.equal(binding[0].HostIp,'127.0.0.1');port=Number(binding[0].HostPort)
  const deadline=Date.now()+60000
  let admin
  while(Date.now()<deadline){try{admin=await connect();break}catch{await new Promise(done=>setTimeout(done,250))}}
  assert(admin,'POSTGRES_NOT_READY')
  stage='TEMPLATE'
  const template=await connect('kiosko_window_template')
  await template.query(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role;CREATE SCHEMA auth;CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.role',true),'') $$;`)
  const bootstrap=join(root,'supabase/bootstrap'), fiscal=join(root,'supabase/pilot-fiscal')
  const fiscalFiles=readdirSync(fiscal).filter(file=>/^\d{3}_.+\.sql$/.test(file)).sort()
  assert.equal(fiscalFiles.length,54)
  const load=async file=>{stage='INSTALL_'+file.split(/[\\/]/).at(-1);await template.query(readFileSync(file,'utf8'))}
  for(const file of [join(bootstrap,'001_domain.sql'),join(bootstrap,'002_identity_helpers.sql'),...readdirSync(join(bootstrap,'steps')).sort().map(file=>join(bootstrap,'steps',file)),join(bootstrap,'900_final_security.sql')])await load(file)
  for(const file of fiscalFiles.slice(0,24))await load(join(fiscal,file))
  await load(join(bootstrap,'commercial/001_commercial_subscription.sql'))
  const gate=readFileSync(join(bootstrap,'commercial/002_commercial_write_gate.sql'),'utf8')
  await template.query(gate.slice(gate.indexOf('CREATE OR REPLACE FUNCTION public.exigir_comercio_operativo'),gate.indexOf('CREATE OR REPLACE FUNCTION public.validar_escritura_comercial_operativa')))
  for(const file of ['supabase/bootstrap/pilot-operations/001_capabilities.sql','supabase_fase_devolucion_registro_privado.sql','supabase_fase_devolucion_calculo_historico.sql','supabase_fase_devolucion_preparacion_privada.sql','supabase/bootstrap/returns/001_atomic_cash_return.sql','supabase/bootstrap/returns/003_whole_unit_quantities.sql'])await load(join(root,file))
  for(const file of fiscalFiles.slice(24))await load(join(fiscal,file))
  await template.end()
  const custody=await syntheticEncryptedCustody(),keyId=randomUUID(),keyValue=Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString('base64')
  let fixtureIndex=0
  async function fixture(mode){
    stage='FIXTURE_'+mode
    const database='kiosko_window_'+(++fixtureIndex)
    await admin.query('CREATE DATABASE '+database+' TEMPLATE kiosko_window_template')
    const writer=await connect(database),observer=await connect(database),rpc=await connect(database),profile=await connect(database)
    const {config,snapshot}=positivePlanFixture(),now=Date.now()
    config.now=new Date(now-5000).toISOString();config.startsAt=new Date(now-1000).toISOString();config.endsAt=new Date(now+600000).toISOString();config.taNotBefore=new Date(now-2000).toISOString()
    if(mode==='expire-after-open')config.endsAt=new Date(now+15000).toISOString()
    snapshot.observed_at=config.now;snapshot.catalog.consultado_en=new Date(now-10000).toISOString();snapshot.catalog.vence_en=new Date(now+7200000).toISOString()
    snapshot.issuer.credencial_id=custody.binding.credencial_id;snapshot.issuer.certificado_sha256=custody.binding.certificado_sha256;snapshot.issuer.actualizado_en=new Date(now-60000).toISOString()
    const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Argentina/Buenos_Aires',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now)
    config.invoice.datos.fecha=['year','month','day'].map(key=>parts.find(part=>part.type===key).value).join('')
    await observer.query('INSERT INTO auth.users VALUES($1)',[config.ownerAuthId])
    await observer.query("INSERT INTO kioscos(id,nombre) VALUES($1,'Synthetic window')",[config.kioskId])
    await observer.query("INSERT INTO usuarios(auth_user_id,kiosco_id,nombre,rol) VALUES($1,$2,'Synthetic owner','DUEÑO')",[config.ownerAuthId,config.kioskId])
    const user=(await observer.query('SELECT id FROM usuarios WHERE auth_user_id=$1',[config.ownerAuthId])).rows[0].id
    await observer.query('INSERT INTO ventas(id,kiosco_id,usuario_id,fecha_hora,total) VALUES($1,$2,$3,$4,$5)',[snapshot.sale.id,config.kioskId,user,snapshot.sale.fecha_hora,snapshot.sale.total])
    const line=snapshot.details[0]
    await observer.query("INSERT INTO productos(id,kiosco_id,descripcion,precio_venta,stock_actual) VALUES($1,$2,'Synthetic article',200,1)",[line.producto_id,config.kioskId])
    await observer.query('INSERT INTO detalles_venta(id,venta_id,producto_id,cantidad,precio_unitario,subtotal) VALUES($1,$2,$3,$4,$5,$6)',[line.id,snapshot.sale.id,line.producto_id,line.cantidad,line.precio_unitario,line.subtotal])
    await observer.query('INSERT INTO fiscal_emisores_homologacion SELECT * FROM jsonb_populate_record(NULL::fiscal_emisores_homologacion,$1::jsonb)',[JSON.stringify(snapshot.issuer)])
    await observer.query('INSERT INTO fiscal_parametros_homologacion SELECT * FROM jsonb_populate_record(NULL::fiscal_parametros_homologacion,$1::jsonb)',[JSON.stringify(snapshot.catalog)])
    await observer.query('INSERT INTO fiscal_parametros_homologacion SELECT 1,condiciones,alicuotas,fuente_sha256,consultado_en,vence_en,false FROM fiscal_parametros_homologacion')
    config.snapshotText=JSON.stringify(snapshot);config.snapshotSha256=sha(config.snapshotText)
    const plan=await planFiscalPreparationToggle(config),hash=plan.data.manifest.planSha256
    await observer.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;SET LOCAL TIME ZONE 'UTC'")
    const baseline=(await observer.query(positiveWindowReadOnlySql,[config.ownerAuthId,config.kioskId,snapshot.sale.id,config.operationId,snapshot.issuer.certificado_sha256])).rows[0]
    await observer.query('ROLLBACK')
    const db=await createPositiveWindowDatabase({client:writer,observer,config,historySha256:mode==='capture-baseline'?null:baseline.history_sha256,commercialSha256:mode==='capture-baseline'?null:baseline.commercial_sha256})
    await rpc.query("SET ROLE service_role;SELECT set_config('request.jwt.claim.role','service_role',false)")
    const secrets=new Map(Object.entries({...custody.secrets,ARCA_HOMO_BACKEND_ENABLED:'false',ARCA_HOMO_TA_ACTIVE_KEY_ID:keyId,['ARCA_HOMO_TA_KEY_'+keyId.replaceAll('-','').toUpperCase()]:keyValue}))
    const issued=Math.floor(Date.now()/1000),jwt=[Buffer.from('{"alg":"ES256"}').toString('base64url'),Buffer.from(JSON.stringify({sub:config.ownerAuthId,iss:'https://acoyfwwmhaeruciyedri.supabase.co/auth/v1',aud:'authenticated',role:'authenticated',iat:issued,exp:issued+(mode==='expired-jwt'?-1:3600)})).toString('base64url'),'synthetic_signature'].join('.')
    const calls={wsaa:0,number:0,forbidden:0,cmsVerified:0,open:0,close:0},openPause=deferred(),openStarted=deferred(),numberPause=deferred(),numberStarted=deferred(),wsaaPause=deferred(),wsaaStarted=deferred(),workers=[]
    let loggedOut=false
    const adminAdapter={auth:{getUser:async token=>({data:{user:!loggedOut&&token===jwt?{id:config.ownerAuthId}:null},error:null})},rpc:async(name,args)=>{
      assert(rpcAllowed.has(name),'UNAPPROVED_RPC')
      const keys=Object.keys(args);assert(keys.every(key=>/^p_[a-z_]+$/.test(key)),'UNAPPROVED_RPC_ARGUMENT')
      try{
        const sql='SELECT public.'+name+'('+keys.map((key,index)=>key+'=> $'+(index+1)).join(',')+') AS data'
        const result=await rpc.query(sql,keys.map(key=>args[key]!==null&&typeof args[key]==='object'?JSON.stringify(args[key]):args[key]))
        return{data:result.rows[0].data,error:null}
      }catch(error){rpcFailures.push({mode,name,code:/^[0-9A-Z]{5}$/.test(error.code??'')?error.code:'PRIVATE_RPC_ERROR'});return{data:null,error:Error('SYNTHETIC_RPC_NOT_CONFIRMED')}}
    }}
    const fiscalTransport=async input=>{
      const request=input instanceof Request?input:new Request(input)
      const action=request.headers.get('SOAPAction')??''
      if(action.includes('FECAESolicitar')){calls.forbidden++;throw Error('EMISSION_FORBIDDEN')}
      if(request.url==='https://wsaahomo.afip.gov.ar/ws/services/LoginCms'){
        calls.wsaa++
        const soap=await request.text(),cms=soap.match(/<in0>([A-Za-z0-9+/=]+)<\/in0>/)?.[1];assert(cms,'CMS_REQUIRED')
        const content=ContentInfo.fromBER(new Uint8Array(Buffer.from(cms,'base64'))),signed=new SignedData({schema:content.content})
        assert.equal(await signed.verify({signer:0,checkChain:false},new CryptoEngine({name:'native-local-cms',crypto})),true);calls.cmsVerified++
        const tra=new TextDecoder().decode(signed.encapContentInfo.eContent.getValue()),id=tra.match(/<uniqueId>([0-9]+)<\/uniqueId>/)?.[1];assert(id,'TRA_ID_REQUIRED')
        if(mode==='wsaa-uncertain')throw Error('SYNTHETIC_WSAA_UNCERTAIN_NO_RETRY')
        wsaaStarted.resolve()
        if(mode==='late-wsaa')await wsaaPause.promise
        const inner=`<loginTicketResponse version="1.0"><header><source>CN=wsaa,O=AFIP,C=AR,SERIALNUMBER=CUIT 33693450239</source><destination>SERIALNUMBER=CUIT 20123456786,CN=Kiosko Synthetic</destination><uniqueId>${id}</uniqueId><generationTime>${new Date(Date.now()-30000).toISOString()}</generationTime><expirationTime>${new Date(Date.now()+3600000).toISOString()}</expirationTime></header><credentials><token>SYNTHETIC_PRIVATE_TOKEN</token><sign>SYNTHETIC_PRIVATE_SIGN</sign></credentials></loginTicketResponse>`
        return new Response(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><w:loginCmsResponse xmlns:w="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escape(inner)}</loginCmsReturn></w:loginCmsResponse></s:Body></s:Envelope>`,{headers:{'Content-Type':'text/xml'}})
      }
      assert.equal(request.url,'https://wswhomo.afip.gov.ar/wsfev1/service.asmx');assert(action.includes('FECompUltimoAutorizado'),'ONLY_NUMBER_QUERY_ALLOWED')
      calls.number++;numberStarted.resolve()
      if(mode==='late-numbering')await numberPause.promise
      return new Response(wsfeLast(0),{headers:{'Content-Type':'text/xml'}})
    }
    const endpoint='https://acoyfwwmhaeruciyedri.supabase.co',managementUrl='https://api.supabase.com/v1/projects/acoyfwwmhaeruciyedri/secrets'
    const fetcher=async(url,init)=>{
      const target=String(url)
      if(target===managementUrl){
        if(init.method==='GET')return Response.json([...secrets].map(([name,value])=>({name,value:sha(value)})))
        const rows=JSON.parse(init.body);assert.equal(rows.length,1);assert(['ARCA_HOMO_BACKEND_ENABLED','ARCA_HOMO_DATA_PREPARATION_ENABLED','ARCA_HOMO_PREPARATION_ENABLED'].includes(rows[0].name),'FORBIDDEN_FLAG')
        secrets.set(rows[0].name,rows[0].value);return new Response(null,{status:204})
      }
      assert(target.startsWith(endpoint+'/'),'UNEXPECTED_EXTERNAL_REQUEST')
      if(target.endsWith('/token?grant_type=password'))return Response.json({access_token:jwt})
      if(target.endsWith('/auth/v1/user'))return loggedOut?Response.json({}, {status:401}):Response.json({id:config.ownerAuthId})
      if(target.includes('/rest/v1/usuarios?')){
        await profile.query('BEGIN;SET LOCAL ROLE authenticated')
        try{
          await profile.query("SELECT set_config('request.jwt.claim.role','authenticated',true),set_config('request.jwt.claim.sub',$1,true)",[config.ownerAuthId])
          const result=await profile.query('SELECT auth_user_id,kiosco_id,rol,activo,es_superadmin FROM usuarios WHERE auth_user_id=$1',[config.ownerAuthId])
          return Response.json(result.rows)
        }finally{await profile.query('ROLLBACK')}
      }
      if(target.endsWith('/logout?scope=local')){loggedOut=true;return new Response(null,{status:204})}
      assert(target.endsWith('/functions/v1/arca-homologacion'),'UNEXPECTED_ENDPOINT')
      // Model an in-flight Edge request with its OLD environment snapshot.
      const requestSecrets=new Map(secrets),handler=createFiscalHttpHandler({readSecret:name=>requestSecrets.get(name),createAdmin:()=>adminAdapter,fetcher:fiscalTransport})
      const handling=handler(new Request(target,init)),command=JSON.parse(init.body)
      if(mode==='late-numbering'&&command.accion==='PREPARAR_COMPROBANTE'){
        workers.push(handling);await numberStarted.promise;throw Error('SYNTHETIC_LOST_INFLIGHT_ACK')
      }
      if(mode==='late-wsaa'&&command.accion==='PREPARAR_COMPROBANTE'){
        workers.push(handling);await wsaaStarted.promise;throw Error('SYNTHETIC_LOST_WSAA_ACK')
      }
      const response=await handling
      if(mode==='body-ack'&&command.accion==='PREPARAR_COMPROBANTE'&&response.status===200){await response.body.cancel();throw Error('SYNTHETIC_LOST_BODY_ACK')}
      return response
    }
    const management=createPreparationManagement({token:'sbp_fcSYNTHETIC_ONLY_NEVER_REAL',credentialId:custody.binding.credencial_id,taKeyId:keyId},{fetcher})
    const ports={client:writer,now:Date.now,db:{...db,
      executeOpen:async sql=>{
        calls.open++;if(mode==='concurrent'){openStarted.resolve();await openPause.promise}await db.executeOpen(sql)
        if(mode==='revoke-after-open')await observer.query('UPDATE usuarios SET activo=false WHERE auth_user_id=$1',[config.ownerAuthId])
        if(mode==='suspend-after-open')await observer.query("UPDATE kioscos SET estado_suscripcion='SUSPENDIDO' WHERE id=$1",[config.kioskId])
        if(mode==='expire-after-open')await observer.query('SELECT pg_sleep(GREATEST(0,EXTRACT(EPOCH FROM ($1::timestamptz-clock_timestamp())))+0.05)',[config.endsAt])
        if(mode==='open-ack')throw Error('SYNTHETIC_LOST_OPEN_ACK')
      },
      executeClose:async(sql,receipt)=>{calls.close++;await db.executeClose(sql,receipt);if(mode==='close-ack')throw Error('SYNTHETIC_LOST_CLOSE_ACK')},
    },management,
      authenticateOwner:requests=>authenticatePrivateOwner({email:'synthetic@example.test',password:'synthetic_only',publicKey:'sb_publishable_synthetic',expectedOwnerAuthId:config.ownerAuthId,expectedKioskId:config.kioskId},{fetcher,approvedRequests:requests}),
      // The remote backend has its OWN RPC/Auth connections. Keep those alive
      // while testing late responses; operator disposal must not kill a server
      // and thereby manufacture a misleading "no late write" PASS.
      dispose:async()=>{await Promise.allSettled([writer,observer].map(client=>client.end()))},
    }
    const input={config,approvedHash:hash,authorizedScope:'PRIMERA_VENTANA_POSITIVA_SIN_EMISION',journalPath:join(runtimeRoot,database+'.jsonl')}
    const runPrivatePacket=async()=>{
      const proposal=await buildPositiveWindowPackage({config,historySha256:mode==='capture-baseline'?null:baseline.history_sha256,commercialSha256:mode==='capture-baseline'?null:baseline.commercial_sha256,taKeyId:keyId})
      let result
      const marker=await executePrivateWindowPacket({packageText:JSON.stringify(proposal),approvedPackageHash:proposal.packageSha256,
        authorizedScope:'PRIMERA_VENTANA_POSITIVA_SIN_EMISION',exclusiveWriteConfirmed:true,journalPath:input.journalPath,rootCertificate:'SYNTHETIC_ONLY_NO_EXTERNAL_TLS',
        credentials:{publicKey:'sb_publishable_synthetic',email:'synthetic@example.test',password:'synthetic',postgresPassword:'synthetic',managementToken:'sbp_fcSYNTHETIC_ONLY_NEVER_REAL'}},
        {checkDirectory:async()=>{},connect:async()=>({client:writer,observer,dispose:ports.dispose}),database:async()=>ports.db,
          management:()=>management,authenticate:(_credentials,options)=>ports.authenticateOwner(options.approvedRequests),
          execute:async(...args)=>{result=await executePositiveWindow(...args);return result}})
      assert(result,'PRIVATE_PACKET_MUST_REACH_UNIFIED_OPERATOR')
      assert.equal(marker.startsWith('WINDOW_OPERATOR_PASS '),result.passed)
      return result
    }
    return{ports,input,calls,database,db,openStarted,openPause,numberPause,wsaaPause,workers,observer,baseline,runPrivatePacket}
  }
  for(const mode of ['normal','capture-baseline','open-ack','body-ack','close-ack','late-numbering','late-wsaa','wsaa-uncertain','expired-jwt','revoke-after-open','suspend-after-open','expire-after-open']){
    const f=await fixture(mode);stage='CYCLE_'+mode
    const result=await f.runPrivatePacket()
    evidence={safeLastResult:result}
    if(mode==='expired-jwt'){assert.equal(result.passed,false);assert.equal(f.calls.open,0);assert.equal(f.calls.wsaa,0)}
    else if(['revoke-after-open','suspend-after-open','expire-after-open'].includes(mode)){
      assert.equal(result.passed,false);assert.equal(result.cleanupConfirmed,true);assert.equal(f.calls.open,1);assert.equal(f.calls.close,1);assert.equal(f.calls.wsaa,0);assert.equal(f.calls.number,0)
    }
    else if(mode==='late-numbering'||mode==='late-wsaa'||mode==='wsaa-uncertain'){
      assert.equal(result.passed,false);assert.equal(result.cleanupConfirmed,true)
      if(mode==='late-numbering'){f.numberPause.resolve();await Promise.all(f.workers)}
      if(mode==='late-wsaa'){f.wsaaPause.resolve();await Promise.all(f.workers)}
      const check=await connect(f.database)
      assert.equal((await check.query('SELECT count(*)::int n FROM fiscal_solicitudes_homologacion')).rows[0].n,0)
      assert.equal((await check.query('SELECT count(*)::int n FROM fiscal_reservas_homologacion')).rows[0].n,0)
      assert.equal((await check.query('SELECT count(*)::int n FROM fiscal_autorizaciones_homologacion')).rows[0].n,0)
      assert.equal(f.calls.wsaa,1)
      if(mode==='wsaa-uncertain'||mode==='late-wsaa')assert.equal(f.calls.number,0)
    }else{
      assert.equal(result.passed,true);assert.equal(result.cleanupConfirmed,true);assert.equal(f.calls.open,1);assert.equal(f.calls.close,1)
      assert.equal(f.calls.wsaa,1);assert.equal(f.calls.number,1);assert.equal(f.calls.cmsVerified,1)
      const check=await connect(f.database)
      const oldPlan=await planFiscalPreparationToggle(f.input.config)
      await check.query("SELECT set_config('kioskopos.window_target','acoyfwwmhaeruciyedri',false),set_config('kioskopos.window_plan',$1,false)",[f.input.approvedHash])
      let rejected=false;try{await check.query(oldPlan.activationSql)}catch{rejected=true;await check.query('ROLLBACK')}
      assert(rejected,'POST_CLOSE_REPLAY_MUST_REJECT')
      const journal=readFileSync(f.input.journalPath,'utf8')
      assert(journal.includes(f.baseline.history_sha256)&&journal.includes(f.baseline.commercial_sha256),'FRESH_BASELINE_METADATA_RECORDED')
      assert(!journal.includes('SYNTHETIC_PRIVATE_TOKEN')&&!journal.includes('SYNTHETIC_PRIVATE_SIGN')&&!journal.includes('-----BEGIN'),'PRIVATE_MATERIAL_NOT_PERSISTED')
      assert.equal((await check.query("SELECT position('SYNTHETIC_PRIVATE_TOKEN' in cifrado::text)=0 AND position('SYNTHETIC_PRIVATE_SIGN' in cifrado::text)=0 AS encrypted_only FROM fiscal_ta_homologacion")).rows[0].encrypted_only,true)
    }
    assert.equal(f.calls.forbidden,0);cases.push({mode,passed:true,wsaaSimulated:f.calls.wsaa,numberSimulated:f.calls.number,emissions:0})
    console.log('LOCAL_NATIVE_WINDOW_CASE=PASS mode='+mode)
  }
  {
    const f=await fixture('concurrent');stage='CYCLE_concurrent'
    const first=executePositiveWindow(f.input,f.ports)
    await f.openStarted.promise
    const secondWriter=await connect(f.database),secondObserver=await connect(f.database)
    const secondDb=await createPositiveWindowDatabase({client:secondWriter,observer:secondObserver,config:f.input.config,
      historySha256:f.baseline.history_sha256,commercialSha256:f.baseline.commercial_sha256})
    const secondInput={...f.input,journalPath:join(runtimeRoot,'concurrent-second.jsonl')}
    const second=await executePositiveWindow(secondInput,{...f.ports,client:secondWriter,db:secondDb,
      dispose:async()=>{await Promise.allSettled([secondWriter,secondObserver].map(client=>client.end()))}})
    assert.equal(second.passed,false);assert.equal(existsSync(secondInput.journalPath),false)
    f.openPause.resolve()
    const result=await first;assert.equal(result.passed,true);assert.equal(f.calls.open,1);assert.equal(f.calls.wsaa,1);assert.equal(f.calls.forbidden,0)
    cases.push({mode:'concurrent',passed:true,wsaaSimulated:1,numberSimulated:1,emissions:0})
    console.log('LOCAL_NATIVE_WINDOW_CASE=PASS mode=concurrent')
  }
  const serverVersion=(await admin.query('SHOW server_version')).rows[0].server_version
  evidence={status:'PASS',serverVersion,testedAt:new Date().toISOString(),environment:'PostgreSQL17 + real private packet/operator/HTTP/SQL/custody; synthetic Auth/ARCA, NOT hosted acceptance',
    containerId,containerName:name,runtimeRoot,cases,rpcFailures,externalRequests:0,realArcaCalls:0,emissions:0,cae:0}
}catch(error){
  evidence={...evidence,status:'FAIL',stage,code:/^[0-9A-Z_]{1,50}$/.test(error.code??'')?error.code:error.name,containerId,containerName:name,runtimeRoot,cases,rpcFailures,externalRequests:0,realArcaCalls:0,emissions:0}
  process.exitCode=1;console.error('LOCAL_NATIVE_WINDOW=NOT_CONFIRMED stage='+stage+' code='+evidence.code)
}finally{
  await Promise.allSettled(clients.map(async client=>{await client.query('ROLLBACK').catch(()=>{});await client.end()}))
  if(created){try{
    assert.equal(docker(['inspect',name,'--format','{{index .Config.Labels "kioskopos.fiscal.test"}}']),'positive-window-native')
    docker(['stop','--time','5',name]);evidence.cleanup='own container stopped; synthetic DB/journals retained'
  }catch{if(evidence){evidence.status='FAIL';evidence.cleanup='NOT_CONFIRMED'}process.exitCode=1}}
  if(evidence)writeFileSync(path,JSON.stringify(evidence,null,2)+'\n')
}
