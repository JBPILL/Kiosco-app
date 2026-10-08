// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'

const windows = process.platform === 'win32'
const quote = (value: string) => `'${value.replace(/'/g, "''")}'`
const script = resolve('scripts/iniciar-kioskopos-kiosco.ps1')

function ejecutar(url: string, edgeDisponible = true) {
  const command = `
    $ErrorActionPreference='Stop'
    function global:Test-Path { param($LiteralPath) return $${edgeDisponible} }
    function global:Start-Process {
      param($FilePath,$ArgumentList,$WindowStyle)
      @{ archivo=$FilePath; argumentos=$ArgumentList; ventana=$WindowStyle } | ConvertTo-Json -Compress
    }
    try { & ${quote(script)} -Url ${quote(url)} } catch { Write-Output $_.Exception.Message; exit 1 }
  `
  return spawnSync('powershell', ['-NoProfile', '-EncodedCommand', Buffer.from(command, 'utf16le').toString('base64')], {
    encoding: 'utf8', timeout: 30_000,
  })
}

it.skipIf(!windows).each([
  'http://pos.example.com', 'no-es-url', 'https://localhost', 'https://127.0.0.1',
  'https://[::1]', 'https://puesto.localhost', 'https://pos.example.com:5173',
  'https://usuario:clave@pos.example.com',
])('rechaza URL no apta para producción: %s', url => {
  const result = ejecutar(url)
  expect(result.status).toBe(1)
  expect(result.stdout).not.toContain('argumentos')
}, 30_000)

it.skipIf(!windows)('envía una URL publicada como un argumento y usa los parámetros de quiosco', () => {
  const result = ejecutar('https://pos.example.com/caja?puesto=1&local=2')
  expect(result.status, result.stderr).toBe(0)
  const data = JSON.parse(result.stdout.trim()) as { argumentos: string[]; ventana: string }
  expect(data.argumentos).toEqual(['--kiosk', 'https://pos.example.com/caja?puesto=1&local=2', '--edge-kiosk-type=fullscreen', '--no-first-run'])
  expect(data.ventana).toBe('Hidden')
}, 30_000)

it.skipIf(!windows)('informa que falta Edge sin lanzar un proceso', () => {
  const result = ejecutar('https://pos.example.com', false)
  expect(result.status).toBe(1)
  expect(result.stdout).not.toContain('argumentos')
}, 30_000)
