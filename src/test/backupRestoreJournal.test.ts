// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import { createRestoreJournal, RestoreJournal, inspectRestoreJournal, executeNextRestoreAction, inspectUncertainRestoreAction, loadRestorePlan, valueHash } from '../../scripts/backup/restore-acceptance-engine.mjs'

const plan=loadRestorePlan(), actors={OWNER:'11111111-1111-4111-8111-111111111111',CASHIER:'22222222-2222-4222-8222-222222222222'}
const secret='SYNTHETIC_PRIVATE_WIRE_JWT_PASSWORD_BODY'
let root:string, file:string, journal:RestoreJournal
beforeEach(()=>{root=mkdtempSync(join(tmpdir(),'kiosko-restore-journal-'));file=join(root,'journal.jsonl');journal=createRestoreJournal(file,actors)})
afterEach(()=>{if(dirname(root)!==resolve(tmpdir())||!basename(root).startsWith('kiosko-restore-journal-'))throw Error('Unsafe cleanup');rmSync(root,{recursive:true,force:true})})
const actor=(role='OWNER')=>({role,authId:actors[role as keyof typeof actors],kioskId:plan.kioskId})
function ack(rpc:string,p:Record<string,unknown>) {
  const data=p.p_datos as Record<string,unknown>
  if(rpc==='restaurar_producto_backup')return {producto:{...data,id:p.p_producto_id,kiosco_id:plan.kioskId},lotes:(data.lotes_backup as Record<string,unknown>[]).map(l=>({...l,kiosco_id:plan.kioskId}))}
  const id=p.p_registro_id??p.p_lote_id
  return {id,kiosco_id:plan.kioskId,creado:!String(data.nombre).includes('ACTUALIZADO'),saldo_conservado:String(data.nombre).includes('ACTUALIZADO'),registro:{...data,id,kiosco_id:plan.kioskId,saldo_deudor:0,saldo_pendiente:0}}
}
it('completes only the fixed 21 actions with explicit replay and correct role pins',async()=>{
  const saved=new Map<string,{hash:string;data:ReturnType<typeof ack>}>()
  const calls:string[]=[]
  while(!inspectRestoreJournal(journal).complete){
    const role=inspectRestoreJournal(journal).cursor>=18?'CASHIER':'OWNER'
    await executeNextRestoreAction(journal,actor(role),async(rpc:string,p:Record<string,unknown>)=>{
      calls.push(rpc)
      if(role==='CASHIER')return {status:403,data:{code:'42501',message:secret}}
      const key=String(p.p_operacion_id),hash=valueHash(p),prior=saved.get(key)
      if(prior)return prior.hash===hash?{status:200,data:prior.data}:{status:400,data:{code:'22023',message:secret}}
      const d=p.p_datos as {stock_actual?:number;lotes_backup?:{cantidad_actual:number}[]}
      if(d.lotes_backup?.some(l=>l.cantidad_actual>(d.stock_actual??0)))return {status:400,data:{code:'22023',message:secret}}
      const data=ack(rpc,p);saved.set(key,{hash,data});return {status:200,data}
    })
  }
  expect(calls).toHaveLength(21);expect(saved.size).toBe(8)
  expect(inspectRestoreJournal(new RestoreJournal(file))).toMatchObject({cursor:21,complete:true,pending:null})
  expect(readFileSync(file,'utf8')).not.toContain(secret)
  await expect(executeNextRestoreAction(journal,actor('CASHIER'),()=>{throw Error('must not dispatch')})).rejects.toThrow('RESTORE_PLAN_COMPLETE')
})
it('fsync intent precedes dispatch, ACK loss survives reload, reconciliation never resends',async()=>{
  let calls=0,observed:Record<string,unknown>|null=null
  await expect(executeNextRestoreAction(journal,actor(),async(rpc:string,p:Record<string,unknown>)=>{
    calls++;const state=inspectRestoreJournal(new RestoreJournal(file));expect(state.pending).not.toBeNull()
    observed={operationId:p.p_operacion_id,kioskId:plan.kioskId,actorAuthId:actors.OWNER,requestHash:state.pending!.requestHash,ack:ack(rpc,p)}
    throw Error(secret)
  })).rejects.toThrow('RESTORE_OUTCOME_UNCERTAIN')
  const reopened=new RestoreJournal(file)
  expect(await inspectUncertainRestoreAction(reopened,async()=>observed)).toEqual({outcome:'ACK_MATCH_REQUIRES_REVIEW',mayResend:false,mayAdvance:false})
  await expect(executeNextRestoreAction(reopened,actor(),async()=>{calls++;throw Error(secret)})).rejects.toThrow('RESTORE_RECONCILIATION_REQUIRED')
  expect(calls).toBe(1);expect(readFileSync(file,'utf8')).not.toContain(secret)
})
it.each(['absent','wrong-actor','wrong-body','wrong-kiosk','wrong-ack','read-failed'])('uncertain outcome %s cannot advance',async mode=>{
  await expect(executeNextRestoreAction(journal,actor(),async()=>{throw Error(secret)})).rejects.toThrow('RESTORE_OUTCOME_UNCERTAIN')
  const pending=inspectRestoreJournal(journal).pending!
  const p=plan.steps[0].params
  const observed={operationId:p.p_operacion_id,kioskId:plan.kioskId,actorAuthId:actors.OWNER,requestHash:pending.requestHash,ack:ack(plan.steps[0].rpc,p)}
  if(mode==='wrong-actor')observed.actorAuthId=actors.CASHIER
  if(mode==='wrong-body')observed.requestHash='0'.repeat(64)
  if(mode==='wrong-kiosk')observed.kioskId='00000000-0000-0000-0000-000000000000'
  if(mode==='wrong-ack')observed.ack.registro!.id='00000000-0000-0000-0000-000000000000'
  const read=()=>{if(mode==='read-failed')throw Error(secret);return Promise.resolve(mode==='absent'?null:observed)}
  if(mode==='read-failed')await expect(inspectUncertainRestoreAction(journal,read)).rejects.toThrow('RESTORE_RECONCILIATION_READ_FAILED')
  else expect(await inspectUncertainRestoreAction(journal,read)).toMatchObject({outcome:mode==='absent'?'ABSENCE_NOT_PROOF_OF_NONEXECUTION':'CONFLICT_STOP',mayAdvance:false,mayResend:false})
  expect(inspectRestoreJournal(journal).pending).not.toBeNull()
})
it('disk failure before intent prevents dispatch; after ACK retains pending',async()=>{
  const append=journal.append.bind(journal);let calls=0
  journal.append=()=>{throw Error(secret)}
  await expect(executeNextRestoreAction(journal,actor(),async()=>{calls++;return {}})).rejects.toThrow('RESTORE_JOURNAL_WRITE_FAILED')
  expect(calls).toBe(0)
  journal.append=(event:Record<string,unknown>)=>{if(event.kind==='CONFIRMED')throw Error(secret);append(event)}
  await expect(executeNextRestoreAction(journal,actor(),async(rpc:string,p:Record<string,unknown>)=>{calls++;return {status:200,data:ack(rpc,p)}})).rejects.toThrow('RESTORE_JOURNAL_WRITE_FAILED')
  expect(calls).toBe(1);expect(inspectRestoreJournal(new RestoreJournal(file)).pending).not.toBeNull()
})
it('concurrent click cannot dispatch a second action',async()=>{
  let calls=0,release:((v:{status:number;data:ReturnType<typeof ack>})=>void)|undefined
  const p=plan.steps[0].params
  const first=executeNextRestoreAction(journal,actor(),()=>{calls++;return new Promise(done=>{release=done})})
  await expect(executeNextRestoreAction(journal,actor(),async()=>{calls++;return {}})).rejects.toThrow('RESTORE_JOURNAL_BUSY')
  release!({status:200,data:ack(plan.steps[0].rpc,p)});await first;expect(calls).toBe(1)
})
it.each(['wrong-role','wrong-auth','wrong-kiosk'])('rejects %s before intent or network',async mode=>{
  const a=actor();if(mode==='wrong-role')a.role='CASHIER';if(mode==='wrong-auth')a.authId=actors.CASHIER;if(mode==='wrong-kiosk')a.kioskId='00000000-0000-0000-0000-000000000000'
  await expect(executeNextRestoreAction(journal,a,()=>{throw Error(secret)})).rejects.toThrow('RESTORE_ACTOR_CHANGED')
  expect(journal.records()).toHaveLength(1)
})
it.each(['truncated','changed-byte','blank-tail'])('journal damage %s fails closed',mode=>{
  const data=readFileSync(file,'utf8');writeFileSync(file,mode==='truncated'?data.slice(0,-1):mode==='blank-tail'?data+'\n':data.replace(actors.OWNER,actors.CASHIER))
  expect(()=>inspectRestoreJournal(journal)).toThrow(/RESTORE_JOURNAL_/)
})
it('real child exit after fsynced intent leaves a lock and cannot be restarted automatically',()=>{
  const moduleUrl=pathToFileURL(resolve('scripts/backup/restore-acceptance-engine.mjs')).href
  const code=`import {RestoreJournal,executeNextRestoreAction} from ${JSON.stringify(moduleUrl)};await executeNextRestoreAction(new RestoreJournal(${JSON.stringify(file)}),${JSON.stringify(actor())},async()=>{process.exit(71)});`
  const child=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',timeout:15000,windowsHide:true})
  expect(child.status,child.stderr).toBe(71)
  expect(existsSync(file+'.lock')).toBe(true)
  expect(inspectRestoreJournal(new RestoreJournal(file)).pending).not.toBeNull()
  expect(child.stdout+child.stderr).not.toContain(secret)
})

it('a changed ACK on the explicitly planned replay blocks all further actions',async()=>{
  const p=plan.steps[0].params,reply=ack(plan.steps[0].rpc,p)
  await executeNextRestoreAction(journal,actor(),async()=>({status:200,data:reply}))
  await expect(executeNextRestoreAction(journal,actor(),async()=>({status:200,data:{...reply,untrusted:secret}}))).rejects.toThrow('RESTORE_REPLAY_ACK_MISMATCH')
  expect(inspectRestoreJournal(new RestoreJournal(file))).toMatchObject({cursor:1})
  expect(inspectRestoreJournal(journal).pending).not.toBeNull()
  expect(readFileSync(file,'utf8')).not.toContain(secret)
})
it.each([401,403,500,200])('unexpected HTTP/body %s leaves intent pending without leaking response',async status=>{
  await expect(executeNextRestoreAction(journal,actor(),async()=>({status,data:{message:secret}}))).rejects.toThrow('RESTORE_OUTCOME_UNCERTAIN')
  expect(inspectRestoreJournal(journal).pending).not.toBeNull()
  expect(readFileSync(file,'utf8')).not.toContain(secret)
})
