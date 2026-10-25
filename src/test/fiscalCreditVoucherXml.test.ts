// @vitest-environment node
import { expect, it } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { prepareFiscalCreditRequest } from '../../supabase/functions/_shared/fiscalCreditRequest'
import type { FiscalCreditReservation } from '../../supabase/functions/_shared/fiscalCreditRequest'
import { reconcileFiscalCreditVoucherXml, decodeFiscalCreditVoucherXml } from '../../supabase/functions/_shared/fiscalCreditVoucherXml'
import { escapeFiscalXml } from '../../supabase/functions/_shared/fiscalReconciliation'
async function fixture(invoice: 1 | 6 | 11 = 11, concept: 1 | 2 | 3 = 1) {
  const f = await fiscalCreditContextFixture(invoice, concept), context = await validateFiscalCreditContext(f.context, f.source, f.proposal)
  const entry = concept === 1 ? { servicioDesde: null, servicioHasta: null, vencimientoPago: null }
    : { servicioDesde: '20261002', servicioHasta: '20261019', vencimientoPago: '20261027' }
  const prepared = await prepareFiscalCreditPreparation(f.source, f.proposal, context, entry)
  const wire = { version: 1, estado: 'DATOS_NC_PREPARADOS', contexto: context, preparacion: { canonico: prepared.canonico, sha256: prepared.sha256 },
    emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false }
  const reservation: FiscalCreditReservation = { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, preparacion_sha256: prepared.sha256, reserva_id: crypto.randomUUID(),
    cuit_emisor: context.cuit_emisor, punto_venta: context.punto_venta, tipo_comprobante: context.tipo_nota_credito, numero: 23, estado: 'RESERVADA', emision_habilitada: false }
  return { ...f, entry, prepared, wire, reservation }
}
async function recordFixture(invoice:1|6|11=11,concept:1|2|3=1) {
  const f = await fixture(invoice,concept), request = await prepareFiscalCreditRequest(f.source, f.proposal, f.wire, f.reservation)
  const packet = { preparacion: { version: 1, entorno: 'HOMOLOGACION', venta_id: f.sale, operacion_origen_id: f.operation,
    solicitud_id: f.input.solicitud_id, propuesta_sha256: f.proposal.sha256, estado: f.wire.estado, preparacion: f.wire.preparacion, contexto: f.wire.contexto,
    propuesta: { canonico: f.proposal.canonico, sha256: f.proposal.sha256 }, emision_habilitada: false, reintegro_habilitado: false, reposicion_habilitada: false },
    reserva: f.reservation, cuerpo: { canonico: request.canonico, sha256: request.sha256 } }
  return { ...f, packet, request }
}

