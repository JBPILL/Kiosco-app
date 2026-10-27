// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { resolve, basename, dirname, join } from 'node:path'
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { beforeAll, expect, it } from 'vitest'
import { syntheticEncryptedCustody } from './fixtures/fiscalEncryptedCustody'
import { normalizeFiscalCuit } from '../../supabase/functions/_shared/fiscalReconciliation'

interface LocalCustodyInput { certificate:string;encryptedKey:string;password:string;certificateSha256:string;cuit:string }
let input:LocalCustodyInput
let mismatchedEncryptedKey:string
beforeAll(async()=>{
 const fixture=await syntheticEncryptedCustody(200000,'SYNTHETIC_only_á_🔐_password_2026')
 input={certificate:fixture.secrets[fixture.prefix+'_CERT_PEM'],encryptedKey:fixture.secrets[fixture.prefix+'_KEY_PEM'],
  password:fixture.secrets[fixture.prefix+'_PASSWORD'],certificateSha256:fixture.binding.certificado_sha256,cuit:fixture.binding.cuit_emisor}
 const other=await syntheticEncryptedCustody(200000,input.password)
 expect(other.binding.certificado_sha256).not.toBe(input.certificateSha256)
 mismatchedEncryptedKey=other.secrets[other.prefix+'_KEY_PEM']
 expect(normalizeFiscalCuit('20999999999')).toBe('20999999999')
},30000)
function run(raw:string){
 const result=spawnSync(process.execPath,[resolve('scripts/arca/check-private-custody-local.mjs')],{input:raw,encoding:'utf8',timeout:30000})
 const output=result.stdout+result.stderr
 expect(output).not.toContain('-----BEGIN')
 expect(output).not.toContain(input.password)
 expect(output).not.toContain(input.certificateSha256)
 expect(output).not.toContain(input.cuit)
 return {code:result.status,output,report:JSON.parse(result.stdout.trim()) as Record<string,unknown>}
}
it('uses deployed custody and CMS code via native Node24 without exporting or networking',()=>{
 const result=run(JSON.stringify(input))
 expect(result.code,result.output).toBe(0)
 expect(result.report).toEqual({status:'CUSTODY_LOCAL_PASS',nonexportable:true,cmsVerified:true,subjectCuitMatches:true,networkAttempts:0,secretsProvisioned:false})
},30000)
it.each([
 ['pin',(value:LocalCustodyInput)=>({...value,certificateSha256:'0'.repeat(64)})],
 ['password',(value:LocalCustodyInput)=>({...value,password:'SYNTHETIC_WRONG_PASSWORD'})],
 ['short-password',(value:LocalCustodyInput)=>({...value,password:'short'})],
 ['subject',(value:LocalCustodyInput)=>({...value,cuit:'20999999999'})],
 ['unencrypted-key',(value:LocalCustodyInput)=>({...value,encryptedKey:value.encryptedKey.replaceAll('ENCRYPTED PRIVATE KEY','PRIVATE KEY')})],
 ['extra',(value:LocalCustodyInput)=>({...value,endpoint:'https://example.invalid'})],
 ['type',(value:LocalCustodyInput)=>({...value,password:42})],
 ['mismatched-key',(value:LocalCustodyInput)=>({...value,encryptedKey:mismatchedEncryptedKey})],
] as const)('rejects %s without private diagnostics',(_name,change)=>{
 const result=run(JSON.stringify(change(input)))
 expect(result.code,result.output).toBe(1)
 expect(result.report).toMatchObject({status:'CUSTODY_LOCAL_FAIL',networkAttempts:0,secretsProvisioned:false})
},30000)

