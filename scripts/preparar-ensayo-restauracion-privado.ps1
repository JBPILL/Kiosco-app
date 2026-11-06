#requires -Version 7.4
param(
 [Parameter(Mandatory)][string]$OwnerAuthId,
 [Parameter(Mandatory)][string]$CashierAuthId,
 [Parameter(Mandatory)][string]$HashRevisado
)
$ErrorActionPreference='Stop';$child=$null;$payload=$null
try {
 if(-not $IsWindows -or $env:NODE_OPTIONS -or $env:NODE_PATH -or $env:NODE_TLS_REJECT_UNAUTHORIZED -ceq '0'){throw 'Runtime'}
 $uuid='^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'
 if($OwnerAuthId -cnotmatch $uuid -or $CashierAuthId -cnotmatch $uuid -or $OwnerAuthId -ceq $CashierAuthId){throw 'Public actor pins'}
 . (Join-Path $PSScriptRoot 'backup/restore-private-windows.ps1')
 $plan=Join-Path $PSScriptRoot 'backup/restore-acceptance-plan.json'
 if($HashRevisado -cnotmatch '^[a-f0-9]{64}$' -or (Get-FileHash -LiteralPath $plan -Algorithm SHA256).Hash.ToLowerInvariant() -cne $HashRevisado){throw 'Review'}
 $private=Join-Path $env:USERPROFILE 'KioskoPOS-Privado'
 # Existing private parent is checked, never silently repaired or broadened.
 Assert-RestorePrivateAcl $private $true
 $root=Join-Path $private 'Restauracion-Staging'
 if(-not (Test-Path -LiteralPath $root)){$root=New-RestoreProtectedDirectory $private 'Restauracion-Staging'}
 Assert-RestorePrivateAcl $root $true
 $directory=New-RestoreProtectedDirectory $root ([guid]::NewGuid().ToString('N'))
 Assert-RestorePrivateRun $directory $root
 $payload=@{directory=$directory;planHash=$HashRevisado;actors=@{OWNER=$OwnerAuthId;CASHIER=$CashierAuthId}}|ConvertTo-Json -Depth 4 -Compress
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=@(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source
 $start.ArgumentList.Add((Join-Path $PSScriptRoot 'backup/prepare-private-restore-journal.mjs'));$start.ArgumentList.Add('--prepare')
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.StandardInputEncoding=[Text.UTF8Encoding]::new($false)
 $child=[Diagnostics.Process]::new();$child.StartInfo=$start
 if(-not $child.Start()){throw 'Process'}
 $output=$child.StandardOutput.ReadToEndAsync();$errors=$child.StandardError.ReadToEndAsync()
 $child.StandardInput.Write($payload);$child.StandardInput.Close()
 if(-not $child.WaitForExit(30000)){
  Write-Output ('RESTORE_PRIVATE_PREPARATION_NOT_CONFIRMED stage=TIMEOUT child_running=true child_pid='+$child.Id+' retry=false');exit 1
 }
 $safe=$output.GetAwaiter().GetResult().Trim();$null=$errors.GetAwaiter().GetResult()
 if($safe -cnotmatch '^RESTORE_PRIVATE_PREPARATION_(PASS journal=true auth=false network=false mutation=false|NOT_CONFIRMED stage=(INPUT|DIRECTORY|JOURNAL) retry=false)$'){throw 'Output'}
 if($child.ExitCode -ne 0){Write-Output $safe;exit 1}
 if($safe -cne 'RESTORE_PRIVATE_PREPARATION_PASS journal=true auth=false network=false mutation=false'){throw 'Result'}
 Assert-RestorePrivateRun $directory $root
 Write-Output $safe
 Write-Output ('Registro local privado: '+$directory)
 exit 0
}catch{Write-Output 'RESTORE_PRIVATE_PREPARATION_NOT_CONFIRMED stage=ENTRY retry=false';exit 1}
finally{if($child){$child.Dispose()};$payload=$null}
