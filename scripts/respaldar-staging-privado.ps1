# Staging only. Uses an already-cached PostgreSQL client; never downloads an image.
param([switch]$Preparar, [switch]$FiscalInstalado053, [switch]$AntesEmisorInactivo, [string]$CertificadoRaiz = (Join-Path $env:USERPROFILE 'Downloads\prod-ca-2021.crt'))
$ErrorActionPreference = 'Stop'
$stagingImage = 'postgres:17-alpine'
$stagingRef = 'acoyfwwmhaeruciyedri'
$stagingHost = 'aws-1-sa-east-1.pooler.supabase.com'
$stagingUser = 'postgres.' + $stagingRef
$stagingRoot = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'KioskoPOS-Privado\Backups\Staging'))
$stagingRepo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$stagingPassword = $null
$stagingPlainPassword = $null
$stagingUri = $null
$stagingPasswordPointer = [IntPtr]::Zero
$stagingResult = 1
$stagingStep = 'cliente local'
$stagingDiagnostic = [pscustomobject]@{ Code = 'SIN_DETALLE' }
$stagingFiscalTables = @'
checkout_unidades_config_homologacion
checkout_unidades_homologacion
fiscal_autorizaciones_homologacion
fiscal_cancelaciones_preparacion_homologacion
fiscal_emisores_homologacion
fiscal_nc_aplicaciones_homologacion
fiscal_nc_autorizaciones_homologacion
fiscal_nc_borradores_homologacion
fiscal_nc_cancelaciones_homologacion
fiscal_nc_comercial_homologacion
fiscal_nc_conflictos_homologacion
fiscal_nc_consultas_homologacion
fiscal_nc_desistimientos_homologacion
fiscal_nc_intenciones_homologacion
fiscal_nc_permisos_homologacion
fiscal_nc_permisos_revocados_homologacion
fiscal_nc_reposiciones_homologacion
fiscal_nc_reservas_homologacion
fiscal_nc_resoluciones_homologacion
fiscal_nc_respuestas_envio_homologacion
fiscal_nc_revisiones_homologacion
fiscal_nc_series_homologacion
fiscal_nc_ta_vinculos_homologacion
fiscal_operaciones_homologacion
fiscal_parametros_homologacion
fiscal_parametros_nc_homologacion
fiscal_permisos_emision_homologacion
fiscal_preparaciones_homologacion
fiscal_preparaciones_nc_homologacion
fiscal_presentaciones_homologacion
fiscal_rechazos_corregidos_homologacion
fiscal_reconciliaciones_homologacion
fiscal_reservas_homologacion
fiscal_respuestas_emision_homologacion
fiscal_revisiones_homologacion
fiscal_revisiones_presentacion_homologacion
fiscal_series_homologacion
fiscal_solicitudes_homologacion
fiscal_sustituciones_homologacion
fiscal_ta_homologacion
fiscal_ta_intentos_homologacion
'@ -split '\r?\n'

function Get-StagingBackupHash {
    param([string]$File)
    $algorithm = [Security.Cryptography.SHA256]::Create()
    $stream = [IO.File]::OpenRead($File)
    try { return [BitConverter]::ToString($algorithm.ComputeHash($stream)).Replace('-','') }
    finally { $stream.Dispose(); $algorithm.Dispose() }
}

