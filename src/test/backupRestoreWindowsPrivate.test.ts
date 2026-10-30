// @vitest-environment node
import { afterEach, beforeEach, expect, it } from 'vitest'
import { mkdtempSync, rmSync, readdirSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { spawnSync } from 'node:child_process'
import { PLAN_HASH, RestoreJournal, inspectRestoreJournal } from '../../scripts/backup/restore-acceptance-engine.mjs'
let folder:string
beforeEach(()=>{folder=mkdtempSync(join(tmpdir(),'kiosko-restore-acl-'))})
afterEach(()=>{if(dirname(folder)!==resolve(tmpdir())||!basename(folder).startsWith('kiosko-restore-acl-'))throw Error('Unsafe cleanup');rmSync(folder,{recursive:true,force:true})})
const quote=(s:string)=>"'"+s.replaceAll("'","''")+"'"
const helper=resolve('scripts/backup/restore-private-windows.ps1')
it.skipIf(process.platform!=='win32').each(['private','journal','broad-root','broad-leaf','broad-file','inherited-leaf','outside','nested','unknown','directory','duplicate','traversal','junction'])('actual Windows private directory %s',mode=>{
 const setup=`$ErrorActionPreference='Stop';. ${quote(helper)};$root=${quote(folder)};$id=[Security.Principal.WindowsIdentity]::GetCurrent().User;$acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($id);$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($id,[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath $root -AclObject $acl;$run=New-RestoreProtectedDirectory $root 'run';`
 let change=''
 if(['journal','broad-file'].includes(mode))change="[IO.File]::WriteAllText((Join-Path $run 'journal.jsonl'),'LOCAL SYNTHETIC');"
 if(mode.startsWith('broad-')){
  const target=mode==='broad-root'?'$root':mode==='broad-leaf'?'$run':"(Join-Path $run 'journal.jsonl')"
  change+=`$acl=Get-Acl -LiteralPath ${target};$acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-1-0'),[Security.AccessControl.FileSystemRights]::Read,[Security.AccessControl.AccessControlType]::Allow));Set-Acl -LiteralPath ${target} -AclObject $acl;`
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
 expect(result.stdout).toBe(['private','journal'].includes(mode)?'PRIVATE_CHECK_PASS':'PRIVATE_CHECK_REJECTED')
 expect(result.stderr).toBe('')
},25000)

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
