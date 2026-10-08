import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import toast from 'react-hot-toast'
import { db, llamadasA, resetDb, responder } from '../test/supabaseMock'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../lib/supabase', async () => {
  const modulo = (await import('../test/supabaseMock')).crearModuloSupabase()
  return { ...modulo, supabase: { ...modulo.supabase, rpc } }
})
vi.mock('../components/reportes/BalanceContableTab', () => ({ BalanceContableTab: () => <div>balance-tab</div> }))
vi.mock('../components/reportes/RotacionTab', () => ({ RotacionTab: () => <div>rotacion-tab</div> }))
vi.mock('../components/reportes/BajasStockTab', () => ({ BajasStockTab: () => <div>bajas-tab</div> }))
vi.mock('../components/pos/TicketReceiptModal', () => ({ TicketReceiptModal: () => null }))
vi.mock('../lib/exportUtils', () => ({ exportarVentasExcel: vi.fn() }))

import { ReportesPage } from './ReportesPage'
import { useAuthStore } from '../stores/authStore'
import { useCajaStore } from '../stores/cajaStore'
import { useClienteStore } from '../stores/clienteStore'
import { useComboStore } from '../stores/comboStore'
import { useLoteStore } from '../stores/loteStore'
import { formatPrecio as formatPrecioReal } from '../lib/utils'

const formatPrecio = (n: number) => formatPrecioReal(n).replace(/\s/g, ' ')

const KIOSCO = 'k1'

interface VentaFixture {
  id: string
  total: number
  estado?: string
  pagos?: { medio_pago: string; monto: number }[]
  detalles?: Record<string, unknown>[]
}

function venta({ id, total, estado = 'COMPLETADA', pagos, detalles }: VentaFixture) {
  return {
    id,
    fecha_hora: '2026-03-10T15:00:00.000Z',
    total,
    estado,
    notas: null,
    pagos: pagos ?? [{ medio_pago: 'EFECTIVO', monto: total }],
    detalles: detalles ?? [],
  }
}

function detalle(productoId: string, cantidad: number, costo: number, precio = 100, extra: Record<string, unknown> = {}) {
  return {
    cantidad,
    precio_unitario: precio,
    subtotal: cantidad * precio,
    producto_id: productoId,
    producto: { id: productoId, descripcion: `Prod ${productoId}`, stock_actual: 0, precio_costo: costo },
    ...extra,
  }
}

async function abrirVentasDiarias() {
  render(<MemoryRouter><ReportesPage /></MemoryRouter>)
  fireEvent.click(screen.getByText('Ventas Diarias'))
  await waitFor(() => expect(screen.queryByText('Cargando reporte...')).toBeNull())
}

const cajaOriginal = useCajaStore.getState().registrarMovimientoCaja

beforeEach(() => {
  localStorage.clear()
  resetDb()
  rpc.mockReset()
  rpc.mockImplementation(async (_nombre: string, args: { p_venta_id: string }) => ({
    data: { venta_id: args.p_venta_id, kiosco_id: KIOSCO, estado: 'ANULADA', stock: [] }, error: null,
  }))
  vi.spyOn(useClienteStore.getState(), 'cargarClientes').mockResolvedValue([])
  vi.spyOn(useCajaStore.getState(), 'cargarMovimientosSesion').mockResolvedValue([])
  vi.clearAllMocks()
  useAuthStore.setState({ usuario: { id: 'u1', nombre: 'Dueño', rol: 'DUEÑO', kiosco_id: KIOSCO } as never, kiosco: null })
  useCajaStore.setState({ sesionActiva: null, registrarMovimientoCaja: cajaOriginal })
  useComboStore.setState({ itemsCombo: [] })
  responder('devoluciones_venta.select', { data: [], error: null })
  vi.spyOn(useLoteStore.getState(), 'restituirStockLote').mockResolvedValue(undefined as never)
})

