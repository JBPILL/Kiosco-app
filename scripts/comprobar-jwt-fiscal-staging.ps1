param([switch]$Preparar)
$ErrorActionPreference = 'Stop'
$target = 'https://acoyfwwmhaeruciyedri.supabase.co'
$origin = 'https://kiosco-app-staging.vercel.app'
$publicKey = $null; $password = $null; $token = $null; $session = $null; $body = $null
$result = 1; $step = 'preparacion'
$authDiagnostic = 'SIN_DETALLE'; $authStatus = 0

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
try {
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
} catch {
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
