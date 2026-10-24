import { validateFiscalPreparationContext } from './fiscalPreparationPublic.ts'
export { validateFiscalPreparationContext } from './fiscalPreparationPublic.ts'
import { freezeFiscalRequest } from './fiscalReconciliation.ts'
import type { FiscalRequestData, FrozenFiscalRequest } from './fiscalReconciliation.ts'
import type { FiscalPreparationContext, FiscalPreparationInput, FiscalIssuerCondition } from './fiscalPreparationContract.ts'
import { verifyFiscalEmissionRequest } from './fiscalEmissionContract.ts'

const fail=():never=>{throw new Error('FISCAL_DATOS_EXPLICITOS_INVALIDOS')}
function object(value:unknown,keys:readonly string[]):Record<string,unknown> {
 if(!value||typeof value!=='object'||Array.isArray(value))return fail()
 const record=value as Record<string,unknown>
 if(Object.keys(record).length!==keys.length||keys.some(k=>!Object.hasOwn(record,k)))return fail()
 return record
}
async function sha(text:string):Promise<string> {
 const bytes=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))
 return [...bytes].map(v=>v.toString(16).padStart(2,'0')).join('')
}
export interface PreparedFiscalData {
 version:1;venta_id:string;condicionEmisor:FiscalIssuerCondition;revision_parametros:number
 datos:Readonly<Omit<FiscalRequestData,'numero'>>;canonico:string;sha256:string
}
/** Sin fechas, IVA, punto, receptor ni importes fiscales por defecto. No reserva
 * numeración ni toca red. El número 1 sólo valida la forma del contrato existente;
 * se elimina antes de calcular el hash de preparación, nunca se persiste/emite. */
export async function prepareFiscalData(context:FiscalPreparationContext,input:unknown):Promise<Readonly<PreparedFiscalData>> {
 context=validateFiscalPreparationContext(context)
 if(context.incluye_recepcion_envases)throw new Error('FISCAL_ENVASES_REQUIERE_CRITERIO_CONFIRMADO')
 const root=object(input,['condicionEmisor','datos'])
 if(!['MONOTRIBUTO','RESPONSABLE_INSCRIPTO','EXENTO'].includes(String(root.condicionEmisor)))return fail()
 const datos=object(root.datos,['tipoComprobante','concepto','tipoDocumento','numeroDocumento','condicionIvaReceptor','fecha','servicioDesde','servicioHasta','vencimientoPago','moneda','cotizacion','importes','iva','tributos'])
 const amounts=object(datos.importes,['neto','iva','noGravado','exento','tributos'])
 if(root.condicionEmisor==='RESPONSABLE_INSCRIPTO'?![1,6].includes(Number(datos.tipoComprobante)):datos.tipoComprobante!==11)return fail()
 if(!context.condiciones.some(c=>c.id===datos.condicionIvaReceptor&&c.comprobantes.includes(Number(datos.tipoComprobante))))return fail()
 if(!Array.isArray(datos.iva)||datos.iva.some(v=>!v||typeof v!=='object'||!context.alicuotas.some(a=>a.id===(v as Record<string,unknown>).id)))return fail()
 const frozen=await freezeFiscalRequest({version:1,entorno:'HOMOLOGACION',cuitEmisor:context.cuit_emisor,puntoVenta:context.punto_venta,numero:1,
  ...datos,importes:{...amounts,total:context.total}})
 await verifyFiscalEmissionRequest(frozen)
 // En C el total de la operación se informa en neto, no en no gravado/exento.
 if(frozen.solicitud.tipoComprobante===11&&(frozen.solicitud.importes.noGravado!=='0.00'||frozen.solicitud.importes.exento!=='0.00'))return fail()
 const {numero:_validationOnly,...body}=frozen.solicitud
 Object.freeze(body)
 const base={version:1 as const,venta_id:context.venta_id,condicionEmisor:root.condicionEmisor as FiscalPreparationInput['condicionEmisor'],revision_parametros:context.revision_parametros,datos:body}
 const canonico=JSON.stringify(base)
 return Object.freeze({...base,canonico,sha256:await sha(canonico)})
}
/** Construcción final sólo con el número observado/reservado por el servidor.
 * El hash resultante es diferente del hash de preparación y se revisa por SQL 011. */
export async function requestFromPreparedFiscalData(prepared:Readonly<PreparedFiscalData>,numero:number):Promise<FrozenFiscalRequest> {
 if(await sha(prepared.canonico)!==prepared.sha256)return fail()
 const base={version:prepared.version,venta_id:prepared.venta_id,condicionEmisor:prepared.condicionEmisor,revision_parametros:prepared.revision_parametros,datos:prepared.datos}
 if(JSON.stringify(base)!==prepared.canonico)return fail()
 return freezeFiscalRequest({...prepared.datos,numero})
}
/** Verificación de datos guardados sin confiar en orden JSONB ni reconstruir
 * importes por inferencia. El canónico original debe coincidir byte por byte. */
export async function verifySavedFiscalPreparation(context:FiscalPreparationContext,canonico:unknown,hash:unknown):Promise<Readonly<PreparedFiscalData>> {
 if(typeof canonico!=='string'||new TextEncoder().encode(canonico).length>262144||typeof hash!=='string'||!/^[0-9a-f]{64}$/.test(hash))return fail()
 const root=object(JSON.parse(canonico),['version','venta_id','condicionEmisor','revision_parametros','datos'])
 const data=object(root.datos,['version','entorno','cuitEmisor','puntoVenta','tipoComprobante','concepto','tipoDocumento','numeroDocumento','condicionIvaReceptor','fecha','servicioDesde','servicioHasta','vencimientoPago','moneda','cotizacion','importes','iva','tributos'])
 const {version:_v,entorno:_e,cuitEmisor:_c,puntoVenta:_p,importes,...input}=data
 const {total:_t,...amounts}=object(importes,['total','neto','iva','noGravado','exento','tributos'])
 const verified=await prepareFiscalData(context,{condicionEmisor:root.condicionEmisor,datos:{...input,importes:amounts}})
 if(verified.canonico!==canonico||verified.sha256!==hash)return fail()
 return verified
}
