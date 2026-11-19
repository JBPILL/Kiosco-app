import { beforeEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
const mocks = vi.hoisted(() => ({ save: vi.fn(), load: vi.fn(), config: { habilitado: false, cuit: '', razon_social: 'Ensayo',
  condicion_iva: 'MONOTRIBUTO', punto_venta: 2, inicio_actividades: '', entorno: 'HOMOLOGACION', facturar_automatico: false, monto_minimo_auto: 0 } }))
vi.mock('../../stores/afipStore', () => ({ useAFIPStore: () => ({ config: mocks.config, cargarConfiguracion: mocks.load,
  guardarConfiguracion: mocks.save, emitirComprobantePrueba: vi.fn(), cargando: false, guardando: false }), validarCUIT: () => true }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ usuario: { rol: 'DUEÑO' } }) }))
vi.mock('../pos/TicketReceiptModal', () => ({ TicketReceiptModal: () => null }))
import { AFIPConfigSection } from './AFIPConfigSection'
beforeEach(() => { mocks.save.mockReset(); mocks.save.mockResolvedValue(true); mocks.config.inicio_actividades = '' })
it('guía el ingreso día/mes/año y guarda una fecha válida', () => {
  render(<AFIPConfigSection />)
  const input = screen.getByRole('textbox', { name: 'Fecha Inicio de Actividades' })
  expect(input.getAttribute('placeholder')).toBe('dd/mm/aaaa')
  fireEvent.change(input, { target: { value: '20102026' } })
  expect((input as HTMLInputElement).value).toBe('20/10/2026')
  fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración fiscal' }))
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ inicio_actividades: '20/10/2026' }))
})
it('muestra error y no guarda ni activa ARCA si el calendario es inválido', () => {
  render(<AFIPConfigSection />)
  const input = screen.getByRole('textbox', { name: 'Fecha Inicio de Actividades' })
  fireEvent.change(input, { target: { value: '31022026' } }); fireEvent.blur(input)
  expect(screen.getByText('Ingresá una fecha válida con formato dd/mm/aaaa.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración fiscal' }))
  fireEvent.click(screen.getByRole('switch'))
  expect(mocks.save).not.toHaveBeenCalled()
})
it('muestra fechas ISO existentes en orden local y permite dejarla vacía', () => {
  mocks.config.inicio_actividades = '2026-10-20'
  render(<AFIPConfigSection />)
  const input = screen.getByRole('textbox', { name: 'Fecha Inicio de Actividades' })
  expect((input as HTMLInputElement).value).toBe('20/10/2026')
  fireEvent.change(input, { target: { value: '' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar configuración fiscal' }))
  expect(mocks.save).toHaveBeenCalledWith(expect.objectContaining({ inicio_actividades: '' }))
})
