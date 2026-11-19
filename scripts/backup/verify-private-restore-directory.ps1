#requires -Version 7.4
param([Parameter(Mandatory)][string]$Path)
$ErrorActionPreference='Stop'
try {
 . (Join-Path $PSScriptRoot 'restore-private-windows.ps1')
 Assert-RestorePrivateRun $Path (Join-Path $env:USERPROFILE 'KioskoPOS-Privado/Restauracion-Staging')
 [Console]::Out.Write('RESTORE_DIRECTORY_PRIVATE=true');exit 0
}catch{[Console]::Out.Write('RESTORE_DIRECTORY_PRIVATE=false');exit 1}
