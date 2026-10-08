param([Parameter(Mandatory=$true)][string]$Archivo)
$ErrorActionPreference = 'Stop'
try {
    $copia = [IO.Path]::GetFullPath($Archivo)
    if (-not (Test-Path -LiteralPath $copia -PathType Leaf)) { throw 'Archivo ausente' }
    $manifiesto = $copia + '.sha256'
    if (-not (Test-Path -LiteralPath $manifiesto -PathType Leaf)) { throw 'Manifiesto ausente' }
    $contenido = [IO.File]::ReadAllText($manifiesto).TrimEnd("`r", "`n")
    if ($contenido -notmatch '^([A-Fa-f0-9]{64})  ([^\r\n]+)$') { throw 'Manifiesto inválido' }
    $esperado = $Matches[1]
    if ($Matches[2] -cne [IO.Path]::GetFileName($copia)) { throw 'Nombre distinto' }
    $algoritmo = [Security.Cryptography.SHA256]::Create()
    $flujo = [IO.File]::OpenRead($copia)
    try { $actual = [BitConverter]::ToString($algoritmo.ComputeHash($flujo)).Replace('-','') }
    finally { $flujo.Dispose(); $algoritmo.Dispose() }
    if ($actual -ne $esperado) { throw 'Contenido distinto' }
    Write-Host 'Integridad SHA256 comprobada. No demuestra restaurabilidad ni autenticidad de origen.'
    exit 0
} catch {
    Write-Host 'Integridad no confirmada: falta la copia/manifiesto o el contenido no coincide.' -ForegroundColor Red
    exit 1
}