async function voucherFixture(invoice:1|6|11=11,concept:1|2|3=1){
 const f=await recordFixture(invoice,concept),r=f.request.datos.solicitud
 const tag=(name:string,value:string|number|null)=>'<'+name+'>'+escapeFiscalXml(value===null?'':String(value))+'</'+name+'>'
 const fields=[tag('Concepto',r.concepto),tag('DocTipo',r.tipoDocumento),tag('DocNro',r.numeroDocumento),tag('CbteDesde',r.numero),tag('CbteHasta',r.numero),tag('CbteFch',r.fecha),tag('ImpTotal',r.importes.total),tag('ImpTotConc',r.importes.noGravado),tag('ImpNeto',r.importes.neto),tag('ImpOpEx',r.importes.exento),tag('ImpTrib',r.importes.tributos),tag('ImpIVA',r.importes.iva),tag('FchServDesde',r.servicioDesde),tag('FchServHasta',r.servicioHasta),tag('FchVtoPago',r.vencimientoPago),tag('MonId',r.moneda),tag('MonCotiz','1.000000'),tag('CondicionIVAReceptorId',r.condicionIvaReceptor),tag('PtoVta',r.puntoVenta),tag('CbteTipo',r.tipoComprobante)].join('')
 const associated='<CbtesAsoc>'+r.comprobantesAsociados.map(a=>'<CbteAsoc>'+tag('Tipo',a.tipo)+tag('PtoVta',a.puntoVenta)+tag('Nro',a.numero)+tag('Cuit',a.cuit)+tag('CbteFch',a.fecha)+'</CbteAsoc>').join('')+'</CbtesAsoc>'
 const iva='<Iva>'+r.iva.map(a=>'<AlicIva>'+tag('Id',a.id)+tag('BaseImp',a.base)+tag('Importe',a.importe)+'</AlicIva>').join('')+'</Iva>'
 const tributes='<Tributos>'+r.tributos.map(a=>'<Tributo>'+tag('Id',a.id)+tag('Desc',a.descripcion)+tag('BaseImp',a.base)+tag('Alic',a.alicuota)+tag('Importe',a.importe)+'</Tributo>').join('')+'</Tributos>'
 const prefix='<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompConsultarResponse xmlns="http://ar.gov.afip.dif.FEV1/"><FECompConsultarResult>',suffix='</FECompConsultarResult></FECompConsultarResponse></s:Body></s:Envelope>'
 const xml=prefix+'<ResultGet>'+fields+associated+iva+tributes+'<Resultado>A</Resultado><EmisionTipo>CAE</EmisionTipo><CodAutorizacion>11111111111111</CodAutorizacion><FchVto>20261130</FchVto><FchProceso>20261025123456</FchProceso></ResultGet>'+suffix
 const decide=(value=xml)=>reconcileFiscalCreditVoucherXml(value,f.packet,f.source,f.proposal)
 return{...f,xml,decide,prefix,suffix,associated,identity:{entorno:'HOMOLOGACION' as const,cuitEmisor:r.cuitEmisor,puntoVenta:r.puntoVenta,tipoComprobante:r.tipoComprobante,numero:r.numero}}
}
it.each([1,6,11] as const)('NC asociada a factura%s compara contrato completo y conserva hash',async invoice=>{
 const f=await voucherFixture(invoice),result=await f.decide();expect(result).toMatchObject({estado:'AUTORIZACION_NC_COINCIDENTE',solicitudSha256:f.request.sha256,puedeReenviar:false})
})
it.each([2,3] as const)('concepto%s valida períodos explícitos',async concept=>{
 const f=await voucherFixture(11,concept);expect((await f.decide()).estado).toBe('AUTORIZACION_NC_COINCIDENTE')
 expect((await f.decide(f.xml.replace(/<FchServDesde>[^<]*<\/FchServDesde>/,'<FchServDesde>20260101</FchServDesde>'))).estado).toBe('CONCILIAR')
})
it.each(['PtoVta','CbteTipo','CbteDesde','CbteFch','DocTipo','DocNro','CondicionIVAReceptorId','ImpTotal','ImpNeto','ImpIVA','MonId','MonCotiz'])('dato fiscal distinto %s no acredita CAE coincidente',async name=>{
 const f=await voucherFixture(),xml=f.xml.replace(new RegExp('<'+name+'>[^<]*</'+name+'>'),'<'+name+'>999</'+name+'>')
 expect(await f.decide(xml)).toMatchObject({estado:'CONCILIAR',puedeReenviar:false})
})
it.each(['Tipo','PtoVta','Nro','Cuit','CbteFch'])('asociación diferente %s rechazada',async name=>{
 const f=await voucherFixture(),associated=f.associated.replace(new RegExp('<'+name+'>[^<]*</'+name+'>'),'<'+name+'>999</'+name+'>')
 expect((await f.decide(f.xml.replace(f.associated,associated))).estado).toBe('CONCILIAR')
})
it.each(['Cuit','CbteFch'])('dato no devuelto %s no se completa con solicitud',async name=>{
 const f=await voucherFixture(),associated=f.associated.replace(new RegExp('<'+name+'>[^<]*</'+name+'>'),'')
 expect(await f.decide(f.xml.replace(f.associated,associated))).toMatchObject({estado:'CONCILIAR',codigo:'ASOCIACION_INCOMPLETA'})
})
it.each(['DTD','duplicado','namespace','extra','cae','vencimiento','proceso','sin-asociacion','errors','no-encontrado'])('respuesta %s no autoriza ni permite reenviar',async mode=>{
 const f=await voucherFixture();let xml=f.xml
 if(mode==='DTD')xml='<!DOCTYPE a [<!ENTITY x "SYNTHETIC">]>'+xml
 if(mode==='duplicado')xml=xml.replace('<ImpTotal>','<ImpTotal>1</ImpTotal><ImpTotal>')
 if(mode==='namespace')xml=xml.replace('http://ar.gov.afip.dif.FEV1/','https://evil.invalid/')
 if(mode==='extra')xml=xml.replace('</ResultGet>','<Opcionales/></ResultGet>')
 if(mode==='cae')xml=xml.replace('11111111111111','00000000000000')
 if(mode==='vencimiento')xml=xml.replace('20261130','20260230')
 if(mode==='proceso')xml=xml.replace('20261025123456','20261025259999')
 if(mode==='sin-asociacion')xml=xml.replace(f.associated,'')
 if(mode==='errors')xml=xml.replace('</ResultGet>','</ResultGet><Errors><Err><Code>602</Code><Msg>SYNTHETIC</Msg></Err></Errors>')
 if(mode==='no-encontrado')xml=f.prefix+'<Errors><Err><Code>602</Code><Msg>SYNTHETIC</Msg></Err></Errors>'+f.suffix
 expect(await f.decide(xml)).toMatchObject({estado:'CONCILIAR',puedeReenviar:false})
})
it('canónico alterado no obtiene autorización aunque XML coincida',async()=>{
 const f=await voucherFixture();f.packet.cuerpo.canonico+=' ';expect((await f.decide()).estado).toBe('CONCILIAR')
})
it('identidad de factura no se acepta como consulta NC',async()=>{
 const f=await voucherFixture();expect(()=>Reflect.apply(decodeFiscalCreditVoucherXml,undefined,[f.xml,{...f.identity,tipoComprobante:11}])).toThrow()
})

