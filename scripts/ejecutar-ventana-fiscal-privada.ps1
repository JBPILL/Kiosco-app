#requires -Version 7.4
param(
 [Parameter(Mandatory)][string]$Paquete,
 [switch]$Preparar,
 [switch]$Ejecutar,
 [switch]$GoConfirmado,
 [switch]$VentanaExclusiva,
 [string]$HashRevisado,
 [string]$CertificadoRaiz=(Join-Path $env:USERPROFILE 'Downloads/prod-ca-2021.crt')
)
$ErrorActionPreference='Stop'
$process=$null;$packet=$null;$payload=$null;$secrets=@{};$rootPem=$null
function Read-WindowSecret([string]$Prompt){
 $secure=$null;$pointer=[IntPtr]::Zero
 try{
  $secure=Read-Host $Prompt -AsSecureString
  $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
 }finally{if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)};if($secure){$secure.Dispose()}}
}
try{
 if(-not $IsWindows -or ($Preparar -and $Ejecutar) -or $env:NODE_OPTIONS -or $env:NODE_PATH -or $env:NODE_TLS_REJECT_UNAUTHORIZED -ceq '0'){throw 'Runtime'}
 $node=@(Get-Command node -CommandType Application -ErrorAction Stop)[0].Source
 $runner=Join-Path $PSScriptRoot 'fiscal-positive-window-cli.mjs'
 & $node $runner --prepare $Paquete
 if($LASTEXITCODE -ne 0){throw 'Public package rejected'}
 if(-not $Ejecutar){exit 0}
 if(-not $GoConfirmado -or -not $VentanaExclusiva -or [Console]::IsInputRedirected -or $HashRevisado -cnotmatch '^[a-f0-9]{64}$'){throw 'Specific GO required'}
 $proposalRaw=Get-Content -LiteralPath $Paquete -Raw
 $proposal=$proposalRaw | ConvertFrom-Json -AsHashtable
 if($proposal.packageSha256 -cne $HashRevisado -or $proposal.scope -cne 'PRIMERA_VENTANA_POSITIVA_SIN_EMISION' -or
  $proposal.projectRef -cne 'acoyfwwmhaeruciyedri' -or $proposal.config.operationId -cnotmatch '^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$'){throw 'Exact review required'}
 # Public trust root only; this is NOT the original ARCA certificate/key.
 $rootItem=Get-Item -LiteralPath $CertificadoRaiz -Force
 if($rootItem.PSIsContainer -or $rootItem.Length -gt 65536 -or ($rootItem.Attributes -band [IO.FileAttributes]::ReparsePoint)){throw 'Public CA'}
 $rootPem=Get-Content -LiteralPath $rootItem.FullName -Raw
 if(-not $rootPem.Contains('-----BEGIN CERTIFICATE-----') -or $rootPem.Contains('PRIVATE KEY')){throw 'Public CA'}
 $runRoot=[IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'KioskoPOS-Privado/ARCA-Ventanas'))
 $runDirectory=Join-Path $runRoot ($proposal.config.operationId+'-'+[guid]::NewGuid().ToString('N'))
 $runDirectory=[IO.Path]::GetFullPath($runDirectory)
 if(-not $runDirectory.StartsWith($runRoot+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Private scope'}
 if(Test-Path -LiteralPath $runDirectory){throw 'Do not overwrite'}
 $null=[IO.Directory]::CreateDirectory($runDirectory)
 $identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
 $acl=[Security.AccessControl.DirectorySecurity]::new();$acl.SetAccessRuleProtection($true,$false);$acl.SetOwner($identity)
 foreach($sid in @($identity.Value,'S-1-5-18','S-1-5-32-544')){
  $rule=[Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new($sid),[Security.AccessControl.FileSystemRights]::FullControl,
   [Security.AccessControl.InheritanceFlags]'ContainerInherit,ObjectInherit',[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
  $acl.AddAccessRule($rule)
 }
 Set-Acl -LiteralPath $runDirectory -AclObject $acl
 $directoryCheck=& pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'comprobar-directorio-ventana-privada.ps1') -Path $runDirectory
 if($LASTEXITCODE -ne 0 -or $directoryCheck -cne 'WINDOW_DIRECTORY_PRIVATE=true'){throw 'Private directory'}
 Write-Host 'Solo Staging acoyfwwmhaeruciyedri. Ventana de preparacion SIN emision ni CAE.'
 Write-Host 'GO exclusivo requerido. No cierres la terminal ni repitas si hay incertidumbre.'
 Write-Host ('Registro operativo privado: '+$runDirectory)
 $secrets.publicKey=Read-WindowSecret 'Clave publica anon/publishable de Staging (nunca service_role)'
 $secrets.email=Read-Host 'Correo del Dueno aprobado'
 $secrets.password=Read-WindowSecret 'Contrasena del Dueno (solo aqui, nunca al chat)'
 $secrets.postgresPassword=Read-WindowSecret 'Contrasena PostgreSQL SOLO Staging (solo aqui)'
 $secrets.managementToken=Read-WindowSecret 'PAT scoped SOLO Staging, Secrets Read/Write (solo aqui)'
 # Preserve exact public JSON text: PowerShell must not reserialize timestamps
 # or numbers used in the reviewed package/hash or the opening receipt.
 $packet=@{packageText=$proposalRaw;approvedPackageHash=$HashRevisado;authorizedScope='PRIMERA_VENTANA_POSITIVA_SIN_EMISION';exclusiveWriteConfirmed=$true;
  journalPath=(Join-Path $runDirectory 'journal.jsonl');rootCertificate=$rootPem;credentials=$secrets}
 $payload=$packet | ConvertTo-Json -Depth 24 -Compress
 $start=[Diagnostics.ProcessStartInfo]::new();$start.FileName=$node;$start.ArgumentList.Add($runner);$start.ArgumentList.Add('--execute')
 $start.UseShellExecute=$false;$start.CreateNoWindow=$true;$start.RedirectStandardInput=$true;$start.RedirectStandardOutput=$true;$start.RedirectStandardError=$true
 $start.StandardInputEncoding=[Text.UTF8Encoding]::new($false)
 $process=[Diagnostics.Process]::new();$process.StartInfo=$start
 if(-not $process.Start()){throw 'Process'}
 $output=$process.StandardOutput.ReadToEndAsync();$diagnostics=$process.StandardError.ReadToEndAsync()
 $process.StandardInput.Write($payload);$process.StandardInput.Close()
 if(-not $process.WaitForExit(1200000)){
  # Do not kill a possibly active cleanup or launch a replacement process.
  Write-Output ('WINDOW_OPERATOR_NOT_CONFIRMED stage=TIMEOUT child_running=true child_pid='+$process.Id+' reconcile=true')
  exit 1
 }
 $safe=$output.GetAwaiter().GetResult().Trim();$null=$diagnostics.GetAwaiter().GetResult()
 if($safe -cnotmatch '^WINDOW_OPERATOR_(PASS flags_closed=true sql_closed=true logout_local=true backend503=true emission=false cae=0|NOT_CONFIRMED stage=(PACKET|DIRECTORY|CONNECT|WINDOW|DISPOSE|ENTRY|PREFLIGHT|MANAGEMENT|AUTH|OPEN|FLAGS|DATA|BODY|RELOAD|CLOSE|LOGOUT|FINAL_PROBE|SESSION) cleanup_confirmed=(true|false) reconcile=true)$'){throw 'Sanitized output required'}
 Write-Output $safe
 exit $process.ExitCode
}catch{Write-Output 'WINDOW_OPERATOR_NOT_CONFIRMED stage=ENTRY cleanup_confirmed=false reconcile=true';exit 1}
finally{
 if($packet){$packet.credentials=$null};foreach($key in @($secrets.Keys)){$secrets[$key]=$null}
 $payload=$null;$rootPem=$null;$packet=$null
 if($process){$process.Dispose()}
}
