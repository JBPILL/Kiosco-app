// @vitest-environment node
import { beforeAll, expect, it, vi } from 'vitest'
import { createPrivateFiscalCustody, createPrivateFiscalTicketKeys } from '../../supabase/functions/_shared/fiscalPrivateCustody'
import { prepareWsaaRequest } from '../../supabase/functions/_shared/fiscalWsaaCms'
import { encryptFiscalTicket, decryptFiscalTicket } from '../../supabase/functions/_shared/fiscalTicketCipher'
import { syntheticEncryptedCustody } from './fixtures/fiscalEncryptedCustody'

let fixture:Awaited<ReturnType<typeof syntheticEncryptedCustody>>
beforeAll(async()=>{fixture=await syntheticEncryptedCustody()})
it('descifra PKCS8 sólo en memoria e importa RSA no exportable que firma CMS válido',async()=>{
  const read=vi.fn((name:string)=>fixture.secrets[name]),custody=createPrivateFiscalCustody(read)
  const material=await custody(fixture.binding,new AbortController().signal)
  expect(material.privateKey.extractable).toBe(false)
  await expect(crypto.subtle.exportKey('pkcs8',material.privateKey)).rejects.toThrow()
  expect(JSON.stringify(material)).toEqual(JSON.stringify({credentialId:fixture.binding.credencial_id}))
  expect((await prepareWsaaRequest(material,{credentialId:fixture.binding.credencial_id,certificateSha256:fixture.binding.certificado_sha256})).cmsDer.length).toBeGreaterThan(100)
})
it.each(['https://lllkjnqpltnwvxzphncr.supabase.co','http://acoyfwwmhaeruciyedri.supabase.co',
  'https://acoyfwwmhaeruciyedri.supabase.co.evil.invalid','https://example.invalid','https://acoyfwwmhaeruciyedri.supabase.co/?x=1'])('rechaza proyecto %s antes de leer material privado',async url=>{
  const read=vi.fn((name:string)=>name==='SUPABASE_URL'?url:fixture.secrets[name])
  await expect(createPrivateFiscalCustody(read)(fixture.binding,new AbortController().signal)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
  expect(read.mock.calls).toEqual([['SUPABASE_URL']])
})
it.each(['password','revision','huella','pem_plano','pem_extra','ausente','credencial'])('rechaza custodia incoherente %s',async mode=>{
  const secrets={...fixture.secrets},binding={...fixture.binding},p=fixture.prefix
  if(mode==='password')secrets[p+'_PASSWORD']='SYNTHETIC_WRONG_PASSWORD'
  if(mode==='revision')secrets[p+'_REVISION']='2'
  if(mode==='huella')binding.certificado_sha256='0'.repeat(64)
  if(mode==='pem_plano')secrets[p+'_KEY_PEM']=secrets[p+'_KEY_PEM'].replaceAll('ENCRYPTED PRIVATE KEY','PRIVATE KEY')
  if(mode==='pem_extra')secrets[p+'_KEY_PEM']+='\nEXTRA'
  if(mode==='ausente')delete secrets[p+'_KEY_PEM']
  if(mode==='credencial')binding.credencial_id='SUPABASE_SERVICE_ROLE_KEY'
  await expect(createPrivateFiscalCustody(name=>secrets[name])(binding,new AbortController().signal)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
})
it('rechaza PBKDF2 fuera del trabajo permitido',async()=>{
  const weak=await syntheticEncryptedCustody(1000)
  await expect(createPrivateFiscalCustody(name=>weak.secrets[name])(weak.binding,new AbortController().signal)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
})
it('abort o fallo de secreto no filtra mensajes ni llega a material',async()=>{
  const read=vi.fn(()=>{throw new Error('SYNTHETIC_PRIVATE_ERROR')}),controller=new AbortController();controller.abort()
  await expect(createPrivateFiscalCustody(read)(fixture.binding,controller.signal)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
  expect(read).not.toHaveBeenCalled()
  await expect(createPrivateFiscalCustody(read)(fixture.binding,new AbortController().signal)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
})
it('keyring importa claves AES no exportables y conserva lectura del ID anterior tras rotación',async()=>{
  const oldId=crypto.randomUUID(),newId=crypto.randomUUID(),secrets:Record<string,string>={SUPABASE_URL:fixture.secrets.SUPABASE_URL,ARCA_HOMO_TA_ACTIVE_KEY_ID:oldId}
  for(const id of [oldId,newId]){const raw=crypto.getRandomValues(new Uint8Array(32));secrets['ARCA_HOMO_TA_KEY_'+id.replace(/-/g,'').toUpperCase()]=btoa(String.fromCharCode(...raw));raw.fill(0)}
  const keys=createPrivateFiscalTicketKeys(name=>secrets[name]),old=await keys.active()
  const context={projectRef:'acoyfwwmhaeruciyedri',entorno:'HOMOLOGACION',servicio:'wsfe',certificadoSha256:fixture.binding.certificado_sha256} as const
  const encrypted=await encryptFiscalTicket({token:'SYNTHETIC_TOKEN',sign:'SYNTHETIC_SIGN',expiresAt:Date.now()+120000},context,old.key,old.id)
  secrets.ARCA_HOMO_TA_ACTIVE_KEY_ID=newId
  expect((await keys.active()).id).toBe(newId)
  expect((await decryptFiscalTicket(encrypted,context,await keys.read(oldId),oldId)).token).toBe('SYNTHETIC_TOKEN')
  await expect(crypto.subtle.exportKey('raw',old.key)).rejects.toThrow()
  delete secrets['ARCA_HOMO_TA_KEY_'+oldId.replace(/-/g,'').toUpperCase()]
  await expect(keys.read(oldId)).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
})
it.each(['id','bytes','ausente','proyecto'])('keyring rechaza %s sin fallback',async mode=>{
  const id=crypto.randomUUID(),secrets:Record<string,string>={SUPABASE_URL:fixture.secrets.SUPABASE_URL,ARCA_HOMO_TA_ACTIVE_KEY_ID:id}
  if(mode==='id')secrets.ARCA_HOMO_TA_ACTIVE_KEY_ID='SUPABASE_SECRET_KEY'
  if(mode==='bytes')secrets['ARCA_HOMO_TA_KEY_'+id.replace(/-/g,'').toUpperCase()]=btoa('too-short')
  if(mode==='proyecto')secrets.SUPABASE_URL='https://lllkjnqpltnwvxzphncr.supabase.co'
  await expect(createPrivateFiscalTicketKeys(name=>secrets[name]).active()).rejects.toThrow('FISCAL_CUSTODIA_NO_DISPONIBLE')
})
