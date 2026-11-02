// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { PLAN_HASH, RestoreJournal, inspectRestoreJournal } from '../../scripts/backup/restore-acceptance-engine.mjs'
import { buildRestoreExecutionPackage, RESTORE_CAPTURE_SCOPE } from '../../scripts/backup/restore-execution-package.mjs'

let folder:string
beforeEach(()=>{folder=mkdtempSync(join(tmpdir(),'kiosko-restore-acl-'))})
afterEach(()=>{if(dirname(folder)!==resolve(tmpdir())||!basename(folder).startsWith('kiosko-restore-acl-'))throw Error('Unsafe cleanup');rmSync(folder,{recursive:true,force:true})})
const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'"
const helper=resolve('scripts/backup/restore-private-windows.ps1')
it.skipIf(process.platform!=='win32').each(['private','journal','baseline','broad-root','broad-leaf','broad-file','users-write','inherited-leaf','outside','nested','unknown','directory','duplicate','traversal','junction'])('actual Windows private directory %s',mode=>{
 const setup=`$ErrorActionPreference='Stop';. ${quote(helper)};$root=${quote(folder)};$id=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($id);$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($id,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath $root -AclObject $acl;$run=New-RestoreProtectedDirectory $root 'run';`
 let change=''
 if(mode==='baseline')change="[IO.File]::WriteAllText((Join-Path $run 'preservation-baseline.json'),'LOCAL SYNTHETIC');"
 if(['journal','broad-file'].includes(mode))change="[IO.File]::WriteAllText((Join-Path $run 'journal.jsonl'),'LOCAL SYNTHETIC');"
 if(mode.startsWith('broad-')){
  const target=mode==='broad-root'?'$root':mode==='broad-leaf'?'$run':"(Join-Path $run 'journal.jsonl')"
  change+=`$acl=Get-Acl -LiteralPath ${target};$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath ${target} -AclObject $acl;`
 }
 if(mode==='users-write'){
  change+="$acl=Get-Acl -LiteralPath $run;$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),[Security.AccessControl.FileSystemRights]::Write,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath $run -AclObject $acl;"
 }
 if(mode==='inherited-leaf')change="$acl=Get-Acl -LiteralPath $run;$acl.SetAccessRuleProtection($false,$true);Set-Acl -LiteralPath $run -AclObject $acl;"
 if(mode==='outside')change='$run=$root;'
 if(mode==='nested')change="$run=New-RestoreProtectedDirectory $run 'nested';"
 if(mode==='unknown')change="[IO.File]::WriteAllText((Join-Path $run 'unexpected.txt'),'LOCAL SYNTHETIC');"
 if(mode==='directory')change="$null=[IO.Directory]::CreateDirectory((Join-Path $run 'journal.jsonl'));"
 if(mode==='duplicate')change="$run=New-RestoreProtectedDirectory $root 'run';"
 if(mode==='traversal')change="$run=New-RestoreProtectedDirectory $root '../outside';"
 if(mode==='junction')change="$target=New-RestoreProtectedDirectory $root 'target';$null=New-Item -ItemType Junction -Path (Join-Path $root 'link') -Target $target;$run=Join-Path $root 'link';"
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',setup+`try{${change}Assert-RestorePrivateRun $run $root;[Console]::Out.Write('PRIVATE_CHECK_PASS')}catch{[Console]::Out.Write('PRIVATE_CHECK_REJECTED')}`],{encoding:'utf8',timeout:20000,windowsHide:true})
 expect(result.status,result.stderr).toBe(0)
 expect(result.stdout).toBe(['private','journal','baseline'].includes(mode)?'PRIVATE_CHECK_PASS':'PRIVATE_CHECK_REJECTED')
 expect(result.stderr).toBe('')
},25000)

