/** Contrato servidor puro. Requiere DTO obtenido por un adaptador XML seguro,
 * ligado al mismo contexto de consulta. No autentica ARCA ni escribe en DB. */
export interface FiscalIdentity {
  entorno: 'HOMOLOGACION'
  cuitEmisor: string
  puntoVenta: number
  tipoComprobante: number
  numero: number
}
interface Iva { id: number; base: string; importe: string }
interface Tributo { id: number; descripcion: string; base: string; alicuota: string; importe: string }
export interface FiscalRequestData extends FiscalIdentity {
  version: 1
  concepto: number
  tipoDocumento: number
  numeroDocumento: string
  condicionIvaReceptor: number
  fecha: string
  servicioDesde: string | null
  servicioHasta: string | null
  vencimientoPago: string | null
  moneda: 'PES'
  cotizacion: '1'
  importes: { total: string; neto: string; iva: string; noGravado: string; exento: string; tributos: string }
  iva: readonly Iva[]
  tributos: readonly Tributo[]
}
export interface FrozenFiscalRequest {
  version: 1
  solicitud: Readonly<FiscalRequestData>
  sha256: string
}
export type FiscalReconciliation =
  | { estado: 'AUTORIZACION_COINCIDENTE'; cae: string; vencimiento: string; procesadoEn: string | null; solicitudSha256: string; puedeReenviar: false }
  | { estado: 'CONCILIAR'; codigo: 'SOLICITUD_INVALIDA' | 'RESPUESTA_INVALIDA' | 'CONSULTA_DISTINTA' | 'DATOS_DISTINTOS' | 'SIN_CONFIRMACION'; puedeReenviar: false }

type Obj = Record<string, unknown>
const requestKeys = ['version','entorno','cuitEmisor','puntoVenta','tipoComprobante','numero','concepto',
  'tipoDocumento','numeroDocumento','condicionIvaReceptor','fecha','servicioDesde','servicioHasta',
  'vencimientoPago','moneda','cotizacion','importes','iva','tributos']
