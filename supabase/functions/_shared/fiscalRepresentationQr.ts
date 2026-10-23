import { fiscalRepresentationWire,validateFiscalRepresentation } from './fiscalRepresentation.ts'
import type { FiscalRepresentation } from './fiscalRepresentation.ts'
export interface FiscalRepresentationQr {entorno:'HOMOLOGACION';validez_fiscal:false;payload:string;url:string}
const fail=():never=>{throw new Error('FISCAL_QR_NO_CONFIRMADO')}
/** JSON numérico exacto: sin red ni coerción de importes/cotización a float. */
export async function buildFiscalRepresentationQr(input:Readonly<FiscalRepresentation>):Promise<Readonly<FiscalRepresentationQr>>{
 try{
  const captured=structuredClone(input)
  const keys=['version','entorno','estado','venta_id','operacion_id','condicion_emisor','condicion_receptor','constancia','hechos','contexto']
  if(!captured||Object.keys(captured).length!==keys.length||keys.some(key=>!Object.hasOwn(captured,key)))return fail()
  const value=await validateFiscalRepresentation(fiscalRepresentationWire(captured),captured.venta_id,captured.operacion_id)
  const s=value.constancia.solicitud.solicitud,cae=value.constancia.autorizacion.cae
  if(!/^[1-9]\d{10}$/.test(s.cuitEmisor)||!/^(0|[1-9]\d{0,12})\.\d{2}$/.test(s.importes.total)
   ||!/^(0|[1-9]\d{0,12})(?:\.\d{1,6})?$/.test(s.cotizacion)||!/^\d{1,20}$/.test(s.numeroDocumento)||!/[1-9]/.test(s.cotizacion)
   ||!/[1-9]/.test(s.importes.total)||!/^[1-9]\d{13}$/.test(cae)||!/^[A-Z0-9]{3}$/.test(s.moneda))return fail()
  const date=`${s.fecha.slice(0,4)}-${s.fecha.slice(4,6)}-${s.fecha.slice(6,8)}`
  const doc=s.numeroDocumento.replace(/^0+(?=\d)/,'')
  const payload=`{"ver":1,"fecha":${JSON.stringify(date)},"cuit":${s.cuitEmisor},"ptoVta":${s.puntoVenta},"tipoCmp":${s.tipoComprobante},"nroCmp":${s.numero},"importe":${s.importes.total},"moneda":${JSON.stringify(s.moneda)},"ctz":${s.cotizacion},"tipoDocRec":${s.tipoDocumento},"nroDocRec":${doc},"tipoCodAut":"E","codAut":${cae}}`
  return Object.freeze({entorno:'HOMOLOGACION',validez_fiscal:false,payload,url:'https://www.arca.gob.ar/fe/qr/?p='+encodeURIComponent(btoa(payload))})
 }catch{return fail()}
}
