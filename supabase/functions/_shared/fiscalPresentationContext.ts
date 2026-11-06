import { fiscalUuid,fiscalSha } from './fiscalReplacement.ts'
export interface FiscalPresentationContext {
 venta_id:string;operacion_id:string;solicitud_sha256:string
 lineas:readonly Readonly<{detalle_id:string;cantidad:string;precio_unitario:string;subtotal:string}>[]
}
const fail=():never=>{throw new Error('FISCAL_FUENTE_PRESENTACION_NO_CONFIRMADA')}
function object(input:unknown,keys:string[]):Record<string,unknown>{
 if(!input||typeof input!=='object'||Array.isArray(input))return fail()
 const v=input as Record<string,unknown>
 if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k)))return fail()
 return v
}
export function validateFiscalPresentationContext(input:unknown,sale:string,operation:string):Readonly<FiscalPresentationContext>{
 const v=object(input,['venta_id','operacion_id','solicitud_sha256','lineas'])
 if(!fiscalUuid(sale)||!fiscalUuid(operation)||v.venta_id!==sale||v.operacion_id!==operation||!fiscalSha(v.solicitud_sha256)||!Array.isArray(v.lineas)||v.lineas.length<1||v.lineas.length>200)return fail()
 const lineas=v.lineas.map(input=>{
  const x=object(input,['detalle_id','cantidad','precio_unitario','subtotal'])
  if(!fiscalUuid(x.detalle_id)||x.detalle_id!==x.detalle_id.toLowerCase()||typeof x.cantidad!=='string'||!/^(0|[1-9]\d{0,8})\.\d{3}$/.test(x.cantidad)||x.cantidad==='0.000'
   ||typeof x.precio_unitario!=='string'||!/^(0|[1-9]\d{0,9})\.\d{2}$/.test(x.precio_unitario)||typeof x.subtotal!=='string'||!/^(0|[1-9]\d{0,9})\.\d{2}$/.test(x.subtotal))return fail()
  return Object.freeze({detalle_id:x.detalle_id,cantidad:x.cantidad,precio_unitario:x.precio_unitario,subtotal:x.subtotal})
 })
 if(lineas.some((x,i)=>i>0&&lineas[i-1].detalle_id>=x.detalle_id))return fail()
 return Object.freeze({venta_id:sale,operacion_id:operation,solicitud_sha256:v.solicitud_sha256,lineas:Object.freeze(lineas)})
}
