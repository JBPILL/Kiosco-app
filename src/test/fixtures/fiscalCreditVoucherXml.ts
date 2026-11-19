import type { FiscalCreditRequestData } from '../../../supabase/functions/_shared/fiscalCreditRequest'
import { escapeFiscalXml } from '../../../supabase/functions/_shared/fiscalReconciliation'
export function syntheticFiscalCreditVoucherXml(r:FiscalCreditRequestData['solicitud'],options:{procesadoEn?:string;vencimiento?:string}={}):{xml:string;prefix:string;suffix:string;associated:string}{
 const procesadoEn=options.procesadoEn??r.fecha+'123456',vencimiento=options.vencimiento??new Date(Date.UTC(Number(r.fecha.slice(0,4)),Number(r.fecha.slice(4,6))-1,Number(r.fecha.slice(6,8))+10)).toISOString().slice(0,10).replace(/-/g,'')
 const tag=(name:string,value:string|number|null)=>'<'+name+'>'+escapeFiscalXml(value===null?'':String(value))+'</'+name+'>'
 const fields=[tag('Concepto',r.concepto),tag('DocTipo',r.tipoDocumento),tag('DocNro',r.numeroDocumento),tag('CbteDesde',r.numero),tag('CbteHasta',r.numero),tag('CbteFch',r.fecha),tag('ImpTotal',r.importes.total),tag('ImpTotConc',r.importes.noGravado),tag('ImpNeto',r.importes.neto),tag('ImpOpEx',r.importes.exento),tag('ImpTrib',r.importes.tributos),tag('ImpIVA',r.importes.iva),tag('FchServDesde',r.servicioDesde),tag('FchServHasta',r.servicioHasta),tag('FchVtoPago',r.vencimientoPago),tag('MonId',r.moneda),tag('MonCotiz','1.000000'),tag('CondicionIVAReceptorId',r.condicionIvaReceptor),tag('PtoVta',r.puntoVenta),tag('CbteTipo',r.tipoComprobante)].join('')
 const associated='<CbtesAsoc>'+r.comprobantesAsociados.map(a=>'<CbteAsoc>'+tag('Tipo',a.tipo)+tag('PtoVta',a.puntoVenta)+tag('Nro',a.numero)+tag('Cuit',a.cuit)+tag('CbteFch',a.fecha)+'</CbteAsoc>').join('')+'</CbtesAsoc>'
 const iva='<Iva>'+r.iva.map(a=>'<AlicIva>'+tag('Id',a.id)+tag('BaseImp',a.base)+tag('Importe',a.importe)+'</AlicIva>').join('')+'</Iva>'
 const tributes='<Tributos>'+r.tributos.map(a=>'<Tributo>'+tag('Id',a.id)+tag('Desc',a.descripcion)+tag('BaseImp',a.base)+tag('Alic',a.alicuota)+tag('Importe',a.importe)+'</Tributo>').join('')+'</Tributos>'
 const prefix='<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult>',suffix='</FECompConsultarResult></FECompConsultarResponse></s:Body></s:Envelope>'
 const xml=prefix+'<ResultGet>'+fields+associated+iva+tributes+'<Resultado>A</Resultado><EmisionTipo>CAE</EmisionTipo><CodAutorizacion>11111111111111</CodAutorizacion><FchVto>'+vencimiento+'</FchVto><FchProceso>'+procesadoEn+'</FchProceso></ResultGet>'+suffix
 return{xml,prefix,suffix,associated}
}
