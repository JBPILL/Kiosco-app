// @vitest-environment node
import { beforeEach,afterEach,expect,it } from 'vitest'
import {mkdtempSync,rmSync,readFileSync} from 'node:fs'
import {tmpdir} from 'node:os'
import {join,resolve,dirname,basename} from 'node:path'
import {createRestoreJournal,executeNextRestoreAction,inspectRestoreJournal,inspectUncertainRestoreAction,loadRestorePlan,PLAN_HASH} from '../../scripts/backup/restore-acceptance-engine.mjs'
import type {RestoreJournal} from '../../scripts/backup/restore-acceptance-engine.mjs'
import {buildUncertainRestoreReadSql,decodeUncertainRestoreRead} from '../../scripts/backup/restore-acceptance-recovery.mjs'
const plan=loadRestorePlan(),owner='11111111-1111-4111-8111-111111111111',cashier='22222222-2222-4222-8222-222222222222'
const secret='SYNTHETIC_PRIVATE_ADMIN_ACK'
let folder:string,journal:RestoreJournal
beforeEach(async()=>{
 folder=mkdtempSync(join(tmpdir(),'kiosko-recovery-query-'));journal=createRestoreJournal(join(folder,'journal.jsonl'),{OWNER:owner,CASHIER:cashier})
 await expect(executeNextRestoreAction(journal,{role:'OWNER',authId:owner,kioskId:plan.kioskId},async()=>{throw Error(secret)})).rejects.toThrow('RESTORE_OUTCOME_UNCERTAIN')
})
afterEach(()=>{if(dirname(folder)!==resolve(tmpdir())||!basename(folder).startsWith('kiosko-recovery-query-'))throw Error('Unsafe cleanup');rmSync(folder,{recursive:true,force:true})})
function evidence():Record<string,unknown>{
 const p=plan.steps[0].params,data=p.p_datos as Record<string,unknown>,pending=inspectRestoreJournal(journal).pending!
 return {read_only:'on',plan_hash:PLAN_HASH,operation_id:p.p_operacion_id,request_hash:pending.requestHash,context_matches:true,state:'BOUND',
 solicitud:{tabla:p.p_tabla,registro_id:p.p_registro_id,datos:p.p_datos,actor_auth_id:owner},
 resultado:{id:p.p_registro_id,kiosco_id:plan.kioskId,creado:true,saldo_conservado:false,registro:{...data,id:p.p_registro_id,kiosco_id:plan.kioskId},private:secret}}
}
it('bound administrative read is only a review candidate and never changes journal',async()=>{
 const before=readFileSync(journal.file,'utf8'),sql=buildUncertainRestoreReadSql(journal)
 expect(sql).toContain('REPEATABLE READ READ ONLY');expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
 expect(sql).not.toMatch(/GRANT|CREATE|UPDATE|DELETE|INSERT/)
 expect(sql).toContain("o.id='"+plan.steps[0].params.p_operacion_id+"'::uuid")
 expect(await inspectUncertainRestoreAction(journal,async()=>decodeUncertainRestoreRead(journal,evidence()))).toEqual({outcome:'ACK_MATCH_REQUIRES_REVIEW',mayResend:false,mayAdvance:false})
 expect(readFileSync(journal.file,'utf8')).toBe(before);expect(before).not.toContain(secret)
})
it.each(['read-write','wrong-plan','wrong-operation','wrong-hash','wrong-context','conflict','pending','missing-request','missing-result','wrong-actor'])('rejects %s administrative evidence without exposing ACK',mode=>{
 const e=evidence()
 if(mode==='read-write')e.read_only='off'
 if(mode==='wrong-plan')e.plan_hash='0'.repeat(64)
 if(mode==='wrong-operation')e.operation_id=cashier
 if(mode==='wrong-hash')e.request_hash='0'.repeat(64)
 if(mode==='wrong-context')e.context_matches=false
 if(mode==='conflict')e.state='CONFLICT'
 if(mode==='pending')e.state='RESULT_PENDING'
 if(mode==='missing-request')e.solicitud=null
 if(mode==='missing-result')e.resultado=null
 if(mode==='wrong-actor')e.solicitud={...(e.solicitud as Record<string,unknown>),actor_auth_id:cashier}
 try{decodeUncertainRestoreRead(journal,e);throw Error('Unexpected acceptance')}catch(error:unknown){
  expect(error).toBeInstanceOf(Error)
  const message=error instanceof Error?error.message:''
  expect(message).toMatch(/^RESTORE_RECOVERY_QUERY_(NOT_CONFIRMED|CONFLICT)$/);expect(message).not.toContain(secret)
 }
 expect(inspectRestoreJournal(journal).pending).not.toBeNull()
})
it('confirmed absence still provides no permission to retry',async()=>{
 const e={...evidence(),state:'ABSENT',solicitud:null,resultado:null}
 expect(await inspectUncertainRestoreAction(journal,async()=>decodeUncertainRestoreRead(journal,e))).toEqual({outcome:'ABSENCE_NOT_PROOF_OF_NONEXECUTION',mayResend:false,mayAdvance:false})
})
