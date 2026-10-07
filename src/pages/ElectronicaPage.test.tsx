import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'
import type { ReparacionElectronica, UnidadElectronica, VentaElectronica } from '../types/electronica'

const mocks = vi.hoisted(() => ({ cargar: vi.fn(), limpiar: vi.fn(), buscarVenta: vi.fn(), registrarUnidad: vi.fn(), guardarReparacion: vi.fn(), success: vi.fn() }))
let auth = { usuario: { id: 'u1', rol: 'DUEÑO', kiosco_id: 'k1' }, kiosco: { id: 'k1', rubro: 'ELECTRONICA_CELULARES' } }
let unidades: UnidadElectronica[] = []
let reparaciones: ReparacionElectronica[] = []
let errorServidor: string | null = null
vi.mock('../stores/authStore', () => ({ useAuthStore: Object.assign(() => auth, { getState: () => auth }) }))
vi.mock('../stores/electronicaStore', () => ({ useElectronicaStore: () => ({ ...mocks, unidades, reparaciones, cargando: false, error: errorServidor }) }))
vi.mock('react-hot-toast', () => ({ default: { success: mocks.success } }))
vi.mock('../components/ui/Modal', () => ({ Modal: ({ children, title }: { children: ReactNode; title: string }) => <div role="dialog" aria-label={title}>{children}</div> }))
import { ElectronicaPage } from './ElectronicaPage'

const detalle = '10000000-0000-0000-0000-000000000001'
const venta: VentaElectronica = { id: '20000000-0000-0000-0000-000000000001', fecha_hora: '2026-10-06', estado: 'COMPLETADA', sincronizado: true, detalles: [
  { id: detalle, producto_id: 'p1', cantidad: 2, producto: { descripcion: 'Celular', es_pesable: false, es_combo: false } },
  { id: '10000000-0000-0000-0000-000000000002', producto_id: 'p2', cantidad: 1.5, producto: { descripcion: 'Fraccionado' } },
  { id: '10000000-0000-0000-0000-000000000003', producto_id: 'p3', cantidad: 1, producto: { descripcion: 'Pesable', es_pesable: true } },
  { id: '10000000-0000-0000-0000-000000000004', producto_id: 'p4', cantidad: 1, producto: { descripcion: 'Combo', es_combo: true } },
] }
const reparacion: ReparacionElectronica = { id: 'r1', kiosco_id: 'k1', cliente_nombre: 'Ana', cliente_contacto: 'Contacto', equipo: 'Equipo uno', identificador: 'S1', informe_falla: 'No enciende', diagnostico: null, estado: 'RECIBIDA', presupuesto: 12000, fecha_ingreso: '2026-10-06', version: 4 }

