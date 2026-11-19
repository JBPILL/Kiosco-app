// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

interface ExcelCellMock {
  value: unknown
  format?: string
}

interface SingleSheetCall {
  kind: 'single'
  rows: ExcelCellMock[][]
}

interface MultiSheetCall {
  kind: 'multi'
  sheets: { sheet: string; data: ExcelCellMock[][] }[]
}

type WriteXlsxCall = SingleSheetCall | MultiSheetCall

interface MockRow {
  id: string
  estado?: string
  [campo: string]: unknown
}

const mocks = vi.hoisted(() => ({
  writeCalls: [] as WriteXlsxCall[],
  queries: [] as { tabla: string; seleccion: string }[],
  tables: {
    sesiones_caja: [] as MockRow[],
    movimientos_caja: [] as MockRow[],
    ventas: [] as MockRow[],
    devoluciones_venta: [] as MockRow[],
    productos: [] as MockRow[],
    categorias: [] as MockRow[],
    movimientos_stock: [] as MockRow[],
    clientes: [] as MockRow[],
    proveedores: [] as MockRow[],
    compras_proveedor: [] as MockRow[],
    pagos_proveedor: [] as MockRow[],
    envases_tipos_comercio: [] as MockRow[],
    envases_saldos: [] as MockRow[],
    envases_pendientes: [] as MockRow[],
    envases_movimientos: [] as MockRow[],
  } as Record<string, MockRow[]>,
  costosProtegidos: [] as { producto_id: string; precio_costo: number }[],
  cargarArqueoCiegoConfig: vi.fn().mockResolvedValue(false),
  cargarClientes: vi.fn().mockResolvedValue([]),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))

vi.mock('react-hot-toast', () => ({
  default: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}))

vi.mock('write-excel-file/browser', () => ({
  default: vi.fn((data: ExcelCellMock[][] | { sheet: string; data: ExcelCellMock[][] }[]) => {
    if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
      mocks.writeCalls.push({ kind: 'single', rows: data as ExcelCellMock[][] })
    } else {
      mocks.writeCalls.push({
        kind: 'multi',
        sheets: data as { sheet: string; data: ExcelCellMock[][] }[],
      })
    }
    return {
      toFile: vi.fn().mockResolvedValue(undefined),
    }
  }),
}))