function Invoke-StagingBackupTool {
    param([string]$Tool, [object[]]$ToolArguments)
    if ($Tool -notin @('pg_dump','pg_restore','pg_dumpall')) { throw 'Herramienta de respaldo no permitida.' }
    if ($env:PGHOST -cne 'aws-1-sa-east-1.pooler.supabase.com' -or
        $env:PGUSER -cne 'postgres.acoyfwwmhaeruciyedri' -or
        $env:PGPORT -cne '5432' -or $env:PGDATABASE -cne 'postgres' -or
        $env:PGSSLMODE -cne 'verify-full') { throw 'Destino Staging no confirmado.' }
    $arguments = @($ToolArguments | ForEach-Object { [string]$_ })
    $isList = $Tool -eq 'pg_restore'
    if ($isList) {
        if ($arguments.Count -ne 2 -or $arguments[0] -cne '--list') { throw 'Sólo se permite listar el archivo; no restaurar.' }
        $file = [IO.Path]::GetFullPath($arguments[1])
    } else {
        $fileArgument = @($arguments | Where-Object { $_.StartsWith('--file=') })
        if ($fileArgument.Count -ne 1 -or $arguments -notcontains '--no-password') { throw 'Argumentos de respaldo inválidos.' }
        if ($Tool -eq 'pg_dumpall' -and ($arguments -notcontains '--roles-only' -or $arguments -notcontains '--no-role-passwords')) { throw 'No se permiten contraseñas de roles.' }
        $file = [IO.Path]::GetFullPath($fileArgument[0].Substring(7))
    }
    $directory = [IO.Path]::GetDirectoryName($file)
    $allowed = [IO.Path]::GetFullPath((Join-Path $env:USERPROFILE 'KioskoPOS-Privado\Backups\Staging')) + [IO.Path]::DirectorySeparatorChar
    if (-not $directory.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or $directory.Contains(',') -or $directory -match '[\r\n]') { throw 'Destino privado de archivo inválido.' }
    $containerFile = '/backup/' + [IO.Path]::GetFileName($file)
    $mapped = @($arguments | ForEach-Object { if ($_ -ceq ('--file=' + $file)) { '--file=' + $containerFile } elseif ($_ -ceq $file) { $containerFile } else { $_ } })
    $dockerArgs = @('run','--rm','--pull=never','--label','kioskopos.backup=staging-private',
        '--mount',('type=bind,source=' + $directory + ',target=/backup'),
        '--env',('PGHOST=' + $env:PGHOST),'--env','PGPORT=5432','--env','PGDATABASE=postgres',
        '--env',('PGUSER=' + $env:PGUSER),'--env','PGSSLMODE=verify-full',
        '--mount',('type=bind,source=' + $stagingCaPath + ',target=/supabase-root.crt,readonly'),
        '--env','PGSSLROOTCERT=/supabase-root.crt','--env','PGCONNECT_TIMEOUT=15')
    $nativePreference = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
    if ($isList) {
        $output = @(& docker @dockerArgs $stagingImage pg_restore @mapped 2>&1)
    } else {
        if ([string]::IsNullOrEmpty($env:PGPASSWORD) -or $env:PGPASSWORD -match '[\r\n\x00]') { throw 'Contraseña local no disponible.' }
        # Password goes through stdin, never argv, Docker environment metadata or a host file.
        $escapedPassword = $env:PGPASSWORD.Replace('\','\\').Replace(':','\:')
        $passLine = $env:PGHOST + ':5432:postgres:' + $env:PGUSER + ':' + $escapedPassword
        $OutputEncoding = New-Object Text.UTF8Encoding($false)
        $shell = 'umask 077; cat > /tmp/kiosko.pgpass; export PGPASSFILE=/tmp/kiosko.pgpass; exec "$@"'
        try { $output = @($passLine | & docker @dockerArgs '-i' $stagingImage sh '-c' $shell sh $Tool @mapped 2>&1) }
        finally { $passLine = $null; $escapedPassword = $null }
    }
    $code = $LASTEXITCODE
    } finally { $ErrorActionPreference = $nativePreference }
    $global:LASTEXITCODE = $code
    if ($code -ne 0) {
        $detail = ($output | ForEach-Object { [string]$_ }) -join "`n"
        $stagingDiagnostic.Code = if ($detail -match 'certificate verify failed|root certificate|SSL error|certificate.*(failed|verify|self.signed)') { 'TLS_CERTIFICADO' }
            elseif ($detail -match 'password authentication failed|authentication failed|Wrong password') { 'AUTENTICACION' }
            elseif ($detail -match 'could not translate host|Name or service not known') { 'DNS' }
            elseif ($detail -match 'timeout expired|timed out|Connection refused|Network is unreachable') { 'CONEXION' }
            elseif ($detail -match 'server version.*pg_dump version|server version mismatch') { 'VERSION_CLIENTE' }
            elseif ($detail -match 'permission denied|must be owner|insufficient privilege') { 'PERMISOS' }
            else { 'CLIENTE_POSTGRESQL' }
        $detail = $null; $output = $null
        throw 'Cliente PostgreSQL no confirmó el respaldo.'
    }
    $output
}

