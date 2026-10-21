#requires -Version 7.4
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Certificado,
    [Parameter(Mandatory)][string]$ClaveCifrada,
    [Parameter(Mandatory)][string]$ProteccionDpapi,
    [string]$Servicio = 'wsfe',
    [switch]$Conectar
)

$ErrorActionPreference = 'Stop'
$etapa = 'CARGA'
$password = $null
try {
    $referencias = @((Get-ChildItem -LiteralPath (Join-Path $PSHOME 'ref') -Filter '*.dll').FullName)
    $referencias += Join-Path $PSHOME 'System.Security.Cryptography.Pkcs.dll'
    Add-Type -Path (Join-Path $PSScriptRoot 'arca/WsaaHomologacion.cs') -ReferencedAssemblies $referencias
    $etapa = 'DPAPI'
    $password = Get-Content -LiteralPath $ProteccionDpapi -Raw | ConvertTo-SecureString
    $etapa = 'TRA'
    $ahora = [DateTimeOffset]::UtcNow
    $tra = [WsaaHomologacion]::BuildTra($ahora, $Servicio, [uint32]$ahora.ToUnixTimeSeconds())
    $etapa = 'CMS'
    $cms = [WsaaHomologacion]::SignTra($Certificado, $ClaveCifrada, $password, $tra)
    Write-Output 'CERT_KEY_MATCH=PASS'
    Write-Output 'TRA_GENERATION=PASS'
    Write-Output 'CMS_SIGNATURE=PASS'
    if ($Conectar) {
        $etapa = 'LOGIN_CMS'
        $ticket = [WsaaHomologacion]::Login($cms)
        Write-Output 'WSAA_HOMOLOGACION=PASS'
        Write-Output 'TOKEN_RECEIVED=true'
        Write-Output 'SIGN_RECEIVED=true'
        Write-Output ('EXPIRATION_TIME=' + $ticket.Expiration.ToUniversalTime().ToString('o'))
    } else { Write-Output 'WSAA_HOMOLOGACION=NOT_RUN' }
} catch {
    # No imprimir ErrorRecord, pila, XML, rutas privadas, Token, Sign ni excepciones completas.
    $codigo = 'LOCAL_OR_TRANSPORT_ERROR'
    $errorInterno = $_.Exception
    while ($errorInterno.InnerException) { $errorInterno = $errorInterno.InnerException }
    if ($errorInterno.Message -match '^(WSAA_FAULT:[a-zA-Z0-9_.:-]{1,100}|CERT_KEY_MISMATCH|CERT_NOT_CURRENT|CERT_NOT_TESTING|TICKET_[A-Z_]+|XML_[A-Z_]+|WSAA_HTTP_[0-9]{3})$') {
        $codigo = $errorInterno.Message
    }
    Write-Output ('WSAA_HOMOLOGACION=FAIL; STAGE=' + $etapa + '; CODE=' + $codigo)
    exit 1
} finally {
    if ($password) { $password.Dispose() }
    $ticket = $null
    if ($cms) { [Array]::Clear($cms, 0, $cms.Length) }
}
