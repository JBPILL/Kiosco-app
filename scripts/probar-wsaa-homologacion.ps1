#requires -Version 7.4
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Certificado,
    [Parameter(Mandatory)][string]$ClaveCifrada,
    [Parameter(Mandatory)][string]$ProteccionDpapi,
    [string]$Servicio = 'wsfe',
    [switch]$Conectar,
    [switch]$ConsultarWsfe,
    [string]$CuitRepresentado
)

$ErrorActionPreference = 'Stop'
$etapa = 'CARGA'
$password = $null
try {
    $referencias = @((Get-ChildItem -LiteralPath (Join-Path $PSHOME 'ref') -Filter '*.dll').FullName)
    $referencias += Join-Path $PSHOME 'System.Security.Cryptography.Pkcs.dll'
    Add-Type -Path (Join-Path $PSScriptRoot 'arca/WsaaHomologacion.cs') -ReferencedAssemblies $referencias
    if ($ConsultarWsfe) {
        if (-not $Conectar -or $Servicio -ne 'wsfe') { throw 'La consulta WSFE requiere conexión de homologación y servicio wsfe.' }
        [WsaaHomologacion]::ValidateRepresentedCuit($CuitRepresentado)
    }
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
        if ($ConsultarWsfe) {
            $etapa = 'WSFE_CONSULTA'
            $diagnostico = [WsaaHomologacion]::ConsultWsfe($ticket, $CuitRepresentado)
            Write-Output 'WSFE_HOMOLOGACION=PASS'
            Write-Output ('PUNTOS_VENTA=' + $diagnostico.Points)
            Write-Output ('PUNTOS_BLOQUEADOS=' + $diagnostico.BlockedPoints)
            Write-Output 'COMPROBANTES_EMITIDOS=0'
        }
    } else { Write-Output 'WSAA_HOMOLOGACION=NOT_RUN' }
} catch {
    # No imprimir ErrorRecord, pila, XML, rutas privadas, Token, Sign ni excepciones completas.
    $codigo = 'LOCAL_OR_TRANSPORT_ERROR'
    $errorInterno = $_.Exception
    while ($errorInterno.InnerException) { $errorInterno = $errorInterno.InnerException }
    if ($errorInterno.Message -match '^((WSAA|WSFE)_FAULT:[a-zA-Z0-9_.:-]{1,100}|WSFE_BUSINESS:([0-9,]{1,90}|UNKNOWN)|WSFE_(RESULT|POINTS)|CERT_KEY_MISMATCH|CERT_NOT_CURRENT|CERT_NOT_TESTING|TICKET_[A-Z_]+|XML_[A-Z_]+|(WSAA|WSFE)_HTTP_[0-9]{3})$') {
        $codigo = $errorInterno.Message
    }
    $gate = if ($etapa -eq 'WSFE_CONSULTA') { 'WSFE_HOMOLOGACION' } else { 'WSAA_HOMOLOGACION' }
    Write-Output ($gate + '=FAIL; STAGE=' + $etapa + '; CODE=' + $codigo)
    exit 1
} finally {
    if ($password) { $password.Dispose() }
    $ticket = $null
    if ($cms) { [Array]::Clear($cms, 0, $cms.Length) }
}