function cleanupRoot(root:string):void {
 const target=resolve(root)
 if(dirname(target)!==resolve(tmpdir())||!basename(target).startsWith('kiosko-local-custody-test-'))throw Error('Unexpected synthetic cleanup target')
 rmSync(target,{recursive:true,force:true,maxRetries:5,retryDelay:100})
}
function runWindows(mode:string){
 const root=mkdtempSync(join(tmpdir(),'kiosko-local-custody-test-'))
 const quote=(value:string)=>"'"+value.replaceAll("'","''")+"'"
 try{
  const certificate=join(root,'public.crt'),key=join(root,'encrypted.pem'),protection=join(root,'phrase.dpapi'),runner=join(root,'runner.ps1')
  writeFileSync(certificate,input.certificate);writeFileSync(key,input.encryptedKey)
  const phrase=mode==='wrong-password'?'SYNTHETIC_WRONG_PASSWORD':mode==='short-password'?'short':input.password
  writeFileSync(runner,`
$ErrorActionPreference='Stop'
$sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
$phrase=ConvertTo-SecureString ${quote(phrase)} -AsPlainText -Force
try{$phrase | ConvertFrom-SecureString | Set-Content -LiteralPath ${quote(protection)}}finally{$phrase.Dispose()}
if(${quote(mode)} -eq 'prepare'){[IO.File]::WriteAllText(${quote(protection)},'SYNTHETIC_INVALID_DPAPI_NOT_READ')}
foreach($path in @(${quote(key)},${quote(protection)})){
 $acl=[Security.AccessControl.FileSecurity]::new();$acl.SetOwner($sid);$acl.SetAccessRuleProtection($true,$false)
 $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($sid,'FullControl','Allow'))
 if(${quote(mode)} -eq 'bad-acl'){$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),'Read','Allow'))}
 Set-Acl -LiteralPath $path -AclObject $acl
}
if(${quote(mode)} -eq 'node-options'){$env:NODE_OPTIONS='--no-warnings'}
$protectedHash=(Get-FileHash -LiteralPath ${quote(protection)} -Algorithm SHA256).Hash
& ${quote(resolve('scripts/comprobar-custodia-arca-local.ps1'))} -Certificado ${quote(certificate)} -ClaveCifrada ${quote(mode==='repo-key'?resolve('scripts/arca/check-private-custody-local.mjs'):key)} -ProteccionDpapi ${quote(protection)} -CertificadoSha256 ${quote(mode==='wrong-pin'?'0'.repeat(64):input.certificateSha256)} -CuitCertificado ${quote(input.cuit)} ${mode==='prepare'?'-Preparar':'-Comprobar'}
$resultCode=$LASTEXITCODE
if((Get-FileHash -LiteralPath ${quote(protection)} -Algorithm SHA256).Hash -cne $protectedHash){throw 'SYNTHETIC_INPUT_CHANGED'}
exit $resultCode
`)
  const before=readFileSync(key,'utf8')
  const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',runner],{encoding:'utf8',timeout:40000,env:{...process.env,NODE_OPTIONS:'',NODE_PATH:''}})
  expect(readFileSync(key,'utf8')).toBe(before)
  expect(readFileSync(certificate,'utf8')).toBe(input.certificate)
  const output=result.stdout+result.stderr
  expect(output).not.toContain('-----BEGIN')
  expect(output).not.toContain(input.password)
  expect(output).not.toContain(input.certificateSha256)
  expect(output).not.toContain(input.cuit)
  return {status:result.status,output}
 }finally{cleanupRoot(root)}
}
it.skipIf(process.platform!=='win32')('Windows preflight does not decrypt invalid DPAPI',()=>{
 const result=runWindows('prepare');expect(result.status,result.output).toBe(0);expect(result.output).toContain('CUSTODY_LOCAL_READY')
},40000)
it.skipIf(process.platform!=='win32')('Windows DPAPI feeds Unicode custody only through stdin and leaves files unchanged',()=>{
 const result=runWindows('ok');expect(result.status,result.output).toBe(0);expect(result.output).toContain('CUSTODY_LOCAL_PASS nonexportable=true')
},40000)
it.skipIf(process.platform!=='win32').each([
 ['wrong-pin','CUSTODY'],['wrong-password','CUSTODY'],['short-password','PASSWORD_POLICY_NOT_MET'],
 ['bad-acl','PRIVATE_ACL'],['repo-key','INPUT_PATH'],['node-options','NODE_CONFIG'],
] as const)('Windows rejects %s without private output',(mode,stage)=>{
 const result=runWindows(mode);expect(result.status,result.output).toBe(1);expect(result.output).toContain('CUSTODY_LOCAL_NOT_CONFIRMED')
 expect(result.output).toContain('stage='+stage+'.')
},40000)
it.each(['null','[]','"SYNTHETIC_PRIVATE_SENTINEL"','{bad-json','x'.repeat(220001)])('rejects malformed bounded input without echo (%#)',raw=>{
 const result=run(raw)
 expect(result.code,result.output).toBe(1)
 expect(result.report).toMatchObject({status:'CUSTODY_LOCAL_FAIL',networkAttempts:0,secretsProvisioned:false})
 expect(result.output).not.toContain('SYNTHETIC_PRIVATE_SENTINEL')
},30000)