it.each(['ausente','anterior','posterior'] as const)('fecha de procesamiento %s permanece sin confirmar',async mode=>{
 const f=await voucherFixture(),replacement=mode==='ausente'?'':mode==='anterior'?'<FchProceso>20200101123456</FchProceso>':'<FchProceso>20300101123456</FchProceso>'
 expect((await f.decide(f.xml.replace(/<FchProceso>[^<]*<\/FchProceso>/,replacement))).estado).toBe('CONCILIAR')
})
it('asociación duplicada no pasa por coincidencia parcial',async()=>{
 const f=await voucherFixture(1)
 const xml=f.xml.replace('</CbtesAsoc>',f.associated.replace(/<\/?CbtesAsoc>/g,'')+'</CbtesAsoc>')
 expect((await f.decide(xml)).estado).toBe('CONCILIAR')
})

it('fecha de proceso sin hora conserva precisión observada del ejemplo oficial',async()=>{
 const f=await voucherFixture();expect(await f.decide(f.xml.replace('20261025123456','20261025'))).toMatchObject({estado:'AUTORIZACION_NC_COINCIDENTE',procesadoEn:'20261025'})
})
it.each(['iva-duplicado','iva-importe','tributo-base','tributo-descripcion'])('detalle fiscal %s no acredita coincidencia',async mode=>{
 const f=await voucherFixture(1);let xml=f.xml
 expect(xml).toContain('<AlicIva>');expect(xml).toContain('<Tributo>')
 if(mode==='iva-duplicado')xml=xml.replace(/(<AlicIva>.*?<\/AlicIva>)/,'$1$1')
 if(mode==='iva-importe')xml=xml.replace(/(<AlicIva>.*?<Importe>)[^<]*/,'$1999')
 if(mode==='tributo-base')xml=xml.replace(/(<Tributo>.*?<BaseImp>)[^<]*/,'$1999')
 if(mode==='tributo-descripcion')xml=xml.replace(/(<Tributo>.*?<Desc>)[^<]*/,'$1OTRO')
 expect((await f.decide(xml)).estado).toBe('CONCILIAR')
})
