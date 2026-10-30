param([switch]$Preparar, [switch]$ComprobarAccesos, [switch]$ComprobarAislamiento, [switch]$ComprobarAislamientoVisor, [switch]$ComprobarCapacidadRestauracion)
$ErrorActionPreference = 'Stop'
$target = 'https://acoyfwwmhaeruciyedri.supabase.co'
$origin = 'https://kiosco-app-staging.vercel.app'
$publicKey = $null; $password = $null; $token = $null; $session = $null; $body = $null
$result = 1; $step = 'preparacion'
$authDiagnostic = 'SIN_DETALLE'; $authStatus = 0; $script:accessStatus = 0

function Get-AuthFailureCategory {
    param($Failure)
    $status = 0; $content = $null; $category = 'AUTH_NO_CLASIFICADO'
    try {
        if ($Failure.Exception.Response) { $status = [int]$Failure.Exception.Response.StatusCode }
        if ($Failure.ErrorDetails -and $Failure.ErrorDetails.Message) {
            $content = [string]$Failure.ErrorDetails.Message
        } elseif ($Failure.Exception.Response) {
            $reader = New-Object IO.StreamReader($Failure.Exception.Response.GetResponseStream())
            try { $buffer = New-Object char[] 4097; $length = $reader.ReadBlock($buffer,0,4097); if ($length -gt 0) { $content = -join $buffer[0..($length-1)] } }
            finally { $reader.Dispose() }
        }
        if ($content -and $content.Length -le 4096) {
            try {
                $problem = $content | ConvertFrom-Json
                $remoteCode = if ($problem.error_code) { [string]$problem.error_code } elseif ($problem.code -is [string]) { $problem.code } else { '' }
                $category = switch ($remoteCode) {
                    'invalid_credentials' { 'CREDENCIALES_RECHAZADAS'; break }
                    'email_not_confirmed' { 'CORREO_NO_CONFIRMADO'; break }
                    'user_banned' { 'USUARIO_BLOQUEADO'; break }
                    'over_request_rate_limit' { 'LIMITE_DE_INTENTOS'; break }
                    'captcha_failed' { 'CAPTCHA_REQUERIDO'; break }
                    default { 'AUTH_NO_CLASIFICADO' }
                }
                if ($category -eq 'AUTH_NO_CLASIFICADO' -and $problem.message -ceq 'Invalid API key') { $category = 'CLAVE_PUBLICA_RECHAZADA' }
            } catch { }
        }
        if ($status -eq 429) { $category = 'LIMITE_DE_INTENTOS' }
        elseif ($status -ge 500) { $category = 'SERVICIO_AUTH_NO_DISPONIBLE' }
        elseif ($status -eq 0) {
            $category = switch ([string]$Failure.Exception.Status) {
                'TrustFailure' { 'TLS_CERTIFICADO'; break }
                'SecureChannelFailure' { 'TLS_CONEXION'; break }
                'NameResolutionFailure' { 'DNS'; break }
                'Timeout' { 'TIEMPO_AGOTADO'; break }
                'ConnectFailure' { 'CONEXION'; break }
                default { 'CONEXION_O_CLIENTE' }
            }
        }
    } catch { }
    finally { $content = $null; $problem = $null }
    return @{ Category = $category; Status = $status }
}

