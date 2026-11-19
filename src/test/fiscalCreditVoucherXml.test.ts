import { consultFiscalCreditVoucher } from '../../supabase/functions/_shared/fiscalCreditVoucherQuery'
import { postPrivateFiscalWsfe, postPrivateFiscalCreditQuery } from '../../supabase/functions/_shared/fiscalWsfeEmission'
// @vitest-environment node
import { expect, it, vi } from 'vitest'
import { fiscalCreditContextFixture } from './fixtures/fiscalCreditContext'
import { validateFiscalCreditContext } from '../../supabase/functions/_shared/fiscalCreditContext'
import { prepareFiscalCreditPreparation } from '../../supabase/functions/_shared/fiscalCreditPreparation'
import { prepareFiscalCreditRequest } from '../../supabase/functions/_shared/fiscalCreditRequest'
import type { FiscalCreditReservation } from '../../supabase/functions/_shared/fiscalCreditRequest'
import { reconcileFiscalCreditVoucherXml, decodeFiscalCreditVoucherXml } from '../../supabase/functions/_shared/fiscalCreditVoucherXml'
import { syntheticFiscalCreditVoucherXml } from './fixtures/fiscalCreditVoucherXml'
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
 const {xml,prefix,suffix,associated}=syntheticFiscalCreditVoucherXml(r,{procesadoEn:'20261025123456',vencimiento:'20261130'})
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

