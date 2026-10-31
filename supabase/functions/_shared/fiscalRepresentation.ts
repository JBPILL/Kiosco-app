import { validateFiscalReceipt } from './fiscalReceipt.ts'
import type { FiscalReceipt } from './fiscalReceipt.ts'
import { validateFiscalPresentationRecord } from './fiscalPresentation.ts'
import type { FiscalPresentationRecord } from './fiscalPresentation.ts'
import { validateFiscalPresentationContext } from './fiscalPresentationContext.ts'
import type { FiscalPresentationContext } from './fiscalPresentationContext.ts'
import type { FiscalIssuerCondition } from './fiscalPreparationContract.ts'
export interface FiscalRepresentation {
 version:1;entorno:'HOMOLOGACION';estado:'AUTORIZADA';venta_id:string;operacion_id:string
 condicion_emisor:FiscalIssuerCondition;condicion_receptor:string
 constancia:Readonly<FiscalReceipt>;hechos:Readonly<FiscalPresentationRecord>;contexto:Readonly<FiscalPresentationContext>
}
const fail=():never=>{throw new Error('FISCAL_REPRESENTACION_NO_CONFIRMADA')}
const cents=(value:string):bigint=>{if(!/^(0|[1-9]\d{0,12})\.\d{2}$/.test(value))return fail();return BigInt(value.replace('.',''))}
/** Constancia, hechos y detalle comparten venta/cuerpo; no autentica ARCA. */
export async function validateFiscalRepresentation(input:unknown,sale:string,operation:string):Promise<Readonly<FiscalRepresentation>>{
 if(!input||typeof input!=='object'||Array.isArray(input))return fail()
 const v=structuredClone(input) as Record<string,unknown>,keys=['version','entorno','estado','venta_id','operacion_id','condicion_emisor','condicion_receptor','constancia','hechos','contexto']
 if(Object.keys(v).length!==keys.length||keys.some(k=>!Object.hasOwn(v,k))||v.version!==1||v.entorno!=='HOMOLOGACION'||v.estado!=='AUTORIZADA'||v.venta_id!==sale||v.operacion_id!==operation
  ||typeof v.condicion_emisor!=='string'||!['MONOTRIBUTO','EXENTO','RESPONSABLE_INSCRIPTO'].includes(v.condicion_emisor)||typeof v.condicion_receptor!=='string'||!v.condicion_receptor.trim()||v.condicion_receptor.length>120
  ||[...v.condicion_receptor].some(c=>{const n=c.codePointAt(0)!;return n<32||(n>=127&&n<=159)||(n>=0xd800&&n<=0xdfff)}))return fail()
 const constancia=await validateFiscalReceipt(v.constancia,{operationId:operation,saleId:sale}),hechos=await validateFiscalPresentationRecord(v.hechos,sale,operation),contexto=validateFiscalPresentationContext(v.contexto,sale,operation)
 const request=constancia.solicitud.solicitud
 if(hechos.solicitud_sha256!==constancia.solicitud.sha256||contexto.solicitud_sha256!==constancia.solicitud.sha256
  ||hechos.datos.lineas.map(x=>x.detalle_id).join(',')!==contexto.lineas.map(x=>x.detalle_id).join(',')
  ||contexto.lineas.reduce((sum,x)=>sum+cents(x.subtotal),0n)!==cents(request.importes.total)
  ||hechos.datos.emisor.inicio_actividades>request.fecha||cents(hechos.datos.otros_impuestos_nacionales_indirectos)>cents(request.importes.total)-cents(request.importes.iva)
  ||(v.condicion_emisor==='RESPONSABLE_INSCRIPTO')!==(request.tipoComprobante===1||request.tipoComprobante===6))return fail()
 return Object.freeze({version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',venta_id:sale,operacion_id:operation,condicion_emisor:v.condicion_emisor as FiscalIssuerCondition,condicion_receptor:v.condicion_receptor,constancia,hechos,contexto})
}
/** Se envía sólo el canónico de hechos; sus datos se derivan verificando el hash. */
export function fiscalRepresentationWire(value:Readonly<FiscalRepresentation>):Record<string,unknown>{
 const {datos:_derived,...hechos}=value.hechos
 return {version:value.version,entorno:value.entorno,estado:value.estado,venta_id:value.venta_id,operacion_id:value.operacion_id,condicion_emisor:value.condicion_emisor,condicion_receptor:value.condicion_receptor,constancia:value.constancia,hechos,contexto:value.contexto}
}
