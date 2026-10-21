// @vitest-environment node
import { beforeAll, expect, it } from 'vitest'
import { ContentInfo, SignedData, CryptoEngine } from 'pkijs'
import { prepareWsaaRequest, buildWsaaTra } from '../../supabase/functions/_shared/fiscalWsaaCms'
import { syntheticFiscalSigner } from './fixtures/fiscalSigner'
import { normalizeWsaaDn } from '../../supabase/functions/_shared/fiscalWsaaDn'

let signer:Awaited<ReturnType<typeof syntheticFiscalSigner>>
const now=Date.now()
beforeAll(async()=>{signer=await syntheticFiscalSigner(now)})
it('firma CMS real SHA256 con clave no exportable y verifica su contenido y firma',async()=>{
  const result=await prepareWsaaRequest(signer.material,{credentialId:signer.material.credentialId,certificateSha256:signer.fingerprint},now,123)
  const parsed=ContentInfo.fromBER(result.cmsDer),signed=new SignedData({schema:parsed.content})
  expect(parsed.contentType).toBe('1.2.840.113549.1.7.2')
  expect(signed.digestAlgorithms[0].algorithmId).toBe('2.16.840.1.101.3.4.2.1')
  expect(await signed.verify({signer:0,checkChain:false,checkDate:new Date(now)},new CryptoEngine({name:'test',crypto}))).toBe(true)
  const content=signed.encapContentInfo.eContent!.getValue()
  expect(new TextDecoder().decode(content)).toBe(buildWsaaTra(now,123))
  expect(result.destination).toBe(normalizeWsaaDn('SERIALNUMBER=CUIT 20123456786, CN=KIOSKO SYNTHETIC'))
  expect(JSON.stringify(result)).not.toContain('cmsDer')
  const copied=result.cmsDer;copied.fill(0);expect(result.cmsDer[0]).not.toBe(0)
})
it.each(['huella','credencial','caducado','futuro','cola_asn1','otra_clave'])('rechaza material %s',async mode=>{
  const material={...signer.material},expected={credentialId:material.credentialId,certificateSha256:signer.fingerprint}
  if(mode==='huella')expected.certificateSha256='0'.repeat(64)
  if(mode==='credencial')expected.credentialId=crypto.randomUUID()
  if(mode==='cola_asn1')material.certificateDer=new Uint8Array([...material.certificateDer,0])
  if(mode==='otra_clave')material.privateKey=(await syntheticFiscalSigner(now)).material.privateKey
  await expect(prepareWsaaRequest(material,expected,mode==='caducado'?now+2*86400000:mode==='futuro'?now-2*86400000:now,123)).rejects.toThrow('FISCAL_WSAA_FIRMA_INVALIDA')
})
it('rechaza issuer productivo incluso con huella coincidente',async()=>{
  const other=await syntheticFiscalSigner(now,'Computadores')
  await expect(prepareWsaaRequest(other.material,{credentialId:other.material.credentialId,certificateSha256:other.fingerprint},now,123)).rejects.toThrow('FISCAL_WSAA_FIRMA_INVALIDA')
})
it.each([0,-1,1.5,4294967296])('rechaza uniqueId %s',id=>{expect(()=>buildWsaaTra(now,id)).toThrow()})
it.each(['CN=x,CN=y','CN=x\\,y','CN=x+OU=y','UNKNOWN=x','CN='])('rechaza DN no soportado %s',value=>{expect(()=>normalizeWsaaDn(value)).toThrow()})
