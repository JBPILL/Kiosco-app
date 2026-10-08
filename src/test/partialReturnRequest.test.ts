import { expect, it } from 'vitest'
import { parsearSolicitudDevolucionParcial } from '../../supabase/functions/_shared/partialReturnRequest'
const id = '10000000-0000-0000-0000-000000000001'
const entrada = { version: 1, id, ventaId: id, sesionReintegroId: id, metodo: 'EFECTIVO_CAJA', motivo: 'CAMBIO_PRODUCTO', notas: null,
  items: [{ detalleId: id, cantidad: 0.5, reingresaStock: true }] }
it('conserva identificador para reintentos sin aceptar precios ni actores', () => {
  expect(parsearSolicitudDevolucionParcial(entrada)).toEqual(entrada)
  expect(parsearSolicitudDevolucionParcial(JSON.parse(JSON.stringify(entrada)))).toEqual(entrada)
})
it.each(['precioUnitario','usuarioId','clienteId','kioscoId','montoTotal'])('rechaza campo controlado por servidor %s', campo => {
  expect(() => parsearSolicitudDevolucionParcial({ ...entrada, [campo]: id })).toThrow('Campos')
})
it.each([NaN, Infinity, 0, -1, 0.0001, 1000000])('rechaza cantidad inválida %s', cantidad => {
  expect(() => parsearSolicitudDevolucionParcial({ ...entrada, items: [{ ...entrada.items[0], cantidad }] })).toThrow()
})
it('rechaza detalle duplicado y atributos monetarios dentro del detalle', () => {
  expect(() => parsearSolicitudDevolucionParcial({ ...entrada, items: [...entrada.items, ...entrada.items] })).toThrow()
  expect(() => parsearSolicitudDevolucionParcial({ ...entrada, items: [{ ...entrada.items[0], precio: 100 }] })).toThrow()
})
it('requiere caja en efectivo y la excluye para cuenta corriente', () => {
  expect(() => parsearSolicitudDevolucionParcial({ ...entrada, sesionReintegroId: null })).toThrow()
  expect(() => parsearSolicitudDevolucionParcial({ ...entrada, metodo: 'CUENTA_CORRIENTE' })).toThrow()
  expect(parsearSolicitudDevolucionParcial({ ...entrada, metodo: 'CUENTA_CORRIENTE', sesionReintegroId: null }).sesionReintegroId).toBeNull()
})
