import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { VentaConDetalles } from '../../stores/devolucionStore'
const m = vi.hoisted(() => ({ rol: 'DUEÑO', historial: vi.fn(), movimientos: vi.fn(), cargar: vi.fn(), envase: vi.fn(), devolver: vi.fn(), entregar: vi.fn(), agregar: vi.fn(), caja: { id: 'caja', kiosco_id: 'kid' } as { id: string; kiosco_id: string } | null }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: (selector: (s: unknown) => unknown) => selector({ usuario: { id: 'uid', kiosco_id: 'kid', rol: m.rol, activo: true } }) }))
vi.mock('../../stores/cajaStore', () => ({ useCajaStore: { getState: () => ({ sesionActiva: m.caja }) } }))
vi.mock('../../stores/cartStore', () => ({ useCartStore: { getState: () => ({ agregarDevolucionEnvase: m.agregar, tabActivaId: 'tab', cobrosBloqueados: {} }) } }))
vi.mock('../../lib/envasesData', () => ({ cargarEnvasesCompartidos: m.cargar }))
vi.mock('../../lib/pilotOperationHistory', () => ({ cargarHistorialDevolucionesTicket: m.historial, cargarMovimientosEnvases: m.movimientos }))
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
  m.movimientos.mockResolvedValue([])
  m.rol = 'DUEÑO'
  m.caja = { id: 'caja', kiosco_id: 'kid' }
  m.cargar.mockResolvedValue([{ id: 'vidrio', nombre: 'Vidrio', precio: 100, activo: true, stockVacios: 5, pendientes: 0 }])
  m.historial.mockResolvedValue({ operaciones: 0, importeReintegrado: 0, cantidadesPorDetalle: {} })
})

