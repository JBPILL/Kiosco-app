#requires -Version 7.4
[CmdletBinding()]
param(
    [switch]$C1,
    [switch]$C2,
    [switch]$Resume,
    [switch]$DryRun,
    [string]$Certificado = (Join-Path $PSScriptRoot '../../work/arca-homologacion-recibido.crt'),
    [string]$ClaveCifrada = (Join-Path $env:LOCALAPPDATA '../../KioskoPOS-Privado/ARCA-Homologacion/20261018-0bf9336c2c1d492b9b40f83d69ffc3f9/clave-homologacion-cifrada.pem'),
    [string]$ProteccionDpapi = (Join-Path $env:LOCALAPPDATA '../../KioskoPOS-Privado/ARCA-Homologacion/20261018-0bf9336c2c1d492b9b40f83d69ffc3f9/proteccion-clave.dpapi'),
    [string]$CaCert = 'C:\Users\jonat\Downloads\prod-ca-2021.crt'
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location $repo

$password = $null
$cmsBytes = $null
$cmsBase64 = $null
$dbPassword = $null

try {
    if (-not $IsWindows) {
        throw 'PLATFORM_ERROR: Este wrapper requiere entorno Windows con DPAPI'
    }

    # 1. Validacion de rama Git
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -ne 'feat/pilot-envases-returns') {
        throw "BRANCH_MISMATCH: Se requiere rama feat/pilot-envases-returns, actual '$branch'"
    }

    # 2. Validacion de limpieza de arbol de trabajo
    $rawStatus = git status --porcelain
    $status = if ($rawStatus) { ($rawStatus | Out-String).Trim() } else { '' }
    if ($status -and -not $DryRun) {
        throw "DIRTY_WORKTREE: El arbol de trabajo debe estar limpio antes de la ejecucion autorizada:`n$status"
    }

    # 3. Validacion de paridad HEAD == REMOTE_HEAD
    $head = (git rev-parse HEAD).Trim()
    $remoteHead = (git rev-parse origin/feat/pilot-envases-returns).Trim()
    if ($head -ne $remoteHead -and -not $DryRun) {
        throw "HEAD_MISMATCH: HEAD ($head) difiere de origin/feat/pilot-envases-returns ($remoteHead)"
    }

    # 4. Validacion de version de Node.js
    $nodeCmd = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $node = $nodeCmd.Source
    $version = (& $node --version).Trim()
    if ($version -notmatch '^v24\.') {
        throw "NODE_VERSION_MISMATCH: Se requiere Node.js v24.x, actual '$version'"
    }

    # 5. Validacion de CA raiz PostgreSQL
    if (-not (Test-Path -LiteralPath $CaCert -PathType Leaf)) {
        throw "CA_CERT_MISSING: No se encuentra el certificado CA en '$CaCert'"
    }

    # Modo Dry-Run directo
    if ($DryRun) {
        $scope = if ($C1) { 'PR03_C1_PARAMETER_REFRESH' } elseif ($C2) { 'PR03_C2_CATALOG_ENABLE' } else { 'PR03_C_PARAMETER_REFRESH' }
        Write-Host "Ejecutando PR03-C en modo DRY-RUN (scope=$scope)..." -ForegroundColor Cyan
        & $node (Join-Path $PSScriptRoot 'execute-pr03-c-staging.mjs') --dry-run --scope $scope --project-ref acoyfwwmhaeruciyedri
        return
    }

    # 6. Validacion de custodia local si se requiere llamadas ARCA (C1 o Full sin resume)
    $requiresArca = (-not $C2) -and (-not $Resume)
    if ($requiresArca) {
        $certPath = [IO.Path]::GetFullPath($Certificado)
        $keyPath = [IO.Path]::GetFullPath($ClaveCifrada)
        $dpapiPath = [IO.Path]::GetFullPath($ProteccionDpapi)

        if (-not (Test-Path -LiteralPath $certPath -PathType Leaf)) { throw "CERT_MISSING: '$certPath'" }
        if (-not (Test-Path -LiteralPath $keyPath -PathType Leaf)) { throw "KEY_MISSING: '$keyPath'" }
        if (-not (Test-Path -LiteralPath $dpapiPath -PathType Leaf)) { throw "DPAPI_MISSING: '$dpapiPath'" }

        $referencias = @((Get-ChildItem -LiteralPath (Join-Path $PSHOME 'ref') -Filter '*.dll').FullName)
        $referencias += Join-Path $PSHOME 'System.Security.Cryptography.Pkcs.dll'
        Add-Type -Path (Join-Path $repo 'scripts/arca/WsaaHomologacion.cs') -ReferencedAssemblies $referencias

        $password = Get-Content -LiteralPath $dpapiPath -Raw | ConvertTo-SecureString
        $ahora = [DateTimeOffset]::UtcNow
        $tra = [WsaaHomologacion]::BuildTra($ahora, 'wsfe', [uint32]$ahora.ToUnixTimeSeconds())
        $cmsBytes = [WsaaHomologacion]::SignTra($certPath, $keyPath, $password, $tra)
        $cmsBase64 = [Convert]::ToBase64String($cmsBytes)
        [Array]::Clear($cmsBytes, 0, $cmsBytes.Length)
        $password.Dispose()
        $password = $null
        Write-Host "CUSTODY_PREFLIGHT=PASS (Certificado y clave coinciden en memoria privada)" -ForegroundColor Green
    }

    # 7. Solicitud de contrasena PostgreSQL en memoria segura (dialogo GUI sin eco)
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'KioskoPOS - PR03-C Staging'
    $form.Size = New-Object System.Drawing.Size(460, 200)
    $form.StartPosition = 'CenterScreen'
    $form.TopMost = $true
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false

    $label = New-Object System.Windows.Forms.Label
    $label.Location = New-Object System.Drawing.Point(20, 15)
    $label.Size = New-Object System.Drawing.Size(410, 40)
    $label.Text = "Contrasena PostgreSQL Staging (acoyfwwmhaeruciyedri):`n(Mantenida unicamente en memoria privada y nunca persistida)"

    $tb = New-Object System.Windows.Forms.TextBox
    $tb.Location = New-Object System.Drawing.Point(20, 65)
    $tb.Size = New-Object System.Drawing.Size(400, 25)
    $tb.PasswordChar = '*'

    $btnOk = New-Object System.Windows.Forms.Button
    $btnOk.Location = New-Object System.Drawing.Point(190, 110)
    $btnOk.Size = New-Object System.Drawing.Size(130, 32)
    $btnOk.Text = 'Continuar'
    $btnOk.DialogResult = [System.Windows.Forms.DialogResult]::OK

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.Location = New-Object System.Drawing.Point(330, 110)
    $btnCancel.Size = New-Object System.Drawing.Size(90, 32)
    $btnCancel.Text = 'Cancelar'
    $btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel

    $form.Controls.AddRange(@($label, $tb, $btnOk, $btnCancel))
    $form.AcceptButton = $btnOk
    $form.CancelButton = $btnCancel

    $dialogRes = $form.ShowDialog()
    if ($dialogRes -ne [System.Windows.Forms.DialogResult]::OK -or [string]::IsNullOrWhiteSpace($tb.Text)) {
        $tb.Text = ''
        throw 'USER_CANCELLED: No se ingreso la contrasena de PostgreSQL'
    }

    $dbPassword = $tb.Text
    $tb.Text = ''

    # 8. Determinacion de scope y flags
    $scope = if ($C1) {
        'PR03_C1_PARAMETER_REFRESH'
    } elseif ($C2) {
        'PR03_C2_CATALOG_ENABLE'
    } else {
        'PR03_C_PARAMETER_REFRESH'
    }

    $execArgs = @(
        (Join-Path $PSScriptRoot 'execute-pr03-c-staging.mjs'),
        '--authorized',
        '--scope', $scope,
        '--project-ref', 'acoyfwwmhaeruciyedri'
    )
    if ($Resume) {
        $execArgs += '--resume-existing-revision3'
    }

    # 9. Ejecucion aislada pasando credenciales en entorno de proceso privado
    $env:PGPASSWORD = $dbPassword
    $env:PGSSLROOTCERT = $CaCert
    if ($cmsBase64) {
        $env:ARCA_CMS_BASE64 = $cmsBase64
    }

    & $node @execArgs
} finally {
    $env:PGPASSWORD = $null
    $env:PGSSLROOTCERT = $null
    $env:ARCA_CMS_BASE64 = $null
    $dbPassword = $null
    $cmsBase64 = $null
    if ($password) { $password.Dispose() }
    if ($cmsBytes) { [Array]::Clear($cmsBytes, 0, $cmsBytes.Length) }
}
