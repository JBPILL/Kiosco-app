import { beforeEach, describe, expect, it } from 'vitest'
import { TIPOS_ENVASES_DEFAULT, useEnvasesStore } from './envasesStore'
import type { TipoEnvase } from './envasesStore'

const KIOSCO = 'k1'
const claveTipos = `kiosko_tipos_envases_${KIOSCO}`
const claveHistorial = `kiosko_movimientos_envases_${KIOSCO}`

function tiposIniciales(stock = 0): TipoEnvase[] {
  return TIPOS_ENVASES_DEFAULT.map(t => ({ ...t, stock_vacios: stock }))
}

function tipo(id: string) {
  return useEnvasesStore.getState().tiposEnvases.find(t => t.id === id) as TipoEnvase
}

function tiposPersistidos(): TipoEnvase[] {
  return JSON.parse(localStorage.getItem(claveTipos) ?? '[]')
}

function historialPersistido() {
  return JSON.parse(localStorage.getItem(claveHistorial) ?? '[]')
}

beforeEach(() => {
  localStorage.clear()
  useEnvasesStore.setState({ tiposEnvases: tiposIniciales(), historialMovimientos: [] })
})

describe('envasesStore.cargarTiposEnvases', () => {
  it('usa los tipos por defecto si no hay datos guardados', () => {
    useEnvasesStore.getState().cargarTiposEnvases(KIOSCO)
    expect(useEnvasesStore.getState().tiposEnvases.map(t => t.id)).toEqual(TIPOS_ENVASES_DEFAULT.map(t => t.id))
  })

  it('completa con los tipos por defecto que falten y respeta los precios guardados', () => {
    localStorage.setItem(claveTipos, JSON.stringify([{ id: '2lts', nombre: '2lts', precio: 9999, stock_vacios: 7 }]))

    useEnvasesStore.getState().cargarTiposEnvases(KIOSCO)

    expect(useEnvasesStore.getState().tiposEnvases).toHaveLength(TIPOS_ENVASES_DEFAULT.length)
    expect(tipo('2lts')).toMatchObject({ precio: 9999, stock_vacios: 7 })
  })

  it('migra el nombre legado "1LT" a "1lt" sin duplicar el tipo', () => {
    localStorage.setItem(claveTipos, JSON.stringify([{ id: '1lt', nombre: '1LT', precio: 1500 }]))

    useEnvasesStore.getState().cargarTiposEnvases(KIOSCO)

    const unLitro = useEnvasesStore.getState().tiposEnvases.filter(t => t.id === '1lt')
    expect(unLitro).toHaveLength(1)
    expect(unLitro[0].nombre).toBe('1lt')
    expect(tiposPersistidos().find(t => t.id === '1lt')?.nombre).toBe('1lt')
  })

  it('normaliza stock_vacios ausente a 0', () => {
    localStorage.setItem(claveTipos, JSON.stringify([{ id: 'sifon', nombre: 'Sifón de soda', precio: 2500 }]))
    useEnvasesStore.getState().cargarTiposEnvases(KIOSCO)
    expect(tipo('sifon').stock_vacios).toBe(0)
  })

  it('no se rompe con JSON corrupto', () => {
    localStorage.setItem(claveTipos, '{no-es-json')
    useEnvasesStore.getState().cargarTiposEnvases(KIOSCO)
    expect(useEnvasesStore.getState().tiposEnvases).toHaveLength(TIPOS_ENVASES_DEFAULT.length)
  })

  it('carga el historial junto con los tipos', () => {
    localStorage.setItem(claveHistorial, JSON.stringify([{ id: 'm1' }]))
    useEnvasesStore.getState().cargarTiposEnvases(KIOSCO)
    expect(useEnvasesStore.getState().historialMovimientos).toHaveLength(1)
  })

  it('aísla los datos por kiosco', () => {
    localStorage.setItem('kiosko_tipos_envases_otro', JSON.stringify([{ id: '2lts', nombre: '2lts', precio: 1 }]))
    useEnvasesStore.getState().cargarTiposEnvases(KIOSCO)
    expect(tipo('2lts').precio).toBe(2000)
  })
})

