import { afterEach, describe, expect, it, vi } from 'vitest'
import { useDevolucionStore } from './devolucionStore'
import { ERROR_DEVOLUCIONES_FUERA_DE_ALCANCE } from '../lib/kioskPilotScope'

describe('devolucionStore en el alcance del piloto', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('rechaza procesar una devolución antes de cualquier acceso remoto en modo estricto', async () => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')

    const resultado = await useDevolucionStore.getState().procesarDevolucion({} as never)

    expect(resultado).toEqual({ success: false, error: ERROR_DEVOLUCIONES_FUERA_DE_ALCANCE })
  })

  it('con flag false conserva las validaciones normales de devolución', async () => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')

    const resultado = await useDevolucionStore.getState().procesarDevolucion({
      venta: { kiosco_id: 'k1', total: 100, detalles: [] },
      itemsADevolver: [],
      kioscoId: 'k1',
    } as never)

    expect(resultado).toEqual({ success: false, error: 'No se seleccionaron productos para devolver' })
  })
})
