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
const preparar = async (total: number, detalles: unknown, items: unknown, previos: unknown = []) =>
  (await db.query<{ plan: unknown }>('SELECT preparar_reintegros_historicos($1::numeric,$2::jsonb,$3::jsonb,$4::jsonb) AS plan',
    [total, JSON.stringify(detalles), JSON.stringify(items), JSON.stringify(previos)])).rows[0].plan
it('calcula por detalle original aunque dos líneas compartan producto', async () => {
  const detalles = [{ id: 'a', producto_id: 'p', cantidad: 1, subtotal: 100 }, { id: 'b', producto_id: 'p', cantidad: 2, subtotal: 200 }]
  const items = [{ detalleId: 'b', cantidad: 1 }, { detalleId: 'a', cantidad: 1 }]
  expect(await preparar(240, detalles, items)).toEqual([
    { detalle_id: 'a', cantidad: 1, importe: 80 }, { detalle_id: 'b', cantidad: 1, importe: 80 },
  ])
})
it('calcula el siguiente centavo desde cantidades previas confirmadas', async () => {
  expect(await preparar(1, [{ id: 'a', cantidad: 3, subtotal: 1 }], [{ detalleId: 'a', cantidad: 1 }], [{ detalle_id: 'a', cantidad: 1 }]))
    .toEqual([{ detalle_id: 'a', cantidad: 1, importe: 0.34 }])
})
it.each([
  { items: [{ detalleId: 'x', cantidad: 1 }] },
  { items: [{ detalleId: 'a', cantidad: 1 }, { detalleId: 'a', cantidad: 1 }] },
  { items: [{ detalleId: 'a', cantidad: '1' }] },
  { items: [{ detalleId: 'a', cantidad: 2 }] },
  { items: [] },
  { items: [{ detalleId: 'a', cantidad: 1 }], previos: [{ detalle_id: 'a', cantidad: 1 }] },
  { items: [{ detalleId: 'a', cantidad: 1 }], previos: [{ detalle_id: 'x', cantidad: 1 }] },
  { items: [{ detalleId: 'a', cantidad: 1 }], previos: [{ detalle_id: 'a', cantidad: 0 }, { detalle_id: 'a', cantidad: 0 }] },
])('rechaza detalles o cantidades sin historia consistente %j', async ({ items, previos }) => {
  await expect(preparar(100, [{ id: 'a', cantidad: 1, subtotal: 100 }], items, previos ?? [])).rejects.toThrow()
})
it('mantiene el plan histórico privado para todos los roles API', async () => {
  const { rows } = await db.query<{ ejecuta: boolean }>(`SELECT has_function_privilege(oid,
    'preparar_reintegros_historicos(numeric,jsonb,jsonb,jsonb)','EXECUTE') AS ejecuta
    FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')`)
  expect(rows).toHaveLength(3)
  expect(rows.every(r => !r.ejecuta)).toBe(true)
})
const calcular = async (cantidad: string, importe: string, previa: string, nueva: string) =>
  (await db.query<{ monto: string }>('SELECT calcular_reintegro_detalle_historico($1::numeric,$2::numeric,$3::numeric,$4::numeric) AS monto', [cantidad, importe, previa, nueva])).rows[0].monto
const distribuir = async (total: number, detalles: unknown) => (await db.query<{ importes: unknown }>(
  'SELECT distribuir_importes_historicos_devolucion($1::numeric,$2::jsonb) AS importes', [total, JSON.stringify(detalles)])).rows[0].importes
it('distribuye descuento y centavos conservando total y orden estable', async () => {
  const detalles = [{ id: 'a', subtotal: 1 }, { id: 'b', subtotal: 1 }, { id: 'c', subtotal: 1 }]
  const esperado = [{ detalle_id: 'a', importe_neto: 0.33 }, { detalle_id: 'b', importe_neto: 0.34 }, { detalle_id: 'c', importe_neto: 0.33 }]
  expect(await distribuir(1, detalles)).toEqual(esperado)
  expect(await distribuir(1, [...detalles].reverse())).toEqual(esperado)
  expect(await distribuir(240, [{ id: 'a', subtotal: 100 }, { id: 'b', subtotal: 200 }])).toEqual([
    { detalle_id: 'a', importe_neto: 80 }, { detalle_id: 'b', importe_neto: 160 },
  ])
})
it.each([{ detalles: [] }, { detalles: [{ id: 'a', subtotal: 0 }] }, { detalles: [{ id: 'a', subtotal: -1 }] },
  { detalles: [{ id: 'a', subtotal: 1 }, { id: 'a', subtotal: 1 }] }])('rechaza distribución sin historia suficiente %j', async ({ detalles }) => {
  await expect(distribuir(1, detalles)).rejects.toThrow()
})
it('admite venta completamente bonificada y revoca ejecución API de distribución', async () => {
  expect(await distribuir(0, [{ id: 'a', subtotal: 0 }])).toEqual([{ detalle_id: 'a', importe_neto: 0 }])
  const { rows } = await db.query<{ ejecuta: boolean }>(`SELECT has_function_privilege(oid,
    'distribuir_importes_historicos_devolucion(numeric,jsonb)','EXECUTE') AS ejecuta
    FROM pg_roles WHERE rolname IN ('anon','authenticated','service_role')`)
  expect(rows.every(fila => !fila.ejecuta)).toBe(true)
})
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
