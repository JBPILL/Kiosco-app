import { expect, it } from 'vitest'
import { adjuntarCostosHistoricos } from './movementCostAccess'
it('usa el costo privado y preserva el cero real y los históricos desconocidos', () => {
  const rows = adjuntarCostosHistoricos([
    { id:'a', costo_privado:{ precio_costo:'12' } },
    { id:'b', costo_privado:[{ precio_costo:0 }] },
    { id:'c', costo_privado:null, costo_unitario_referencia:99 },
  ],true)
  expect(rows.map((row) => row.costo_unitario_referencia)).toEqual([12,0,null])
  expect(rows[0]).not.toHaveProperty('costo_privado')
})
it('no entrega costos a un rol no autorizado ni muta los datos recibidos', () => {
  const row = { costo_unitario_referencia:99, costo_privado:{ precio_costo:12 } }
  expect(adjuntarCostosHistoricos([row],false)[0].costo_unitario_referencia).toBeNull()
  expect(row.costo_unitario_referencia).toBe(99)
})
