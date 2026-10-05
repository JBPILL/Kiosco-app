import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import toast from 'react-hot-toast'
import { db, encolar, llamadasA, resetDb, responder } from '../test/supabaseMock'

vi.mock('../lib/supabase', async () => (await import('../test/supabaseMock')).crearModuloSupabase())
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
  render(<ReportesPage />)
  fireEvent.click(screen.getByText('Ventas Diarias'))
  await waitFor(() => expect(screen.queryByText('Cargando reporte...')).toBeNull())
}

const cajaOriginal = useCajaStore.getState().registrarMovimientoCaja

beforeEach(() => {
  localStorage.clear()
  resetDb()
  vi.clearAllMocks()
  useAuthStore.setState({ usuario: { id: 'u1', nombre: 'Dueño', rol: 'DUEÑO', kiosco_id: KIOSCO } as never, kiosco: null })
  useCajaStore.setState({ sesionActiva: null, registrarMovimientoCaja: cajaOriginal })
  useComboStore.setState({ itemsCombo: [] })
  responder('devoluciones_venta.select', { data: [], error: null })
  vi.spyOn(useLoteStore.getState(), 'restituirStockLote').mockResolvedValue(undefined as never)
})

describe('ReportesPage: resumen diario', () => {
  it('permite al dueño abrir bajas de inventario', () => {
    render(<ReportesPage />)
    fireEvent.click(screen.getByRole('button', { name: 'Bajas de Inventario' }))
    expect(screen.getByText('bajas-tab')).toBeTruthy()
  })

  it('no ofrece el reporte de costos de bajas al cajero', () => {
    useAuthStore.setState({ usuario: { id: 'u1', rol: 'CAJERO', kiosco_id: KIOSCO } as never })
    render(<ReportesPage />)
    expect(screen.queryByRole('button', { name: 'Bajas de Inventario' })).toBeNull()
  })

  it('abre en la pestaña de balance contable', () => {
    render(<ReportesPage />)
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
  async function abrirConfirmacion(v: ReturnType<typeof venta>) {
    responder('ventas.select', { data: [v], error: null })
    await abrirVentasDiarias()
    fireEvent.click(screen.getByText('Completada'))
    fireEvent.click(screen.getByText('Anular venta'))
    fireEvent.change(screen.getByPlaceholderText('Ej.: venta duplicada, error en los productos...'), { target: { value: 'Anulación solicitada por el dueño' } })
  }

  const sesionAbierta = { id: 's1', estado: 'ABIERTA', fecha_cierre: null } as never

  it('repone stock, registra movimiento y egreso de caja por el efectivo', async () => {
    const registrar = vi.fn().mockResolvedValue(undefined)
    useCajaStore.setState({ sesionActiva: sesionAbierta, registrarMovimientoCaja: registrar })
    responder('productos.select', { data: { id: 'a', stock_actual: 10, descripcion: 'A', es_combo: false }, error: null })

    await abrirConfirmacion(venta({ id: 'abcdef123456', total: 200, detalles: [detalle('a', 2, 50)] }))
    fireEvent.change(screen.getByPlaceholderText('Ej.: venta duplicada, error en los productos...'), { target: { value: 'Error de carga duplicada' } })
    fireEvent.click(screen.getByText('Sí, anular venta'))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(llamadasA('ventas', 'update')[0].payload).toMatchObject({ estado: 'ANULADA', motivo_anulacion: 'Error de carga duplicada' })
    expect((llamadasA('productos', 'update')[0].payload as { stock_actual: number }).stock_actual).toBe(12)
    expect(llamadasA('movimientos_stock', 'insert')[0].payload).toMatchObject({
      producto_id: 'a',
      tipo: 'INGRESO',
      cantidad: 2,
      motivo: 'DEVOLUCION',
    })
    expect(useLoteStore.getState().restituirStockLote).toHaveBeenCalledWith('a', 2, KIOSCO)
    expect(registrar).toHaveBeenCalledWith('EGRESO', 'DEVOLUCION_VENTA', 200, expect.stringContaining('#ABCDEF12'))
  })

  it('no anula una venta que ya tiene devoluciones parciales', async () => {
    encolar(
      'devoluciones_venta.select',
      { data: [], error: null }, // carga inicial del reporte
      { data: [{ id: 'd1', monto_total: 50 }], error: null } // chequeo previo a anular
    )

    await abrirConfirmacion(venta({ id: 'v1', total: 200, detalles: [detalle('a', 2, 50)] }))
    fireEvent.change(screen.getByPlaceholderText('Ej.: venta duplicada, error en los productos...'), { target: { value: 'Error de carga' } })
    fireEvent.click(screen.getByText('Sí, anular venta'))

    await waitFor(() => expect(toast.error).toHaveBeenCalled())
    expect(llamadasA('ventas', 'update')).toHaveLength(0)
    expect(llamadasA('productos', 'update')).toHaveLength(0)
  })

  it('requiere un motivo suficiente antes de enviar la anulación', async () => {
    await abrirConfirmacion(venta({ id: 'v1', total: 200 }))
    fireEvent.change(screen.getByPlaceholderText('Ej.: venta duplicada, error en los productos...'), { target: { value: 'no' } })
    fireEvent.click(screen.getByText('Sí, anular venta'))

    expect(llamadasA('ventas', 'update')).toHaveLength(0)
    expect(toast.error).toHaveBeenCalledWith('Escribí un motivo de al menos 5 caracteres para auditar la anulación.')
  })

  it('en un combo repone los componentes y no el combo', async () => {
    useComboStore.setState({
      itemsCombo: [{ id: 'i1', kiosco_id: KIOSCO, combo_producto_id: 'combo', componente_producto_id: 'ron', cantidad: 2 }] as never,
    })
    encolar(
      'productos.select',
      { data: { id: 'combo', stock_actual: 0, descripcion: 'Combo', es_combo: true }, error: null },
      { data: { id: 'ron', stock_actual: 10, descripcion: 'Ron' }, error: null }
    )

    await abrirConfirmacion(
      venta({ id: 'v1', total: 300, pagos: [{ medio_pago: 'MERCADOPAGO', monto: 300 }], detalles: [detalle('combo', 3, 0)] })
    )
    fireEvent.click(screen.getByText('Sí, anular venta'))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    const updates = llamadasA('productos', 'update')
    expect(updates).toHaveLength(1)
    expect((updates[0].payload as { stock_actual: number }).stock_actual).toBe(16) // 10 + 2*3
    expect(useLoteStore.getState().restituirStockLote).toHaveBeenCalledWith('ron', 6, KIOSCO)
  })

  it('no repone stock de devoluciones de envase ni de líneas sin precio', async () => {
    await abrirConfirmacion(
      venta({
        id: 'v1',
        total: 100,
        pagos: [{ medio_pago: 'MERCADOPAGO', monto: 100 }],
        detalles: [detalle('env', 1, 0, 100, { es_devolucion_envase: true }), detalle('regalo', 1, 0, 0)],
      })
    )
    fireEvent.click(screen.getByText('Sí, anular venta'))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(llamadasA('productos', 'update')).toHaveLength(0)
  })

  it('revierte la deuda del cliente cuando se pagó en cuenta corriente', async () => {
    const revertir = vi.fn().mockResolvedValue(undefined)
    useClienteStore.setState({ revertirCargoVenta: revertir } as never)

    await abrirConfirmacion(venta({ id: 'v9', total: 400, pagos: [{ medio_pago: 'CUENTA_CORRIENTE', monto: 400 }] }))
    fireEvent.click(screen.getByText('Sí, anular venta'))

    await waitFor(() => expect(revertir).toHaveBeenCalledWith('v9', 400))
  })

  it('sin sesión abierta registra el egreso en la última sesión abierta de la base', async () => {
    encolar('sesiones_caja.select', { data: { id: 'sX', estado: 'ABIERTA', fecha_cierre: null }, error: null })

    await abrirConfirmacion(venta({ id: 'v1', total: 250 }))
    fireEvent.click(screen.getByText('Sí, anular venta'))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(llamadasA('movimientos_caja', 'insert')[0].payload).toMatchObject({
      sesion_caja_id: 'sX',
      tipo: 'EGRESO',
      motivo: 'DEVOLUCION_VENTA',
      monto: 250,
    })
  })

  it('sin ninguna sesión abierta no toca arqueos cerrados y avisa', async () => {
    await abrirConfirmacion(venta({ id: 'v1', total: 250 }))
    fireEvent.click(screen.getByText('Sí, anular venta'))

    await waitFor(() => expect(toast.success).toHaveBeenCalled())
    expect(llamadasA('movimientos_caja', 'insert')).toHaveLength(0)
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('No hay ninguna sesión de caja abierta'), expect.anything())
  })

  it('si falla el update de la venta no repone stock ni toca la caja', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const registrar = vi.fn()
    useCajaStore.setState({ sesionActiva: sesionAbierta, registrarMovimientoCaja: registrar })
    responder('ventas.update', { error: { message: 'RLS' } })

    await abrirConfirmacion(venta({ id: 'v1', total: 200, detalles: [detalle('a', 2, 50)] }))
    fireEvent.click(screen.getByText('Sí, anular venta'))

    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('No se pudo anular la venta'))
    expect(llamadasA('productos', 'update')).toHaveLength(0)
    expect(registrar).not.toHaveBeenCalled()
    expect(db.llamadas.some((l) => l.tabla === 'movimientos_stock')).toBe(false)
  })

  it('cancelar cierra el diálogo sin modificar nada', async () => {
    await abrirConfirmacion(venta({ id: 'v1', total: 200 }))
    fireEvent.click(screen.getByText('Cancelar'))

    expect(screen.queryByText('Confirmar anulación de venta')).toBeNull()
    expect(llamadasA('ventas', 'update')).toHaveLength(0)
  })
})

describe('ReportesPage - Pestaña Rotación y Stock Inmovilizado', () => {
  it('muestra la pestaña de rotación para DUEÑO y permite seleccionarla', async () => {
    useAuthStore.setState({
      usuario: { id: 'u1', nombre: 'Dueño', rol: 'DUEÑO', kiosco_id: KIOSCO, activo: true } as never,
      kiosco: { id: KIOSCO, nombre: 'Kiosco Central' } as never,
    })

    render(<ReportesPage />)

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

    render(<ReportesPage />)

    expect(screen.queryByText('Rotación y Stock Inmovilizado')).toBeNull()
  })
})
