import type { FiscalRequestData } from '../../../supabase/functions/_shared/fiscalReconciliation'
export const wsfeSample:FiscalRequestData={version:1,entorno:'HOMOLOGACION',cuitEmisor:'20123456786',puntoVenta:2,tipoComprobante:11,numero:1,
  concepto:1,tipoDocumento:99,numeroDocumento:'0',condicionIvaReceptor:5,fecha:'20261021',servicioDesde:null,servicioHasta:null,vencimientoPago:null,
  moneda:'PES',cotizacion:'1',importes:{total:'123.45',neto:'123.45',iva:'0',noGravado:'0',exento:'0',tributos:'0'},iva:[],tributos:[]}
export const wsfeSoap=(action:string,body:string):string=>`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><${action}Response xmlns="http://ar.gov.afip.dif.FEV1/"><${action}Result>${body}</${action}Result></${action}Response></s:Body></s:Envelope>`
export const wsfeLast=(number=0):string=>wsfeSoap('FECompUltimoAutorizado',`<PtoVta>2</PtoVta><CbteTipo>11</CbteTipo><CbteNro>${number}</CbteNro>`)
export function wsfeConsult():string {
  const fields={Concepto:1,DocTipo:99,DocNro:0,CbteDesde:1,CbteHasta:1,CbteFch:'20261021',ImpTotal:'123.45',ImpTotConc:0,ImpNeto:'123.45',ImpOpEx:0,ImpTrib:0,ImpIVA:0,
    FchServDesde:'',FchServHasta:'',FchVtoPago:'',MonId:'PES',MonCotiz:1,CanMisMonExt:'N',CondicionIVAReceptorId:5,Resultado:'A',CodAutorizacion:'11111111111111',EmisionTipo:'CAE',FchVto:'20261031',FchProceso:'20261021120000',PtoVta:2,CbteTipo:11}
  return wsfeSoap('FECompConsultar','<ResultGet>'+Object.entries(fields).map(([k,v])=>`<${k}>${v}</${k}>`).join('')+'</ResultGet>')
}
export function wsfeReceipt(state='A',overrides:Record<string,string>={}):string {
  const cab={Cuit:'20123456786',PtoVta:'2',CbteTipo:'11',FchProceso:'20261021120000',CantReg:'1',Resultado:state,Reproceso:'N',...overrides}
  const detail={Concepto:'1',DocTipo:'99',DocNro:'0',CbteDesde:'1',CbteHasta:'1',CbteFch:'20261021',Resultado:state,CAE:state==='A'?'11111111111111':'',CAEFchVto:state==='A'?'20261031':''}
  const xml=(values:Record<string,string>)=>Object.entries(values).map(([k,v])=>`<${k}>${v}</${k}>`).join('')
  return wsfeSoap('FECAESolicitar','<FeCabResp>'+xml(cab)+'</FeCabResp><FeDetResp><FECAEDetResponse>'+xml(detail)+'</FECAEDetResponse></FeDetResp>')
}
