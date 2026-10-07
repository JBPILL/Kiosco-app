import { beforeEach, describe, expect, it } from 'vitest'
import { useCartStore } from './cartStore'
import { usePromocionStore } from './promocionStore'
import { useEnvasesStore, TIPOS_ENVASES_DEFAULT } from './envasesStore'
import { crearProducto, crearPromocion } from '../test/factories'

function reiniciarCarrito() {
  localStorage.clear()
  const tabId = 'tab-test'
  useCartStore.setState({
    items: [],
    tipoAjuste: 'NINGUNO',
    valorAjuste: 0,
    tabs: [{ id: tabId, nombre: 'Ticket 1', items: [], tipoAjuste: 'NINGUNO', valorAjuste: 0 }],
    tabActivaId: tabId,
    ventasEnEspera: [],
  })
  usePromocionStore.setState({ promociones: [] })
  useEnvasesStore.setState({
    tiposEnvases: TIPOS_ENVASES_DEFAULT.map((t) => ({ ...t, stock_vacios: 0 })),
    historialMovimientos: [],
  })
}

const cart = () => useCartStore.getState()

it('cada venta de la última pestaña obtiene una identidad nueva y conserva su nombre', () => {
  reiniciarCarrito()
  const anterior = cart().tabActivaId
  cart().renombrarTab(anterior, 'Mostrador')
  cart().agregarProducto(crearProducto(), 1)
  cart().completarVentaTabActiva()
  expect(cart().tabActivaId).not.toBe(anterior)
  expect(cart().tabs[0].id).toBe(cart().tabActivaId)
  expect(cart().tabs[0].nombre).toBe('Mostrador')
  expect(cart().items).toEqual([])
})

describe('cartStore: productos y cantidades', () => {
  beforeEach(reiniciarCarrito)

  it('agrega un producto y calcula subtotal y total', () => {
    cart().agregarProducto(crearProducto({ precio_venta: 150 }), 3)
    expect(cart().items).toHaveLength(1)
    expect(cart().subtotalMonto()).toBe(450)
    expect(cart().totalMonto()).toBe(450)
    expect(cart().totalItems()).toBe(3)
  })

  it('suma al item existente en lugar de duplicar la línea', () => {
    const p = crearProducto()
    cart().agregarProducto(p)
    cart().agregarProducto(p, 2)
    expect(cart().items).toHaveLength(1)
    expect(cart().items[0].cantidad).toBe(3)
  })

  it('cantidad inválida (0 o negativa) se trata como 1', () => {
    cart().agregarProducto(crearProducto(), 0)
    cart().agregarProducto(crearProducto({ id: 'p2' }), -4)
    expect(cart().items.map((i) => i.cantidad)).toEqual([1, 1])
  })

  it('limita la cantidad al stock disponible al agregar de golpe', () => {
    cart().agregarProducto(crearProducto({ stock_actual: 3 }), 10)
    expect(cart().items[0].cantidad).toBe(3)
  })

  it('no permite superar el stock sumando de a poco', () => {
    const p = crearProducto({ stock_actual: 2 })
    cart().agregarProducto(p)
    cart().agregarProducto(p)
    cart().agregarProducto(p)
    expect(cart().items[0].cantidad).toBe(2)
  })

  it('permite vender con stock 0 o negativo (stock negativo controlado)', () => {
    cart().agregarProducto(crearProducto({ stock_actual: 0 }), 5)
    expect(cart().items[0].cantidad).toBe(5)
  })

  it('productos pesables aceptan decimales y redondean a 3 cifras', () => {
    const queso = crearProducto({ es_pesable: true, precio_venta: 8000, stock_actual: 0 })
    cart().agregarProducto(queso, 0.3333333)
    expect(cart().items[0].cantidad).toBe(0.333)
    expect(cart().items[0].subtotal).toBe(Math.round(0.333 * 8000))
    expect(cart().totalItems()).toBe(1)
  })

  it('actualizarCantidad redondea unidades enteras y respeta stock', () => {
    const p = crearProducto({ stock_actual: 5 })
    cart().agregarProducto(p)
    cart().actualizarCantidad(p.id, 2.6)
    expect(cart().items[0].cantidad).toBe(3)
    cart().actualizarCantidad(p.id, 50)
    expect(cart().items[0].cantidad).toBe(5)
  })

  it('actualizarCantidad <= 0 elimina la línea', () => {
    const p = crearProducto()
    cart().agregarProducto(p)
    cart().actualizarCantidad(p.id, 0)
    expect(cart().items).toHaveLength(0)
  })

  it('quitarProducto y vaciarCarrito', () => {
    cart().agregarProducto(crearProducto({ id: 'a' }))
    cart().agregarProducto(crearProducto({ id: 'b' }))
    cart().quitarProducto('a')
    expect(cart().items.map((i) => i.producto.id)).toEqual(['b'])
    cart().vaciarCarrito()
    expect(cart().items).toHaveLength(0)
  })

  it('ítem libre normaliza descripción, precio y cantidad', () => {
    cart().agregarItemLibre('   ', -50.4, 0)
    expect(cart().items[0].producto.descripcion).toBe('Varios')
    expect(cart().items[0].producto.precio_venta).toBe(0)
    expect(cart().items[0].cantidad).toBe(1)
  })
})

