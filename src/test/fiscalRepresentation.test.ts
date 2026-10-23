// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { fiscalRepresentationFixture as fixture } from './fixtures/fiscalRepresentation'
import { validateFiscalRepresentation,fiscalRepresentationWire } from '../../supabase/functions/_shared/fiscalRepresentation'
import { loadFiscalRepresentation } from '../../supabase/functions/_shared/fiscalRepresentationService'
import type { FiscalAuthClient } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'
it('preserves adjusted subtotals rather than recomputing quantity times price; wire has no derived fields',async()=>{
 const f=await fixture(),value=await validateFiscalRepresentation(f.wire,f.sale,f.operation)
 expect(value.contexto.lineas[0].subtotal).toBe('123.45');expect(value.hechos.datos.emisor.razon_social).toBe('Emisor histórico')
 expect(Object.isFrozen(value.contexto.lineas[0])).toBe(true)
 expect(fiscalRepresentationWire(value)).toEqual(f.wire)
 expect(Object.keys((fiscalRepresentationWire(value).hechos as object))).not.toContain('datos')
})
it.each(['sum','ids','body','condition','scope','authorization','state','extra','text'])('rejects inconsistent representation %s',async kind=>{
 const f=await fixture(),v=f.wire
 if(kind==='sum')v.contexto.lineas[0].subtotal='123.44'
 if(kind==='ids')v.contexto.lineas[0].detalle_id=crypto.randomUUID()
 if(kind==='body')v.contexto.solicitud_sha256='b'.repeat(64)
 if(kind==='condition')v.condicion_emisor='RESPONSABLE_INSCRIPTO'
 if(kind==='scope')v.constancia.venta_id=crypto.randomUUID()
 if(kind==='authorization')v.constancia.autorizacion.cae='00000000000000'
 if(kind==='state')v.estado='APROBADA'
 if(kind==='text')v.condicion_receptor='Condición\u0000'
 await expect(validateFiscalRepresentation(kind==='extra'?{...v,private:true}:v,f.sale,f.operation)).rejects.toThrow()
})
it('representation service verifies Auth once and only reads its scoped RPC',async()=>{
 const f=await fixture(),getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:f.actor}},error:null})),rpc=vi.fn<FiscalAuthClient['rpc']>(async()=>({data:f.wire,error:null}))
 const value=await loadFiscalRepresentation({auth:{getUser},rpc},'SYNTHETIC_JWT',f.sale,f.operation)
 expect(value.venta_id).toBe(f.sale);expect(getUser).toHaveBeenCalledTimes(1)
 expect(rpc).toHaveBeenCalledExactlyOnceWith('cargar_representacion_fiscal_homologacion',{p_actor_auth_id:f.actor,p_venta_id:f.sale,p_operacion_id:f.operation})
})
it('representation service sanitizes failed private reads and rejects absent source',async()=>{
 const f=await fixture(),getUser=vi.fn<FiscalAuthClient['auth']['getUser']>(async()=>({data:{user:{id:f.actor}},error:null})),rpc=vi.fn<FiscalAuthClient['rpc']>(async()=>({data:null,error:new Error('PRIVATE_SECRET')}))
 await expect(loadFiscalRepresentation({auth:{getUser},rpc},'SYNTHETIC_JWT',f.sale,f.operation)).rejects.toThrow('FISCAL_REPRESENTACION_NO_CONFIRMADA')
 rpc.mockResolvedValue({data:null,error:null})
 await expect(loadFiscalRepresentation({auth:{getUser},rpc},'SYNTHETIC_JWT',f.sale,f.operation)).rejects.toThrow('FISCAL_REPRESENTACION_NO_CONFIRMADA')
})