describe('ReportesPage: resumen diario', () => {
  it('permite al dueño abrir bajas de inventario', () => {
    render(<MemoryRouter><ReportesPage /></MemoryRouter>)
    fireEvent.click(screen.getByRole('button', { name: 'Bajas de Inventario' }))
    expect(screen.getByText('bajas-tab')).toBeTruthy()
  })

  it('no ofrece el reporte de costos de bajas al cajero', () => {
    useAuthStore.setState({ usuario: { id: 'u1', rol: 'CAJERO', kiosco_id: KIOSCO } as never })
    render(<MemoryRouter><ReportesPage /></MemoryRouter>)
    expect(screen.queryByRole('button', { name: 'Bajas de Inventario' })).toBeNull()
  })

  it('abre en la pestaña de balance contable', () => {
    render(<MemoryRouter><ReportesPage /></MemoryRouter>)
    expect(screen.getByText('balance-tab')).toBeTruthy()
  })

  it('calcula facturación, costo, ganancia y margen ignorando ventas anuladas', async () => {
    responder('ventas.select', {
      data: [
        venta({ id: 'v1', total: 1000, detalles: [detalle('a', 4, 100)] }), // costo 400
        venta({ id: 'v2', total: 500, detalles: [detalle('b', 2, 100)] }), // costo 200
        venta({ id: 'v3', total: 300, estado: 'ANULADA', detalles: [detalle('c', 3, 100)] }),
      ],
      error: null,
    })

    await abrirVentasDiarias()

    expect(screen.getAllByText(formatPrecio(1500)).length).toBeGreaterThan(0) // total facturado
    expect(screen.getByText('Ganancia Bruta')).toBeTruthy()
    expect(screen.getByText(formatPrecio(900))).toBeTruthy() // 1500 - 600
    expect(screen.getByText('60.0%')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy() // ventas completadas
    expect(screen.getByText(formatPrecio(750))).toBeTruthy() // ticket promedio
    const seleccionProductos = llamadasA('ventas', 'select')[0].filtros.find(([nombre]) => nombre === 'select')?.[1]
    expect(JSON.stringify(seleccionProductos)).not.toContain('precio_costo')
    // ventas también referencia usuarios mediante anulada_por: elegir el vendedor.
    expect(JSON.stringify(seleccionProductos)).toContain('usuario:usuarios!usuario_id(nombre)')
    expect(JSON.stringify(seleccionProductos)).not.toContain('usuario:usuarios(nombre)')
    expect(llamadasA('producto_costos', 'select')).toHaveLength(1)
  })

  it('descuenta devoluciones del total, del costo y del canal de pago', async () => {
    responder('ventas.select', {
      data: [venta({ id: 'v1', total: 1000, detalles: [detalle('a', 4, 100)] })],
      error: null,
    })
    responder('devoluciones_venta.select', {
      data: [{ id: 'd1', monto_total: 100, metodo_reintegro: 'EFECTIVO_CAJA', detalles: [{ cantidad: 1, producto: { precio_costo: 100 } }] }],
      error: null,
    })

    await abrirVentasDiarias()

    expect(screen.getByText(`Deducidos ${formatPrecio(100)} en devoluciones`)).toBeTruthy()
    // total 900, costo 400-100=300, ganancia 600
    expect(screen.getByText(formatPrecio(600))).toBeTruthy()
    // medio de pago EFECTIVO: 1000 - 100
    expect(screen.getAllByText(formatPrecio(900)).length).toBeGreaterThan(0)
  })

  it('no resta del medio de pago las devoluciones con reintegro OTRO', async () => {
    responder('ventas.select', { data: [venta({ id: 'v1', total: 1000 })], error: null })
    responder('devoluciones_venta.select', {
      data: [{ id: 'd1', monto_total: 100, metodo_reintegro: 'OTRO', detalles: [] }],
      error: null,
    })

    await abrirVentasDiarias()

    // el desglose por EFECTIVO sigue en 1000 (el total facturado sí baja a 900)
    expect(screen.getAllByText(formatPrecio(1000)).length).toBeGreaterThan(0)
  })

  it('muestra pérdida neta cuando el costo supera a la venta', async () => {
    responder('ventas.select', {
      data: [venta({ id: 'v1', total: 100, detalles: [detalle('a', 1, 300)] })],
      error: null,
    })

    await abrirVentasDiarias()

    expect(screen.getByText('Pérdida Neta')).toBeTruthy()
    expect(screen.getByText(`-${formatPrecio(200)}`)).toBeTruthy()
  })

  it('ignora el costo de las devoluciones de envase', async () => {
    responder('ventas.select', {
      data: [venta({ id: 'v1', total: 100, detalles: [detalle('env', 1, 500, 100, { es_devolucion_envase: true })] })],
      error: null,
    })

    await abrirVentasDiarias()

    expect(screen.getByText('Ganancia Bruta')).toBeTruthy()
    expect(screen.getByText('100.0%')).toBeTruthy()
  })

  it('un cajero no ve ganancia ni márgenes', async () => {
    useAuthStore.setState({ usuario: { id: 'u2', rol: 'CAJERO', kiosco_id: KIOSCO } as never })
    responder('ventas.select', { data: [venta({ id: 'v1', total: 100 })], error: null })

    await abrirVentasDiarias()

    expect(screen.queryByText('Ganancia Bruta')).toBeNull()
    expect(screen.queryByText('Solo Dueño')).toBeNull()
  })

  it('no solicita datos de costo en las consultas de reportes para un cajero', async () => {
    useAuthStore.setState({ usuario: { id: 'u2', rol: 'CAJERO', kiosco_id: KIOSCO } as never })
    responder('ventas.select', { data: [venta({ id: 'v1', total: 100 })], error: null })

    await abrirVentasDiarias()

    const argumentosSeleccion = llamadasA('ventas', 'select')[0].filtros.find(([nombre]) => nombre === 'select')?.[1]
    expect(JSON.stringify(argumentosSeleccion)).not.toContain('precio_costo')
    const argumentosDevoluciones = llamadasA('devoluciones_venta', 'select')[0].filtros.find(([nombre]) => nombre === 'select')?.[1]
    expect(JSON.stringify(argumentosDevoluciones)).not.toContain('precio_costo')
    expect(llamadasA('producto_costos', 'select')).toHaveLength(0)
  })

  it('filtra las consultas por el kiosco del usuario', async () => {
    responder('ventas.select', { data: [], error: null })
    await abrirVentasDiarias()

    const filtros = llamadasA('ventas', 'select')[0].filtros
    expect(filtros).toContainEqual(['eq', ['kiosco_id', KIOSCO]])
    expect(screen.getByText('No hay ventas registradas en esta fecha')).toBeTruthy()
  })

  it('avisa si falla la carga de ventas y deja de mostrar el spinner', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    responder('ventas.select', { data: null, error: { message: 'timeout' } })

    await abrirVentasDiarias()

    expect(toast.error).toHaveBeenCalledWith('Error al cargar ventas')
  })
})

