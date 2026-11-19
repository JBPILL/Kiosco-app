import type { FiscalPreparationContext, FiscalSaleResolution } from './fiscalPreparationContract.ts'

const fail=():never=>{throw new Error('FISCAL_DATOS_EXPLICITOS_INVALIDOS')}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export function validateFiscalSaleResolution(input:unknown,sale:string):Readonly<FiscalSaleResolution> {
 const value=object(input,['venta_id','estado','operacion_id','preparacion_sha256','emision_habilitada'])
 const prepared=['DATOS_PREPARADOS','RESERVADA','ENVIO_INCIERTO','AUTORIZADA'],unprepared=['SIN_PREPARACION','NO_DISPONIBLE','REGISTRO_FISCAL_HEREDADO','REQUIERE_REVISION']
 if(!uuid(sale)||value.venta_id!==sale||value.emision_habilitada!==false)return fail()
 if(prepared.includes(String(value.estado))){
  if(!uuid(value.operacion_id)||typeof value.preparacion_sha256!=='string'||!/^[0-9a-f]{64}$/.test(value.preparacion_sha256))return fail()
 }else if(!unprepared.includes(String(value.estado))||value.operacion_id!==null||value.preparacion_sha256!==null)return fail()
 return Object.freeze({...value}) as unknown as Readonly<FiscalSaleResolution>
}
function object(value:unknown,keys:readonly string[]):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))return fail()
 const record=value as Record<string,unknown>
 if(Object.keys(record).length!==keys.length||keys.some(k=>!Object.hasOwn(record,k)))return fail()
 return record
}
export function validateFiscalPreparationContext(input:unknown):FiscalPreparationContext {
 const c=object(input,['version','venta_id','total','cuit_emisor','punto_venta','incluye_recepcion_envases','revision_parametros','condiciones','alicuotas'])
 if(c.version!==1||!uuid(c.venta_id)||typeof c.cuit_emisor!=='string'||!/^\d{11}$/.test(c.cuit_emisor)
  ||!Number.isSafeInteger(c.punto_venta)||Number(c.punto_venta)<1||Number(c.punto_venta)>99998
  ||!Number.isSafeInteger(c.revision_parametros)||Number(c.revision_parametros)<1||Number(c.revision_parametros)>2147483647
  ||typeof c.total!=='string'||!/^(0|[1-9][0-9]{0,9})\.[0-9]{2}$/.test(c.total)||typeof c.incluye_recepcion_envases!=='boolean'
  ||!Array.isArray(c.condiciones)||c.condiciones.length<1||c.condiciones.length>100||!Array.isArray(c.alicuotas)||c.alicuotas.length>100)return fail()
 const catalog=(value:unknown,condition:boolean)=>{
  const row=object(value,condition?['id','descripcion','comprobantes']:['id','descripcion'])
  if(!Number.isSafeInteger(row.id)||Number(row.id)<1||Number(row.id)>99||typeof row.descripcion!=='string'||!row.descripcion.trim()||row.descripcion.length>120)return fail()
  if(condition&&(!Array.isArray(row.comprobantes)||row.comprobantes.length<1||row.comprobantes.length>3
   ||row.comprobantes.some(v=>![1,6,11].includes(v))||new Set(row.comprobantes).size!==row.comprobantes.length))return fail()
  return row
 }
 const conditions=c.condiciones.map(v=>catalog(v,true)),rates=c.alicuotas.map(v=>catalog(v,false))
 if(new Set(conditions.map(v=>v.id)).size!==conditions.length||new Set(rates.map(v=>v.id)).size!==rates.length)return fail()
 return {version:1,venta_id:c.venta_id,total:c.total,cuit_emisor:c.cuit_emisor,punto_venta:Number(c.punto_venta),incluye_recepcion_envases:c.incluye_recepcion_envases,
  revision_parametros:Number(c.revision_parametros),condiciones:conditions.map(v=>({id:Number(v.id),descripcion:String(v.descripcion),comprobantes:[...v.comprobantes as number[]]})),
  alicuotas:rates.map(v=>({id:Number(v.id),descripcion:String(v.descripcion)}))}
}
