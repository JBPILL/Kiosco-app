// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest'
import { consultLastFiscalCreditNumber, decodeLastFiscalCreditNumber } from '../../supabase/functions/_shared/fiscalCreditNumberXml'
import { decodeLastFiscalNumber, postPrivateFiscalWsfe } from '../../supabase/functions/_shared/fiscalWsfeEmission'
import { wsfeSoap } from './fixtures/fiscalWsfe'
const series = { entorno: 'HOMOLOGACION', cuitEmisor: '20123456786', puntoVenta: 2, tipoComprobante: 13 }
const ticket = () => ({ token: 'SYNTHETIC_TOKEN&', sign: 'SYNTHETIC_SIGN<', expiresAt: Date.now() + 120000 })
const sample = (type = 13, last = '42') => wsfeSoap('FECompUltimoAutorizado', `<PtoVta>2</PtoVta><CbteTipo>${type}</CbteTipo><CbteNro>${last}</CbteNro>`)
const response = (xml = sample(), status = 200, contentType = 'text/xml; charset=utf-8') => new Response(xml, { status, headers: { 'Content-Type': contentType } })
afterEach(() => vi.useRealTimers())
it.each([3, 8, 13])('NC tipo%i conserva último autorizado y no amplía parser de factura v1', type => {
  for (const last of ['0', '42', '99999999']) expect(decodeLastFiscalCreditNumber(sample(type, last), { ...series, tipoComprobante: type })).toBe(Number(last))
  expect(() => decodeLastFiscalNumber(sample(type), { ...series, tipoComprobante: type })).toThrow()
})
it.each(['-1', '1.5', '1e2', '00', '100000000', ''])('rechaza número SOAP %s', last => {
  expect(() => decodeLastFiscalCreditNumber(sample(13, last), series)).toThrow('FISCAL_NUMERACION_NC_NO_CONFIRMADA')
})
it.each([
  () => sample().replace('<PtoVta>2', '<PtoVta>3'), () => sample(11),
  () => sample().replace('</CbteNro>', '</CbteNro><CbteNro>2</CbteNro>'),
  () => sample().replace('<CbteNro>', '<CbteNro><X/>'),
  () => sample().replace('http://ar.gov.afip.dif.FEV1/', 'https://evil.invalid/'),
  () => sample().replace('</CbteNro>', '</CbteNro><Errors><Err><Code>11002</Code><Msg>PRIVATE_BUSINESS_ERROR</Msg></Err></Errors>'),
  () => '<!DOCTYPE a [<!ENTITY x SYSTEM "file:///SYNTHETIC_PRIVATE">]>' + sample(),
  () => wsfeSoap('FECompConsultar', '<ResultGet/>'),
])('rechaza XML ajeno, ambiguo o error de negocio %# sin filtrar mensaje', make => {
  expect(() => decodeLastFiscalCreditNumber(make(), series)).toThrow('FISCAL_NUMERACION_NC_NO_CONFIRMADA')
})
it('consulta usa endpoint/acción fijos, TA escapado y callback antes de un solo envío', async () => {
  const before = vi.fn(async () => undefined), fetcher = vi.fn<typeof fetch>(async request => {
    expect(before).toHaveBeenCalledTimes(1)
    const req = request as Request, xml = await req.text()
    expect(req.url).toBe('https://wswhomo.afip.gov.ar/wsfev1/service.asmx'); expect(req.redirect).toBe('error')
    expect(req.headers.get('SOAPAction')).toBe('"http://ar.gov.afip.dif.FEV1/FECompUltimoAutorizado"')
    expect(xml).toContain('<Token>SYNTHETIC_TOKEN&amp;</Token>'); expect(xml).toContain('<Sign>SYNTHETIC_SIGN&lt;</Sign>')
    expect(xml).toContain('<Cuit>20123456786</Cuit>'); expect(xml).toContain('<CbteTipo>13</CbteTipo>')
    return response()
  })
  const value = await consultLastFiscalCreditNumber(series, ticket(), fetcher, before)
  expect(value.ultimo).toBe(42); expect(Number.isFinite(Date.parse(value.consultado_en))).toBe(true); expect(fetcher).toHaveBeenCalledTimes(1)
})
it.each([{ ...series, entorno: 'PRODUCCION' }, { ...series, puntoVenta: 99999 }, { ...series, puntoVenta: 1.5 },
  { ...series, cuitEmisor: '20123456789' }, { ...series, tipoComprobante: 11 }, { ...series, numero: 1 }])('serie inválida %# no obtiene secuencia ni llega a red', async value => {
  const fetcher = vi.fn<typeof fetch>()
  await expect(consultLastFiscalCreditNumber(value, ticket(), fetcher, async () => undefined)).rejects.toThrow('FISCAL_NUMERACION_NC_NO_CONFIRMADA')
  expect(fetcher).not.toHaveBeenCalled()
})
it('callback rechazado o TA vencido bloquean envío y errores privados quedan saneados', async () => {
  const fetcher = vi.fn<typeof fetch>()
  await expect(consultLastFiscalCreditNumber(series, ticket(), fetcher, async () => { throw new Error('PRIVATE_GATE') })).rejects.toThrow('FISCAL_NUMERACION_NC_NO_CONFIRMADA')
  await expect(consultLastFiscalCreditNumber(series, { ...ticket(), expiresAt: Date.now() + 1000 }, fetcher, async () => undefined)).rejects.toThrow('FISCAL_NUMERACION_NC_NO_CONFIRMADA')
  expect(fetcher).not.toHaveBeenCalled()
})
it.each([response('', 500), response(sample(), 200, 'text/html')])('respuesta HTTP inválida no se reintenta %#', async result => {
  const fetcher = vi.fn<typeof fetch>(async () => result)
  await expect(consultLastFiscalCreditNumber(series, ticket(), fetcher, async () => undefined)).rejects.toThrow('FISCAL_NUMERACION_NC_NO_CONFIRMADA')
  expect(fetcher).toHaveBeenCalledTimes(1)
})
it('captura serie antes de callback asíncrono; el callback no cambia la consulta', async () => {
  const expected = { ...series }; let finish!: () => void
  const before = vi.fn(() => new Promise<void>(resolve => { finish = resolve })), fetcher = vi.fn<typeof fetch>(async () => response())
  const pending = consultLastFiscalCreditNumber(expected, ticket(), fetcher, before)
  await vi.waitFor(() => expect(before).toHaveBeenCalledTimes(1)); expected.puntoVenta = 3; expected.tipoComprobante = 3; finish()
  expect((await pending).ultimo).toBe(42)
})
it('transporte privado compartido rechaza destino arbitrario antes de callback/red', async () => {
  const fetcher = vi.fn<typeof fetch>(), before = vi.fn(async () => undefined)
  await expect(postPrivateFiscalWsfe(new Request('https://evil.invalid/', { method: 'POST', redirect: 'error' }), fetcher, 1000, Date.now() + 120000, before)).rejects.toThrow()
  expect(before).not.toHaveBeenCalled(); expect(fetcher).not.toHaveBeenCalled()
})
