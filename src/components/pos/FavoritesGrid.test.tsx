import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { FavoritesGrid } from './FavoritesGrid'
import { crearProducto } from '../../test/factories'

vi.mock('../../stores/cartStore', () => ({ useCartStore: (selector: (state: { items: [] }) => unknown) => selector({ items: [] }) }))
afterEach(cleanup)
it('mantiene selección y navegación por teclado en las tarjetas nuevas', () => {
 const productos = [crearProducto({ descripcion: 'Producto uno', stock_actual: 10 }), crearProducto({ descripcion: 'Producto dos', stock_actual: 10 })]
 const onSelect = vi.fn()
 render(<FavoritesGrid productos={productos} onSelect={onSelect} />)
 const primero = screen.getByRole('button', { name: /Producto uno/ })
 fireEvent.click(primero)
 expect(onSelect).toHaveBeenCalledWith(productos[0])
 fireEvent.keyDown(primero, { key: 'ArrowRight' })
 expect(document.activeElement).toBe(screen.getByRole('button', { name: /Producto dos/ }))
})
it('conserva el bloqueo de artículos sin stock', () => {
 const onSelect = vi.fn()
 render(<FavoritesGrid productos={[crearProducto({ descripcion: 'Sin unidades', stock_actual: 0 })]} onSelect={onSelect} />)
 const boton = screen.getByRole('button', { name: /Sin unidades/ }) as HTMLButtonElement
 expect(boton.disabled).toBe(true)
 fireEvent.click(boton)
 expect(onSelect).not.toHaveBeenCalled()
})
