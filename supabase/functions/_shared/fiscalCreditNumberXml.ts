import type { Element as XmlElement } from '@xmldom/xmldom'
import { normalizeFiscalCuit, buildFiscalAuthForCuit } from './fiscalReconciliation.ts'
import { parseFiscalXmlRoot, fiscalXmlSchema as schema, fiscalXmlOne as one, fiscalXmlChildren as children } from './fiscalVoucherXml.ts'
import { postPrivateFiscalWsfe } from './fiscalWsfeEmission.ts'
import type { PrivateWsaaTicket } from './fiscalTicketCache.ts'

export interface FiscalCreditSeries { entorno: 'HOMOLOGACION'; cuitEmisor: string; puntoVenta: number; tipoComprobante: 3 | 8 | 13 }
const SOAP = 'http://schemas.xmlsoap.org/soap/envelope/', WSFE = 'http://ar.gov.afip.dif.FEV1/'
const fail = (): never => { throw new Error('FISCAL_NUMERACION_NC_NO_CONFIRMADA') }
export function normalizeFiscalCreditSeries(input: unknown): Readonly<FiscalCreditSeries> {
  try {
    if (!input || typeof input !== 'object' || Array.isArray(input)) return fail()
    const value = input as Record<string, unknown>, keys = ['entorno', 'cuitEmisor', 'puntoVenta', 'tipoComprobante']
    if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key)) || value.entorno !== 'HOMOLOGACION'
      || typeof value.puntoVenta !== 'number' || !Number.isSafeInteger(value.puntoVenta) || value.puntoVenta < 1 || value.puntoVenta > 99998
      || value.tipoComprobante !== 3 && value.tipoComprobante !== 8 && value.tipoComprobante !== 13) return fail()
    return Object.freeze({ entorno: 'HOMOLOGACION', cuitEmisor: normalizeFiscalCuit(value.cuitEmisor), puntoVenta: value.puntoVenta, tipoComprobante: value.tipoComprobante })
  } catch { return fail() }
}
function field(parent: XmlElement, name: string): string {
  const element = one(parent, name)!
  if (children(element).length) return fail()
  return element.textContent?.trim() ?? ''
}
function integer(parent: XmlElement, name: string, max: number): number {
  const value = field(parent, name)
  if (!/^(0|[1-9]\d{0,9})$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > max) return fail()
  return Number(value)
}
function codes(parent: XmlElement, name: string, item: string): number[] {
  const list = one(parent, name, false)
  if (!list) return []
  for (let i = 0; i < list.childNodes.length; i++) {
    const node = list.childNodes.item(i)
    if (node && [3, 4].includes(node.nodeType) && node.textContent?.trim()) return fail()
  }
  const rows = children(list)
  if (rows.length > 100) return fail()
  return rows.map(row => {
    if (row.namespaceURI !== WSFE || row.localName !== item) return fail()
    schema(row, ['Code', 'Msg'])
    const code = integer(row, 'Code', 2147483647)
    if (code < 1 || field(row, 'Msg').length > 4096) return fail()
    return code
  })
}
/** WSFE devuelve PV/tipo/número, no CUIT: el binding del TA debe acreditarse
 * antes por el adaptador privado. Este parser no autentica una respuesta. */
export function decodeLastFiscalCreditNumber(xml: string, expected: unknown): number {
  try {
    const series = normalizeFiscalCreditSeries(expected), root = parseFiscalXmlRoot(xml)
    if (root.namespaceURI !== SOAP || root.localName !== 'Envelope') return fail()
    schema(root, ['Header', 'Body'], SOAP)
    const body = one(root, 'Body', true, SOAP)!; schema(body, ['FECompUltimoAutorizadoResponse'])
    const response = one(body, 'FECompUltimoAutorizadoResponse')!; schema(response, ['FECompUltimoAutorizadoResult'])
    const result = one(response, 'FECompUltimoAutorizadoResult')!; schema(result, ['PtoVta', 'CbteTipo', 'CbteNro', 'Errors', 'Events'])
    const errors = codes(result, 'Errors', 'Err'); codes(result, 'Events', 'Evt')
    if (errors.length || integer(result, 'PtoVta', 99998) !== series.puntoVenta || integer(result, 'CbteTipo', 13) !== series.tipoComprobante) return fail()
    return integer(result, 'CbteNro', 99999999)
  } catch { return fail() }
}
/** Consulta sólo lectura. El callback privado debe comprobar gates/binding
 * vigentes inmediatamente antes de enviar. No crea TA, reserva ni permiso. */
export async function consultLastFiscalCreditNumber(expected: unknown, ticket: PrivateWsaaTicket, fetcher: typeof fetch, beforeSend: () => Promise<void>, timeoutMs = 15000, signal?:AbortSignal): Promise<{ ultimo: number; consultado_en: string }> {
  try {
    const series = normalizeFiscalCreditSeries(structuredClone(expected))
    if (typeof beforeSend !== 'function') return fail()
    const expiresAt = ticket.expiresAt, auth = buildFiscalAuthForCuit(series.cuitEmisor, ticket)
    const request = new Request('https://wswhomo.afip.gov.ar/wsfev1/service.asmx', { method: 'POST', redirect: 'error', headers: {
      'Content-Type': 'text/xml; charset=utf-8', SOAPAction: `"${WSFE}FECompUltimoAutorizado"`,
    }, body: `<s:Envelope xmlns:s="${SOAP}"><s:Body><FECompUltimoAutorizado xmlns="${WSFE}">${auth}<PtoVta>${series.puntoVenta}</PtoVta><CbteTipo>${series.tipoComprobante}</CbteTipo></FECompUltimoAutorizado></s:Body></s:Envelope>` })
    const xml = await postPrivateFiscalWsfe(request, fetcher, timeoutMs, expiresAt, beforeSend,signal)
    return { ultimo: decodeLastFiscalCreditNumber(xml, series), consultado_en: new Date().toISOString() }
  } catch { return fail() }
}
