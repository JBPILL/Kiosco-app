#requires -Version 7.4
param(
 [Parameter(Mandatory)][string]$Paquete,
 [switch]$Ejecutar,[switch]$GoConfirmado,[switch]$OperadorExclusivo,
 [ValidateSet('CAPTURE','OWNER','CASHIER')][string]$Rol='CAPTURE',
 [string]$HashRevisado,[string]$DirectorioPrivado,
 [string]$CertificadoRaiz=(Join-Path $env:USERPROFILE 'Downloads/prod-ca-2021.crt')
)
$ErrorActionPreference='Stop';$child=$null;$secrets=@{};$payload=$null;$rootPem=$null
function Read-RestoreSecret([string]$Prompt){
 $secure=$null;$pointer=[IntPtr]::Zero
 try{$secure=Read-Host $Prompt -AsSecureString;$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure);return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)}
 finally{if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)};if($secure){$secure.Dispose()}}
}
try{
 if(-not $IsWindows -or $env:NODE_OPTIONS -or $env:NODE_PATH -or $env:NODE_TLS_REJECT_UNAUTHORIZED -ceq '0'){throw 'Runtime'}
 $node=@(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source
 $runner=Join-Path $PSScriptRoot 'backup/restore-execution-cli.mjs'
 $prepared=& $node $runner --prepare $Paquete
 if($LASTEXITCODE -ne 0 -or $prepared -cnotmatch '^RESTORE_PACKAGE_PREPARED scope=(PR07_READ_ONLY_PRESERVATION_CAPTURE|PR07_FIXED_ISOLATED_RESTORE_ACCEPTANCE) execution=false$'){throw 'Package'}
 if(-not $Ejecutar){Write-Output $prepared;exit 0}
 if(-not $GoConfirmado -or -not $OperadorExclusivo -or [Console]::IsInputRedirected -or $HashRevisado -cnotmatch '^[a-f0-9]{64}$' -or [string]::IsNullOrWhiteSpace($DirectorioPrivado)){throw 'Specific GO required'}
 $text=Get-Content -LiteralPath $Paquete -Raw;$packet=$text|ConvertFrom-Json -AsHashtable
 if($packet.packageHash -cne $HashRevisado -or $packet.projectRef -cne 'acoyfwwmhaeruciyedri' -or ($Rol -ceq 'CAPTURE') -ne ($packet.scope -ceq 'PR07_READ_ONLY_PRESERVATION_CAPTURE')){throw 'Scope'}
 . (Join-Path $PSScriptRoot 'backup/restore-private-windows.ps1')
 Assert-RestorePrivateRun $DirectorioPrivado (Join-Path $env:USERPROFILE 'KioskoPOS-Privado/Restauracion-Staging')
 if(-not (Test-Path -LiteralPath (Join-Path $DirectorioPrivado 'journal.jsonl')) -or (Test-Path -LiteralPath (Join-Path $DirectorioPrivado 'journal.jsonl.lock')) -or (Test-Path -LiteralPath (Join-Path $DirectorioPrivado 'journal.jsonl.phase.lock'))){throw 'Journal state'}
 $ca=Get-Item -LiteralPath $CertificadoRaiz -Force
 if($ca.PSIsContainer -or $ca.Length -gt 65536 -or ($ca.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Public CA'}
 $rootPem=Get-Content -LiteralPath $ca.FullName -Raw
 $certificate=[Security.Cryptography.X509Certificates.X509Certificate2]::new($ca.FullName)
 try{if($certificate.HasPrivateKey -or $certificate.Thumbprint -cne 'A4518A0933AF6949482CCA3014C007C369DF9F6F' -or $rootPem.Contains('PRIVATE KEY')){throw 'Public CA'}}finally{$certificate.Dispose()}
 Write-Host 'Solo Staging acoyfwwmhaeruciyedri; paquete/rol exactos. No reintentes ante incertidumbre.'
 $secrets.postgresPassword=Read-RestoreSecret 'Contrasena PostgreSQL SOLO Staging (nunca al chat)'
 if($Rol -cne 'CAPTURE'){
  $secrets.publicKey=Read-RestoreSecret 'Clave publica anon/publishable SOLO Staging (no PAT/service_role)'
  $secrets.email=Read-Host 'Correo de la cuenta de ensayo del rol aprobado'
  $secrets.password=Read-RestoreSecret 'Contrasena de esa cuenta (nunca al chat)'
 }
 $payload=@{packageText=$text;approvedPackageHash=$HashRevisado;authorizedScope=$packet.scope;goConfirmed=$true;exclusiveOperatorConfirmed=$true;role=$Rol;journalPath=(Join-Path $DirectorioPrivado 'journal.jsonl');rootCertificate=$rootPem;credentials=$secrets}|ConvertTo-Json -Depth 8 -Compress
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$node;$start.ArgumentList.Add($runner);$start.ArgumentList.Add('--execute')
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true;$start.StandardInputEncoding=[Text.UTF8Encoding]::new($false)
 $child=[Diagnostics.Process]::new();$child.StartInfo=$start
 if(-not $child.Start()){throw 'Process'}
 $output=$child.StandardOutput.ReadToEndAsync();$errors=$child.StandardError.ReadToEndAsync()
 $child.StandardInput.Write($payload);$child.StandardInput.Close()
 if(-not $child.WaitForExit(1200000)){Write-Output ('RESTORE_OPERATOR_NOT_CONFIRMED stage=TIMEOUT child_running=true child_pid='+$child.Id+' retry=false');exit 1}
 $safe=$output.GetAwaiter().GetResult().Trim();$null=$errors.GetAwaiter().GetResult()
 if($safe -cnotmatch '^(RESTORE_CAPTURE_PASS baseline=[a-f0-9]{64} auth=false mutation=false|RESTORE_ROLE_PASS role=(OWNER|CASHIER) confirmed=(18|3) logout_local=true|RESTORE_OPERATOR_NOT_CONFIRMED stage=(PACKET|DIRECTORY|BACKUP|CONNECT|CAPTURE|BASELINE|PHASE|GATE|LEASE|JOURNAL|PREFLIGHT|SESSION|IDENTITY|ACTION|FINAL_PREFLIGHT|LOGOUT|LEASE_CLEANUP|DISPOSE|ENTRY) retry=false)$'){throw 'Output'}
 if($safe.StartsWith('RESTORE_CAPTURE_PASS') -and ($Rol -cne 'CAPTURE' -or $child.ExitCode -ne 0)){throw 'Capture result'}
 if($safe.StartsWith('RESTORE_ROLE_PASS')){
  $expectedCount=if($Rol -ceq 'OWNER'){18}elseif($Rol -ceq 'CASHIER'){3}else{throw 'Role result'}
  if($safe -cne ('RESTORE_ROLE_PASS role='+$Rol+' confirmed='+$expectedCount+' logout_local=true') -or $child.ExitCode -ne 0){throw 'Role result'}
 }
 Write-Output $safe;exit $child.ExitCode
}catch{Write-Output 'RESTORE_OPERATOR_NOT_CONFIRMED stage=ENTRY retry=false';exit 1}
finally{foreach($key in @($secrets.Keys)){$secrets[$key]=$null};$payload=$null;$rootPem=$null;if($child){$child.Dispose()}}
