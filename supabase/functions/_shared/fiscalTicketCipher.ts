/** Sobre privado para compartir TA cifrado. No obtiene ni persiste claves.
 * AES-GCM WebCrypto: IV aleatorio de 96 bits, tag de 128 bits y AAD ligada a
 * proyecto/entorno/servicio/certificado/clave/vencimiento. Nunca usar en frontend. */
import type { PrivateWsaaTicket } from './fiscalTicketCache.ts'

export interface FiscalTicketCipher {
  version:1; keyId:string; nonce:string; ciphertext:string; expiresAt:number
}
export interface FiscalTicketCipherContext {
  projectRef:'acoyfwwmhaeruciyedri'; entorno:'HOMOLOGACION'; servicio:'wsfe'; certificadoSha256:string
}
const fail=():never=>{throw new Error('FISCAL_TICKET_CIFRADO_INVALIDO')}
const encoder=new TextEncoder()
const hex=(bytes:Uint8Array):string=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('')
function unhex(text:string):Uint8Array<ArrayBuffer> {
  const bytes=new Uint8Array(text.length/2)
  for(let i=0;i<bytes.length;i++)bytes[i]=parseInt(text.slice(i*2,i*2+2),16)
  return bytes
}
function aad(context:FiscalTicketCipherContext,key:CryptoKey,keyId:string,expiresAt:number):Uint8Array<ArrayBuffer> {
  if(context.projectRef!=='acoyfwwmhaeruciyedri'||context.entorno!=='HOMOLOGACION'||context.servicio!=='wsfe'
    ||typeof context.certificadoSha256!=='string'||!/^[0-9a-f]{64}$/.test(context.certificadoSha256)
    ||typeof keyId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(keyId)
    ||!Number.isSafeInteger(expiresAt)||expiresAt<=0||key.type!=='secret'||key.extractable
    ||key.algorithm.name!=='AES-GCM'||(key.algorithm as AesKeyAlgorithm).length!==256
    ||!key.usages.includes('encrypt')||!key.usages.includes('decrypt'))return fail()
  return encoder.encode(JSON.stringify([1,context.projectRef,context.entorno,context.servicio,context.certificadoSha256,keyId,expiresAt]))
}
function credentials(token:unknown,sign:unknown):void {
  for(const text of [token,sign])if(typeof text!=='string'||text.length<1||text.length>262144||!/^[\x09\x0A\x0D\x20-\x7E]+$/.test(text))return fail()
}
export function validateFiscalTicketKey(context:FiscalTicketCipherContext,key:CryptoKey,keyId:string):void {
  try {aad(context,key,keyId,1)}catch{return fail()}
}
export async function encryptFiscalTicket(
  ticket:PrivateWsaaTicket,context:FiscalTicketCipherContext,key:CryptoKey,keyId:string,
):Promise<Readonly<FiscalTicketCipher>> {
  let plain:Uint8Array<ArrayBuffer>|undefined
  try {
    const {token,sign,expiresAt}=ticket
    credentials(token,sign)
    const additionalData=aad(context,key,keyId,expiresAt),iv=crypto.getRandomValues(new Uint8Array(12))
    plain=encoder.encode(JSON.stringify({version:1,token,sign,expiresAt}))
    if(plain.byteLength>549984)return fail()
    const encrypted=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData,tagLength:128},key,plain)
    return Object.freeze({version:1,keyId,nonce:hex(iv),ciphertext:hex(new Uint8Array(encrypted)),expiresAt})
  } catch {return fail()} finally {plain?.fill(0)}
}
export async function decryptFiscalTicket(
  input:unknown,context:FiscalTicketCipherContext,key:CryptoKey,expectedKeyId:string,now=Date.now(),
):Promise<PrivateWsaaTicket> {
  let plain:Uint8Array<ArrayBuffer>|undefined
  try {
    if(!input||typeof input!=='object'||Array.isArray(input))return fail()
    const obj=input as Record<string,unknown>
    if(Object.keys(obj).length!==5||Object.keys(obj).some(k=>!['version','keyId','nonce','ciphertext','expiresAt'].includes(k))
      ||obj.version!==1||obj.keyId!==expectedKeyId||typeof obj.nonce!=='string'||!/^[0-9a-f]{24}$/.test(obj.nonce)
      ||typeof obj.ciphertext!=='string'||obj.ciphertext.length>1100000||obj.ciphertext.length%2!==0||!/^[0-9a-f]{32,}$/.test(obj.ciphertext)
      ||typeof obj.expiresAt!=='number'||!Number.isSafeInteger(now)||obj.expiresAt<=now)return fail()
    const additionalData=aad(context,key,expectedKeyId,obj.expiresAt)
    plain=new Uint8Array(await crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(obj.nonce),additionalData,tagLength:128},key,unhex(obj.ciphertext)))
    const parsed:unknown=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(plain))
    if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return fail()
    const value=parsed as Record<string,unknown>
    if(Object.keys(value).length!==4||Object.keys(value).some(k=>!['version','token','sign','expiresAt'].includes(k))
      ||value.version!==1||value.expiresAt!==obj.expiresAt)return fail()
    credentials(value.token,value.sign)
    return Object.freeze(Object.defineProperties({expiresAt:obj.expiresAt},{
      token:{value:value.token,enumerable:false},sign:{value:value.sign,enumerable:false},
      toString:{value:()=> '[Ticket WSAA privado]',enumerable:false},
    })) as PrivateWsaaTicket
  } catch {return fail()} finally {plain?.fill(0)}
}
