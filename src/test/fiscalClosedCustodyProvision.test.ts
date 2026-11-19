// @vitest-environment node
import { createHash } from 'node:crypto'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { resolve, join, dirname, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { expect, it, vi } from 'vitest'
import { createCustodyProvisionPlan, custodyPlanHash } from '../../scripts/fiscal-custody-plan.mjs'
import { provisionClosedCustody, diagnoseClosedCustodyInventory } from '../../scripts/arca/provision-closed-custody.mjs'

const hash=(value:string)=>createHash('sha256').update(value).digest('hex')
function cleanup(root:string):void {
 const target=resolve(root)
 if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('kiosko-operator-prepare-'))throw Error('Unexpected cleanup target')
 rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}
function harness(mode='ok') {
 const plan=createCustodyProvisionPlan({certificateSha256:'a'.repeat(64),certificateCuit:'20123456786'})
 const values=new Map(plan.secretNames.map((name,index)=>[name,'SYNTHETIC_PRIVATE_'+index]))
 const baseline=[{name:'ARCA_HOMO_BACKEND_ENABLED',value:hash('false'),updated_at:'2026-10-27'},{name:'EXISTING',value:hash('unchanged')}]
 const after=[...baseline,...plan.secretNames.map(name=>({name,value:hash(values.get(name)!)}))]
 let gets=0
 const request=vi.fn(async (url:RequestInfo|URL,init?:RequestInit)=>{
  expect(url).toBe('https://api.supabase.com/v1/projects/acoyfwwmhaeruciyedri/secrets')
  expect(init?.redirect).toBe('error');expect(init?.signal).toBeInstanceOf(AbortSignal)
  if(init?.method==='POST') {
   const payload=JSON.parse(String(init.body)) as {name:string;value:string}[]
   expect(payload.map(row=>row.name)).toEqual(plan.secretNames)
   expect(payload.every(row=>row.value===values.get(row.name))).toBe(true)
   if(mode==='post-timeout')throw Error('PRIVATE_RESPONSE_NEVER_LOG')
   return new Response('{}',{status:mode==='post-denied'?403:201})
  }
  gets++
  if(mode==='get-denied')return new Response('PRIVATE_RESPONSE_NEVER_LOG',{status:403})
  if(mode==='bad-json')return new Response('PRIVATE_RESPONSE_NEVER_LOG',{status:200})
  if(mode==='large')return new Response('x'.repeat(131073),{status:200})
  if(mode==='plaintext')return Response.json([{name:'EXISTING',value:'PRIVATE_RESPONSE_NEVER_LOG'}])
  if(mode==='digest-field')return Response.json([{name:'EXISTING',digest:hash('unchanged')}])
  if(mode==='extra-field')return Response.json([{name:'EXISTING',value:hash('unchanged'),unexpected:'PRIVATE_RESPONSE_NEVER_LOG'}])
  if(mode==='open-flag')return Response.json([{name:'ARCA_HOMO_BACKEND_ENABLED',value:hash('true')}])
  if(mode==='collision')return Response.json([...baseline,{name:plan.secretNames[0],value:hash('collision')}])
  if(mode==='drift'&&gets===2)return Response.json([...baseline,{name:'NEW_CONCURRENT',value:hash('change')}])
  if(mode==='partial'&&gets===3)return Response.json(after.slice(0,-1))
  return Response.json(gets===3?after:baseline)
 })
 const delivery={projectRef:'acoyfwwmhaeruciyedri' as const,names:plan.secretNames,planSha256:custodyPlanHash(plan),
  value:(name:string)=>values.get(name)!,dispose:vi.fn(()=>values.clear()),
  verifyInventory:vi.fn((rows:unknown)=>{
   expect(rows).toEqual(after.map(row=>({name:row.name,digest:row.value})))
   return {presence:'6/6' as const,newDigestsMatch:true as const,existingUnchanged:true as const,fiscalFlagsClosed:true as const,functionalCustodyProven:false as const}
  })}
 const prepare=vi.fn(async()=>delivery)
 const input={plan,approvedHash:custodyPlanHash(plan),token:'sbp_fc_SYNTHETIC_only_never_real_123456',exclusiveWriteConfirmed:true,
  paths:{certificatePath:'NEVER_READ',encryptedKeyPath:'NEVER_READ',protectionPath:'NEVER_READ'}}
 return {input,request,prepare,delivery}
}
it('sends only six values once with two prewrite reads and metadata verification; disposes memory',async()=>{
 const h=harness();const result=await provisionClosedCustody(h.input,h)
 expect(result).toMatchObject({status:'CUSTODY_PROVISION_METADATA_PASS',functionalCustodyProven:false,edgeCheckRequired:true})
 expect(h.request.mock.calls.map(call=>call[1]?.method)).toEqual(['GET','GET','POST','GET'])
 expect(h.prepare).toHaveBeenCalledTimes(1);expect(h.delivery.dispose).toHaveBeenCalledTimes(1)
})
it.each(['get-denied','bad-json','large','plaintext','open-flag','collision'])('rejects %s before originals or POST',async mode=>{
 const h=harness(mode)
 await expect(provisionClosedCustody(h.input,h)).rejects.toThrow('stage=BASELINE write_attempted=false')
 expect(h.prepare).not.toHaveBeenCalled();expect(h.request).toHaveBeenCalledTimes(1)
})
it.each(['drift','post-timeout','post-denied','partial'])('stops %s without retry or rollback and disposes private delivery',async mode=>{
 const h=harness(mode)
 const expected=mode==='drift'?'stage=PREWRITE_RECHECK write_attempted=false':mode==='partial'?'stage=VERIFY write_attempted=true':'stage=POST write_attempted=true'
 await expect(provisionClosedCustody(h.input,h)).rejects.toThrow(expected)
 expect(h.request.mock.calls.filter(call=>call[1]?.method==='POST')).toHaveLength(mode==='drift'?0:1)
 expect(h.delivery.dispose).toHaveBeenCalledTimes(1)
})
it.each(['legacy-token','not-exclusive','foreign-project','expired','wrong-hash'])('rejects %s without network or originals',async mode=>{
 const h=harness()
 const input=mode==='legacy-token'?{...h.input,token:'sbp_SYNTHETIC_LEGACY'}:mode==='not-exclusive'?{...h.input,exclusiveWriteConfirmed:false}:
  mode==='foreign-project'?{...h.input,plan:{...h.input.plan,projectRef:'foreign'}}:mode==='expired'?{...h.input,plan:{...h.input.plan,createdAt:'2020-01-01T00:00:00Z'}}:{...h.input,approvedHash:'0'.repeat(64)}
 await expect(provisionClosedCustody(input,h)).rejects.toThrow('CUSTODY_PROVISION_NOT_CONFIRMED')
 expect(h.request).not.toHaveBeenCalled();expect(h.prepare).not.toHaveBeenCalled()
})
it('inventory diagnostic performs one GET only, with no private factory even on PASS',async()=>{
 const h=harness(),{plan,approvedHash,token}=h.input
 await expect(diagnoseClosedCustodyInventory({plan,approvedHash,token},h)).resolves.toEqual({count:2,flagsClosed:true,privateRead:false,writeAttempted:false})
 expect(h.request.mock.calls.map(call=>call[1]?.method)).toEqual(['GET'])
 expect(h.prepare).not.toHaveBeenCalled()
})
it.each([
 ['get-denied','HTTP_403'],['bad-json','METADATA_JSON_OR_SIZE'],['large','METADATA_JSON_OR_SIZE'],
 ['plaintext','METADATA_DIGEST_FORMAT'],['digest-field','METADATA_DIGEST_FIELD'],['extra-field','METADATA_FIELDS'],
 ['open-flag','INVENTORY_POLICY'],['collision','INITIAL_STATE_REJECTED'],
])('inventory diagnostic classifies %s without values, originals, POST or retries',async(mode,reason)=>{
 const h=harness(mode),{plan,approvedHash,token}=h.input
 await expect(diagnoseClosedCustodyInventory({plan,approvedHash,token},h)).rejects.toThrow('CUSTODY_BASELINE_NOT_CONFIRMED reason='+reason+' private_read=false write_attempted=false')
 expect(h.request).toHaveBeenCalledTimes(1);expect(h.prepare).not.toHaveBeenCalled()
})
it.each([401,403,404,429,500,502,503,504,418])('inventory HTTP %s remains a bounded status category',async status=>{
 const h=harness(),{plan,approvedHash,token}=h.input
 const request=vi.fn(async()=>new Response('PRIVATE_RESPONSE_NEVER_LOG',{status}))
 await expect(diagnoseClosedCustodyInventory({plan,approvedHash,token},{request})).rejects.toThrow('reason=HTTP_'+(status===418?'OTHER':status)+' private_read=false write_attempted=false')
 expect(request).toHaveBeenCalledTimes(1)
})
it('inventory transport failure is sanitized and never retried',async()=>{
 const h=harness(),{plan,approvedHash,token}=h.input
 const request=vi.fn(async()=>{throw Error('PRIVATE_URL_TOKEN_NEVER_LOG')})
 await expect(diagnoseClosedCustodyInventory({plan,approvedHash,token},{request})).rejects.toThrow('reason=NETWORK_OR_TLS private_read=false write_attempted=false')
 expect(request).toHaveBeenCalledTimes(1)
})
it.each(['pass','http','schema','network'])('native diagnostic CLI sanitizes %s with simulated HTTP only',mode=>{
 const root=mkdtempSync(join(tmpdir(),'kiosko-operator-prepare-'))
 try {
  const h=harness(),{plan,approvedHash,token}=h.input,preload=join(root,'fake-http.mjs')
  const reply=mode==='network'?"throw Error('PRIVATE_RESPONSE_NEVER_LOG')":mode==='http'?"return new Response('PRIVATE_RESPONSE_NEVER_LOG',{status:403})":mode==='schema'?"return Response.json([{name:'EXISTING',digest:'a'.repeat(64)}])":"return Response.json([])"
  writeFileSync(preload,"globalThis.fetch=async(url,init)=>{if(url!=='https://api.supabase.com/v1/projects/acoyfwwmhaeruciyedri/secrets'||init.method!=='GET')throw Error('NO_NETWORK_ALLOWED');"+reply+'}')
  const result=spawnSync(process.execPath,['--import',pathToFileURL(preload).href,resolve('scripts/arca/provision-closed-custody-cli.mjs'),'--inventory'],{
   input:JSON.stringify({plan,approvedHash,token}),encoding:'utf8',timeout:10000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''},
  })
  const expected=mode==='pass'?'CUSTODY_BASELINE_PASS count=0 flags_closed=true private_read=false write_attempted=false':
   'CUSTODY_BASELINE_NOT_CONFIRMED reason='+(mode==='http'?'HTTP_403':mode==='schema'?'METADATA_DIGEST_FIELD':'NETWORK_OR_TLS')+' private_read=false write_attempted=false'
  expect(result.stderr).toBe('');expect(result.stdout.trim()).toBe(expected);expect(result.status).toBe(mode==='pass'?0:1)
 }finally{cleanup(root)}
})
it.skipIf(process.platform!=='win32')('operator preparation runs native process without token, originals or network',()=>{
 const root=mkdtempSync(join(tmpdir(),'kiosko-operator-prepare-'))
 try {
  const h=harness(),proposal=join(root,'public-plan.json')
  writeFileSync(proposal,JSON.stringify({plan:h.input.plan,planSha256:h.input.approvedHash}))
  const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',resolve('scripts/provisionar-custodia-staging-privado.ps1'),'-Preparar','-Propuesta',proposal],{encoding:'utf8',timeout:30000})
  expect(result.status).toBe(0);expect(result.stdout.trim()).toBe('CUSTODY_OPERATOR_READY staging=true runtime=true private_read=false network=0');expect(result.stderr).toBe('')
 }finally {cleanup(root)}
},40000)