try {
    if ($FiscalInstalado053 -and $AntesEmisorInactivo) { throw 'Elegir un solo estado de respaldo.' }
    if ([Environment]::OSVersion.Platform -ne [PlatformID]::Win32NT) { throw 'Este asistente privado requiere Windows.' }
    if ($stagingRoot.StartsWith($stagingRepo + [IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)) { throw 'El respaldo debe quedar fuera del repositorio.' }
    if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
        $dockerFolder = Join-Path $env:LOCALAPPDATA 'Programs\DockerDesktop\resources\bin'
        if (-not (Test-Path -LiteralPath (Join-Path $dockerFolder 'docker.exe'))) { throw 'Docker no está disponible.' }
        $env:PATH = $dockerFolder + ';' + $env:PATH
    }
    $stagingStep = 'certificado raíz de Supabase'
    $stagingCaPath = [IO.Path]::GetFullPath($CertificadoRaiz)
    if (-not (Test-Path -LiteralPath $stagingCaPath -PathType Leaf) -or $stagingCaPath -match '[,\r\n]' -or
        ((Get-Item -LiteralPath $stagingCaPath).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'Certificado raíz local no disponible.' }
    $ca = New-Object Security.Cryptography.X509Certificates.X509Certificate2($stagingCaPath)
    try {
        if ($ca.HasPrivateKey -or $ca.Thumbprint -cne 'A4518A0933AF6949482CCA3014C007C369DF9F6F' -or
            $ca.NotBefore.ToUniversalTime() -gt [DateTime]::UtcNow -or $ca.NotAfter.ToUniversalTime() -le [DateTime]::UtcNow) { throw 'Raíz Supabase2021 no confirmada.' }
        if ([IO.File]::ReadAllText($stagingCaPath) -notmatch '-----BEGIN CERTIFICATE-----' -or
            [IO.File]::ReadAllText($stagingCaPath) -match 'PRIVATE KEY') { throw 'Se requiere certificado público PEM.' }
    } finally { $ca.Dispose() }
    $stagingStep = 'cliente local'
    $imageId = @(& docker image inspect $stagingImage --format '{{.Id}}' 2>$null)
    if ($LASTEXITCODE -ne 0 -or ($imageId -join '') -notmatch '^sha256:[a-f0-9]{64}$') { throw 'La imagen PostgreSQL17 debe estar previamente disponible; no se descarga automáticamente.' }
    $versions = @(& docker run --rm --pull=never --network none --label kioskopos.backup=staging-preflight $stagingImage sh -c 'test -r /etc/ssl/cert.pem && pg_dump --version && pg_restore --version && pg_dumpall --version' 2>$null)
    if ($LASTEXITCODE -ne 0 -or @($versions | Where-Object { $_ -match 'PostgreSQL\) 17\.' }).Count -ne 3) { throw 'Cliente PostgreSQL o certificados TLS no disponibles.' }
    Write-Host ('Destino verificado del asistente: Staging ' + $stagingRef)
    Write-Host 'Cliente local disponible. TLS verify-full. Sin descargas ni restauración.'
    Write-Host ('Carpeta prevista: ' + $stagingRoot)
    if ($FiscalInstalado053) { Write-Host 'Modo previo a SQL054: exige 41 tablas fiscales y entrada heredada/ACL en el indice. No restaura ni instala.' }
    if ($AntesEmisorInactivo) { Write-Host 'Modo previo a emisor inactivo: exige 41 tablas fiscales/ACL; equivalencia SQL054 y secretos Management siguen fuera de esta prueba.' }
    if ($Preparar) { $stagingResult = 0; return }

    $stagingStep = 'permisos privados'
    # Validate every existing ancestor before creating a new owner-only directory.
    $ancestor = $stagingRoot
    while (-not [string]::IsNullOrEmpty($ancestor)) {
        if ((Test-Path -LiteralPath $ancestor) -and ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw 'No usar enlaces o junctions para el respaldo privado.' }
        $ancestor = [IO.Path]::GetDirectoryName($ancestor)
    }
    $prefix = if ($AntesEmisorInactivo) { 'pre-emisor-inactivo-' } elseif ($FiscalInstalado053) { 'pre-sql054-' } else { 'pre-fiscal-9054cce-' }
    $destination = Join-Path $stagingRoot ($prefix + (Get-Date -Format 'yyyyMMdd-HHmmss') + '-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
    $acl = New-Object Security.AccessControl.DirectorySecurity
    $acl.SetOwner($sid); $acl.SetAccessRuleProtection($true,$false)
    $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid,'FullControl','ContainerInherit,ObjectInherit','None','Allow')
    $acl.AddAccessRule($rule)
    $aclDirectory = New-Object IO.DirectoryInfo($destination)
    if ($PSVersionTable.PSEdition -eq 'Core') {
        [IO.FileSystemAclExtensions]::SetAccessControl($aclDirectory,$acl)
        $actualAcl = [IO.FileSystemAclExtensions]::GetAccessControl($aclDirectory)
    } else {
        $aclDirectory.SetAccessControl($acl)
        $actualAcl = $aclDirectory.GetAccessControl()
    }
    if (-not $actualAcl.AreAccessRulesProtected -or @($actualAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]) | Where-Object { $_.IdentityReference -ne $sid -or $_.AccessControlType -ne 'Allow' }).Count -ne 0) { throw 'Permisos privados no confirmados.' }

    $stagingStep = 'entrada local de contraseña'
    $stagingPassword = Read-Host 'Contraseña PostgreSQL de este Staging (no la envíes al chat)' -AsSecureString
    $stagingPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($stagingPassword)
    $stagingPlainPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($stagingPasswordPointer)
    if ([string]::IsNullOrWhiteSpace($stagingPlainPassword) -or $stagingPlainPassword -match '[\r\n\x00]') { throw 'Contraseña no válida para la conexión local.' }
    $stagingUri = 'postgresql://' + $stagingUser + ':' + [Uri]::EscapeDataString($stagingPlainPassword) + '@' + $stagingHost + ':5432/postgres?sslmode=verify-full'
    function pg_dump { Invoke-StagingBackupTool -Tool pg_dump -ToolArguments $args }
    function pg_restore { Invoke-StagingBackupTool -Tool pg_restore -ToolArguments $args }
    $stagingStep = 'archivo de esquema y datos'
    & (Join-Path $PSScriptRoot 'backup_supabase.ps1') -DbUrl $stagingUri -OutputDir $destination 6>$null
    if ($LASTEXITCODE -ne 0) { throw 'Archivo PostgreSQL no confirmado.' }
    $dump = @(Get-ChildItem -LiteralPath $destination -File -Filter '*.dump')
    if ($dump.Count -ne 1) { throw 'Archivo PostgreSQL no confirmado.' }
    $stagingStep = 'índice y roles sin passwords'
    # The existing exporter restores process environment. Set it only for the roles sidecar.
    $saved = @{}
    foreach ($name in @('PGHOST','PGPORT','PGDATABASE','PGUSER','PGPASSWORD','PGSSLMODE')) { $saved[$name] = [Environment]::GetEnvironmentVariable($name,'Process') }
    try {
        $env:PGHOST=$stagingHost; $env:PGPORT='5432'; $env:PGDATABASE='postgres'; $env:PGUSER=$stagingUser; $env:PGPASSWORD=$stagingPlainPassword; $env:PGSSLMODE='verify-full'
        $index = @(Invoke-StagingBackupTool -Tool pg_restore -ToolArguments @('--list',$dump[0].FullName))
        foreach ($table in @('kioscos','usuarios','productos','ventas','detalles_venta','devoluciones_parciales_atomicas','piloto_operaciones_capacidades')) {
            if (-not ($index | Where-Object { $_ -match ('\bTABLE DATA public ' + [regex]::Escape($table) + '\s') })) { throw 'El archivo no cubre las tablas críticas.' }
        }
        if ($FiscalInstalado053 -or $AntesEmisorInactivo) {
            $stagingStep = if ($AntesEmisorInactivo) { 'indice fiscal previo a emisor inactivo' } else { 'indice fiscal previo a SQL054' }
            foreach ($table in $stagingFiscalTables) {
                if (-not ($index | Where-Object { $_ -match ('\bTABLE DATA public ' + [regex]::Escape($table) + '\s') })) { $stagingDiagnostic.Code='INDICE_FISCAL_TABLA'; throw 'Tabla fiscal ausente del indice.' }
            }
            # pg_restore lists FUNCTION identity types, but ACL may include argument names.
            $legacySignature = 'preparar_operacion_fiscal_homologacion\((?:p_operacion_id\s+)?uuid,\s*(?:p_kiosco_id\s+)?uuid,\s*(?:p_venta_id\s+)?uuid,\s*(?:p_contexto\s+)?jsonb\)\s'
            foreach ($entry in @('FUNCTION public ','ACL public FUNCTION ')) {
                if (-not ($index | Where-Object { $_ -match ('\b' + $entry + $legacySignature) })) {
                    $stagingDiagnostic.Code=if ($entry -eq 'FUNCTION public ') { 'INDICE_FISCAL_FUNCION' } else { 'INDICE_FISCAL_ACL' }
                    throw 'Entrada heredada o ACL ausente del indice.'
                }
            }
        }
        $rolesPartial = Join-Path $destination 'roles-sin-passwords.sql.partial'
        Invoke-StagingBackupTool -Tool pg_dumpall -ToolArguments @('--no-password','--roles-only','--no-role-passwords',('--file=' + $rolesPartial)) | Out-Null
        if (-not (Test-Path -LiteralPath $rolesPartial) -or (Get-Item -LiteralPath $rolesPartial).Length -eq 0) { throw 'Roles no confirmados.' }
        $roles = Join-Path $destination 'roles-sin-passwords.sql'
        Move-Item -LiteralPath $rolesPartial -Destination $roles
        $roleHash = (Get-StagingBackupHash -File $roles)
        [IO.File]::WriteAllText($roles + '.sha256',$roleHash + '  ' + [IO.Path]::GetFileName($roles) + [Environment]::NewLine,[Text.Encoding]::ASCII)
    } finally { foreach ($name in $saved.Keys) { [Environment]::SetEnvironmentVariable($name,$saved[$name],'Process') } }
    foreach ($privateFile in Get-ChildItem -LiteralPath $destination -File) {
        if ($PSVersionTable.PSEdition -eq 'Core') { $fileAcl = [IO.FileSystemAclExtensions]::GetAccessControl($privateFile) }
        else { $fileAcl = $privateFile.GetAccessControl() }
        $fileRules = @($fileAcl.GetAccessRules($true,$true,[Security.Principal.SecurityIdentifier]))
        if ($fileRules.Count -eq 0 -or @($fileRules | Where-Object { $_.IdentityReference -ne $sid -or $_.AccessControlType -ne 'Allow' }).Count -ne 0) { throw 'Archivo con permisos privados no confirmados.' }
    }
    $context = [ordered]@{status='BACKUP_ARCHIVE_VERIFIED_NOT_RESTORED';project_ref=$stagingRef;approved_sql_commit='9054cce410ae26b123f151bee2f1ad56c10767bd';created_at_utc=[DateTime]::UtcNow.ToString('o');archive=$dump[0].Name;sha256=(Get-StagingBackupHash -File $dump[0].FullName);roles='roles-sin-passwords.sql';roles_passwords_included=$false;storage_objects_included=$false;restore_executed=$false;owner_only_acl=$true;client_image_id=($imageId -join '')}
    if ($FiscalInstalado053 -or $AntesEmisorInactivo) {
        $context['requested_stage']=if ($AntesEmisorInactivo) { 'BEFORE_INITIAL_INACTIVE_ISSUER' } else { 'BEFORE_SQL054' }
        $context['fiscal_toc_tables_verified']=$stagingFiscalTables
        $context['legacy_function_and_acl_toc_verified']=$true
        $context['fiscal_schema_equivalence_proven']=$false
    }
    if ($AntesEmisorInactivo) {
        $context['expected_fiscal_revision']='054'
        $context['expected_sql054_sha256']='96a12b2f4738993af429c11deb539ff144b6dc04c2f381fee5fae3966e35b066'
        $context['management_secrets_included']=$false
        $context['issuer_provisioned_by_backup']=$false
    }
    [IO.File]::WriteAllText((Join-Path $destination 'staging-backup-context.json'),($context | ConvertTo-Json), (New-Object Text.UTF8Encoding($false)))
    Write-Host ('Respaldo Staging confirmado en: ' + $destination)
    Write-Host 'Esquema/datos y roles sin passwords verificados. No se restauró ni se instaló SQL fiscal.'
    Write-Host 'Copia sensible sin cifrado: mantener privada. Storage físico y restauración integral siguen pendientes.'
    $stagingResult = 0
} catch { Write-Host ('Respaldo privado no confirmado. Paso: ' + $stagingStep + ' [' + $stagingDiagnostic.Code + '] (' + $_.Exception.GetType().Name + '). No instalar SQL fiscal; se conservan los archivos parciales protegidos.') -ForegroundColor Red }
finally {
    if ($stagingPasswordPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($stagingPasswordPointer) }
    if ($stagingPassword) { $stagingPassword.Dispose() }
    $stagingPlainPassword=$null; $stagingUri=$null; $stagingPassword=$null
    $global:LASTEXITCODE=$stagingResult
}
exit $stagingResult
