// Public-only reviewed package. Never accepts credentials or contacts services.
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { planFiscalPreparationToggle } from './plan-fiscal-preparation-toggle.mjs'
import { positiveWindowReadOnlySql } from './fiscal-positive-window-database.mjs'
import { custodySecretNames } from './fiscal-custody-plan.mjs'
const root=resolve(fileURLToPath(new URL('..',import.meta.url)))
const sha=value=>createHash('sha256').update(value).digest('hex')
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value)
const fail=()=>{throw Error('PRIVATE_WINDOW_PACKAGE_NOT_CONFIRMED')}
export const POSITIVE_WINDOW_SCOPE='PRIMERA_VENTANA_POSITIVA_SIN_EMISION'
export function positiveWindowRuntimeFiles(){
  const scripts=['plan-fiscal-positive-acceptance.mjs','plan-fiscal-preparation-toggle.mjs','fiscal-custody-plan.mjs',
    'fiscal-positive-postgres.mjs','fiscal-positive-preparation-flow.mjs','fiscal-positive-window-database.mjs',
    'fiscal-positive-window-journal.mjs','fiscal-positive-window-operator.mjs','fiscal-positive-window-package.mjs',
    'fiscal-positive-window-private.mjs','fiscal-positive-window-cli.mjs','fiscal-preparation-flags.mjs',
    'fiscal-preparation-management.mjs','fiscal-preparation-session.mjs','fiscal-private-owner-session.mjs',
    'ejecutar-ventana-fiscal-privada.ps1','comprobar-directorio-ventana-privada.ps1'].map(name=>'scripts/'+name)
  const shared=readdirSync(join(root,'supabase/functions/_shared')).filter(name=>name.endsWith('.ts')).map(name=>'supabase/functions/_shared/'+name)
  const files=[...scripts,...shared,'supabase/functions/arca-homologacion/index.ts','package.json','package-lock.json'].sort()
  return Object.fromEntries(files.map(path=>{
    const absolute=join(root,path),stat=lstatSync(absolute)
    if(!stat.isFile()||stat.isSymbolicLink())return fail()
    return[path,sha(readFileSync(absolute))]
  }))
}
export async function buildPositiveWindowPackage({config,historySha256,commercialSha256,taKeyId}){
  const capture=historySha256===null&&commercialSha256===null
  if(!capture&&(!hash(historySha256)||!hash(commercialSha256)))return fail()
  const detached=JSON.parse(JSON.stringify(config)),plan=await planFiscalPreparationToggle(detached)
  const source=JSON.parse(detached.snapshotText),credentialId=source.issuer.credencial_id
  const secretNames=custodySecretNames(credentialId,taKeyId)
  const value={version:1,projectRef:'acoyfwwmhaeruciyedri',scope:POSITIVE_WINDOW_SCOPE,config:detached,
    dataPlanSha256:plan.data.manifest.planSha256,activationSha256:plan.manifest.activationSha256,
    closureSha256:plan.manifest.closureSha256,verificationSha256:plan.manifest.verificationSha256,
    readOnlySqlSha256:sha(positiveWindowReadOnlySql),historySha256,commercialSha256,
    baselinePolicy:capture?'CAPTURE_FRESH_CLOSED_READ_ONLY_BEFORE_OPEN':'MATCH_REVIEWED_REFERENCE',credentialId,taKeyId,secretNames,
    runtimeFiles:positiveWindowRuntimeFiles(),requiresFreshPreflight:true,requiresExplicitGo:true,
    requiresExclusiveOperator:true,automaticApproval:false,emissionEnabled:false}
  return Object.freeze({...value,packageSha256:sha(JSON.stringify(value))})
}
export async function validatePositiveWindowPackage(value,approvedHash,{now=Date.now(),execute=false}={}){
  try{
    if(!value||!hash(approvedHash)||value.packageSha256!==approvedHash||!Number.isSafeInteger(now))return fail()
    const rebuilt=await buildPositiveWindowPackage({config:value.config,historySha256:value.historySha256,commercialSha256:value.commercialSha256,taKeyId:value.taKeyId})
    if(JSON.stringify(rebuilt)!==JSON.stringify(value)||rebuilt.packageSha256!==approvedHash)return fail()
    const start=Date.parse(value.config.startsAt),end=Date.parse(value.config.endsAt)
    if(now>=end||execute&&now<start)return fail()
    return rebuilt
  }catch{return fail()}
}
