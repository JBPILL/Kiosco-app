import { render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import type { MovimientoStock } from '../../types/database'
import { ResumenBajasStock } from './ResumenBajasStock'

const movimiento: MovimientoStock = {
  id: 'm1', kiosco_id: 'k1', producto_id: 'p1', tipo: 'EGRESO', cantidad: -2,
  motivo: 'MERMA', notas: null, usuario_id: 'u1', fecha: '2026-10-05', costo_unitario_referencia: 10,
}

it('oculta el resumen y sus costos cuando no hay autorización', () => {
  const { container } = render(<ResumenBajasStock movimientos={[movimiento]} autorizado={false} hayMas={false} />)
  expect(container.textContent).toBe('')
})

it('indica alcance cargado, motivos y estimación parcial sin completar costos faltantes', () => {
  render(<ResumenBajasStock movimientos={[
    movimiento, { ...movimiento, id: 'm2', costo_unitario_referencia: null },
  ]} autorizado hayMas />)
  expect(screen.getByRole('region', { name: 'Resumen de bajas de inventario' })).toBeTruthy()
  expect(screen.getByText(/Basado en 2 movimientos cargados/).textContent).toContain('Hay más movimientos sin cargar')
  expect(screen.getByRole('rowheader', { name: 'Merma' })).toBeTruthy()
  expect(screen.getByText(/La estimación es parcial/)).toBeTruthy()
})

it('muestra costo desconocido y explica el conjunto vacío', () => {
  const { rerender } = render(<ResumenBajasStock movimientos={[
    { ...movimiento, costo_unitario_referencia: null },
  ]} autorizado hayMas={false} />)
  expect(screen.getByText('No disponible')).toBeTruthy()
  rerender(<ResumenBajasStock movimientos={[]} autorizado hayMas={false} />)
  expect(screen.getByText('No hay bajas identificadas en estos movimientos.')).toBeTruthy()
})
