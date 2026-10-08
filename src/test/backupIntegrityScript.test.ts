// @vitest-environment node
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname, basename } from 'node:path'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { expect, it } from 'vitest'

it.skipIf(process.platform !== 'win32').each(['ok','alterado','ausente','nombre','malformado'])('verifica copia local: %s', modo => {
  const root = mkdtempSync(join(tmpdir(), 'kiosko-integridad-'))
  try {
    const archivo = join(root, 'copia.dump')
    writeFileSync(archivo, modo === 'alterado' ? 'distinto' : 'copia')
    if (modo !== 'ausente') writeFileSync(archivo + '.sha256', modo === 'malformado' ? 'invalido'
      : createHash('sha256').update('copia').digest('hex') + '  ' + (modo === 'nombre' ? 'otro.dump' : 'copia.dump') + '\r\n')
    const resultado = spawnSync('powershell', ['-NoProfile','-File',resolve('scripts/verificar-respaldo-postgresql.ps1'),'-Archivo',archivo], { encoding: 'utf8', timeout: 30000 })
    expect(resultado.status, resultado.stdout + resultado.stderr).toBe(modo === 'ok' ? 0 : 1)
  } finally {
    const destino = resolve(root)
    if (dirname(destino) !== resolve(tmpdir()) || !basename(destino).startsWith('kiosko-integridad-')) throw new Error('Directorio temporal inesperado')
    rmSync(destino, { recursive: true, force: true })
  }
}, 30000)
