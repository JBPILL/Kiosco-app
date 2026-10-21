// Sólo genera material efímero de ensayo; no lee archivos, .env ni certificados reales.
import * as asn1js from 'asn1js'
import { Certificate, AttributeTypeAndValue, CryptoEngine } from 'pkijs'
import type { PrivateFiscalSigner } from '../../../supabase/functions/_shared/fiscalWsaaCms.ts'

export async function syntheticFiscalSigner(now=Date.now(),issuer='Computadores Test',exportableForEncryptionFixture=false):Promise<{
  material:PrivateFiscalSigner;fingerprint:string;certificate:Certificate;publicKey:CryptoKey
}> {
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},exportableForEncryptionFixture,['sign','verify'])
  const engine=new CryptoEngine({name:'kiosko-synthetic-test',crypto}),certificate=new Certificate()
  certificate.version=2;certificate.serialNumber=new asn1js.Integer({value:1})
  certificate.issuer.typesAndValues=[new AttributeTypeAndValue({type:'2.5.4.3',value:new asn1js.Utf8String({value:issuer})})]
  certificate.subject.typesAndValues=[new AttributeTypeAndValue({type:'2.5.4.3',value:new asn1js.Utf8String({value:'Kiosko Synthetic'})}),
    new AttributeTypeAndValue({type:'2.5.4.5',value:new asn1js.PrintableString({value:'CUIT 20123456786'})})]
  certificate.notBefore.value=new Date(now-3600000);certificate.notAfter.value=new Date(now+86400000)
  await certificate.subjectPublicKeyInfo.importKey(keys.publicKey,engine)
  await certificate.sign(keys.privateKey,'SHA-256',engine)
  const bytes=new Uint8Array(certificate.toSchema(true).toBER(false))
  const fingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('')
  return {material:{credentialId:crypto.randomUUID(),certificateDer:bytes,privateKey:keys.privateKey},fingerprint,certificate,publicKey:keys.publicKey}
}
