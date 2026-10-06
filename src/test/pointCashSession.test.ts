import { expect, it } from 'vitest'
import { resolverSesionCajaPoint } from '../../supabase/functions/_shared/pointCashSession'
const fila = { id: '11111111-1111-1111-1111-111111111111', kiosco_id: 'k1', usuario_id: 'u1', estado: 'ABIERTA' }
it('resuelve únicamente una caja abierta del usuario y comercio', () => {
  expect(resolverSesionCajaPoint([fila], 'k1', 'u1')).toBe(fila.id)
  for (const value of [null, [], [fila, fila], [{ ...fila, usuario_id: 'otro' }],
    [{ ...fila, kiosco_id: 'otro' }], [{ ...fila, estado: 'CERRADA' }], [{ ...fila, id: 'inválido' }]]) {
    expect(() => resolverSesionCajaPoint(value, 'k1', 'u1')).toThrow()
  }
})
