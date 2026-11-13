// @vitest-environment node
import { beforeEach,afterEach,expect,it } from 'vitest'
import { mkdtempSync,rmSync,readFileSync,linkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join,dirname,basename,resolve } from 'node:path'
import { createRestoreJournal,PLAN_HASH,valueHash } from '../../scripts/backup/restore-acceptance-engine.mjs'
import type { RestoreJournal } from '../../scripts/backup/restore-acceptance-engine.mjs'
import { RESTORE_PRESERVATION_TABLES,RESTORE_PRESERVATION_SCOPE_HASH,buildRestorePreservationReadSql,createRestorePreservationBaseline,writeRestorePreservationBaseline,loadRestorePreservationBaseline,verifyRestorePreservation } from '../../scripts/backup/restore-preservation.mjs'
let folder:string,journal:RestoreJournal
const actors={OWNER:'11111111-1111-4111-8111-111111111111',CASHIER:'22222222-2222-4222-8222-222222222222'},now=Date.parse('2026-10-30T18:00:00Z')
beforeEach(()=>{folder=mkdtempSync(join(tmpdir(),'kiosko-preservation-'));journal=createRestoreJournal(join(folder,'journal.jsonl'),actors)})
afterEach(()=>{if(dirname(folder)!==resolve(tmpdir())||!basename(folder).startsWith('kiosko-preservation-'))throw Error('Unsafe cleanup');rmSync(folder,{recursive:true,force:true})})
function observation(){return {read_only:'on',query_role:'postgres',observed_at:new Date(now).toISOString(),server_version:'17.11',scope_hash:RESTORE_PRESERVATION_SCOPE_HASH,plan_hash:PLAN_HASH,tables:RESTORE_PRESERVATION_TABLES.map(name=>({name,count:0,sha256:'a'.repeat(64)}))}}
it('hashes only the fixed commercial inventory without reading auth or security-secret tables',()=>{
 const sql=buildRestorePreservationReadSql()
 expect(RESTORE_PRESERVATION_TABLES).toHaveLength(50)
 expect(sql).toContain('REPEATABLE READ READ ONLY');expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
 expect(sql).not.toMatch(/\b(CREATE|INSERT|UPDATE|DELETE|GRANT|CALL)\b|auth\.users|supervisor_pin_secretos|fiscal_ta|configuracion_admin/)
 for(const table of ['ventas','sesiones_caja','movimientos_caja','envases_pendientes','devoluciones_venta'])expect(sql).toContain('public.'+table)
})
it('writes one fsynced baseline bound to this journal and requires its separately reviewed hash',()=>{
 const value=observation(),baseline=writeRestorePreservationBaseline(journal,value,now)
 expect(loadRestorePreservationBaseline(journal)).toEqual(baseline)
 expect(verifyRestorePreservation(journal,baseline,value,baseline.baselineHash,now)).toMatchObject({status:'REVIEWED_COMMERCIAL_INVENTORY_MATCH_ONLY',tables:50,cursor:0})
 expect(()=>verifyRestorePreservation(journal,baseline,value,'0'.repeat(64),now)).toThrow('RESTORE_PRESERVATION_NOT_CONFIRMED')
 const before=readFileSync(join(folder,'preservation-baseline.json'),'utf8')
 expect(()=>writeRestorePreservationBaseline(journal,value,now)).toThrow('RESTORE_PRESERVATION_NOT_CONFIRMED')
 expect(readFileSync(join(folder,'preservation-baseline.json'),'utf8')).toBe(before)
})
it.each(['count','digest','table','missing','duplicate','readonly','role','scope','plan','age','future','version','baseline','header','future-baseline'])('rejects %s without recapturing',mode=>{
 const value=observation(),original=createRestorePreservationBaseline(journal,value,now),baseline=structuredClone(original)
 if(mode==='count')value.tables[0].count++
 if(mode==='digest')value.tables[0].sha256='b'.repeat(64)
 if(mode==='table')value.tables[0].name='unreviewed'
 if(mode==='missing')value.tables.pop()
 if(mode==='duplicate')value.tables[1]={...value.tables[0]}
 if(mode==='readonly')value.read_only='off'
 if(mode==='role')value.query_role='authenticated'
 if(mode==='scope')value.scope_hash='0'.repeat(64)
 if(mode==='plan')value.plan_hash='0'.repeat(64)
 if(mode==='age')value.observed_at=new Date(now-300001).toISOString()
 if(mode==='future')value.observed_at=new Date(now+30001).toISOString()
 if(mode==='version')value.server_version='18.3'
 if(mode==='baseline')baseline.tables[0].sha256='b'.repeat(64)
 if(mode==='header')baseline.journalHeader='0'.repeat(64)
 if(mode==='future-baseline'){
  const {baselineHash:_hash,...body}=baseline;body.observedAt=new Date(now+30001).toISOString();Object.assign(baseline,body,{baselineHash:valueHash(body)})
 }
 expect(()=>verifyRestorePreservation(journal,baseline,value,mode==='future-baseline'?baseline.baselineHash:original.baselineHash,now)).toThrow('RESTORE_PRESERVATION_NOT_CONFIRMED')
})
it('baseline loader rejects hardlinks',()=>{
 writeRestorePreservationBaseline(journal,observation(),now)
 linkSync(join(folder,'preservation-baseline.json'),join(folder,'second-link'))
 expect(()=>loadRestorePreservationBaseline(journal)).toThrow('RESTORE_PRESERVATION_NOT_CONFIRMED')
})

it('a durable old baseline is evidence only and needs a fresh matching observation plus the reviewed hash',()=>{
 const original=observation(),baseline=createRestorePreservationBaseline(journal,original,now),later=now+86400000
 const fresh={...observation(),observed_at:new Date(later).toISOString()}
 expect(verifyRestorePreservation(journal,baseline,fresh,baseline.baselineHash,later)).toMatchObject({status:'REVIEWED_COMMERCIAL_INVENTORY_MATCH_ONLY'})
 expect(()=>verifyRestorePreservation(journal,baseline,original,baseline.baselineHash,later)).toThrow('RESTORE_PRESERVATION_NOT_CONFIRMED')
})
