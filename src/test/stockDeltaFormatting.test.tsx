// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'

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

interface SupabaseQueryCapture {
  tabla: string
  seleccion: string
}

interface MockRow {
  id: string
  estado?: string
  [campo: string]: unknown
}

const mocks = vi.hoisted(() => ({
  writeCalls: [] as WriteXlsxCall[],
  queries: [] as SupabaseQueryCapture[],
  movimientosDb: [] as MockRow[],
  productosDb: [] as Producto[],
  clientesDb: [] as MockRow[],
  proveedoresDb: [] as MockRow[],
  categoriasDb: [] as MockRow[],
  ventasDb: [] as MockRow[],
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  cargarConfig: vi.fn().mockResolvedValue(undefined),
  cargarArqueoCiegoConfig: vi.fn().mockResolvedValue(undefined),
  guardarArqueoCiegoConfig: vi.fn().mockResolvedValue(undefined),
  cargarLotes: vi.fn().mockResolvedValue(undefined),
  buscarVentaParaDevolucion: vi.fn().mockResolvedValue(null),
  obtenerAlertas: vi.fn(() => ({ vencidos: [], criticos: [], proximos: [] })),
  setTema: vi.fn(),
  instalarApp: vi.fn(),
  authState: {
    usuario: {
      id: 'u1',
      kiosco_id: 'k1',
      nombre: 'Dueño Test',
      rol: 'DUEÑO',
      es_superadmin: false,
    },
    kiosco: { id: 'k1', nombre: 'Kiosco Prueba', rubro: 'kiosco' },
  },
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
      const capture: SupabaseQueryCapture = { tabla, seleccion: '' }
      mocks.queries.push(capture)
      let estadoFiltro: string | null = null
      let cursorId: string | null = null
      let esSingle = false

      const filtrar = <T extends { id: string; estado?: string }>(rows: T[]) =>
        rows
          .filter((r) => (!cursorId || String(r.id) > cursorId) && (!estadoFiltro || r.estado === estadoFiltro))
          .sort((a, b) => String(a.id).localeCompare(String(b.id)))

      const resolveData = () => {
        if (tabla === 'kioscos') {
          return esSingle
            ? { id: 'k1', nombre: 'Kiosco Prueba', direccion: '', telefono: '', rubro: 'kiosco' }
            : []
        }
        if (tabla === 'movimientos_stock') return filtrar(mocks.movimientosDb)
        if (tabla === 'productos') return filtrar(mocks.productosDb)
        if (tabla === 'clientes') return filtrar(mocks.clientesDb)
        if (tabla === 'proveedores') return filtrar(mocks.proveedoresDb)
        if (tabla === 'categorias') return filtrar(mocks.categoriasDb)
        if (tabla === 'ventas') return filtrar(mocks.ventasDb)
        return []
      }

      const builder = {
        select(seleccion: string) {
          capture.seleccion = seleccion
          return builder
        },
        eq(campo: string, valor: string) {
          if (campo === 'estado') estadoFiltro = valor
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
        single() {
          esSingle = true
          return builder
        },
        maybeSingle() {
          esSingle = true
          return builder
        },
        then(
          resolve: (res: { data: unknown; error: null }) => unknown,
          reject?: (err: unknown) => unknown
        ) {
          return Promise.resolve({ data: resolveData(), error: null }).then(resolve, reject)
        },
      }
      return builder
    },
  },
}))

vi.mock('../stores/authStore', () => ({
  useAuthStore: () => mocks.authState,
}))

vi.mock('../hooks/useTenantConfig', () => ({
  useTenantConfig: () => ({ tieneVencimientos: false, tieneBalanza: false }),
  capacidadesPorDefecto: () => ({
    vencimientos: false,
    balanza: false,
    cuentaCorriente: true,
    combos: true,
    envases: false,
    afip: false,
    supervisorPin: false,
  }),
}))

