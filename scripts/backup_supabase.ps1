# Respaldo PostgreSQL: archivo custom con esquema y datos; no incluye archivos Storage.
# Requiere pg_dump y pg_restore de una versión compatible con el servidor.
param(
    [string]$DbUrl = $env:DATABASE_URL,
    [string]$OutputDir = "$PSScriptRoot\..\backups"
)

$ErrorActionPreference = 'Stop'
$backupExitCode = 1
$backupPartial = $null
$backupEnvironment = @{}
$backupEnvironmentNames = @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE','PGCONNECT_TIMEOUT','PGSERVICE','PGSERVICEFILE','PGOPTIONS')

try {
    if ([string]::IsNullOrWhiteSpace($DbUrl)) {
        throw 'Configurar DATABASE_URL con la conexión directa o session pooler antes de ejecutar el respaldo.'
    }
    try { $backupConnection = [Uri]$DbUrl } catch { throw 'DATABASE_URL no tiene formato URI PostgreSQL válido.' }
    if ($backupConnection.Scheme -notin @('postgres','postgresql') -or -not $backupConnection.Host) {
        throw 'DATABASE_URL no tiene formato URI PostgreSQL válido.'
    }
    if ($backupConnection.Port -eq 6543) { throw 'Usar conexión directa o session pooler; no usar transaction pooler en puerto 6543.' }
    $backupUserInfo = $backupConnection.UserInfo -split ':',2
    $backupDatabase = [Uri]::UnescapeDataString($backupConnection.AbsolutePath.TrimStart('/'))
    if ($backupUserInfo.Length -ne 2 -or -not $backupUserInfo[0] -or -not $backupDatabase -or $backupDatabase.Contains('/')) {
        throw 'La conexión debe incluir usuario, contraseña y nombre de base.'
    }
    $backupSslMode = 'require'
    if ($backupConnection.Query) {
        foreach ($backupOption in $backupConnection.Query.TrimStart('?').Split('&')) {
            $backupOptionParts = $backupOption -split '=',2
            if ($backupOptionParts.Length -ne 2 -or $backupOptionParts[0] -ne 'sslmode' -or
                $backupOptionParts[1] -notin @('require','verify-ca','verify-full')) {
                throw 'Sólo se admite la opción sslmode=require, verify-ca o verify-full en DATABASE_URL.'
            }
            $backupSslMode = $backupOptionParts[1]
        }
    }
    if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue) -or
        -not (Get-Command pg_restore -ErrorAction SilentlyContinue)) {
        throw 'Instalar las herramientas PostgreSQL pg_dump y pg_restore y agregarlas al PATH.'
    }
    $backupRoot = [IO.Path]::GetFullPath($OutputDir)
    New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
    $backupName = 'kioskopos_backup_' + (Get-Date -Format 'yyyyMMdd_HHmmss') + '_' + [Guid]::NewGuid().ToString('N')
    $backupFinal = Join-Path $backupRoot ($backupName + '.dump')
    $backupPartial = $backupFinal + '.partial'

    foreach ($backupVariable in $backupEnvironmentNames) {
        $backupEnvironment[$backupVariable] = [Environment]::GetEnvironmentVariable($backupVariable,'Process')
    }
    $backupValues = @{
        PGHOST = $backupConnection.Host
        PGPORT = $(if ($backupConnection.Port -gt 0) { [string]$backupConnection.Port } else { '5432' })
        PGDATABASE = $backupDatabase
        PGUSER = [Uri]::UnescapeDataString($backupUserInfo[0])
        PGPASSWORD = [Uri]::UnescapeDataString($backupUserInfo[1])
        PGSSLMODE = $backupSslMode
        PGCONNECT_TIMEOUT = '15'
    }
    foreach ($backupVariable in $backupEnvironmentNames) {
        [Environment]::SetEnvironmentVariable($backupVariable,$backupValues[$backupVariable],'Process')
    }

    # Sin URL/contraseña en argumentos del proceso ni salida de errores de libpq.
    $global:LASTEXITCODE = 0
    & pg_dump --no-password --format=custom --file=$backupPartial 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló. No se confirmó una copia de seguridad.' }
    if (-not (Test-Path -LiteralPath $backupPartial -PathType Leaf) -or
        (Get-Item -LiteralPath $backupPartial).Length -eq 0) {
        throw 'pg_dump no generó un archivo con contenido.'
    }
    $global:LASTEXITCODE = 0
    $backupIndex = @(& pg_restore --list $backupPartial 2>$null)
    if ($LASTEXITCODE -ne 0 -or -not ($backupIndex | Where-Object { $_ -match '\bTABLE DATA\b' })) {
        throw 'No se pudo validar el archivo o no contiene datos de tablas.'
    }
    $backupHashAlgorithm = [Security.Cryptography.SHA256]::Create()
    $backupHashStream = [IO.File]::OpenRead($backupPartial)
    try {
        $backupHash = [BitConverter]::ToString($backupHashAlgorithm.ComputeHash($backupHashStream)).Replace('-','')
    } finally {
        $backupHashStream.Dispose()
        $backupHashAlgorithm.Dispose()
    }
    Move-Item -LiteralPath $backupPartial -Destination $backupFinal
    $backupPartial = $null
    Write-Host "Archivo PostgreSQL validado: $backupFinal"
    Write-Host "SHA256: $backupHash"
    Write-Host 'Contiene datos sensibles y no está cifrado. Guardar una copia protegida fuera del equipo.'
    Write-Host 'La validación del archivo no reemplaza un ensayo de restauración. Storage y roles globales requieren respaldo separado.'
    $backupExitCode = 0
} catch {
    # Mensajes propios; nunca imprimir la URI ni detalles de errores externos.
    $backupFailure = $_.Exception.Message
    $backupKnownFailures = @(
        'Configurar DATABASE_URL con la conexión directa o session pooler antes de ejecutar el respaldo.',
        'DATABASE_URL no tiene formato URI PostgreSQL válido.',
        'Usar conexión directa o session pooler; no usar transaction pooler en puerto 6543.',
        'La conexión debe incluir usuario, contraseña y nombre de base.',
        'Sólo se admite la opción sslmode=require, verify-ca o verify-full en DATABASE_URL.',
        'Instalar las herramientas PostgreSQL pg_dump y pg_restore y agregarlas al PATH.',
        'pg_dump falló. No se confirmó una copia de seguridad.',
        'pg_dump no generó un archivo con contenido.',
        'No se pudo validar el archivo o no contiene datos de tablas.'
    )
    if ($backupFailure -notin $backupKnownFailures) { $backupFailure = 'No se pudo generar, validar o guardar el archivo de respaldo.' }
    Write-Host ('Respaldo no confirmado: ' + $backupFailure) -ForegroundColor Red
} finally {
    foreach ($backupVariable in $backupEnvironment.Keys) {
        [Environment]::SetEnvironmentVariable($backupVariable,$backupEnvironment[$backupVariable],'Process')
    }
    if ($backupPartial -and (Test-Path -LiteralPath $backupPartial -PathType Leaf)) {
        Remove-Item -LiteralPath $backupPartial -Force
    }
}
exit $backupExitCode