async function queryFixture(){
 const f=await voucherFixture(),binding={version:1,entorno:'HOMOLOGACION',servicio:'wsfe',finalidad:'CONSULTA_NC',venta_id:f.sale,operacion_origen_id:f.operation,solicitud_id:f.input.solicitud_id,propuesta_sha256:f.proposal.sha256,preparacion_sha256:f.prepared.sha256,solicitud_sha256:f.request.sha256,reserva_id:f.reservation.reserva_id,revision_id:crypto.randomUUID(),permiso_id:crypto.randomUUID(),intento_id:crypto.randomUUID(),kiosco_id:f.scope.kioskId,usuario_id:crypto.randomUUID(),actor_auth_id:f.actor,cuit_emisor:f.context.cuit_emisor,punto_venta:f.context.punto_venta,tipo_comprobante:f.context.tipo_nota_credito,numero:23,credencial_id:crypto.randomUUID(),certificado_sha256:'e'.repeat(64),revision_emisor:1,revision_parametros:1,emision_habilitada:false}
 const intent={version:1,estado:'ENVIO_INCIERTO',solicitud_id:binding.solicitud_id,operacion_origen_id:f.operation,intento_id:binding.intento_id,permiso_id:binding.permiso_id,revision_id:binding.revision_id,reserva_id:binding.reserva_id,propuesta_sha256:binding.propuesta_sha256,preparacion_sha256:binding.preparacion_sha256,solicitud_sha256:binding.solicitud_sha256,actor_auth_id:f.actor,nuevo_envio:false,emision_habilitada:false}
 const input={packet:{cuerpo:f.packet,intencion:intent,binding},source:f.source,draft:f.proposal,actorAuthId:f.actor},ticket={entorno:'HOMOLOGACION' as const,servicio:'wsfe' as const,cuitEmisor:binding.cuit_emisor,credencialId:binding.credencial_id,certificadoSha256:binding.certificado_sha256,token:'SYNTHETIC_TOKEN&',sign:'SYNTHETIC_SIGN<',expiresAt:Date.now()+120000}
 const controller=new AbortController(),guard=vi.fn<()=>Promise<void>>(async()=>undefined),fetcher=vi.fn<typeof fetch>(async()=>new Response(f.xml,{headers:{'content-type':'text/xml; charset=utf-8'}}))
 const deps={fetcher,beforeSend:guard,signal:controller.signal,timeoutMs:1000}
 return{...f,input,ticket,controller,guard,fetcher,deps,run:()=>consultFiscalCreditVoucher(input,ticket,deps)}
}
it('consulta NC usa destino fijo/guard obligatorio/TA escapado y devuelve clasificación ligada al intento',async()=>{
 const f=await queryFixture();f.fetcher.mockImplementation(async input=>{
 expect(f.guard).toHaveBeenCalledTimes(1);const r=input as Request,xml=await r.text()
 expect(r.url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx');expect(r.redirect).toBe('error');expect(r.headers.get('SOAPAction')).toBe('"http://ar.gov.afip.dif.FEV1/FECompConsultar"')
 expect(xml).toContain('<Token>SYNTHETIC_TOKEN&amp;</Token>');expect(xml).toContain('<Sign>SYNTHETIC_SIGN&lt;</Sign>');expect(xml).toContain('<CbteTipo>13</CbteTipo><CbteNro>23</CbteNro><PtoVta>7</PtoVta>')
 return new Response(f.xml,{headers:{'content-type':'text/xml'}})})
 const result=await f.run();expect(result).toMatchObject({intento_id:f.input.packet.binding.intento_id,solicitud_sha256:f.request.sha256,resultado:{estado:'AUTORIZACION_NC_COINCIDENTE',puedeReenviar:false},emision_habilitada:false})
 expect(f.guard).toHaveBeenCalledTimes(2);expect(f.fetcher).toHaveBeenCalledTimes(1);expect(JSON.stringify(result)).not.toContain('SYNTHETIC_TOKEN');expect(Object.isFrozen(result.resultado)).toBe(true)
})
it.each(['emisor','credencial','certificado','entorno','vencido'] as const)('TA incorrecto %s no transmite',async reason=>{
 const f=await queryFixture();if(reason==='emisor')f.ticket.cuitEmisor='20415005963';if(reason==='credencial')f.ticket.credencialId=crypto.randomUUID();if(reason==='certificado')f.ticket.certificadoSha256='f'.repeat(64);if(reason==='entorno')Object.assign(f.ticket,{entorno:'PRODUCCION'});if(reason==='vencido')f.ticket.expiresAt=Date.now()+1000
 await expect(f.run()).rejects.toThrow('FISCAL_CONSULTA_NC_NO_CONFIRMADA');expect(f.fetcher).not.toHaveBeenCalled()
})
it('guard rechazado o faltante no envía',async()=>{
 const f=await queryFixture();f.guard.mockRejectedValue(new Error('SYNTHETIC_PRIVATE'));await expect(f.run()).rejects.toThrow('FISCAL_CONSULTA_NC_NO_CONFIRMADA');expect(f.fetcher).not.toHaveBeenCalled()
 const missing={...f.deps,beforeSend:undefined};await expect(Reflect.apply(consultFiscalCreditVoucher,undefined,[f.input,f.ticket,missing])).rejects.toThrow('FISCAL_CONSULTA_NC_NO_CONFIRMADA')
})
it.each(['status','content-type','redirect','oversize','utf8'] as const)('respuesta de transporte %s rechazada sin retry',async reason=>{
 const f=await queryFixture();f.fetcher.mockImplementation(async()=>{
 const data=reason==='oversize'?'x'.repeat(1048577):reason==='utf8'?new Uint8Array([255,255]):f.xml
 const response=new Response(data,{status:reason==='status'?503:200,headers:{'content-type':reason==='content-type'?'text/html':'text/xml'}})
 if(reason==='redirect')Object.defineProperty(response,'redirected',{value:true});return response})
 await expect(f.run()).rejects.toThrow('FISCAL_CONSULTA_NC_NO_CONFIRMADA');expect(f.fetcher).toHaveBeenCalledTimes(1)
})
it('revocación después de respuesta no entrega clasificación',async()=>{
 const f=await queryFixture();f.guard.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('SYNTHETIC_REVOKED'))
 await expect(f.run()).rejects.toThrow('FISCAL_CONSULTA_NC_NO_CONFIRMADA');expect(f.fetcher).toHaveBeenCalledTimes(1)
})
it('cancelación del trabajador detiene espera de red',async()=>{
 const f=await queryFixture();f.fetcher.mockImplementation(async()=>{f.controller.abort();return new Promise<Response>(()=>undefined)})
 await expect(f.run()).rejects.toThrow('FISCAL_CONSULTA_NC_NO_CONFIRMADA');expect(f.fetcher).toHaveBeenCalledTimes(1)
})
it('deadline incluye el segundo guard después de recibir XML',async()=>{
 const f=await queryFixture();f.deps.timeoutMs=200;f.guard.mockResolvedValueOnce(undefined).mockImplementationOnce(()=>new Promise<void>(()=>undefined))
 await expect(f.run()).rejects.toThrow('FISCAL_CONSULTA_NC_NO_CONFIRMADA');expect(f.fetcher).toHaveBeenCalledTimes(1)
})
it('adaptadores de envío y consulta no aceptan la acción del otro',async()=>{
 const f=await queryFixture(),request=(action:string)=>new Request('https://wswhomo.afip.gov.ar/wsfev1/service.asmx',{method:'POST',redirect:'error',headers:{SOAPAction:'"http://ar.gov.afip.dif.FEV1/'+action+'"'},body:'SYNTHETIC'})
 await expect(postPrivateFiscalWsfe(request('FECompConsultar'),f.fetcher,1000,f.ticket.expiresAt,f.guard)).rejects.toThrow()
 await expect(postPrivateFiscalCreditQuery(request('FECAESolicitar'),f.fetcher,1000,f.ticket.expiresAt,f.guard,f.controller.signal)).rejects.toThrow();expect(f.fetcher).not.toHaveBeenCalled()
})
