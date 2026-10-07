import { render, screen, cleanup, fireEvent } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { CajaPage } from './CajaPage'

const mocks = vi.hoisted(() => ({ rol: 'DUEÑO', cargar: vi.fn(), query: vi.fn() }))
vi.mock('../stores/authStore', () => ({ useAuthStore: () => ({ usuario: { id: 'u1', kiosco_id: 'k1', rol: mocks.rol, nombre: 'Operador' }, kiosco: { id: 'k1' } }) }))
vi.mock('../stores/cajaStore', () => ({ useCajaStore: () => ({
  sesionActiva: { id: 's1', monto_inicial: 10000, fecha_apertura: '2026-10-07T12:00:00Z' },
  resumenActivo: { total_efectivo: 12345, total_ingresos_extra: 0, total_egresos: 0 },
  movimientosCaja: [], cargando: false, arqueoCiegoObligatorio: true,
  verificarSesionActiva: mocks.cargar, cargarArqueoCiegoConfig: mocks.cargar,
  cargarResumenSesion: mocks.cargar,
}) }))
vi.mock('../lib/supabase', () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: [], error: null }) }) }) }) }) }) } }))
vi.mock('../components/pos/TicketCierreCajaModal', () => ({ TicketCierreCajaModal: () => null }))
vi.mock('../lib/whatsappReport', () => ({ procesarDespachoCierre: vi.fn() }))
afterEach(() => { cleanup(); mocks.rol = 'DUEÑO' })

it('unifica indicadores, ayuda de medios de cobro y un único refresco del turno', () => {
  render(<CajaPage />)
  expect(screen.getAllByRole('article')).toHaveLength(5)
  expect(screen.getByText(/Los fiados quedan pendientes/)).toBeTruthy()
  expect(screen.getByText('Sin movimientos de efectivo adicionales')).toBeTruthy()
  expect(screen.getAllByRole('button', { name: /Actualizar caja/ })).toHaveLength(1)
  expect(screen.queryByTitle('Recalcular ventas y movimientos en vivo')).toBeNull()
})

it('mantiene ocultos el efectivo de ventas y el esperado para el cajero en modo ciego', () => {
  mocks.rol = 'CAJERO'
  render(<CajaPage />)
  expect(screen.getByText('••••••')).toBeTruthy()
  expect(screen.getByText('Modo Ciego')).toBeTruthy()
  expect(screen.queryByText(/12.345/)).toBeNull()
  expect(screen.queryByText(/22.345/)).toBeNull()
})

it('presenta el historial con indicadores y conserva un único refresco global', async () => {
  render(<CajaPage />)
  fireEvent.click(screen.getByRole('button', { name: /Historial de Cierres/ }))
  expect(await screen.findByText('Cierres cargados')).toBeTruthy()
  expect(screen.getByText(/Una diferencia positiva indica sobrante/)).toBeTruthy()
  expect(screen.getAllByRole('article')).toHaveLength(3)
  expect(screen.queryByRole('button', { name: 'Actualizar historial de cierres' })).toBeNull()
})

it('reserva el resumen de diferencias del historial al dueño', async () => {
  mocks.rol = 'CAJERO'
  render(<CajaPage />)
  fireEvent.click(screen.getByRole('button', { name: /Historial de Cierres/ }))
  expect(await screen.findByText('Control de cierre')).toBeTruthy()
  expect(screen.queryByText('Con diferencias')).toBeNull()
})

it('conserva los ingresos y egresos en Turno Actual sin pestaña duplicada', () => {
  render(<CajaPage />)
  expect(screen.queryByRole('button', { name: /Entradas y Retiros/ })).toBeNull()
  expect(screen.getByRole('button', { name: '+ Registrar Ingreso' })).toBeTruthy()
  expect(screen.getByRole('button', { name: '- Registrar Gasto / Egreso' })).toBeTruthy()
  expect(screen.queryByText(/Ver todos los movimientos en su pestaña/)).toBeNull()
})
