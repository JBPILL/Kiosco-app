#requires -Version 7.4
# Private filesystem helpers only. No entry point, credentials, network or restore.
function Assert-RestoreNoReparse([string]$Path) {
 $current=[IO.Path]::GetFullPath($Path)
 while($current){
  $item=Get-Item -LiteralPath $current -Force -ErrorAction Stop
  if(($item.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'RESTORE_PRIVATE_PATH_REJECTED'}
  $parent=[IO.Path]::GetDirectoryName($current)
  if($parent -eq $current){break};$current=$parent
 }
}
function Assert-RestorePrivateAcl([string]$Path,[bool]$Directory) {
 if(-not $IsWindows){throw 'RESTORE_PRIVATE_WINDOWS_REQUIRED'}
 Assert-RestoreNoReparse $Path
 $item=Get-Item -LiteralPath $Path -Force -ErrorAction Stop
 if([bool]$item.PSIsContainer -ne $Directory){throw 'RESTORE_PRIVATE_TYPE_REJECTED'}
 $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
 $acl=Get-Acl -LiteralPath $Path -ErrorAction Stop
 if(-not $acl.AreAccessRulesProtected -or $acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $owner){throw 'RESTORE_PRIVATE_ACL_REJECTED'}
 $own=$false
 foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
  if($rule.IdentityReference.Value -cnotin @($owner,'S-1-5-18','S-1-5-32-544') -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){throw 'RESTORE_PRIVATE_ACL_REJECTED'}
  if($rule.IdentityReference.Value -ceq $owner -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl){$own=$true}
 }
 if(-not $own){throw 'RESTORE_PRIVATE_ACL_REJECTED'}
}
function New-RestoreProtectedDirectory([string]$Parent,[string]$Name) {
 if(-not $IsWindows -or $Name -cnotmatch '^[a-zA-Z0-9][a-zA-Z0-9-]{0,79}$'){throw 'RESTORE_PRIVATE_PATH_REJECTED'}
 Assert-RestoreNoReparse $Parent
 $path=Join-Path ([IO.Path]::GetFullPath($Parent)) $Name
 if(Test-Path -LiteralPath $path){throw 'RESTORE_PRIVATE_NO_OVERWRITE'}
 # CreateDirectory alone would permit an existing raced directory. CreateNew
 # marker ownership is still insufficient to claim safe creation; the caller
 # must keep the approved parent private and exclusive before invoking this.
 Assert-RestorePrivateAcl $Parent $true
 $null=[IO.Directory]::CreateDirectory($path)
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl=[Security.AccessControl.DirectorySecurity]::new()
 $acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($identity)
 foreach($sid in @($identity.Value,'S-1-5-18','S-1-5-32-544')){
  $acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),[Security.AccessControl.FileSystemRights]::FullControl,[Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow))
 }
 Set-Acl -LiteralPath $path -AclObject $acl -ErrorAction Stop
 Assert-RestorePrivateAcl $path $true
 return $path
}
function Assert-RestorePrivateRun([string]$Path,[string]$ApprovedRoot) {
 $root=[IO.Path]::GetFullPath($ApprovedRoot).TrimEnd([IO.Path]::DirectorySeparatorChar)
 $path=[IO.Path]::GetFullPath($Path)
 if(-not $path.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetDirectoryName($path) -ine $root){throw 'RESTORE_PRIVATE_SCOPE_REJECTED'}
 Assert-RestorePrivateAcl $root $true
 Assert-RestorePrivateAcl $path $true
 # Journal/lock files inherit only the approved parent; validate their effective
 # rules too. Protected ACL is required on directories; inherited files are
 # handled separately, without silently rewriting them.
 foreach($item in Get-ChildItem -LiteralPath $path -Force -ErrorAction Stop){
  if($item.PSIsContainer -or $item.Name -cnotin @('journal.jsonl','journal.jsonl.lock','journal.jsonl.phase.lock','preservation-baseline.json')){throw 'RESTORE_PRIVATE_CONTENT_REJECTED'}
  Assert-RestoreNoReparse $item.FullName
  $acl=Get-Acl -LiteralPath $item.FullName -ErrorAction Stop
  $owner=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if($acl.GetOwner([Security.Principal.SecurityIdentifier]).Value -cne $owner){throw 'RESTORE_PRIVATE_ACL_REJECTED'}
  $own=$false
  foreach($rule in $acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier])){
   if($rule.IdentityReference.Value -cnotin @($owner,'S-1-5-18','S-1-5-32-544') -or $rule.AccessControlType -ne [Security.AccessControl.AccessControlType]::Allow){throw 'RESTORE_PRIVATE_ACL_REJECTED'}
   if($rule.IdentityReference.Value -ceq $owner -and ($rule.FileSystemRights -band [Security.AccessControl.FileSystemRights]::FullControl) -eq [Security.AccessControl.FileSystemRights]::FullControl){$own=$true}
  }
  if(-not $own){throw 'RESTORE_PRIVATE_ACL_REJECTED'}
 }
}
