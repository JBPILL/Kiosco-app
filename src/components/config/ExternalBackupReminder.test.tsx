import { beforeEach, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ExternalBackupReminder } from './ExternalBackupReminder'
import { registrarDescargaRespaldoExterno } from '../../lib/externalBackupReminder'

beforeEach(() => localStorage.clear())

it('muestra el aviso sin historial y lo retira al solicitar una descarga del mismo kiosco', () => {
  render(<MemoryRouter><ExternalBackupReminder kioscoId="k1" fechaCreacion="2020-01-01T00:00:00Z" /></MemoryRouter>)
  expect(screen.getByText('No hay descargas de respaldo registradas en este navegador.')).toBeTruthy()
  expect(screen.getByRole('link').getAttribute('href')).toBe('/config?seccion=backup')
  act(() => { registrarDescargaRespaldoExterno('k2', 'JSON') })
  expect(screen.queryByLabelText('Recordatorio de respaldo externo')).toBeTruthy()
  act(() => { registrarDescargaRespaldoExterno('k1', 'EXCEL') })
  expect(screen.queryByLabelText('Recordatorio de respaldo externo')).toBeNull()
})

it('no genera historial ni aviso para un comercio recién creado', () => {
  render(<MemoryRouter><ExternalBackupReminder kioscoId="k1" fechaCreacion={new Date().toISOString()} /></MemoryRouter>)
  expect(screen.queryByLabelText('Recordatorio de respaldo externo')).toBeNull()
  expect(localStorage.length).toBe(0)
})
