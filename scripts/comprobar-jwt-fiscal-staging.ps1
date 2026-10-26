param([switch]$Preparar)
$ErrorActionPreference = 'Stop'
$target = 'https://acoyfwwmhaeruciyedri.supabase.co'
$origin = 'https://kiosco-app-staging.vercel.app'
$publicKey = $null; $password = $null; $token = $null; $session = $null; $body = $null
$result = 1; $step = 'preparacion'

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
        $session = Invoke-RestMethod -Method POST -Uri ($target + '/auth/v1/token?grant_type=password') -Headers @{ apikey = $publicKey } -ContentType 'application/json' -Body $body -MaximumRedirection 0 -TimeoutSec 30
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
    Write-Host ('JWT_CHECK_NOT_CONFIRMED paso=' + $step + '. No compartir respuestas externas, claves ni contrasenas.')
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
