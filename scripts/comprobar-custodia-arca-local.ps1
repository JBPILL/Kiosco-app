#requires -Version 7.4
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Certificado,
    [Parameter(Mandatory)][string]$ClaveCifrada,
    [Parameter(Mandatory)][string]$ProteccionDpapi,
    [Parameter(Mandatory)][string]$CertificadoSha256,
    [Parameter(Mandatory)][string]$CuitCertificado,
    [switch]$Comprobar,
    [switch]$Preparar
)
$ErrorActionPreference='Stop'
$phrase=$null; $pointer=[IntPtr]::Zero; $plain=$null; $payload=$null; $child=$null
$stage='SCOPE'
try {
    if (-not $IsWindows -or ($Preparar -and $Comprobar) -or $CertificadoSha256 -cnotmatch '^[0-9a-f]{64}$' -or $CuitCertificado -cnotmatch '^[0-9]{11}$') { throw 'Invalid scope' }
    $repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
    $paths=@($Certificado,$ClaveCifrada,$ProteccionDpapi)
    for($index=0;$index -lt $paths.Count;$index++) {
        $stage='INPUT_PATH'
        $file=[IO.Path]::GetFullPath($paths[$index])
        if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw 'Missing input' }
        if ($index -gt 0 -and ($file.Equals($repo,[StringComparison]::OrdinalIgnoreCase) -or $file.StartsWith($repo+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase))) { throw 'Private input in repository' }
        $ancestor=$file
        while($ancestor) {
            if ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'Reparse input' }
            $ancestor=[IO.Path]::GetDirectoryName($ancestor)
        }
        $limit=if($index -eq 2){16384}else{100000}
        if ((Get-Item -LiteralPath $file).Length -gt $limit) { throw 'Input too large' }
        if ($index -gt 0) {
            $stage='PRIVATE_ACL'
            $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User
            $acl=Get-Acl -LiteralPath $file
            if (-not $acl.GetOwner([Security.Principal.SecurityIdentifier]).Equals($sid) -or
                @($acl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object { $_.IdentityReference -ne $sid -or $_.AccessControlType -ne 'Allow' }).Count -ne 0) { throw 'Private ACL not confirmed' }
        }
    }
    $stage='NODE_CONFIG'
    if ($env:NODE_OPTIONS -or $env:NODE_PATH) { throw 'Unexpected Node configuration' }
    $stage='NODE_VERSION'
    $node=(Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source
    $version=& $node --version
    if ($LASTEXITCODE -ne 0 -or $version -notmatch '^v24\.') { throw 'Node24 required' }
    if (-not $Comprobar) {
        Write-Output 'CUSTODY_LOCAL_READY. No se leyeron contenidos privados ni se conecto a servicios. -Comprobar requiere GO especifico.'
        return
    }
    $stage='DPAPI'
    $protected=[IO.File]::ReadAllText($ProteccionDpapi).Trim()
    $phrase=ConvertTo-SecureString $protected
    $pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($phrase)
    $plain=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $stage='CUSTODY'
    $payload=@{certificate=[IO.File]::ReadAllText($Certificado);encryptedKey=[IO.File]::ReadAllText($ClaveCifrada);password=$plain;certificateSha256=$CertificadoSha256;cuit=$CuitCertificado} | ConvertTo-Json -Compress
    $start=[Diagnostics.ProcessStartInfo]::new()
    $start.FileName=$node
    $start.ArgumentList.Add((Join-Path $PSScriptRoot 'arca/check-private-custody-local.mjs'))
    $start.UseShellExecute=$false; $start.CreateNoWindow=$true
    $start.RedirectStandardInput=$true; $start.RedirectStandardOutput=$true; $start.RedirectStandardError=$true
    $start.StandardInputEncoding=[Text.UTF8Encoding]::new($false)
    $start.Environment.Remove('NODE_OPTIONS') | Out-Null
    $start.Environment.Remove('NODE_PATH') | Out-Null
    $child=[Diagnostics.Process]::Start($start)
    $stdout=$child.StandardOutput.ReadToEndAsync(); $stderr=$child.StandardError.ReadToEndAsync()
    $write=$child.StandardInput.WriteAsync($payload)
    if (-not $write.Wait(10000)) { $child.Kill($true); throw 'Local input timeout' }
    $write.GetAwaiter().GetResult(); $child.StandardInput.Close()
    if (-not $child.WaitForExit(30000)) { $child.Kill($true); throw 'Local timeout' }
    $raw=$stdout.GetAwaiter().GetResult(); $null=$stderr.GetAwaiter().GetResult()
    $result=$raw | ConvertFrom-Json
    if ($child.ExitCode -ne 0 -or $result.status -cne 'CUSTODY_LOCAL_PASS' -or $result.networkAttempts -ne 0 -or
        $result.nonexportable -ne $true -or $result.cmsVerified -ne $true -or $result.subjectCuitMatches -ne $true -or $result.secretsProvisioned -ne $false) {
        if ($result.code -ceq 'PASSWORD_POLICY_NOT_MET') { $stage='PASSWORD_POLICY_NOT_MET' }
        throw 'Not confirmed'
    }
    Write-Output 'CUSTODY_LOCAL_PASS nonexportable=true cms_verified=true cuit_matches=true network=0 provisioned=false'
} catch {
    Write-Output ('CUSTODY_LOCAL_NOT_CONFIRMED stage='+$stage+'. No compartir errores externos, PEM ni contrasenas.')
    exit 1
} finally {
    if($pointer -ne [IntPtr]::Zero){[Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)}
    if($phrase){$phrase.Dispose()}
    if($child){
        try { if(-not $child.HasExited){$child.Kill($true);$null=$child.WaitForExit(5000)} }
        catch { Write-Output 'CUSTODY_LOCAL_CHILD_CLEANUP_NOT_CONFIRMED' }
        finally { $child.Dispose() }
    }
    $plain=$null; $payload=$null; $raw=$null; $result=$null; $protected=$null
}
