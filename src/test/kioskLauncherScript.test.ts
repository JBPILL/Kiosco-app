// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const windows = process.platform === 'win32'
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
const script = resolve('scripts/iniciar-kioskopos-kiosco.ps1')

function ejecutar(url: string, edgeDisponible = true, opciones: { puesto?: string; preparar?: boolean; localAppData?: string; politica?: string; instalacion?: 'x86' | 'x64' } = {}) {
  const command = `
    $ErrorActionPreference='Stop'
    $env:LOCALAPPDATA=${quote(opciones.localAppData ?? 'C:\\Users\\Caja Prueba\\AppData\\Local')}
    function global:Get-ItemProperty { param($LiteralPath,$ErrorAction) ${opciones.politica ?? 'return $null'} }
    function global:New-Item { throw 'No se deben crear archivos desde este lanzador' }
    function global:Remove-Item { throw 'No se deben eliminar perfiles' }
    function global:Set-Content { throw 'No se deben escribir archivos desde este lanzador' }
    function global:Test-Path { param($LiteralPath) return $${edgeDisponible} ${opciones.instalacion ? `-and ${opciones.instalacion === 'x86' ? '' : '-not '}$LiteralPath.Contains('(x86)')` : ''} }
    function global:Start-Process {
      param($FilePath,$ArgumentList,$WindowStyle)
      @{ archivo=$FilePath; argumentos=$ArgumentList; ventana=$WindowStyle } | ConvertTo-Json -Compress
    }
    try { & ${quote(script)} -Url ${quote(url)} -Puesto ${quote(opciones.puesto ?? 'principal')} ${opciones.preparar ? '-Preparar | ConvertTo-Json -Compress' : ''} } catch { Write-Output $_.Exception.Message; exit 1 }
  `
  return spawnSync('powershell', ['-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
    encoding: 'utf8', timeout: 30_000,
  })
}

it.skipIf(!windows).each([
  'http://pos.example.com', 'no-es-url', 'https://localhost', 'https://127.0.0.1',
  'https://[::1]', 'https://puesto.localhost', 'https://pos.example.com:5173',
  'https://usuario:clave@pos.example.com', 'https://localhost.', 'https://puesto.localhost.',
])('rechaza URL no apta para producción: %s', url => {
  const result = ejecutar(url)
  expect(result.status).toBe(1)
  expect(result.stdout).not.toContain('argumentos')
}, 30_000)

it.skipIf(!windows)('arranca como aplicación con perfil persistente y argumentos delimitados', () => {
  const result = ejecutar('https://pos.example.com/caja?puesto=1&local=2')
  expect(result.status, result.stderr).toBe(0)
  const data = JSON.parse(result.stdout.trim()) as { argumentos: string[]; ventana: string }
  expect(data.argumentos[0]).toMatch(/^--user-data-dir="C:\\Users\\Caja Prueba\\AppData\\Local\\KioskoPOS\\Puestos\\principal-[a-f0-9]{64}"$/)
  expect(data.argumentos.slice(1)).toEqual(['--app="https://pos.example.com/caja?puesto=1&local=2"', '--start-maximized', '--no-first-run'])
  expect(data.argumentos.join(' ')).not.toMatch(/--kiosk|--inprivate|--kiosk-printing|--remote-debugging/)
  expect(data.ventana).toBe('Maximized')
}, 30_000)

function preparar(url: string, puesto = 'principal') {
  const result = ejecutar(url, true, { preparar: true, puesto })
  expect(result.status, result.stderr).toBe(0)
  const data = JSON.parse(result.stdout.trim()) as { Perfil: string; Modo: string; Origen: string; Argumentos: string[] }
  expect(data.Modo).toBe('Perfil persistente')
  expect(result.stdout).not.toContain('ventana')
  return data
}
it.skipIf(!windows)('reutiliza el perfil para mismo origen y puesto aunque cambie ruta o query', () => {
  const primera = preparar('https://pos.example.com/caja?puesto=1')
  const segunda = preparar('https://POS.example.com:443/catalogo', 'PRINCIPAL')
  expect(primera.Perfil).toBe(segunda.Perfil)
  expect(primera.Argumentos).not.toEqual(segunda.Argumentos)
}, 30_000)
it.skipIf(!windows)('separa entornos, puertos y puestos sin copiar operaciones', () => {
  const perfiles = [preparar('https://pos.example.com'), preparar('https://staging.example.com'), preparar('https://pos.example.com:8443'), preparar('https://pos.example.com', 'caja-2')].map(r => r.Perfil)
  expect(new Set(perfiles).size).toBe(4)
}, 30_000)
it.skipIf(!windows).each(['../otro', 'caja dos', '--inprivate', 'caja"1'])('rechaza nombre de puesto inseguro %s', puesto => {
  const result = ejecutar('https://pos.example.com', true, { puesto })
  expect(result.status).toBe(1)
  expect(result.stdout).not.toContain('argumentos')
}, 30_000)
it.skipIf(!windows).each(['', 'ruta-relativa'])('no usa perfil por defecto si LOCALAPPDATA es inválido %j', localAppData => {
  const result = ejecutar('https://pos.example.com', true, { localAppData })
  expect(result.status).toBe(1)
  expect(result.stdout).not.toContain('argumentos')
}, 30_000)
it.skipIf(!windows).each(['UserDataDir="C:\\Compartido"', 'InPrivateModeAvailability=2', 'ClearBrowsingDataOnExit=1'])('respeta política administrada y detiene el arranque: %s', politica => {
  const result = ejecutar('https://pos.example.com', true, { politica: `return [pscustomobject]@{${politica}}` })
  expect(result.status).toBe(1)
  expect(result.stdout).not.toContain('argumentos')
}, 30_000)

it.skipIf(!windows)('informa que falta Edge sin lanzar un proceso', () => {
  const result = ejecutar('https://pos.example.com', false)
  expect(result.status).toBe(1)
  expect(result.stdout).not.toContain('argumentos')
}, 30_000)

it.skipIf(!windows)('detiene el arranque si no puede comprobar políticas', () => {
  const result = ejecutar('https://pos.example.com', true, { politica: "throw 'Lectura denegada'" })
  expect(result.status).toBe(1)
  expect(result.stdout).not.toContain('argumentos')
}, 30_000)
it.skipIf(!windows)('escapa espacios y comillas de la URL sin agregar argumentos de Edge', () => {
  const url = 'https://pos.example.com/ruta%20larga?q=%22%20--inprivate'
  const result = ejecutar(url)
  expect(result.status, result.stderr).toBe(0)
  const data = JSON.parse(result.stdout.trim()) as { argumentos: string[] }
  expect(data.argumentos).toHaveLength(4)
  expect(data.argumentos[1]).toBe(`--app="${url}"`)
}, 30_000)

it.skipIf(!windows).each(['x86', 'x64'] as const)('con una sola instalación %s conserva la ruta completa al preparar y lanzar', instalacion => {
  for (const preparar of [true, false]) {
    const result = ejecutar('https://pos.example.com', true, { instalacion, preparar })
    expect(result.status, result.stderr).toBe(0)
    const data = JSON.parse(result.stdout.trim()) as { Ejecutable?: string; archivo?: string }
    const ejecutable = preparar ? data.Ejecutable : data.archivo
    expect(ejecutable).toMatch(/^[A-Za-z]:\\.+\\Microsoft\\Edge\\Application\\msedge\.exe$/)
    expect(ejecutable?.includes('(x86)')).toBe(instalacion === 'x86')
  }
}, 30_000)