describe('envasesStore: precios', () => {
  it('actualizarPrecioTipo cambia solo el tipo indicado y persiste', () => {
    useEnvasesStore.getState().actualizarPrecioTipo('2lts', 2500, KIOSCO)

    expect(tipo('2lts').precio).toBe(2500)
    expect(tipo('1lt').precio).toBe(1500)
    expect(tiposPersistidos().find(t => t.id === '2lts')?.precio).toBe(2500)
  })

  it('actualizarPrecioTipo no admite precios negativos', () => {
    useEnvasesStore.getState().actualizarPrecioTipo('2lts', -10, KIOSCO)
    expect(tipo('2lts').precio).toBe(0)
  })

  it('REGRESIÓN: actualizarPrecioTipo ignora valores no numéricos', () => {
    useEnvasesStore.getState().actualizarPrecioTipo('2lts', NaN, KIOSCO)
    expect(tipo('2lts').precio).toBe(2000)
  })

  it('actualizarPreciosConjuntamente en modo FIJO fija todos los precios', () => {
    useEnvasesStore.getState().actualizarPreciosConjuntamente('FIJO', 1000, KIOSCO)
    expect(useEnvasesStore.getState().tiposEnvases.every(t => t.precio === 1000)).toBe(true)
  })

  it('actualizarPreciosConjuntamente en modo PORCENTAJE redondea', () => {
    useEnvasesStore.getState().actualizarPreciosConjuntamente('PORCENTAJE', 10, KIOSCO)
    expect(tipo('1lt').precio).toBe(1650)
    expect(tipo('1.5lts').precio).toBe(1980)
    expect(tipo('2.25lts').precio).toBe(2420)
  })

  it('REGRESIÓN: una baja mayor al 100% no genera precios negativos', () => {
    useEnvasesStore.getState().actualizarPreciosConjuntamente('PORCENTAJE', -150, KIOSCO)
    expect(useEnvasesStore.getState().tiposEnvases.every(t => t.precio >= 0)).toBe(true)
  })

  it('REGRESIÓN: valores no numéricos no alteran los precios', () => {
    useEnvasesStore.getState().actualizarPreciosConjuntamente('PORCENTAJE', NaN, KIOSCO)
    useEnvasesStore.getState().actualizarPreciosConjuntamente('FIJO', NaN, KIOSCO)
    expect(tipo('1lt').precio).toBe(1500)
  })
})

describe('envasesStore.actualizarStockVacios', () => {
  it('fija el stock, redondea y registra la diferencia en el historial', () => {
    useEnvasesStore.setState({ tiposEnvases: tiposIniciales(10) })

    useEnvasesStore.getState().actualizarStockVacios('2lts', 14.6, KIOSCO, 'Dueño')

    expect(tipo('2lts').stock_vacios).toBe(15)
    const [mov] = useEnvasesStore.getState().historialMovimientos
    expect(mov).toMatchObject({ tipo: 'AJUSTE_MANUAL', cantidad: 5, stockResultante: 15, usuarioNombre: 'Dueño' })
    expect(historialPersistido()).toHaveLength(1)
  })

  it('no permite stock negativo', () => {
    useEnvasesStore.setState({ tiposEnvases: tiposIniciales(10) })
    useEnvasesStore.getState().actualizarStockVacios('2lts', -4, KIOSCO)
    expect(tipo('2lts').stock_vacios).toBe(0)
    expect(useEnvasesStore.getState().historialMovimientos[0].cantidad).toBe(-10)
  })

  it('ignora ids inexistentes sin generar historial', () => {
    useEnvasesStore.getState().actualizarStockVacios('nope', 5, KIOSCO)
    expect(useEnvasesStore.getState().historialMovimientos).toHaveLength(0)
  })

  it('REGRESIÓN: ignora valores no numéricos', () => {
    useEnvasesStore.setState({ tiposEnvases: tiposIniciales(10) })
    useEnvasesStore.getState().actualizarStockVacios('2lts', NaN, KIOSCO)
    expect(tipo('2lts').stock_vacios).toBe(10)
    expect(useEnvasesStore.getState().historialMovimientos).toHaveLength(0)
  })
})

