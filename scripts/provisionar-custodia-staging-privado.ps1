#requires -Version 7.4
param(
 [switch]$Preparar,
 [switch]$Provisionar,
 [switch]$VentanaExclusiva,
 [Parameter(Mandatory)][string]$Propuesta,
 [string]$HashRevisado
)
$ErrorActionPreference='Stop'
$phrase=$null;$pointer=[IntPtr]::Zero;$password=$null;$payload=$null;$process=$null
try {
 if(-not $IsWindows -or ($Preparar -and $Provisionar) -or $env:NODE_OPTIONS -or $env:NODE_PATH -or $env:NODE_TLS_REJECT_UNAUTHORIZED -ceq '0'){throw 'Scope'}
 $node=@(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source
 $runner=Join-Path $PSScriptRoot 'arca/provision-closed-custody-cli.mjs'
 # This public-only check runs before any credential prompt or original read.
 & $node $runner --prepare $Propuesta
 if($LASTEXITCODE -ne 0){throw 'Preflight'}
 if(-not $Provisionar){exit 0}
 if(-not $VentanaExclusiva -or [Console]::IsInputRedirected){throw 'Interactive exclusive window required'}
 if($HashRevisado -cnotmatch '^[0-9a-f]{64}$'){throw 'Review hash'}
 $proposal=Get-Content -LiteralPath $Propuesta -Raw | ConvertFrom-Json
 if($proposal.planSha256 -cne $HashRevisado){throw 'Review hash'}
 Write-Host 'Solo Staging acoyfwwmhaeruciyedri: seis secretos, sin flags/ARCA/CAE.'
 Write-Host 'No edites secretos ni permitas otros editores durante esta operacion.'
 Write-Host 'Usa PAT scoped SOLO a este Staging con Secrets Read/Write; no service_role ni claveDB.'
 $phrase=Read-Host 'PAT limitado de Supabase (solo aqui; nunca al chat)' -AsSecureString
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($phrase)
 $password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
 if($password -cnotmatch '^sbp_fc[A-Za-z0-9_-]{16,512}$'){throw 'Scoped PAT required'}
 $payload=@{plan=$proposal.plan;approvedHash=$HashRevisado;token=$password;exclusiveWriteConfirmed=$true;paths=@{
 certificatePath=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../arca-homologacion-recibido.crt'))
 encryptedKeyPath=(Join-Path $env:LOCALAPPDATA '../../KioskoPOS-Privado/ARCA-Homologacion/20261018-0bf9336c2c1d492b9b40f83d69ffc3f9/clave-homologacion-cifrada.pem')
 protectionPath=(Join-Path $env:LOCALAPPDATA '../../KioskoPOS-Privado/ARCA-Homologacion/20261018-0bf9336c2c1d492b9b40f83d69ffc3f9/proteccion-clave.dpapi')
 }} | ConvertTo-Json -Depth 8 -Compress
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$node;$start.ArgumentList.Add($runner)
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true
 $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.StandardInputEncoding=[Text.UTF8Encoding]::new($false)
 $process=[Diagnostics.Process]::new();$process.StartInfo=$start
 if(-not $process.Start()){throw 'Process'}
 $output=$process.StandardOutput.ReadToEndAsync();$diagnostics=$process.StandardError.ReadToEndAsync()
 $null=$process.StandardInput.WriteAsync($payload).GetAwaiter().GetResult();$process.StandardInput.Close()
 if(-not $process.WaitForExit(120000)){$process.Kill();throw 'Timeout'}
 $safe=$output.GetAwaiter().GetResult().Trim();$null=$diagnostics.GetAwaiter().GetResult()
 if($safe -cnotmatch '^(CUSTODY_PROVISION_METADATA_PASS count=6 flags_closed=true functional=false edge_check=REQUIRED|CUSTODY_PROVISION_NOT_CONFIRMED stage=(PLAN|AUTH|BASELINE|PRIVATE_COPY|PREWRITE_RECHECK|POST|VERIFY) write_attempted=(true|false) reconcile_before_retry=(true|false))$'){throw 'Output'}
 Write-Output $safe
 exit $process.ExitCode
} catch {Write-Output 'CUSTODY_OPERATOR_NOT_CONFIRMED. No repetir si hubo POST; avisar a Codex sin credenciales.';exit 1}
finally {
 if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 if($phrase){$phrase.Dispose()};if($process){$process.Dispose()}
 $password=$null;$payload=$null
}
