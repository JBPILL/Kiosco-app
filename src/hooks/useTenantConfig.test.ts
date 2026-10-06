import { describe, expect, it } from 'vitest'
import { capacidadesPorDefecto } from './useTenantConfig'

describe('capacidadesPorDefecto', () => {
  it('habilita pesables y vencimientos en veterinaria sin envases ni copiado', () => {
    expect(capacidadesPorDefecto('PETSHOP_VETERINARIA')).toEqual({ envases: false, balanza: true, vencimientos: true, serviciosRapidos: false })
    expect(capacidadesPorDefecto('ELECTRONICA_CELULARES')).toEqual({ envases: false, balanza: false, vencimientos: false, serviciosRapidos: false })
  })
  it('preserva las capacidades históricas de KIOSCO', () => {
    expect(capacidadesPorDefecto('KIOSCO')).toEqual({
      envases: true,
      balanza: true,
      vencimientos: true,
      serviciosRapidos: false,
    })
  })

  it('usa defaults compatibles y deja que la librería tenga servicios rápidos', () => {
    expect(capacidadesPorDefecto('FOTOCOPIADORA_LIBRERIA')).toEqual({
      envases: false,
      balanza: false,
      vencimientos: false,
      serviciosRapidos: true,
    })
    expect(capacidadesPorDefecto('GENERAL').envases).toBe(false)
  })
})
