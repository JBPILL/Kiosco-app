import { verifyFiscalRequest } from './fiscalReconciliation.ts'
import type { FrozenFiscalRequest } from './fiscalReconciliation.ts'
import type { FiscalWorkerBinding } from './fiscalWorkerAuthorization.ts'

const fail=():never=>{throw new Error('FISCAL_REVISION_NO_CONFIRMADA')}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
function object(input:unknown,keys:string[]):Record<string,unknown> {
  if(!input||typeof input!=='object'||Array.isArray(input))return fail()
  const value=input as Record<string,unknown>
  if(Object.keys(value).length!==keys.length||Object.keys(value).some(k=>!keys.includes(k)))return fail()
  return value
}
export interface FiscalOwnerApproval {
 id:string;operacion_id:string;solicitud_sha256:string;revision:number;aprobada:true;vence_en:string;emision_habilitada:false
}
export function validateFiscalOwnerApproval(input:unknown,operationId:string,hash:string,revision:number,id?:string):Readonly<FiscalOwnerApproval> {
  if(!uuid(operationId)||!/^[0-9a-f]{64}$/.test(hash)||!Number.isSafeInteger(revision)||revision<1||id!==undefined&&!uuid(id))return fail()
  const a=object(input,['id','operacion_id','solicitud_sha256','revision','aprobada','vence_en','emision_habilitada'])
  if(!uuid(a.id)||id!==undefined&&a.id!==id||a.operacion_id!==operationId||a.solicitud_sha256!==hash||a.revision!==revision
   ||a.aprobada!==true||a.emision_habilitada!==false||typeof a.vence_en!=='string'
   ||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(a.vence_en)||!Number.isFinite(Date.parse(a.vence_en)))return fail()
  return Object.freeze({...a}) as unknown as Readonly<FiscalOwnerApproval>
}
export interface FiscalOwnerReview {
 operacion_id:string;estado:'RESERVADA'|'ENVIO_INCIERTO'|'AUTORIZADA';revision:number
 solicitud:FrozenFiscalRequest;aprobacion:Readonly<FiscalOwnerApproval>|null
}
/** DTO explícito: ningún binding de custodia, respuesta cruda ni permiso de emisión. */
export async function validateFiscalOwnerReview(input:unknown,binding:FiscalWorkerBinding):Promise<Readonly<FiscalOwnerReview>> {
  const c=object(input,['operacion_id','estado','revision','solicitud','aprobacion']),frozen=await verifyFiscalRequest(c.solicitud)
  if(c.operacion_id!==binding.operacion_id||!['RESERVADA','ENVIO_INCIERTO','AUTORIZADA'].includes(String(c.estado))
   ||c.revision!==(c.estado==='AUTORIZADA'?2:1)||frozen.solicitud.cuitEmisor!==binding.cuit_emisor||frozen.solicitud.puntoVenta!==binding.punto_venta)return fail()
  const approval=c.aprobacion===null?null:validateFiscalOwnerApproval(c.aprobacion,binding.operacion_id,frozen.sha256,Number(c.revision))
  return Object.freeze({operacion_id:binding.operacion_id,estado:c.estado as FiscalOwnerReview['estado'],revision:Number(c.revision),solicitud:frozen,aprobacion:approval})
}
