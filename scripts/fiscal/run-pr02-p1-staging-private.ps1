#requires -Version 7.4
[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$CaCert = 'C:\Users\jonat\Downloads\prod-ca-2021.crt',
    [string]$ExpectedHead,
    [string]$IvaFile,
    [string]$ConditionFile,
    [string]$ManifestFile
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location $repo

$dbPassword = $null

try {
    if (-not $IsWindows) {
        throw 'PLATFORM_ERROR: Este wrapper requiere entorno Windows con GUI Forms'
    }

    # 1. Sincronizacion de referencias remotas Git
    git fetch origin --prune
    if ($LASTEXITCODE -ne 0) {
        throw "GIT_FETCH_FAILED: Falló 'git fetch origin --prune' con código de salida $LASTEXITCODE. STOP."
    }

    # 2. Validacion de rama Git
    $branch = (git rev-parse --abbrev-ref HEAD)
    if ($LASTEXITCODE -ne 0) {
        throw "GIT_BRANCH_QUERY_FAILED: Falló 'git rev-parse --abbrev-ref HEAD' con código de salida $LASTEXITCODE. STOP."
    }
    $branch = $branch.Trim()
    if ($branch -ne 'feat/pilot-envases-returns') {
        throw "BRANCH_MISMATCH: Se requiere rama feat/pilot-envases-returns, actual '$branch'"
    }

    # 3. Validacion de limpieza de arbol de trabajo
    $rawStatus = git status --porcelain
    if ($LASTEXITCODE -ne 0) {
        throw "GIT_STATUS_FAILED: Falló 'git status --porcelain' con código de salida $LASTEXITCODE. STOP."
    }
    $status = if ($rawStatus) { ($rawStatus | Out-String).Trim() } else { '' }
    if ($status -and -not $DryRun) {
        throw "DIRTY_WORKTREE: El arbol de trabajo debe estar limpio antes de la ejecucion autorizada:`n$status"
    }

    # 4. Validacion de paridad HEAD == REMOTE_HEAD y HEAD == ExpectedHead
    $head = (git rev-parse HEAD)
    if ($LASTEXITCODE -ne 0) {
        throw "GIT_HEAD_QUERY_FAILED: Falló 'git rev-parse HEAD' con código de salida $LASTEXITCODE. STOP."
    }
    $head = $head.Trim()

    $remoteHead = (git rev-parse origin/feat/pilot-envases-returns)
    if ($LASTEXITCODE -ne 0) {
        throw "GIT_REMOTE_HEAD_QUERY_FAILED: Falló 'git rev-parse origin/feat/pilot-envases-returns' con código de salida $LASTEXITCODE. STOP."
    }
    $remoteHead = $remoteHead.Trim()

    if ($head -ne $remoteHead -and -not $DryRun) {
        throw "REMOTE_HEAD_MISMATCH: HEAD ($head) difiere de origin/feat/pilot-envases-returns ($remoteHead)"
    }

    if (-not $DryRun) {
        if ([string]::IsNullOrWhiteSpace($ExpectedHead)) {
            throw 'MISSING_EXPECTED_HEAD: En ejecucion autorizada se requiere obligatoriamente el parametro -ExpectedHead con un SHA de 40 caracteres hexadecimales'
        }
        $ExpectedHead = $ExpectedHead.Trim()
        if ($ExpectedHead -notmatch '^[0-9a-fA-F]{40}$') {
            throw "INVALID_EXPECTED_HEAD: -ExpectedHead debe ser un SHA hexadecimal de 40 caracteres, recibido '$ExpectedHead'"
        }
        if ($head -ne $ExpectedHead) {
            throw "EXPECTED_HEAD_MISMATCH: HEAD local ($head) difiere del esperado ($ExpectedHead)"
        }
    }

    # 5. Validacion de version de Node.js
    $nodeCmd = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
    $node = $nodeCmd.Source
    $version = (& $node --version).Trim()
    if ($version -notmatch '^v24\.') {
        throw "NODE_VERSION_MISMATCH: Se requiere Node.js v24.x, actual '$version'"
    }

    # 6. Validacion de CA raiz PostgreSQL
    if (-not (Test-Path -LiteralPath $CaCert -PathType Leaf)) {
        throw "CA_CERT_MISSING: No se encuentra el certificado CA en '$CaCert'"
    }

    $nodeScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'execute-pr02-parameters-staging.mjs'))

    # Modo Dry-Run directo
    if ($DryRun) {
        Write-Host "Ejecutando PR02-P1 en modo DRY-RUN (scope=PR02_P1_VERIFIED_CATALOG_IMPORT)..." -ForegroundColor Cyan
        & $node $nodeScript --dry-run --scope PR02_P1_VERIFIED_CATALOG_IMPORT --project-ref acoyfwwmhaeruciyedri
        return
    }

    # 7. Solicitud de contrasena PostgreSQL en memoria segura (dialogo GUI sin eco)
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'KioskoPOS - PR02-P1 Provision Catálogo R4'
    $form.Size = New-Object System.Drawing.Size(420, 210)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true

    $label = New-Object System.Windows.Forms.Label
    $label.Location = New-Object System.Drawing.Point(20, 20)
    $label.Size = New-Object System.Drawing.Size(360, 40)
    $label.Text = 'Ingrese la contrasena de PostgreSQL para Staging PR02-P1 (acoyfwwmhaeruciyedri):'
    $form.Controls.Add($label)

    $textBox = New-Object System.Windows.Forms.TextBox
    $textBox.Location = New-Object System.Drawing.Point(20, 65)
    $textBox.Size = New-Object System.Drawing.Size(360, 24)
    $textBox.PasswordChar = '*'
    $form.Controls.Add($textBox)

    $btnOk = New-Object System.Windows.Forms.Button
    $btnOk.Location = New-Object System.Drawing.Point(180, 115)
    $btnOk.Size = New-Object System.Drawing.Size(100, 32)
    $btnOk.Text = 'Conectar'
    $btnOk.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.Controls.Add($btnOk)
    $form.AcceptButton = $btnOk

    $btnCancel = New-Object System.Windows.Forms.Button
    $btnCancel.Location = New-Object System.Drawing.Point(290, 115)
    $btnCancel.Size = New-Object System.Drawing.Size(90, 32)
    $btnCancel.Text = 'Cancelar'
    $btnCancel.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.Controls.Add($btnCancel)
    $form.CancelButton = $btnCancel

    $dialogResult = $form.ShowDialog()
    if ($dialogResult -ne [System.Windows.Forms.DialogResult]::OK) {
        throw 'USER_CANCELLED: Operacion cancelada por el usuario en el dialogo de credenciales'
    }

    $dbPassword = $textBox.Text
    $textBox.Text = ''
    $form.Dispose()

    if ([string]::IsNullOrWhiteSpace($dbPassword)) {
        throw 'EMPTY_PASSWORD: No se ingreso contrasena de PostgreSQL'
    }

    # 8. Ejecucion autorizada
    Write-Host "Iniciando PR02-P1 en Staging (acoyfwwmhaeruciyedri)..." -ForegroundColor Yellow

    $env:PGPASSWORD = $dbPassword
    $extraArgs = @()
    if ($IvaFile) { $extraArgs += @('--iva-file', $IvaFile) }
    if ($ConditionFile) { $extraArgs += @('--condition-file', $ConditionFile) }
    if ($ManifestFile) { $extraArgs += @('--manifest-file', $ManifestFile) }

    try {
        & $node $nodeScript `
            --authorized `
            --scope PR02_P1_VERIFIED_CATALOG_IMPORT `
            --project-ref acoyfwwmhaeruciyedri `
            --head $head `
            --expected-head $ExpectedHead `
            --ca-cert $CaCert `
            @extraArgs

        if ($LASTEXITCODE -ne 0) {
            throw "NODE_EXECUTION_FAILED: El proceso Node.js finalizo con codigo de error $LASTEXITCODE"
        }
    } finally {
        $env:PGPASSWORD = $null
        [Environment]::SetEnvironmentVariable('PGPASSWORD', $null, 'Process')
    }
} finally {
    $dbPassword = $null
    [GC]::Collect()
}
