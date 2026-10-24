import { normalizeFiscalSeries, verifyFiscalRequest, escapeFiscalXml } from './fiscalReconciliation.ts'
import type { FrozenFiscalRequest } from './fiscalReconciliation.ts'

/** Reglas del cuerpo, compartibles con el navegador. Sin transporte, endpoints,
 * XML parser, Auth, custodia ni TA. No concede autorización fiscal. */
export async function verifyFiscalEmissionRequest(input:unknown):Promise<FrozenFiscalRequest> {
 const fail=():never=>{throw new Error('FISCAL_WSFE_NO_CONFIRMADO')}
 const frozen=await verifyFiscalRequest(input),s=frozen.solicitud
 const identity=normalizeFiscalSeries({entorno:s.entorno,cuitEmisor:s.cuitEmisor,puntoVenta:s.puntoVenta,tipoComprobante:s.tipoComprobante})
 if(identity.puntoVenta>99998||s.condicionIvaReceptor>99||s.vencimientoPago&&s.vencimientoPago<s.fecha
  ||s.tributos.some(t=>t.id>32767||t.descripcion.length>80||!/^(0|[1-9]\d{0,2})\.\d{2}00$/.test(t.alicuota)))return fail()
 for(const t of s.tributos)escapeFiscalXml(t.descripcion)
 return frozen
}
