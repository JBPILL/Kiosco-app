import { beforeEach, describe, expect, it, vi } from 'vitest'
import toast from 'react-hot-toast'
import type { ItemCombo } from '../types/database'
import { db, encolar, llamadasA, resetDb, responder } from '../test/supabaseMock'
import { crearProducto } from '../test/factories'

vi.mock('../lib/supabase', async () => (await import('../test/supabaseMock')).crearModuloSupabase())

import { useComboStore } from './comboStore'
import { useLoteStore } from './loteStore'

const KIOSCO = 'k1'

function item(overrides: Partial<ItemCombo> = {}): ItemCombo {
  return {
    id: 'i1',
    kiosco_id: KIOSCO,
    combo_producto_id: 'combo',
    componente_producto_id: 'ron',
    cantidad: 2,
    ...overrides,
  }
}

function combosLocales(): ItemCombo[] {
  return JSON.parse(localStorage.getItem(`kiosko_combos_${KIOSCO}`) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  resetDb()
  vi.clearAllMocks()
  useComboStore.setState({ itemsCombo: [], cargando: false })
})

describe('comboStore.cargarCombos', () => {
  it('muestra la caché local de inmediato aunque no haya kiosco', async () => {
    localStorage.setItem('kiosko_combos_default', JSON.stringify([item()]))
    await useComboStore.getState().cargarCombos()
    expect(useComboStore.getState().itemsCombo).toHaveLength(1)
    expect(db.llamadas).toHaveLength(0)
  })

  it('reemplaza la caché con lo que devuelve Supabase y lo persiste', async () => {
    localStorage.setItem(`kiosko_combos_${KIOSCO}`, JSON.stringify([item({ id: 'viejo' })]))
    responder('combo_items.select', { data: [item({ id: 'nuevo' })], error: null })

    await useComboStore.getState().cargarCombos(KIOSCO)

    expect(useComboStore.getState().itemsCombo.map((i) => i.id)).toEqual(['nuevo'])
    expect(combosLocales().map((i) => i.id)).toEqual(['nuevo'])
    expect(useComboStore.getState().cargando).toBe(false)
  })

  it('si el join falla reintenta con un select simple', async () => {
    encolar(
      'combo_items.select',
      { data: null, error: { message: 'fk inexistente' } },
      { data: [item({ id: 'simple' })], error: null }
    )

    await useComboStore.getState().cargarCombos(KIOSCO)

    expect(llamadasA('combo_items', 'select')).toHaveLength(2)
    expect(useComboStore.getState().itemsCombo.map((i) => i.id)).toEqual(['simple'])
  })

  it('con la red caída conserva la caché y no deja cargando=true', async () => {
    localStorage.setItem(`kiosko_combos_${KIOSCO}`, JSON.stringify([item({ id: 'cache' })]))
    db.lanzar.add('combo_items')

    await useComboStore.getState().cargarCombos(KIOSCO)

    expect(useComboStore.getState().itemsCombo.map((i) => i.id)).toEqual(['cache'])
    expect(useComboStore.getState().cargando).toBe(false)
  })

  it('tolera una caché corrupta', async () => {
    localStorage.setItem('kiosko_combos_default', '{roto')
    await expect(useComboStore.getState().cargarCombos()).resolves.toBeUndefined()
    expect(useComboStore.getState().itemsCombo).toEqual([])
  })
})

