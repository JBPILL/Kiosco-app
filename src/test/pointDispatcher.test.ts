import { expect,it,vi } from 'vitest'
import { despacharPoint,leerTrabajoPoint,type DependenciasDespachoPoint,type TrabajoPoint } from '../../supabase/functions/_shared/pointDispatcher'
import { PointNotificationUnlinkedError } from '../../supabase/functions/_shared/pointNotificationProcessor'

const trabajo: TrabajoPoint = { id: '10000000-0000-0000-0000-000000000001',intentoId: '20000000-0000-0000-0000-000000000001',
  notificacionId: null,leaseToken: '30000000-0000-0000-0000-000000000001' }
function dependencias() {
  return { tomar: vi.fn().mockResolvedValueOnce(trabajo).mockResolvedValue(null),
    procesar: vi.fn().mockResolvedValue({ estadoPersistido: 'VENTA_CONFIRMADA',estadoEvaluado: 'PAGO_CONFIRMADO' }),
    terminar: vi.fn().mockResolvedValue(true),ahora: vi.fn().mockReturnValue(0) } satisfies DependenciasDespachoPoint
}

it('finaliza una venta y se detiene al vaciar la cola', async () => {
  const deps = dependencias()
  expect(await despacharPoint(deps)).toEqual({ tomados: 1,finalizados: 1,pendientes: 0,conciliacion: 0,errores: 0,reservasPerdidas: 0 })
  expect(deps.terminar).toHaveBeenCalledWith(trabajo,'FINALIZADO')
})
it('continúa la exploración huérfana sin incrementar fallos de infraestructura', async () => {
  const deps = dependencias()
  deps.procesar.mockRejectedValue(new PointNotificationUnlinkedError())
  const resumen = await despacharPoint(deps)
  expect(resumen.pendientes).toBe(1)
  expect(resumen.errores).toBe(0)
  expect(deps.terminar).toHaveBeenCalledWith(trabajo, 'PENDIENTE')
})
it('deja pendiente un pago confirmado sin venta y las discrepancias para conciliación', async () => {
  const deps = dependencias()
  deps.procesar.mockResolvedValue({ estadoPersistido: 'PAGO_CONFIRMADO',estadoEvaluado: 'PENDIENTE' })
  expect((await despacharPoint(deps)).pendientes).toBe(1)
  expect(deps.terminar).toHaveBeenCalledWith(trabajo,'PENDIENTE')
  const discrepante = dependencias()
  discrepante.procesar.mockResolvedValue({ estadoPersistido: 'CONCILIAR',estadoEvaluado: 'CONCILIAR' })
  expect((await despacharPoint(discrepante)).conciliacion).toBe(1)
})
it('continúa con otro trabajo tras una falla y reconoce una reserva perdida', async () => {
  const deps = dependencias()
  deps.tomar.mockResolvedValueOnce(trabajo)
  deps.procesar.mockRejectedValueOnce(new Error('Privado'))
  deps.terminar.mockResolvedValueOnce(false)
  const resumen = await despacharPoint(deps)
  expect(resumen.tomados).toBe(2)
  expect(resumen.reservasPerdidas).toBe(1)
  expect(resumen.finalizados).toBe(1)
  expect(deps.terminar).toHaveBeenNthCalledWith(1,trabajo,'ERROR')
})
it('propaga fallas al registrar resultados para recuperar la reserva por vencimiento', async () => {
  const deps = dependencias()
  deps.terminar.mockRejectedValue(new Error('No se guardó'))
  await expect(despacharPoint(deps)).rejects.toThrow('No se guardó')
  expect(deps.tomar).toHaveBeenCalledTimes(1)
})
it('limita el lote a cinco trabajos y no toma otro después del presupuesto temporal', async () => {
  const deps = dependencias()
  deps.tomar.mockResolvedValue(trabajo)
  expect((await despacharPoint(deps)).tomados).toBe(5)
  const lento = dependencias()
  lento.ahora.mockReturnValueOnce(0).mockReturnValueOnce(0).mockReturnValue(45001)
  expect((await despacharPoint(lento)).tomados).toBe(1)
})
it('rechaza trabajos manipulados y estados que no representan resultados reales', async () => {
  for (const value of [{ ...trabajo,id: '../id' },{ ...trabajo,intentoId: null },
    { ...trabajo,notificacionId: trabajo.intentoId },{ ...trabajo,leaseToken: '' }]) {
    expect(() => leerTrabajoPoint(value)).toThrow()
  }
  const deps = dependencias()
  deps.procesar.mockResolvedValue({ estadoPersistido: 'APROBADO',estadoEvaluado: 'PAGO_CONFIRMADO' })
  expect((await despacharPoint(deps)).errores).toBe(1)
})
