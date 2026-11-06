// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { validateFiscalPresentationContext } from '../../supabase/functions/_shared/fiscalPresentationContext'
import { loadFiscalPresentationContext } from '../../supabase/functions/_shared/fiscalPresentationContextService'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
const sale=crypto.randomUUID(),op=crypto.randomUUID(),detail=crypto.randomUUID(),actor=crypto.randomUUID()
const source=()=>({venta_id:sale,operacion_id:op,solicitud_sha256:'a'.repeat(64),lineas:[{detalle_id:detail,cantidad:'1.000',precio_unitario:'100.00',subtotal:'100.00'}]})
it('historical source is closed and immutable with explicit decimal strings',()=>{
 const input=source(),v=validateFiscalPresentationContext(input,sale,op);input.lineas[0].precio_unitario='999.00'
 expect(v.lineas[0].precio_unitario).toBe('100.00');expect(Object.isFrozen(v.lineas[0])).toBe(true)
})
it.each(['0.000','-1.000','1','1,000','1e3'])('rejects invalid quantity %s',cantidad=>{
 const v=source();v.lineas[0].cantidad=cantidad;expect(()=>validateFiscalPresentationContext(v,sale,op)).toThrow()
})
it('rejects foreign scope, duplicate lines and unrequested mutable catalog fields',()=>{
 expect(()=>validateFiscalPresentationContext(source(),op,op)).toThrow()
 const v=source();v.lineas.push({...v.lineas[0]});expect(()=>validateFiscalPresentationContext(v,sale,op)).toThrow()
 expect(()=>validateFiscalPresentationContext({...source(),catalogo:[]},sale,op)).toThrow()
})
it('source service uses verified original Auth once and no other RPC',async()=>{
 const getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:actor}},error:null})),rpc=vi.fn<FiscalAuthClient['rpc']>(async()=>({data:source(),error:null}))
 expect(await loadFiscalPresentationContext({auth:{getUser},rpc},'SYNTHETIC_JWT',sale,op)).toEqual(source())
 expect(getUser).toHaveBeenCalledTimes(1);expect(rpc).toHaveBeenCalledExactlyOnceWith('cargar_contexto_presentacion_homologacion',{p_actor_auth_id:actor,p_venta_id:sale,p_operacion_id:op})
})
