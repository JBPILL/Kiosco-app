#requires -Version 7.4
param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference='Stop'
try {
 if(-not $IsWindows){throw 'Windows required'}
 $allowed=[IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'KioskoPOS-Privado/ARCA-Ventanas'))+[IO.Path]::DirectorySeparatorChar
 $directory=[IO.Path]::GetFullPath($Path)
 if(-not $directory.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase)){throw 'Scope'}
 $current=$directory
 $profileRoot=[IO.Path]::GetFullPath($env:USERPROFILE)
 while($current -and $current.Length -ge $profileRoot.Length){
  $item=Get-Item -LiteralPath $current -Force
  if(-not $item.PSIsContainer -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Link'}
  $current=[IO.Path]::GetDirectoryName($current)
 }
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl=Get-Acl -LiteralPath $directory
 if(-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $identity.Value){throw 'Owner'}
 $sids=@($identity.Value,'S-1-5-18','S-1-5-32-544')
 $own=$false
 foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($rule.IdentityReference.Value -cnotin $sids -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){throw 'ACL'}
  if($rule.IdentityReference.Value -ceq $identity.Value -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl){$own=$true}
 }
 if(-not $own){throw 'Access'}
 [Console]::Out.Write('WINDOW_DIRECTORY_PRIVATE=true')
 exit 0
}catch{[Console]::Out.Write('WINDOW_DIRECTORY_PRIVATE=false');exit 1}
