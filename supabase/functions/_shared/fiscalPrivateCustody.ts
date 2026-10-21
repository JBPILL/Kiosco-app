/** Adaptadores de secretos del servidor. Sin filesystem, .env ni valores VITE.
 * Los nombres se derivan de IDs privados autorizados; no acepta rutas/nombres
 * enviados por el operador. No provisiona ni transmite secretos por sí mismo. */
import * as asn1js from 'asn1js'
import { PKCS8ShroudedKeyBag, PBES2Params, PBKDF2Params, EncryptedContentInfo, CryptoEngine } from 'pkijs'
import type { PrivateFiscalCustody } from './fiscalWsaa.ts'
import type { FiscalTicketKeys } from './fiscalSharedTickets.ts'
import type { PrivateFiscalSigner } from './fiscalWsaaCms.ts'

export type FiscalSecretReader=(name:string)=>string|undefined
const invalid=():never=>{throw new Error('FISCAL_CUSTODIA_NO_DISPONIBLE')}
function id(value:unknown):string {
  if(typeof value!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))return invalid()
  return value.toLowerCase()
}
function staging(read:FiscalSecretReader):void {
  const raw=read('SUPABASE_URL')
  if(typeof raw!=='string'||raw!==raw.trim())return invalid()
  const url=new URL(raw)
  if(url.origin!=='https://acoyfwwmhaeruciyedri.supabase.co'||url.pathname!=='/'||url.search||url.hash||url.username||url.password)return invalid()
}
function required(read:FiscalSecretReader,name:string,max:number):string {
  const value=read(name)
  if(typeof value!=='string'||!value.length||value.length>max)return invalid()
  return value
}
function decodeBase64(value:string):Uint8Array<ArrayBuffer> {
  if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length%4!==0)return invalid()
  const binary=atob(value)
  if(btoa(binary)!==value)return invalid()
  return Uint8Array.from(binary,c=>c.charCodeAt(0))
}
function pem(value:string,label:'CERTIFICATE'|'ENCRYPTED PRIVATE KEY'):Uint8Array<ArrayBuffer> {
  const match=new RegExp(`^-----BEGIN ${label}-----\\r?\\n([A-Za-z0-9+/=\\r\\n]+)\\r?\\n-----END ${label}-----$`).exec(value.trim())
  if(!match)return invalid()
  return decodeBase64(match[1].replace(/[\r\n]/g,''))
}
function encryptedPkcs8(bytes:Uint8Array<ArrayBuffer>):PKCS8ShroudedKeyBag {
  if(bytes.length<16||bytes.length>16384)return invalid()
  const parsed=asn1js.fromBER(bytes,{maxDepth:16,maxNodes:256,maxContentLength:16384})
  if(parsed.offset!==bytes.length)return invalid()
  const bag=new PKCS8ShroudedKeyBag({schema:parsed.result})
  if(bag.encryptionAlgorithm.algorithmId!=='1.2.840.113549.1.5.13')return invalid()
  const params=new PBES2Params({schema:bag.encryptionAlgorithm.algorithmParams})
  if(params.keyDerivationFunc.algorithmId!=='1.2.840.113549.1.5.12'||params.encryptionScheme.algorithmId!=='2.16.840.1.101.3.4.1.42')return invalid()
  const kdf=new PBKDF2Params({schema:params.keyDerivationFunc.algorithmParams}),salt:unknown=kdf.salt,iv:unknown=params.encryptionScheme.algorithmParams
  if(!(salt instanceof asn1js.OctetString)||salt.idBlock.isConstructed||salt.getValue().byteLength<16||salt.getValue().byteLength>64
    ||!(iv instanceof asn1js.OctetString)||iv.idBlock.isConstructed||iv.getValue().byteLength!==16
    ||!Number.isSafeInteger(kdf.iterationCount)||kdf.iterationCount<200000||kdf.iterationCount>1000000
    ||kdf.prf?.algorithmId!=='1.2.840.113549.2.9'||(kdf.keyLength!==undefined&&kdf.keyLength!==32))return invalid()
  return bag
}
/** Acepta PBES2/PBKDF2-HMAC-SHA256/AES256-CBC del preparador .NET existente,
 * con trabajo acotado. Validación de issuer/fechas y correspondencia de clave
 * se realiza después en prepareWsaaRequest, antes de cualquier llamada WSAA. */
