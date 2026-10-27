#requires -Version 7.4
# INTERNAL PIPE ONLY. Never invoke with exec_command or in a user console.
# No RSA import/CMS/ARCA request: original compatibility is already closed.
param(
 [Parameter(Mandatory)][string]$Certificado,
 [Parameter(Mandatory)][string]$ClaveCifrada,
 [Parameter(Mandatory)][string]$ProteccionDpapi,
 [Parameter(Mandatory)][string]$CertificadoSha256,
 [Parameter(Mandatory)][string]$CuitCertificado,
 [Parameter(Mandatory)][string]$IdCredencial,
 [Parameter(Mandatory)][string]$IdClaveTa
)
$ErrorActionPreference='Stop'
$phrase=$null;$pointer=[IntPtr]::Zero;$keyBytes=$null;$serialized=$null;$values=$null
$stage='CHANNEL'
try {
 if(-not $IsWindows -or -not [Console]::IsOutputRedirected -or $env:KIOSKOPOS_PRIVATE_CHANNEL_V1 -cne '1' -or
   $IdCredencial -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' -or
   $IdClaveTa -cnotmatch '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' -or
   $IdCredencial -ceq $IdClaveTa) { throw 'Invalid channel' }
 [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)
 $stage='METADATA'
 $preflight=& (Join-Path $PSScriptRoot '../comprobar-custodia-arca-local.ps1') -Preparar -Certificado $Certificado -ClaveCifrada $ClaveCifrada -ProteccionDpapi $ProteccionDpapi -CertificadoSha256 $CertificadoSha256 -CuitCertificado $CuitCertificado
 if($LASTEXITCODE -ne 0 -or @($preflight).Count -ne 1 -or $preflight -notlike 'CUSTODY_LOCAL_READY.*'){throw 'Metadata not confirmed'}
 $stage='PUBLIC_PIN'
 $certificateText=[IO.File]::ReadAllText($Certificado).Trim()
 if($certificateText -cnotmatch '^-----BEGIN CERTIFICATE-----\r?\n([A-Za-z0-9+/=\r\n]+)\r?\n-----END CERTIFICATE-----$'){throw 'Public certificate required'}
 $der=[Convert]::FromBase64String(($Matches[1] -replace '\s',''))
 if([Convert]::ToHexString([Security.Cryptography.SHA256]::HashData($der)).ToLowerInvariant() -cne $CertificadoSha256){throw 'Pin changed'}
 $stage='ORIGINAL_COPY'
 $encryptedKey=[IO.File]::ReadAllText($ClaveCifrada).Trim()
 if($encryptedKey -cnotmatch '^-----BEGIN ENCRYPTED PRIVATE KEY-----\r?\n[A-Za-z0-9+/=\r\n]+\r?\n-----END ENCRYPTED PRIVATE KEY-----$'){throw 'Encrypted key required'}
 $phrase=ConvertTo-SecureString ([IO.File]::ReadAllText($ProteccionDpapi).Trim())
 $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($phrase)
 $password=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
 if($password.Length -lt 16 -or $password.Length -gt 1024){throw 'Password policy'}
 $keyBytes=[Security.Cryptography.RandomNumberGenerator]::GetBytes(32)
 $prefix='ARCA_HOMO_CREDENTIAL_'+$IdCredencial.Replace('-','').ToUpperInvariant()
 $values=[ordered]@{}
 $values[$prefix+'_REVISION']='1'
 $values[$prefix+'_CERT_PEM']=$certificateText
 $values[$prefix+'_KEY_PEM']=$encryptedKey
 $values[$prefix+'_PASSWORD']=$password
 $values['ARCA_HOMO_TA_KEY_'+$IdClaveTa.Replace('-','').ToUpperInvariant()]=[Convert]::ToBase64String($keyBytes)
 $values['ARCA_HOMO_TA_ACTIVE_KEY_ID']=$IdClaveTa
 $stage='PACKET'
 $serialized=@{version=1;projectRef='acoyfwwmhaeruciyedri';credentialId=$IdCredencial;taKeyId=$IdClaveTa;certificateSha256=$CertificadoSha256;secrets=$values} | ConvertTo-Json -Compress -Depth 4
} catch {
 [Console]::Error.Write('FISCAL_PRIVATE_CHANNEL_NOT_CONFIRMED:'+$stage)
 exit 1
} finally {
 if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
 if($phrase){$phrase.Dispose()}
 if($keyBytes){[Array]::Clear($keyBytes,0,$keyBytes.Length)}
 if($values){$values.Clear()}
 $password=$null;$encryptedKey=$null;$certificateText=$null
}
try{[Console]::Out.Write($serialized)}catch{[Console]::Error.Write('FISCAL_PRIVATE_CHANNEL_NOT_CONFIRMED');exit 1}finally{$serialized=$null}
