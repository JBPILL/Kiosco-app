import { afterEach, beforeEach, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn(), insert: vi.fn(), select: vi.fn(), update: vi.fn(), deleteFn: vi.fn(), toastSuccess: vi.fn(), toastError: vi.fn() }))
vi.mock('../lib/supabase', () => ({ supabase: { rpc: mocks.rpc, from: mocks.from } }))
vi.mock('react-hot-toast', () => ({ default: Object.assign(vi.fn(), { success: mocks.toastSuccess, error: mocks.toastError }) }))

import { useAuthStore } from './authStore'
import { useSoporteStore, type TicketSoporte } from './soporteStore'

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  useAuthStore.setState({ usuario: null })
  useSoporteStore.setState({ tickets: [], guardando: false, error: null, tablaExiste: true })
  mocks.rpc.mockResolvedValue({ data: {
    id: 'ticket-1', kiosco_id: 'tenant-server', usuario_id: 'user-server',
    kiosco_nombre: 'Kiosco servidor', usuario_nombre: 'Usuario servidor', usuario_rol: 'CAJERO',
    tipo: 'ERROR', modulo: 'POS', mensaje: 'Se perdió el ticket', estado: 'PENDIENTE',
    fecha_creacion: new Date(0).toISOString(),
  }, error: null })
  mocks.insert.mockReturnValue({ select: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
  mocks.select.mockReturnValue({ order: () => ({ limit: async () => ({ data: [], error: null }) }) })
  mocks.from.mockReturnValue({ insert: mocks.insert, select: mocks.select, update: mocks.update, delete: mocks.deleteFn })
})
afterEach(() => vi.unstubAllEnvs())

it('strict scope crea tickets por RPC, ignora identidad enviada por navegador y no hace fallback DML', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  const payload = {
    kiosco_id: 'otro-kiosco', kiosco_nombre: 'falso', usuario_id: 'otro-usuario',
    usuario_nombre: 'falso', usuario_rol: 'DUEÑO', tipo: 'ERROR' as const,
    modulo: 'POS', mensaje: 'Se perdió el ticket',
  }
  const result = await useSoporteStore.getState().crearTicket(payload)
  expect(result.ok).toBe(true)
  expect(mocks.rpc).toHaveBeenCalledWith('crear_ticket_soporte_transaccional', expect.objectContaining({
    p_tipo: 'ERROR', p_modulo: 'POS', p_mensaje: 'Se perdió el ticket',
  }))
  expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty('p_kiosco_id')
  expect(mocks.rpc.mock.calls[0][1]).not.toHaveProperty('p_usuario_id')
  expect(mocks.insert).not.toHaveBeenCalled()
  expect(result.ticket).toMatchObject({ kiosco_id: 'tenant-server', usuario_id: 'user-server' })
})

it('strict scope falla cerrado si el RPC falla', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  mocks.rpc.mockResolvedValue({ data: null, error: new Error('denied') })
  const result = await useSoporteStore.getState().crearTicket({
    tipo: 'CONSULTA', modulo: 'General', mensaje: 'Ayuda', kiosco_nombre: '', usuario_nombre: '',
  })
  expect(result).toEqual({ ok: false })
  expect(mocks.insert).not.toHaveBeenCalled()
  expect(useSoporteStore.getState().tickets).toEqual([])
})

it('legacy conserva el INSERT browser anterior cuando strict scope está apagado', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'false')
  const result = await useSoporteStore.getState().crearTicket({
    tipo: 'CONSULTA', modulo: 'General', mensaje: 'Ayuda', kiosco_nombre: 'K', usuario_nombre: 'U',
  })
  expect(result.ok).toBe(true)
  expect(mocks.rpc).not.toHaveBeenCalled()
  expect(mocks.insert).toHaveBeenCalledTimes(1)
})

it('strict scope mantiene las operaciones administrativas de soporte inaccesibles', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  expect(await useSoporteStore.getState().cargarTicketsAdmin()).toEqual([])
  expect(await useSoporteStore.getState().actualizarEstadoTicket('t1', 'RESUELTO')).toBe(false)
  expect(await useSoporteStore.getState().eliminarTicket('t1')).toBe(false)
  useSoporteStore.getState().suscribirRealtimeTickets()()
  expect(mocks.from).not.toHaveBeenCalled()
  expect(mocks.rpc).not.toHaveBeenCalled()
})

it('en strict scope + comercial habilitado SuperAdmin lee tickets y muta solo via SAFE_RPC sin DML directo', async () => {
  vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
  vi.stubEnv('VITE_ADMIN_COMERCIAL_HABILITADO', 'true')
  useAuthStore.setState({
    usuario: {
      id: 'admin-1',
      auth_user_id: 'auth-admin-1',
      kiosco_id: null,
      nombre: 'Admin',
      email: 'admin@example.test',
      rol: 'VISOR',
      activo: true,
      es_superadmin: true,
      fecha_creacion: new Date(0).toISOString(),
    } as never,
  })
  const ticketServidor: TicketSoporte = {
    id: 'ticket-admin-1',
    kiosco_id: 'kiosco-1',
    kiosco_nombre: 'Kiosco Centro',
    usuario_nombre: 'Ana',
    usuario_rol: 'DUEÑO',
    tipo: 'CONSULTA',
    modulo: 'Caja',
    mensaje: 'Consulta de arqueo',
    estado: 'PENDIENTE',
    respuesta_admin: 'Respuesta previa',
    fecha_creacion: new Date(0).toISOString(),
  }
  mocks.select.mockReturnValueOnce({
    order: () => ({ limit: async () => ({ data: [ticketServidor], error: null }) }),
  })

  const cargados = await useSoporteStore.getState().cargarTicketsAdmin()
  expect(cargados).toEqual([ticketServidor])
  expect(useSoporteStore.getState().tickets).toEqual([ticketServidor])

  mocks.rpc.mockResolvedValueOnce({
    data: { success: true, ticket: { ...ticketServidor, estado: 'EN_PROCESO', respuesta_admin: 'Respuesta previa' } },
    error: null,
  })
  expect(await useSoporteStore.getState().actualizarEstadoTicket('ticket-admin-1', 'EN_PROCESO')).toBe(true)
  expect(mocks.rpc).toHaveBeenCalledWith('gestionar_ticket_soporte_admin', expect.objectContaining({
    p_ticket_id: 'ticket-admin-1',
    p_estado: 'EN_PROCESO',
    p_respuesta_admin: null,
    p_actualizar_respuesta: false,
  }))
  expect(useSoporteStore.getState().tickets[0].estado).toBe('EN_PROCESO')
  expect(useSoporteStore.getState().tickets[0].respuesta_admin).toBe('Respuesta previa')

  expect(await useSoporteStore.getState().eliminarTicket('ticket-admin-1')).toBe(false)
  expect(mocks.update).not.toHaveBeenCalled()
  expect(mocks.deleteFn).not.toHaveBeenCalled()
})