describe('comboStore.guardarComponentes', () => {
  const componentes = [
    { componente_producto_id: 'ron', cantidad: 2 },
    { componente_producto_id: 'cola', cantidad: 3 },
  ]

  it('reemplaza los componentes del combo sin tocar los de otros combos', async () => {
    useComboStore.setState({
      itemsCombo: [item({ id: 'a', combo_producto_id: 'combo' }), item({ id: 'b', combo_producto_id: 'otro' })],
    })

    const ok = await useComboStore.getState().guardarComponentes('combo', componentes, KIOSCO)

    expect(ok).toBe(true)
    const items = useComboStore.getState().itemsCombo
    expect(items.filter((i) => i.combo_producto_id === 'combo')).toHaveLength(2)
    expect(items.find((i) => i.id === 'b')).toBeDefined()
    expect(items.find((i) => i.id === 'a')).toBeUndefined()
    expect(combosLocales()).toHaveLength(3)
  })

  it('borra los anteriores, inserta los nuevos y marca el producto como es_combo', async () => {
    await useComboStore.getState().guardarComponentes('combo', componentes, KIOSCO)

    expect(llamadasA('combo_items', 'delete')).toHaveLength(1)
    const insert = llamadasA('combo_items', 'insert')[0]
    expect(insert.payload).toHaveLength(2)
    expect(insert.payload).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kiosco_id: KIOSCO, combo_producto_id: 'combo', componente_producto_id: 'ron', cantidad: 2 }),
      ])
    )
    expect(llamadasA('productos', 'update')[0].payload).toMatchObject({ es_combo: true })
    expect(toast.success).toHaveBeenCalled()
  })

  it('con una lista vacía borra el combo y no inserta nada', async () => {
    useComboStore.setState({ itemsCombo: [item()] })
    await useComboStore.getState().guardarComponentes('combo', [], KIOSCO)

    expect(useComboStore.getState().itemsCombo).toEqual([])
    expect(llamadasA('combo_items', 'insert')).toHaveLength(0)
  })

  it('sin red guarda local y avisa con advertencia, no con éxito', async () => {
    db.lanzar.add('combo_items')

    const ok = await useComboStore.getState().guardarComponentes('combo', componentes, KIOSCO)

    expect(ok).toBe(true)
    expect(useComboStore.getState().itemsCombo).toHaveLength(2)
    expect(combosLocales()).toHaveLength(2)
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalled()
  })

  it('si Supabase rechaza el insert no informa éxito (el combo quedaría solo local)', async () => {
    responder('combo_items.insert', { error: { code: '23503', message: 'violación de FK' } })

    await useComboStore.getState().guardarComponentes('combo', componentes, KIOSCO)

    expect(toast.success).not.toHaveBeenCalled()
    expect(toast).toHaveBeenCalled()
  })
})

