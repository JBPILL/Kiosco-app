// Material sintético efímero. Sólo para fabricar el fixture PKCS8 cifrado;
// la clave exportable generadora no se entrega al proveedor ni se escribe.
import { CryptoEngine, PKCS8ShroudedKeyBag } from 'pkijs'
import { syntheticFiscalSigner } from './fiscalSigner.ts'
import type { FiscalWorkerBinding } from '../../../supabase/functions/_shared/fiscalWorkerAuthorization.ts'

function pem(label:string,bytes:Uint8Array):string {
  let binary='';for(const byte of bytes)binary+=String.fromCharCode(byte)
  return `-----BEGIN ${label}-----\n${btoa(binary).match(/.{1,64}/g)!.join('\n')}\n-----END ${label}-----`
}
export async function syntheticEncryptedCustody(iterations=200000,passwordInput?:string):Promise<{secrets:Record<string,string>;binding:FiscalWorkerBinding;prefix:string}> {
  const signer=await syntheticFiscalSigner(Date.now(),'Computadores Test',true)
  const plain=new Uint8Array(await crypto.subtle.exportKey('pkcs8',signer.material.privateKey))
  const password=passwordInput??'SYNTHETIC_ONLY_'+crypto.randomUUID(),passwordBytes=new TextEncoder().encode(password)
  try {
    const engine=new CryptoEngine({name:'synthetic-encrypted-custody',crypto})
    const encrypted=await engine.encryptEncryptedContentInfo({password:passwordBytes.buffer,contentToEncrypt:plain.buffer,
      contentEncryptionAlgorithm:{name:'AES-CBC',length:256,iv:crypto.getRandomValues(new Uint8Array(16))},hmacHashAlgorithm:'SHA-256',iterationCount:iterations,contentType:'1.2.840.113549.1.7.1'})
    const bag=new PKCS8ShroudedKeyBag({encryptionAlgorithm:encrypted.contentEncryptionAlgorithm,encryptedData:encrypted.encryptedContent})
    const prefix='ARCA_HOMO_CREDENTIAL_'+signer.material.credentialId.replace(/-/g,'').toUpperCase()
    return {prefix,binding:{version:1,entorno:'HOMOLOGACION',servicio:'wsfe',operacion_id:crypto.randomUUID(),kiosco_id:crypto.randomUUID(),usuario_id:crypto.randomUUID(),
      cuit_emisor:'20123456786',punto_venta:2,credencial_id:signer.material.credentialId,certificado_sha256:signer.fingerprint,revision:1},
    secrets:{SUPABASE_URL:'https://acoyfwwmhaeruciyedri.supabase.co',[prefix+'_REVISION']:'1',
      [prefix+'_CERT_PEM']:pem('CERTIFICATE',signer.material.certificateDer),
      [prefix+'_KEY_PEM']:pem('ENCRYPTED PRIVATE KEY',new Uint8Array(bag.toSchema().toBER(false))),[prefix+'_PASSWORD']:password}}
  }finally{plain.fill(0);passwordBytes.fill(0)}
}