beforeEach(() => {
  vi.clearAllMocks()
  auth = { usuario: { id: 'u1', rol: 'DUEÑO', kiosco_id: 'k1' }, kiosco: { id: 'k1', rubro: 'ELECTRONICA_CELULARES' } }
  unidades = []; reparaciones = []; errorServidor = null
  mocks.cargar.mockResolvedValue(undefined); mocks.buscarVenta.mockResolvedValue(venta)
  mocks.registrarUnidad.mockResolvedValue(undefined); mocks.guardarReparacion.mockResolvedValue(undefined)
})
async function buscarUnidad() {
  fireEvent.change(screen.getByRole('textbox', { name: 'ID de venta o código de ticket' }), { target: { value: '20000000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar venta' }))
  await screen.findByRole('combobox', { name: 'Artículo vendido' })
  fireEvent.change(screen.getByRole('combobox', { name: 'Artículo vendido' }), { target: { value: detalle } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Serie o IMEI' }), { target: { value: 'SER-1' } })
}
function abrirNuevaReparacion() {
  fireEvent.click(screen.getByRole('tab', { name: 'Reparaciones' }))
  fireEvent.click(screen.getByRole('button', { name: 'Nueva reparación' }))
  fireEvent.change(screen.getByRole('textbox', { name: 'Nombre del cliente' }), { target: { value: 'Ana' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Equipo y modelo' }), { target: { value: 'Celular modelo' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Falla informada' }), { target: { value: 'No enciende' } })
}

it('busca un ticket y registra sólo una línea entera apta', async () => {
  render(<ElectronicaPage />)
  await buscarUnidad()
  expect(mocks.buscarVenta).toHaveBeenCalledWith('20000000')
  const opciones = within(screen.getByRole('combobox', { name: 'Artículo vendido' })).getAllByRole('option')
  expect(opciones.map(o => o.textContent)).toEqual(['Seleccionar artículo', 'Celular · 2 unidades'])
  fireEvent.change(screen.getByLabelText('Garantía hasta'), { target: { value: '2027-10-06' } })
  fireEvent.change(screen.getByRole('textbox', { name: 'Condiciones internas de garantía' }), { target: { value: 'Condiciones del comercio' } })
  fireEvent.click(screen.getByRole('button', { name: 'Registrar unidad' }))
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Unidad registrada'))
  expect(mocks.registrarUnidad).toHaveBeenCalledWith({ detalleVentaId: detalle, tipo: 'SERIE', identificador: 'SER-1', garantiaHasta: '2027-10-06', condiciones: 'Condiciones del comercio' }, expect.any(String))
})

it('preserva UUID al reintentar rechazo y lo renueva cuando cambia el formulario', async () => {
  mocks.registrarUnidad.mockRejectedValue(new Error('No se confirmó'))
  render(<ElectronicaPage />); await buscarUnidad()
  fireEvent.click(screen.getByRole('button', { name: 'Registrar unidad' }))
  await screen.findByText('No se confirmó')
  const primera = mocks.registrarUnidad.mock.calls[0][1]
  fireEvent.click(screen.getByRole('button', { name: 'Registrar unidad' }))
  await waitFor(() => expect(mocks.registrarUnidad).toHaveBeenCalledTimes(2))
  await screen.findByText('No se confirmó')
  expect(mocks.registrarUnidad.mock.calls[1][1]).toBe(primera)
  fireEvent.change(screen.getByRole('textbox', { name: 'Serie o IMEI' }), { target: { value: 'SER-2' } })
  fireEvent.click(screen.getByRole('button', { name: 'Registrar unidad' }))
  await waitFor(() => expect(mocks.registrarUnidad).toHaveBeenCalledTimes(3))
  expect(mocks.registrarUnidad.mock.calls[2][1]).not.toBe(primera)
  expect(mocks.success).not.toHaveBeenCalled()
})

it('no emite éxito ni conserva búsqueda/formulario cuando cambia el comercio durante guardado', async () => {
  let resolver!: () => void
  mocks.registrarUnidad.mockImplementation(() => new Promise<void>(resolve => { resolver = resolve }))
  const pagina = render(<ElectronicaPage />); await buscarUnidad()
  fireEvent.click(screen.getByRole('button', { name: 'Registrar unidad' }))
  auth = { usuario: { id: 'u2', rol: 'DUEÑO', kiosco_id: 'k2' }, kiosco: { id: 'k2', rubro: 'ELECTRONICA_CELULARES' } }
  pagina.rerender(<ElectronicaPage />)
  await act(async () => resolver())
  expect(mocks.success).not.toHaveBeenCalled()
  expect(screen.queryByRole('textbox', { name: 'Serie o IMEI' })).toBeNull()
  expect((screen.getByRole('textbox', { name: 'ID de venta o código de ticket' }) as HTMLInputElement).value).toBe('')
})

it('una búsqueda tardía del usuario previo nunca muestra su venta al cambiar usuario', async () => {
  let resolver!: (value: VentaElectronica) => void
  mocks.buscarVenta.mockImplementation(() => new Promise<VentaElectronica>(resolve => { resolver = resolve }))
  const pagina = render(<ElectronicaPage />)
  fireEvent.change(screen.getByRole('textbox', { name: 'ID de venta o código de ticket' }), { target: { value: '20000000' } })
  fireEvent.click(screen.getByRole('button', { name: 'Buscar venta' }))
  auth = { ...auth, usuario: { ...auth.usuario, id: 'u2' } }; pagina.rerender(<ElectronicaPage />)
  await act(async () => resolver(venta))
  expect(screen.queryByRole('combobox', { name: 'Artículo vendido' })).toBeNull()
})

it('marca una venta anulada y conserva la información como registro interno', () => {
  unidades = [{ id: 'unidad1', kiosco_id: 'k1', detalle_venta_id: detalle, venta_id: venta.id, producto_id: 'p1', tipo_identificador: 'SERIE', identificador: 'SER-ANULADA', garantia_hasta: '2027-10-06', condiciones_garantia: 'Condiciones internas', fecha_creacion: '2026-10-06', venta_estado: 'ANULADA', venta_fecha: '2026-10-06' }]
  render(<ElectronicaPage />)
  expect(screen.getByText('Venta anulada · revisar garantía')).toBeTruthy()
  expect(screen.getByText('Registro interno')).toBeTruthy()
  expect(screen.getByText('Condiciones internas')).toBeTruthy()
})

it('nueva reparación reintenta sin falso éxito y cambia UUID al cambiar datos', async () => {
  mocks.guardarReparacion.mockRejectedValue(new Error('Servidor rechazó'))
  render(<ElectronicaPage />); abrirNuevaReparacion()
  expect(screen.getByText(/No registres PIN/)).toBeTruthy()
  expect(screen.getByText(/no está cobrado/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reparación' }))
  await screen.findByText('Servidor rechazó')
  const solicitud = mocks.guardarReparacion.mock.calls[0][1]
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reparación' }))
  await waitFor(() => expect(mocks.guardarReparacion).toHaveBeenCalledTimes(2))
  await screen.findByText('Servidor rechazó')
  expect(mocks.guardarReparacion.mock.calls[1][1]).toBe(solicitud)
  fireEvent.change(screen.getByRole('textbox', { name: 'Falla informada' }), { target: { value: 'No carga' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reparación' }))
  await waitFor(() => expect(mocks.guardarReparacion).toHaveBeenCalledTimes(3))
  expect(mocks.guardarReparacion.mock.calls[2][1]).not.toBe(solicitud)
  expect(mocks.success).not.toHaveBeenCalled()
  expect(screen.getByRole('dialog')).toBeTruthy()
})

it('edita con versión del registro y sólo ofrece transiciones permitidas; terminales sin edición', async () => {
  reparaciones = [reparacion, { ...reparacion, id: 'r2', equipo: 'Equipo cerrado', estado: 'ENTREGADA' }]
  render(<ElectronicaPage />)
  fireEvent.click(screen.getByRole('tab', { name: 'Reparaciones' }))
  expect(screen.getAllByRole('button', { name: 'Editar orden' })).toHaveLength(1)
  expect(screen.getByText('Orden cerrada · sin edición')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Editar orden' }))
  expect(within(screen.getByRole('combobox', { name: 'Estado de reparación' })).getAllByRole('option').map(o => o.textContent)).toEqual(['Recibida', 'En diagnóstico', 'Cancelada'])
  fireEvent.change(screen.getByRole('combobox', { name: 'Estado de reparación' }), { target: { value: 'DIAGNOSTICO' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reparación' }))
  await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('Orden de reparación guardada'))
  expect(mocks.guardarReparacion).toHaveBeenCalledWith(expect.objectContaining({ estado: 'DIAGNOSTICO' }), expect.any(String), reparacion)
})

it('bloquea otros roles y rubros y muestra el error de SQL sin anunciar éxito', () => {
  const pagina = render(<ElectronicaPage />)
  auth = { ...auth, usuario: { ...auth.usuario, rol: 'CAJERO' } }; pagina.rerender(<ElectronicaPage />)
  expect(screen.getByRole('alert').textContent).toContain('dueño')
  auth = { ...auth, usuario: { ...auth.usuario, rol: 'DUEÑO' }, kiosco: { ...auth.kiosco, rubro: 'PETSHOP_VETERINARIA' } }; pagina.rerender(<ElectronicaPage />)
  expect(screen.queryByRole('tablist')).toBeNull()
  auth = { ...auth, kiosco: { ...auth.kiosco, rubro: 'ELECTRONICA_CELULARES' } }; errorServidor = 'Aplicá SQL de electrónica'
  pagina.rerender(<ElectronicaPage />)
  expect(screen.getByRole('alert').textContent).toContain('SQL de electrónica')
  expect(mocks.success).not.toHaveBeenCalled()
})

it('descarta el éxito de una reparación cuando cambia usuario durante el envío', async () => {
  let resolver!: () => void
  mocks.guardarReparacion.mockImplementation(() => new Promise<void>(resolve => { resolver = resolve }))
  const pagina = render(<ElectronicaPage />); abrirNuevaReparacion()
  fireEvent.click(screen.getByRole('button', { name: 'Guardar reparación' }))
  auth = { ...auth, usuario: { ...auth.usuario, id: 'u2' } }; pagina.rerender(<ElectronicaPage />)
  await act(async () => resolver())
  expect(screen.queryByRole('dialog')).toBeNull()
  expect(mocks.success).not.toHaveBeenCalled()
})