vi.mock('../hooks/useRealtimeSync', () => ({ useRealtimeSync: () => {} }))
vi.mock('../hooks/useBarcodeGun', () => ({ useBarcodeGun: () => {} }))
vi.mock('../stores/devolucionStore', () => ({
  useDevolucionStore: () => ({ buscarVentaParaDevolucion: mocks.buscarVentaParaDevolucion }),
}))
vi.mock('../stores/loteStore', () => ({
  useLoteStore: () => ({
    lotes: [],
    cargarLotes: mocks.cargarLotes,
    obtenerAlertas: mocks.obtenerAlertas,
  }),
  calcularDiasHastaVencimiento: () => 30,
}))
vi.mock('../lib/productCostAccess', () => ({
  cargarCostosProtegidos: vi.fn().mockResolvedValue([]),
  adjuntarCostosProtegidos: <T,>(items: T[]) => items,
}))
vi.mock('../lib/movementCostAccess', () => ({
  adjuntarCostosHistoricos: <T,>(items: T[]) => items,
}))
vi.mock('../lib/externalBackupReminder', () => ({
  registrarDescargaRespaldoExterno: vi.fn(),
  getEstadoRecordatorioRespaldo: () => ({ vence: false, ultimaDescarga: null }),
}))
vi.mock('../components/stock/MovimientosPendientes', () => ({
  MovimientosPendientes: () => null,
}))
vi.mock('../components/stock/AuditoriaInventarioModal', () => ({
  AuditoriaInventarioModal: () => null,
}))
vi.mock('../components/pos/BarcodeScannerModal', () => ({
  BarcodeScannerModal: () => null,
}))
vi.mock('../components/pos/TicketReceiptModal', () => ({
  TicketReceiptModal: () => null,
}))
vi.mock('../stores/themeStore', () => ({
  useThemeStore: () => ({ tema: 'light', setTema: mocks.setTema }),
}))
vi.mock('../stores/configAdminStore', () => ({
  useConfigAdminStore: () => ({ cargarConfig: mocks.cargarConfig }),
}))
vi.mock('../stores/pwaStore', () => ({
  usePwaStore: () => ({ puedeInstalar: false, estaInstalado: false, instalarApp: mocks.instalarApp }),
}))
vi.mock('../stores/cajaStore', () => ({
  useCajaStore: () => ({
    arqueoCiegoObligatorio: false,
    cargarArqueoCiegoConfig: mocks.cargarArqueoCiegoConfig,
    guardarArqueoCiegoConfig: mocks.guardarArqueoCiegoConfig,
  }),
}))
vi.mock('../components/config/ExternalBackupReminder', () => ({
  ExternalBackupReminder: () => null,
}))
vi.mock('../components/config/RespaldosCierreSection', () => ({
  RespaldosCierreSection: () => null,
}))
vi.mock('../components/config/RestaurarBackupModal', () => ({
  RestaurarBackupModal: () => null,
}))
vi.mock('../components/catalogo/ImportarCatalogoModal', () => ({
  ImportarCatalogoModal: () => null,
}))
vi.mock('../components/config/ModulosComercioSection', () => ({
  ModulosComercioSection: () => null,
}))
vi.mock('../components/config/SupervisorPinSection', () => ({
  SupervisorPinSection: () => null,
}))
vi.mock('../components/config/ManualDrawerSection', () => ({
  ManualDrawerSection: () => null,
}))
vi.mock('../components/config/CommercialAuditSection', () => ({
  CommercialAuditSection: () => null,
}))
vi.mock('../components/config/SupervisorAuditSection', () => ({
  SupervisorAuditSection: () => null,
}))
vi.mock('../components/config/SupervisorPolicySection', () => ({
  SupervisorPolicySection: () => null,
}))
vi.mock('../components/config/SubscriptionSection', () => ({
  SubscriptionSection: () => null,
}))
vi.mock('../components/config/AFIPConfigSection', () => ({
  AFIPConfigSection: () => null,
}))
vi.mock('../components/config/AccessibilityConfigSection', () => ({
  AccessibilityConfigSection: () => null,
}))
vi.mock('../components/config/EquiposComercioSection', () => ({
  EquiposComercioSection: () => null,
  normalizarEquiposComercio: () => ({ lector: false, impresora: false }),
}))

