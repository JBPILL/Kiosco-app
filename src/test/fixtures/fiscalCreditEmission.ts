import { wsfeSoap } from './fiscalWsfe'
import type { FiscalCreditRequestData } from '../../../supabase/functions/_shared/fiscalCreditRequest'
export function syntheticFiscalCreditEmissionReceipt(s:FiscalCreditRequestData['solicitud'],state='A'):string{
return wsfeSoap('FECAESolicitar',`<FeCabResp><Cuit>${s.cuitEmisor}</Cuit><PtoVta>${s.puntoVenta}</PtoVta><CbteTipo>${s.tipoComprobante}</CbteTipo><FchProceso>${s.fecha}120000</FchProceso><CantReg>1</CantReg><Resultado>${state}</Resultado><Reproceso>N</Reproceso></FeCabResp><FeDetResp><FECAEDetResponse><Concepto>${s.concepto}</Concepto><DocTipo>${s.tipoDocumento}</DocTipo><DocNro>${s.numeroDocumento}</DocNro><CbteDesde>${s.numero}</CbteDesde><CbteHasta>${s.numero}</CbteHasta><CbteFch>${s.fecha}</CbteFch><Resultado>${state}</Resultado><CAE>${state==='A'?'11111111111111':''}</CAE><CAEFchVto>${state==='A'?s.fecha:''}</CAEFchVto></FECAEDetResponse></FeDetResp>`)
}
