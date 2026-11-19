#requires -Version 7.4
param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference='Stop'
try{
 . (Join-Path $PSScriptRoot 'restore-private-windows.ps1')
 $root=[IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'KioskoPOS-Privado/Backups/Staging'))
 $directory=[IO.Path]::GetFullPath($Path)
 if([IO.Path]::GetDirectoryName($directory) -ine $root -or [IO.Path]::GetFileName($directory) -cnotmatch '^pre-restore-acceptance-[a-zA-Z0-9-]{10,100}$'){throw 'Scope'}
 Assert-RestorePrivateAcl $directory $true
 $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 foreach($item in Get-ChildItem -LiteralPath $directory -Force){
  if($item.PSIsContainer -or $item.Name.EndsWith('.partial')){throw 'Incomplete'}
  Assert-RestoreNoReparse $item.FullName
  $acl=Get-Acl -LiteralPath $item.FullName
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $owner){throw 'Owner'}
  $own=$false
  foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
   if($rule.IdentityReference.Value -cnotin @($owner,'S-1-5-18','S-1-5-32-544') -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){throw 'ACL'}
   if($rule.IdentityReference.Value -ceq $owner -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl){$own=$true}
  }
  if(-not $own){throw 'Access'}
 }
 [Console]::Out.Write('RESTORE_BACKUP_PRIVATE=true');exit 0
}catch{[Console]::Out.Write('RESTORE_BACKUP_PRIVATE=false');exit 1}
