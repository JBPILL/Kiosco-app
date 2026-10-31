// @vitest-environment node
import { expect,it } from 'vitest'
import { buildRestoreExecutionPackage,validateRestoreExecutionPackage,RESTORE_CAPTURE_SCOPE,RESTORE_EXECUTION_SCOPE } from '../../scripts/backup/restore-execution-package.mjs'
const actors={OWNER:'11111111-1111-4111-8111-111111111111',CASHIER:'22222222-2222-4222-8222-222222222222'}
const start=Date.parse('2026-11-01T12:00:00.000Z')
const capture=()=>({scope:RESTORE_CAPTURE_SCOPE,actors,startsAt:new Date(start).toISOString(),endsAt:new Date(start+900000).toISOString(),baselineHash:null,backup:null})
const execution=()=>({...capture(),scope:RESTORE_EXECUTION_SCOPE,baselineHash:'a'.repeat(64),backup:{directory:'pre-restore-acceptance-20261031-abcdef123456',archive:'synthetic.dump',archiveHash:'b'.repeat(64),rolesHash:'c'.repeat(64),contextHash:'d'.repeat(64),createdAt:new Date(start-3600000).toISOString(),clientImageId:'sha256:'+'e'.repeat(64)}})
it('capture binds runtime sources without granting RPC execution',()=>{
 const packet=buildRestoreExecutionPackage(capture())
 expect(validateRestoreExecutionPackage(packet,packet.packageHash,{now:start,execute:true})).toEqual(packet)
 expect(packet.totalExplicitRpcCalls).toBe(0)
 expect(packet.runtimeFiles['scripts/respaldar-staging-privado.ps1']).toMatch(/^[a-f0-9]{64}$/)
 expect(packet.runtimeFiles['scripts/backup_supabase.ps1']).toMatch(/^[a-f0-9]{64}$/)
 expect(packet).toMatchObject({requiresSpecificGo:true,requiresExclusiveOperator:true,automaticRetry:false,flags:false,arca:false,production:false,restoreUiEnabled:false})
})
it('execution binds backup, baseline and exact21 calls',()=>{
 const packet=buildRestoreExecutionPackage(execution())
 expect(validateRestoreExecutionPackage(packet,packet.packageHash,{now:start,execute:true}).totalExplicitRpcCalls).toBe(21)
})
it.each(['hash','sources','extra','expired','early','actor'])('rejects changed package or window: %s',mode=>{
 const packet=JSON.parse(JSON.stringify(buildRestoreExecutionPackage(capture())))
 let reviewed=packet.packageHash,now=start
 if(mode==='hash')reviewed='f'.repeat(64)
 if(mode==='sources')packet.runtimeFiles['package.json']='0'.repeat(64)
 if(mode==='extra')packet.extra=true
 if(mode==='expired')now=start+900000
 if(mode==='early')now=start-1
 if(mode==='actor')packet.actors.OWNER=actors.CASHIER
 expect(()=>validateRestoreExecutionPackage(packet,reviewed,{now,execute:true})).toThrow('RESTORE_EXECUTION_PACKAGE_NOT_CONFIRMED')
})
it.each(['oldbackup','futurebackup','missingbaseline','capturebackup','window','sameactor','extra'])('rejects invalid proposal: %s',mode=>{
 const input:{scope:typeof RESTORE_CAPTURE_SCOPE|typeof RESTORE_EXECUTION_SCOPE;actors:typeof actors;startsAt:string;endsAt:string;baselineHash:string;backup:ReturnType<typeof execution>['backup']}=execution()
 if(mode==='oldbackup')input.backup.createdAt=new Date(start-86400001).toISOString()
 if(mode==='futurebackup')input.backup.createdAt=new Date(start+1).toISOString()
 if(mode==='missingbaseline')input.baselineHash=''
 if(mode==='capturebackup')input.scope=RESTORE_CAPTURE_SCOPE
 if(mode==='window')input.endsAt=new Date(start+900001).toISOString()
 if(mode==='sameactor')input.actors={OWNER:actors.OWNER,CASHIER:actors.OWNER}
 const proposal=mode==='extra'?{...input,extra:true}:input
 expect(()=>buildRestoreExecutionPackage(proposal)).toThrow('RESTORE_EXECUTION_PACKAGE_NOT_CONFIRMED')
})
