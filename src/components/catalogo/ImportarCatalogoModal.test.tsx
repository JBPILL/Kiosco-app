import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import { db, resetDb, responder } from '../../test/supabaseMock'

vi.mock('../../lib/supabase', async () => {
  const { crearModuloSupabase } = await import('../../test/supabaseMock')
  return crearModuloSupabase()
})
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => ({ usuario: { kiosco_id: 'k1' } }) }))
vi.mock('../../lib/utils', () => ({ formatPrecio: (valor: number) => String(valor), saveCachedProductos: vi.fn() }))
import { ImportarCatalogoModal } from './ImportarCatalogoModal'

beforeEach(() => {
  resetDb(); vi.clearAllMocks(); vi.stubEnv('VITE_AUDITORIA_MOTIVO_PRECIO', 'true')
  responder('productos.select', { data: [{ id: 'p1', codigo_barras: '123', descripcion: 'Agua', stock_actual: 5, activo: true }], error: null })
})
afterEach(() => vi.unstubAllEnvs())

it.each(['NORMAL', 'ROLLBACK'] as const)('exige motivo y conserva bajas ante rechazo del precio en %s', async modo => {
  vi.spyOn(window, 'confirm').mockReturnValue(true)
  responder('productos.select', { data: [
    { id: 'p1', codigo_barras: '123', descripcion: 'Agua', stock_actual: 5, activo: true },
    { id: 'p2', codigo_barras: '999', descripcion: 'Conservar', stock_actual: 2, activo: true },
  ], error: null })
  responder('productos.update', { error: { code: '22023', message: 'Motivo inválido' } })
  const vista = render(<ImportarCatalogoModal isOpen modoInicial={modo} onClose={vi.fn()} onImportCompletado={vi.fn()} categorias={[]} />)
  const archivo = new File(['Código de Barras;Descripción;Precio Venta;Stock Actual\n123;Agua;900;5'], 'lista.csv', { type: 'text/csv' })
  fireEvent.change(vista.container.querySelector('input[type="file"]')!, { target: { files: [archivo] } })
  const boton = await screen.findByRole('button', { name: modo === 'NORMAL' ? 'Confirmar Importación (1)' : 'Ejecutar Rollback (1)' })
  fireEvent.click(boton)
  expect(db.llamadas.filter(llamada => llamada.op === 'update')).toHaveLength(0)
  fireEvent.change(screen.getByRole('textbox', { name: 'Motivo del cambio de precio' }), { target: { value: '  Lista de octubre  ' } })
  fireEvent.click(boton)
  await waitFor(() => expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Importación parcial'), expect.any(Object)))
  expect(db.llamadas.find(llamada => llamada.op === 'update')?.payload).toEqual(expect.objectContaining({ motivo_cambio_precio: 'Lista de octubre' }))
  expect(db.llamadas.filter(llamada => llamada.op === 'update')).toHaveLength(1)
  expect(toast.success).not.toHaveBeenCalledWith(expect.stringContaining('Restauración completada'), expect.any(Object))
})

// Binary compatibility through the real parser: no mocked workbook or parsed rows.
async function seleccionarExcel(nombre: string, bytes: Uint8Array) {
  const vista = render(<ImportarCatalogoModal isOpen onClose={vi.fn()} onImportCompletado={vi.fn()} categorias={[]} />)
  const archivo = new File([], nombre)
  const contenido = Uint8Array.from(bytes).buffer
  Object.defineProperty(archivo, 'arrayBuffer', { value: async () => contenido })
  fireEvent.change(vista.container.querySelector('input[type="file"]')!, { target: { files: [archivo] } })
  return vista
}

it('lee un catálogo XLSX corporativo generado por el exportador, sin perder ceros ni decimales', async () => {
  const { default: writeXlsxFile } = await import('write-excel-file/node')
  const bytes = await writeXlsxFile([
    [{ value: 'Catálogo de productos', columnSpan: 7 }, null, null, null, null, null, null],
    [{ value: 'Código de Barras' }, { value: 'Descripción' }, { value: 'Categoría' }, { value: 'Precio Costo' }, { value: 'Precio Venta' }, { value: 'Stock Actual' }, { value: 'Unidad' }],
    [{ value: '0012345678905' }, { value: 'Yerba de ensayo' }, { value: 'Almacén' }, { value: 750.25 }, { value: 1500.5 }, { value: 2.75 }, { value: 'KG' }],
    [{ value: 'TOTAL GENERAL' }, null, null, null, { value: 1500.5 }],
  ]).toBuffer()
  await seleccionarExcel('catalogo.xlsx', bytes)
  await screen.findByRole('button', { name: 'Confirmar Importación (1)' })
  expect(screen.getByText('0012345678905')).toBeTruthy()
  expect(screen.getByText('Yerba de ensayo')).toBeTruthy()
  expect(screen.getByText('1500.5')).toBeTruthy()
  expect(screen.getByText('750.25')).toBeTruthy()
  expect(screen.getByText('2.75')).toBeTruthy()
  expect(db.llamadas.some(llamada => ['insert', 'update', 'delete'].includes(llamada.op))).toBe(false)
})

it('conserva compatibilidad con XLS binario anterior', async () => {
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
    ['Código de Barras', 'Descripción', 'Precio Venta', 'Stock Actual'],
    ['000123', 'Galletitas de ensayo', 1234.5, 7],
  ]), 'Catálogo')
  await seleccionarExcel('catalogo.xls', new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'biff8' })))
  await screen.findByRole('button', { name: 'Confirmar Importación (1)' })
  expect(screen.getByText('000123')).toBeTruthy()
  expect(screen.getByText('Galletitas de ensayo')).toBeTruthy()
  expect(screen.getByText('1234.5')).toBeTruthy()
})

it('rechaza un reporte de ventas XLSX antes de ofrecer una importación', async () => {
  const { default: writeXlsxFile } = await import('write-excel-file/node')
  const bytes = await writeXlsxFile([[{ value: 'Reporte ejecutivo de ventas' }], [{ value: 'Descripción' }, { value: 'Precio Venta' }], [{ value: 'No importar' }, { value: 100 }]]).toBuffer()
  await seleccionarExcel('reporte_ventas.xlsx', bytes)
  await screen.findByText(/El archivo seleccionado es un Reporte de Ventas/)
  expect((screen.getByRole('button', { name: 'Confirmar Importación (0)' }) as HTMLButtonElement).disabled).toBe(true)
  expect(db.llamadas.some(llamada => ['insert', 'update', 'delete'].includes(llamada.op))).toBe(false)
})

it('rechaza un XLSX inválido sin escrituras ni éxito de importación', async () => {
  await seleccionarExcel('invalido.xlsx', new Uint8Array([0, 1, 2, 3]))
  await screen.findByText(/Error al leer el archivo Excel|No se encontró la fila de encabezados/)
  expect((screen.getByRole('button', { name: 'Confirmar Importación (0)' }) as HTMLButtonElement).disabled).toBe(true)
  expect(db.llamadas.some(llamada => ['insert', 'update', 'delete'].includes(llamada.op))).toBe(false)
})
