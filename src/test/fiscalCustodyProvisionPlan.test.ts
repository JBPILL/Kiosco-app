// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { expect, it } from 'vitest'
import { normalizeFiscalCuit } from '../../supabase/functions/_shared/fiscalReconciliation'
import { createCustodyProvisionPlan, custodyPlanHash, validateCustodyProvisionPlan, requireAbsentCustodyBaseline, CLOSED_FISCAL_FLAGS, custodyInventory } from '../../scripts/fiscal-custody-plan.mjs'
const now=Date.now(),input={certificateSha256:'a'.repeat(64),certificateCuit:'20123456786'}
const plan=createCustodyProvisionPlan(input,now)
const closed=createHash('sha256').update('false').digest('hex')
it('creates exactly six initial names and no fiscal flags, emitter or values',()=>{
 expect(plan.secretNames).toHaveLength(6)
 expect(plan.secretNames[5]).toBe('ARCA_HOMO_TA_ACTIVE_KEY_ID')
 expect(plan.secretNames.some((name:string)=>name.endsWith('_ENABLED'))).toBe(false)
 expect(JSON.stringify(plan)).not.toMatch(/BEGIN |password|PRIVATE KEY/)
 expect(validateCustodyProvisionPlan(plan,custodyPlanHash(plan),now)).toEqual(plan)
})
it('inventory of flags matches deployed source, including independent data preparation',()=>{
 const source=readdirSync('supabase/functions/_shared').filter(name=>name.endsWith('.ts')).map(name=>readFileSync('supabase/functions/_shared/'+name,'utf8')).join('\n')
 const flags=[...new Set(source.match(/ARCA_HOMO_[A-Z_]+_ENABLED/g))].sort()
 expect([...CLOSED_FISCAL_FLAGS].sort()).toEqual(flags)
})
it('JS-only controller checksum remains equivalent to the real server validator',()=>{
 const ids={credentialId:plan.credentialId,taKeyId:plan.taKeyId}
 for(let n=0;n<200;n++)for(let digit=0;digit<10;digit++){
  const value='20'+String(n).padStart(8,'0')+digit
  let server=false,controller=false
  try{server=normalizeFiscalCuit(value)===value}catch{/* expected invalid candidate */}
  try{controller=createCustodyProvisionPlan({...input,certificateCuit:value},now,ids).certificateCuit===value}catch{/* same candidate */}
  expect(controller).toBe(server)
 }
 for(const value of [null,42,'','2012345678',' 20123456786','２０１２３４５６７８６']){
  expect(()=>createCustodyProvisionPlan({...input,certificateCuit:value},now,ids)).toThrow()
 }
})
it.each([
 ['foreign',{...plan,projectRef:'foreign'}],['function',{...plan,function:'other'}],['extra',{...plan,enabled:true}],
 ['revision',{...plan,revision:2}],['names',{...plan,secretNames:[...plan.secretNames,'SUPABASE_SECRET_KEYS']}],
 ['expiry',{...plan,expiresAt:new Date(now+172800000).toISOString()}],
])('rejects %s even with its rehashed body',(_name,value)=>{
 expect(()=>validateCustodyProvisionPlan(value,custodyPlanHash(value),now)).toThrow()
})
it('rejects expired/future/review hash mismatch',()=>{
 expect(()=>validateCustodyProvisionPlan(plan,custodyPlanHash(plan),now+86400000)).toThrow()
 expect(()=>validateCustodyProvisionPlan(plan,custodyPlanHash(plan),now-1)).toThrow()
 expect(()=>validateCustodyProvisionPlan(plan,'0'.repeat(64),now)).toThrow()
})
it('accepts only absence or exact false for all known private controls',()=>{
 const inventory=CLOSED_FISCAL_FLAGS.map(name=>({name,digest:closed}))
 expect(requireAbsentCustodyBaseline(plan,inventory).size).toBe(13)
 expect(requireAbsentCustodyBaseline(plan,[]).size).toBe(0)
})
it.each(['true','FALSE','0',' true ',''])('rejects flag value digest for %j',value=>{
 expect(()=>custodyInventory([{name:'ARCA_HOMO_DATA_PREPARATION_ENABLED',digest:createHash('sha256').update(value).digest('hex')}])).toThrow()
})
it('rejects collisions, duplicates, unknown controls and raw secret values',()=>{
 expect(()=>requireAbsentCustodyBaseline(plan,[{name:plan.secretNames[0],digest:closed}])).toThrow()
 expect(()=>custodyInventory([{name:'EXAMPLE',digest:closed},{name:'EXAMPLE',digest:closed}])).toThrow()
 expect(()=>custodyInventory([{name:'ARCA_HOMO_UNKNOWN_ENABLED',digest:closed}])).toThrow()
 expect(()=>custodyInventory([{name:'EXAMPLE',value:'DO_NOT_ACCEPT'}])).toThrow()
})
