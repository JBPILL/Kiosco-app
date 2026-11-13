// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { prepareFiscalData } from '../../supabase/functions/_shared/fiscalPreparation'
import { validateFiscalReplacement, validateFiscalReplacementProposal } from '../../supabase/functions/_shared/fiscalReplacement'
import { loadFiscalReplacement, replaceFiscalPreparation } from '../../supabase/functions/_shared/fiscalReplacementService'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
import { wsfeSample } from './fixtures/fiscalWsfe'
const sale=crypto.randomUUID(),op=crypto.randomUUID(),successor=crypto.randomUUID(),actor=crypto.randomUUID(),oldHash='a'.repeat(64)
async function proposal(){
 const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,numero:_n,...data}=wsfeSample
 const {total:_t,...importes}=data.importes
 const p=await prepareFiscalData({version:1,venta_id:sale,total:'123.45',cuit_emisor:wsfeSample.cuitEmisor,punto_venta:7,incluye_recepcion_envases:false,revision_parametros:1,condiciones:[{id:5,descripcion:'Ensayo',comprobantes:[11]}],alicuotas:[]},{condicionEmisor:'MONOTRIBUTO',datos:{...data,importes}})
 return {canonico:p.canonico,sha256:p.sha256}
}
async function fixture(){
 const p=await proposal(),ack={operacion_id:op,sucesora_id:successor,venta_id:sale,anterior_sha256:oldHash,preparacion_sha256:p.sha256,sucesora_sha256:'b'.repeat(64),numero:1,estado:'SUSTITUIDA',emision_habilitada:false}
 const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:actor}},error:null}))
 const rpc=vi.fn<FiscalAuthClient['rpc']>(async()=>({data:ack,error:null})),admin={auth:{getUser},rpc}
 return {p,ack,admin,rpc,getUser,run:()=>replaceFiscalPreparation(admin,'SYNTHETIC_JWT',sale,op,successor,oldHash,p)}
}
it('propuesta canónica valida cuerpo/hash sin incorporar número estructural',async()=>{
 const p=await proposal(),result=await validateFiscalReplacementProposal(p,sale)
 expect(result).toEqual(p);expect(Object.isFrozen(result)).toBe(true);expect(JSON.parse(result.canonico).datos).not.toHaveProperty('numero')
})
it.each(['hash','venta','extra','numero','revision','condicion','duplicado'])('propuesta %s no válida no llega a Auth/escritura',async mode=>{
 const f=await fixture(),p={...f.p},root=JSON.parse(p.canonico)
 if(mode==='hash')p.sha256='c'.repeat(64)
 else {
  if(mode==='venta')root.venta_id=crypto.randomUUID()
  if(mode==='extra')root.binding='PRIVATE'
  if(mode==='numero')root.datos.numero=1
  if(mode==='revision')root.revision_parametros=0
  if(mode==='condicion')root.condicionEmisor=''
  p.canonico=JSON.stringify(root)
  if(mode==='duplicado')p.canonico=p.canonico.replace('"version":1','"version":1,"version":1')
  p.sha256=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(p.canonico)))].map(b=>b.toString(16).padStart(2,'0')).join('')
 }
 await expect(replaceFiscalPreparation(f.admin,'SYNTHETIC_JWT',sale,op,successor,oldHash,p)).rejects.toThrow('FISCAL_SUSTITUCION_NO_CONFIRMADA')
 expect(f.getUser).not.toHaveBeenCalled();expect(f.rpc).not.toHaveBeenCalled()
})
it('Auth original único en escritura y lectura, sin metadata/custodia ni consulta ARCA',async()=>{
 const f=await fixture(),result=await f.run();expect(result).toEqual(f.ack);expect(Object.isFrozen(result)).toBe(true)
 expect(f.getUser).toHaveBeenCalledExactlyOnceWith('SYNTHETIC_JWT')
 expect(f.rpc.mock.calls.map(([name])=>name)).toEqual(['sustituir_reserva_fiscal_homologacion','consultar_sustitucion_fiscal_homologacion'])
 for(const [,args] of f.rpc.mock.calls)expect(args.p_actor_auth_id).toBe(actor)
 expect(f.rpc.mock.calls[0][1]).toMatchObject({p_sucesora_id:successor,p_anterior_sha:oldHash,p_canonico:f.p.canonico,p_sha:f.p.sha256})
})
it('ACK perdido tras escritura se confirma sólo por lectura durable con actor capturado',async()=>{
 const f=await fixture();f.rpc.mockImplementationOnce(async()=>{f.getUser.mockResolvedValue({data:{user:{id:crypto.randomUUID()}},error:null});throw new Error('LOST_PRIVATE_ACK')})
 expect(await f.run()).toEqual(f.ack);expect(f.getUser).toHaveBeenCalledTimes(1);expect(f.rpc.mock.calls[1][1].p_actor_auth_id).toBe(actor)
})
it.each(['ausente','error','sucesora','hash','numero','extra','emision'])('lectura %s no confirma un ACK de escritura válido',async mode=>{
 const f=await fixture();let data:unknown={...f.ack}
 if(mode==='ausente')data=null
 if(mode==='error')f.rpc.mockResolvedValueOnce({data:f.ack,error:null}).mockResolvedValueOnce({data:null,error:new Error('PRIVATE')})
 else {
  if(mode==='sucesora')data={...f.ack,sucesora_id:crypto.randomUUID()}
  if(mode==='hash')data={...f.ack,preparacion_sha256:'c'.repeat(64)}
  if(mode==='numero')data={...f.ack,numero:0}
  if(mode==='extra')data={...f.ack,token:'PRIVATE'}
  if(mode==='emision')data={...f.ack,emision_habilitada:true}
  f.rpc.mockResolvedValueOnce({data:f.ack,error:null}).mockResolvedValueOnce({data,error:null})
 }
 await expect(f.run()).rejects.toThrow('FISCAL_SUSTITUCION_NO_CONFIRMADA')
})
it('consulta histórica puede devolver null, Auth inválido nunca llega a DB',async()=>{
 const f=await fixture();f.rpc.mockResolvedValueOnce({data:null,error:null});expect(await loadFiscalReplacement(f.admin,'SYNTHETIC_JWT',sale,op)).toBeNull()
 f.getUser.mockResolvedValue({data:{user:null},error:new Error('PRIVATE')});f.rpc.mockClear();await expect(f.run()).rejects.toThrow();expect(f.rpc).not.toHaveBeenCalled()
})
it.each(['operacion_id','venta_id','estado','anterior_sha256','sucesora_id'])('DTO público rechaza %s alterado',async field=>{
 const f=await fixture();expect(()=>validateFiscalReplacement({...f.ack,[field]:'INVALID'},sale,op)).toThrow()
})
