import type { FiscalCreditDraftScope } from './fiscalCreditDraftAck.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import { fiscalSha,fiscalUuid } from './fiscalReplacement.ts'

export interface FiscalCreditCommercialDetail {detalle_id:string;producto_id:string;tipo:'PRODUCTO'|'COMBO'|'LIBRE';cantidad:string;importe:string;reingresa_stock:boolean}
export interface FiscalCreditCommercialApplication {
 version:1;estado:'APLICACION_NC_REGISTRADA';id:string;venta_id:string;operacion_origen_id:string;solicitud_sha256:string;kiosco_id:string;sesion_caja_id:string;importe:string
 detalles:readonly Readonly<FiscalCreditCommercialDetail>[];stock:readonly Readonly<{producto_id:string;stock_actual:number}>[];emision_habilitada:false;nuevo_reintegro:false
}
const fail=():never=>{throw new Error('FISCAL_APLICACION_NC_NO_CONFIRMADA')}
function object(input:unknown,keys:readonly string[]):Record<string,unknown>{if(!input||typeof input!=='object'||Array.isArray(input))return fail();const value=input as Record<string,unknown>;if(Object.keys(value).length!==keys.length||keys.some(k=>!Object.hasOwn(value,k)))return fail();return value}
function decimal(value:unknown,precision:2|3):string{if(typeof value!=='string'||!(precision===2?/^(?:0|[1-9]\d{0,9})\.\d{2}$/:/^(?:0|[1-9]\d{0,8})\.\d{3}$/).test(value))return fail();return value}
/** SQL052 ACK is durable evidence, never an instruction to hand cash over again. */
export function validateFiscalCreditCommercialApplication(input:unknown,scope:Readonly<FiscalCreditDraftScope>,cashId:string,bodySha?:string,draft?:Readonly<FiscalCreditDraft>):Readonly<FiscalCreditCommercialApplication>{
 if(!fiscalUuid(scope.saleId)||!fiscalUuid(scope.operationId)||!fiscalUuid(scope.requestId)||!fiscalSha(scope.sha256)||!fiscalUuid(cashId)||bodySha!==undefined&&!fiscalSha(bodySha))return fail()
 const r=object(structuredClone(input),['version','estado','id','venta_id','operacion_origen_id','solicitud_sha256','kiosco_id','sesion_caja_id','importe','detalles','stock','emision_habilitada','nuevo_reintegro'])
 if(r.version!==1||r.estado!=='APLICACION_NC_REGISTRADA'||r.id!==scope.requestId||r.venta_id!==scope.saleId||r.operacion_origen_id!==scope.operationId||r.sesion_caja_id!==cashId||!fiscalSha(r.solicitud_sha256)||bodySha!==undefined&&r.solicitud_sha256!==bodySha||!fiscalUuid(r.kiosco_id)||r.emision_habilitada!==false||r.nuevo_reintegro!==false)return fail()
 const importe=decimal(r.importe,2);if(Number(importe)<=0||!Array.isArray(r.detalles)||r.detalles.length===0||r.detalles.length>1000||!Array.isArray(r.stock)||r.stock.length>1000)return fail()
 const seen=new Set<string>(),details:Readonly<FiscalCreditCommercialDetail>[]=[];let cents=0
 for(const raw of r.detalles){
  const d=object(raw,['detalle_id','producto_id','tipo','cantidad','importe','reingresa_stock'])
  if(!fiscalUuid(d.detalle_id)||!fiscalUuid(d.producto_id)||seen.has(d.detalle_id)||d.tipo!=='PRODUCTO'&&d.tipo!=='COMBO'&&d.tipo!=='LIBRE'||typeof d.reingresa_stock!=='boolean'||d.tipo==='LIBRE'&&d.reingresa_stock)return fail()
  const cantidad=decimal(d.cantidad,3),amount=decimal(d.importe,2);if(Number(cantidad)<=0)return fail();seen.add(d.detalle_id);cents+=Math.round(Number(amount)*100)
  details.push(Object.freeze({detalle_id:d.detalle_id,producto_id:d.producto_id,tipo:d.tipo,cantidad,importe:amount,reingresa_stock:d.reingresa_stock}))
 }
 if(cents!==Math.round(Number(importe)*100))return fail()
 if(draft&&(draft.sha256!==scope.sha256||draft.datos.solicitud_id!==scope.requestId||draft.datos.importes.total!==importe||draft.datos.lineas.length!==details.length||draft.datos.lineas.some(l=>!details.some(d=>d.detalle_id===l.detalle_id&&d.cantidad===l.cantidad&&d.importe===l.importe&&d.reingresa_stock===l.reingresa_stock))))return fail()
 const stock:Readonly<{producto_id:string;stock_actual:number}>[]=[],products=new Set<string>()
 for(const raw of r.stock){const s=object(raw,['producto_id','stock_actual']);if(!fiscalUuid(s.producto_id)||products.has(s.producto_id)||typeof s.stock_actual!=='number'||!Number.isFinite(s.stock_actual)||s.stock_actual<0||s.stock_actual>999999999.999||Math.abs(s.stock_actual*1000-Math.round(s.stock_actual*1000))>0.0001)return fail();products.add(s.producto_id);stock.push(Object.freeze({producto_id:s.producto_id,stock_actual:s.stock_actual}))}
 return Object.freeze({version:1,estado:'APLICACION_NC_REGISTRADA',id:scope.requestId,venta_id:scope.saleId,operacion_origen_id:scope.operationId,solicitud_sha256:r.solicitud_sha256,kiosco_id:r.kiosco_id,sesion_caja_id:cashId,importe,detalles:Object.freeze(details),stock:Object.freeze(stock),emision_habilitada:false,nuevo_reintegro:false})
}
