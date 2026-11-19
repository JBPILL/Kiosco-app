// @vitest-environment node
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve, join, dirname, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { beforeAll, expect, it } from 'vitest'
import { syntheticEncryptedCustody } from './fixtures/fiscalEncryptedCustody'
import { createPrivateFiscalTicketKeys } from '../../supabase/functions/_shared/fiscalPrivateCustody'
import { createCustodyProvisionPlan, custodyPlanHash } from '../../scripts/fiscal-custody-plan.mjs'
import { preparePrivateCustodyDelivery } from '../../scripts/arca/private-custody-delivery.mjs'
let fixture:Awaited<ReturnType<typeof syntheticEncryptedCustody>>
beforeAll(async()=>{fixture=await syntheticEncryptedCustody(200000,'SYNTHETIC_only_á_🔐_password_2026')},30000)
function cleanup(root:string):void{
 const target=resolve(root)
 if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('kiosko-private-delivery-test-'))throw Error('Unexpected synthetic cleanup target')
 rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}
const quote=(value:string)=>"'"+value.replaceAll("'","''")+"'"
async function setup(mode:string,action:(paths:{certificatePath:string;encryptedKeyPath:string;protectionPath:string},root:string)=>Promise<void>):Promise<void>{
 const root=mkdtempSync(join(tmpdir(),'kiosko-private-delivery-test-'))
 try{
  const paths={certificatePath:join(root,'public.crt'),encryptedKeyPath:join(root,'encrypted.pem'),protectionPath:join(root,'phrase.dpapi')}
  writeFileSync(paths.certificatePath,fixture.secrets[fixture.prefix+'_CERT_PEM'])
  writeFileSync(paths.encryptedKeyPath,fixture.secrets[fixture.prefix+'_KEY_PEM'])
  const runner=join(root,'prepare-synthetic.ps1')
  writeFileSync(runner,`
$ErrorActionPreference='Stop'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$phrase=ConvertTo-SecureString ${quote(fixture.secrets[fixture.prefix+'_PASSWORD'])} -AsPlainText -Force
try{$phrase | ConvertFrom-SecureString | Set-Content -LiteralPath ${quote(paths.protectionPath)}}finally{$phrase.Dispose()}
foreach($path in @(${quote(paths.encryptedKeyPath)},${quote(paths.protectionPath)})){
 $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))
 if(${quote(mode)} -eq 'bad-acl'){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),'Read','Allow'))}
 Set-Acl -LiteralPath $path -AclObject $acl
}
`)
  const generated=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',runner],{encoding:'utf8',timeout:30000})
  expect(generated.status,'Synthetic setup failed').toBe(0)
  if(mode==='invalid-dpapi')writeFileSync(paths.protectionPath,'SYNTHETIC_BAD_DPAPI')
  const before=Object.values(paths).map(path=>createHash('sha256').update(readFileSync(path)).digest('hex'))
  await action(paths,root)
  expect(Object.values(paths).map(path=>createHash('sha256').update(readFileSync(path)).digest('hex')).every((hash,index)=>hash===before[index])).toBe(true)
 }finally{cleanup(root)}
}
function plan(){return createCustodyProvisionPlan({certificateSha256:fixture.binding.certificado_sha256,certificateCuit:fixture.binding.cuit_emisor})}
it.skipIf(process.platform!=='win32')('private Windows pipe copies only six reviewed values and verifies metadata without disclosing digests',async()=>{
 await setup('ok',async paths=>{
  const proposal=plan(),baseline=[{name:'ARCA_HOMO_BACKEND_ENABLED',digest:createHash('sha256').update('false').digest('hex')}]
  const delivery=await preparePrivateCustodyDelivery({plan:proposal,approvedHash:custodyPlanHash(proposal),baseline,paths})
  try{
   const serialized=JSON.stringify(delivery)
   expect(serialized).not.toContain('-----BEGIN');expect(serialized).not.toContain(fixture.secrets[fixture.prefix+'_PASSWORD'])
   expect(delivery.value(proposal.secretNames[0])).toBe('1')
   expect(delivery.value(proposal.secretNames[1])===fixture.secrets[fixture.prefix+'_CERT_PEM']).toBe(true)
   expect(delivery.value(proposal.secretNames[2])===fixture.secrets[fixture.prefix+'_KEY_PEM']).toBe(true)
   expect(delivery.value(proposal.secretNames[3])===fixture.secrets[fixture.prefix+'_PASSWORD']).toBe(true)
   const key=delivery.value(proposal.secretNames[4]);expect(Buffer.from(key,'base64').byteLength).toBe(32)
   const privateKeys=createPrivateFiscalTicketKeys(name=>name==='SUPABASE_URL'?'https://acoyfwwmhaeruciyedri.supabase.co':delivery.names.includes(name)?delivery.value(name):undefined)
   const active=await privateKeys.active();expect(active.id).toBe(proposal.taKeyId);expect(active.key.extractable).toBe(false)
   const inventory=[...baseline,...delivery.names.map((name:string)=>({name,digest:createHash('sha256').update(delivery.value(name)).digest('hex')}))]
   expect(delivery.verifyInventory(inventory)).toEqual({presence:'6/6',newDigestsMatch:true,existingUnchanged:true,fiscalFlagsClosed:true,functionalCustodyProven:false})
   expect(()=>delivery.value('SUPABASE_SECRET_KEYS')).toThrow()
   expect(()=>delivery.verifyInventory(inventory.slice(0,-1))).toThrow()
   expect(()=>delivery.value(proposal.secretNames[0])).toThrow()
   expect(()=>delivery.verifyInventory(inventory)).toThrow()
  }finally{delivery.dispose()}
  expect(()=>delivery.value(proposal.secretNames[0])).toThrow()
 })
},40000)
it.skipIf(process.platform!=='win32').each(['changed-private','changed-existing','open-flag'])('metadata failure %s permanently disposes the delivery',async mode=>{
 await setup('ok',async paths=>{
  const proposal=plan(),baseline=[{name:'ARCA_HOMO_BACKEND_ENABLED',digest:createHash('sha256').update('false').digest('hex')},{name:'EXISTING_SETTING',digest:'a'.repeat(64)}]
  const delivery=await preparePrivateCustodyDelivery({plan:proposal,approvedHash:custodyPlanHash(proposal),baseline,paths})
  try{
   const good=[...baseline,...delivery.names.map(name=>({name,digest:createHash('sha256').update(delivery.value(name)).digest('hex')}))]
   const name=mode==='changed-private'?proposal.secretNames[3]:mode==='changed-existing'?'EXISTING_SETTING':'ARCA_HOMO_BACKEND_ENABLED'
   const bad=good.map(row=>row.name===name?{...row,digest:'0'.repeat(64)}:row)
   expect(()=>delivery.verifyInventory(bad)).toThrow()
   expect(()=>delivery.value(proposal.secretNames[3])).toThrow()
   expect(()=>delivery.verifyInventory(good)).toThrow()
  }finally{delivery.dispose()}
 })
},40000)
it.skipIf(process.platform!=='win32').each([['bad-acl','METADATA'],['wrong-pin','PUBLIC_PIN'],['invalid-dpapi','ORIGINAL_COPY']] as const)('rejects %s without private exception content',async (mode,stage)=>{
 await setup(mode,async paths=>{
  const proposal=mode==='wrong-pin'?createCustodyProvisionPlan({certificateSha256:'0'.repeat(64),certificateCuit:fixture.binding.cuit_emisor}):plan()
  await expect(preparePrivateCustodyDelivery({plan:proposal,approvedHash:custodyPlanHash(proposal),baseline:[],paths})).rejects.toThrow('FISCAL_PRIVATE_DELIVERY_NOT_CONFIRMED:'+stage)
 })
},40000)
it('rejects a collision or unreviewed plan before touching missing private paths',async()=>{
 const proposal=createCustodyProvisionPlan({certificateSha256:'a'.repeat(64),certificateCuit:'20123456786'})
 const paths={certificatePath:'MISSING_PUBLIC',encryptedKeyPath:'MISSING_PRIVATE',protectionPath:'MISSING_DPAPI'}
 await expect(preparePrivateCustodyDelivery({plan:proposal,approvedHash:'0'.repeat(64),baseline:[],paths})).rejects.toThrow('FISCAL_PRIVATE_DELIVERY_NOT_CONFIRMED')
 await expect(preparePrivateCustodyDelivery({plan:proposal,approvedHash:custodyPlanHash(proposal),baseline:[{name:proposal.secretNames[0],digest:'0'.repeat(64)}],paths})).rejects.toThrow('FISCAL_PRIVATE_DELIVERY_NOT_CONFIRMED')
})
it('reader never calls RSA/CMS compatibility checks again',()=>{
 const source=readFileSync('scripts/arca/read-custody-provision-pipe.ps1','utf8')
 expect(source).toContain('-Preparar')
 expect(source).not.toMatch(/-Comprobar|prepareWsaaRequest|SignTra|ImportEncryptedPkcs8|check-private-custody-local/)
})
it.skipIf(process.platform!=='win32')('unguarded pipe invocation returns no private stdout before input metadata',()=>{
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',resolve('scripts/arca/read-custody-provision-pipe.ps1'),
  '-Certificado','MISSING','-ClaveCifrada','MISSING','-ProteccionDpapi','MISSING','-CertificadoSha256','a'.repeat(64),
  '-CuitCertificado','20123456786','-IdCredencial',crypto.randomUUID(),'-IdClaveTa',crypto.randomUUID()],
 {encoding:'utf8',timeout:30000,env:{...process.env,KIOSKOPOS_PRIVATE_CHANNEL_V1:''}})
 expect(result.status).toBe(1);expect(result.stdout).toBe('');expect(result.stderr).toBe('FISCAL_PRIVATE_CHANNEL_NOT_CONFIRMED:CHANNEL')
},30000)
