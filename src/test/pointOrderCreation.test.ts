import { describe, expect, it, vi } from 'vitest'
import { crearOrdenIntentoPoint } from '../../supabase/functions/_shared/pointOrderCreation'
import type { IntentoPointPreparado } from '../../supabase/functions/_shared/pointOrderCreation'
import type { PointOrderSnapshot } from '../../supabase/functions/_shared/pointClient'

const intento: IntentoPointPreparado = { id: '01234567-1234-1234-1234-0123456789ab',
  kioscoId: 'k1', applicationId: '123', accountId: '456', modo: 'sandbox', terminalId: 'terminal',
  montoCentavos: 10000, estado: 'PREPARADO', orderId: null }
const orden: PointOrderSnapshot = { id: 'ORD123', status: 'created', externalReference: intento.id,
  type: 'point', countryCode: 'AR', accountId: '456', terminalId: 'terminal',
  payments: [{ id: 'PAY123', status: 'created', amount: '100.00', paidAmount: null, statusDetail: null }] }

describe('creación desde un intento congelado', () => {
  it('envía el importe original y devuelve el estado persistido sin confirmar venta', async () => {
    const crear = vi.fn(async () => orden)
    const vincular = vi.fn(async () => 'PENDIENTE')
    expect(await crearOrdenIntentoPoint(intento, { crear, vincular, permitirProduccion: false }))
      .toEqual({ orderId: 'ORD123', estadoPersistido: 'PENDIENTE' })
    expect(crear).toHaveBeenCalledWith({ intentoId: intento.id, terminalId: 'terminal', montoCentavos: 10000 })
    expect(vincular).toHaveBeenCalledWith(intento, 'ORD123')
  })

  it('marca incertidumbre ante error de red o identidad de respuesta ajena', async () => {
    const vincular = vi.fn(async () => 'CONCILIAR')
    await expect(crearOrdenIntentoPoint(intento, { permitirProduccion: false, vincular,
      crear: async () => { throw new Error('network') } })).rejects.toThrow('conciliación')
    await expect(crearOrdenIntentoPoint(intento, { permitirProduccion: false, vincular,
      crear: async () => ({ ...orden, accountId: 'otro' }) })).rejects.toThrow('conciliación')
    expect(vincular).toHaveBeenNthCalledWith(1, intento, null)
    expect(vincular).toHaveBeenNthCalledWith(2, intento, null)
  })

  it('reutiliza la orden conocida y no admite producción por defecto', async () => {
    const crear = vi.fn(async () => orden)
    const vincular = vi.fn(async () => 'PENDIENTE')
    await crearOrdenIntentoPoint({ ...intento, orderId: 'ORD123', estado: 'PENDIENTE' },
      { crear, vincular, permitirProduccion: false })
    expect(crear).not.toHaveBeenCalled()
    await expect(crearOrdenIntentoPoint({ ...intento, modo: 'production' },
      { crear, vincular, permitirProduccion: false })).rejects.toThrow('producción')
  })
})
