// Public proposal only. No credential input, network, approval or execution.
import { readFileSync,lstatSync } from 'node:fs'
import { resolve } from 'node:path'
import { PLAN_HASH,loadRestorePlan,valueHash } from './restore-acceptance-engine.mjs'
import { RESTORE_PRESERVATION_SCOPE_HASH } from './restore-preservation.mjs'
import { createHash } from 'node:crypto'
const root=resolve(import.meta.dirname,'../..'),plan=loadRestorePlan()
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(value)
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===[...keys].sort().join(',')
const fail=()=>{throw Error('RESTORE_EXECUTION_PACKAGE_NOT_CONFIRMED')}
export const RESTORE_CAPTURE_SCOPE='PR07_READ_ONLY_PRESERVATION_CAPTURE'
export const RESTORE_EXECUTION_SCOPE='PR07_FIXED_ISOLATED_RESTORE_ACCEPTANCE'
export function restoreExecutionRuntimeHashes(){
 const files=['restore-acceptance-engine.mjs','restore-acceptance-plan.json','restore-acceptance-http.mjs','restore-acceptance-operator.mjs','restore-readonly-postgres.mjs','restore-dependency-metadata.sql','restore-acceptance-preflight.sql','restore-dependency-reviewed.json','restore-dependency-preflight.mjs','restore-state-preflight.mjs','restore-preservation.mjs','restore-private-windows.ps1','verify-private-restore-directory.ps1','restore-execution-package.mjs','restore-private-executor.mjs','restore-execution-cli.mjs','restore-backup-reference.mjs','verify-restore-backup-private.ps1'].map(name=>'scripts/backup/'+name)
 files.push('scripts/respaldar-staging-privado.ps1','scripts/backup_supabase.ps1','scripts/ejecutar-ensayo-restauracion-privado.ps1','package.json','package-lock.json')
 return Object.fromEntries(files.sort().map(name=>{
  const file=resolve(root,name),stat=lstatSync(file)
  if(!stat.isFile()||stat.isSymbolicLink()||stat.nlink!==1)fail()
  return [name,createHash('sha256').update(readFileSync(file)).digest('hex')]
 }))
}
export function buildRestoreExecutionPackage(input){
 try{
  if(!exact(input,['scope','actors','startsAt','endsAt','baselineHash','backup'])||![RESTORE_CAPTURE_SCOPE,RESTORE_EXECUTION_SCOPE].includes(input.scope)||!exact(input.actors,['OWNER','CASHIER'])||!uuid(input.actors.OWNER)||!uuid(input.actors.CASHIER)||input.actors.OWNER===input.actors.CASHIER)fail()
  const start=Date.parse(input.startsAt),end=Date.parse(input.endsAt)
  if(!Number.isFinite(start)||!Number.isFinite(end)||new Date(start).toISOString()!==input.startsAt||new Date(end).toISOString()!==input.endsAt||end<=start||end-start>900000)fail()
  if(input.scope===RESTORE_CAPTURE_SCOPE){if(input.baselineHash!==null||input.backup!==null)fail()}
  else{
   const b=input.backup,age=start-Date.parse(b?.createdAt)
   if(!hash(input.baselineHash)||!exact(b,['directory','archive','archiveHash','rolesHash','contextHash','createdAt','clientImageId'])||typeof b.directory!=='string'||!/^pre-restore-acceptance-[a-zA-Z0-9-]{10,100}$/.test(b.directory)||typeof b.archive!=='string'||!/^[a-zA-Z0-9_-]+\.dump$/.test(b.archive)||![b.archiveHash,b.rolesHash,b.contextHash].every(hash)||!/^sha256:[a-f0-9]{64}$/.test(b.clientImageId)||!Number.isFinite(age)||age<0||age>86400000)fail()
  }
  const body={version:1,...JSON.parse(JSON.stringify(input)),projectRef:plan.projectRef,kioskId:plan.kioskId,planHash:PLAN_HASH,preservationScopeHash:RESTORE_PRESERVATION_SCOPE_HASH,runtimeFiles:restoreExecutionRuntimeHashes(),nodeVersion:process.versions.node,requiresSpecificGo:true,requiresExclusiveOperator:true,automaticRetry:false,flags:false,arca:false,production:false,restoreUiEnabled:false,totalExplicitRpcCalls:input.scope===RESTORE_EXECUTION_SCOPE?plan.expectedTotalExplicitRpcCalls:0}
  return Object.freeze({...body,packageHash:valueHash(body)})
 }catch{fail()}
}
export function validateRestoreExecutionPackage(packet,reviewedHash,{now=Date.now(),execute=false}={}){
 try{
  if(!hash(reviewedHash)||packet?.packageHash!==reviewedHash||!Number.isSafeInteger(now))fail()
  const rebuilt=buildRestoreExecutionPackage(Object.fromEntries(['scope','actors','startsAt','endsAt','baselineHash','backup'].map(key=>[key,packet[key]])))
  if(valueHash(rebuilt)!==valueHash(packet)||now>=Date.parse(packet.endsAt)||execute&&now<Date.parse(packet.startsAt))fail()
  return rebuilt
 }catch{fail()}
}
