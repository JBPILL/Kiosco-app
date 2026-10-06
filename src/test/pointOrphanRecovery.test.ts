import { expect, it, vi } from 'vitest'
import { recuperarOrdenPoint } from '../../supabase/functions/_shared/pointOrphanRecovery'
import { procesarNotificacionPoint } from '../../supabase/functions/_shared/pointNotificationProcessor'
import { PointApiError } from '../../supabase/functions/_shared/pointClient'
import type { PointRecoveryCheckpoint } from '../../supabase/functions/_shared/pointOrphanRecovery'

const kid = '11111111-1111-1111-1111-111111111111'
const attempt = '22222222-2222-2222-2222-222222222222'
const notification = { id: 'n1', orderId: 'ORD123', applicationId: '123' }
function dependencies() {
  return {
    cuentas: { [kid]: { applicationId: '123', accountId: '456', accessToken: 'private', modo: 'sandbox' as const } },
    consultar: vi.fn().mockResolvedValue({ id: 'ORD123', type: 'point', countryCode: 'AR',
      externalReference: attempt, accountId: '456', terminalId: 'terminal', status: 'processed',
      payments: [{ id: 'PAY123', amount: '150', paidAmount: '150', status: 'processed', statusDetail: 'accredited' }] }),
    buscarIntento: vi.fn().mockResolvedValue({ id: attempt, kiosco_id: kid, order_id: null,
      terminal_id: 'terminal', monto_centavos: 15000, application_id: '123', account_id: '456', modo: 'sandbox' }),
    vincular: vi.fn().mockResolvedValue(undefined),
    guardarCheckpoint: vi.fn().mockResolvedValue(undefined),
  }
}

it('recupera y vincula el intento existente desde la orden consultada', async () => {
  const deps = dependencies()
  const result = await recuperarOrdenPoint(notification, deps)
  expect(result?.expected.attemptId).toBe(attempt)
  expect(deps.buscarIntento).toHaveBeenCalledWith(attempt, kid)
  expect(deps.vincular).toHaveBeenCalledWith(result)
})

it('no vincula importes discrepantes ni una orden ya vinculada a otra identidad', async () => {
  for (const cambio of [{ monto_centavos: 15001 }, { order_id: 'ORDotro' }]) {
    const deps = dependencies()
    const fila = await deps.buscarIntento()
    deps.buscarIntento.mockResolvedValue({ ...fila, ...cambio })
    expect(await recuperarOrdenPoint(notification, deps)).toBeNull()
    expect(deps.vincular).not.toHaveBeenCalled()
  }
})

it('deja pendiente la notificación ante fallas de consulta y no consulta otra aplicación', async () => {
  const deps = dependencies()
  deps.consultar.mockRejectedValue(new Error('Sin conexión'))
  await expect(recuperarOrdenPoint(notification, deps)).rejects.toThrow('Sin conexión')
  expect(deps.guardarCheckpoint).not.toHaveBeenCalled()
  deps.consultar.mockClear()
  expect(await recuperarOrdenPoint({ ...notification, applicationId: 'otra' }, deps)).toBeNull()
  expect(deps.consultar).not.toHaveBeenCalled()
  expect(deps.vincular).not.toHaveBeenCalled()
})

it('reanuda una cuenta por llamada y conserva el candidato hasta agotar todas las cuentas', async () => {
  const deps = dependencies()
  const otro = '33333333-3333-3333-3333-333333333333'
  const cuentas = { ...deps.cuentas, [otro]: { ...deps.cuentas[kid], accountId: '789' } }
  expect(await recuperarOrdenPoint(notification, { ...deps, cuentas })).toBeNull()
  expect(deps.consultar).toHaveBeenCalledOnce()
  expect(deps.vincular).not.toHaveBeenCalled()
  const checkpoint = deps.guardarCheckpoint.mock.calls[0][0] as PointRecoveryCheckpoint
  expect(checkpoint.siguiente).toBe(1)
  expect(checkpoint.candidatos).toEqual([{ intentoId: attempt, kioscoId: kid }])
  deps.consultar.mockRejectedValueOnce(new PointApiError(404, false))
  const result = await recuperarOrdenPoint(notification, { ...deps, cuentas, checkpoint })
  expect(deps.consultar).toHaveBeenLastCalledWith('ORD123', otro)
  expect(result?.expected.attemptId).toBe(attempt)
  expect(deps.vincular).toHaveBeenCalledOnce()
})

it('no avanza ni vincula tras timeout, 401, 403, 429 o 500 de una cuenta restante', async () => {
  const deps = dependencies()
  const otro = '33333333-3333-3333-3333-333333333333'
  const cuentas = { ...deps.cuentas, [otro]: { ...deps.cuentas[kid], accountId: '789' } }
  await recuperarOrdenPoint(notification, { ...deps, cuentas })
  const checkpoint = deps.guardarCheckpoint.mock.calls[0][0] as PointRecoveryCheckpoint
  deps.guardarCheckpoint.mockClear()
  for (const status of [null, 401, 403, 429, 500]) {
    deps.consultar.mockRejectedValueOnce(new PointApiError(status, status === null || status >= 429))
    await expect(recuperarOrdenPoint(notification, { ...deps, cuentas, checkpoint })).rejects.toThrow()
    expect(deps.guardarCheckpoint).not.toHaveBeenCalled()
    expect(deps.vincular).not.toHaveBeenCalled()
  }
})

