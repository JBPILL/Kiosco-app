import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { VentaConDetalles } from '../../stores/devolucionStore'
const m = vi.hoisted(() => ({ rol: 'DUEÑO', historial: vi.fn(), cargar: vi.fn(), envase: vi.fn(), devolver: vi.fn(), entregar: vi.fn(), agregar: vi.fn(), caja: { id: 'caja', kiosco_id: 'kid' } as { id: string; kiosco_id: string } | null }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (selector: (s: unknown) => unknown) => selector({ usuario: { id: 'uid', kiosco_id: 'kid', rol: m.rol, activo: true } }) }))
vi.mock('../../stores/cajaStore', () => ({ useCajaStore: { getState: () => ({ sesionActiva: m.caja }) } }))
vi.mock('../../stores/cartStore', () => ({ useCartStore: { getState: () => ({ agregarDevolucionEnvase: m.agregar, tabActivaId: 'tab', cobrosBloqueados: {} }) } }))
vi.mock('../../lib/envasesData', () => ({ cargarEnvasesCompartidos: m.cargar }))
vi.mock('../../lib/pilotOperationHistory', () => ({ cargarHistorialDevolucionesTicket: m.historial }))
vi.mock('../../lib/pilotOperationClient', () => ({ contextoOperacionPiloto: () => ({ usuarioId: 'uid', kioscoId: 'kid', authId: 'auth' }), ejecutarOperacionEnvase: m.envase, ejecutarDevolucionEfectivo: m.devolver, confirmarEntregaPiloto: m.entregar }))
import { EnvasesOperativosModal } from './EnvasesOperativosModal'
import { DevolucionEfectivoModal } from './DevolucionEfectivoModal'
const venta: VentaConDetalles = { id: 'venta', kiosco_id: 'kid', usuario_id: 'uid', sesion_caja_id: 'caja', fecha_hora: '', total: 100,
  estado: 'COMPLETADA', notas: null, sincronizado: true, afip_cae: null, afip_tipo_comprobante: null, afip_nro_comprobante: null,
  detalles: [{ id: 'detalle1', venta_id: 'venta', producto_id: 'producto', cantidad: 2, precio_unitario: 50, subtotal: 100 },
    { id: 'detalle2', venta_id: 'venta', producto_id: 'producto', cantidad: 1, precio_unitario: 50, subtotal: 50 }],
  pagos: [{ id: 'pago', venta_id: 'venta', medio_pago: 'EFECTIVO', monto: 100, referencia: null }] }
const ventaEnvases: VentaConDetalles = { ...venta, detalles: [...venta.detalles, { id: 'vacio', venta_id: venta.id, producto_id: 'virtual-envase', cantidad: 1, precio_unitario: 0, subtotal: -50, es_devolucion_envase: true }] }
beforeEach(() => {
  vi.clearAllMocks()
  m.rol = 'DUEÑO'
  m.caja = { id: 'caja', kiosco_id: 'kid' }
  m.cargar.mockResolvedValue([{ id: 'vidrio', nombre: 'Vidrio', precio: 100, activo: true, stockVacios: 5 }])
  m.historial.mockResolvedValue({ operaciones: 0, importeReintegrado: 0, cantidadesPorDetalle: {} })
})

