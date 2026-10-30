// @vitest-environment node
import { beforeEach, afterEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename, resolve } from 'node:path'
import { createRestoreJournal, executeNextRestoreAction, loadRestorePlan, PLAN_HASH } from '../../scripts/backup/restore-acceptance-engine.mjs'
import type { RestoreJournal } from '../../scripts/backup/restore-acceptance-engine.mjs'
import { buildRestoreStateReadSql, verifyRestoreStateRead } from '../../scripts/backup/restore-state-preflight.mjs'
let folder:string,journal:RestoreJournal
const actors={OWNER:'11111111-1111-4111-8111-111111111111',CASHIER:'22222222-2222-4222-8222-222222222222'},plan=loadRestorePlan()
const now=Date.parse('2026-10-30T18:00:00Z')
beforeEach(()=>{folder=mkdtempSync(join(tmpdir(),'kiosko-restore-state-'));journal=createRestoreJournal(join(folder,'journal.jsonl'),actors)})
afterEach(()=>{if(dirname(folder)!==resolve(tmpdir())||!basename(folder).startsWith('kiosko-restore-state-'))throw Error('Unsafe cleanup');rmSync(folder,{recursive:true,force:true})})
function empty(){return {read_only:'on',observed_at:new Date(now).toISOString(),plan_hash:PLAN_HASH,cursor:0,commercial_active:true,owner_active:true,cashier_active:true,fixtures:{clientes:{count:0,matches:true},proveedores:{count:0,matches:true},productos:{count:0,matches:true},lotes_producto:{count:0,matches:true}},operations:[] as Record<string,unknown>[],stock_ids:[] as string[],stock_context:true,movements:0,cost_rows:0}}
it('emits fixed SELECT-only READ ONLY/ROLLBACK scoped to all future and rejected UUIDs',()=>{
 const sql=buildRestoreStateReadSql(journal)
 expect(sql).toContain('REPEATABLE READ READ ONLY');expect(sql.trimEnd().endsWith('ROLLBACK;')).toBe(true)
 expect(sql).not.toMatch(/\b(CREATE|INSERT|UPDATE|DELETE|GRANT|CALL)\b/)
 for(const step of [...plan.steps,...plan.cashierDeniedCalls])expect(sql).toContain(step.params.p_operacion_id)
 expect(verifyRestoreStateRead(journal,empty(),now)).toMatchObject({status:'OWNED_FIXTURES_MATCH_ONLY',cursor:0,operations:0})
})
it.each(['readonly','age','future','cursor','plan','commercial','owner','cashier','fixture','row','stock','movement','cost','ack'])('rejects %s drift without any dispatch',mode=>{
 const value=empty()
 if(mode==='readonly')value.read_only='off'
 if(mode==='age')value.observed_at=new Date(now-300001).toISOString()
 if(mode==='future')value.observed_at=new Date(now+30001).toISOString()
 if(mode==='cursor')value.cursor=1
 if(mode==='plan')value.plan_hash='0'.repeat(64)
 if(mode==='commercial')value.commercial_active=false
 if(mode==='owner')value.owner_active=false
 if(mode==='cashier')value.cashier_active=false
 if(mode==='fixture')value.fixtures.clientes.count=1
 if(mode==='row')value.operations.push({id:'unexpected',matches:true})
 if(mode==='stock')value.stock_ids.push(actors.OWNER)
 if(mode==='movement')value.movements=1
 if(mode==='cost')value.cost_rows=1
 if(mode==='ack')value.stock_context=false
 expect(()=>verifyRestoreStateRead(journal,value,now)).toThrow('RESTORE_STATE_NOT_CONFIRMED')
})
it('durable root ACK hash must still match after the first confirmed write',async()=>{
 const p=plan.steps[0].params,reply={id:p.p_registro_id,kiosco_id:plan.kioskId,creado:true,saldo_conservado:false,registro:{...(p.p_datos as object),id:p.p_registro_id,kiosco_id:plan.kioskId,saldo_pendiente:0}}
 await executeNextRestoreAction(journal,{role:'OWNER',authId:actors.OWNER,kioskId:plan.kioskId},async()=>({status:200,data:reply}))
 const value=empty();value.cursor=1;value.fixtures.proveedores.count=1;value.operations=[{id:p.p_operacion_id,matches:true,result:reply}]
 expect(verifyRestoreStateRead(journal,value,now)).toMatchObject({operations:1,cursor:1})
 value.operations[0].result={...reply,unreviewed:'SYNTHETIC_PRIVATE_BODY'}
 expect(()=>verifyRestoreStateRead(journal,value,now)).toThrow('RESTORE_STATE_NOT_CONFIRMED')
})
it('pending intention cannot be classified as a normal preflight',async()=>{
 await expect(executeNextRestoreAction(journal,{role:'OWNER',authId:actors.OWNER,kioskId:plan.kioskId},async()=>{throw Error('synthetic')})).rejects.toThrow('RESTORE_OUTCOME_UNCERTAIN')
 expect(()=>buildRestoreStateReadSql(journal)).toThrow('RESTORE_STATE_NOT_CONFIRMED')
})
