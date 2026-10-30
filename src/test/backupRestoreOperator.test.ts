// @vitest-environment node
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, basename, resolve } from 'node:path'
import { loginRestoreHttpClient } from '../../scripts/backup/restore-acceptance-http.mjs'
import { runRestoreRolePhase } from '../../scripts/backup/restore-acceptance-operator.mjs'
import { createRestoreJournal, inspectRestoreJournal, PLAN_HASH, loadRestorePlan, valueHash } from '../../scripts/backup/restore-acceptance-engine.mjs'
import type { RestoreJournal, RestoreRole } from '../../scripts/backup/restore-acceptance-engine.mjs'
import type { RestorePhaseOptions } from '../../scripts/backup/restore-acceptance-operator.mjs'
const plan=loadRestorePlan(),actors={OWNER:'11111111-1111-4111-8111-111111111111',CASHIER:'22222222-2222-4222-8222-222222222222'}
const secret='SYNTHETIC_PRIVATE_OPERATOR_PASSWORD_JWT_RESPONSE'
let folder:string,journal:RestoreJournal,calls:number,logouts:number,opens:number
beforeEach(()=>{folder=mkdtempSync(join(tmpdir(),'kiosko-restore-phase-'));journal=createRestoreJournal(join(folder,'journal.jsonl'),actors);calls=0;logouts=0;opens=0})
afterEach(()=>{vi.useRealTimers();if(dirname(folder)!==resolve(tmpdir())||!basename(folder).startsWith('kiosko-restore-phase-'))throw Error('Unsafe cleanup');rmSync(folder,{recursive:true,force:true})})
function options(mode='',role:RestoreRole='OWNER'):RestorePhaseOptions {
  const saved=new Map<string,{hash:string;data:Record<string,unknown>}>()
  return {journal,role,allowRun:true,reviewedPlanHash:PLAN_HASH,expiresAt:new Date(Date.now()+60000).toISOString(),
    preflight:async()=>{
      if(mode==='expiry')vi.setSystemTime(Date.now()+120000)
      return mode!=='preflight' && !(mode==='drift'&&calls>0)
    },
    openSession:async()=>{
      opens++
      return {
        verifyIdentity:async()=>{if(mode==='identity')throw Error(secret);return {role,authId:mode==='actor'?actors.CASHIER:actors[role],kioskId:plan.kioskId,profileId:actors[role]}},
        requestPlannedRpc:async(rpc,p)=>{
          calls++
          if(mode==='network')throw Error(secret)
          if(role==='CASHIER')return {status:403,data:{code:'42501',message:secret}}
          const key=String(p.p_operacion_id),prior=saved.get(key),hash=valueHash(p),d=p.p_datos as Record<string,unknown>
          if(prior)return prior.hash===hash?{status:200,data:prior.data}:{status:400,data:{code:'22023'}}
          if((d.lotes_backup as {cantidad_actual:number}[]|undefined)?.some(l=>l.cantidad_actual>Number(d.stock_actual)))return {status:400,data:{code:'22023'}}
          const id=p.p_producto_id??p.p_registro_id??p.p_lote_id
          const data=rpc==='restaurar_producto_backup'
            ?{producto:{...d,id,kiosco_id:plan.kioskId},lotes:(d.lotes_backup as Record<string,unknown>[]).map(l=>({...l,kiosco_id:plan.kioskId}))}
            :{id,kiosco_id:plan.kioskId,creado:!String(d.nombre).includes('ACTUALIZADO'),saldo_conservado:String(d.nombre).includes('ACTUALIZADO'),registro:{...d,id,kiosco_id:plan.kioskId,saldo_deudor:0,saldo_pendiente:0}}
          saved.set(key,{hash,data});return {status:200,data}
        },
        logoutLocal:async()=>{logouts++;if(mode==='logout')throw Error(secret);return {logoutLocalConfirmed:true}},
      }
    },
  }
}
it('runs only OWNER18 then CASHIER3 with two local logouts and no extra dispatch',async()=>{
  expect(await runRestoreRolePhase(options())).toMatchObject({status:'ROLE_PHASE_PASS',confirmed:18,logout:'CONFIRMED',mayRetry:false})
  expect(await runRestoreRolePhase(options('','CASHIER'))).toMatchObject({status:'ROLE_PHASE_PASS',confirmed:3,logout:'CONFIRMED'})
  expect(calls).toBe(21);expect(logouts).toBe(2)
  expect(inspectRestoreJournal(journal).complete).toBe(true)
  expect(await runRestoreRolePhase(options('','CASHIER'))).toMatchObject({status:'ROLE_PHASE_NOT_CONFIRMED',stage:'JOURNAL'})
  expect(opens).toBe(2);expect(readFileSync(journal.file,'utf8')).not.toContain(secret)
})
it.each(['gate','hash','expiry','preflight','identity','actor','network','drift','logout'])('fails closed on %s with safe result and no retry',async mode=>{
  if(mode==='expiry')vi.useFakeTimers({toFake:['Date']})
  const input=options(mode)
  if(mode==='gate')input.allowRun=false
  if(mode==='hash')input.reviewedPlanHash='0'.repeat(64)
  const result=await runRestoreRolePhase(input)
  expect(result.status).toBe('ROLE_PHASE_NOT_CONFIRMED');expect(result.mayRetry).toBe(false)
  expect(JSON.stringify(result)+readFileSync(journal.file,'utf8')).not.toContain(secret)
  expect(logouts).toBe(opens)
  if(['gate','hash','expiry','preflight','identity','actor'].includes(mode))expect(calls).toBe(0)
  if(mode==='network')expect(inspectRestoreJournal(journal).pending).not.toBeNull()
  if(mode==='drift'){
    expect(calls).toBe(1)
    expect(await runRestoreRolePhase(options())).toMatchObject({status:'ROLE_PHASE_NOT_CONFIRMED',stage:'JOURNAL'})
    expect(calls).toBe(1)
  }
  if(mode==='logout')expect(result.logout).toBe('NOT_CONFIRMED')
})
it('CASHIER cannot start before the owner phase',async()=>{
  expect(await runRestoreRolePhase(options('','CASHIER'))).toMatchObject({status:'ROLE_PHASE_NOT_CONFIRMED',stage:'JOURNAL'})
  expect(opens).toBe(0);expect(calls).toBe(0)
})