it('no vincula dos identidades candidatas aunque aparezcan en llamadas diferentes', async () => {
  const deps = dependencies()
  const otro = '33333333-3333-3333-3333-333333333333'
  const segundo = '44444444-4444-4444-4444-444444444444'
  const cuentas = { ...deps.cuentas, [otro]: { ...deps.cuentas[kid], accountId: '789' } }
  await recuperarOrdenPoint(notification, { ...deps, cuentas })
  const checkpoint = deps.guardarCheckpoint.mock.calls[0][0] as PointRecoveryCheckpoint
  const orden = await deps.consultar()
  const fila = await deps.buscarIntento()
  deps.consultar.mockResolvedValue({ ...orden, accountId: '789', externalReference: segundo })
  deps.buscarIntento.mockResolvedValue({ ...fila, id: segundo, kiosco_id: otro, account_id: '789' })
  expect(await recuperarOrdenPoint(notification, { ...deps, cuentas, checkpoint })).toBeNull()
  expect(deps.vincular).not.toHaveBeenCalled()
  expect(deps.guardarCheckpoint).toHaveBeenLastCalledWith(null)
})

it('reinicia la exploración al cambiar identidad de cuenta y no persiste el token', async () => {
  const deps = dependencies()
  const otro = '33333333-3333-3333-3333-333333333333'
  const cuentas = { ...deps.cuentas, [otro]: deps.cuentas[kid] }
  await recuperarOrdenPoint(notification, { ...deps, cuentas })
  const checkpoint = deps.guardarCheckpoint.mock.calls[0][0] as PointRecoveryCheckpoint
  expect(JSON.stringify(checkpoint)).not.toContain('private')
  await recuperarOrdenPoint(notification, { ...deps, checkpoint,
    cuentas: { ...cuentas, [kid]: { ...cuentas[kid], accountId: '999' } } })
  expect(deps.consultar).toHaveBeenLastCalledWith('ORD123', kid)
})

it('rechaza configuraciones con más de 256 cuentas antes de consultar', async () => {
  const deps = dependencies()
  const cuentas = Object.fromEntries(Array.from({ length: 257 }, (_, i) => [
    `00000000-0000-0000-0000-${i.toString(16).padStart(12, '0')}`, deps.cuentas[kid],
  ]))
  await expect(recuperarOrdenPoint(notification, { ...deps, cuentas })).rejects.toThrow('Demasiadas cuentas')
  expect(deps.consultar).not.toHaveBeenCalled()
})

it('no vincula si falla la persistencia del avance', async () => {
  const deps = dependencies()
  deps.guardarCheckpoint.mockRejectedValue(new Error('CAS perdido'))
  await expect(recuperarOrdenPoint(notification, deps)).rejects.toThrow('CAS perdido')
  expect(deps.vincular).not.toHaveBeenCalled()
})

it('rechaza una cuenta, terminal, referencia u origen ajenos al intento', async () => {
  for (const cambio of [{ accountId: '999' }, { terminalId: 'otro' },
    { externalReference: '33333333-3333-3333-3333-333333333333' }, { type: 'online' }, { countryCode: 'BR' }]) {
    const deps = dependencies()
    const orden = await deps.consultar()
    deps.consultar.mockResolvedValue({ ...orden, ...cambio })
    expect(await recuperarOrdenPoint(notification, deps)).toBeNull()
    expect(deps.vincular).not.toHaveBeenCalled()
  }
})

it('no informa recuperación si falla la vinculación persistente', async () => {
  const deps = dependencies()
  deps.vincular.mockRejectedValue(new Error('No se pudo guardar'))
  await expect(recuperarOrdenPoint(notification, deps)).rejects.toThrow('No se pudo guardar')
})

it('vuelve a consultar la orden recuperada antes de guardar su estado financiero', async () => {
  const recovery = dependencies()
  const guardarResultado = vi.fn().mockResolvedValue('PENDIENTE')
  const consultarProveedor = vi.fn().mockResolvedValue({ ...await recovery.consultar(), status: 'at_terminal',
    payments: [{ id: 'PAY123', amount: '150', paidAmount: null, status: 'at_terminal', statusDetail: null }] })
  const result = await procesarNotificacionPoint(notification, {
    buscarContexto: vi.fn().mockResolvedValue(null),
    recuperarContexto: (recepcion) => recuperarOrdenPoint(recepcion, recovery),
    consultarProveedor, guardarResultado, confirmarVenta: vi.fn(),
  })
  expect(recovery.vincular).toHaveBeenCalledOnce()
  expect(consultarProveedor).toHaveBeenCalledWith('ORD123', kid)
  expect(result).toEqual({ evaluacion: { estado: 'PENDIENTE' }, estadoPersistido: 'PENDIENTE' })
  expect(guardarResultado).toHaveBeenCalledWith(notification, expect.any(Object), { estado: 'PENDIENTE' })
})