it.skipIf(process.platform!=='win32').each(['private','everyone','users-write','partial'])('actual Windows backup ACL verifier %s',mode=>{
 const setup=`$ErrorActionPreference='Stop';. ${quote(helper)};$p=${quote(join(folder,'KioskoPOS-Privado'))};$null=[IO.Directory]::CreateDirectory($p);$id=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($id);$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($id,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath $p -AclObject $acl;$b=New-RestoreProtectedDirectory $p 'Backups';$s=New-RestoreProtectedDirectory $b 'Staging';$run=New-RestoreProtectedDirectory $s 'pre-restore-acceptance-synthetic12345';`
 let change="[IO.File]::WriteAllText((Join-Path $run 'synthetic.dump'),'SYNTHETIC');"
 if(mode==='everyone')change="[IO.File]::WriteAllText((Join-Path $run 'synthetic.dump'),'SYNTHETIC');$null=icacls $run /grant '*S-1-1-0:(R)';"
 if(mode==='users-write')change+="$acl=Get-Acl -LiteralPath (Join-Path $run 'synthetic.dump');$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-32-545'),[Security.AccessControl.FileSystemRights]::Write,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath (Join-Path $run 'synthetic.dump') -AclObject $acl;"
 if(mode==='partial')change+="[IO.File]::WriteAllText((Join-Path $run 'incomplete.partial'),'SYNTHETIC');"
 const prep=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',setup+change],{encoding:'utf8',timeout:20000,windowsHide:true})
 expect(prep.status,prep.stderr).toBe(0)
 const backupDir=join(folder,'KioskoPOS-Privado','Backups','Staging','pre-restore-acceptance-synthetic12345')
 const res=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',resolve('scripts/backup/verify-restore-backup-private.ps1'),'-Path',backupDir],{env:{...process.env,USERPROFILE:folder},encoding:'utf8',timeout:20000,windowsHide:true})
 expect(res.stderr).toBe('')
 expect(res.status).toBe(mode==='private'?0:1)
 expect(res.stdout).toBe(mode==='private'?'RESTORE_BACKUP_PRIVATE=true':'RESTORE_BACKUP_PRIVATE=false')
},25000)

it.skipIf(process.platform!=='win32').each(['prepare-only','missing-go','redirected-stdin'])('execution wrapper %s stops before reading credentials',mode=>{
 const now=Date.now()
 const pkg=buildRestoreExecutionPackage({
  scope:RESTORE_CAPTURE_SCOPE,
  actors:{OWNER:'11111111-1111-4111-8111-111111111111',CASHIER:'22222222-2222-4222-8222-222222222222'},
  startsAt:new Date(now-60000).toISOString(),
  endsAt:new Date(now+600000).toISOString(),
  baselineHash:null,
  backup:null
 })
 const pkgFile=join(folder,'packet.json')
 writeFileSync(pkgFile,JSON.stringify(pkg))
 const args=['-NoProfile','-NonInteractive','-File',resolve('scripts/ejecutar-ensayo-restauracion-privado.ps1'),'-Paquete',pkgFile]
 if(mode!=='prepare-only'){
  args.push('-Ejecutar','-Rol','CAPTURE','-HashRevisado',pkg.packageHash,'-DirectorioPrivado',join(folder,'KioskoPOS-Privado','Restauracion-Staging','run'))
  if(mode==='redirected-stdin')args.push('-GoConfirmado','-OperadorExclusivo')
 }
 const res=spawnSync('pwsh',args,{env:{...process.env,USERPROFILE:folder},input:'SYNTHETIC_REDIRECTED_STDIN\n',encoding:'utf8',timeout:30000,windowsHide:true})
 expect(res.stderr).toBe('')
 if(mode==='prepare-only'){
  expect(res.status).toBe(0)
  expect(res.stdout.trim()).toBe('RESTORE_PACKAGE_PREPARED scope=PR07_READ_ONLY_PRESERVATION_CAPTURE execution=false')
 }else{
  expect(res.status).toBe(1)
  expect(res.stdout.trim()).toBe('RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY wrapper=PACKAGE retry=false')
 }
},35000)

it.skipIf(process.platform!=='win32').each(['prepare','wrong-hash','broad-parent'])('actual isolated Windows wrapper %s',mode=>{
 const privateRoot=join(folder,'KioskoPOS-Privado')
 const setup=`$ErrorActionPreference='Stop';$p=${quote(privateRoot)};$null=[IO.Directory]::CreateDirectory($p);$id=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($id);$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($id,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow));${mode==='broad-parent'?"$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow));":''}Set-Acl -LiteralPath $p -AclObject $acl;`
 const ready=spawnSync('pwsh',['-NoProfile','-NonInteractive','-Command',setup],{encoding:'utf8',timeout:15000,windowsHide:true})
 expect(ready.status,ready.stderr).toBe(0)
 const result=spawnSync('pwsh',['-NoProfile','-NonInteractive','-File',resolve('scripts/preparar-ensayo-restauracion-privado.ps1'),'-OwnerAuthId','11111111-1111-4111-8111-111111111111','-CashierAuthId','22222222-2222-4222-8222-222222222222','-HashRevisado',mode==='wrong-hash'?'0'.repeat(64):PLAN_HASH],{env:{...process.env,USERPROFILE:folder},encoding:'utf8',timeout:45000,windowsHide:true})
 expect(result.stderr).toBe('')
 if(mode==='prepare'){
  expect(result.status,result.stdout).toBe(0)
  expect(result.stdout).toContain('RESTORE_PRIVATE_PREPARATION_PASS journal=true auth=false network=false mutation=false')
  const root=join(privateRoot,'Restauracion-Staging'),runs=readdirSync(root)
  expect(runs).toHaveLength(1)
  const file=join(root,runs[0],'journal.jsonl')
  expect(inspectRestoreJournal(new RestoreJournal(file))).toMatchObject({cursor:0,pending:null,complete:false,stopped:false})
  expect(readFileSync(file,'utf8')).not.toMatch(/password|Bearer|service_role/)
 }else{
  expect(result.status).toBe(1)
  expect(result.stdout.trim()).toBe('RESTORE_PRIVATE_PREPARATION_NOT_CONFIRMED stage=ENTRY retry=false')
  expect(readdirSync(privateRoot)).toHaveLength(0)
 }
},60000)

