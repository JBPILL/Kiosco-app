// @vitest-environment node
import { readFileSync } from 'node:fs'
import { PGlite } from '@electric-sql/pglite'
import { beforeAll, afterAll, expect, it } from 'vitest'
let db: PGlite
beforeAll(async () => {
  db = new PGlite()
  await db.exec('CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;')
  const sql = readFileSync('supabase_fase_devolucion_calculo_historico.sql', 'utf8')
  await db.exec(sql); await db.exec(sql)
})
afterAll(async () => { await db.close() })
const calcular = async (cantidad: string, importe: string, previa: string, nueva: string) =>
  (await db.query<{ monto: string }>('SELECT calcular_reintegro_detalle_historico($1::numeric,$2::numeric,$3::numeric,$4::numeric) AS monto', [cantidad, importe, previa, nueva])).rows[0].monto
it('distribuye centavos acumulados sin exceder el importe original', async () => {
  expect(await calcular('3','1','0','1')).toBe('0.33')
  expect(await calcular('3','1','1','1')).toBe('0.34')
  expect(await calcular('3','1','2','1')).toBe('0.33')
})
it('admite pesables y devolución de artículo con importe cero', async () => {
  expect(await calcular('2.5','250','0.5','2')).toBe('200.00')
  expect(await calcular('1','0','0','1')).toBe('0.00')
})
it.each([
  ['0','10','0','1'], ['1','-1','0','1'], ['1','10','-1','1'], ['1','10','0','0'],
  ['1','10','1','1'], ['NaN','10','0','1'], ['1','Infinity','0','1'],
  ['1','10','0','0.0001'], ['1','1.001','0','1'],
])('rechaza valores fuera del contrato %j', async (cantidad, importe, previa, nueva) => {
  await expect(calcular(cantidad, importe, previa, nueva)).rejects.toThrow('inválido')
})
it('no permite ejecución directa a roles de API', async () => {
  const { rows } = await db.query<{ ejecuta: boolean }>(`SELECT has_function_privilege(oid,
    'calcular_reintegro_detalle_historico(numeric,numeric,numeric,numeric)','EXECUTE') AS ejecuta
    FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')`)
  expect(rows).toHaveLength(3)
  expect(rows.every(fila => !fila.ejecuta)).toBe(true)
})