describe('comboStore.descontarStockComponentesCombo', () => {
  beforeEach(() => {
    useComboStore.setState({
      itemsCombo: [
        item({ id: '1', componente_producto_id: 'ron', cantidad: 2 }),
        item({ id: '2', componente_producto_id: 'cola', cantidad: 3 }),
      ],
    })
    vi.spyOn(useLoteStore.getState(), 'descontarStockFEFO').mockResolvedValue(undefined as never)
  })

  it('descuenta cantidad_componente x combos vendidos de cada componente', async () => {
    encolar(
      'productos.select',
      { data: { id: 'ron', stock_actual: 10, descripcion: 'Ron' }, error: null },
      { data: { id: 'cola', stock_actual: 20, descripcion: 'Cola' }, error: null }
    )

    await useComboStore.getState().descontarStockComponentesCombo('combo', 2, KIOSCO, 'u1', 'abcdef1234567')

    const updates = llamadasA('productos', 'update').map((l) => l.payload as { stock_actual: number })
    expect(updates.map((u) => u.stock_actual)).toEqual([10 - 4, 20 - 6])

    const movs = llamadasA('movimientos_stock', 'insert').map((l) => l.payload as Record<string, unknown>)
    expect(movs).toHaveLength(2)
    expect(movs[0]).toMatchObject({ tipo: 'EGRESO', cantidad: -4, motivo: 'VENTA', usuario_id: 'u1', producto_id: 'ron' })
    expect(movs[0].notas).toContain('#ABCDEF12')
    expect(movs[1]).toMatchObject({ cantidad: -6, producto_id: 'cola' })
  })

  it('usa la fecha original de la venta en el movimiento de stock', async () => {
    encolar('productos.select', { data: { id: 'ron', stock_actual: 10, descripcion: 'Ron' }, error: null })
    const fecha = '2026-02-01T12:00:00.000Z'

    await useComboStore.getState().descontarStockComponentesCombo('combo', 1, KIOSCO, null, undefined, fecha)

    const mov = llamadasA('movimientos_stock', 'insert')[0].payload as { fecha: string; usuario_id: unknown }
    expect(mov.fecha).toBe(fecha)
    expect(mov.usuario_id).toBeNull()
  })

  it('descuenta lotes FEFO por cada componente', async () => {
    encolar(
      'productos.select',
      { data: { id: 'ron', stock_actual: 10, descripcion: 'Ron' }, error: null },
      { data: { id: 'cola', stock_actual: 20, descripcion: 'Cola' }, error: null }
    )

    await useComboStore.getState().descontarStockComponentesCombo('combo', 1, KIOSCO)

    expect(useLoteStore.getState().descontarStockFEFO).toHaveBeenCalledWith('ron', 2)
    expect(useLoteStore.getState().descontarStockFEFO).toHaveBeenCalledWith('cola', 3)
  })

  it('un fallo de FEFO no impide descontar los demás componentes', async () => {
    vi.spyOn(useLoteStore.getState(), 'descontarStockFEFO').mockRejectedValue(new Error('sin lotes'))
    encolar(
      'productos.select',
      { data: { id: 'ron', stock_actual: 10, descripcion: 'Ron' }, error: null },
      { data: { id: 'cola', stock_actual: 20, descripcion: 'Cola' }, error: null }
    )

    await useComboStore.getState().descontarStockComponentesCombo('combo', 1, KIOSCO)

    expect(llamadasA('productos', 'update')).toHaveLength(2)
  })

  it('omite un componente que ya no existe y sigue con el resto', async () => {
    encolar(
      'productos.select',
      { data: null, error: null },
      { data: { id: 'cola', stock_actual: 20, descripcion: 'Cola' }, error: null }
    )

    await useComboStore.getState().descontarStockComponentesCombo('combo', 1, KIOSCO)

    const updates = llamadasA('productos', 'update')
    expect(updates).toHaveLength(1)
    expect(llamadasA('movimientos_stock', 'insert')).toHaveLength(1)
  })

  it('actualiza la caché local de productos y deja intactos los demás', async () => {
    const ron = crearProducto({ id: 'ron', stock_actual: 10 })
    const cola = crearProducto({ id: 'cola', stock_actual: 20 })
    const otro = crearProducto({ id: 'otro', stock_actual: 5 })
    localStorage.setItem(`kiosko_cache_productos_${KIOSCO}`, JSON.stringify([ron, cola, otro]))
    localStorage.setItem('kiosko_cache_productos', JSON.stringify([ron, cola, otro]))
    encolar(
      'productos.select',
      { data: { id: 'ron', stock_actual: 10, descripcion: 'Ron' }, error: null },
      { data: { id: 'cola', stock_actual: 20, descripcion: 'Cola' }, error: null }
    )

    await useComboStore.getState().descontarStockComponentesCombo('combo', 2, KIOSCO)

    const cache = JSON.parse(localStorage.getItem('kiosko_cache_productos') ?? '[]') as { id: string; stock_actual: number }[]
    const stock = Object.fromEntries(cache.map((p) => [p.id, p.stock_actual]))
    expect(stock).toEqual({ ron: 6, cola: 14, otro: 5 })
  })

  it('no hace nada si el producto no es un combo', async () => {
    await useComboStore.getState().descontarStockComponentesCombo('inexistente', 3, KIOSCO)
    expect(db.llamadas).toHaveLength(0)
  })

  it('el stock puede quedar negativo al vender sin stock físico (se registra igual)', async () => {
    encolar('productos.select', { data: { id: 'ron', stock_actual: 1, descripcion: 'Ron' }, error: null })
    await useComboStore.getState().descontarStockComponentesCombo('combo', 1, KIOSCO)
    const primer = llamadasA('productos', 'update')[0].payload as { stock_actual: number }
    expect(primer.stock_actual).toBe(-1)
  })
})
