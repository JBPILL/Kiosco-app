import * as asn1js from 'asn1js'
import { Certificate, ContentInfo, SignedData, EncapsulatedContentInfo, SignerInfo, IssuerAndSerialNumber, CryptoEngine } from 'pkijs'
import { normalizeWsaaDnFields } from './fiscalWsaaDn.ts'

export interface PrivateFiscalSigner {
  credentialId:string; certificateDer:Uint8Array; privateKey:CryptoKey
}
export interface PreparedWsaaRequest {
  readonly uniqueId:number; readonly destination:string; readonly cmsDer:Uint8Array<ArrayBuffer>
}
const invalid=():never=>{throw new Error('FISCAL_WSAA_FIRMA_INVALIDA')}
export function buildWsaaTra(now:number,uniqueId:number):string {
  if(!Number.isSafeInteger(now)||!Number.isInteger(uniqueId)||uniqueId<1||uniqueId>4294967295)return invalid()
  const generation=new Date(now-300000).toISOString(),expiration=new Date(now+600000).toISOString()
  return `<?xml version="1.0" encoding="UTF-8"?><loginTicketRequest version="1.0"><header><uniqueId>${uniqueId}</uniqueId><generationTime>${generation}</generationTime><expirationTime>${expiration}</expirationTime></header><service>wsfe</service></loginTicketRequest>`
}
/** Sólo firma material ya provisionado por custodia privada. Huella pinneada
 * e issuer Test son gates locales; no equivalen a validar una cadena de ARCA. */
export async function prepareWsaaRequest(material:PrivateFiscalSigner,expected:{credentialId:string;certificateSha256:string},
  now=Date.now(),uniqueId=crypto.getRandomValues(new Uint32Array(1))[0]||1):Promise<PreparedWsaaRequest> {
  try {
    const bytes=new Uint8Array(material.certificateDer),key=material.privateKey
    if(material.credentialId!==expected.credentialId||bytes.length<16||bytes.length>65536
      ||!/^[0-9a-f]{64}$/.test(expected.certificateSha256)||key.type!=='private'||key.extractable||!key.usages.includes('sign')
      ||key.algorithm.name!=='RSASSA-PKCS1-v1_5')return invalid()
    const algorithm=key.algorithm as RsaHashedKeyAlgorithm
    if(algorithm.hash.name!=='SHA-256'||algorithm.modulusLength<2048||algorithm.modulusLength>4096)return invalid()
    const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
    if(digest!==expected.certificateSha256)return invalid()
    const parsed=asn1js.fromBER(bytes,{maxDepth:32,maxNodes:2000,maxContentLength:65536})
    if(parsed.offset!==bytes.length)return invalid()
    const certificate=new Certificate({schema:parsed.result})
    if(certificate.notBefore.value.getTime()>now||certificate.notAfter.value.getTime()<=now)return invalid()
    const commonNames=certificate.issuer.typesAndValues.filter(a=>a.type==='2.5.4.3')
    if(commonNames.length!==1||String(commonNames[0].value.valueBlock.value)!=='Computadores Test')return invalid()
    const destination=normalizeWsaaDnFields(certificate.subject.typesAndValues.map(a=>[a.type,String(a.value.valueBlock.value)] as const))
    const tra=new TextEncoder().encode(buildWsaaTra(now,uniqueId))
    const cms=new SignedData({encapContentInfo:new EncapsulatedContentInfo({eContentType:'1.2.840.113549.1.7.1',
      eContent:new asn1js.OctetString({valueHex:tra})}),certificates:[certificate],
    signerInfos:[new SignerInfo({version:1,sid:new IssuerAndSerialNumber({issuer:certificate.issuer,serialNumber:certificate.serialNumber})})]})
    const engine=new CryptoEngine({name:'kiosko-wsaa-private',crypto})
    await cms.sign(key,0,'SHA-256',undefined,engine)
    if(!await cms.verify({signer:0,checkChain:false,checkDate:new Date(now)},engine))return invalid()
    const content=new ContentInfo({contentType:'1.2.840.113549.1.7.2',content:cms.toSchema(true)})
    const encoded=new Uint8Array(content.toSchema().toBER(false))
    return Object.freeze(Object.defineProperties({uniqueId,destination},{cmsDer:{get:()=>encoded.slice(),enumerable:false}})) as PreparedWsaaRequest
  }catch{return invalid()}
}