describe('envasesStore.ajustarStockVacios', () => {
  it('suma envases recibidos en mostrador y deja rastro', () => {
    useEnvasesStore.getState().ajustarStockVacios('1lt', 3, 'INGRESO_MOSTRADOR', KIOSCO, 'Ana')

    expect(tipo('1lt').stock_vacios).toBe(3)
    expect(useEnvasesStore.getState().historialMovimientos[0]).toMatchObject({
      tipo: 'INGRESO_MOSTRADOR',
      cantidad: 3,
      stockResultante: 3,
      usuarioNombre: 'Ana',
    })
    expect(tiposPersistidos().find(t => t.id === '1lt')?.stock_vacios).toBe(3)
  })

  it('restar nunca deja el stock bajo cero', () => {
    useEnvasesStore.setState({ tiposEnvases: tiposIniciales(2) })
    useEnvasesStore.getState().ajustarStockVacios('1lt', -5, 'AJUSTE_MANUAL', KIOSCO)
    expect(tipo('1lt').stock_vacios).toBe(0)
  })

  it('REGRESIÓN: el historial registra la variación real y no la solicitada', () => {
    useEnvasesStore.setState({ tiposEnvases: tiposIniciales(2) })

    useEnvasesStore.getState().ajustarStockVacios('1lt', -5, 'AJUSTE_MANUAL', KIOSCO)

    expect(useEnvasesStore.getState().historialMovimientos[0].cantidad).toBe(-2)
  })

  it('REGRESIÓN: ignora deltas no numéricos', () => {
    useEnvasesStore.setState({ tiposEnvases: tiposIniciales(4) })
    useEnvasesStore.getState().ajustarStockVacios('1lt', NaN, 'AJUSTE_MANUAL', KIOSCO)
    expect(tipo('1lt').stock_vacios).toBe(4)
  })

  it('ignora ids inexistentes', () => {
    useEnvasesStore.getState().ajustarStockVacios('nope', 3, 'INGRESO_MOSTRADOR', KIOSCO)
    expect(useEnvasesStore.getState().historialMovimientos).toHaveLength(0)
  })

  it('el historial conserva solo los 100 movimientos más recientes', () => {
    for (let i = 0; i < 105; i++) {
      useEnvasesStore.getState().ajustarStockVacios('1lt', 1, 'INGRESO_MOSTRADOR', KIOSCO)
    }
    const historial = useEnvasesStore.getState().historialMovimientos
    expect(historial).toHaveLength(100)
    expect(historial[0].stockResultante).toBe(105)
    expect(historialPersistido()).toHaveLength(100)
  })

  it('no muta los tipos por defecto compartidos', () => {
    useEnvasesStore.getState().ajustarStockVacios('1lt', 9, 'INGRESO_MOSTRADOR', KIOSCO)
    expect(TIPOS_ENVASES_DEFAULT.find(t => t.id === '1lt')?.stock_vacios).toBe(0)
  })
})

describe('envasesStore.entregarVaciosADistribuidor', () => {
  it('descuenta el stock y registra la entrega con el distribuidor', () => {
    useEnvasesStore.setState({ tiposEnvases: tiposIniciales(20) })

    const ok = useEnvasesStore.getState().entregarVaciosADistribuidor('2lts', 8, '  Coca-Cola  ', 'Camión 3', KIOSCO, 'Dueño')

    expect(ok).toBe(true)
    expect(tipo('2lts').stock_vacios).toBe(12)
    expect(useEnvasesStore.getState().historialMovimientos[0]).toMatchObject({
      tipo: 'ENTREGA_DISTRIBUIDOR',
      cantidad: -8,
      stockResultante: 12,
      distribuidor: 'Coca-Cola',
      notas: 'Camión 3',
    })
  })

  it('devuelve false para tipos inexistentes', () => {
    expect(useEnvasesStore.getState().entregarVaciosADistribuidor('nope', 1, 'X')).toBe(false)
    expect(useEnvasesStore.getState().historialMovimientos).toHaveLength(0)
  })

  it('REGRESIÓN: si entrega más de lo que hay, el stock queda en 0 y el historial refleja lo realmente descontado', () => {
    useEnvasesStore.setState({ tiposEnvases: tiposIniciales(3) })

    useEnvasesStore.getState().entregarVaciosADistribuidor('2lts', 10, 'X', undefined, KIOSCO)

    expect(tipo('2lts').stock_vacios).toBe(0)
    expect(useEnvasesStore.getState().historialMovimientos[0].cantidad).toBe(-3)
  })

  it('REGRESIÓN: una cantidad no numérica no corrompe el stock con NaN', () => {
    useEnvasesStore.setState({ tiposEnvases: tiposIniciales(5) })

    const ok = useEnvasesStore.getState().entregarVaciosADistribuidor('2lts', NaN, 'X', undefined, KIOSCO)

    expect(ok).toBe(false)
    expect(tipo('2lts').stock_vacios).toBe(5)
  })
})

describe('envasesStore.obtenerPrecioPorTipo', () => {
  const precio = (q?: string) => useEnvasesStore.getState().obtenerPrecioPorTipo(q)

  it('busca por nombre o id exacto sin distinguir mayúsculas', () => {
    expect(precio('2LTS')).toBe(2000)
    expect(precio('bidon20l')).toBe(5000)
    expect(precio(' Sifón de soda ')).toBe(2500)
  })

  it('reconoce palabras clave frecuentes', () => {
    expect(precio('Gaseosa 2.25L')).toBe(2200)
    expect(precio('Coca 1.5L')).toBe(1800)
    expect(precio('Sifon')).toBe(2500)
    expect(precio('Bidón agua')).toBe(5000)
    expect(precio('Cerveza litro')).toBe(1500)
  })

  it('devuelve el precio de la lista actual, no el original', () => {
    useEnvasesStore.getState().actualizarPrecioTipo('2lts', 3000, KIOSCO)
    expect(precio('2lts')).toBe(3000)
  })

  it('usa 1500 si no se indica tipo y el primer precio si no reconoce el texto', () => {
    expect(precio()).toBe(1500)
    expect(precio('')).toBe(1500)
    expect(precio('desconocido')).toBe(useEnvasesStore.getState().tiposEnvases[0].precio)
  })
})
