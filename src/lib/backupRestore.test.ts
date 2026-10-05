import { beforeEach, describe, expect, it, vi } from 'vitest'
import { restaurarBackupIntegral, validarBackupJSON } from './backupUtils'

const mock = vi.hoisted(() => ({ from: vi.fn(), clear: vi.fn() }))
vi.mock('./supabase', () => ({ supabase: { from: mock.from } }))
vi.mock('./utils', () => ({ clearCachedProductos: mock.clear }))

interface Response { data: unknown; error: { message: string } | null }
const success = (data: unknown = null): Response => ({ data, error: null })
const failure = (): Response => ({ data: null, error: { message: 'Permiso denegado' } })
const writes: string[] = []
const payloads: Record<string, unknown>[] = []

function setup(responses: Record<string, Response[]>) {
  mock.from.mockImplementation((table: string) => {
    let operation = 'select'
    const chain = {
      select: vi.fn(() => chain),
      eq: vi.fn(() => chain),
      in: vi.fn(() => chain),
      order: vi.fn(() => chain),
      limit: vi.fn(() => chain),
      gt: vi.fn(() => chain),
      single: vi.fn(() => chain),
      maybeSingle: vi.fn(() => chain),
      insert: vi.fn((fields: Record<string, unknown>) => { operation = 'insert'; payloads.push(fields); return chain }),
      update: vi.fn((fields: Record<string, unknown>) => { operation = 'update'; payloads.push(fields); return chain }),
      then: (resolve: (value: Response) => void) => {
        const key = `${table}:${operation}`
        if (operation !== 'select') writes.push(key)
        return Promise.resolve(responses[key]?.shift() ?? success([])).then(resolve)
      },
    }
    return chain
  })
}

function backup(collections: Record<string, unknown[]> = {}) {
  return validarBackupJSON(JSON.stringify({
    app: 'KioskoApp', version: '3.0', exportDate: new Date().toISOString(),
    kiosco: { id: 'k1' }, productos: [], categorias: [], proveedores: [], clientes: [],
    promociones: [], lotes_producto: [], ...collections,
  }), 'k1').datos!
}

beforeEach(() => { vi.clearAllMocks(); writes.length = 0; payloads.length = 0; setup({}) })

