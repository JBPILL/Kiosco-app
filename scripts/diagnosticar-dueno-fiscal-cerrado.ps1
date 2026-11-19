#requires -Version 7.4
$ErrorActionPreference='Stop'
$process=$null;$payload=$null;$publicKey=$null;$password=$null;$email=$null
function Read-PrivateValue([string]$Label) {
 $secure=$null;$pointer=[IntPtr]::Zero
 try {
  $secure=Read-Host $Label -AsSecureString
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
 } finally {
  if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
  if($secure){$secure.Dispose()}
 }
}
try {
 if(-not $IsWindows -or [Console]::IsInputRedirected -or $env:NODE_OPTIONS -or $env:NODE_PATH -or $env:NODE_TLS_REJECT_UNAUTHORIZED -ceq '0'){throw 'Runtime'}
 $node=@(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source
 Write-Host 'Solo identidad exacta del Dueno y backend cerrado de Staging acoyfwwmhaeruciyedri. Sin ventana, SQL, flags ni ARCA.'
 $publicKey=Read-PrivateValue 'Clave publica anon/publishable de Staging (NO PAT ni service_role)'
 $email=Read-Host 'Correo del Dueno de ensayo (prueba1@gmail.com)'
 $password=Read-PrivateValue 'Contrasena de esa cuenta (solo aqui)'
 $payload=@{publicKey=$publicKey;email=$email;password=$password}|ConvertTo-Json -Compress
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$node
 $start.ArgumentList.Add((Join-Path $PSScriptRoot 'diagnose-fiscal-owner-closed.mjs'));$start.ArgumentList.Add('--run-closed')
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true
 $start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.StandardInputEncoding=[Text.UTF8Encoding]::new($false)
 $process=[Diagnostics.Process]::new();$process.StartInfo=$start
 if(-not $process.Start()){throw 'Process'}
 $output=$process.StandardOutput.ReadToEndAsync();$diagnostics=$process.StandardError.ReadToEndAsync()
 $process.StandardInput.Write($payload);$process.StandardInput.Close()
 if(-not $process.WaitForExit(120000)){$process.Kill();throw 'Timeout'}
 $safe=$output.GetAwaiter().GetResult().Trim();$null=$diagnostics.GetAwaiter().GetResult()
 if($safe -cnotmatch '^OWNER_CLOSED_(PASS identity=true profile=true backend503=true logout_local=CONFIRMED window=false arca=false|NOT_CONFIRMED reason=(ENTRY|PRIVATE_OWNER_(INPUT_REJECTED|JWT_REJECTED|RESPONSE_REJECTED|NETWORK_UNCERTAIN|LOGIN_NOT_CONFIRMED|AUTH_NOT_CONFIRMED|PROFILE_NOT_CONFIRMED|FAILURE_LOGOUT_NOT_CONFIRMED|LOGOUT_NOT_CONFIRMED)|PRIVATE_BACKEND_CLOSED_NOT_CONFIRMED) logout_local=(NOT_ESTABLISHED|CONFIRMED|NOT_CONFIRMED) window=false arca=false)$'){throw 'Output'}
 Write-Output $safe
 exit $process.ExitCode
}catch{Write-Output 'OWNER_CLOSED_NOT_CONFIRMED reason=ENTRY logout_local=NOT_ESTABLISHED window=false arca=false';exit 1}
finally{if($process){$process.Dispose()};$payload=$null;$publicKey=$null;$password=$null;$email=$null}
