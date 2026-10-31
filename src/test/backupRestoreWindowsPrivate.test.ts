// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { PLAN_HASH, RestoreJournal, inspectRestoreJournal } from '../../scripts/backup/restore-acceptance-engine.mjs'
import { buildRestoreExecutionPackage, RESTORE_CAPTURE_SCOPE } from '../../scripts/backup/restore-execution-package.mjs'
import { writeFileSync } from 'node:fs'
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
  expect(res.stdout.trim()).toBe('RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY retry=false')
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
