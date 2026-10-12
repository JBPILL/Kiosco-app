// @vitest-environment node
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative } from 'node:path'
import { expect, it } from 'vitest'

const raiz = process.cwd()
const migracionHistorica = join(raiz, 'legacy/historico/checkout-recovery/supabase_fase_checkout_recuperacion_auditada.sql.disabled')
const diagnosticoHistorico = join(raiz, 'legacy/historico/checkout-recovery/sql_verificar_recuperacion_auditada.sql.disabled')
const rpcDescartada = ['confirmar_checkout', 'recuperado'].join('_')

function archivos(base: string, incluir: (ruta: string) => boolean): string[] {
  return readdirSync(base, { withFileTypes: true }).flatMap(entrada => {
    const ruta = join(base, entrada.name)
    return entrada.isDirectory() ? archivos(ruta, incluir) : incluir(ruta) ? [ruta] : []
  })
}

it('conserva la propuesta descartada sólo como SQL histórico deshabilitado', () => {
  expect(migracionHistorica.endsWith('.sql.disabled')).toBe(true)
  expect(diagnosticoHistorico.endsWith('.sql.disabled')).toBe(true)
  expect(readFileSync(migracionHistorica, 'utf8').slice(0, 180)).toContain('HISTÓRICO - NO APLICAR')
  expect(readFileSync(diagnosticoHistorico, 'utf8').slice(0, 220)).toContain('HISTÓRICO - NO APLICAR')
})

it('el runtime y el bootstrap activos no contienen la RPC descartada', () => {
  const activos = [
    ...archivos(join(raiz, 'supabase/functions'), ruta => ruta.endsWith('.ts')),
    ...archivos(join(raiz, 'supabase/bootstrap'), ruta => ruta.endsWith('.sql')),
    ...archivos(join(raiz, 'src'), ruta => /\.(ts|tsx)$/.test(ruta) && !/\.(test|spec)\.(ts|tsx)$/.test(ruta)),
  ]
  const encontrados = activos.filter(ruta => readFileSync(ruta, 'utf8').includes(rpcDescartada))
    .map(ruta => relative(raiz, ruta))
  expect(encontrados).toEqual([])
})