describe('restauración y errores parciales', () => {
  it('encuentra productos existentes en páginas posteriores aunque la primera sea corta', async () => {
    setup({ 'productos:select': [
      success([{ id: 'p1', descripcion: 'Uno', activo: true }]),
      success([{ id: 'p2', descripcion: 'Dos', activo: true }]), success([]),
    ], 'productos:update': [success([{ id: 'p2' }])] })
    const result = await restaurarBackupIntegral(backup({ productos: [{ id: 'old', descripcion: 'Dos' }] }), 'FUSION', 'k1')
    expect(result.ok).toBe(true)
    expect(writes).toEqual(['productos:update'])
    expect(result.resumen?.productosActualizados).toBe(1)
  })
  it('no escribe productos si una página posterior no pudo leerse', async () => {
    setup({ 'productos:select': [success([{ id: 'p1', descripcion: 'Uno', activo: true }]), failure()] })
    const result = await restaurarBackupIntegral(backup({ productos: [{ descripcion: 'Nuevo' }] }), 'FUSION', 'k1')
    expect(result.ok).toBe(false)
    expect(writes).toEqual([])
  })
  it('repetir la promoción inserta una vez y luego actualiza el mismo ID', async () => {
    setup({ 'promociones:select': [success(null), success({ id: 'promo1' })],
      'promociones:insert': [success({ id: 'promo1' })], 'promociones:update': [success({ id: 'promo1' })] })
    const data = backup({ promociones: [{ id: 'promo1', nombre: 'Oferta', tipo: 'PORCENTAJE', descuento_porcentaje: 10 }] })
    expect((await restaurarBackupIntegral(data, 'FUSION', 'k1')).ok).toBe(true)
    expect((await restaurarBackupIntegral(data, 'FUSION', 'k1')).ok).toBe(true)
    expect(writes).toEqual(['promociones:insert', 'promociones:update'])
    expect(payloads[0]).toMatchObject({ id: 'promo1', descuento_porcentaje: 10, tipo: 'PORCENTAJE' })
    expect(payloads[0]).not.toHaveProperty('valor')
  })
  it('repetir el lote actualiza cantidades sin insertar otro lote', async () => {
    const product = { id: 'p1', descripcion: 'Producto', activo: true }
    setup({ 'productos:select': [success([product]), success([]), success([product]), success([])],
      'lotes_producto:select': [success(null), success({ id: 'l1' })],
      'lotes_producto:insert': [success({ id: 'l1' })], 'lotes_producto:update': [success({ id: 'l1' })] })
    const data = backup({ lotes_producto: [{ id: 'l1', producto_id: 'p1', fecha_vencimiento: '2027-01-01', cantidad_actual: 3 }] })
    expect((await restaurarBackupIntegral(data, 'FUSION', 'k1')).ok).toBe(true)
    expect((await restaurarBackupIntegral(data, 'FUSION', 'k1')).ok).toBe(true)
    expect(writes).toEqual(['lotes_producto:insert', 'lotes_producto:update'])
    expect(payloads[1]).toMatchObject({ cantidad_actual: 3, producto_id: 'p1' })
  })
  it('informa un rechazo de la promoción y no la cuenta', async () => {
    setup({ 'promociones:select': [success(null)], 'promociones:insert': [failure()] })
    const result = await restaurarBackupIntegral(backup({ promociones: [{ id: 'promo1', nombre: 'Oferta', tipo: 'PORCENTAJE' }] }), 'FUSION', 'k1')
    expect(result.ok).toBe(false)
    expect(result.resumen?.errores.join()).toContain('Permiso denegado')
    expect(result.resumen?.promocionesRestauradas).toBe(0)
  })
  it.each([
    { table: 'proveedores', collection: 'proveedores', row: { id: 'v1', nombre: 'Proveedor' }, counter: 'proveedoresActualizados' },
    { table: 'clientes', collection: 'clientes', row: { id: 'c1', nombre: 'Cliente' }, counter: 'clientesActualizados' },
    { table: 'productos', collection: 'productos', row: { id: 'p1', descripcion: 'Producto', activo: true }, counter: 'productosActualizados' },
  ] as const)('no cuenta cero filas en $table como recuperación exitosa', async ({ table, collection, row, counter }) => {
    setup({ [`${table}:select`]: [success([row])], [`${table}:update`]: [success([])] })
    const result = await restaurarBackupIntegral(backup({ [collection]: [row] }), 'FUSION', 'k1')
    expect(result.ok).toBe(false)
    expect(result.resumen?.[counter]).toBe(0)
  })
  it.each(['proveedores', 'clientes', 'productos'])('acepta la fila confirmada de %s', async (table) => {
    const row = { id: 'id1', nombre: 'Nombre', descripcion: 'Producto', activo: true }
    setup({ [`${table}:select`]: [success([row])], [`${table}:update`]: [success([{ id: 'id1' }])] })
    const result = await restaurarBackupIntegral(backup({ [table]: [row] }), 'FUSION', 'k1')
    expect(result.ok).toBe(true)
  })
  it('cuenta solo las desactivaciones confirmadas e informa las faltantes', async () => {
    setup({ 'productos:select': [success([
      { id: 'p1', descripcion: 'Uno', activo: true }, { id: 'p2', descripcion: 'Dos', activo: true },
    ])], 'productos:update': [success([{ id: 'p1' }])] })
    const result = await restaurarBackupIntegral(backup(), 'REEMPLAZO', 'k1')
    expect(result.ok).toBe(false)
    expect(result.resumen?.productosDesactivados).toBe(1)
  })
  it('no cuenta un proveedor rechazado como actualizado', async () => {
    setup({ 'proveedores:select': [success([{ id: 'v1', nombre: 'Proveedor' }])], 'proveedores:update': [failure()] })
    const result = await restaurarBackupIntegral(backup({ proveedores: [{ id: 'old', nombre: 'Proveedor' }] }), 'FUSION', 'k1')
    expect(result.ok).toBe(false)
    expect(result.resumen?.proveedoresActualizados).toBe(0)
    expect(result.resumen?.errores.join()).toContain('Permiso denegado')
  })
  it('informa clientes rechazados', async () => {
    setup({ 'clientes:select': [success([{ id: 'c1', nombre: 'Cliente' }])], 'clientes:update': [failure()] })
    const result = await restaurarBackupIntegral(backup({ clientes: [{ nombre: 'Cliente' }] }), 'FUSION', 'k1')
    expect(result.ok).toBe(false)
    expect(result.resumen?.clientesActualizados).toBe(0)
  })
  it('informa promociones rechazadas', async () => {
    setup({ 'promociones:insert': [failure()] })
    const result = await restaurarBackupIntegral(backup({ promociones: [{ nombre: 'Oferta' }] }), 'FUSION', 'k1')
    expect(result.ok).toBe(false)
    expect(result.resumen?.errores.join()).toContain('Oferta')
  })
  it('espera a recuperar promociones antes de desactivar artículos', async () => {
    setup({ 'productos:select': [success([{ id: 'p1', descripcion: 'Existente', activo: true }])], 'promociones:insert': [failure()] })
    const result = await restaurarBackupIntegral(backup({ promociones: [{ nombre: 'Oferta' }] }), 'REEMPLAZO', 'k1')
    expect(result.ok).toBe(false)
    expect(writes).not.toContain('productos:update')
  })
  it('no desactiva artículos si la recuperación de productos falla', async () => {
    setup({ 'productos:select': [success([{ id: 'p1', descripcion: 'Existente', activo: true }])], 'productos:insert': [failure()] })
    const result = await restaurarBackupIntegral(backup({ productos: [{ id: 'old', descripcion: 'Nuevo' }] }), 'REEMPLAZO', 'k1')
    expect(result.ok).toBe(false)
    expect(writes).not.toContain('productos:update')
    expect(result.resumen?.productosDesactivados).toBe(0)
  })
  it('informa desactivaciones rechazadas sin contarlas', async () => {
    setup({ 'productos:select': [success([{ id: 'p1', descripcion: 'Existente', activo: true }])], 'productos:update': [failure()] })
    const result = await restaurarBackupIntegral(backup(), 'REEMPLAZO', 'k1')
    expect(result.ok).toBe(false)
    expect(result.resumen?.productosDesactivados).toBe(0)
  })
  it('informa lotes huérfanos', async () => {
    const result = await restaurarBackupIntegral(backup({ lotes_producto: [{ producto_id: 'ausente', fecha_vencimiento: '2027-01-01' }] }), 'FUSION', 'k1')
    expect(result.ok).toBe(false)
    expect(result.resumen?.errores.join()).toContain('producto')
  })
  it('limpia el catálogo local también si una lectura falla después de escribir', async () => {
    setup({ 'categorias:insert': [success({ id: 'cat1' })], 'proveedores:select': [failure()] })
    const result = await restaurarBackupIntegral(backup({ categorias: [{ nombre: 'Nueva' }] }), 'FUSION', 'k1')
    expect(result.ok).toBe(false)
    expect(result.resumen?.categoriasCreadas).toBe(1)
    expect(mock.clear).toHaveBeenCalledWith('k1')
  })
  it('solo declara éxito cuando todas las operaciones finalizan sin errores', async () => {
    const result = await restaurarBackupIntegral(backup(), 'FUSION', 'k1')
    expect(result.ok).toBe(true)
    expect(result.resumen?.errores).toEqual([])
  })
})
