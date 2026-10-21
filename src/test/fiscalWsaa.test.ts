// @vitest-environment node
import { afterEach, beforeAll, expect, it, vi } from 'vitest'
import { decodeWsaaTicket, loginFiscalWsaa, createWsaaTicketSource } from '../../supabase/functions/_shared/fiscalWsaa'
import { normalizeWsaaDn } from '../../supabase/functions/_shared/fiscalWsaaDn'
import { syntheticFiscalSigner } from './fixtures/fiscalSigner'
import type { FiscalWorkerBinding } from '../../supabase/functions/_shared/fiscalWorkerAuthorization'

const now=Date.now(),destination='SERIALNUMBER=CUIT 20123456786,CN=Kiosko Synthetic'
const expected={uniqueId:123,destination:normalizeWsaaDn(destination)}
const inner=(id=123)=>`<loginTicketResponse version="1.0"><header><source>CN=wsaa,O=AFIP,C=AR,SERIALNUMBER=CUIT 33693450239</source><destination>${destination}</destination><uniqueId>${id}</uniqueId><generationTime>${new Date(now-30000).toISOString()}</generationTime><expirationTime>${new Date(now+3600000).toISOString()}</expirationTime></header><credentials><token>SYNTHETIC_TOKEN</token><sign>SYNTHETIC_SIGN</sign></credentials></loginTicketResponse>`
const escape=(value:string)=>value.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
const soap=(value=inner())=>`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><w:loginCmsResponse xmlns:w="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${escape(value)}</loginCmsReturn></w:loginCmsResponse></s:Body></s:Envelope>`
const response=(value=soap(),status=200)=>new Response(value,{status,headers:{'Content-Type':'text/xml'}})
let signer:Awaited<ReturnType<typeof syntheticFiscalSigner>>
beforeAll(async()=>{signer=await syntheticFiscalSigner()})
afterEach(()=>vi.useRealTimers())
it('lee TA ligado a uniqueId, DN y fechas sin serializar credenciales',()=>{
  const ticket=decodeWsaaTicket(soap(),expected,now)
  expect(ticket.token).toBe('SYNTHETIC_TOKEN');expect(JSON.stringify(ticket)).not.toContain('SYNTHETIC')
})
it.each([
  ()=>soap(inner(124)),()=>soap(inner().replace('CUIT 20123456786','CUIT 30123456789')),
  ()=>soap(inner().replace('CN=wsaa','CN=otro')),()=>soap(inner().replace('SYNTHETIC_SIGN','')),
  ()=>soap(inner().replace('<sign>','<extra/><sign>')),
  ()=>soap(inner().replace('</credentials>','<token>duplicate</token></credentials>')),
  ()=>soap(inner().replace(new Date(now+3600000).toISOString(),'2026-02-30T12:00:00Z')),
  ()=>soap(inner().replace(new Date(now+3600000).toISOString(),new Date(now-1).toISOString())),
  ()=>soap(inner().replace(new Date(now-30000).toISOString(),new Date(now+120000).toISOString())),
  ()=>soap(inner().replace(new Date(now+3600000).toISOString(),new Date(now+13*3600000).toISOString())),
  ()=>soap(inner().replace('version="1.0"','version="2.0"')),
  ()=>soap().replace('</w:loginCmsResponse>','<loginCmsReturn>duplicate</loginCmsReturn></w:loginCmsResponse>'),
  ()=>soap().replace('http://wsaa.view.sua.dvadac.desein.afip.gov','https://unknown.invalid/'),
  ()=>soap('<!DOCTYPE a [<!ENTITY x SYSTEM "file:///SYNTHETIC_PRIVATE">]>'+inner()),
  ()=>'<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><s:Fault><faultstring>SYNTHETIC_PRIVATE</faultstring></s:Fault></s:Body></s:Envelope>',
])('rechaza respuesta incoherente o ambigua %#',make=>{
  expect(()=>decodeWsaaTicket(make(),expected,now)).toThrow('FISCAL_WSAA_NO_CONFIRMADO')
})
it('transporte fijo sin redirecciones, sin reintento y con SOAPAction vacío',async()=>{
  const fetcher=vi.fn<typeof fetch>(async request=>{
    const req=request as Request
    expect(req.url).toBe('https://wsaahomo.afip.gov.ar/ws/services/LoginCms')
    expect(req.redirect).toBe('error');expect(req.headers.get('SOAPAction')).toBe('""')
    expect(await req.text()).toContain('<in0>AQID</in0>')
    return response()
  })
  expect((await loginFiscalWsaa({...expected,cmsDer:new Uint8Array([1,2,3])},fetcher,new AbortController().signal)).token).toBe('SYNTHETIC_TOKEN')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it.each([403,500])('HTTP %s no produce ticket',async status=>{
  await expect(loginFiscalWsaa({...expected,cmsDer:new Uint8Array([1])},async()=>response('SYNTHETIC_PRIVATE',status),new AbortController().signal)).rejects.toThrow('FISCAL_WSAA_NO_CONFIRMADO')
})
it('el timeout cubre un cuerpo detenido y aborta el transporte',async()=>{
  vi.useFakeTimers()
  const fetcher=vi.fn<typeof fetch>(async()=>new Response(new ReadableStream({start(){}}),{headers:{'Content-Type':'text/xml'}}))
  const pending=loginFiscalWsaa({...expected,cmsDer:new Uint8Array([1])},fetcher,new AbortController().signal,100)
  const rejected=expect(pending).rejects.toThrow('FISCAL_WSAA_NO_CONFIRMADO')
  await vi.advanceTimersByTimeAsync(100);await rejected
  expect((fetcher.mock.calls[0][0] as Request).signal.aborted).toBe(true)
})
it('el timeout también termina un fetch que no responde',async()=>{
  vi.useFakeTimers()
  const fetcher=vi.fn<typeof fetch>(()=>new Promise(()=>{}))
  const pending=loginFiscalWsaa({...expected,cmsDer:new Uint8Array([1])},fetcher,new AbortController().signal,100)
  const rejected=expect(pending).rejects.toThrow('FISCAL_WSAA_NO_CONFIRMADO')
  await vi.advanceTimersByTimeAsync(100);await rejected
  expect((fetcher.mock.calls[0][0] as Request).signal.aborted).toBe(true)
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it.each(['tipo','redirect','utf8'])('rechaza respuesta HTTP incoherente %s',async mode=>{
  const fetcher:typeof fetch=async()=>{
    if(mode==='tipo')return new Response(soap(),{headers:{'Content-Type':'text/plain'}})
    if(mode==='utf8')return new Response(new Uint8Array([0xff,0xfe]),{headers:{'Content-Type':'text/xml'}})
    const res=response();Object.defineProperty(res,'redirected',{value:true});return res
  }
  await expect(loginFiscalWsaa({...expected,cmsDer:new Uint8Array([1])},fetcher,new AbortController().signal)).rejects.toThrow('FISCAL_WSAA_NO_CONFIRMADO')
})
it('aborta antes de hacer red y rechaza cuerpo excesivo',async()=>{
  const parent=new AbortController();parent.abort();const fetcher=vi.fn<typeof fetch>()
  await expect(loginFiscalWsaa({...expected,cmsDer:new Uint8Array([1])},fetcher,parent.signal)).rejects.toThrow('FISCAL_WSAA_NO_CONFIRMADO')
  expect(fetcher).not.toHaveBeenCalled()
  await expect(loginFiscalWsaa({...expected,cmsDer:new Uint8Array([1])},async()=>response('x'.repeat(1048577)),new AbortController().signal)).rejects.toThrow('FISCAL_WSAA_NO_CONFIRMADO')
})
it('integra custodia sintética, firma CMS y respuesta ligada al identificador real del TRA',async()=>{
  const binding:FiscalWorkerBinding={version:1,entorno:'HOMOLOGACION',servicio:'wsfe',operacion_id:crypto.randomUUID(),kiosco_id:crypto.randomUUID(),usuario_id:crypto.randomUUID(),
    cuit_emisor:'20123456786',punto_venta:2,credencial_id:signer.material.credentialId,certificado_sha256:signer.fingerprint,revision:1}
  const fetcher=vi.fn<typeof fetch>(async request=>{
    const payload=await (request as Request).text(),cms=payload.match(/<in0>([^<]+)<\/in0>/)![1]
    // Decode the signed TRA from actual CMS, not a preconfigured identifier.
    const { ContentInfo,SignedData }=await import('pkijs')
    const info=ContentInfo.fromBER(Uint8Array.from(atob(cms),c=>c.charCodeAt(0)))
    const signed=new SignedData({schema:info.content}),tra=new TextDecoder().decode(signed.encapContentInfo.eContent!.getValue())
    const id=Number(tra.match(/<uniqueId>(\d+)<\/uniqueId>/)![1])
    return response(soap(inner(id)))
  })
  const source=createWsaaTicketSource(async()=>signer.material,fetcher)
  const ticket=await source(binding,new AbortController().signal)
  expect(ticket.token).toBe('SYNTHETIC_TOKEN');expect(JSON.stringify(ticket)).not.toContain('SYNTHETIC')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('un fallo de custodia no llega a red ni revela el mensaje de origen',async()=>{
  const fetcher=vi.fn<typeof fetch>(),source=createWsaaTicketSource(async()=>{throw new Error('SYNTHETIC_PRIVATE_CUSTODY')},fetcher)
  const binding:FiscalWorkerBinding={version:1,entorno:'HOMOLOGACION',servicio:'wsfe',operacion_id:crypto.randomUUID(),kiosco_id:crypto.randomUUID(),usuario_id:crypto.randomUUID(),
    cuit_emisor:'20123456786',punto_venta:2,credencial_id:signer.material.credentialId,certificado_sha256:signer.fingerprint,revision:1}
  await expect(source(binding,new AbortController().signal)).rejects.toThrow('FISCAL_WSAA_NO_CONFIRMADO')
  expect(fetcher).not.toHaveBeenCalled()
})
