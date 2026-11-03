#requires -Version 7.4
[CmdletBinding()]
param(
    [switch]$DryRun,
    [switch]$CleanResiduals,
    [string]$CaCert = 'C:\Users\jonat\Downloads\prod-ca-2021.crt'
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location $repo

$dbPassword = $null

try {
    if (-not $IsWindows) {
        throw 'PLATFORM_ERROR: Este wrapper requiere entorno Windows con GUI Forms'
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
        Write-Host "Ejecutando PR03-B en modo DRY-RUN (scope=PR03_B_STAGING_ACCEPTANCE)..." -ForegroundColor Cyan
        & $node (Join-Path $PSScriptRoot 'execute-pr03-b-staging.mjs') --dry-run --scope PR03_B_STAGING_ACCEPTANCE --project-ref acoyfwwmhaeruciyedri
        return
    }

    # 6. Solicitud de contrasena PostgreSQL en memoria segura (dialogo GUI sin eco)
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'KioskoPOS - PR03-B Staging'
    $form.Size = New-Object System.Drawing.Size(420, 210)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true

    $label = New-Object System.Windows.Forms.Label
    $label.Location = New-Object System.Drawing.Point(20, 20)
    $label.Size = New-Object System.Drawing.Size(360, 40)
    $label.Text = 'Ingrese la contrasena de PostgreSQL para Staging (acoyfwwmhaeruciyedri):'
    $form.Controls.Add($label)

    $textBox = New-Object System.Windows.Forms.TextBox
    $textBox.Location = New-Object System.Drawing.Point(20, 65)
    $textBox.Size = New-Object System.Drawing.Size(360, 24)
    $textBox.PasswordChar = '*'
    $form.Controls.Add($textBox)

    $okButton = New-Object System.Windows.Forms.Button
    $okButton.Location = New-Object System.Drawing.Point(210, 115)
    $okButton.Size = New-Object System.Drawing.Size(80, 30)
    $okButton.Text = 'Aceptar'
    $okButton.DialogResult = [System.Windows.Forms.DialogResult]::OK
    $form.AcceptButton = $okButton
    $form.Controls.Add($okButton)

    $cancelButton = New-Object System.Windows.Forms.Button
    $cancelButton.Location = New-Object System.Drawing.Point(300, 115)
    $cancelButton.Size = New-Object System.Drawing.Size(80, 30)
    $cancelButton.Text = 'Cancelar'
    $cancelButton.DialogResult = [System.Windows.Forms.DialogResult]::Cancel
    $form.CancelButton = $cancelButton
    $form.Controls.Add($cancelButton)

    $form.Add_Shown({ $textBox.Focus() })
    $dialogResult = $form.ShowDialog()

    if ($dialogResult -ne [System.Windows.Forms.DialogResult]::OK -or [string]::IsNullOrWhiteSpace($textBox.Text)) {
        throw 'AUTH_CANCELLED: Operacion cancelada por el usuario o contrasena vacia'
    }

    $dbPassword = $textBox.Text
    $textBox.Text = ''
    $form.Dispose()

    # 7. Ejecucion autorizada mediante Node pasando credenciales por entorno temporal
    $env:PGPASSWORD = $dbPassword
    $dbPassword = $null

    $extraArgs = @()
    if ($CleanResiduals) {
        $extraArgs += '--clean-residuals'
    }

    try {
        & $node (Join-Path $PSScriptRoot 'execute-pr03-b-staging.mjs') `
            --authorized `
            --scope PR03_B_STAGING_ACCEPTANCE `
            --project-ref acoyfwwmhaeruciyedri `
            @extraArgs
    }
    finally {
        $env:PGPASSWORD = $null
    }
}
catch {
    Write-Error "PR03_B_WRAPPER_FATAL: $_"
    exit 1
}
finally {
    if ($null -ne $dbPassword) {
        $dbPassword = $null
    }
    [GC]::Collect()
}
