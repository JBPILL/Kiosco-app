#requires -Version 7.4
[CmdletBinding()]
param(
    [Parameter(Mandatory)][string]$Certificado,
    [Parameter(Mandatory)][string]$ClaveCifrada,
    [Parameter(Mandatory)][string]$ProteccionDpapi,
    [string]$Servicio = 'wsfe',
    [switch]$Conectar,
    [switch]$ConsultarWsfe,
    [string]$CuitRepresentado,
    [ValidateSet("FEParamGetPtosVenta", "FEParamGetTiposCbte", "FEParamGetTiposIva", "FEParamGetCondicionIvaReceptor")]
    [string]$ConsultaWsfe = "FEParamGetPtosVenta",
    [string]$SalidaParametros,
    [switch]$CatalogosPreparacion,
    [string]$DirectorioCatalogos,
    [switch]$ConsultarUltimo,
    [string]$PuntoVenta,
    [string]$TipoComprobante
)

$ErrorActionPreference = 'Stop'
$etapa = 'CARGA'
$password = $null
try {
    if ($ConsultarUltimo) {
        if (-not $Conectar -or $Servicio -ne 'wsfe' -or $ConsultarWsfe -or $CatalogosPreparacion -or $SalidaParametros -or $DirectorioCatalogos -or
            $PSBoundParameters.ContainsKey('ConsultaWsfe') -or -not $PSBoundParameters.ContainsKey('PuntoVenta') -or -not $PSBoundParameters.ContainsKey('TipoComprobante') -or
            $PuntoVenta -cnotmatch '^[0-9]{1,5}$' -or [int]$PuntoVenta -lt 1 -or [int]$PuntoVenta -gt 99998 -or
            $TipoComprobante -cnotmatch '^(1|6|11)$') { throw 'LAST_VOUCHER_MODE' }
    } elseif ($PSBoundParameters.ContainsKey('PuntoVenta') -or $PSBoundParameters.ContainsKey('TipoComprobante')) { throw 'LAST_VOUCHER_MODE' }
    if ($CatalogosPreparacion) {
        if (-not $Conectar -or $Servicio -ne 'wsfe' -or $SalidaParametros -or $PSBoundParameters.ContainsKey('ConsultaWsfe') -or -not $DirectorioCatalogos) { throw 'PARAMETER_EXPORT_MODE' }
        $DirectorioCatalogos = [IO.Path]::GetFullPath($DirectorioCatalogos)
        if (-not (Test-Path -LiteralPath $DirectorioCatalogos -PathType Container)) { throw 'PARAMETER_EXPORT_DESTINATION' }
        $ConsultarWsfe = $true
        $catalogRun = [Guid]::NewGuid().ToString('N')
    } elseif ($DirectorioCatalogos) { throw 'PARAMETER_EXPORT_MODE' }
    if ($SalidaParametros) {
        if (-not $Conectar -or -not $ConsultarWsfe -or $ConsultaWsfe -notin @('FEParamGetTiposIva','FEParamGetCondicionIvaReceptor')) { throw 'PARAMETER_EXPORT_MODE' }
        $SalidaParametros = [IO.Path]::GetFullPath($SalidaParametros)
        if ([IO.Path]::GetExtension($SalidaParametros) -ine '.json' -or (Test-Path -LiteralPath $SalidaParametros) -or
            -not (Test-Path -LiteralPath ([IO.Path]::GetDirectoryName($SalidaParametros)) -PathType Container)) { throw 'PARAMETER_EXPORT_DESTINATION' }
    }
    $referencias = @((Get-ChildItem -LiteralPath (Join-Path $PSHOME 'ref') -Filter '*.dll').FullName)
    $referencias += Join-Path $PSHOME 'System.Security.Cryptography.Pkcs.dll'
    Add-Type -Path (Join-Path $PSScriptRoot 'arca/WsaaHomologacion.cs') -ReferencedAssemblies $referencias
    if ($ConsultarWsfe -or $ConsultarUltimo) {
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
        if ($ConsultarUltimo) {
            $etapa = 'WSFE_CONSULTA'
            $ultimo = [WsaaHomologacion]::ConsultLastVoucher($ticket, $CuitRepresentado, [int]$PuntoVenta, [int]$TipoComprobante)
            Write-Output 'WSFE_LAST_READ=PASS'
            Write-Output ('PUNTO_CONSULTADO=' + $ultimo.Point)
            Write-Output ('TIPO_CONSULTADO=' + $ultimo.VoucherType)
            Write-Output ('ULTIMO_OBSERVADO=' + $ultimo.LastNumber)
            Write-Output ('RESPUESTA_SHA256=' + $ultimo.SourceSha256)
            Write-Output 'PUNTO_HABILITADO=NOT_PROVEN'
            Write-Output 'NUMERACION_RESERVADA=false'
            Write-Output 'COMPROBANTES_EMITIDOS=0'
        }
        if ($ConsultarWsfe) {
            $operacionesWsfe = if ($CatalogosPreparacion) { @('FEParamGetTiposIva','FEParamGetCondicionIvaReceptor') } else { @($ConsultaWsfe) }
            foreach ($operacionWsfe in $operacionesWsfe) {
            $etapa = 'WSFE_CONSULTA'
            $diagnostico = [WsaaHomologacion]::ConsultWsfe($ticket, $CuitRepresentado, $operacionWsfe)
            Write-Output 'WSFE_HOMOLOGACION=PASS'
            Write-Output ('CONSULTA_WSFE=' + $operacionWsfe)
            if ($operacionWsfe -eq 'FEParamGetTiposCbte') {
                Write-Output ('TIPOS_COMPROBANTE=' + $diagnostico.VoucherTypes)
            } elseif ($operacionWsfe -in @('FEParamGetTiposIva','FEParamGetCondicionIvaReceptor')) {
                Write-Output ('PARAMETROS_WSFE=' + $diagnostico.Parameters.Length)
                $destinoParametros = if ($CatalogosPreparacion) { Join-Path $DirectorioCatalogos ($catalogRun + '-' + $operacionWsfe + '.json') } else { $SalidaParametros }
                if ($destinoParametros) {
                    $etapa = 'EXPORTACION_PARAMETROS'
                    [WsaaHomologacion]::WriteParameterEvidence($diagnostico,$ticket,$operacionWsfe,[DateTimeOffset]::UtcNow,$destinoParametros)
                    Write-Output 'PARAMETROS_PUBLICOS_EXPORTADOS=true'
                }
            } else {
                Write-Output ('PUNTOS_VENTA=' + $diagnostico.Points)
                Write-Output ('PUNTOS_BLOQUEADOS=' + $diagnostico.BlockedPoints)
            }
            Write-Output 'COMPROBANTES_EMITIDOS=0'
            }
            if ($CatalogosPreparacion) { Write-Output 'CATALOGOS_PREPARACION_EXPORTADOS=true' }
        }
    } else { Write-Output 'WSAA_HOMOLOGACION=NOT_RUN' }
} catch {
    # No imprimir ErrorRecord, pila, XML, rutas privadas, Token, Sign ni excepciones completas.
    $codigo = 'LOCAL_OR_TRANSPORT_ERROR'
    $errorInterno = $_.Exception
    while ($errorInterno.InnerException) { $errorInterno = $errorInterno.InnerException }
    if ($errorInterno.Message -match '^((WSAA|WSFE)_FAULT:[a-zA-Z0-9_.:-]{1,100}|WSFE_BUSINESS:([0-9,]{1,90}|UNKNOWN)|WSFE_(RESULT|POINTS|TYPES|OPERATION|PARAMETERS|PARAMETER_DESTINATION|LAST_SCOPE|LAST_RESULT)|CERT_KEY_MISMATCH|CERT_NOT_CURRENT|CERT_NOT_TESTING|TICKET_[A-Z_]+|XML_[A-Z_]+|(WSAA|WSFE)_HTTP_[0-9]{3})$') {
        $codigo = $errorInterno.Message
    }
    $gate = if ($etapa -in @('WSFE_CONSULTA','EXPORTACION_PARAMETROS')) { 'WSFE_HOMOLOGACION' } else { 'WSAA_HOMOLOGACION' }
    Write-Output ($gate + '=FAIL; STAGE=' + $etapa + '; CODE=' + $codigo)
    exit 1
} finally {
    if ($password) { $password.Dispose() }
    $ticket = $null
    if ($cms) { [Array]::Clear($cms, 0, $cms.Length) }
}