describe('cartStore: descuentos y recargos', () => {
  beforeEach(() => {
    reiniciarCarrito()
    cart().agregarProducto(crearProducto({ precio_venta: 1000 }), 2)
  })

  it('descuento porcentual', () => {
    cart().aplicarAjuste('DESCUENTO_PORCENTAJE', 10)
    expect(cart().montoAjuste()).toBe(200)
    expect(cart().totalMonto()).toBe(1800)
  })

  it('descuento fijo no puede superar el subtotal ni dejar total negativo', () => {
    cart().aplicarAjuste('DESCUENTO_FIJO', 99999)
    expect(cart().montoAjuste()).toBe(2000)
    expect(cart().totalMonto()).toBe(0)
  })

  it('recargo porcentual y fijo', () => {
    cart().aplicarAjuste('RECARGO_PORCENTAJE', 5)
    expect(cart().totalMonto()).toBe(2100)
    cart().aplicarAjuste('RECARGO_FIJO', 150)
    expect(cart().totalMonto()).toBe(2150)
  })

  it('valores negativos se saturan en cero', () => {
    cart().aplicarAjuste('DESCUENTO_FIJO', -500)
    expect(cart().valorAjuste).toBe(0)
    expect(cart().totalMonto()).toBe(2000)
  })

  it('quitarAjuste restablece el total', () => {
    cart().aplicarAjuste('DESCUENTO_PORCENTAJE', 50)
    cart().quitarAjuste()
    expect(cart().totalMonto()).toBe(2000)
    expect(cart().descripcionAjuste()).toBeNull()
  })

  it('el descuento porcentual no se calcula sobre el depósito de envases', () => {
    reiniciarCarrito()
    const retornable = crearProducto({ id: 'r', precio_venta: 1000, es_retornable: true, precio_envase: 500 })
    cart().agregarProducto(retornable, 1)
    cart().toggleEnvaseItem('r')
    expect(cart().subtotalMonto()).toBe(1500)
    cart().aplicarAjuste('DESCUENTO_PORCENTAJE', 10)
    expect(cart().montoAjuste()).toBe(100)
    expect(cart().totalMonto()).toBe(1400)
  })
})

describe('cartStore: promociones integradas', () => {
  beforeEach(reiniciarCarrito)

  it('2x1 se aplica al agregar y se revierte al bajar la cantidad', () => {
    const p = crearProducto({ precio_venta: 100 })
    usePromocionStore.setState({
      promociones: [crearPromocion({ tipo: 'NXM', cantidad_minima: 2, cantidad_paga: 1 })],
    })
    cart().agregarProducto(p, 2)
    expect(cart().subtotalMonto()).toBe(100)
    expect(cart().totalAhorroPromociones()).toBe(100)
    cart().actualizarCantidad(p.id, 1)
    expect(cart().subtotalMonto()).toBe(100)
    expect(cart().totalAhorroPromociones()).toBe(0)
  })

  it('recalcularPromociones refleja promociones creadas después', () => {
    cart().agregarProducto(crearProducto({ precio_venta: 100 }), 2)
    expect(cart().subtotalMonto()).toBe(200)
    usePromocionStore.setState({
      promociones: [crearPromocion({ tipo: 'PORCENTAJE', descuento_porcentaje: 50 })],
    })
    cart().recalcularPromociones()
    expect(cart().subtotalMonto()).toBe(100)
  })
})