it('unknown login preserves phase exclusion without retrying credentials',async()=>{
  const input=options();input.openSession=async()=>{opens++;throw Error(secret)}
  expect(await runRestoreRolePhase(input)).toMatchObject({status:'ROLE_PHASE_NOT_CONFIRMED',stage:'SESSION',logout:'NOT_CONFIRMED'})
  expect(await runRestoreRolePhase(options())).toMatchObject({status:'ROLE_PHASE_NOT_CONFIRMED',stage:'LEASE'})
  expect(opens).toBe(1);expect(calls).toBe(0)
})
it('failed OWNER logout blocks CASHIER even after all18 owner actions were confirmed',async()=>{
  expect(await runRestoreRolePhase(options('logout'))).toMatchObject({status:'ROLE_PHASE_NOT_CONFIRMED',confirmed:18,logout:'NOT_CONFIRMED'})
  expect(await runRestoreRolePhase(options('','CASHIER'))).toMatchObject({status:'ROLE_PHASE_NOT_CONFIRMED',stage:'LEASE'})
  expect(opens).toBe(1);expect(calls).toBe(18)
})
it('a second operator cannot open a session while the first phase is live',async()=>{
  const input=options();let enter:((value:boolean)=>void)|undefined
  input.preflight=()=>new Promise(resolve=>{enter=resolve})
  const first=runRestoreRolePhase(input)
  expect(await runRestoreRolePhase(options())).toMatchObject({status:'ROLE_PHASE_NOT_CONFIRMED',stage:'LEASE'})
  enter!(false)
  expect(await first).toMatchObject({status:'ROLE_PHASE_NOT_CONFIRMED',stage:'PREFLIGHT'})
  expect(opens).toBe(0)
})

it('integrates login, verified HTTP identity, fixed RPC transport and the complete OWNER phase without real network',async()=>{
  const input=options(),makeSession=input.openSession,target='https://acoyfwwmhaeruciyedri.supabase.co'
  const encode=(value:object)=>Buffer.from(JSON.stringify(value)).toString('base64url')
  const token=encode({alg:'ES256'})+'.'+encode({role:'authenticated',sub:actors.OWNER,iss:target+'/auth/v1'})+'.SYNTHETIC'
  const fakeClient=await makeSession('OWNER')
  const request=vi.fn<typeof fetch>(async(url,init)=>{
    const route=String(url)
    if(route===target+'/auth/v1/token?grant_type=password')return Response.json({access_token:token,token_type:'bearer',user:{id:actors.OWNER},refresh_token:secret})
    if(route===target+'/auth/v1/user')return Response.json({id:actors.OWNER,role:'authenticated'})
    if(route.startsWith(target+'/rest/v1/usuarios?'))return Response.json([{id:actors.OWNER,auth_user_id:actors.OWNER,kiosco_id:plan.kioskId,rol:'DUEÑO',activo:true,es_superadmin:false}])
    if(route===target+'/auth/v1/logout?scope=local'){await fakeClient.logoutLocal();return new Response(null,{status:204})}
    if(route.startsWith(target+'/rest/v1/rpc/')){
      const reply=await fakeClient.requestPlannedRpc(route.split('/').at(-1)!,JSON.parse(String(init?.body)))
      return Response.json(reply.data,{status:reply.status})
    }
    throw Error(secret)
  })
  input.openSession=async()=>loginRestoreHttpClient({publicKey:'sb_publishable_SYNTHETIC_PUBLIC_KEY',authId:actors.OWNER,role:'OWNER',email:'owner@example.invalid',password:secret,allowMutations:true,reviewedPlanHash:PLAN_HASH},request)
  expect(await runRestoreRolePhase(input)).toMatchObject({status:'ROLE_PHASE_PASS',confirmed:18,logout:'CONFIRMED'})
  expect(calls).toBe(18);expect(logouts).toBe(1)
  expect(request.mock.calls.filter(([url])=>String(url).includes('/token?'))).toHaveLength(1)
  expect(readFileSync(journal.file,'utf8')).not.toContain(secret)
})
