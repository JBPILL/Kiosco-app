#requires -Version 7.4
[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$CaCert = 'C:\Users\jonat\Downloads\prod-ca-2021.crt',
    [string]$ExpectedHead = '0f1a29a5bfe112749e715e4bd2f340c493d08e0f'
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

    # 2. Validacion de rama Git
    $branch = (git rev-parse --abbrev-ref HEAD).Trim()
    if ($branch -ne 'feat/pilot-envases-returns') {
        throw "BRANCH_MISMATCH: Se requiere rama feat/pilot-envases-returns, actual '$branch'"
    }

    # 3. Validacion de limpieza de arbol de trabajo
    $rawStatus = git status --porcelain
    $status = if ($rawStatus) { ($rawStatus | Out-String).Trim() } else { '' }
    if ($status -and -not $DryRun) {
        throw "DIRTY_WORKTREE: El arbol de trabajo debe estar limpio antes de la ejecucion autorizada:`n$status"
    }

    # 4. Validacion de paridad HEAD == REMOTE_HEAD
    $head = (git rev-parse HEAD).Trim()
    $remoteHead = (git rev-parse origin/feat/pilot-envases-returns).Trim()
    if ($head -ne $remoteHead -and -not $DryRun) {
        throw "HEAD_MISMATCH: HEAD ($head) difiere de origin/feat/pilot-envases-returns ($remoteHead)"
    }
    if ($ExpectedHead -and $head -ne $ExpectedHead -and -not $DryRun) {
        throw "EXPECTED_HEAD_MISMATCH: HEAD ($head) difiere del esperado ($ExpectedHead)"
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

    $nodeScript = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'execute-pr02-a0-staging.mjs'))

    # Modo Dry-Run directo
    if ($DryRun) {
        Write-Host "Ejecutando PR02-A0 en modo DRY-RUN (scope=PR02_A0_STAGING_SQL_READ_ONLY)..." -ForegroundColor Cyan
        & $node $nodeScript --dry-run --scope PR02_A0_STAGING_SQL_READ_ONLY --project-ref acoyfwwmhaeruciyedri
        return
    }

    # 7. Solicitud de contrasena PostgreSQL en memoria segura (dialogo GUI sin eco)
    Add-Type -AssemblyName System.Windows.Forms
    Add-Type -AssemblyName System.Drawing

    $form = New-Object System.Windows.Forms.Form
    $form.Text = 'KioskoPOS - PR02-A0 Preflight Staging'
    $form.Size = New-Object System.Drawing.Size(420, 210)
    $form.StartPosition = 'CenterScreen'
    $form.FormBorderStyle = 'FixedDialog'
    $form.MaximizeBox = $false
    $form.MinimizeBox = $false
    $form.TopMost = $true

    $label = New-Object System.Windows.Forms.Label
    $label.Location = New-Object System.Drawing.Point(20, 20)
    $label.Size = New-Object System.Drawing.Size(360, 40)
    $label.Text = 'Ingrese la contrasena de PostgreSQL para Staging READ ONLY (acoyfwwmhaeruciyedri):'
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

    $dialogResult = $form.ShowDialog()
    if ($dialogResult -ne [System.Windows.Forms.DialogResult]::OK) {
        throw 'EXECUTION_ABORTED: Operacion cancelada por el usuario'
    }

    $dbPassword = $textBox.Text
    $textBox.Text = ''
    $form.Dispose()

    if ([string]::IsNullOrWhiteSpace($dbPassword)) {
        throw 'EMPTY_PASSWORD: La contrasena no puede estar vacia'
    }

    # 8. Ejecucion del script Node en proceso aislado con TLS estricto
    $psi = New-Object System.Diagnostics.ProcessStartInfo
    $psi.FileName = $node
    $psi.Arguments = "`"$nodeScript`" --authorized --scope PR02_A0_STAGING_SQL_READ_ONLY --project-ref acoyfwwmhaeruciyedri --head $head --expected-head $head"
    $psi.UseShellExecute = $false
    $psi.RedirectStandardOutput = $true
    $psi.RedirectStandardError = $true
    $psi.EnvironmentVariables['PGPASSWORD'] = $dbPassword
    $psi.EnvironmentVariables['PG_CA_CERT'] = $CaCert

    $proc = [System.Diagnostics.Process]::Start($psi)
    $stdout = $proc.StandardOutput.ReadToEnd()
    $stderr = $proc.StandardError.ReadToEnd()
    $proc.WaitForExit()

    # Limpiar inmediatamente variable en memoria
    $psi.EnvironmentVariables.Remove('PGPASSWORD')
    $dbPassword = $null

    if ($stdout) {
        Write-Host $stdout
    }
    if ($proc.ExitCode -ne 0) {
        if ($stderr) {
            Write-Error $stderr
        }
        throw "NODE_PROCESS_FAILED: execute-pr02-a0-staging.mjs fallo con codigo de salida $($proc.ExitCode)"
    }
}
finally {
    if ($dbPassword) {
        $dbPassword = $null
    }
}