describe('ReportesPage: anulación de venta', () => {
  async function abrirConfirmacion() {
    responder('ventas.select', { data: [venta({ id: 'v1', total: 200 })], error: null })
    await abrirVentasDiarias()
    fireEvent.click(screen.getByText('Completada'))
    fireEvent.click(screen.getByText('Anular venta'))
    fireEvent.change(screen.getByPlaceholderText('Ej.: venta duplicada, error en los productos...'), {
      target: { value: 'Error de carga duplicada' },
    })
  }
  function confirmar() { fireEvent.click(screen.getByText('Sí, anular venta')) }
  function sinEscriturasParciales() {
    expect(db.llamadas.filter(llamada => ['insert', 'update', 'delete'].includes(llamada.op))).toHaveLength(0)
    expect(useLoteStore.getState().restituirStockLote).not.toHaveBeenCalled()
  }
  it('confirma con una RPC e invalida la copia de stock sin escribir tablas', async () => {
    localStorage.setItem(`kiosko_cache_productos_${KIOSCO}`, '[]')
    await abrirConfirmacion(); confirmar()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledExactlyOnceWith('anular_venta_atomica', {
      p_venta_id: 'v1', p_motivo: 'Error de carga duplicada', p_sesion_reintegro: null,
    })
    expect(localStorage.getItem(`kiosko_cache_productos_${KIOSCO}`)).toBeNull()
    expect(useClienteStore.getState().cargarClientes).toHaveBeenCalledTimes(1)
    sinEscriturasParciales()
  })
  it.each(['La venta ya tiene devoluciones parciales.', 'Seleccioná una caja abierta para el reintegro.', 'Esta venta requiere conciliación.'])
  ('conserva el diálogo ante rechazo: %s', async mensaje => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValue({ data: null, error: { message: mensaje } })
    await abrirConfirmacion(); confirmar()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith(mensaje))
    expect(screen.getByText('Confirmar anulación de venta')).toBeTruthy()
    expect(toast.success).not.toHaveBeenCalled()
    sinEscriturasParciales()
  })
  it('no envía motivos demasiado breves', async () => {
    await abrirConfirmacion()
    fireEvent.change(screen.getByPlaceholderText('Ej.: venta duplicada, error en los productos...'), { target: { value: 'no' } })
    confirmar()
    expect(rpc).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith('Escribí un motivo de al menos 5 caracteres para auditar la anulación.')
  })
  it('envía la caja actual sólo cuando el dueño la elige', async () => {
    useCajaStore.setState({ sesionActiva: { id: 's1', estado: 'ABIERTA', fecha_cierre: null } as never })
    await abrirConfirmacion()
    fireEvent.click(screen.getByRole('checkbox'))
    confirmar()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledWith('anular_venta_atomica', expect.objectContaining({ p_sesion_reintegro: 's1' }))
    sinEscriturasParciales()
  })
  it('mantiene la confirmación si falla la recarga local', async () => {
    vi.mocked(useClienteStore.getState().cargarClientes).mockRejectedValue(new Error('offline'))
    await abrirConfirmacion(); confirmar()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('La venta quedó anulada'))
    sinEscriturasParciales()
  })
  it('permite reintentar la misma venta tras una respuesta incierta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'timeout' } })
    await abrirConfirmacion(); confirmar()
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('timeout'))
    confirmar()
    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(rpc).toHaveBeenCalledTimes(2)
    expect(rpc.mock.calls[0]).toEqual(rpc.mock.calls[1])
    sinEscriturasParciales()
  })
  it('cancelar no envía operaciones', async () => {
    await abrirConfirmacion()
    fireEvent.click(screen.getByText('Cancelar'))
    expect(screen.queryByText('Confirmar anulación de venta')).toBeNull()
    expect(rpc).not.toHaveBeenCalled()
    sinEscriturasParciales()
  })
})
describe('ReportesPage - Pestaña Rotación y Stock Inmovilizado', () => {
  it('muestra la pestaña de rotación para DUEÑO y permite seleccionarla', async () => {
    useAuthStore.setState({
      usuario: { id: 'u1', nombre: 'Dueño', rol: 'DUEÑO', kiosco_id: KIOSCO, activo: true } as never,
      kiosco: { id: KIOSCO, nombre: 'Kiosco Central' } as never,
    })

    render(<MemoryRouter><ReportesPage /></MemoryRouter>)

    const btnRotacion = screen.getByText('Rotación y Stock Inmovilizado')
    expect(btnRotacion).toBeTruthy()

    fireEvent.click(btnRotacion)

    expect(screen.getByText('rotacion-tab')).toBeTruthy()
    expect(screen.queryByText('balance-tab')).toBeNull()
  })

  it('oculta la pestaña de rotación para usuarios con rol CAJERO', async () => {
    useAuthStore.setState({
      usuario: { id: 'u2', nombre: 'Cajero', rol: 'CAJERO', kiosco_id: KIOSCO, activo: true } as never,
      kiosco: { id: KIOSCO, nombre: 'Kiosco Central' } as never,
    })

    render(<MemoryRouter><ReportesPage /></MemoryRouter>)

    expect(screen.queryByText('Rotación y Stock Inmovilizado')).toBeNull()
  })
})
