// Explicitly invoked private runtime only. No scheduled work or automatic retry.
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { X509Certificate } from 'node:crypto'
import { validateRestoreExecutionPackage,RESTORE_CAPTURE_SCOPE,RESTORE_EXECUTION_SCOPE } from './restore-execution-package.mjs'
import { PLAN_HASH,RestoreJournal,inspectRestoreJournal } from './restore-acceptance-engine.mjs'
import { loadRestorePreservationBaseline } from './restore-preservation.mjs'
import { connectRestoreReadOnlyPostgres } from './restore-readonly-postgres.mjs'
import { verifyRestoreBackupReference } from './restore-backup-reference.mjs'
import { loginRestoreHttpClient } from './restore-acceptance-http.mjs'
import { runRestoreRolePhase } from './restore-acceptance-operator.mjs'
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',')
const fail=()=>{throw Error('RESTORE_PRIVATE_PACKET_NOT_CONFIRMED')}
function checkPrivateDirectory(file){
 const root=path.resolve(process.env.USERPROFILE??'','KioskoPOS-Privado','Restauracion-Staging'),directory=path.dirname(file)
 if(process.platform!=='win32'||!path.isAbsolute(file)||path.basename(file)!=='journal.jsonl'||path.dirname(directory).toLowerCase()!==root.toLowerCase())fail()
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',path.resolve(import.meta.dirname,'verify-private-restore-directory.ps1'),'-Path',directory],{encoding:'utf8',timeout:15000,windowsHide:true})
 if(result.status!==0||result.stdout!=='RESTORE_DIRECTORY_PRIVATE=true'||result.stderr)fail()
}
export async function executePrivateRestorePacket(packet,dependencies={}){
 let reader,lease,releaseLease=false,stage='PACKET',output='RESTORE_OPERATOR_NOT_CONFIRMED stage=PACKET retry=false'
 try{
  const now=dependencies.now??Date.now
  if(process.env.NODE_OPTIONS||process.env.NODE_PATH||process.env.NODE_TLS_REJECT_UNAUTHORIZED==='0'||!exact(packet,['packageText','approvedPackageHash','authorizedScope','goConfirmed','exclusiveOperatorConfirmed','role','journalPath','rootCertificate','credentials'])||packet.goConfirmed!==true||packet.exclusiveOperatorConfirmed!==true||typeof packet.packageText!=='string'||Buffer.byteLength(packet.packageText)>131072)fail()
  const reviewed=validateRestoreExecutionPackage(JSON.parse(packet.packageText),packet.approvedPackageHash,{now:now(),execute:true})
  const capture=reviewed.scope===RESTORE_CAPTURE_SCOPE
  if(packet.authorizedScope!==reviewed.scope||capture&&packet.role!=='CAPTURE'||!capture&&(!['OWNER','CASHIER'].includes(packet.role)||reviewed.scope!==RESTORE_EXECUTION_SCOPE)||!exact(packet.credentials,capture?['postgresPassword']:['postgresPassword','publicKey','email','password'])||Object.values(packet.credentials).some(value=>typeof value!=='string'||!value||value.length>16384))fail()
  if(typeof packet.rootCertificate!=='string'||packet.rootCertificate.length>65536||packet.rootCertificate.includes('PRIVATE KEY'))fail()
  const cert=new X509Certificate(packet.rootCertificate)
  if(cert.fingerprint.replaceAll(':','')!=='A4518A0933AF6949482CCA3014C007C369DF9F6F'||Date.parse(cert.validFrom)>now()||Date.parse(cert.validTo)<=now())fail()
  stage='DIRECTORY'
  await (dependencies.checkDirectory??checkPrivateDirectory)(packet.journalPath)
  stage='LEASE'
  if(fs.existsSync(packet.journalPath+'.lock'))fail()
  lease=fs.openSync(packet.journalPath+'.phase.lock','wx',0o600)
  fs.fsyncSync(lease)
  stage='JOURNAL'
  const journal=new RestoreJournal(packet.journalPath),state=inspectRestoreJournal(journal)
  const expectedCursor=capture||packet.role==='OWNER'?0:18
  if(state.actors.OWNER!==reviewed.actors.OWNER||state.actors.CASHIER!==reviewed.actors.CASHIER||state.pending||state.stopped||state.cursor!==expectedCursor)fail()
  releaseLease=true
  if(!capture){
   stage='BACKUP'
   const checked=await (dependencies.verifyBackup??verifyRestoreBackupReference)(reviewed.backup,{now:now()})
   if(checked.status!=='PRIVATE_BACKUP_REFERENCE_VERIFIED'||checked.archiveHash!==reviewed.backup.archiveHash||checked.contextHash!==reviewed.backup.contextHash||checked.rolesHash!==reviewed.backup.rolesHash)fail()
  }
  stage='CONNECT'
  reader=await (dependencies.connect??connectRestoreReadOnlyPostgres)({password:packet.credentials.postgresPassword,rootCertificate:packet.rootCertificate})
  // Window may have expired during local archive verification or connection.
  validateRestoreExecutionPackage(reviewed,packet.approvedPackageHash,{now:now(),execute:true})
  if(capture){
   stage='CAPTURE'
   releaseLease=false
   const result=await reader.capturePreservationBaseline(journal)
   if(result.preparationOnly!==true||result.status!=='METADATA_MATCH_ONLY'||result.ownedState!=='OWNED_FIXTURES_MATCH_ONLY'||result.initialState!=='ABSENT_FIXTURES_NO_COLLISIONS_ONLY'||result.cursor!==0||!/^[a-f0-9]{64}$/.test(result.baselineHash))fail()
   validateRestoreExecutionPackage(reviewed,packet.approvedPackageHash,{now:now(),execute:true})
   releaseLease=true
   output='RESTORE_CAPTURE_PASS baseline='+result.baselineHash+' auth=false mutation=false'
  }else{
   stage='BASELINE'
   const baseline=loadRestorePreservationBaseline(journal)
   if(baseline.baselineHash!==reviewed.baselineHash)fail()
   stage='PHASE'
   fs.closeSync(lease);lease=undefined;fs.unlinkSync(packet.journalPath+'.phase.lock')
   const result=await runRestoreRolePhase({journal,role:packet.role,allowRun:true,reviewedPlanHash:PLAN_HASH,expiresAt:reviewed.endsAt,now,
    preflight:async context=>{
     validateRestoreExecutionPackage(reviewed,packet.approvedPackageHash,{now:now(),execute:true})
     const proof=await reader.readPreservedState(journal,baseline,reviewed.baselineHash)
     return proof.status==='METADATA_MATCH_ONLY'&&proof.ownedState==='OWNED_FIXTURES_MATCH_ONLY'&&proof.commercialPreservation==='REVIEWED_COMMERCIAL_INVENTORY_MATCH_ONLY'&&proof.cursor===context.cursor&&context.planHash===PLAN_HASH
    },
    openSession:role=>loginRestoreHttpClient({publicKey:packet.credentials.publicKey,email:packet.credentials.email,password:packet.credentials.password,authId:reviewed.actors[role],role,allowMutations:true,reviewedPlanHash:PLAN_HASH},dependencies.request??fetch),
   })
   output=result.status==='ROLE_PHASE_PASS'?'RESTORE_ROLE_PASS role='+packet.role+' confirmed='+result.confirmed+' logout_local=true':'RESTORE_OPERATOR_NOT_CONFIRMED stage='+(['GATE','LEASE','JOURNAL','PREFLIGHT','SESSION','IDENTITY','ACTION','FINAL_PREFLIGHT','LOGOUT','LEASE_CLEANUP'].includes(result.stage)?result.stage:'PHASE')+' retry=false'
  }
 }catch{output='RESTORE_OPERATOR_NOT_CONFIRMED stage='+stage+' retry=false'}
 finally{
  if(reader)try{await reader.dispose()}catch{releaseLease=false;output='RESTORE_OPERATOR_NOT_CONFIRMED stage=DISPOSE retry=false'}
  if(lease!==undefined)try{fs.closeSync(lease);if(releaseLease)fs.unlinkSync(packet.journalPath+'.phase.lock')}catch{output='RESTORE_OPERATOR_NOT_CONFIRMED stage=LEASE_CLEANUP retry=false'}
  if(packet?.credentials&&typeof packet.credentials==='object')try{for(const key of Object.keys(packet.credentials))packet.credentials[key]=''}catch{output='RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY retry=false'}
 }
 return output
}
