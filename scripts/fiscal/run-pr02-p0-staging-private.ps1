#requires -Version 7.4
[CmdletBinding()]
param(
    [switch]$DryRun,
    [string]$ExpectedHead,
    [string]$GoFile,
    [string]$CmsFile,
    [string]$EvidenceDir = '.fiscal-evidence-pr02'
)

$ErrorActionPreference = 'Stop'
$repo = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
Set-Location $repo

try {
    if (-not $IsWindows) {
        throw 'PLATFORM_ERROR: Este wrapper requiere entorno Windows con PowerShell 7+'
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

    if ($ExpectedHead) {
        $ExpectedHead = $ExpectedHead.Trim()
        if ($ExpectedHead -notmatch '^[0-9a-fA-F]{40}$') {
            throw "INVALID_EXPECTED_HEAD: -ExpectedHead debe ser un SHA hexadecimal de 40 caracteres, recibido '$ExpectedHead'"
        }
        if ($head -ne $ExpectedHead) {
            throw "EXPECTED_HEAD_MISMATCH: HEAD local ($head) difiere del esperado ($ExpectedHead)"
        }
    }

    if (-not $DryRun) {
        if ([string]::IsNullOrWhiteSpace($ExpectedHead)) {
            throw 'MISSING_EXPECTED_HEAD: En ejecucion autorizada se requiere obligatoriamente el parametro -ExpectedHead con un SHA de 40 caracteres hexadecimales'
        }
        if ([string]::IsNullOrWhiteSpace($GoFile)) {
            throw 'MISSING_GO_FILE: En ejecucion autorizada se requiere obligatoriamente el parametro -GoFile con la ruta al documento estructurado de autorizacion externa (GO)'
        }
        $GoFile = $GoFile.Trim()
        if (-not (Test-Path $GoFile)) {
            throw "GO_FILE_NOT_FOUND: No se encontro el archivo de autorizacion GO en '$GoFile'"
        }
    }

    # 5. Validacion de version de Node.js
    $nodeCmd = Get-Command node -CommandType Application -ErrorAction Stop | Select-Object -First 1
    if (-not $nodeCmd) {
        throw 'NODE_NOT_FOUND: node.exe no disponible en PATH'
    }

    # 6. Ejecucion de Node.js
    if ($DryRun) {
        Write-Host 'Ejecutando PR02-P0 en modo DRY-RUN (scope=PR02_P0_OFFICIAL_EVIDENCE_COLLECTION)...' -ForegroundColor Cyan
        $dryArgs = @('--dry-run', '--evidence-dir', $EvidenceDir)
        if ($ExpectedHead) {
            $dryArgs += @('--expected-head', $ExpectedHead)
        }
        & node scripts/fiscal/execute-pr02-p0-official-evidence.mjs @dryArgs
    } else {
        Write-Host "Iniciando ejecucion AUTORIZADA de PR02-P0 (scope=PR02_P0_OFFICIAL_EVIDENCE_COLLECTION)..." -ForegroundColor Yellow
        $extraArgs = @()
        if ($GoFile) {
            $extraArgs += @('--go-file', $GoFile)
        }
        if ($CmsFile) {
            $extraArgs += @('--cms-file', $CmsFile)
        }
        & node scripts/fiscal/execute-pr02-p0-official-evidence.mjs `
            --authorized `
            --scope PR02_P0_OFFICIAL_EVIDENCE_COLLECTION `
            --project-ref acoyfwwmhaeruciyedri `
            --head $head `
            --expected-head $ExpectedHead `
            --evidence-dir $EvidenceDir `
            @extraArgs
    }

    if ($LASTEXITCODE -ne 0) {
        throw "NODE_EXECUTION_FAILED: El script finalizo con codigo de error $LASTEXITCODE"
    }
}
catch {
    Write-Error "PR02_P0_WRAPPER_ERROR: $_"
    exit 1
}
