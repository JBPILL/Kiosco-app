param(
  [Parameter(Mandatory = $true)]
  [string]$Url
)

$ErrorActionPreference = 'Stop'

$parsedUrl = $null
if (-not [System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$parsedUrl)) {
  throw 'La URL debe ser absoluta; por ejemplo, https://pos.tu-dominio.com.'
}
if ($parsedUrl.Scheme -ne 'https') {
  throw 'El modo de producción requiere HTTPS para una sesión segura y el permiso Web Serial.'
}

if ($parsedUrl.IsLoopback -or $parsedUrl.DnsSafeHost -eq 'localhost' -or
    $parsedUrl.DnsSafeHost.EndsWith('.localhost') -or $parsedUrl.Port -eq 5173) {
  throw 'Usá la URL HTTPS publicada del negocio, no localhost ni el puerto de desarrollo 5173.'
}
if ($parsedUrl.UserInfo) {
  throw 'La URL no debe contener usuario ni contraseña. Iniciá sesión dentro de la aplicación.'
}

$edgeCandidates = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if (-not $edgeCandidates) {
  throw 'No se encontró Microsoft Edge. Instalalo o ajustá la ruta del ejecutable para este puesto.'
}

$edgePath = $edgeCandidates[0]
Start-Process -FilePath $edgePath -ArgumentList @(
  '--kiosk',
  $parsedUrl.AbsoluteUri,
  '--edge-kiosk-type=fullscreen',
  '--no-first-run'
) -WindowStyle Hidden
