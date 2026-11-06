import { parseFiscalXmlRoot, fiscalXmlSchema as schema, fiscalXmlOne as one, fiscalXmlList as list, fiscalXmlText as text, fiscalXmlNumber as number } from './fiscalVoucherXml.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalCreditDraft } from './fiscalCreditDraft.ts'
import { validateFiscalCreditRequestRecord } from './fiscalCreditRequest.ts'
import { normalizeFiscalCuit } from './fiscalReconciliation.ts'
export interface FiscalCreditConsultIdentity {entorno:'HOMOLOGACION';cuitEmisor:string;puntoVenta:number;tipoComprobante:3|8|13;numero:number}
const SOAP='http://schemas.xmlsoap.org/soap/envelope/',XSI='http://www.w3.org/2001/XMLSchema-instance'
const invalid=():never=>{throw new Error('FISCAL_CONSULTA_XML_NC_INVALIDA')}
function validateIdentity(value:FiscalCreditConsultIdentity):void {
 if(!value||Object.keys(value).length!==5||value.entorno!=='HOMOLOGACION'||normalizeFiscalCuit(value.cuitEmisor)!==value.cuitEmisor
 ||![3,8,13].includes(value.tipoComprobante)||!Number.isSafeInteger(value.puntoVenta)||value.puntoVenta<1||value.puntoVenta>99998||!Number.isSafeInteger(value.numero)||value.numero<1||value.numero>99999999)return invalid()
}
export function decodeFiscalCreditVoucherXml(xml: string,consulta: FiscalCreditConsultIdentity): unknown {
  validateIdentity(consulta)
  const root=parseFiscalXmlRoot(xml)
  if(root.namespaceURI!==SOAP||root.localName!=='Envelope')return invalid()
  schema(root,['Header','Body'],SOAP)
  const body=one(root,'Body',true,SOAP)!
  schema(body,['FECompConsultarResponse'])
  const response=one(body,'FECompConsultarResponse')!
  schema(response,['FECompConsultarResult'])
  const result=one(response,'FECompConsultarResult')!
  schema(result,['ResultGet','Errors','Events'])
  const errors=list(result,'Errors','Err',['Code','Msg']).map(e=>({codigo:number(e,'Code')}))
  list(result,'Events','Evt',['Code','Msg']).forEach(e=>number(e,'Code'))
  const voucher=one(result,'ResultGet',false)
  if(errors.length || !voucher || ['true','1'].includes(voucher.getAttributeNS(XSI,'nil')??'')) {
    return {consulta,comprobante:null,autorizacion:null,errores:errors}
  }
  schema(voucher,['Concepto','DocTipo','DocNro','CbteDesde','CbteHasta','CbteFch','ImpTotal','ImpTotConc',
    'ImpNeto','ImpOpEx','ImpTrib','ImpIVA','FchServDesde','FchServHasta','FchVtoPago','MonId','MonCotiz',
    'CanMisMonExt','CondicionIVAReceptorId','CbtesAsoc','Iva','Tributos','Resultado','CodAutorizacion','EmisionTipo',
    'FchVto','FchProceso','Observaciones','PtoVta','CbteTipo'])
  const desde=number(voucher,'CbteDesde')
  if(desde!==number(voucher,'CbteHasta'))return invalid()
  const doc=text(voucher,'DocNro')
  if(!/^[0-9]{1,11}$/.test(doc))return invalid()
  const cotizacion=text(voucher,'MonCotiz'),misma=text(voucher,'CanMisMonExt',false)
  if(misma!==''&&misma!=='N')return invalid()
  list(voucher,'Observaciones','Obs',['Code','Msg']).forEach(e=>number(e,'Code'))
  return {consulta,errores:errors,comprobante:{version:1,entorno:consulta.entorno,cuitEmisor:consulta.cuitEmisor,
    puntoVenta:number(voucher,'PtoVta'),tipoComprobante:number(voucher,'CbteTipo'),numero:desde,
    concepto:number(voucher,'Concepto'),tipoDocumento:number(voucher,'DocTipo'),numeroDocumento:BigInt(doc).toString(),
    condicionIvaReceptor:number(voucher,'CondicionIVAReceptorId'),fecha:text(voucher,'CbteFch'),
    servicioDesde:text(voucher,'FchServDesde',false)||null,servicioHasta:text(voucher,'FchServHasta',false)||null,
    vencimientoPago:text(voucher,'FchVtoPago',false)||null,moneda:text(voucher,'MonId'),cotizacion:/^0*1(?:\.0+)?$/.test(cotizacion)?'1':cotizacion,
    comprobantesAsociados:list(voucher,'CbtesAsoc','CbteAsoc',['Tipo','PtoVta','Nro','Cuit','CbteFch']).map(e=>({tipo:number(e,'Tipo'),puntoVenta:number(e,'PtoVta'),numero:number(e,'Nro'),cuit:text(e,'Cuit',false)||null,fecha:text(e,'CbteFch',false)||null})),
    importes:{total:text(voucher,'ImpTotal'),neto:text(voucher,'ImpNeto'),iva:text(voucher,'ImpIVA'),
      noGravado:text(voucher,'ImpTotConc'),exento:text(voucher,'ImpOpEx'),tributos:text(voucher,'ImpTrib')},
    iva:list(voucher,'Iva','AlicIva',['Id','BaseImp','Importe']).map(e=>({id:number(e,'Id'),base:text(e,'BaseImp'),importe:text(e,'Importe')})),
    tributos:list(voucher,'Tributos','Tributo',['Id','Desc','BaseImp','Alic','Importe']).map(e=>({id:number(e,'Id'),
      descripcion:text(e,'Desc'),base:text(e,'BaseImp'),alicuota:text(e,'Alic'),importe:text(e,'Importe')}))},
  autorizacion:{resultado:text(voucher,'Resultado'),tipo:text(voucher,'EmisionTipo'),cae:text(voucher,'CodAutorizacion'),
    vencimiento:text(voucher,'FchVto'),procesadoEn:text(voucher,'FchProceso',false)||null}}
}
export type FiscalCreditVoucherReconciliation =
 |{estado:'AUTORIZACION_NC_COINCIDENTE';cae:string;vencimiento:string;procesadoEn:string|null;solicitudSha256:string;puedeReenviar:false}
 |{estado:'CONCILIAR';codigo:'RESPUESTA_INVALIDA'|'SIN_CONFIRMACION'|'DATOS_DISTINTOS'|'ASOCIACION_INCOMPLETA';puedeReenviar:false}
