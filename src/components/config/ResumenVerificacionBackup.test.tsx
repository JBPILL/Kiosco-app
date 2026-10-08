import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { ResumenVerificacionBackup } from './ResumenVerificacionBackup'

afterEach(cleanup)

it('muestra cada colección verificada con su cantidad incluso cero', () => {
  render(<ResumenVerificacionBackup resumen={{ productosVerificados: 5, lotesVerificados: 2, promocionesVerificadas: 0, combosVerificados: 1 }} />)
  expect(screen.getByText('Productos: precios y stock: 5')).toBeTruthy()
  expect(screen.getByText('Lotes: cantidades y producto asociado: 2')).toBeTruthy()
  expect(screen.getByText('Promociones: condiciones y componentes: 0')).toBeTruthy()
  expect(screen.getByText('Recetas de combos: 1')).toBeTruthy()
})

it('no presenta comprobaciones que no terminaron ante fallo parcial', () => {
  render(<ResumenVerificacionBackup resumen={{ productosVerificados: 5 }} />)
  expect(screen.getByText('Productos: precios y stock: 5')).toBeTruthy()
  expect(screen.queryByText(/Lotes:/)).toBeNull()
  expect(screen.queryByText(/Promociones:/)).toBeNull()
  expect(screen.queryByText(/Recetas/)).toBeNull()
})

it('no afirma verificación del servidor para formatos antiguos sin comparación', () => {
  const { container } = render(<ResumenVerificacionBackup resumen={{}} />)
  expect(container.childElementCount).toBe(0)
})
