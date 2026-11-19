import { postPrivateFiscalCreditEmission } from '../../supabase/functions/_shared/fiscalWsfeEmission'
import { syntheticFiscalCreditEmissionReceipt } from './fixtures/fiscalCreditEmission'
// @vitest-environment node
import { expect,it,vi } from 'vitest'
import { fiscalCreditSendFixture } from './fixtures/fiscalCreditSend'
import { wsfeSoap } from './fixtures/fiscalWsfe'
import { buildFiscalCreditEmissionRequest,sendFiscalCreditEmission } from '../../supabase/functions/_shared/fiscalCreditEmission'
async function fixture(invoice:1|6|11=11,concept:1|2|3=1){
 const f=await fiscalCreditSendFixture(invoice,concept),b=f.packet.binding,s=f.request.datos.solicitud
 const input={packet:f.packet,source:f.source,draft:f.proposal,actorAuthId:f.actor}
 const ticket={entorno:'HOMOLOGACION' as const,servicio:'wsfe' as const,cuitEmisor:b.cuit_emisor,credencialId:b.credencial_id,certificadoSha256:b.certificado_sha256,token:'SYNTHETIC_TOKEN&',sign:'SYNTHETIC_SIGN<',expiresAt:Date.now()+120000}
 const intent={version:1,estado:'ENVIO_INCIERTO',solicitud_id:b.solicitud_id,operacion_origen_id:b.operacion_origen_id,intento_id:crypto.randomUUID(),permiso_id:b.permiso_id,revision_id:b.revision_id,reserva_id:b.reserva_id,propuesta_sha256:b.propuesta_sha256,preparacion_sha256:b.preparacion_sha256,solicitud_sha256:b.solicitud_sha256,actor_auth_id:b.actor_auth_id,nuevo_envio:true,emision_habilitada:false}
 const reply=(state='A')=>syntheticFiscalCreditEmissionReceipt(s,state)
 const controller=new AbortController(),consumeIntent=vi.fn(async()=>intent),fetcher=vi.fn<typeof fetch>(async()=>new Response(reply(),{headers:{'content-type':'text/xml'}}))
 const run=()=>sendFiscalCreditEmission(input,ticket,{signal:controller.signal,consumeIntent,fetcher})
 return{...f,input,ticket,intent,reply,controller,consumeIntent,fetcher,run}
}
it.each([1,6,11] as const)('NC de factura%s serializa asociación completa y pesos sin CanMisMonExt',async invoice=>{
 const f=await fixture(invoice),s=f.request.datos.solicitud,a=s.comprobantesAsociados[0],req=await buildFiscalCreditEmissionRequest(f.input,f.ticket),xml=await req.text()
 expect(req.url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx');expect(req.redirect).toBe('error');expect(req.headers.get('SOAPAction')).toBe('"http://ar.gov.afip.dif.FEV1/FECAESolicitar"')
 expect(xml).toContain(`<CbteTipo>${s.tipoComprobante}</CbteTipo>`);expect(xml).toContain(`<CbteDesde>${s.numero}</CbteDesde><CbteHasta>${s.numero}</CbteHasta>`)
 expect(xml).toContain(`<CbtesAsoc><CbteAsoc><Tipo>${a.tipo}</Tipo><PtoVta>${a.puntoVenta}</PtoVta><Nro>${a.numero}</Nro><Cuit>${a.cuit}</Cuit><CbteFch>${a.fecha}</CbteFch></CbteAsoc></CbtesAsoc>`)
 expect(xml).toContain('<Token>SYNTHETIC_TOKEN&amp;</Token>');expect(xml).toContain('<Sign>SYNTHETIC_SIGN&lt;</Sign>');expect(xml).toContain(`<ImpTotal>${s.importes.total}</ImpTotal>`);expect(xml).not.toContain('CanMisMonExt');expect(xml.includes('<Iva>')).toBe(s.iva.length>0)
 expect(f.consumeIntent).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
})
it.each([2,3] as const)('NC concepto%s conserva períodos explícitos',async concept=>{
 const f=await fixture(11,concept),xml=await(await buildFiscalCreditEmissionRequest(f.input,f.ticket)).text()
 expect(xml).toContain('<FchServDesde>20261002</FchServDesde><FchServHasta>20261019</FchServHasta><FchVtoPago>20261027</FchVtoPago>')
})
it('ACK042 original precede un único fetch, aprobación candidata no incluye CAE ni habilita reenvío',async()=>{
 const f=await fixture(),events:string[]=[]
 f.consumeIntent.mockImplementation(async()=>{events.push('042');return f.intent})
 f.fetcher.mockImplementation(async()=>{events.push('fetch');return new Response(f.reply(),{headers:{'content-type':'text/xml'}})})
 const result=await f.run();expect(events).toEqual(['042','fetch']);expect(result).toEqual({estado:'APROBACION_RECIBIDA',codigos:[],puedeReenviar:false});expect(Object.isFrozen(result)).toBe(true);expect(Object.isFrozen(result.codigos)).toBe(true)
})
it.each(['replay','actor','hash','permiso','revision','extra','ack-perdido'])('ACK042 %s no permite red ni retry',async mode=>{
 const f=await fixture()
 f.consumeIntent.mockImplementation(async()=>{if(mode==='ack-perdido')throw new Error('SYNTHETIC_PRIVATE_ACK_LOST');return {...f.intent,...(mode==='replay'?{nuevo_envio:false}:mode==='actor'?{actor_auth_id:crypto.randomUUID()}:mode==='hash'?{solicitud_sha256:'f'.repeat(64)}:mode==='permiso'?{permiso_id:crypto.randomUUID()}:mode==='revision'?{revision_id:crypto.randomUUID()}:{extra:true})}})
 await expect(f.run()).rejects.toThrow('FISCAL_ENVIO_NC_NO_CONFIRMADO');expect(f.consumeIntent).toHaveBeenCalledTimes(1);expect(f.fetcher).not.toHaveBeenCalled()
})
it.each(['entorno','credencial','certificado','cuerpo','abortado','vencido'])('entrada %s falla antes de consumir intención',async mode=>{
 const f=await fixture();if(mode==='entorno')f.input.packet.binding.entorno='PRODUCCION'
 if(mode==='credencial')f.ticket.credencialId=crypto.randomUUID();if(mode==='certificado')f.ticket.certificadoSha256='f'.repeat(64)
 if(mode==='cuerpo')f.input.packet.cuerpo.cuerpo.sha256='f'.repeat(64);if(mode==='abortado')f.controller.abort();if(mode==='vencido')f.ticket.expiresAt=Date.now()
 await expect(f.run()).rejects.toThrow();expect(f.consumeIntent).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
})
it.each(['R','P'])('respuesta%s candidata nunca concede reenvío',async state=>{
 const f=await fixture();f.fetcher.mockResolvedValue(new Response(f.reply(state),{headers:{'content-type':'text/xml'}}))
 expect(await f.run()).toMatchObject({estado:state==='R'?'RECHAZO_RECIBIDO':'SIN_CONFIRMACION',puedeReenviar:false});expect(f.fetcher).toHaveBeenCalledTimes(1)
})
it.each(['serie','tipo','numero','fecha','cae','namespace','doctype','duplicate','http','soap'])('respuesta inválida %s permanece incierta sin retry',async mode=>{
 const f=await fixture(),s=f.request.datos.solicitud;let xml=f.reply()
 if(mode==='serie')xml=xml.replace(`<PtoVta>${s.puntoVenta}</PtoVta>`,'<PtoVta>999</PtoVta>')
 if(mode==='tipo')xml=xml.replace(`<CbteTipo>${s.tipoComprobante}</CbteTipo>`,'<CbteTipo>11</CbteTipo>')
 if(mode==='numero')xml=xml.replace(`<CbteDesde>${s.numero}</CbteDesde>`,'<CbteDesde>999</CbteDesde>')
 if(mode==='fecha')xml=xml.replace(s.fecha+'120000','20260231120000')
 if(mode==='cae')xml=xml.replace('11111111111111','00000000000000')
 if(mode==='namespace')xml=xml.replace('http://ar.gov.afip.dif.FEV1/','https://example.invalid/')
 if(mode==='doctype')xml='<!DOCTYPE x [<!ENTITY x SYSTEM "file:///SYNTHETIC_PRIVATE">]>'+xml
 if(mode==='duplicate')xml=xml.replace('</CAE>','</CAE><CAE>22222222222222</CAE>')
 if(mode==='soap')xml=wsfeSoap('FECAESolicitar','<Fault/>')
 f.fetcher.mockResolvedValue(new Response(xml,{status:mode==='http'?500:200,headers:{'content-type':'text/xml'}}))
 await expect(f.run()).rejects.toThrow('FISCAL_ENVIO_NC_NO_CONFIRMADO');expect(f.fetcher).toHaveBeenCalledTimes(1)
})
it('deadline cubre ACK042 sin respuesta y no envía',async()=>{
 const f=await fixture();vi.useFakeTimers()
 try{f.consumeIntent.mockImplementation(()=>new Promise(()=>{}));const pending=f.run().catch((e:unknown)=>e instanceof Error?e.message:'UNKNOWN');await vi.advanceTimersByTimeAsync(15000);expect(await pending).toBe('FISCAL_ENVIO_NC_NO_CONFIRMADO');expect(f.fetcher).not.toHaveBeenCalled()}finally{vi.useRealTimers()}
})

it.each(['FECompConsultar','FECompUltimoAutorizado'])('transporte ENVIO_NC no admite acción%s',async action=>{
 const f=await fixture(),base=await buildFiscalCreditEmissionRequest(f.input,f.ticket),headers=new Headers(base.headers);headers.set('SOAPAction','"http://ar.gov.afip.dif.FEV1/'+action+'"')
 const guard=vi.fn(async()=>{}),req=new Request(base,{headers})
 await expect(postPrivateFiscalCreditEmission(req,f.fetcher,15000,f.ticket.expiresAt,guard,f.controller.signal)).rejects.toThrow();expect(guard).not.toHaveBeenCalled();expect(f.fetcher).not.toHaveBeenCalled()
})
it('mutación posterior del input no cambia XML ni respuesta esperada tras consumir042',async()=>{
 const f=await fixture();f.consumeIntent.mockImplementation(async()=>{f.input.packet.binding.numero=99;f.input.packet.cuerpo.cuerpo.sha256='f'.repeat(64);return f.intent})
 f.fetcher.mockImplementation(async req=>{expect(await new Request(req).text()).toContain('<CbteDesde>23</CbteDesde>');return new Response(f.reply(),{headers:{'content-type':'text/xml'}})})
 expect(await f.run()).toMatchObject({estado:'APROBACION_RECIBIDA',puedeReenviar:false});expect(f.fetcher).toHaveBeenCalledTimes(1)
})