vi.mock('../lib/supabase', () => ({
  createUnauthenticatedClient: () => ({}),
  supabase: {
    from: (tabla: string) => {
      const q = { tabla, seleccion: '' }
      mocks.queries.push(q)
      let cursorId: string | null = null
      let sesionId: string | null = null
      let tipoFiltro: string | null = null
      let motivoFiltro: string | null = null
      let estadoFiltro: string | null = null
      let singleMode = false

      const filterRows = () => {
        const list = mocks.tables[tabla] || []
        return list
          .filter((row) => {
            if (cursorId && String(row.id) <= cursorId) return false
            if (sesionId && String(row.sesion_caja_id) !== sesionId) return false
            if (tipoFiltro && String(row.tipo) !== tipoFiltro) return false
            if (motivoFiltro && String(row.motivo) !== motivoFiltro) return false
            if (estadoFiltro && String(row.estado) !== estadoFiltro) return false
            return true
          })
          .sort((a, b) => String(a.id).localeCompare(String(b.id)))
      }

      const builder = {
        select(seleccion: string) {
          q.seleccion = seleccion
          return builder
        },
        returns() {
          return builder
        },
        eq(campo: string, valor: string) {
          if (campo === 'sesion_caja_id') sesionId = valor
          if (campo === 'tipo') tipoFiltro = valor
          if (campo === 'motivo') motivoFiltro = valor
          if (campo === 'estado') estadoFiltro = valor
          return builder
        },
        gte() {
          return builder
        },
        lte() {
          return builder
        },
        order() {
          return builder
        },
        limit() {
          return builder
        },
        gt(_campo: string, valor: string) {
          cursorId = valor
          return builder
        },
        maybeSingle() {
          singleMode = true
          return builder
        },
        single() {
          singleMode = true
          return builder
        },
        then(
          resolve: (res: { data: unknown; error: null }) => unknown,
          reject?: (err: unknown) => unknown
        ) {
          const rows = filterRows()
          return Promise.resolve({
            data: singleMode ? rows[0] ?? null : rows,
            error: null,
          }).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

vi.mock('../lib/productCostAccess', () => ({
  cargarCostosProtegidos: vi.fn(async () => mocks.costosProtegidos),
  adjuntarCostosProtegidos: <T extends { id: string }>(
    items: T[],
    costos: { producto_id: string; precio_costo: number }[]
  ) => {
    const mapa = new Map(costos.map((c) => [c.producto_id, c.precio_costo]))
    return items.map((p) => ({ ...p, precio_costo: mapa.get(p.id) ?? 0 }))
  },
}))

vi.mock('../lib/externalBackupReminder', () => ({
  registrarDescargaRespaldoExterno: vi.fn(),
  getEstadoRecordatorioRespaldo: () => ({ vence: false, ultimaDescarga: null }),
}))

vi.mock('../components/pos/TicketCierreCajaModal', () => ({ TicketCierreCajaModal: () => null }))
vi.mock('../components/pos/TicketReceiptModal', () => ({ TicketReceiptModal: () => null }))
vi.mock('../components/config/ExternalBackupReminder', () => ({ ExternalBackupReminder: () => null }))
vi.mock('../components/reportes/RotacionTab', () => ({ RotacionTab: () => <div>rotacion-tab</div> }))
vi.mock('../components/reportes/BajasStockTab', () => ({ BajasStockTab: () => <div>bajas-tab</div> }))
vi.mock('../lib/whatsappReport', () => ({ procesarDespachoCierre: vi.fn() }))

import { formatMotivoMovimientoCaja } from '../lib/cajaDisplay'
import { BalanceContableTab } from '../components/reportes/BalanceContableTab'
import { exportarExcelMaestroComercio } from '../lib/masterExcelExport'
import { exportarVentasExcel } from '../lib/exportUtils'
import { formatPrecio as formatPrecioReal } from '../lib/utils'
import { CajaPage } from '../pages/CajaPage'
import { ReportesPage } from '../pages/ReportesPage'
import { useAuthStore } from '../stores/authStore'
import { useCajaStore } from '../stores/cajaStore'
import { useClienteStore } from '../stores/clienteStore'

const formatPrecio = (n: number) => formatPrecioReal(n).replace(/\s/g, ' ')

describe('SAAS-ENVASES-REPORTS-03: cierre en Caja, Reportes y Exportación Excel para envases y devoluciones', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_KIOSKO_PILOT_STRICT_SCOPE', 'true')
    vi.stubEnv('VITE_CHECKOUT_MANUAL_TRANSACCIONAL', 'true')
    vi.stubEnv('VITE_KIOSKO_ENVASES_TRANSACCIONAL', 'true')
    vi.stubEnv('VITE_KIOSKO_DEVOLUCIONES_EFECTIVO', 'true')
    localStorage.clear()

    mocks.writeCalls = []
    mocks.queries = []
    mocks.costosProtegidos = [{ producto_id: 'prod-1', precio_costo: 400 }]

    useAuthStore.setState({
      usuario: {
        id: 'u-dueno',
        kiosco_id: 'k1',
        nombre: 'Dueño Test',
        rol: 'DUEÑO',
        es_superadmin: false,
        activo: true,
      } as never,
      kiosco: { id: 'k1', nombre: 'Kiosco Piloto', rubro: 'kiosco' } as never,
    })

    vi.spyOn(useClienteStore.getState(), 'cargarClientes').mockImplementation(mocks.cargarClientes)

    mocks.tables.sesiones_caja = [
      {
        id: 's1',
        kiosco_id: 'k1',
        usuario_id: 'u-dueno',
        monto_inicial: 10000,
        estado: 'ABIERTA',
        fecha_apertura: '2026-11-16T08:00:00Z',
        fecha_cierre: null,
        usuario: { id: 'u-dueno', nombre: 'Dueño Test', rol: 'DUEÑO' },
      },
    ]

    mocks.tables.movimientos_caja = [
      {
        id: 'mc1',
        kiosco_id: 'k1',
        sesion_caja_id: 's1',
        usuario_id: 'u-dueno',
        tipo: 'EGRESO',
        motivo: 'DEVOLUCION_ENVASE',
        monto: 300,
        descripcion: 'Recepción de envases Botella 1L',
        fecha_hora: '2026-11-16T11:00:00Z',
        usuario: { id: 'u-dueno', nombre: 'Dueño Test' },
      },
      {
        id: 'mc2',
        kiosco_id: 'k1',
        sesion_caja_id: 's1',
        usuario_id: 'u-dueno',
        tipo: 'EGRESO',
        motivo: 'DEVOLUCION_VENTA',
        monto: 500,
        descripcion: 'Devolución atómica v1',
        fecha_hora: '2026-11-16T12:00:00Z',
        usuario: { id: 'u-dueno', nombre: 'Dueño Test' },
      },
    ]

    mocks.tables.ventas = [
      {
        id: 'v1',
        kiosco_id: 'k1',
        sesion_caja_id: 's1',
        fecha_hora: '2026-11-16T10:00:00Z',
        total: 1700,
        estado: 'COMPLETADA',
        notas: null,
        usuario: { nombre: 'Dueño Test' },
        pagos: [{ medio_pago: 'EFECTIVO', monto: 1700 }],
        detalles: [
          {
            cantidad: 2,
            precio_unitario: 1000,
            subtotal: 2000,
            producto_id: 'prod-1',
            sin_envase: false,
            es_devolucion_envase: false,
            producto: { id: 'prod-1', descripcion: 'Cerveza 1L Retornable', stock_actual: 10, precio_venta: 1000 },
          },
          {
            cantidad: 1,
            precio_unitario: 0,
            subtotal: -300,
            producto_id: 'env-bot-1l',
            sin_envase: false,
            es_devolucion_envase: true,
            producto: null,
          },
        ],
      },
    ]

    mocks.tables.devoluciones_venta = [
      {
        id: 'd1',
        kiosco_id: 'k1',
        venta_id: 'v1',
        fecha_hora: '2026-11-16T12:00:00Z',
        monto_total: 500,
        metodo_reintegro: 'EFECTIVO_CAJA',
        motivo: 'FALLA_ROTURA',
        notas: 'Botella dañada sin reingreso',
        usuario: { nombre: 'Dueño Test' },
        venta: {
          id: 'v1',
          fecha_hora: '2026-11-16T10:00:00Z',
          total: 1700,
          estado: 'COMPLETADA',
          notas: null,
          usuario: { nombre: 'Dueño Test' },
          pagos: [{ medio_pago: 'EFECTIVO', monto: 1700 }],
          detalles: [
            {
              cantidad: 2,
              precio_unitario: 1000,
              subtotal: 2000,
              producto_id: 'prod-1',
              es_devolucion_envase: false,
              producto: { descripcion: 'Cerveza 1L Retornable' },
            },
          ],
        },
        detalles: [
          {
            cantidad: 1,
            subtotal: 500,
            reingresa_stock: false,
            producto_id: 'prod-1',
            producto: { id: 'prod-1' },
          },
        ],
      },
    ]

    mocks.tables.productos = [
      {
        id: 'prod-1',
        kiosco_id: 'k1',
        descripcion: 'Cerveza 1L Retornable',
        stock_actual: 10,
        stock_minimo: 2,
        precio_venta: 1000,
        activo: true,
        es_pesable: false,
      },
    ]
    mocks.tables.categorias = [{ id: 'cat-1', kiosco_id: 'k1', nombre: 'Bebidas', orden: 1 }]
    mocks.tables.movimientos_stock = [
      {
        id: 'ms1',
        kiosco_id: 'k1',
        fecha: '2026-11-16T10:00:00Z',
        tipo: 'EGRESO',
        cantidad: 2,
        delta_stock: -2,
        motivo: 'VENTA',
        notas: null,
        producto: { descripcion: 'Cerveza 1L Retornable' },
        usuario: { nombre: 'Dueño Test' },
      },
    ]
    mocks.tables.clientes = []
    mocks.tables.proveedores = []
    mocks.tables.compras_proveedor = []
    mocks.tables.pagos_proveedor = []
    mocks.tables.envases_tipos_comercio = [
      { id: 'bot-1l', kiosco_id: 'k1', nombre: 'Botella 1L', precio: 300, activo: true },
    ]
    mocks.tables.envases_saldos = [{ id: 'bot-1l', kiosco_id: 'k1', cantidad: 14 }]
    mocks.tables.envases_pendientes = [{ id: 'bot-1l', kiosco_id: 'k1', cantidad: 3 }]
    mocks.tables.envases_movimientos = [
      {
        id: 'em1',
        kiosco_id: 'k1',
        tipo_id: 'bot-1l',
        accion: 'RECIBIR_EFECTIVO',
        cantidad: 1,
        stock_resultante: 14,
        importe: 300,
        sesion_caja_id: 's1',
        distribuidor: null,
        notas: 'Entrega cliente',
        pendientes_delta: 0,
        pendientes_resultantes: null,
        creado_en: '2026-11-16T11:00:00Z',
      },
    ]
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('cajaStore y CajaPage muestran motivos de devolución y envases y los descuentan del efectivo esperado', async () => {
    useCajaStore.setState({
      sesionActiva: mocks.tables.sesiones_caja[0] as never,
      resumenActivo: null,
      movimientosCaja: [],
      cargando: false,
      arqueoCiegoObligatorio: false,
    })

    const resumen = await useCajaStore.getState().cargarResumenSesion('s1')
    expect(resumen).not.toBeNull()
    // Fondo 10000 + Efectivo ventas 1700 - Egresos (300 envases + 500 devolución) = 10900
    expect(resumen?.total_efectivo).toBe(1700)
    expect(resumen?.total_egresos).toBe(800)
    expect(resumen?.efectivo_esperado_en_caja).toBe(10900)

    expect(formatMotivoMovimientoCaja('DEVOLUCION_ENVASE')).toBe('Devolución de Envases')
    expect(formatMotivoMovimientoCaja('DEVOLUCION_VENTA')).toBe('Devolución de Venta')

    render(<CajaPage />)

    await screen.findByText('Devolución de Envases')
    expect(screen.getByText('Devolución de Venta')).toBeTruthy()
    expect(screen.queryByText('Movimiento')).toBeNull()
    expect(screen.getByText(`Incluye ${formatPrecio(800)} por devoluciones / envases`)).toBeTruthy()
    expect(screen.getByText(formatPrecio(10900))).toBeTruthy()
  })

  it('ReportesPage respeta reingresa_stock=false, excluye envases en efectivo de ventas y muestra salidas de caja', async () => {
    render(
      <MemoryRouter>
        <ReportesPage />
      </MemoryRouter>
    )

    fireEvent.click(screen.getByRole('button', { name: 'Ventas Diarias' }))

    await screen.findByText(`Deducidos ${formatPrecio(500)} en devoluciones`)

    // Ventas brutas 1700 - Devolución 500 = 1200 neto (NO resta 300 de DEVOLUCION_ENVASE)
    expect(screen.getAllByText(formatPrecio(1200)).length).toBeGreaterThan(0)
    // Costo original: 2 * 400 = 800; como reingresa_stock=false, NO acredita costo devuelto -> Ganancia = 1200 - 800 = 400
    expect(screen.getByText(formatPrecio(400))).toBeTruthy()
    // Salidas de caja informativas separadas
    expect(screen.getByText('Salidas de caja (devoluciones y envases)')).toBeTruthy()
    expect(screen.getByText('Devoluciones de venta en efectivo')).toBeTruthy()
    expect(screen.getByText('Recepción de envases en efectivo')).toBeTruthy()
    expect(screen.getByText(`-${formatPrecio(300)}`)).toBeTruthy()

    // Expandir ticket verifica etiqueta de envase en ticket
    fireEvent.click(screen.getByText('2 items'))
    expect(screen.getByText(/1x Recepción de envase/)).toBeTruthy()

    // Exportar Día pasa devoluciones y egresosEnvasesCaja
    fireEvent.click(screen.getByRole('button', { name: /Exportar Día/i }))
    await waitFor(() => expect(mocks.writeCalls).toHaveLength(1))
    const call = mocks.writeCalls[0]
    if (call.kind !== 'single') throw new Error('Se esperaba exportación de hoja simple')
    const flatText = call.rows.flat().map((c) => c?.value)
    expect(flatText).toContain('TOTAL NETO FACTURADO')
    expect(flatText).toContain('EGRESOS CAJA POR RECEPCIÓN ENVASES (INFORMATIVO)')
    expect(flatText).toContain('DETALLE DE DEVOLUCIONES DE LA JORNADA')
  })

  it('BalanceContableTab unifica neto mensual, medios de pago, filtro fiscal y etiqueta de DEVOLUCION_ENVASE sin doble conteo', async () => {
    render(<BalanceContableTab />)

    const entradasEnvase = await screen.findAllByText(/Egreso de caja: Devolución de Envases/)
    expect(entradasEnvase.length).toBeGreaterThan(0)

    // KPI net sales = 1700 - 500 = 1200 (también neto en Facturación por Medio de Pago)
    expect(screen.getAllByText(formatPrecio(1200)).length).toBeGreaterThan(0)
    // Salidas financieras = 300 (DEVOLUCION_ENVASE; DEVOLUCION_VENTA no se duplica)
    expect(screen.getAllByText(formatPrecio(300)).length).toBeGreaterThan(0)
    // Flujo neto = 1200 - 300 = 900
    expect(screen.getByText(formatPrecio(900))).toBeTruthy()
    expect(screen.queryByText(/DEVOLUCION ENVASE/)).toBeNull()

    // Desplegar tabla mensual: debe mostrar neto mensual ($1.200), no bruto ($1.700)
    fireEvent.click(screen.getByRole('button', { name: /Tabla de Rendimientos Mensuales/i }))
    const rowNoviembre = screen.getAllByText('Noviembre').map((el) => el.closest('tr')).find(Boolean)
    const rowText = (rowNoviembre?.textContent || '').replace(/\s/g, ' ')
    expect(rowNoviembre).toBeTruthy()
    expect(rowText).toContain(formatPrecio(1200))
    expect(rowText).not.toContain(formatPrecio(1700))
  })

  it('exportarExcelMaestroComercio exporta Caja, Devoluciones, Ventas netas y Envases Retornables en modo piloto activo', async () => {
    await exportarExcelMaestroComercio('k1', 'Kiosco Piloto')

    expect(mocks.writeCalls).toHaveLength(1)
    const call = mocks.writeCalls[0]
    expect(call.kind).toBe('multi')
    if (call.kind !== 'multi') throw new Error('Se esperaba libro multi-hoja')

    const sheetNames = call.sheets.map((s) => s.sheet)
    expect(sheetNames).toContain('Movimientos de Caja')
    expect(sheetNames).toContain('Devoluciones de Ventas')
    expect(sheetNames).toContain('Envases Retornables')
    expect(sheetNames).toContain('Histórico de Ventas')

    const cajaSheet = call.sheets.find((s) => s.sheet === 'Movimientos de Caja')!
    const cajaTexts = cajaSheet.data.flat().map((c) => c?.value)
    expect(cajaTexts).toContain('Devolución de Envases')
    expect(cajaTexts).toContain('Devolución de Venta')

    const ventasSheet = call.sheets.find((s) => s.sheet === 'Histórico de Ventas')!
    const ventasTexts = ventasSheet.data.flat().map((c) => c?.value)
    expect(ventasTexts).toContain('TOTAL NETO VENTAS:')
    expect(ventasTexts).toContain(1200)

    const envasesSheet = call.sheets.find((s) => s.sheet === 'Envases Retornables')!
    const envasesTexts = envasesSheet.data.flat().map((c) => c?.value)
    expect(envasesTexts).toContain('Botella 1L')
    expect(envasesTexts).toContain('Recepción en Efectivo')
    expect(envasesTexts).toContain(4200) // 14 vacíos * $300
    expect(envasesTexts).toContain(900) // 3 pendientes * $300

    // Sin columnas fiscales en strict scope
    const consultaVentas = mocks.queries.find((q) => q.tabla === 'ventas')
    expect(consultaVentas?.seleccion).not.toContain('afip_')
  })

  it('exportarVentasExcel descuenta devoluciones del neto facturado cuando se pasa el resumen diario', async () => {
    await exportarVentasExcel(
      mocks.tables.ventas as never,
      'Kiosco Piloto',
      '2026-11-16',
      {
        devoluciones: mocks.tables.devoluciones_venta as never,
        egresosEnvasesCaja: 300,
      }
    )

    expect(mocks.writeCalls).toHaveLength(1)
    const call = mocks.writeCalls[0]
    if (call.kind !== 'single') throw new Error('Se esperaba hoja simple')
    expect(call.rows[5][0]?.value).toBe(1200) // Ventas Totales Netas KPI
  })
})
