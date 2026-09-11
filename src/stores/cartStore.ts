import { create } from 'zustand'
import type { Producto, ItemCarrito } from '../types/database'

interface CartState {
  // Estado
  items: ItemCarrito[]
  
  // Acciones
  agregarProducto: (producto: Producto) => void
  quitarProducto: (productoId: string) => void
  actualizarCantidad: (productoId: string, cantidad: number) => void
  vaciarCarrito: () => void
  
  // Computed
  totalItems: () => number
  totalMonto: () => number
}

export const useCartStore = create<CartState>((set, get) => ({
  items: [],

  agregarProducto: (producto: Producto) => {
    set((state) => {
      // Si el producto ya está en el carrito, sumar 1
      const existente = state.items.find((item) => item.producto.id === producto.id)
      
      if (existente) {
        return {
          items: state.items.map((item) =>
            item.producto.id === producto.id
              ? {
                  ...item,
                  cantidad: item.cantidad + 1,
                  subtotal: (item.cantidad + 1) * item.producto.precio_venta,
                }
              : item
          ),
        }
      }

      // Si no está, agregarlo con cantidad 1
      return {
        items: [
          ...state.items,
          {
            producto,
            cantidad: 1,
            subtotal: producto.precio_venta,
          },
        ],
      }
    })
  },

  quitarProducto: (productoId: string) => {
    set((state) => ({
      items: state.items.filter((item) => item.producto.id !== productoId),
    }))
  },

  actualizarCantidad: (productoId: string, cantidad: number) => {
    if (cantidad <= 0) {
      get().quitarProducto(productoId)
      return
    }

    set((state) => ({
      items: state.items.map((item) =>
        item.producto.id === productoId
          ? {
              ...item,
              cantidad,
              subtotal: cantidad * item.producto.precio_venta,
            }
          : item
      ),
    }))
  },

  vaciarCarrito: () => set({ items: [] }),

  totalItems: () => get().items.reduce((sum, item) => sum + item.cantidad, 0),

  totalMonto: () => get().items.reduce((sum, item) => sum + item.subtotal, 0),
}))