export function createPrivateFiscalCustody(read:FiscalSecretReader):PrivateFiscalCustody {
  return async(binding,signal)=>{
    let passwordBytes:Uint8Array<ArrayBuffer>|undefined,plain:Uint8Array<ArrayBuffer>|undefined
    try {
      if(signal.aborted||binding.entorno!=='HOMOLOGACION'||binding.servicio!=='wsfe')return invalid()
      staging(read)
      const credential=id(binding.credencial_id),prefix='ARCA_HOMO_CREDENTIAL_'+credential.replace(/-/g,'').toUpperCase()
      const revision=required(read,prefix+'_REVISION',10)
      if(!/^[1-9]\d{0,9}$/.test(revision)||Number(revision)!==binding.revision)return invalid()
      const certificate=pem(required(read,prefix+'_CERT_PEM',100000),'CERTIFICATE')
      if(certificate.length<16||certificate.length>65536)return invalid()
      const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',certificate)),b=>b.toString(16).padStart(2,'0')).join('')
      if(fingerprint!==binding.certificado_sha256||signal.aborted)return invalid()
      const encrypted=pem(required(read,prefix+'_KEY_PEM',100000),'ENCRYPTED PRIVATE KEY'),bag=encryptedPkcs8(encrypted)
      const password=required(read,prefix+'_PASSWORD',1024)
      if(password.length<16||signal.aborted)return invalid()
      passwordBytes=new TextEncoder().encode(password)
      const engine=new CryptoEngine({name:'kiosko-private-custody',crypto})
      plain=new Uint8Array(await engine.decryptEncryptedContentInfo({password:passwordBytes.buffer,
        encryptedContentInfo:new EncryptedContentInfo({contentEncryptionAlgorithm:bag.encryptionAlgorithm,encryptedContent:bag.encryptedData})}))
      if(signal.aborted)return invalid()
      const key=await crypto.subtle.importKey('pkcs8',plain,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign'])
      const algorithm=key.algorithm as RsaHashedKeyAlgorithm
      if(key.extractable||algorithm.modulusLength<2048||algorithm.modulusLength>4096||signal.aborted)return invalid()
      return Object.freeze(Object.defineProperties({credentialId:credential},{
        certificateDer:{get:()=>certificate.slice(),enumerable:false},privateKey:{value:key,enumerable:false},
      })) as PrivateFiscalSigner
    }catch{return invalid()}finally{passwordBytes?.fill(0);plain?.fill(0)}
  }
}
/** Keyring privado para sobres TA. Conserva IDs antiguos mientras sus sobres
 * sean vigentes; una clave ausente no se sustituye por la activa. */
export function createPrivateFiscalTicketKeys(read:FiscalSecretReader):FiscalTicketKeys {
  async function load(keyId:string):Promise<CryptoKey> {
    let bytes:Uint8Array<ArrayBuffer>|undefined
    try {
      staging(read)
      const key=id(keyId),name='ARCA_HOMO_TA_KEY_'+key.replace(/-/g,'').toUpperCase()
      bytes=decodeBase64(required(read,name,44))
      if(bytes.length!==32)return invalid()
      return await crypto.subtle.importKey('raw',bytes,{name:'AES-GCM'},false,['encrypt','decrypt'])
    }catch{return invalid()}finally{bytes?.fill(0)}
  }
  return {
    async active(){try{staging(read);const keyId=id(required(read,'ARCA_HOMO_TA_ACTIVE_KEY_ID',36));return {id:keyId,key:await load(keyId)}}catch{return invalid()}},
    read:load,
  }
}
