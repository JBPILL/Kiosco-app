import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { EtiquetasGondolaModal } from './EtiquetasGondolaModal'
import type { Producto } from '../../types/database'

const producto: Producto = {
  id: 'producto-1', kiosco_id: 'k1', categoria_id: null, codigo_barras: '7791813421183',
  descripcion: 'Corto', precio_costo: 0, precio_venta: 1500, stock_actual: 1,
  stock_minimo: 0, es_favorito: false, activo: true, fecha_creacion: '', fecha_actualizacion: '',
}
const productos = [producto, { ...producto, id: 'producto-2', descripcion: 'Descripción extremadamente larga sin espacios ' + 'ABCDEFGHIJ'.repeat(12), es_pesable: true, unidad_medida: 'KG' as const }]

afterEach(cleanup)

describe.each([
  ['Rollo Térmico 58 mm', '48mm', '58mm 40mm'],
  ['Rollo Térmico 80 mm', '72mm', '80mm 40mm'],
])('etiquetas %s', (nombre, ancho, pagina) => {
  it('usa la misma geometría para productos cortos/largos y para vista previa/impresión', () => {
    const { container } = render(<EtiquetasGondolaModal isOpen onClose={vi.fn()} productos={productos} categorias={[]} />)
    fireEvent.click(screen.getByText('Marcar todos'))
    fireEvent.click(screen.getByLabelText(new RegExp(nombre)))
    const etiquetas = container.querySelectorAll<HTMLElement>('.gondola-termica')
    expect(etiquetas).toHaveLength(4)
    for (const etiqueta of etiquetas) {
      expect(etiqueta.style.width).toBe(ancho)
      expect(etiqueta.style.height).toBe('40mm')
    }
    const impresas = container.querySelectorAll('#printable-etiquetas .gondola-termica')
    expect(etiquetas[0].outerHTML).toBe(impresas[0].outerHTML)
    expect(etiquetas[1].outerHTML).toBe(impresas[1].outerHTML)
    expect(container.querySelector('style')?.textContent).toContain(`size: ${pagina}`)

    fireEvent.click(screen.getByLabelText('Nombre del Kiosco'))
    fireEvent.click(screen.getByLabelText('Código de Barras'))
    fireEvent.click(screen.getByLabelText('Fecha de Emisión'))
    expect(container.querySelectorAll('.gondola-termica svg')).toHaveLength(0)
    for (const etiqueta of container.querySelectorAll<HTMLElement>('.gondola-termica')) {
      expect(etiqueta.style.height).toBe('40mm')
      expect(etiqueta.style.width).toBe(ancho)
      expect(etiqueta.children).toHaveLength(5)
    }
  })
})

it('libera los contenedores del modal durante impresión y los restaura al terminar', () => {
  const { unmount } = render(<EtiquetasGondolaModal isOpen onClose={vi.fn()} productos={productos} categorias={[]} />)
  window.dispatchEvent(new Event('beforeprint'))
  expect(document.querySelectorAll('.ticket-print-ancestor').length).toBeGreaterThan(0)
  window.dispatchEvent(new Event('afterprint'))
  expect(document.querySelectorAll('.ticket-print-ancestor')).toHaveLength(0)
  window.dispatchEvent(new Event('beforeprint'))
  unmount()
  expect(document.querySelectorAll('.ticket-print-ancestor')).toHaveLength(0)
})
