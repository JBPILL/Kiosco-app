import { beforeEach, describe, expect, it } from 'vitest'
import { useComboStore } from './comboStore'
import { useOfflineSyncStore } from './offlineSyncStore'
import { crearProducto } from '../test/factories'

describe('comboStore: stock virtual y costos', () => {
  const tragos = crearProducto({ id: 'ron', stock_actual: 10, precio_costo: 100, precio_venta: 200 })
  const cola = crearProducto({ id: 'cola', stock_actual: 7, precio_costo: 30, precio_venta: 60 })

  beforeEach(() => {
    useComboStore.setState({
      itemsCombo: [
        { id: '1', combo_producto_id: 'combo', componente_producto_id: 'ron', cantidad: 2 },
        { id: '2', combo_producto_id: 'combo', componente_producto_id: 'cola', cantidad: 3 },
      ] as never,
    })
  })

  it('el stock del combo lo limita el componente más escaso', () => {
    // ron: floor(10/2)=5 ; cola: floor(7/3)=2
    expect(useComboStore.getState().calcularStockCombo('combo', [tragos, cola])).toBe(2)
  })

  it('devuelve 0 si falta un componente, no tiene stock, o el combo no existe', () => {
    const s = useComboStore.getState()
    expect(s.calcularStockCombo('combo', [tragos])).toBe(0)
    expect(s.calcularStockCombo('combo', [tragos, { ...cola, stock_actual: 0 }])).toBe(0)
    expect(s.calcularStockCombo('inexistente', [tragos, cola])).toBe(0)
  })

  it('un componente con menos stock que la cantidad requerida da 0 combos', () => {
    expect(useComboStore.getState().calcularStockCombo('combo', [tragos, { ...cola, stock_actual: 2 }])).toBe(0)
  })

  it('calcula costo y venta sugeridos sumando componentes', () => {
    const r = useComboStore.getState().calcularCostoSugerido(
      [
        { componente_producto_id: 'ron', cantidad: 2 },
        { componente_producto_id: 'cola', cantidad: 3 },
      ],
      [tragos, cola]
    )
    expect(r.costoTotal).toBe(2 * 100 + 3 * 30)
    expect(r.ventaSumada).toBe(2 * 200 + 3 * 60)
  })

  it('ignora componentes que no existen en el catálogo', () => {
    const r = useComboStore.getState().calcularCostoSugerido([{ componente_producto_id: 'x', cantidad: 5 }], [tragos])
    expect(r).toEqual({ costoTotal: 0, ventaSumada: 0 })
  })
})

describe('offlineSyncStore: cola de ventas pendientes', () => {
  beforeEach(() => {
    localStorage.clear()
    useOfflineSyncStore.setState({ cola: [] })
  })

  const venta = (id: string, kioscoId = 'k1') =>
    ({ id, kiosco_id: kioscoId, sesion_caja_id: 's1', total: 100, pagos: [], items: [] }) as never

  it('encola ventas y evita duplicados por id (idempotencia)', () => {
    const s = useOfflineSyncStore.getState()
    s.encolarVenta(venta('v1'))
    s.encolarVenta(venta('v1'))
    s.encolarVenta(venta('v2'))
    expect(useOfflineSyncStore.getState().cargarCola('k1')).toHaveLength(2)
  })

  it('aísla la cola por kiosco', () => {
    const s = useOfflineSyncStore.getState()
    s.encolarVenta(venta('v1', 'k1'))
    s.encolarVenta(venta('v2', 'k2'))
    expect(s.cargarCola('k1').map((v) => v.id)).toEqual(['v1'])
    expect(s.cargarCola('k2').map((v) => v.id)).toEqual(['v2'])
  })

  it('limpiarCola vacía solo el kiosco indicado', () => {
    const s = useOfflineSyncStore.getState()
    s.encolarVenta(venta('v1', 'k1'))
    s.encolarVenta(venta('v2', 'k2'))
    s.limpiarCola('k1')
    expect(s.cargarCola('k1')).toEqual([])
    expect(s.cargarCola('k2')).toHaveLength(1)
  })

  it('tolera almacenamiento corrupto', () => {
    localStorage.setItem('kioskopos_cola_offline_k1', '{roto')
    expect(useOfflineSyncStore.getState().cargarCola('k1')).toEqual([])
  })
})
