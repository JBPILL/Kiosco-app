// @vitest-environment node
import {beforeEach,afterEach,expect,it,vi} from 'vitest'
import {mkdtempSync,rmSync,readFileSync,writeFileSync,existsSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,dirname,resolve} from 'node:path'
import {executePrivateRestorePacket} from '../../scripts/backup/restore-private-executor.mjs'
import {buildRestoreExecutionPackage,RESTORE_CAPTURE_SCOPE,RESTORE_EXECUTION_SCOPE} from '../../scripts/backup/restore-execution-package.mjs'
import {createRestoreJournal,RestoreJournal,inspectRestoreJournal,inspectUncertainRestoreAction,prepareRestoreRecoveryReview,settleReviewedRestoreRecovery,PLAN_HASH,loadRestorePlan,valueHash} from '../../scripts/backup/restore-acceptance-engine.mjs'
import {buildUncertainRestoreReadSql,decodeUncertainRestoreRead} from '../../scripts/backup/restore-acceptance-recovery.mjs'
import {writeRestorePreservationBaseline,RESTORE_PRESERVATION_TABLES,RESTORE_PRESERVATION_SCOPE_HASH} from '../../scripts/backup/restore-preservation.mjs'
import type {RestoreReadOnlyPort} from '../../scripts/backup/restore-readonly-postgres.mjs'
const actors={OWNER:'11111111-1111-4111-8111-111111111111',CASHIER:'22222222-2222-4222-8222-222222222222'},plan=loadRestorePlan()
const now=Date.parse('2026-11-01T12:00:00.000Z'),secret='SYNTHETIC_PRIVATE_NEVER_OUTPUT'
let folder:string,journal:RestoreJournal,clock:number,disposed:number,rpc:number,logout:number,auth:number,reads:number
beforeEach(()=>{folder=mkdtempSync(join(tmpdir(),'restore-executor-'));journal=createRestoreJournal(join(folder,'journal.jsonl'),actors);clock=now;disposed=0;rpc=0;logout=0;auth=0;reads=0})
afterEach(()=>{vi.unstubAllEnvs();if(dirname(folder)!==resolve(tmpdir())||!folder.includes('restore-executor-'))throw Error('Unsafe cleanup');rmSync(folder,{recursive:true,force:true})})
const observation=()=>({read_only:'on',query_role:'postgres',observed_at:new Date(now).toISOString(),server_version:'17.11',scope_hash:RESTORE_PRESERVATION_SCOPE_HASH,plan_hash:PLAN_HASH,tables:RESTORE_PRESERVATION_TABLES.map(name=>({name,count:0,sha256:'a'.repeat(64)}))})
function packet(role='CAPTURE',baselineHash:string|null=null){
 const backup={directory:'pre-restore-acceptance-synthetic12345',archive:'synthetic.dump',archiveHash:'a'.repeat(64),rolesHash:'b'.repeat(64),contextHash:'c'.repeat(64),createdAt:new Date(now-1000).toISOString(),clientImageId:'sha256:'+'d'.repeat(64)}
 const proposal=buildRestoreExecutionPackage({scope:role==='CAPTURE'?RESTORE_CAPTURE_SCOPE:RESTORE_EXECUTION_SCOPE,actors,startsAt:new Date(now).toISOString(),endsAt:new Date(now+900000).toISOString(),baselineHash,backup:role==='CAPTURE'?null:backup})
 return {packageText:JSON.stringify(proposal),approvedPackageHash:proposal.packageHash,authorizedScope:proposal.scope,goConfirmed:true,exclusiveOperatorConfirmed:true,role,journalPath:journal.file,rootCertificate:readFileSync('src/test/fixtures/supabase-root-2021.crt','utf8'),credentials:role==='CAPTURE'?{postgresPassword:secret}:{postgresPassword:secret,publicKey:'sb_publishable_SYNTHETIC_PUBLIC_KEY',email:'synthetic@example.test',password:secret}}
}
function dependencies(mode=''){
 const reader:RestoreReadOnlyPort={
  readDependencyMetadata:async()=>({status:'METADATA_MATCH_ONLY',structureHash:'a'.repeat(64)}),
  readInitialPreflight:async()=>({status:'METADATA_MATCH_ONLY',structureHash:'a'.repeat(64),initialState:'ABSENT_FIXTURES_NO_COLLISIONS_ONLY'}),
  readOwnedState:async()=>({status:'METADATA_MATCH_ONLY',structureHash:'a'.repeat(64),ownedState:'OWNED_FIXTURES_MATCH_ONLY',cursor:inspectRestoreJournal(journal).cursor}),
  capturePreservationBaseline:async()=>{if(mode==='capture')throw Error(secret);if(mode==='expired')clock+=900000;const b=writeRestorePreservationBaseline(journal,observation(),now);return {status:'METADATA_MATCH_ONLY',ownedState:'OWNED_FIXTURES_MATCH_ONLY',initialState:'ABSENT_FIXTURES_NO_COLLISIONS_ONLY',cursor:0,preparationOnly:true,baselineHash:b.baselineHash}},
  readPreservedState:async()=>{reads++;if(mode==='preflight'||mode==='final'&&rpc===18)throw Error(secret);return {status:'METADATA_MATCH_ONLY',ownedState:'OWNED_FIXTURES_MATCH_ONLY',commercialPreservation:'REVIEWED_COMMERCIAL_INVENTORY_MATCH_ONLY',cursor:inspectRestoreJournal(journal).cursor}},
  dispose:async()=>{disposed++;if(mode==='dispose')throw Error(secret)},
 }
 return {now:()=>clock,checkDirectory:async()=>{if(mode==='directory')throw Error(secret)},connect:async()=>{if(mode==='connect')throw Error(secret);return reader},verifyBackup:async(reference:{archiveHash:string;rolesHash:string;contextHash:string})=>{if(mode==='backup')throw Error(secret);return {status:'PRIVATE_BACKUP_REFERENCE_VERIFIED' as const,...reference}},request:vi.fn<typeof fetch>(async()=>{auth++;throw Error(secret)})}
}
it('capture reads and writes only local baseline, no Auth or mutation',async()=>{
 const p=packet(),d=dependencies();expect(await executePrivateRestorePacket(p,d)).toMatch(/^RESTORE_CAPTURE_PASS baseline=[a-f0-9]{64} auth=false mutation=false$/)
 expect(auth).toBe(0);expect(rpc).toBe(0);expect(disposed).toBe(1);expect(p.credentials.postgresPassword).toBe('')
})
it.each(['capture','expired','directory','connect','dispose'])('capture failure %s is safe and never opens Auth',async mode=>{
 const p=packet();const result=await executePrivateRestorePacket(p,dependencies(mode));expect(result).toMatch(/^RESTORE_OPERATOR_NOT_CONFIRMED stage=/);expect(result).not.toContain(secret);expect(auth).toBe(0)
})
it.each(['go','scope','hash','role','extra','frozen'])('rejects malformed private input %s before transport',async mode=>{
 const p=packet();if(mode==='go')p.goConfirmed=false;if(mode==='scope')p.authorizedScope=RESTORE_EXECUTION_SCOPE;if(mode==='hash')p.approvedPackageHash='0'.repeat(64);if(mode==='role')p.role='OWNER';if(mode==='frozen')Object.freeze(p.credentials)
 const input=mode==='extra'?{...p,extra:secret}:p
 expect(await executePrivateRestorePacket(input,dependencies())).toMatch(/^RESTORE_OPERATOR_NOT_CONFIRMED/);expect(auth).toBe(0)
})
it.each(['backup','preflight'])('execution stops at %s before login',async mode=>{
 const b=writeRestorePreservationBaseline(journal,observation(),now),p=packet('OWNER',b.baselineHash)
 expect(await executePrivateRestorePacket(p,dependencies(mode))).toMatch(/^RESTORE_OPERATOR_NOT_CONFIRMED/);expect(auth).toBe(0);expect(rpc).toBe(0)
})
function request(role:'OWNER'|'CASHIER',mode=''){
 const saved=new Map<string,{hash:string;data:Record<string,unknown>}>(),target='https://acoyfwwmhaeruciyedri.supabase.co'
 const encode=(v:object)=>Buffer.from(JSON.stringify(v)).toString('base64url'),jwt=encode({alg:'ES256'})+'.'+encode({role:'authenticated',sub:actors[role],iss:target+'/auth/v1'})+'.SYNTHETIC'
 return vi.fn<typeof fetch>(async(input,init)=>{
  const url=String(input);expect(url.startsWith(target+'/')).toBe(true)
  if(url.includes('/token?')){auth++;return Response.json({access_token:jwt,token_type:'bearer',user:{id:actors[role]}})}
  if(url.endsWith('/auth/v1/user'))return Response.json({id:actors[role],role:'authenticated'})
  if(url.includes('/usuarios?'))return Response.json([{id:actors[role],auth_user_id:actors[role],kiosco_id:plan.kioskId,rol:role==='OWNER'?'DUEÑO':'CAJERO',activo:true,es_superadmin:false}])
  if(url.includes('/logout?')){logout++;return new Response(null,{status:mode==='logout'?503:204})}
  if(!url.includes('/rpc/'))throw Error(secret)
  rpc++;if(mode==='ack')throw Error(secret)
  if(role==='CASHIER')return Response.json({code:'42501'},{status:403})
  const p=JSON.parse(String(init?.body)),key=String(p.p_operacion_id),hash=valueHash(p),prior=saved.get(key),d=p.p_datos
  if(prior)return Response.json(prior.hash===hash?prior.data:{code:'22023'},{status:prior.hash===hash?200:400})
  if(d.lotes_backup?.some((l:{cantidad_actual:number})=>l.cantidad_actual>Number(d.stock_actual)))return Response.json({code:'22023'},{status:400})
  const id=p.p_producto_id??p.p_registro_id??p.p_lote_id,data=url.endsWith('/restaurar_producto_backup')?{producto:{...d,id,kiosco_id:plan.kioskId},lotes:d.lotes_backup.map((l:Record<string,unknown>)=>({...l,kiosco_id:plan.kioskId}))}:{id,kiosco_id:plan.kioskId,creado:!String(d.nombre).includes('ACTUALIZADO'),saldo_conservado:String(d.nombre).includes('ACTUALIZADO'),registro:{...d,id,kiosco_id:plan.kioskId,saldo_deudor:0,saldo_pendiente:0}}
  saved.set(key,{hash,data});return Response.json(data)
 })
}
it('integrates OWNER18 then CASHIER3 with real journal, exact HTTP routes and final reads',async()=>{
 const b=writeRestorePreservationBaseline(journal,observation(),now)
 for(const role of ['OWNER','CASHIER'] as const){const d=dependencies();d.request=request(role);expect(await executePrivateRestorePacket(packet(role,b.baselineHash),d)).toBe('RESTORE_ROLE_PASS role='+role+' confirmed='+(role==='OWNER'?18:3)+' logout_local=true')}
 expect(rpc).toBe(21);expect(auth).toBe(2);expect(logout).toBe(2);expect(disposed).toBe(2);expect(reads).toBe(25);expect(inspectRestoreJournal(journal).complete).toBe(true)
 expect(readFileSync(journal.file,'utf8')).not.toContain(secret)
})
it.each(['ack','logout','final'])('integrated failure %s retains exclusion and prevents further session',async mode=>{
 const b=writeRestorePreservationBaseline(journal,observation(),now),d=dependencies(mode);d.request=request('OWNER',mode)
 expect(await executePrivateRestorePacket(packet('OWNER',b.baselineHash),d)).toMatch(/^RESTORE_OPERATOR_NOT_CONFIRMED/)
 const before=rpc,next=dependencies();next.request=request('CASHIER')
 expect(await executePrivateRestorePacket(packet('CASHIER',b.baselineHash),next)).toMatch(/^RESTORE_OPERATOR_NOT_CONFIRMED/)
 expect(rpc).toBe(before);expect(auth).toBe(1)
})
it.each(['concurrent','stale-phase-lock','stale-action-lock'])('single-instance lock %s blocks second executor before backup, PG or Auth',async mode=>{
 const b=writeRestorePreservationBaseline(journal,observation(),now)
 if(mode==='concurrent'){
  let releaseConnect:(()=>void)|undefined
  const d1=dependencies();d1.request=request('OWNER')
  const baseConnect=d1.connect
  d1.connect=async()=>{await new Promise<void>(r=>{releaseConnect=r});return baseConnect()}
  const first=executePrivateRestorePacket(packet('OWNER',b.baselineHash),d1)
  while(!releaseConnect)await new Promise(r=>setTimeout(r,5))
  const d2=dependencies();d2.request=request('OWNER')
  expect(await executePrivateRestorePacket(packet('OWNER',b.baselineHash),d2)).toBe('RESTORE_OPERATOR_NOT_CONFIRMED stage=LEASE retry=false')
  releaseConnect()
  expect(await first).toBe('RESTORE_ROLE_PASS role=OWNER confirmed=18 logout_local=true')
  expect(auth).toBe(1);expect(rpc).toBe(18)
 }else{
  writeFileSync(journal.file+(mode==='stale-phase-lock'?'.phase.lock':'.lock'),'999999\n')
  const d=dependencies();d.request=request('OWNER')
  expect(await executePrivateRestorePacket(packet('OWNER',b.baselineHash),d)).toBe('RESTORE_OPERATOR_NOT_CONFIRMED stage=LEASE retry=false')
  expect(auth).toBe(0);expect(rpc).toBe(0);expect(disposed).toBe(0)
 }
})
it('rejects replay after completed 21-step journal before backup, PG or Auth',async()=>{
 const b=writeRestorePreservationBaseline(journal,observation(),now)
 for(const role of ['OWNER','CASHIER'] as const){
  const d=dependencies();d.request=request(role)
  expect(await executePrivateRestorePacket(packet(role,b.baselineHash),d)).toBe('RESTORE_ROLE_PASS role='+role+' confirmed='+(role==='OWNER'?18:3)+' logout_local=true')
 }
 const dReplay=dependencies();dReplay.request=request('CASHIER')
 expect(await executePrivateRestorePacket(packet('CASHIER',b.baselineHash),dReplay)).toBe('RESTORE_OPERATOR_NOT_CONFIRMED stage=JOURNAL retry=false')
 expect(auth).toBe(2);expect(rpc).toBe(21)
})
it('integrates E2E simulated crash after intent, restart block, PG read-only recovery and durable resolution stop',async()=>{
 const b=writeRestorePreservationBaseline(journal,observation(),now)
 let crashedCallBody:Record<string,unknown>|null=null
 let crashedAck:Record<string,unknown>|null=null
 const d=dependencies()
 const baseReq=request('OWNER')
 d.request=vi.fn<typeof fetch>(async(input,init)=>{
  const url=String(input)
  if(url.includes('/rpc/')&&rpc===2){
   const res=await baseReq(input,init)
   crashedCallBody=JSON.parse(String(init?.body))
   crashedAck=await res.clone().json() as Record<string,unknown>
   throw Error(secret)
  }
  return baseReq(input,init)
 })
 expect(await executePrivateRestorePacket(packet('OWNER',b.baselineHash),d)).toBe('RESTORE_OPERATOR_NOT_CONFIRMED stage=ACTION retry=false')
 expect(rpc).toBe(3);expect(auth).toBe(1);expect(logout).toBe(1);expect(existsSync(journal.file+'.phase.lock')).toBe(true)
 const reopened=new RestoreJournal(journal.file)
 const state=inspectRestoreJournal(reopened)
 expect(state.cursor).toBe(2);expect(state.pending).not.toBeNull()
 const dRestart=dependencies();dRestart.request=request('OWNER')
 expect(await executePrivateRestorePacket(packet('OWNER',b.baselineHash),dRestart)).toBe('RESTORE_OPERATOR_NOT_CONFIRMED stage=LEASE retry=false')
 expect(auth).toBe(1);expect(rpc).toBe(3)
 const sql=buildUncertainRestoreReadSql(reopened)
 expect(sql).toContain('REPEATABLE READ READ ONLY')
 expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
 const body=crashedCallBody!
 const rawObservation={
  read_only:'on',
  plan_hash:PLAN_HASH,
  operation_id:state.pending!.operationId,
  request_hash:state.pending!.requestHash,
  context_matches:true,
  state:'BOUND',
  solicitud:{tabla:body.p_tabla,registro_id:body.p_registro_id,datos:body.p_datos,actor_auth_id:actors.OWNER},
  resultado:crashedAck
 }
 const decoded=decodeUncertainRestoreRead(reopened,rawObservation)
 expect(await inspectUncertainRestoreAction(reopened,async()=>decoded)).toEqual({outcome:'ACK_MATCH_REQUIRES_REVIEW',mayResend:false,mayAdvance:false})
 const review=await prepareRestoreRecoveryReview(reopened,async()=>decoded)
 expect(await settleReviewedRestoreRecovery(reopened,review,{role:'OWNER',authId:actors.OWNER,kioskId:plan.kioskId},async()=>decoded)).toEqual({confirmedIndex:2,stopped:true,mayResend:false,mayAdvance:false})
 expect(inspectRestoreJournal(new RestoreJournal(journal.file))).toMatchObject({cursor:3,pending:null,stopped:true,complete:false})
})
