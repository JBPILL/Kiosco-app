// @vitest-environment node
import { beforeAll, expect, it, vi } from 'vitest'
import { ContentInfo, SignedData } from 'pkijs'
import { createCreditSendWsaaTicketSource } from '../../supabase/functions/_shared/fiscalCreditWsaa'
import { createPrivateCreditSendFiscalCustody } from '../../supabase/functions/_shared/fiscalPrivateCustody'
import type { FiscalSecretReader } from '../../supabase/functions/_shared/fiscalPrivateCustody'
const createPrivateCreditFiscalCustody=(read:FiscalSecretReader)=>createPrivateCreditSendFiscalCustody(read,async()=>undefined)
import type { FiscalCreditSendBinding } from '../../supabase/functions/_shared/fiscalCreditSendSource'
import { syntheticEncryptedCustody } from './fixtures/fiscalEncryptedCustody'

let fixture: Awaited<ReturnType<typeof syntheticEncryptedCustody>>
beforeAll(async () => { fixture = await syntheticEncryptedCustody() })
function binding(): FiscalCreditSendBinding {
  const b = fixture.binding
  return { version: 1, entorno: 'HOMOLOGACION', servicio: 'wsfe', finalidad: 'ENVIO_NC', venta_id: crypto.randomUUID(),
    operacion_origen_id: b.operacion_id, solicitud_id: crypto.randomUUID(), propuesta_sha256: 'a'.repeat(64), preparacion_sha256: 'b'.repeat(64),solicitud_sha256:'c'.repeat(64),reserva_id:crypto.randomUUID(),revision_id:crypto.randomUUID(),permiso_id:crypto.randomUUID(),numero:23,
    kiosco_id: b.kiosco_id, usuario_id: b.usuario_id, actor_auth_id: crypto.randomUUID(), cuit_emisor: b.cuit_emisor, punto_venta: b.punto_venta,
    tipo_comprobante: 13, credencial_id: b.credencial_id, certificado_sha256: b.certificado_sha256, revision_emisor: b.revision,
    revision_parametros: 1, emision_habilitada: false }
}
it('NC descifra PKCS8 sintético, firma CMS y obtiene TA por transporte fijo después del permiso', async () => {
  const order: string[] = [], b = binding(), custody = createPrivateCreditFiscalCustody(name => fixture.secrets[name])
  const fetcher = vi.fn<typeof fetch>(async input => {
    order.push('transport'); const request = input as Request
    expect(request.url).toBe('https://wsaahomo.afip.gov.ar/ws/services/LoginCms'); expect(request.redirect).toBe('error')
    const cms = (await request.text()).match(/<in0>([^<]+)<\/in0>/)![1]
    const info = ContentInfo.fromBER(Uint8Array.from(atob(cms), c => c.charCodeAt(0))), signed = new SignedData({ schema: info.content })
    const tra = new TextDecoder().decode(signed.encapContentInfo.eContent!.getValue()), id = tra.match(/<uniqueId>(\d+)<\/uniqueId>/)![1]
    const now = Date.now(), ticket = `<loginTicketResponse version="1.0"><header><source>CN=wsaa,O=AFIP,C=AR,SERIALNUMBER=CUIT 33693450239</source><destination>SERIALNUMBER=CUIT 20123456786,CN=Kiosko Synthetic</destination><uniqueId>${id}</uniqueId><generationTime>${new Date(now - 30000).toISOString()}</generationTime><expirationTime>${new Date(now + 3600000).toISOString()}</expirationTime></header><credentials><token>SYNTHETIC_NC_TOKEN</token><sign>SYNTHETIC_NC_SIGN</sign></credentials></loginTicketResponse>`
    return new Response(`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><w:loginCmsResponse xmlns:w="http://wsaa.view.sua.dvadac.desein.afip.gov"><loginCmsReturn>${ticket.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</loginCmsReturn></w:loginCmsResponse></s:Body></s:Envelope>`, { headers: { 'Content-Type': 'text/xml' } })
  })
  const ticket = await createCreditSendWsaaTicketSource(async (value, signal) => {
    order.push('custody'); expect(value).not.toHaveProperty('operacion_id'); expect(value).not.toHaveProperty('revision')
    return custody(value, signal)
  }, fetcher)(b, new AbortController().signal, async () => { order.push('permission') })
  expect(order).toEqual(['custody', 'permission', 'transport']); expect(ticket.token).toBe('SYNTHETIC_NC_TOKEN')
  expect(JSON.stringify(ticket)).not.toContain('SYNTHETIC_NC'); expect(Object.isFrozen(ticket)).toBe(true)
})
it.each(['revision', 'huella', 'proyecto', 'extra'] as const)('custodia NC rechaza %s sin transportar ni revelar errores', async mode => {
  const b = binding(), secrets = { ...fixture.secrets }
  if (mode === 'revision') b.revision_emisor++
  if (mode === 'huella') b.certificado_sha256 = 'e'.repeat(64)
  if (mode === 'proyecto') secrets.SUPABASE_URL = 'https://lllkjnqpltnwvxzphncr.supabase.co'
  const input = mode === 'extra' ? { ...b, operacion_id: crypto.randomUUID() } : b
  const fetcher = vi.fn<typeof fetch>(), permission = vi.fn(async () => undefined)
  await expect(createCreditSendWsaaTicketSource(createPrivateCreditFiscalCustody(name => secrets[name]), fetcher)(input, new AbortController().signal, permission)).rejects.toThrow('FISCAL_WSAA_NC_NO_CONFIRMADO')
  expect(fetcher).not.toHaveBeenCalled(); expect(permission).not.toHaveBeenCalled()
})
it.each(['rechazado', 'abortado'] as const)('permiso NC %s después de firma impide transporte', async mode => {
  const controller = new AbortController(), fetcher = vi.fn<typeof fetch>()
  await expect(createCreditSendWsaaTicketSource(createPrivateCreditFiscalCustody(name => fixture.secrets[name]), fetcher)(binding(), controller.signal, async () => {
    if (mode === 'abortado') controller.abort(); else throw new Error('SYNTHETIC_LOST_ACK')
  })).rejects.toThrow('FISCAL_WSAA_NC_NO_CONFIRMADO')
  expect(fetcher).not.toHaveBeenCalled()
})