const moneyKeys = ['total','neto','iva','noGravado','exento','tributos'] as const
function invalid(): never { throw new Error('FISCAL_CONTRATO_INVALIDO') }
function object(value: unknown, keys: readonly string[]): Obj {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return invalid()
  const obj = value as Obj
  if (Object.keys(obj).length !== keys.length || keys.some(k => !Object.hasOwn(obj,k))) return invalid()
  return obj
}
function integer(value: unknown, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) return invalid()
  return value
}
function cuit(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9]{11}$/.test(value)) return invalid()
  const weights = [5,4,3,2,7,6,5,4,3,2]
  const raw = 11 - weights.reduce((sum,w,i) => sum + Number(value[i])*w,0)%11
  if (Number(value[10]) !== (raw===11 ? 0 : raw===10 ? 9 : raw)) return invalid()
  return value
}
function identity(value: Obj | FiscalIdentity): FiscalIdentity {
  if (value.entorno !== 'HOMOLOGACION') return invalid()
  const tipo = integer(value.tipoComprobante,1,11)
  if (![1,6,11].includes(tipo)) return invalid()
  return { entorno:'HOMOLOGACION', cuitEmisor:cuit(value.cuitEmisor),
    puntoVenta:integer(value.puntoVenta,1,99999),tipoComprobante:tipo,numero:integer(value.numero,1,99999999) }
}
function date(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9]{8}$/.test(value)) return invalid()
  const y=Number(value.slice(0,4)), m=Number(value.slice(4,6)), d=Number(value.slice(6,8))
  const days=[31,(y%4===0&&(y%100!==0||y%400===0))?29:28,31,30,31,30,31,31,30,31,30,31]
  if (y<1 || m<1 || m>12 || d<1 || d>days[m-1]) return invalid()
  return value
}
function optionalDate(value: unknown): string | null { return value===null || value==='' ? null : date(value) }
function decimal(value: unknown, precision = 2): string {
  // Conservar dígitos de XML: rechazar doubles JS, exponente, separador local o redondeo implícito.
  if (typeof value !== 'string' || value.length>32 || !/^[0-9]{1,10}(?:\.[0-9]{1,8})?$/.test(value)) return invalid()
  const [whole,fraction='']=value.split('.')
  if (/[1-9]/.test(fraction.slice(precision))) return invalid()
  return `${BigInt(whole)}.${fraction.slice(0,precision).padEnd(precision,'0')}`
}
function cents(value: string): bigint { return BigInt(value.replace('.','')) }
function sum(values: readonly string[]): bigint { return values.reduce((total,v)=>total+cents(v),0n) }
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value==='object') {
    const obj=value as Obj
    return `{${Object.keys(obj).sort().map(k=>`${JSON.stringify(k)}:${canonical(obj[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}
function freeze<T>(value: T): T {
  if (value && typeof value==='object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}
function sortedLines<T>(input: unknown, parse: (v: unknown)=>T): T[] {
  if (!Array.isArray(input) || input.length>100) return invalid()
  const result=input.map(parse).sort((a,b)=>{ const x=canonical(a),y=canonical(b); return x<y?-1:x>y?1:0 })
  if (new Set(result.map(canonical)).size!==result.length) return invalid()
  return result
}
function normalize(input: unknown): FiscalRequestData {
  const obj=object(input,requestKeys), id=identity(obj)
  if (obj.version!==1 || obj.moneda!=='PES' || obj.cotizacion!=='1') return invalid()
  const concepto=integer(obj.concepto,1,3), tipoDocumento=integer(obj.tipoDocumento,1,99)
  if (![80,96,99].includes(tipoDocumento) || typeof obj.numeroDocumento!=='string'
    || !/^(0|[1-9][0-9]{0,10})$/.test(obj.numeroDocumento)) return invalid()
  if ((tipoDocumento===99 && obj.numeroDocumento!=='0')
    || (tipoDocumento===80 && cuit(obj.numeroDocumento)!==obj.numeroDocumento)
    || (tipoDocumento===96 && !/^[1-9][0-9]{0,7}$/.test(obj.numeroDocumento))) return invalid()
  const servicioDesde=optionalDate(obj.servicioDesde),servicioHasta=optionalDate(obj.servicioHasta),vencimientoPago=optionalDate(obj.vencimientoPago)
  if (concepto===1 ? servicioDesde!==null || servicioHasta!==null || vencimientoPago!==null
    : servicioDesde===null || servicioHasta===null || vencimientoPago===null || servicioDesde>servicioHasta) return invalid()
  const rawMoney=object(obj.importes,moneyKeys)
  const importes=Object.fromEntries(moneyKeys.map(k=>[k,decimal(rawMoney[k])])) as FiscalRequestData['importes']
  if (cents(importes.total)<=0n || cents(importes.total)!==sum(moneyKeys.filter(k=>k!=='total').map(k=>importes[k]))) return invalid()
  const iva=sortedLines<Iva>(obj.iva,v=>{
    const line=object(v,['id','base','importe'])
    return {id:integer(line.id,1,2147483647),base:decimal(line.base),importe:decimal(line.importe)}
  })
  if (new Set(iva.map(line=>line.id)).size!==iva.length || sum(iva.map(v=>v.importe))!==cents(importes.iva)) return invalid()
  if (id.tipoComprobante===11 ? iva.length!==0 || cents(importes.iva)!==0n
    : sum(iva.map(v=>v.base))!==cents(importes.neto)) return invalid()
  const tributos=sortedLines<Tributo>(obj.tributos,v=>{
    const line=object(v,['id','descripcion','base','alicuota','importe'])
    if (typeof line.descripcion!=='string' || line.descripcion.length>250 || !line.descripcion.trim()) return invalid()
    return {id:integer(line.id,1,2147483647),descripcion:line.descripcion.trim(),
      base:decimal(line.base),alicuota:decimal(line.alicuota,4),importe:decimal(line.importe)}
  })
  if (sum(tributos.map(v=>v.importe))!==cents(importes.tributos)) return invalid()
  return {version:1,...id,concepto,tipoDocumento,numeroDocumento:obj.numeroDocumento,
    condicionIvaReceptor:integer(obj.condicionIvaReceptor,1,2147483647),fecha:date(obj.fecha),
    servicioDesde,servicioHasta,vencimientoPago,moneda:'PES',cotizacion:'1',importes,iva,tributos}
}
async function hash(value: FiscalRequestData): Promise<string> {
  const bytes=new TextEncoder().encode(canonical(value))
  const digest=await crypto.subtle.digest('SHA-256',bytes)
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')
}
/** Persistir esta solicitud y hash en el diario privado antes de reservar/enviar.
 * El hash no demuestra permisos, binding del emisor ni origen de una respuesta. */
export async function freezeFiscalRequest(input: unknown): Promise<FrozenFiscalRequest> {
  const solicitud=normalize(input)
  return freeze({version:1,solicitud,sha256:await hash(solicitud)})
}
export async function verifyFiscalRequest(input: unknown): Promise<FrozenFiscalRequest> {
  const obj=object(input,['version','solicitud','sha256'])
  if (obj.version!==1 || typeof obj.sha256!=='string' || !/^[0-9a-f]{64}$/.test(obj.sha256)) return invalid()
  const normalized=await freezeFiscalRequest(obj.solicitud)
  if (normalized.sha256!==obj.sha256) return invalid()
  return normalized
}
/** Serialización exacta usada por SHA-256 y por la persistencia privada. */
export async function serializeFiscalRequest(input: unknown): Promise<string> {
  const frozen=await verifyFiscalRequest(input)
  return canonical(frozen.solicitud)
}
const review = (codigo: Extract<FiscalReconciliation,{estado:'CONCILIAR'}>['codigo']): FiscalReconciliation =>
  ({estado:'CONCILIAR',codigo,puedeReenviar:false})
/** Sólo con DTO de FECompConsultar validado por adaptador XML y transporte privado.
 * Coincidencia candidata: requiere CAS/persistencia en DB; nunca confirma venta/pago/stock. */
export async function reconcileFiscalVoucher(observed: unknown, expected: unknown): Promise<FiscalReconciliation> {
  let frozen: FrozenFiscalRequest
  try { frozen=await verifyFiscalRequest(expected) } catch { return review('SOLICITUD_INVALIDA') }
  try {
    const obs=object(observed,['consulta','comprobante','autorizacion','errores'])
    const query=identity(object(obs.consulta,['entorno','cuitEmisor','puntoVenta','tipoComprobante','numero']))
    if (canonical(query)!==canonical(identity(frozen.solicitud))) return review('CONSULTA_DISTINTA')
    if (!Array.isArray(obs.errores) || obs.errores.length>100) return review('RESPUESTA_INVALIDA')
    if (obs.errores.length>0 || obs.comprobante===null || obs.autorizacion===null) return review('SIN_CONFIRMACION')
    const actual=normalize(obs.comprobante)
    if (canonical(actual)!==canonical(frozen.solicitud)) return review('DATOS_DISTINTOS')
    const auth=object(obs.autorizacion,['resultado','tipo','cae','vencimiento','procesadoEn'])
    if (auth.resultado!=='A' || auth.tipo!=='CAE') return review('SIN_CONFIRMACION')
    if (typeof auth.cae!=='string' || !/^[0-9]{14}$/.test(auth.cae) || /^0+$/.test(auth.cae)) return review('RESPUESTA_INVALIDA')
    const vencimiento=date(auth.vencimiento)
    if (vencimiento<actual.fecha) return review('RESPUESTA_INVALIDA')
    let procesadoEn: string | null=null
    if (auth.procesadoEn!==null) {
      if (typeof auth.procesadoEn!=='string' || !/^[0-9]{14}$/.test(auth.procesadoEn)) return review('RESPUESTA_INVALIDA')
      date(auth.procesadoEn.slice(0,8))
      if (Number(auth.procesadoEn.slice(8,10))>23 || Number(auth.procesadoEn.slice(10,12))>59 || Number(auth.procesadoEn.slice(12,14))>59) return review('RESPUESTA_INVALIDA')
      procesadoEn=auth.procesadoEn
    }
    return {estado:'AUTORIZACION_COINCIDENTE',cae:auth.cae,vencimiento,procesadoEn,solicitudSha256:frozen.sha256,puedeReenviar:false}
  } catch { return review('RESPUESTA_INVALIDA') }
}
function escape(value: string): string {
  return value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]!))
}
export async function buildFiscalVoucherQuery(expected: unknown, ticket: {token:string;sign:string;expiresAt:number}, now = Date.now()): Promise<Request> {
  const frozen=await verifyFiscalRequest(expected)
  if (!ticket || typeof ticket.token!=='string' || typeof ticket.sign!=='string'
    || !/^[\x09\x0A\x0D\x20-\x7E]+$/.test(ticket.token) || !/^[\x09\x0A\x0D\x20-\x7E]+$/.test(ticket.sign) || ticket.token.length>262144 || ticket.sign.length>262144
    || !Number.isSafeInteger(now) || !Number.isSafeInteger(ticket.expiresAt) || ticket.expiresAt<=now+60000) return invalid()
  const {cuitEmisor,puntoVenta,tipoComprobante,numero}=frozen.solicitud
  const body=`<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body><FECompConsultar xmlns="http://ar.gov.afip.dif.FEV1/"><Auth><Token>${escape(ticket.token)}</Token><Sign>${escape(ticket.sign)}</Sign><Cuit>${cuitEmisor}</Cuit></Auth><FeCompConsReq><CbteTipo>${tipoComprobante}</CbteTipo><CbteNro>${numero}</CbteNro><PtoVta>${puntoVenta}</PtoVta></FeCompConsReq></FECompConsultar></s:Body></s:Envelope>`
  return new Request('https://wswhomo.afip.gov.ar/wsfev1/service.asmx',{method:'POST',redirect:'error',
    headers:{'Content-Type':'text/xml; charset=utf-8',SOAPAction:'"http://ar.gov.afip.dif.FEV1/FECompConsultar"'},body})
}