it('devuelve efectivo y vacíos al cliente sin ofrecer conservarlos', async () => {
  const modalidad = 'ENTREGAR_ENVASES'
  m.devolver.mockResolvedValue({ id: 'op', monto_total: 100, envases: { modalidad, credito: 50, entregas: [{ tipo_id: 'vidrio', cantidad: 1, stock_vacios: 0 }] } })
  render(<DevolucionEfectivoModal isOpen ventaInicial={ventaEnvases} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  await screen.findByText(/0 devoluciones/)
  fireEvent.click(screen.getByRole('button', { name: 'Seleccionar devolución completa' }))
  const confirmar = screen.getByRole('button', { name: 'Confirmar devolución' })
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
  expect(screen.getByRole('button', { name: 'Confirmar devolución' }).hasAttribute('disabled')).toBe(true)
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
  m.cargar.mockResolvedValue([{ id: 'vidrio', nombre: 'Vidrio', precio: 100.25, activo: true, stockVacios: 5, pendientes: 0 }])
  render(<EnvasesOperativosModal isOpen onClose={vi.fn()} />)
  const boton = await screen.findByRole('button', { name: 'Descontar del ticket' })
  await waitFor(() => expect(boton.hasAttribute('disabled')).toBe(true))
  expect(m.agregar).not.toHaveBeenCalled()
})

it('no registra egreso si falta caja abierta', async () => {
  m.caja = null
  render(<EnvasesOperativosModal isOpen onClose={vi.fn()} />)
  fireEvent.click(await screen.findByRole('button', { name: 'Pagar en efectivo' }))
  expect(screen.getByRole('alert').textContent).toContain('Abrí una caja')
  expect(m.envase).not.toHaveBeenCalled()
})

it('una respuesta incierta bloquea otro envío desde el formulario', async () => {
  m.envase.mockRejectedValue(new Error('Respuesta incierta'))
  render(<EnvasesOperativosModal isOpen onClose={vi.fn()} />)
  const boton = await screen.findByRole('button', { name: 'Pagar en efectivo' })
  fireEvent.click(boton)
  await screen.findByRole('alert')
  fireEvent.click(boton)
  expect(m.envase).toHaveBeenCalledOnce()
})

it('envía la línea original por ID aunque dos líneas tengan el mismo producto', async () => {
  m.devolver.mockResolvedValue({ id: 'op', monto_total: 50 })
  render(<DevolucionEfectivoModal isOpen ventaInicial={venta} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  await screen.findByText(/Ya devuelto:/)
  fireEvent.change(screen.getAllByLabelText('Cantidad a devolver')[1], { target: { value: '1' } })
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolución' }))
  await screen.findByText('Devolución registrada')
  expect(m.devolver.mock.calls[0][1]).toMatchObject({ metodo: 'EFECTIVO_CAJA', motivo: 'CAMBIO_PRODUCTO', items: [{ detalleId: 'detalle2', cantidad: 1, reingresaStock: true }] })
  expect(m.entregar).not.toHaveBeenCalled()
  expect(screen.getByText(/cargá el reemplazo como una venta normal/)).toBeTruthy()
})

it('Cajero no devuelve una venta con recepción de envases ni recurre al flujo heredado', () => {
  m.rol = 'CAJERO'
  render(<DevolucionEfectivoModal isOpen ventaInicial={{ ...venta, detalles: [{ ...venta.detalles[0], es_devolucion_envase: true }] }} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  expect(screen.getByRole('alert').textContent).toContain('sólo puede devolverlos el Dueño')
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolución' }))
  expect(m.devolver).not.toHaveBeenCalled()
})

it('descuenta lo ya devuelto por línea y no permite otra cantidad mayor al saldo', async () => {
  m.historial.mockResolvedValue({ operaciones: 1, importeReintegrado: 50, cantidadesPorDetalle: { detalle1: 1 } })
  render(<DevolucionEfectivoModal isOpen ventaInicial={venta} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  await screen.findByText(/1 devoluciones/)
  const cantidades = screen.getAllByLabelText('Cantidad a devolver')
  expect(cantidades[0].getAttribute('max')).toBe('1')
  expect(cantidades[1].getAttribute('max')).toBe('1')
  fireEvent.change(cantidades[0], { target: { value: '2' } })
  expect(screen.getByRole('button', { name: 'Confirmar devolución' }).hasAttribute('disabled')).toBe(true)
  fireEvent.change(cantidades[0], { target: { value: '1' } })
  expect(screen.getByRole('button', { name: 'Confirmar devolución' }).hasAttribute('disabled')).toBe(false)
  expect(m.devolver).not.toHaveBeenCalled()
})

it('no presenta historia fallida como cero devoluciones y permite reintentar sólo la lectura', async () => {
  m.historial.mockRejectedValueOnce(new Error('Sin conexión'))
  render(<DevolucionEfectivoModal isOpen ventaInicial={venta} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  expect((await screen.findByRole('alert')).textContent).toContain('No se pudo verificar')
  expect(screen.queryByText(/0 devoluciones/)).toBeNull()
  expect(screen.getByRole('button', { name: 'Confirmar devolución' }).closest('fieldset')?.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar historial' }))
  await screen.findByText(/0 devoluciones/)
  expect(m.devolver).not.toHaveBeenCalled()
})

it('bloquea una historia incompatible con el ticket original', async () => {
  m.historial.mockResolvedValue({ operaciones: 1, importeReintegrado: 50, cantidadesPorDetalle: { detalleDesconocido: 1 } })
  render(<DevolucionEfectivoModal isOpen ventaInicial={venta} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  await screen.findByRole('alert')
  expect(screen.getByRole('button', { name: 'Confirmar devolución' }).closest('fieldset')?.disabled).toBe(true)
  expect(m.devolver).not.toHaveBeenCalled()
})

it('rechaza fracciones en artículos por unidad y permite elegir Todo sin escribir', async () => {
  m.devolver.mockResolvedValue({ id: 'op', monto_total: 100 })
  render(<DevolucionEfectivoModal isOpen ventaInicial={venta} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  await screen.findByText(/Ya devuelto:/)
  fireEvent.change(screen.getAllByLabelText('Cantidad a devolver')[0], { target: { value: '0,013' } })
  expect(screen.getByRole('alert').textContent).toContain('entera')
  const confirmar = screen.getByRole('button', { name: 'Confirmar devolución' })
  expect(confirmar.hasAttribute('disabled')).toBe(true)
  fireEvent.click(confirmar)
  expect(m.devolver).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('button', { name: 'Todo' })[0])
  expect(confirmar.hasAttribute('disabled')).toBe(false)
  fireEvent.click(confirmar)
  await screen.findByText('Devolución registrada')
  expect(m.devolver.mock.calls[0][1].items[0].cantidad).toBe(2)
})
it('muestra vacíos y pendientes separados y salda los pendientes sin crédito ni efectivo', async () => {
  m.cargar.mockResolvedValue([{ id: 'vidrio', nombre: 'Vidrio', precio: 100, activo: true, stockVacios: 5, pendientes: 3 }])
  m.envase.mockResolvedValue({ id: 'op', stock_vacios: 6, pendientes: 2, importe: 0 })
  const cerrar = vi.fn()
  render(<EnvasesOperativosModal isOpen onClose={cerrar} />)
  await screen.findByText('Vacíos en el negocio')
  expect(screen.getByText('Pendientes de traer')).toBeTruthy()
  fireEvent.click(screen.getByRole('checkbox', { name: /Son envases pendientes de traer/ }))
  expect(screen.queryByRole('button', { name: 'Pagar en efectivo' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Descontar del ticket' })).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Recibir pendientes sin pagar' }))
  await waitFor(() => expect(cerrar).toHaveBeenCalledOnce())
  expect(m.envase.mock.calls[0][1]).toMatchObject({ accion: 'RECIBIR_PENDIENTES', datos: { cantidad: 1, notas: null } })
  expect(m.agregar).not.toHaveBeenCalled()
})
it('Cajero no declara pendientes y no recibe más que el total pendiente', async () => {
  m.rol = 'CAJERO'
  m.cargar.mockResolvedValue([{ id: 'vidrio', nombre: 'Vidrio', precio: 100, activo: true, stockVacios: 5, pendientes: 1 }])
  render(<EnvasesOperativosModal isOpen onClose={vi.fn()} />)
  await screen.findByText('Pendientes de traer')
  expect(screen.queryByText('Registrar envases pendientes')).toBeNull()
  fireEvent.click(screen.getByRole('checkbox', { name: /Son envases pendientes de traer/ }))
  fireEvent.change(screen.getByLabelText('Cantidad recibida'), { target: { value: '2' } })
  expect(screen.getByRole('button', { name: 'Recibir pendientes sin pagar' }).hasAttribute('disabled')).toBe(true)
  expect(m.envase).not.toHaveBeenCalled()
})

it('un saldo unitario fraccionado anterior requiere conciliación y no ofrece Todo inválido', async () => {
  m.historial.mockResolvedValue({ operaciones: 2, importeReintegrado: 802.6, cantidadesPorDetalle: { detalle1: 4.013 } })
  const antigua = { ...venta, detalles: [{ ...venta.detalles[0], cantidad: 5 }] }
  render(<DevolucionEfectivoModal isOpen ventaInicial={antigua} onClose={vi.fn()} onDevolucionExitosa={vi.fn()} />)
  const aviso = await screen.findByRole('alert')
  expect(aviso.textContent).toContain('0,987')
  expect(aviso.textContent).toContain('Requiere conciliación')
  expect(screen.getByLabelText('Cantidad a devolver').closest('fieldset')?.disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Todo' }))
  expect(screen.getByRole('button', { name: 'Confirmar devolución' }).hasAttribute('disabled')).toBe(true)
  expect(screen.queryByText(/entera entre 0 y 0.987/)).toBeNull()
  expect(m.devolver).not.toHaveBeenCalled()
})

it.each(['', '   ', '  Entregas del día  '])('permite registrar pendientes con observaciones opcionales %j', async notas => {
  m.envase.mockResolvedValue({ id: 'op', stock_vacios: 5, pendientes: 3, importe: 0 })
  render(<EnvasesOperativosModal isOpen onClose={vi.fn()} />)
  await screen.findByText('Registrar envases pendientes')
  fireEvent.click(screen.getByText('Registrar envases pendientes'))
  fireEvent.change(screen.getByLabelText('Nuevo total pendiente'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Observaciones (opcional)', { exact: true }), { target: { value: notas } })
  const guardar = screen.getByRole('button', { name: 'Guardar total pendiente' })
  expect(guardar.hasAttribute('disabled')).toBe(false)
  fireEvent.click(guardar)
  await waitFor(() => expect(m.envase).toHaveBeenCalledOnce())
  expect(m.envase.mock.calls[0][1]).toMatchObject({ accion: 'AJUSTAR_PENDIENTES', datos: { pendientesEsperados: 0, nuevosPendientes: 3, notas: notas.trim() || 'Sin observaciones adicionales' } })
})

it('Depósito centra el conteo y pliega altas/edición sin distribuidor', async () => {
  render(<EnvasesOperativosModal administracion isOpen onClose={vi.fn()} />)
  await screen.findByLabelText('Vacíos contados')
  await waitFor(() => expect((screen.getByLabelText('Vacíos contados') as HTMLInputElement).value).toBe('5'))
  expect(screen.queryByLabelText('Distribuidor')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Registrar entrega al distribuidor' })).toBeNull()
  expect(screen.getByRole('tab', { name: 'Depósito de vacíos' }).getAttribute('aria-selected')).toBe('true')
  fireEvent.click(screen.getByRole('tab', { name: 'Tipos y precios' }))
  expect(screen.getByText('Nuevo tipo de envase').closest('details')?.open).toBe(false)
  expect(screen.getByText('Editar nombre y precio').closest('details')?.open).toBe(false)
  expect(screen.getByRole('button', { name: 'Crear tipo de envase' }).closest('details')).toBe(screen.getByText('Nuevo tipo de envase').closest('details'))
})
it('crear otro tipo no reutiliza nombre, precio ni ID del seleccionado', async () => {
  m.envase.mockResolvedValue({ id: 'op', stock_vacios: 0, precio: 300 })
  render(<EnvasesOperativosModal administracion isOpen onClose={vi.fn()} />)
  await screen.findByRole('tab', { name: 'Tipos y precios' })
  fireEvent.click(screen.getByRole('tab', { name: 'Tipos y precios' }))
  fireEvent.click(screen.getByText('Nuevo tipo de envase'))
  fireEvent.change(screen.getByLabelText('Nombre del nuevo envase'), { target: { value: '  Botella nueva  ' } })
  fireEvent.change(screen.getByLabelText('Precio del nuevo envase'), { target: { value: '300' } })
  fireEvent.click(screen.getByRole('button', { name: 'Crear tipo de envase' }))
  await waitFor(() => expect(m.envase).toHaveBeenCalledOnce())
  expect(m.envase.mock.calls[0][1]).toMatchObject({ accion: 'CONFIGURAR_TIPO', datos: { nombre: 'Botella nueva', precio: 300, activo: true } })
  expect(m.envase.mock.calls[0][1].tipoId).not.toBe('vidrio')
})
it('el conteo conserva saldo esperado y usa su propio motivo, no observaciones de pendientes', async () => {
  m.envase.mockResolvedValue({ id: 'op', stock_vacios: 4, importe: 0 })
  render(<EnvasesOperativosModal administracion isOpen onClose={vi.fn()} />)
  await screen.findByLabelText('Vacíos contados')
  fireEvent.change(screen.getByLabelText('Vacíos contados'), { target: { value: '4' } })
  fireEvent.change(screen.getByLabelText('Motivo del ajuste de stock'), { target: { value: '  Conteo físico  ' } })
  fireEvent.click(screen.getByRole('button', { name: 'Guardar conteo de vacíos' }))
  await waitFor(() => expect(m.envase).toHaveBeenCalledOnce())
  expect(m.envase.mock.calls[0][1]).toMatchObject({ accion: 'AJUSTAR_SALDO', tipoId: 'vidrio', datos: { stockEsperado: 5, nuevoStock: 4, notas: 'Conteo físico' } })
})

it('Movimientos abre el historial con observaciones sin los formularios de depósito', async () => {
  render(<EnvasesOperativosModal administracion isOpen onClose={vi.fn()} />)
  await screen.findByLabelText('Vacíos contados')
  fireEvent.click(screen.getByRole('tab', { name: 'Movimientos' }))
  await screen.findByText('No hay movimientos registrados en este período.')
  expect(screen.queryByLabelText('Vacíos contados')).toBeNull()
  expect(screen.queryByText('Nuevo tipo de envase')).toBeNull()
  expect(m.movimientos).toHaveBeenCalledOnce()
})