function Read-LocalSecret {
    param([string]$Prompt)
    $secure = Read-Host $Prompt -AsSecureString
    $pointer = [IntPtr]::Zero
    try {
        $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
        return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    } finally {
        if ($pointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
        $secure.Dispose()
    }
}
function Read-JwtPart {
    param([string]$Part)
    $encoded = $Part.Replace('-','+').Replace('_','/')
    while ($encoded.Length % 4) { $encoded += '=' }
    return ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($encoded)) | ConvertFrom-Json)
}
function Invoke-ClosedGateway {
    param([hashtable]$Headers)
    try {
        $response = Invoke-WebRequest -UseBasicParsing -Method POST -Uri ($target + '/functions/v1/arca-homologacion') -Headers $Headers -ContentType 'application/json' -Body '{}' -MaximumRedirection 0 -TimeoutSec 30
        return @{ Status = [int]$response.StatusCode; Content = [string]$response.Content }
    } catch {
        $response = $_.Exception.Response
        if (-not $response) { throw 'GATEWAY_UNAVAILABLE' }
        $reader = New-Object IO.StreamReader($response.GetResponseStream())
        try { $content = $reader.ReadToEnd() } finally { $reader.Dispose() }
        return @{ Status = [int]$response.StatusCode; Content = $content }
    }
}
function ConvertTo-BoundedAccessText {
    param($Content)
    if ($null -eq $Content) { return '' }
    $utf8 = New-Object Text.UTF8Encoding($false, $true)
    if ($Content -is [byte[]]) {
        if ($Content.Length -gt 4096) { throw 'ACCESS_RESPONSE_TOO_LARGE' }
        try { return $utf8.GetString($Content) } catch { throw 'ACCESS_HTTP_RESPONSE_READ_FAILED' }
    }
    $text = [string]$Content
    if ($utf8.GetByteCount($text) -gt 4096) { throw 'ACCESS_RESPONSE_TOO_LARGE' }
    return $text
}
function Read-BoundedAccessStream {
    param([IO.Stream]$Stream)
    $buffer = New-Object byte[] 4097
    $length = 0
    while ($length -lt $buffer.Length) {
        $count = $Stream.Read($buffer, $length, $buffer.Length - $length)
        if ($count -eq 0) { break }
        $length += $count
    }
    if ($length -gt 4096) { throw 'ACCESS_RESPONSE_TOO_LARGE' }
    if ($length -eq 0) { return '' }
    $bytes = New-Object byte[] $length
    [Array]::Copy($buffer, $bytes, $length)
    return ConvertTo-BoundedAccessText $bytes
}
function Get-AccessFailureContent {
    param($Failure)
    $response = $Failure.Exception.Response
    if (-not $response) { throw 'ACCESS_CONNECTION_FAILED' }
    # Web Cmdlets in PS7 often already buffered the body in ErrorDetails.
    if ($Failure.ErrorDetails -and $null -ne $Failure.ErrorDetails.Message) {
        return ConvertTo-BoundedAccessText $Failure.ErrorDetails.Message
    }
    $stream = $null
    try {
        if ($response.PSObject.TypeNames -contains 'System.Net.Http.HttpResponseMessage') {
            if (-not $response.Content) { return '' }
            $stream = $response.Content.ReadAsStreamAsync().GetAwaiter().GetResult()
        } elseif ($response.PSObject.Methods['GetResponseStream']) {
            # Explicit legacy WebResponse branch for Windows PowerShell 5.1.
            $stream = $response.GetResponseStream()
        } else { throw 'ACCESS_HTTP_RESPONSE_READ_FAILED' }
        if (-not $stream) { throw 'ACCESS_HTTP_RESPONSE_READ_FAILED' }
        return Read-BoundedAccessStream $stream
    } catch {
        if ($_.Exception.Message -ceq 'ACCESS_RESPONSE_TOO_LARGE') { throw 'ACCESS_RESPONSE_TOO_LARGE' }
        throw 'ACCESS_HTTP_RESPONSE_READ_FAILED'
    } finally { if ($stream) { $stream.Dispose() } }
}
function Invoke-AccessProbe {
    param([string]$Path, [string]$Method = 'GET', [string]$Json)
    # Only callers below choose fixed read-only routes; no arbitrary RPC input.
    $request = @{ UseBasicParsing = $true; Method = $Method; Uri = ($target + $Path);
        Headers = @{ apikey = $publicKey; Authorization = ('Bearer ' + $token); Origin = $origin };
        MaximumRedirection = 0; TimeoutSec = 15 }
    if ($Method -eq 'POST') { $request.ContentType = 'application/json'; $request.Body = $Json }
    $script:accessStatus = 0
    try { $reply = Invoke-WebRequest @request } catch {
        $failure = $_
        if (-not $failure.Exception.Response) { throw 'ACCESS_CONNECTION_FAILED' }
        $status = [int]$failure.Exception.Response.StatusCode
        $script:accessStatus = $status
        $content = Get-AccessFailureContent $failure
        return @{ Status = $status; Content = $content }
    }
    $script:accessStatus = [int]$reply.StatusCode
    return @{ Status = [int]$reply.StatusCode; Content = (ConvertTo-BoundedAccessText $reply.Content) }
}
function ConvertFrom-RestoreResponse {
    param([string]$Content)
    try { return ConvertFrom-Json -InputObject $Content -ErrorAction Stop }
    catch { throw 'RESTORE_HTTP_RESPONSE_PARSE_FAILED' }
}
function Get-TestActor {
    param([switch]$OnlyViewer)
    $identity = Invoke-AccessProbe '/auth/v1/user'
    if ($identity.Status -ne 200) { throw 'IDENTITY_NOT_CONFIRMED' }
    $user = $identity.Content | ConvertFrom-Json
    $id = [string]$user.id
    if ($id -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$') { throw 'IDENTITY_NOT_CONFIRMED' }
    $profile = Invoke-AccessProbe ('/rest/v1/usuarios?select=rol,kiosco_id,activo,es_superadmin&auth_user_id=eq.' + $id + '&limit=2')
    if ($profile.Status -ne 200) { throw 'PROFILE_NOT_CONFIRMED' }
    $decoded = ConvertFrom-Json -InputObject $profile.Content
    $rows = @($decoded)
    $owner = 'DUE' + [char]0xD1 + 'O'
    $allowedRoles = if ($OnlyViewer) { @('VISOR') } else { @($owner,'CAJERO') }
    if ($rows.Count -ne 1 -or $rows[0].activo -cne $true -or $rows[0].es_superadmin -cne $false -or
        $rows[0].rol -cnotin $allowedRoles -or [string]$rows[0].kiosco_id -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$') { throw 'TEST_ACTOR_NOT_CONFIRMED' }
    $role = if ($OnlyViewer) { 'VIEWER' } elseif ($rows[0].rol -ceq $owner) { 'OWNER' } else { 'CASHIER' }
    return @{ Role = $role; Kiosk = [string]$rows[0].kiosco_id }
}
function Test-SalesIsolation {
    param([switch]$OnlyViewer)
    $actor = Get-TestActor -OnlyViewer:$OnlyViewer
    # Existing isolated fixtures independently verified in Staging on 2026-10-26.
    # Never select amounts, customers, payments or rows from arbitrary tenants.
    $ownKiosk = 'b7254826-c767-4098-94b8-71013c12021d'
    $foreignSale = '00418e7b-eca6-487c-bffe-b85b405cd9cb'
    if ($actor.Kiosk -cne $ownKiosk) { throw 'RLS_TEST_SCOPE_REQUIRED' }
    $own = Invoke-AccessProbe ('/rest/v1/ventas?select=id,kiosco_id&kiosco_id=eq.' + $ownKiosk + '&estado=eq.COMPLETADA&order=fecha_hora.desc&limit=1')
    if ($own.Status -ne 200 -or -not $own.Content.TrimStart().StartsWith('[')) { throw 'RLS_POSITIVE_CONTROL_FAILED' }
    $decoded = ConvertFrom-Json -InputObject $own.Content
    $rows = @($decoded)
    if ($rows.Count -ne 1 -or $rows[0].kiosco_id -cne $ownKiosk -or
        [string]$rows[0].id -notmatch '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' -or $rows[0].id -ceq $foreignSale) { throw 'RLS_POSITIVE_CONTROL_FAILED' }
    $ownId = [string]$rows[0].id
    # Deliberately no kiosk filter: an existing foreign row must be hidden by RLS.
    $foreign = Invoke-AccessProbe ('/rest/v1/ventas?select=id,kiosco_id&id=eq.' + $foreignSale + '&limit=1')
    if ($foreign.Status -ne 200 -or -not $foreign.Content.TrimStart().StartsWith('[')) { throw 'RLS_FOREIGN_ROW_NOT_HIDDEN' }
    $decoded = ConvertFrom-Json -InputObject $foreign.Content
    if (@($decoded).Count -ne 0) { throw 'RLS_FOREIGN_ROW_NOT_HIDDEN' }
    $recheck = Invoke-AccessProbe ('/rest/v1/ventas?select=id,kiosco_id&id=eq.' + $ownId + '&limit=1')
    if ($recheck.Status -ne 200 -or -not $recheck.Content.TrimStart().StartsWith('[')) { throw 'RLS_POSITIVE_RECHECK_FAILED' }
    $decoded = ConvertFrom-Json -InputObject $recheck.Content
    $again = @($decoded)
    if ($again.Count -ne 1 -or $again[0].id -cne $ownId -or $again[0].kiosco_id -cne $ownKiosk) { throw 'RLS_POSITIVE_RECHECK_FAILED' }
    Write-Host ('RLS_SALES_READ_ISOLATION_OBSERVED role=' + $actor.Role + ' own=1 foreign=0 positive_recheck=1. Requiere revalidar existencia ajena independientemente; no acredita RLS completo ni E2E fiscal.')
}
function Test-RestoreReadCapability {
    $actor = Get-TestActor
    $ownKiosk = 'b7254826-c767-4098-94b8-71013c12021d'
    if ($actor.Kiosk -cne $ownKiosk) { throw 'RESTORE_TEST_SCOPE_REQUIRED' }
    # STABLE read-only RPC only. Never call any restaurar_* mutation.
    $path = '/rest/v1/rpc/capacidades_restauracion_backup'
    $own = Invoke-AccessProbe $path 'POST' ('{"p_kiosco_id":"' + $ownKiosk + '"}')
    if ($actor.Role -ceq 'OWNER') {
        if ($own.Status -ne 200) { throw 'RESTORE_OWNER_READ_NOT_CONFIRMED' }
        $data = ConvertFrom-RestoreResponse $own.Content
        $modules = @($data.modulos)
        if ($data.version -cne 1 -or $data.kiosco_id -cne $ownKiosk -or
            $modules.Count -ne 3 -or ($modules -join ',') -cne 'contactos,producto_proveedor,lotes') { throw 'RESTORE_CAPABILITY_UNEXPECTED' }
    } else {
        $data = ConvertFrom-RestoreResponse $own.Content
        if ($own.Status -ne 403 -or $data.code -cne '42501') { throw 'RESTORE_CASHIER_DENIAL_NOT_CONFIRMED' }
    }
    # Sentinel is deliberately nonexistent: proves scope rejection, not foreign-row RLS.
    $other = Invoke-AccessProbe $path 'POST' '{"p_kiosco_id":"00000000-0000-0000-0000-000000000000"}'
    $data = ConvertFrom-RestoreResponse $other.Content
    if ($other.Status -ne 403 -or $data.code -cne '42501') { throw 'RESTORE_SCOPE_DENIAL_NOT_CONFIRMED' }
    Write-Host ('RESTORE_CAPABILITY_READ_OBSERVED role=' + $actor.Role + ' own=' + $(if ($actor.Role -ceq 'OWNER') {'200'} else {'403'}) + ' other=403 mutation=false')
}
function Test-ReadAccess {
    $actor = Get-TestActor
    $role = $actor.Role
    # limit=0 prevents reading any private row even if a grant regresses.
    $private = Invoke-AccessProbe '/rest/v1/fiscal_operaciones_homologacion?select=*&limit=0'
    if ($private.Status -ne 403) { throw 'PRIVATE_TABLE_DENIAL_NOT_CONFIRMED' }
    Write-Host ('AUTH_PROFILE_CONFIRMED role=' + $role + '. PRIVATE_TABLE_DIRECT_DENIED status=403. No acredita aislamiento RLS completo.')
    Write-Host 'ACCESS_PROBE_READY. Avisale a Codex ahora: listo para acceso temporal. Espera maxima: 10 minutos; no ingreses credenciales en el chat.'
    $deadline = [DateTime]::UtcNow.AddMinutes(10)
    for ($attempt = 0; $attempt -lt 120 -and [DateTime]::UtcNow -lt $deadline; $attempt++) {
        # Fixed read-only action and sentinel UUID: no save, reservation, WSAA or WSFE.
        $probe = Invoke-AccessProbe '/functions/v1/arca-homologacion' 'POST' '{"accion":"DATOS_FISCALES_VENTA","venta_id":"00000000-0000-0000-0000-000000000000"}'
        $data = $probe.Content | ConvertFrom-Json
        if ($probe.Status -eq 503 -and $data.codigo -ceq 'HOMOLOGACION_NO_HABILITADA') { Start-Sleep -Seconds 5; continue }
        if ($probe.Status -eq 409 -and $data.codigo -ceq 'OPERACION_NO_CONFIRMADA') {
            Write-Host 'BASE_READ_NEGATIVE_OBSERVED status=409. No prueba por si solo Auth/RPC privados ni acceso positivo; requiere evidencia adicional.'
            return
        }
        throw 'BASE_READ_UNEXPECTED'
    }
    throw 'BASE_WINDOW_NOT_OBSERVED'
}
try {
    if ($ComprobarCapacidadRestauracion -and ($Preparar -or $ComprobarAccesos -or $ComprobarAislamiento -or $ComprobarAislamientoVisor)) { throw 'EXCLUSIVE_TEST_MODE_REQUIRED' }
    if ($ComprobarAccesos -and $ComprobarAislamiento) { throw 'EXCLUSIVE_TEST_MODE_REQUIRED' }
    if ($ComprobarAislamientoVisor -and ($Preparar -or $ComprobarAccesos -or $ComprobarAislamiento)) { throw 'EXCLUSIVE_TEST_MODE_REQUIRED' }
    if ($Preparar) {
        Write-Host 'STAGING_JWT_HELPER_READY. Sin conexion, login, flags ni archivos.'
        $result = 0
    } else {
        Write-Host 'Solo Staging acoyfwwmhaeruciyedri. Login de ensayo y prueba JWT; sin activar flags ni llamar ARCA.'
        Write-Host 'No uses la clave service_role ni la contrasena PostgreSQL. No envies claves al chat.'
        $step = 'clave publica'
        $publicKey = Read-LocalSecret 'Clave publica anon o publishable de este Staging'
        if ($publicKey -match '^sb_publishable_[A-Za-z0-9_-]{10,200}$') { }
        elseif ($publicKey -match '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' -and $publicKey.Length -le 4096) {
            $keyClaims = Read-JwtPart ($publicKey.Split('.')[1])
            if ($keyClaims.role -cne 'anon' -or $keyClaims.ref -cne 'acoyfwwmhaeruciyedri') { throw 'PUBLIC_KEY_REQUIRED' }
            $keyClaims = $null
        } else { throw 'PUBLIC_KEY_REQUIRED' }
        $email = (Read-Host 'Correo de la cuenta de ensayo (por ejemplo prueba1@gmail.com)').Trim()
        if ($email -notmatch '^[^\s@]+@[^\s@]+\.[^\s@]+$' -or $email.Length -gt 254) { throw 'EMAIL_REQUIRED' }
        $password = Read-LocalSecret 'Contrasena de esa cuenta KioskoPOS de Staging'
        if ([string]::IsNullOrEmpty($password)) { throw 'PASSWORD_REQUIRED' }
        $step = 'login Auth de ensayo'
        $body = @{ email = $email; password = $password } | ConvertTo-Json -Compress
        try {
            $session = Invoke-RestMethod -Method POST -Uri ($target + '/auth/v1/token?grant_type=password') -Headers @{ apikey = $publicKey } -ContentType 'application/json; charset=utf-8' -Body ([Text.Encoding]::UTF8.GetBytes($body)) -MaximumRedirection 0 -TimeoutSec 30
        } catch {
            $diagnosis = Get-AuthFailureCategory $_
            $authDiagnostic = $diagnosis.Category; $authStatus = $diagnosis.Status
            throw 'AUTH_LOGIN_FAILED'
        }
        $password = $null; $body = $null; $email = $null
        $token = [string]$session.access_token
        $session = $null
        if ($token -notmatch '^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$' -or $token.Length -gt 16400) { throw 'JWT_REQUIRED' }
        $header = Read-JwtPart ($token.Split('.')[0])
        $algorithm = [string]$header.alg; $header = $null
        if ($algorithm -notin @('ES256','RS256','HS256')) { throw 'JWT_ALGORITHM_UNEXPECTED' }
        if ($ComprobarCapacidadRestauracion) {
            $step = 'capacidad restauracion solo lectura'
            Test-RestoreReadCapability
            $result = 0
        } elseif ($ComprobarAislamientoVisor) {
            $step = 'aislamiento lectura ventas Visor'
            Test-SalesIsolation -OnlyViewer
            $result = 0
        } elseif ($ComprobarAislamiento) {
            $step = 'aislamiento lectura ventas'
            Test-SalesIsolation
            $result = 0
        } elseif ($ComprobarAccesos) {
            $step = 'acceso de ensayo solo lectura'
            Test-ReadAccess
            $result = 0
        } else {
        $step = 'gateway fiscal cerrado'
        $response = Invoke-ClosedGateway @{ apikey = $publicKey; Authorization = ('Bearer ' + $token); Origin = $origin }
        if ($response.Content.Length -gt 2048) { throw 'RESPONSE_UNEXPECTED' }
        $payload = $response.Content | ConvertFrom-Json
        if ($response.Status -eq 503 -and $payload.codigo -ceq 'HOMOLOGACION_NO_HABILITADA') {
            Write-Host ('JWT_GATEWAY_PASS_BACKEND_CLOSED alg=' + $algorithm + ' status=503. Roles/RLS aun PENDIENTES.')
            $result = 0
        } elseif ($response.Status -eq 401) {
            Write-Host ('JWT_GATEWAY_REJECTED alg=' + $algorithm + ' status=401. No cambiar gateway ni claves; informar este resultado.')
            $result = 2
        } else { throw 'BACKEND_CLOSED_NOT_CONFIRMED' }
        $response = $null; $payload = $null
        }
    }
} catch {
    if ($_.Exception.Message -cin @('RLS_TEST_SCOPE_REQUIRED','RLS_POSITIVE_CONTROL_FAILED','RLS_FOREIGN_ROW_NOT_HIDDEN','RLS_POSITIVE_RECHECK_FAILED')) { $authDiagnostic = $_.Exception.Message }
    if ($_.Exception.Message -cin @('RESTORE_HTTP_RESPONSE_PARSE_FAILED','RESTORE_OWNER_READ_NOT_CONFIRMED','RESTORE_CASHIER_DENIAL_NOT_CONFIRMED','RESTORE_SCOPE_DENIAL_NOT_CONFIRMED','RESTORE_TEST_SCOPE_REQUIRED','RESTORE_CAPABILITY_UNEXPECTED','ACCESS_CONNECTION_FAILED','ACCESS_RESPONSE_TOO_LARGE','ACCESS_HTTP_RESPONSE_READ_FAILED')) {
        $authDiagnostic = $_.Exception.Message
        $authStatus = $script:accessStatus
    }
    Write-Host ('JWT_CHECK_NOT_CONFIRMED paso=' + $step + ' [' + $authDiagnostic + '] status=' + $authStatus + '. No compartir respuestas externas, claves ni contrasenas.')
    $result = 1
} finally {
    if ($token) {
        try {
            Invoke-RestMethod -Method POST -Uri ($target + '/auth/v1/logout?scope=local') -Headers @{ apikey = $publicKey; Authorization = ('Bearer ' + $token) } -MaximumRedirection 0 -TimeoutSec 30 | Out-Null
            Write-Host 'TEST_SESSION_LOGOUT_LOCAL_CONFIRMED. No se solicito cierre global de sesiones.'
        } catch {
            $result = 1
            Write-Host 'TEST_SESSION_LOGOUT_NOT_CONFIRMED. No repetir login automaticamente; informar este mensaje.'
        }
    }
    $publicKey = $null; $password = $null; $token = $null; $session = $null; $body = $null
    $response = $null; $payload = $null; $email = $null
}
exit $result
