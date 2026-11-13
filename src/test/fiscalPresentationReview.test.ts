// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { approveFiscalPresentation,loadFiscalPresentationApproval } from '../../supabase/functions/_shared/fiscalPresentationReviewService'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
const auth=crypto.randomUUID(),identity={sale:crypto.randomUUID(),operation:crypto.randomUUID(),id:crypto.randomUUID(),bodySha:'a'.repeat(64),revision:1,presentationSha:'b'.repeat(64)}
function fixture(){
 const record={id:identity.id,operacion_id:identity.operation,solicitud_sha256:identity.bodySha,revision:1,aprobada:true,vence_en:'2026-10-23T16:30:00Z',emision_habilitada:false,presentacion_sha256:identity.presentationSha}
 let stored:unknown=null
 const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:auth}},error:null}))
 const rpc=vi.fn<FiscalAuthClient['rpc']>(async name=>{if(name==='aprobar_revision_presentacion_homologacion'){stored=record;return {data:{fake:true},error:null}}return {data:stored,error:null}})
 return {record,rpc,getUser,admin:{auth:{getUser},rpc},set:(v:unknown)=>{stored=v}}
}
it('bound approval ignores write ACK and confirms exact durable identity with original Auth once',async()=>{
 const f=fixture();expect(await approveFiscalPresentation(f.admin,'SYNTHETIC_JWT',identity)).toEqual(f.record)
 expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.rpc).toHaveBeenCalledTimes(3)
 expect(f.rpc.mock.calls.every(([,args])=>args.p_actor_auth_id===auth)).toBe(true)
 expect(f.rpc.mock.calls[1][1].p_presentacion_sha).toBe(identity.presentationSha)
})
it('lost approval ACK recovers same UUID without a second approval',async()=>{
 const f=fixture(),base=f.rpc.getMockImplementation()!
 f.rpc.mockImplementation(async(name,args)=>{const r=await base(name,args);if(name==='aprobar_revision_presentacion_homologacion')throw new Error('PRIVATE_SECRET');return r})
 expect(await approveFiscalPresentation(f.admin,'SYNTHETIC_JWT',identity)).toEqual(f.record)
 expect(f.rpc.mock.calls.filter(([name])=>name==='aprobar_revision_presentacion_homologacion')).toHaveLength(1)
})
it('replay reads existing approval without extending expiry or mutating',async()=>{
 const f=fixture();f.set(f.record);expect(await approveFiscalPresentation(f.admin,'SYNTHETIC_JWT',identity)).toEqual(f.record);expect(f.rpc).toHaveBeenCalledTimes(1)
})
it.each(['presentation','body','id','extra','enabled'])('rejects mismatched approval %s before mutation',async kind=>{
 const f=fixture();f.set({...f.record,...(kind==='presentation'?{presentacion_sha256:'c'.repeat(64)}:kind==='body'?{solicitud_sha256:'c'.repeat(64)}:kind==='id'?{id:crypto.randomUUID()}:kind==='extra'?{private:true}:{emision_habilitada:true})})
 await expect(approveFiscalPresentation(f.admin,'SYNTHETIC_JWT',identity)).rejects.toThrow('FISCAL_REVISION_PRESENTACION_NO_CONFIRMADA')
 expect(f.rpc).toHaveBeenCalledTimes(1)
})
it('fake write ACK cannot confirm absent approval',async()=>{
 const f=fixture();f.rpc.mockResolvedValue({data:null,error:null})
 await expect(approveFiscalPresentation(f.admin,'SYNTHETIC_JWT',identity)).rejects.toThrow('FISCAL_REVISION_PRESENTACION_NO_CONFIRMADA')
})
it('invalid identity and failed Auth do not expose private errors or call RPC',async()=>{
 const f=fixture();await expect(loadFiscalPresentationApproval(f.admin,'SYNTHETIC_JWT',{...identity,revision:2})).rejects.toThrow('FISCAL_REVISION_PRESENTACION_NO_CONFIRMADA')
 expect(f.getUser).not.toHaveBeenCalled();f.getUser.mockRejectedValue(new Error('PRIVATE_SECRET'))
 await expect(loadFiscalPresentationApproval(f.admin,'SYNTHETIC_JWT',identity)).rejects.toThrow('FISCAL_REVISION_PRESENTACION_NO_CONFIRMADA');expect(f.rpc).not.toHaveBeenCalled()
})
