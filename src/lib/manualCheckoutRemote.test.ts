import { expect, it, vi } from 'vitest'
vi.mock('./supabase', () => ({ supabase: {} }))
vi.mock('../stores/authStore', () => ({ useAuthStore: {} }))
import { leerPendientesRemotos } from './manualCheckoutRemote'
const kid = '10000000-0000-0000-0000-000000000001'
const fila = { id: '20000000-0000-0000-0000-000000000001', kioscoId: kid, usuarioId: kid, sesionCajaId: kid, fechaHora: '2026-10-07T12:00:00Z', total: 100 }
it('lee sólo metadatos y descarta campos adicionales', () => {
 expect(leerPendientesRemotos([{ ...fila, snapshot: 'NO EXPONER' }], kid)).toEqual([fila])
})
it('rechaza otro comercio, importes inválidos, identidad, fecha y duplicados', () => {
 for (const datos of [[{ ...fila, kioscoId: fila.id }], [{ ...fila, total: -1 }], [{ ...fila, total: NaN }], [{ ...fila, id: 'roto' }], [{ ...fila, fechaHora: 'roto' }], [fila, fila], null]) {
  expect(() => leerPendientesRemotos(datos, kid)).toThrow()
 }
})