describe('cartStore: envases retornables', () => {
  beforeEach(reiniciarCarrito)

  it('toggleEnvaseItem suma el depósito solo en productos retornables', () => {
    const normal = crearProducto({ id: 'n', precio_venta: 100 })
    const retornable = crearProducto({ id: 'r', precio_venta: 100, es_retornable: true, precio_envase: 40 })
    cart().agregarProducto(normal, 1)
    cart().agregarProducto(retornable, 2)
    cart().toggleEnvaseItem('n')
    expect(cart().subtotalMonto()).toBe(300)
    cart().toggleEnvaseItem('r')
    expect(cart().subtotalMonto()).toBe(380)
    cart().toggleEnvaseItem('r')
    expect(cart().subtotalMonto()).toBe(300)
  })

  it('la devolución de envase resta del total', () => {
    cart().agregarProducto(crearProducto({ precio_venta: 1000 }), 1)
    cart().agregarDevolucionEnvase('1.5lts', 300, 2, '1.5lts')
    expect(cart().subtotalMonto()).toBe(400)
  })

  it('quitar una devolución revierte el stock de vacíos', () => {
    useEnvasesStore.getState().ajustarStockVacios('1.5lts', 5, 'INGRESO_MOSTRADOR')
    cart().agregarDevolucionEnvase('1.5lts', 300, 2, '1.5lts')
    const idDev = cart().items[0].producto.id
    cart().quitarProducto(idDev)
    const stock = useEnvasesStore.getState().tiposEnvases.find((t) => t.id === '1.5lts')?.stock_vacios
    expect(stock).toBe(3)
  })

  it('vaciar sin revertir (venta completada) NO toca el stock de vacíos', () => {
    useEnvasesStore.getState().ajustarStockVacios('1.5lts', 5, 'INGRESO_MOSTRADOR')
    cart().agregarDevolucionEnvase('1.5lts', 300, 2, '1.5lts')
    cart().vaciarCarrito(false)
    const stock = useEnvasesStore.getState().tiposEnvases.find((t) => t.id === '1.5lts')?.stock_vacios
    expect(stock).toBe(5)
  })

  it('vaciar revirtiendo descuenta lo recibido', () => {
    useEnvasesStore.getState().ajustarStockVacios('1.5lts', 5, 'INGRESO_MOSTRADOR')
    cart().agregarDevolucionEnvase('1.5lts', 300, 2, '1.5lts')
    cart().vaciarCarrito(true)
    const stock = useEnvasesStore.getState().tiposEnvases.find((t) => t.id === '1.5lts')?.stock_vacios
    expect(stock).toBe(3)
  })

  it('el stock de vacíos nunca queda negativo', () => {
    useEnvasesStore.getState().ajustarStockVacios('1lt', -10, 'AJUSTE_MANUAL')
    const stock = useEnvasesStore.getState().tiposEnvases.find((t) => t.id === '1lt')?.stock_vacios
    expect(stock).toBe(0)
  })
})

