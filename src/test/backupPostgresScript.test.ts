// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, dirname, join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

const windows = process.platform === 'win32'
const quote = (value: string) => `'${value.replace(/'/g,"''")}'`
const script = resolve('scripts/backup_supabase.ps1')
const secret = 'SyntheticSecret123'
const uri = `postgresql://test:${secret}@example.invalid:5432/postgres`

function ejecutar(modo: string, conexion = uri) {
  const root = mkdtempSync(join(tmpdir(),'kiosko-backup-test-'))
  const out = join(root,'out')
  try {
    const runner = join(root,'runner.ps1')
    writeFileSync(runner, `\uFEFF
      function global:pg_dump {
        $file = ($args | Where-Object { $_ -like '--file=*' }).Substring(7)
        if (${quote(modo)} -ne 'empty') { [IO.File]::WriteAllText($file,'archive-fixture') }
        if ($args -match 'postgresql' -or $env:PGSERVICE) { throw 'Credenciales o servicio en argumentos' }
        if ($args -notcontains '--no-password' -or $args -notcontains '--format=custom') { throw 'Formato o modo no interactivo ausente' }
        if (${quote(modo)} -eq 'tool-throws') { throw ${quote(secret)} }
        $global:LASTEXITCODE = $(if (${quote(modo)} -eq 'dump-fail') { 1 } else { 0 })
      }
      function global:pg_restore {
        $global:LASTEXITCODE = $(if (${quote(modo)} -eq 'restore-fail') { 1 } else { 0 })
        if (${quote(modo)} -ne 'schema-only') { '123; 0 1 TABLE DATA public ventas postgres' }
      }
      $env:PGHOST='previous-host'; $env:PGPASSWORD='previous-password'; $env:PGSERVICE='previous-service'
      & ${quote(script)} -DbUrl ${quote(conexion)} -OutputDir ${quote(out)}
      $resultCode=$LASTEXITCODE
      Write-Output ('ENV:'+$env:PGHOST+':'+$env:PGPASSWORD+':'+$env:PGSERVICE)
      exit $resultCode
    `,'utf8')
    const result = spawnSync('powershell',['-NoProfile','-ExecutionPolicy','Bypass','-File',runner],{ encoding:'utf8',timeout:30_000 })
    const files = existsSync(out) ? readdirSync(out) : []
    const content = files.filter(f=>f.endsWith('.dump')).map(f=>readFileSync(join(out,f),'utf8'))
    return { status:result.status, output:result.stdout+result.stderr, files, content }
  } finally {
    const target = resolve(root)
    if (dirname(target)!==resolve(tmpdir()) || !basename(target).startsWith('kiosko-backup-test-')) throw new Error('Directorio de prueba inesperado')
    rmSync(target,{ recursive:true,force:true })
  }
}

it.skipIf(!windows)('confirma sólo un archivo validado y restaura entorno sin exponer contraseña', () => {
  const result = ejecutar('ok')
  expect(result.status,result.output).toBe(0)
  expect(result.files).toHaveLength(1)
  expect(result.content).toEqual(['archive-fixture'])
  expect(result.output).toContain('SHA256:')
  expect(result.output).toContain('ENV:previous-host:previous-password:previous-service')
  expect(result.output).not.toContain(secret)
},30_000)

it.skipIf(!windows).each(['dump-fail','empty','restore-fail','schema-only','tool-throws'])('rechaza %s y elimina el archivo parcial', (modo) => {
  const result = ejecutar(modo)
  expect(result.status).toBe(1)
  expect(result.files).toHaveLength(0)
  expect(result.output).toContain('Respaldo no confirmado:')
  expect(result.output).not.toContain(secret)
},30_000)

it.skipIf(!windows).each(['',uri.replace(':5432',':6543'),uri+'?sslmode=disable'])('rechaza conexión ausente o insegura sin publicar datos', (conexion) => {
  const result = ejecutar('ok',conexion)
  expect(result.status).toBe(1)
  expect(result.files).toHaveLength(0)
  expect(result.output).not.toContain(secret)
},30_000)
