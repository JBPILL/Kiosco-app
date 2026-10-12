import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  getSession: vi.fn(),
  onAuthStateChange: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: mocks.from,
    auth: {
      signInWithPassword: mocks.signInWithPassword,
      signOut: mocks.signOut,
      getSession: mocks.getSession,
      onAuthStateChange: mocks.onAuthStateChange,
    },
  },
}))

import { useAuthStore } from './authStore'

const usuario = {
  id: 'u1', auth_user_id: 'auth-u1', kiosco_id: 'k1', nombre: 'Dueño', email: 'dueno@example.test',
  rol: 'DUEÑO' as const, activo: true, fecha_creacion: '2026-01-01', es_superadmin: false,
}
const kiosco = {
  id: 'k1', nombre: 'Kiosco', direccion: null, telefono: null, estado_suscripcion: 'ACTIVO' as const,
  fecha_creacion: '2026-01-01',
}

function configurarConsultas() {
  mocks.from.mockImplementation((tabla: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      order: vi.fn(() => query),
      limit: vi.fn(() => query),
      maybeSingle: vi.fn(async () => ({
        data: tabla === 'usuarios' ? usuario : tabla === 'kioscos' ? kiosco : null,
        error: null,
      })),
    }
    return query
  })
}

async function ejecutarAccion(accion: 'login' | 'cargarSesion' | 'refrescarKiosco') {
  if (accion === 'login') await useAuthStore.getState().login('dueno@example.test', 'password')
  if (accion === 'cargarSesion') await useAuthStore.getState().cargarSesion()
  if (accion === 'refrescarKiosco') {
    useAuthStore.setState({ usuario })
    await useAuthStore.getState().refrescarKiosco()
  }
}

describe('authStore en alcance estricto del piloto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
    configurarConsultas()
    mocks.signInWithPassword.mockResolvedValue({ data: { user: { id: 'auth-u1' } }, error: null })
    mocks.getSession.mockResolvedValue({ data: { session: { user: { id: 'auth-u1' } } } })
    mocks.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } })
    mocks.signOut.mockResolvedValue({ error: null })
    useAuthStore.setState({ usuario: null, kiosco: null, suscripcion: null, diasRestantes: null, cargando: false, error: null })
  })

  afterEach(() => vi.unstubAllEnvs())

  it.each(['login', 'cargarSesion', 'refrescarKiosco'] as const)(
    '%s omite suscripciones y deja estado comercial nulo', async (accion) => {
      await ejecutarAccion(accion)

      expect(mocks.from.mock.calls.map(([tabla]) => tabla)).not.toContain('suscripciones')
      expect(useAuthStore.getState().suscripcion).toBeNull()
      expect(useAuthStore.getState().diasRestantes).toBeNull()
    }
  )

  it.each(['login', 'cargarSesion', 'refrescarKiosco'] as const)(
    'con flag false %s conserva la consulta legacy de suscripciones', async (accion) => {
      vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
      await ejecutarAccion(accion)

      expect(mocks.from.mock.calls.map(([tabla]) => tabla)).toContain('suscripciones')
    }
  )
})