const record=(value:unknown):Record<string,unknown>=>{if(!value||typeof value!=='object'||Array.isArray(value))return invalid();return value as Record<string,unknown>}
function decimal(value:unknown,precision=2):string {
 if(typeof value!=='string'||value.length>32||!/^\d+(?:\.\d+)?$/.test(value))return invalid()
 const [whole,part='']=value.split('.')
 if(part.slice(precision).replace(/0/g,''))return invalid()
 return BigInt(whole).toString()+'.'+part.slice(0,precision).padEnd(precision,'0')
}
function date(value:unknown):string {
 if(typeof value!=='string'||!/^\d{8}$/.test(value)||value.slice(0,4)==='0000')return invalid()
 const iso=value.slice(0,4)+'-'+value.slice(4,6)+'-'+value.slice(6,8),parsed=new Date(iso+'T00:00:00Z')
 if(!Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==iso)return invalid();return value
}
/** Puro: reconstruye solicitud NC, no autentica transporte, persiste CAE ni aplica efectos. */
export async function reconcileFiscalCreditVoucherXml(xml:string,packet:unknown,source:Readonly<FiscalRepresentation>,draft:Readonly<FiscalCreditDraft>):Promise<FiscalCreditVoucherReconciliation> {
 const review=(codigo:'RESPUESTA_INVALIDA'|'SIN_CONFIRMACION'|'DATOS_DISTINTOS'|'ASOCIACION_INCOMPLETA'):FiscalCreditVoucherReconciliation=>({estado:'CONCILIAR',codigo,puedeReenviar:false})
 try {
  const frozen=await validateFiscalCreditRequestRecord(packet,source,draft),expected=frozen.datos.solicitud
  const identity:FiscalCreditConsultIdentity={entorno:'HOMOLOGACION',cuitEmisor:expected.cuitEmisor,puntoVenta:expected.puntoVenta,tipoComprobante:expected.tipoComprobante,numero:expected.numero}
  const observed=record(decodeFiscalCreditVoucherXml(xml,identity))
  if(!Array.isArray(observed.errores)||observed.errores.length||observed.comprobante===null||observed.autorizacion===null)return review('SIN_CONFIRMACION')
  const actual=record(observed.comprobante),auth=record(observed.autorizacion)
  for(const key of ['version','entorno','cuitEmisor','puntoVenta','tipoComprobante','numero','concepto','tipoDocumento','numeroDocumento','condicionIvaReceptor','fecha','servicioDesde','servicioHasta','vencimientoPago','moneda','cotizacion'] as const)if(actual[key]!==expected[key])return review('DATOS_DISTINTOS')
  const amounts=record(actual.importes)
  for(const key of ['total','neto','iva','noGravado','exento','tributos'] as const)if(decimal(amounts[key])!==decimal(expected.importes[key]))return review('DATOS_DISTINTOS')
  for(const key of ['iva','tributos'] as const){
   const rows=actual[key];if(!Array.isArray(rows)||rows.length!==expected[key].length)return review('DATOS_DISTINTOS')
   const indexed=new Map<number,Record<string,unknown>>()
   for(const row of rows){const r=record(row);if(typeof r.id!=='number'||indexed.has(r.id))return review('RESPUESTA_INVALIDA');indexed.set(r.id,r)}
   for(const line of expected[key]){const found=indexed.get(line.id);if(!found||decimal(found.base)!==decimal(line.base)||decimal(found.importe)!==decimal(line.importe))return review('DATOS_DISTINTOS')
    if('descripcion' in line&&(found.descripcion!==line.descripcion||decimal(found.alicuota,4)!==decimal(line.alicuota,4)))return review('DATOS_DISTINTOS')}
  }
  const associations=actual.comprobantesAsociados
  if(!Array.isArray(associations)||associations.length!==expected.comprobantesAsociados.length)return review('DATOS_DISTINTOS')
  for(let i=0;i<associations.length;i++){
   const a=record(associations[i]),e=expected.comprobantesAsociados[i]
   if(a.tipo!==e.tipo||a.puntoVenta!==e.puntoVenta||a.numero!==e.numero)return review('DATOS_DISTINTOS')
   if(a.cuit===null||a.fecha===null)return review('ASOCIACION_INCOMPLETA')
   if(a.cuit!==e.cuit||date(a.fecha)!==e.fecha)return review('DATOS_DISTINTOS')
  }
  if(auth.resultado!=='A'||auth.tipo!=='CAE')return review('SIN_CONFIRMACION')
  if(typeof auth.cae!=='string'||!/^\d{14}$/.test(auth.cae)||/^0+$/.test(auth.cae))return review('RESPUESTA_INVALIDA')
  const vencimiento=date(auth.vencimiento);if(vencimiento<expected.fecha)return review('RESPUESTA_INVALIDA')
  if(auth.procesadoEn===null)return review('RESPUESTA_INVALIDA')
  let processed:string|null=null
  if(auth.procesadoEn!==null){if(typeof auth.procesadoEn!=='string'||!/^\d{8}(?:\d{6})?$/.test(auth.procesadoEn))return review('RESPUESTA_INVALIDA');const processDate=date(auth.procesadoEn.slice(0,8));if(processDate<expected.fecha||processDate>vencimiento)return review('RESPUESTA_INVALIDA');if(auth.procesadoEn.length===14&&(Number(auth.procesadoEn.slice(8,10))>23||Number(auth.procesadoEn.slice(10,12))>59||Number(auth.procesadoEn.slice(12,14))>59))return review('RESPUESTA_INVALIDA');processed=auth.procesadoEn}
  return{estado:'AUTORIZACION_NC_COINCIDENTE',cae:auth.cae,vencimiento,procesadoEn:processed,solicitudSha256:frozen.sha256,puedeReenviar:false}
 }catch{return review('RESPUESTA_INVALIDA')}
}
