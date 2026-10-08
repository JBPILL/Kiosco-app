import { describe, expect, it } from 'vitest'
import { validarRelacionesBackup } from './backupRelations'

function copia() {
  return {
    kiosco: { id: 'k1' }, categorias: [{ id: 'c1' }], proveedores: [{ id: 's1' }], clientes: [],
    productos: [{ id: 'p1', categoria_id: 'c1', proveedor_id: 's1' }],
    promociones: [{ id: 'o1', producto_id: 'p1', categoria_id: 'c1', items_combo: [{ producto_id: 'p1' }] }],
    lotes_producto: [{ id: 'l1', producto_id: 'p1' }],
  }
}

describe('relaciones del respaldo', () => {
  it('acepta una copia coherente sin modificarla', () => {
    const datos = copia()
    const original = JSON.stringify(datos)
    validarRelacionesBackup(datos)
    expect(JSON.stringify(datos)).toBe(original)
  })
  it.each(['categoria_id', 'proveedor_id'] as const)('rechaza %s ausente', campo => {
    const datos = copia()
    datos.productos[0][campo] = 'ausente'
    expect(() => validarRelacionesBackup(datos)).toThrow('referencia')
  })
  it('rechaza lotes sin producto', () => {
    const datos = copia()
    datos.lotes_producto[0].producto_id = 'ausente'
    expect(() => validarRelacionesBackup(datos)).toThrow('lotes_producto')
  })
  it('rechaza componentes de promoción ausentes', () => {
    const datos = copia()
    datos.promociones[0].items_combo[0].producto_id = 'ausente'
    expect(() => validarRelacionesBackup(datos)).toThrow('promociones')
  })
  it('rechaza identificadores duplicados', () => {
    const datos = copia()
    datos.productos.push({ ...datos.productos[0] })
    expect(() => validarRelacionesBackup(datos)).toThrow('duplicado')
  })
  it('rechaza registros de otro comercio', () => {
    const datos = copia()
    expect(() => validarRelacionesBackup({ ...datos, clientes: [{ id: 'u1', kiosco_id: 'otro' }] })).toThrow('otro comercio')
  })
  it('acepta relaciones opcionales vacías', () => {
    expect(() => validarRelacionesBackup({ ...copia(), productos: [{ id: 'p1', categoria_id: null, proveedor_id: null }] })).not.toThrow()
  })
})
