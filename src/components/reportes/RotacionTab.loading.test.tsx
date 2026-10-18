import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { DatosRotacion } from '../../lib/rotationReportData'

const mocks = vi.hoisted(() => ({ cargar: vi.fn(), exportar: vi.fn(), tenant: 'k1' }))
vi.mock('../../lib/rotationReportData', () => ({ cargarDatosRotacion: mocks.cargar }))
vi.mock('../../lib/exportUtils', () => ({ exportarRotacionExcel: mocks.exportar }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ usuario: { kiosco_id: mocks.tenant }, kiosco: { id: mocks.tenant, nombre: 'Ensayo' } }) }))
vi.mock('../../stores/promocionStore', () => ({ usePromocionStore: { getState: () => ({ crearPromocion: vi.fn() }) } }))
import { RotacionTab } from './RotacionTab'

const vacio: DatosRotacion = { productos: [], lineasVentas: [] }
function pendiente() {
  let resolve!: (value: DatosRotacion) => void
  let reject!: (error: Error) => void
  const promise = new Promise<DatosRotacion>((ok, fail) => { resolve = ok; reject = fail })
  return { promise, resolve, reject }
}
const vista = () => <MemoryRouter><RotacionTab /></MemoryRouter>
beforeEach(() => { vi.clearAllMocks(); mocks.tenant = 'k1' })
afterEach(cleanup)

it('no presenta métricas ni exportación durante carga o error y permite reintentar', async () => {
  const solicitud = pendiente()
  mocks.cargar.mockReturnValueOnce(solicitud.promise).mockResolvedValueOnce(vacio)
  render(vista())
  expect(screen.getByRole('status').textContent).toContain('Cargando informe completo')
  expect(screen.queryByText('Exportar Excel')).toBeNull()
  await act(async () => solicitud.reject(new Error('Página tardía fallida')))
  expect(screen.getByRole('alert').textContent).toContain('No se muestran resultados parciales')
  expect(screen.queryByText('Exportar Excel')).toBeNull()
  expect(screen.queryByText('Liquidar')).toBeNull()
  expect(screen.queryByText('Capital Inmovilizado (>30d)')).toBeNull()
  expect(mocks.exportar).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar informe' }))
  expect(await screen.findByText('Exportar Excel')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(mocks.cargar).toHaveBeenCalledTimes(2)
})

it.each(['resolve', 'reject'] as const)('ignora una respuesta %s antigua después de cambiar de comercio', async resultado => {
  const antigua = pendiente(), nueva = pendiente()
  mocks.cargar.mockReturnValueOnce(antigua.promise).mockReturnValueOnce(nueva.promise)
  const { rerender } = render(vista())
  mocks.tenant = 'k2'
  rerender(vista())
  await act(async () => nueva.resolve(vacio))
  expect(screen.getByText('Exportar Excel')).toBeTruthy()
  await act(async () => {
    if (resultado === 'resolve') antigua.resolve({ productos: [{
      id: 'viejo', kiosco_id: 'k1', categoria_id: null, codigo_barras: null,
      descripcion: 'Producto del comercio anterior', precio_costo: 1, precio_venta: 2,
      stock_actual: 10, stock_minimo: 0, activo: true, es_favorito: false,
      fecha_creacion: '', fecha_actualizacion: '',
    }], lineasVentas: [] })
    else antigua.reject(new Error('Fallo del comercio anterior'))
  })
  expect(screen.getByText('Exportar Excel')).toBeTruthy()
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText('Producto del comercio anterior')).toBeNull()
  expect(mocks.cargar.mock.calls.map(([id]) => id)).toEqual(['k1', 'k2'])
})
