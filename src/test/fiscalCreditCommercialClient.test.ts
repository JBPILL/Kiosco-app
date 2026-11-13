import { it,expect,vi } from 'vitest'
import { createFiscalClient } from '../lib/fiscalClient'
const scope={authId:crypto.randomUUID(),kioskId:crypto.randomUUID(),saleId:crypto.randomUUID()},target={saleId:scope.saleId,operationId:crypto.randomUUID(),requestId:crypto.randomUUID(),sha256:'a'.repeat(64)},cash=crypto.randomUUID()
const receipt=()=>({version:1,estado:'APLICACION_NC_REGISTRADA',id:target.requestId,venta_id:scope.saleId,operacion_origen_id:target.operationId,solicitud_sha256:'b'.repeat(64),kiosco_id:scope.kioskId,sesion_caja_id:cash,importe:'100.00',detalles:[{detalle_id:crypto.randomUUID(),producto_id:crypto.randomUUID(),tipo:'PRODUCTO',cantidad:'1.000',importe:'100.00',reingresa_stock:false}],stock:[],emision_habilitada:false,nuevo_reintegro:false})
function fixture(){
 const local=new Map<string,string>(),storage={getItem:(key:string)=>local.get(key)??null,setItem:(key:string,value:string)=>{local.set(key,value)}}
 const state={stored:false,visible:true,readFailure:false,applyFailure:false},value=receipt()
 const send=vi.fn(async(cmd:Record<string,unknown>)=>{
  if(cmd.accion==='APLICAR_NC'){if(!state.applyFailure)state.stored=true;throw new Error('LOST_ACK')}
  if(cmd.accion!=='APLICACION_NC')throw new Error('UNEXPECTED_COMMAND')
  if(state.readFailure)throw new Error('LOST_GET')
  return{version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:state.stored&&state.visible?value:null}
 })
 const make=(identity=scope)=>createFiscalClient(identity,{storage,send})
 return{local,storage,state,value,send,make,client:make().credits.commercial}
}
it('cliente052 guarda identidad antes del POST y confirma ACK perdido sólo por GET',async()=>{
 const f=fixture(),original=f.send.getMockImplementation()!
 f.send.mockImplementation(async cmd=>{if(cmd.accion==='APLICAR_NC')expect(f.client.pending()).toEqual({version:1,operationId:target.operationId,requestId:target.requestId,sha256:target.sha256,cashId:cash});return original(cmd)})
 expect(await f.client.apply(target,cash)).toEqual(f.value);expect(f.client.pending()).toBeNull();expect(f.send.mock.calls.map(([c])=>c.accion)).toEqual(['APLICACION_NC','APLICAR_NC','APLICACION_NC'])
 expect(await f.client.apply(target,cash)).toEqual(f.value);expect(f.send.mock.calls.filter(([c])=>c.accion==='APLICAR_NC')).toHaveLength(1)
})
it('cliente052 GET fallido nunca provoca POST automático',async()=>{const f=fixture();f.state.readFailure=true;await expect(f.client.apply(target,cash)).rejects.toThrow();expect(f.client.pending()).toBeNull();expect(f.send.mock.calls.map(([c])=>c.accion)).toEqual(['APLICACION_NC'])})
it('cliente052 reinicio recupera sin caja nueva ni otro POST',async()=>{
 const f=fixture();f.state.visible=false;await expect(f.client.apply(target,cash)).rejects.toThrow();expect(f.client.pending()?.cashId).toBe(cash)
 f.state.visible=true;expect(await f.make().credits.commercial.recover()).toEqual(f.value);expect(f.client.pending()).toBeNull();expect(f.send.mock.calls.filter(([c])=>c.accion==='APLICAR_NC')).toHaveLength(1)
})
it('cliente052 retry explícito usa exactamente caso/hash/caja originales',async()=>{
 const f=fixture();f.state.applyFailure=true;await expect(f.client.apply(target,cash)).rejects.toThrow();f.state.applyFailure=false
 await expect(f.client.apply({...target,requestId:crypto.randomUUID()},crypto.randomUUID())).rejects.toThrow()
 expect(await f.client.retry()).toEqual(f.value)
 const posts=f.send.mock.calls.filter(([c])=>c.accion==='APLICAR_NC').map(([c])=>c);expect(posts).toHaveLength(2);expect(posts[0]).toEqual(posts[1])
})
it('cliente052 dos ventanas con storage común no hacen dos POST',async()=>{const f=fixture();const results=await Promise.all([f.client.apply(target,cash),f.make().credits.commercial.apply(target,cash)]);expect(results).toEqual([f.value,f.value]);expect(f.send.mock.calls.filter(([c])=>c.accion==='APLICAR_NC')).toHaveLength(1)})
it('cliente052 storage fallido impide POST y scope ajeno no recupera pendiente',async()=>{
 const f=fixture();f.storage.setItem=()=>{throw new Error('STORAGE')};await expect(f.client.apply(target,cash)).rejects.toThrow();expect(f.send.mock.calls.some(([c])=>c.accion==='APLICAR_NC')).toBe(false)
 const g=fixture();g.state.visible=false;await expect(g.client.apply(target,cash)).rejects.toThrow();expect(g.make({...scope,authId:crypto.randomUUID()}).credits.commercial.pending()).toBeNull();expect(g.make({...scope,kioskId:crypto.randomUUID()}).credits.commercial.pending()).toBeNull()
})
it('cliente052 rechaza comercio ajeno en ACK y conserva pendiente',async()=>{const f=fixture();f.value.kiosco_id=crypto.randomUUID();await expect(f.client.apply(target,cash)).rejects.toThrow();expect(f.client.pending()).not.toBeNull()})

it('cliente052 consulta historial sin elegir caja actual y no aplica ni crea pendiente',async()=>{
 const f=fixture();expect(await f.client.status(target)).toBeNull();f.state.stored=true;expect(await f.client.status(target)).toEqual(f.value)
 expect(f.client.pending()).toBeNull();expect(f.send.mock.calls.every(([c])=>c.accion==='APLICACION_NC'&&!('sesion_caja_id' in c))).toBe(true)
})
it('cliente052 pendiente bloquea cancelación de NC hasta recuperar aplicación',async()=>{
 const f=fixture();f.state.visible=false;await expect(f.client.apply(target,cash)).rejects.toThrow();f.send.mockClear()
 await expect(f.make().credits.cancel(target.operationId,target.requestId,target.sha256)).rejects.toThrow();expect(f.send).not.toHaveBeenCalled();expect(f.client.pending()).not.toBeNull()
})
it('cliente052 revalida bloqueo después del GET antes del retry explícito',async()=>{
 const {createFiscalCreditCommercialClient}=await import('../lib/fiscalCreditCommercialClient'),f=fixture();let blocked=false
 const direct=createFiscalCreditCommercialClient(scope,{storage:f.storage,exclusive:async task=>task(),invoke:async command=>(await f.send(command)).resultado},()=>blocked)
 f.state.applyFailure=true;await expect(direct.apply(target,cash)).rejects.toThrow();f.send.mockClear()
 f.send.mockImplementation(async command=>{expect(command.accion).toBe('APLICACION_NC');blocked=true;return{version:1,entorno:'HOMOLOGACION',emision_habilitada:false,resultado:null}})
 await expect(direct.retry()).rejects.toThrow();expect(f.send.mock.calls.map(([c])=>c.accion)).toEqual(['APLICACION_NC']);expect(direct.pending()).not.toBeNull()
})