describe('cartStore: pestañas de tickets', () => {
  beforeEach(reiniciarCarrito)

  it('cada pestaña conserva su propio carrito', () => {
    cart().agregarProducto(crearProducto({ id: 'a' }))
    const primera = cart().tabActivaId
    const segunda = cart().crearNuevaTab()
    expect(cart().items).toHaveLength(0)
    cart().agregarProducto(crearProducto({ id: 'b' }), 2)
    cart().cambiarTab(primera)
    expect(cart().items.map((i) => i.producto.id)).toEqual(['a'])
    cart().cambiarTab(segunda)
    expect(cart().items.map((i) => i.producto.id)).toEqual(['b'])
  })

  it('los nombres automáticos reutilizan el menor número libre', () => {
    cart().crearNuevaTab()
    cart().crearNuevaTab()
    expect(cart().tabs.map((t) => t.nombre)).toEqual(['Ticket 1', 'Ticket 2', 'Ticket 3'])
  })

  it('cerrar la pestaña activa pasa a otra y renumera', () => {
    const primera = cart().tabActivaId
    const segunda = cart().crearNuevaTab()
    cart().cerrarTab(segunda)
    expect(cart().tabs).toHaveLength(1)
    expect(cart().tabActivaId).toBe(primera)
  })

  it('cerrar la única pestaña la vacía sin eliminarla', () => {
    cart().agregarProducto(crearProducto())
    cart().cerrarTab(cart().tabActivaId)
    expect(cart().tabs).toHaveLength(1)
    expect(cart().items).toHaveLength(0)
  })

  it('completarVentaTabActiva cierra el ticket y mantiene los demás', () => {
    cart().agregarProducto(crearProducto({ id: 'a' }))
    const primera = cart().tabActivaId
    const segunda = cart().crearNuevaTab()
    cart().agregarProducto(crearProducto({ id: 'b' }))
    cart().completarVentaTabActiva()
    expect(cart().tabs.map((t) => t.id)).toEqual([primera])
    expect(cart().tabActivaId).not.toBe(segunda)
    expect(cart().items.map((i) => i.producto.id)).toEqual(['a'])
  })

  it('renombrar ignora nombres vacíos', () => {
    const id = cart().tabActivaId
    cart().renombrarTab(id, '   ')
    expect(cart().tabs[0].nombre).toBe('Ticket 1')
    cart().renombrarTab(id, ' Mesa 4 ')
    expect(cart().tabs[0].nombre).toBe('Mesa 4')
  })
})

describe('cartStore: ventas en espera', () => {
  beforeEach(reiniciarCarrito)

  it('no suspende un carrito vacío', () => {
    expect(cart().suspenderVentaActual()).toBe(false)
  })

  it('suspende, persiste y recupera en la pestaña vacía', () => {
    cart().agregarProducto(crearProducto({ precio_venta: 500 }), 2)
    cart().aplicarAjuste('DESCUENTO_FIJO', 100)
    expect(cart().suspenderVentaActual('Cliente Juan')).toBe(true)
    expect(cart().items).toHaveLength(0)
    expect(cart().ventasEnEspera).toHaveLength(1)
    expect(cart().ventasEnEspera[0].total).toBe(900)
    expect(JSON.parse(localStorage.getItem('kioskopos_ventas_espera') as string)).toHaveLength(1)

    cart().recuperarVenta(cart().ventasEnEspera[0].id)
    expect(cart().items).toHaveLength(1)
    expect(cart().totalMonto()).toBe(900)
    expect(cart().ventasEnEspera).toHaveLength(0)
  })

  it('recuperar con carrito en curso abre una pestaña nueva sin pisar la venta actual', () => {
    cart().agregarProducto(crearProducto({ id: 'a' }))
    cart().suspenderVentaActual()
    cart().agregarProducto(crearProducto({ id: 'b' }))
    const tabsAntes = cart().tabs.length
    cart().recuperarVenta(cart().ventasEnEspera[0].id)
    expect(cart().tabs).toHaveLength(tabsAntes + 1)
    expect(cart().items.map((i) => i.producto.id)).toEqual(['a'])
    const original = cart().tabs.find((t) => t.items.some((i) => i.producto.id === 'b'))
    expect(original).toBeDefined()
  })

  it('eliminar una venta en espera la quita del almacenamiento', () => {
    cart().agregarProducto(crearProducto())
    cart().suspenderVentaActual()
    cart().eliminarVentaEnEspera(cart().ventasEnEspera[0].id)
    expect(cart().ventasEnEspera).toHaveLength(0)
    expect(JSON.parse(localStorage.getItem('kioskopos_ventas_espera') as string)).toEqual([])
  })
})