it('devuelve efectivo y vacíos al cliente sin ofrecer conservarlos', async () => {
  const modalidad = 'ENTREGAR_ENVASES'
  m.devolver.mockResolvedValue({ id: 'op', monto_total: 100, envases: { modalidad, credito: 50, entregas: [{ tipo_id: 'vidrio', cantidad: 1, stock_vacios: 0 }] } })
  render(<DevolucionEfectivoModal isOpen ventaInicial={ventaEnvases} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  await screen.findByText(/Devoluciones anteriores: 0/)
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar devolución completa' }))
  const confirmar = screen.getByRole('button', { name: 'Registrar devolución y calcular reintegro' })
  expect(screen.queryByLabelText('Resolución de envases')).toBeNull()
  expect(screen.queryByRole('option', { name: /Conservar envases/ })).toBeNull()
  expect(confirmar.hasAttribute('disabled')).toBe(false)
  fireEvent.click(confirmar)
  await screen.findByText('Devolución registrada')
  expect(m.devolver.mock.calls[0][1]).toMatchObject({ version: 2, modalidadEnvases: modalidad, items: [
    { detalleId: 'detalle1', cantidad: 2, reingresaStock: true }, { detalleId: 'detalle2', cantidad: 1, reingresaStock: true },
  ] })
  expect(m.devolver.mock.calls[0][1].items.some((i: {detalleId: string}) => i.detalleId === 'vacio')).toBe(false)
  expect(screen.getByText(/Entregá también/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Ya verifiqué la entrega de efectivo y envases' })).toBeTruthy()
})

it('no permite otra devolución del ticket con envases si ya tiene reintegros', async () => {
  m.historial.mockResolvedValue({ operaciones: 1, importeReintegrado: 10, cantidadesPorDetalle: {} })
  render(<DevolucionEfectivoModal isOpen ventaInicial={ventaEnvases} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  await screen.findByText(/ya tiene devoluciones/)
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar devolución completa' }))
  expect(screen.getByRole('button', { name: 'Registrar devolución y calcular reintegro' }).hasAttribute('disabled')).toBe(true)
  expect(m.devolver).not.toHaveBeenCalled()
})

it('descuenta envases del ticket sin ejecutar un pago ni una escritura de saldo', async () => {
  const cerrar = vi.fn()
  render(<EnvasesOperativosModal isOpen onClose={cerrar} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Descontar del ticket' }))
  expect(m.agregar).toHaveBeenCalledWith('Vidrio', 100, 1, 'vidrio', true)
  expect(m.envase).not.toHaveBeenCalled()
  expect(cerrar).toHaveBeenCalledOnce()
})

it('no redondea precios con centavos para llevarlos al ticket', async () => {
  m.cargar.mockResolvedValue([{ id: 'vidrio', nombre: 'Vidrio', precio: 100.25, activo: true, stockVacios: 5 }])
  render(<EnvasesOperativosModal isOpen onClose={vi.fn()} />)
  const boton = await screen.findByRole('button', { name: 'Descontar del ticket' })
  await waitFor(() => expect(boton.hasAttribute('disabled')).toBe(true))
  expect(m.agregar).not.toHaveBeenCalled()
})

it('no registra egreso si falta caja abierta', async () => {
  m.caja = null
  render(<EnvasesOperativosModal isOpen onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Registrar recepción y reintegro en efectivo' }))
  expect(screen.getByRole('alert').textContent).toContain('Abrí una caja')
  expect(m.envase).not.toHaveBeenCalled()
})

it('una respuesta incierta bloquea otro envío desde el formulario', async () => {
  m.envase.mockRejectedValue(new Error('Respuesta incierta'))
  render(<EnvasesOperativosModal isOpen onClose={vi.fn()} />)
  const boton = await screen.findByRole('button', { name: 'Registrar recepción y reintegro en efectivo' })
  fireEvent.click(boton)
  await screen.findByRole('alert')
  fireEvent.click(boton)
  expect(m.envase).toHaveBeenCalledOnce()
})

it('envía la línea original por ID aunque dos líneas tengan el mismo producto', async () => {
  m.devolver.mockResolvedValue({ id: 'op', monto_total: 50 })
  render(<DevolucionEfectivoModal isOpen ventaInicial={venta} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  await screen.findByText(/Devoluciones anteriores:/)
  fireEvent.change(screen.getAllByLabelText('Cantidad a devolver')[1], { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Registrar devolución y calcular reintegro' }))
  await screen.findByText('Devolución registrada')
  expect(m.devolver.mock.calls[0][1]).toMatchObject({ metodo: 'EFECTIVO_CAJA', motivo: 'CAMBIO_PRODUCTO', items: [{ detalleId: 'detalle2', cantidad: 1, reingresaStock: true }] })
  expect(m.entregar).not.toHaveBeenCalled()
  expect(screen.getByText(/cargá el reemplazo como una venta normal/)).toBeTruthy()
})

it('Cajero no devuelve una venta con recepción de envases ni recurre al flujo heredado', () => {
  m.rol = 'CAJERO'
  render(<DevolucionEfectivoModal isOpen ventaInicial={{ ...venta, detalles: [{ ...venta.detalles[0], es_devolucion_envase: true }] }} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  expect(screen.getByRole('alert').textContent).toContain('sólo puede devolverlos el Dueño')
  fireEvent.click(screen.getByRole('button', { name: 'Registrar devolución y calcular reintegro' }))
  expect(m.devolver).not.toHaveBeenCalled()
})

it('descuenta lo ya devuelto por línea y no permite otra cantidad mayor al saldo', async () => {
  m.historial.mockResolvedValue({ operaciones: 1, importeReintegrado: 50, cantidadesPorDetalle: { detalle1: 1 } })
  render(<DevolucionEfectivoModal isOpen ventaInicial={venta} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  await screen.findByText(/Devoluciones anteriores: 1/)
  const cantidades = screen.getAllByLabelText('Cantidad a devolver')
  expect(cantidades[0].getAttribute('max')).toBe('1')
  expect(cantidades[1].getAttribute('max')).toBe('1')
  fireEvent.change(cantidades[0], { target: { value: '2' } })
  expect(screen.getByRole('button', { name: 'Registrar devolución y calcular reintegro' }).hasAttribute('disabled')).toBe(true)
  fireEvent.change(cantidades[0], { target: { value: '1' } })
  expect(screen.getByRole('button', { name: 'Registrar devolución y calcular reintegro' }).hasAttribute('disabled')).toBe(false)
  expect(m.devolver).not.toHaveBeenCalled()
})

it('no presenta historia fallida como cero devoluciones y permite reintentar sólo la lectura', async () => {
  m.historial.mockRejectedValueOnce(new Error('Sin conexión'))
  render(<DevolucionEfectivoModal isOpen ventaInicial={venta} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo verificar')
  expect(screen.queryByText(/Devoluciones anteriores: 0/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Registrar devolución y calcular reintegro' }).closest('fieldset')?.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar historial' }))
  await screen.findByText(/Devoluciones anteriores: 0/)
  expect(m.devolver).not.toHaveBeenCalled()
})

it('bloquea una historia incompatible con el ticket original', async () => {
  m.historial.mockResolvedValue({ operaciones: 1, importeReintegrado: 50, cantidadesPorDetalle: { detalleDesconocido: 1 } })
  render(<DevolucionEfectivoModal isOpen ventaInicial={venta} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Registrar devolución y calcular reintegro' }).closest('fieldset')?.disabled).toBe(true)
  expect(m.devolver).not.toHaveBeenCalled()
})