it.skipIf(process.platform!=='win32').each([
 { name:'case1-cashier-wrong-domain', role:'CASHIER', email:'prueba2@gmail.com', preflightMode:'none', expectedStatus:1, expectedOutput:'RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY wrapper=EMAIL_GUARD retry=false', expectedPrompts:1, expectedEmail:null, expectedPreflight:false, expectedChild:false },
 { name:'case2-cashier-auth-reject', role:'CASHIER', email:'prueba2@example.test', preflightMode:'reject', expectedStatus:1, expectedOutput:'RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY preflight=AUTH_HTTP retry=false', expectedPrompts:2, expectedEmail:'prueba2@example.test', expectedPreflight:true, expectedChild:false },
 { name:'case3-cashier-logout-fail', role:'CASHIER', email:'prueba2@example.test', preflightMode:'logout-fail', expectedStatus:1, expectedOutput:'RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY preflight=LOGOUT_LOCAL retry=false', expectedPrompts:2, expectedEmail:'prueba2@example.test', expectedPreflight:true, expectedChild:false },
 { name:'case4-cashier-preflight-pass-whitespace', role:'CASHIER', email:' prueba2@example.test ', preflightMode:'pass', expectedStatus:0, expectedOutput:'BEFORE_CHILD', expectedPrompts:2, expectedEmail:'prueba2@example.test', expectedPreflight:true, expectedChild:true },
 { name:'case5-cashier-preflight-pass-uppercase', role:'CASHIER', email:'PRUEBA2@EXAMPLE.TEST', preflightMode:'pass', expectedStatus:0, expectedOutput:'BEFORE_CHILD', expectedPrompts:2, expectedEmail:'prueba2@example.test', expectedPreflight:true, expectedChild:true },
 { name:'case6-owner-unchanged', role:'OWNER', email:'dueno@example.test', preflightMode:'none', expectedStatus:0, expectedOutput:'BEFORE_CHILD', expectedPrompts:2, expectedEmail:'dueno@example.test', expectedPreflight:false, expectedChild:true },
 { name:'case7-cashier-preflight-unexpected-stdout', role:'CASHIER', email:'prueba2@example.test', preflightMode:'unknown', expectedStatus:1, expectedOutput:'RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY wrapper=PREFLIGHT_CHILD_OUTPUT retry=false', expectedPrompts:2, expectedEmail:'prueba2@example.test', expectedPreflight:true, expectedChild:false },
 { name:'case8-cashier-preflight-public-key', role:'CASHIER', email:'prueba2@example.test', preflightMode:'public-key', expectedStatus:1, expectedOutput:'RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY preflight=PUBLIC_KEY retry=false', expectedPrompts:2, expectedEmail:'prueba2@example.test', expectedPreflight:true, expectedChild:false },
 { name:'case9-cashier-preflight-start-fail', role:'CASHIER', email:'prueba2@example.test', preflightMode:'start-fail', expectedStatus:1, expectedOutput:'RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY wrapper=PREFLIGHT_CHILD_START retry=false', expectedPrompts:2, expectedEmail:'prueba2@example.test', expectedPreflight:false, expectedChild:false },
])('execution wrapper cashier preflight and email guard $name', ({ role, email, preflightMode, expectedStatus, expectedOutput, expectedPrompts, expectedEmail, expectedPreflight, expectedChild })=>{
 const scriptPath = resolve('scripts/ejecutar-ensayo-restauracion-privado.ps1')
 const lockPath = join(folder, 'journal.jsonl.phase.lock')
 writeFileSync(lockPath, 'LOCK_SYNTHETIC')

 const mockScriptsDir = join(folder, 'scripts')
 const mockBackupDir = join(mockScriptsDir, 'backup')
 mkdirSync(mockBackupDir, { recursive: true })
 const markerFile = join(folder, 'preflight.marker')

 const mockPreflightCode = `
import fs from 'node:fs'
fs.writeFileSync(${JSON.stringify(markerFile)}, 'PREFLIGHT_EXECUTED')
let text = ''
for await (const chunk of process.stdin) { text += chunk }
const data = JSON.parse(text)
if (data.email !== 'prueba2@example.test' || !data.password || !data.publicKey) {
  console.log('CASHIER_SESSION_PREFLIGHT = FAIL stage=INPUT')
  process.exit(1)
}
if (${JSON.stringify(preflightMode)} === 'pass') {
  console.log('CASHIER_SESSION_PREFLIGHT = PASS')
  process.exit(0)
} else if (${JSON.stringify(preflightMode)} === 'reject') {
  console.log('CASHIER_SESSION_PREFLIGHT = FAIL stage=AUTH_HTTP')
  process.exit(1)
} else if (${JSON.stringify(preflightMode)} === 'public-key') {
  console.log('CASHIER_SESSION_PREFLIGHT = FAIL stage=PUBLIC_KEY')
  process.exit(1)
} else if (${JSON.stringify(preflightMode)} === 'logout-fail') {
  console.log('CASHIER_SESSION_PREFLIGHT = FAIL stage=LOGOUT_LOCAL')
  process.exit(1)
} else {
  process.exit(1)
}
`
 writeFileSync(join(mockBackupDir, 'restore-cashier-preflight.mjs'), mockPreflightCode)

 const runnerScript = `
  \$ErrorActionPreference = 'Stop'
  \$ast = [System.Management.Automation.Language.Parser]::ParseFile(${quote(scriptPath)}, [ref]\$null, [ref]\$null)
  \$targetAst = \$ast.Find({ param(\$n) \$n -is [System.Management.Automation.Language.IfStatementAst] -and \$n.Extent.Text -like '*\$Rol -cne ''CAPTURE''*' }, \$true)
  if (-not \$targetAst) { throw 'Target credential block not found in AST' }
  \$global:secretPrompts = 0
  \$global:childStarted = \$false
  \$global:networkCalls = 0
  \$secrets = @{}
  \$Rol = ${quote(role)}
  \$scriptRoot = ${quote(mockScriptsDir)}
  \$node = if (${JSON.stringify(preflightMode)} -eq 'start-fail') { 'C:\\nonexistent\\missing-node.exe' } else { ${quote(process.execPath)} }
  function Read-RestoreSecret(\$Prompt) {
   \$global:secretPrompts++
   return 'SYNTHETIC_SECRET'
  }
  function Read-Host(\$Prompt) {
   return ${quote(email)}
  }
  try {
   . ([ScriptBlock]::Create(\$targetAst.Extent.Text))
   \$global:childStarted = \$true
   Write-Output ('BEFORE_CHILD email=' + \$secrets.email + ' prompts=' + \$global:secretPrompts + ' child=' + \$global:childStarted + ' net=' + \$global:networkCalls)
   exit 0
  } catch {
   Write-Output ('CAUGHT ' + \$_.Exception.Message)
   exit 1
  }
 `
 const res = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', runnerScript], { encoding: 'utf8', timeout: 20000, windowsHide: true })
 expect(res.stderr).toBe('')
 expect(res.status).toBe(expectedStatus)
 if (expectedStatus === 1) {
  expect(res.stdout.trim()).toBe(expectedOutput)
 } else {
  expect(res.stdout).toContain(expectedOutput)
  expect(res.stdout).toContain('email=' + expectedEmail)
  expect(res.stdout).toContain('prompts=' + expectedPrompts)
  expect(res.stdout).toContain('child=' + (expectedChild ? 'True' : 'False'))
  expect(res.stdout).toContain('net=0')
  expect(res.stdout).not.toContain('CASHIER_SESSION_PREFLIGHT = PASS')
 }
 expect(res.stdout).not.toContain('SYNTHETIC_SECRET')
 expect(res.stderr).not.toContain('SYNTHETIC_SECRET')
 expect(readFileSync(lockPath, 'utf8')).toBe('LOCK_SYNTHETIC')
 expect(existsSync(markerFile)).toBe(expectedPreflight)
}, 25000)

it('ensures legacy generic entry output is not reachable in wrapper', () => {
 const content = readFileSync(resolve('scripts/ejecutar-ensayo-restauracion-privado.ps1'), 'utf8')
 const genericEntryRegex = /RESTORE_OPERATOR_NOT_CONFIRMED\s+stage=ENTRY\s+retry=false/
 const legacyGenericEntryOutputReachable = genericEntryRegex.test(content)
 expect(legacyGenericEntryOutputReachable).toBe(false)
})
