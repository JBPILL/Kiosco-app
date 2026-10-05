import { describe, expect, it } from 'vitest'
import { adjuntarCostosProtegidos } from './productCostAccess'

describe('adjuntarCostosProtegidos', () => {
  it('une el costo privado por id sin mutar los productos de origen', () => {
    const productos = [
      { id: 'p1', descripcion: 'Gaseosa', precio_costo: 0 },
      { id: 'p2', descripcion: 'Agua', precio_costo: 0 },
    ]

    const resultado = adjuntarCostosProtegidos(productos, [
      { producto_id: 'p1', precio_costo: '1250.5' },
    ])

    expect(resultado).toEqual([
      { id: 'p1', descripcion: 'Gaseosa', precio_costo: 1250.5 },
      { id: 'p2', descripcion: 'Agua', precio_costo: 0 },
    ])
    expect(productos[0].precio_costo).toBe(0)
  })

  it('normaliza valores inválidos a cero', () => {
    expect(
      adjuntarCostosProtegidos([{ id: 'p1', precio_costo: 0 }], [
        { producto_id: 'p1', precio_costo: 'no-numérico' },
      ])
    ).toEqual([{ id: 'p1', precio_costo: 0 }])
  })
})
