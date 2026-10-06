import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, expect, it } from 'vitest'
import { ArticuloLibreModal } from './ArticuloLibreModal'
import { useCartStore } from '../../stores/cartStore'

beforeEach(() => {
  useCartStore.setState({
    items: [], tabs: [{ id: 't1', nombre: 'Ticket 1', items: [], tipoAjuste: 'NINGUNO', valorAjuste: 0 }],
    tabActivaId: 't1', tipoAjuste: 'NINGUNO', valorAjuste: 0,
  })
})

it('precarga el servicio y lo agrega como ítem libre sin producto de inventario', () => {
  render(<ArticuloLibreModal isOpen onClose={() => undefined} descripcionInicial="Fotocopias" />)
  expect(screen.getByDisplayValue('Fotocopias')).toBeTruthy()
  fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '150' } })
  fireEvent.click(screen.getByRole('button', { name: 'Agregar al Ticket' }))
  const item = useCartStore.getState().items[0]
  expect(item.producto.descripcion).toBe('Fotocopias')
  expect(item.producto.activo).toBe(false)
  expect(item.producto.kiosco_id).toBe('')
  expect(item.subtotal).toBe(150)
})

it('actualiza el concepto al elegir otro acceso rápido', () => {
  const { rerender } = render(<ArticuloLibreModal isOpen onClose={() => undefined} descripcionInicial="Impresiones" />)
  expect(screen.getByDisplayValue('Impresiones')).toBeTruthy()
  rerender(<ArticuloLibreModal isOpen onClose={() => undefined} descripcionInicial="Anillado" />)
  expect(screen.getByDisplayValue('Anillado')).toBeTruthy()
})