import {
  formatStockMovementDelta,
  getStockMovementDirection,
  presentarMovimientoStock,
  resolveStockMovementDelta,
} from '../lib/stockMovementDisplay'
import { exportarMasterExcel, exportarMovimientosStockExcel } from '../lib/exportUtils'
import { exportarExcelMaestroComercio } from '../lib/masterExcelExport'
import { StockPage } from '../pages/StockPage'
import { ConfigPage } from '../pages/ConfigPage'
import type { MovimientoStock, Producto } from '../types/database'

const productoEntero: Producto = {
  id: 'p1',
  kiosco_id: 'k1',
  codigo_barras: '7790001',
  descripcion: 'Gaseosa 500ml',
  categoria_id: null,
  precio_costo: 500,
  precio_venta: 1000,
  stock_actual: 10,
  stock_minimo: 3,
  es_pesable: false,
  es_favorito: false,
  activo: true,
  fecha_creacion: '2026-11-16T00:00:00Z',
  fecha_actualizacion: '2026-11-16T00:00:00Z',
}

const productoPesable: Producto = {
  ...productoEntero,
  id: 'p2',
  codigo_barras: '2000010',
  descripcion: 'Queso Fresco kg',
  es_pesable: true,
}

describe('SAAS-STOCK-FIX-02: delta_stock firmado en helpers, StockPage, exportUtils y ConfigPage', () => {
  beforeEach(() => {
    mocks.writeCalls = []
    mocks.queries = []
    mocks.toastSuccess.mockReset()
    mocks.toastError.mockReset()
    mocks.productosDb = [productoEntero, productoPesable]
    mocks.categoriasDb = [{ id: 'cat1', kiosco_id: 'k1', nombre: 'Bebidas', orden: 1 }]
    mocks.clientesDb = [{ id: 'cli1', kiosco_id: 'k1', nombre: 'Cliente Demo', saldo_deudor: 0 }]
    mocks.proveedoresDb = [{ id: 'prov1', kiosco_id: 'k1', nombre: 'Proveedor Demo' }]
    mocks.ventasDb = [
      {
        id: 'v1',
        fecha_hora: '2026-11-16T12:00:00Z',
        total: 1000,
        estado: 'COMPLETADA',
        usuario: { nombre: 'Dueño Test' },
        pagos: [{ medio_pago: 'EFECTIVO', monto: 1000 }],
      },
    ]
    mocks.movimientosDb = [
      {
        id: 'm1-ajuste-down',
        kiosco_id: 'k1',
        producto_id: 'p1',
        tipo: 'AJUSTE',
        cantidad: 5,
        delta_stock: -5,
        motivo: 'CONTEO',
        notas: 'Faltante de 5 unidades',
        usuario_id: 'u1',
        fecha: '2026-11-16T15:00:00Z',
        producto: { ...productoEntero, descripcion: 'Producto Ajuste Baja' },
        usuario: { nombre: 'Dueño Test' },
      },
      {
        id: 'm2-ajuste-up',
        kiosco_id: 'k1',
        producto_id: 'p1',
        tipo: 'AJUSTE',
        cantidad: 6,
        delta_stock: 6,
        motivo: 'CONTEO',
        notas: 'Sobrante de 6 unidades',
        usuario_id: 'u1',
        fecha: '2026-11-16T14:00:00Z',
        producto: { ...productoEntero, descripcion: 'Producto Ajuste Suba' },
        usuario: { nombre: 'Dueño Test' },
      },
      {
        id: 'm3-ajuste-zero',
        kiosco_id: 'k1',
        producto_id: 'p1',
        tipo: 'AJUSTE',
        cantidad: 0,
        delta_stock: 0,
        motivo: 'CONTEO',
        notas: 'Conteo sin diferencia',
        usuario_id: 'u1',
        fecha: '2026-11-16T13:30:00Z',
        producto: { ...productoEntero, descripcion: 'Producto Ajuste Neutro' },
        usuario: { nombre: 'Dueño Test' },
      },
      {
        id: 'm4-ingreso',
        kiosco_id: 'k1',
        producto_id: 'p1',
        tipo: 'INGRESO',
        cantidad: 10,
        delta_stock: 10,
        motivo: 'COMPRA',
        notas: 'Reposición proveedor',
        usuario_id: 'u1',
        fecha: '2026-11-16T13:00:00Z',
        producto: { ...productoEntero, descripcion: 'Producto Ingreso' },
        usuario: { nombre: 'Dueño Test' },
      },
      {
        id: 'm5-egreso',
        kiosco_id: 'k1',
        producto_id: 'p1',
        tipo: 'EGRESO',
        cantidad: 3,
        delta_stock: -3,
        motivo: 'VENTA',
        notas: 'Venta mostrador',
        usuario_id: 'u1',
        fecha: '2026-11-16T12:00:00Z',
        producto: { ...productoEntero, descripcion: 'Producto Egreso' },
        usuario: { nombre: 'Dueño Test' },
      },
      {
        id: 'm6-legacy-ajuste',
        kiosco_id: 'k1',
        producto_id: 'p2',
        tipo: 'AJUSTE',
        cantidad: 3,
        delta_stock: null,
        stock_anterior: 10,
        stock_nuevo: 7,
        motivo: 'CONTEO',
        notas: 'Histórico sin delta_stock',
        usuario_id: 'u1',
        fecha: '2026-11-15T18:00:00Z',
        producto: { ...productoPesable, descripcion: 'Producto Legacy Ajuste' },
        usuario: { nombre: 'Dueño Test' },
      },
    ]
  })

  it('resuelve y formatea correctamente ajustes ascendentes, descendentes, neutros, entradas, salidas, mermas, pesables y legacy', () => {
    expect(resolveStockMovementDelta({ tipo: 'AJUSTE', cantidad: 5, delta_stock: 5 })).toBe(5)
    expect(resolveStockMovementDelta({ tipo: 'AJUSTE', cantidad: 5, delta_stock: -5 })).toBe(-5)
    expect(resolveStockMovementDelta({ tipo: 'AJUSTE', cantidad: 5, delta_stock: 0 })).toBe(0)
    expect(resolveStockMovementDelta({ tipo: 'AJUSTE', cantidad: 2.5, delta_stock: '-2.500' })).toBe(-2.5)
    expect(resolveStockMovementDelta({ tipo: 'AJUSTE', cantidad: 1.255, delta_stock: 1.255 })).toBe(1.255)

    expect(resolveStockMovementDelta({ tipo: 'INGRESO', cantidad: 10, delta_stock: null })).toBe(10)
    expect(resolveStockMovementDelta({ tipo: 'ENTRADA', cantidad: 6, delta_stock: null })).toBe(6)
    expect(resolveStockMovementDelta({ tipo: 'EGRESO', cantidad: 4, delta_stock: null })).toBe(-4)
    expect(resolveStockMovementDelta({ tipo: 'SALIDA', cantidad: 4, delta_stock: null })).toBe(-4)
    expect(resolveStockMovementDelta({ tipo: 'MERMA', cantidad: 3, delta_stock: null })).toBe(-3)
    expect(resolveStockMovementDelta({ tipo: 'VENTA', cantidad: 2, delta_stock: null })).toBe(-2)

    // Fallback desde stock_nuevo - stock_anterior sin ruido flotante
    expect(
      resolveStockMovementDelta({
        tipo: 'AJUSTE',
        cantidad: 0.2,
        delta_stock: null,
        stock_anterior: 10.3,
        stock_nuevo: 10.1,
      })
    ).toBe(-0.2)

    expect(formatStockMovementDelta(5)).toBe('+5')
    expect(formatStockMovementDelta(-5)).toBe('-5')
    expect(formatStockMovementDelta(0)).toBe('0')
    expect(formatStockMovementDelta(-0)).toBe('0')
    expect(formatStockMovementDelta(-0.75)).toBe('-0.75')
    expect(formatStockMovementDelta(1.255)).toBe('+1.255')

    expect(getStockMovementDirection(5)).toBe('up')
    expect(getStockMovementDirection(-5)).toBe('down')
    expect(getStockMovementDirection(0)).toBe('neutral')

    expect(
      presentarMovimientoStock({
        tipo: 'AJUSTE',
        cantidad: 5,
        delta_stock: -5,
        costo_unitario_referencia: 100,
      })
    ).toEqual({ cantidad: '-5', estimacion: null })
  })

  it('exportarMovimientosStockExcel imprime delta_stock con signo real en filas, KPIs y total neto', async () => {
    const movimientos: (MovimientoStock & { producto?: Producto })[] = [
      {
        id: '1',
        kiosco_id: 'k1',
        producto_id: 'p1',
        tipo: 'INGRESO',
        cantidad: 10,
        delta_stock: 10,
        motivo: 'COMPRA',
        notas: null,
        usuario_id: 'u1',
        fecha: '2026-11-16T10:00:00Z',
        producto: productoEntero,
      },
      {
        id: '2',
        kiosco_id: 'k1',
        producto_id: 'p1',
        tipo: 'AJUSTE',
        cantidad: 5,
        delta_stock: -5,
        motivo: 'CONTEO',
        notas: 'Baja por conteo',
        usuario_id: 'u1',
        fecha: '2026-11-16T11:00:00Z',
        producto: productoEntero,
      },
      {
        id: '3',
        kiosco_id: 'k1',
        producto_id: 'p1',
        tipo: 'AJUSTE',
        cantidad: 4,
        delta_stock: 4,
        motivo: 'CONTEO',
        notas: 'Suba por conteo',
        usuario_id: 'u1',
        fecha: '2026-11-16T12:00:00Z',
        producto: productoEntero,
      },
      {
        id: '4',
        kiosco_id: 'k1',
        producto_id: 'p2',
        tipo: 'AJUSTE',
        cantidad: 0.75,
        delta_stock: -0.75,
        motivo: 'CONTEO',
        notas: 'Merma pesable',
        usuario_id: 'u1',
        fecha: '2026-11-16T13:00:00Z',
        producto: productoPesable,
      },
      {
        id: '5',
        kiosco_id: 'k1',
        producto_id: 'p1',
        tipo: 'EGRESO',
        cantidad: 3,
        delta_stock: -3,
        motivo: 'MERMA',
        notas: null,
        usuario_id: 'u1',
        fecha: '2026-11-16T14:00:00Z',
        producto: productoEntero,
      },
      {
        id: '6',
        kiosco_id: 'k1',
        producto_id: 'p1',
        tipo: 'AJUSTE',
        cantidad: 2,
        delta_stock: null,
        stock_anterior: 10,
        stock_nuevo: 8,
        motivo: 'CONTEO',
        notas: 'Legacy',
        usuario_id: 'u1',
        fecha: '2026-11-16T15:00:00Z',
        producto: productoEntero,
      },
    ]

    await exportarMovimientosStockExcel(movimientos, 'Kiosco Test')

    expect(mocks.writeCalls).toHaveLength(1)
    const call = mocks.writeCalls[0]
    expect(call.kind).toBe('single')
    if (call.kind !== 'single') throw new Error('Tipo de llamada inesperado')

    const { rows } = call
    // KPI values row está en índice 5 (cSpan deja null en celdas fusionadas)
    const kpiValues = rows[5].map((cell) => cell?.value ?? null)
    expect(kpiValues[0]).toBe(6) // Movimientos Auditados
    expect(kpiValues[2]).toBe(14) // Unidades Ingresadas (+10 + +4)
    expect(kpiValues[4]).toBe(10.75) // Unidades Egresadas (|-5| + |-0.75| + |-3| + |-2|)
    expect(kpiValues[6]).toBe(4) // Ajustes Conteo Físico

    // Filas de datos arrancan tras el header en índice 9
    const dataRows = rows.slice(9, 15)
    expect(dataRows[0][4].value).toBe(10)
    expect(dataRows[1][4].value).toBe(-5)
    expect(dataRows[1][4].format).toBe('+#,##0;-#,##0;0')
    expect(dataRows[2][4].value).toBe(4)
    expect(dataRows[3][4].value).toBe(-0.75)
    expect(dataRows[3][4].format).toBe('+#,##0.000;-#,##0.000;0')
    expect(dataRows[4][4].value).toBe(-3)
    expect(dataRows[5][4].value).toBe(-2)

    // Total neto: 14 - 10.75 = +3.25
    const totalRow = rows[15]
    expect(totalRow[4].value).toBe(3.25)
    expect(totalRow[4].format).toBe('+#,##0.000;-#,##0.000;0')
  })

  it('exportarMasterExcel escribe variaciones firmadas desde delta_stock en Movimientos de Stock', async () => {
    await exportarMasterExcel({
      kioscoId: 'k1',
      nombreKiosco: 'Kiosco Test',
      productos: [],
      categorias: [],
      movimientosStock: [
        {
          fecha: '2026-11-16T10:00:00Z',
          tipo: 'AJUSTE',
          cantidad: 5,
          delta_stock: -5,
          motivo: 'CONTEO',
          notas: 'Baja ajuste',
          producto: { descripcion: 'Gaseosa' },
          usuario: { nombre: 'Admin' },
        },
        {
          fecha: '2026-11-16T11:00:00Z',
          tipo: 'AJUSTE',
          cantidad: 4,
          delta_stock: 4,
          motivo: 'CONTEO',
          notas: 'Suba ajuste',
          producto: { descripcion: 'Agua' },
          usuario: { nombre: 'Admin' },
        },
        {
          fecha: '2026-11-16T12:00:00Z',
          tipo: 'EGRESO',
          cantidad: 3,
          delta_stock: -3,
          motivo: 'MERMA',
          notas: null,
          producto: { descripcion: 'Alfajor' },
          usuario: { nombre: 'Admin' },
        },
      ],
      clientes: [],
      proveedores: [],
      ventas: [],
    })

    expect(mocks.writeCalls).toHaveLength(1)
    const call = mocks.writeCalls[0]
    expect(call.kind).toBe('multi')
    if (call.kind !== 'multi') throw new Error('Tipo de llamada inesperado')

    const hojaMovs = call.sheets.find((s) => s.sheet === 'Movimientos de Stock')
    expect(hojaMovs).toBeDefined()
    const filasDatos = hojaMovs!.data.slice(4, 7)
    expect(filasDatos.map((r) => r[3].value)).toEqual([-5, 4, -3])
    expect(filasDatos[0][3].format).toBe('+#,##0;-#,##0;0')
    // Total neto: -5 + 4 - 3 = -4 (no +12)
    expect(hojaMovs!.data[7][3].value).toBe(-4)
  })

  it('StockPage renderiza signos y colores reales de delta_stock y exporta ajustes descendentes con signo negativo', async () => {
    render(<StockPage />)

    await screen.findByText('Producto Ajuste Baja')

    const deltaBaja = screen.getByText('-5')
    const deltaSuba = screen.getByText('+6')
    const filaNeutro = screen.getByText('Producto Ajuste Neutro').closest('div.p-3')
    const deltaNeutro = filaNeutro?.querySelector('span.tabular-nums')
    const deltaIngreso = screen.getByText('+10')
    const deltasMenosTres = screen.getAllByText('-3')

    expect(deltaBaja.className).toContain('text-red-600')
    expect(deltaSuba.className).toContain('text-emerald-600')
    expect(deltaNeutro?.textContent).toBe('0')
    expect(deltaNeutro?.className).toContain('text-indigo-600')
    expect(deltaIngreso.className).toContain('text-emerald-600')
    expect(deltasMenosTres).toHaveLength(2) // EGRESO y AJUSTE legacy con stock_anterior/stock_nuevo
    expect(screen.queryByText(/Registro:/)).toBeNull()

    const filaBaja = deltaBaja.closest('div.p-3')
    expect(filaBaja?.textContent).toContain('Producto Ajuste Baja')
    expect(filaBaja?.textContent).toContain('Variación por ajuste; sin valoración')
    const badgeBaja = filaBaja?.querySelector('span.uppercase')
    expect(badgeBaja?.textContent).toBe('AJUSTE')
    expect(badgeBaja?.className).toContain('bg-red-100')

    const filaSuba = deltaSuba.closest('div.p-3')
    const badgeSuba = filaSuba?.querySelector('span.uppercase')
    expect(badgeSuba?.className).toContain('bg-emerald-100')

    fireEvent.click(screen.getByRole('button', { name: /Exportar Excel/i }))

    await waitFor(() => expect(mocks.writeCalls).toHaveLength(1))
    const call = mocks.writeCalls[0]
    if (call.kind !== 'single') throw new Error('Tipo de llamada inesperado')
    const valoresExportados = call.rows.slice(9, 15).map((r) => r[4].value)
    expect(valoresExportados).toEqual([-5, 6, 0, 10, -3, -3])
  })

  it('ConfigPage y masterExcelExport seleccionan delta_stock y conservan signo negativo en el Excel unificado', async () => {
    await exportarExcelMaestroComercio('k1', 'Kiosco Prueba')

    const consultaMovs = mocks.queries.find((q) => q.tabla === 'movimientos_stock')
    expect(consultaMovs).toBeDefined()
    expect(consultaMovs?.seleccion).toContain('delta_stock')

    expect(mocks.writeCalls).toHaveLength(1)
    const call = mocks.writeCalls[0]
    if (call.kind !== 'multi') throw new Error('Tipo de llamada inesperado')
    const hojaMovs = call.sheets.find((s) => s.sheet === 'Movimientos de Stock')
    const valoresExportados = hojaMovs!.data.slice(4, 10).map((r) => r[3].value)
    expect(valoresExportados).toEqual([-5, 6, 0, 10, -3, -3])

    mocks.writeCalls = []
    mocks.queries = []

    render(
      <MemoryRouter initialEntries={['/config?seccion=backup']}>
        <ConfigPage />
      </MemoryRouter>
    )

    const botonBackup = await screen.findByRole('button', { name: /Descargar Excel Unificado/i })
    fireEvent.click(botonBackup)

    await waitFor(() => expect(mocks.writeCalls).toHaveLength(1))
    const consultaUi = mocks.queries.find((q) => q.tabla === 'movimientos_stock')
    expect(consultaUi?.seleccion).toContain('delta_stock')

    const callUi = mocks.writeCalls[0]
    if (callUi.kind !== 'multi') throw new Error('Tipo de llamada inesperado')
    const hojaUi = callUi.sheets.find((s) => s.sheet === 'Movimientos de Stock')
    expect(hojaUi!.data[4][3].value).toBe(-5)
    expect(hojaUi!.data[5][3].value).toBe(6)
    expect(hojaUi!.data[10][3].value).toBe(5) // -5 + 6 + 0 + 10 - 3 - 3 = +5
  })
})
