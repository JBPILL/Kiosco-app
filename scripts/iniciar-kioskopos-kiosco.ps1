param(
  [Parameter(Mandatory = $true)]
  [string]$Url,

  [ValidatePattern('^[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}$')]
  [string]$Puesto = 'principal',

  [switch]$Preparar
)

$ErrorActionPreference = 'Stop'

$parsedUrl = $null
if (-not [System.Uri]::TryCreate($Url, [System.UriKind]::Absolute, [ref]$parsedUrl)) {
  throw 'La URL debe ser absoluta; por ejemplo, https://pos.tu-dominio.com.'
}
if ($parsedUrl.Scheme -ne 'https') {
  throw 'El modo de producción requiere HTTPS para una sesión segura y el permiso Web Serial.'
}

$hostPuesto = $parsedUrl.DnsSafeHost.TrimEnd('.')
if ($parsedUrl.IsLoopback -or $hostPuesto -eq 'localhost' -or
    $hostPuesto.EndsWith('.localhost') -or $parsedUrl.Port -eq 5173) {
  throw 'Usá la URL HTTPS publicada del negocio, no localhost ni el puerto de desarrollo 5173.'
}
if ($parsedUrl.UserInfo) {
  throw 'La URL no debe contener usuario ni contraseña. Iniciá sesión dentro de la aplicación.'
}

# Managed policies take priority over command-line preferences. Stop instead of
# claiming isolation/persistence when Windows enforces a different profile.
foreach ($policyPath in @('HKLM:\SOFTWARE\Policies\Microsoft\Edge', 'HKCU:\SOFTWARE\Policies\Microsoft\Edge')) {
  try {
    $policy = Get-ItemProperty -LiteralPath $policyPath -ErrorAction Stop
  } catch [System.Management.Automation.ItemNotFoundException] {
    $policy = $null
  } catch {
    throw 'No se pudieron comprobar las politicas de Edge. No se iniciara el puesto hasta revisarlas.'
  }
  if ($policy.UserDataDir -or $policy.InPrivateModeAvailability -eq 2 -or $policy.ClearBrowsingDataOnExit -eq 1) {
    throw 'Hay una politica administrada de Edge incompatible con este perfil persistente. Consultar al administrador sin modificarla.'
  }
}

$edgeCandidates = @(
  (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
  (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

if (-not $edgeCandidates) {
  throw 'No se encontró Microsoft Edge. Instalalo o ajustá la ruta del ejecutable para este puesto.'
}

$edgePath = $edgeCandidates[0]
if ([string]::IsNullOrWhiteSpace($env:LOCALAPPDATA) -or
    -not [System.IO.Path]::IsPathRooted($env:LOCALAPPDATA)) {
  throw 'No se pudo determinar la carpeta local del usuario Windows. No se iniciara Edge con otro perfil.'
}

# The origin, not the route/query, identifies browser storage. Never reuse a
# personal Edge profile or copy an older profile's pending operations.
$origen = $parsedUrl.GetLeftPart([System.UriPartial]::Authority).ToLowerInvariant()
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $hash = ([System.BitConverter]::ToString($sha.ComputeHash(
    [System.Text.Encoding]::UTF8.GetBytes($origen)
  ))).Replace('-', '').ToLowerInvariant()
} finally {
  $sha.Dispose()
}
$perfil = Join-Path $env:LOCALAPPDATA ('KioskoPOS\Puestos\' + $Puesto.ToLowerInvariant() + '-' + $hash)
$argumentos = @(
  ('--user-data-dir="{0}"' -f $perfil),
  ('--app="{0}"' -f $parsedUrl.AbsoluteUri),
  '--start-maximized',
  '--no-first-run'
)

if ($Preparar) {
  [pscustomobject]@{
    Modo = 'Perfil persistente'
    Origen = $origen
    Puesto = $Puesto.ToLowerInvariant()
    Perfil = $perfil
    Ejecutable = $edgePath
    Argumentos = $argumentos
  }
  return
}

# Edge creates/reuses this profile. No deletion, session copy, permissions
# auto-grant, silent printing or Windows lockdown is performed by this script.
Start-Process -FilePath $edgePath -ArgumentList $argumentos -WindowStyle Maximized
