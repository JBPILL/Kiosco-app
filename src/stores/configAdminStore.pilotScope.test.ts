import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ from: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { from: mocks.from } }))

import { ERROR_RECURSOS_COMERCIALES_FUERA_DE_ALCANCE } from '../lib/kioskPilotScope'
import { useConfigAdminStore } from './configAdminStore'

function configurarConsultas() {
  mocks.from.mockImplementation((tabla: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({ data: null, error: null })),
      upsert: vi.fn(() => query),
      insert: vi.fn(() => query),
      update: vi.fn(() => query),
      then: (resolve: (value: { data: null; error: null }) => unknown) => resolve({ data: null, error: null }),
    }
    void tabla
    return query
  })
}

describe('configAdminStore en alcance del piloto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    configurarConsultas()
    useConfigAdminStore.setState({ cargando: false, guardando: false, error: null })
  })
  afterEach(() => vi.unstubAllEnvs())

  it('en modo estricto carga solo cache/default y bloquea guardado comercial', async () => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')

    await useConfigAdminStore.getState().cargarConfig()
    const guardado = await useConfigAdminStore.getState().guardarConfig({ alias_mp: 'alias-local' })

    expect(mocks.from).not.toHaveBeenCalled()
    expect(guardado).toBe(false)
    expect(useConfigAdminStore.getState().error).toBe(ERROR_RECURSOS_COMERCIALES_FUERA_DE_ALCANCE)
    expect(localStorage.getItem('kiosko_config_admin')).toBeNull()
  })

  it('con flag false conserva carga y escrituras remotas legacy', async () => {
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')

    await useConfigAdminStore.getState().cargarConfig()
    const guardado = await useConfigAdminStore.getState().guardarConfig({ alias_mp: 'alias-legacy' })

    expect(guardado).toBe(true)
    expect(mocks.from.mock.calls.map(([tabla]) => tabla)).toEqual([
      'configuracion_admin', 'planes', 'configuracion_admin', 'planes', 'planes',
    ])
  })
})
