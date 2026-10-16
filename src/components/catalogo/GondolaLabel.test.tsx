import { cleanup, render, fireEvent, screen } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import { GondolaLabel, LABEL_DIMENSIONS } from './GondolaLabel'
import type { FormatoEtiqueta } from './GondolaLabel'
import { EtiquetasGondolaModal } from './EtiquetasGondolaModal'
import { crearProducto } from '../../test/factories'

afterEach(cleanup)
const formatos: FormatoEtiqueta[] = ['A4', 'TERMICA_58', 'TERMICA_80']
it.each(formatos)('%s conserva dimensiones y espacios con nombres largos y todas las opciones', formato => {
  for (let options = 0; options < 8; options++) {
    const { container, unmount } = render(<GondolaLabel producto={crearProducto({ descripcion: 'Nombre muy largo '.repeat(12), codigo_barras: '7791234567890' })}
      formato={formato} negocio="Kiosco de prueba" fecha="15/10/2026"
      mostrarCodigo={Boolean(options & 1)} mostrarNegocio={Boolean(options & 2)} mostrarFecha={Boolean(options & 4)} />)
    const card = container.querySelector<HTMLElement>('[data-label-paper]')!
    expect(card.style.width).toBe(`${LABEL_DIMENSIONS[formato].width}mm`)
    expect(card.style.height).toBe(`${LABEL_DIMENSIONS[formato].height}mm`)
    expect(card.querySelectorAll(':scope > div')).toHaveLength(5)
    expect(card.querySelector('.gondola-label-name')?.textContent).toContain('Nombre muy largo')
    expect(card.querySelector('.gondola-label-barcode')?.getAttribute('data-label-hidden')).toBe(String(!Boolean(options & 1)))
    expect(card.querySelector('.gondola-label-header')?.getAttribute('data-label-hidden')).toBe(String(!Boolean(options & 2)))
    expect(card.querySelector('.gondola-label-date')?.getAttribute('data-label-hidden')).toBe(String(!Boolean(options & 4)))
    unmount()
  }
})
it('pagina A4 en grupos de 24 y usa la misma tarjeta para impresión y vista previa', () => {
  const productos = Array.from({ length: 25 }, (_, i) => crearProducto({ id: `p-${i}`, descripcion: `Producto ${i}` }))
  render(<EtiquetasGondolaModal isOpen onClose={() => undefined} productos={productos} categorias={[]} />)
  fireEvent.click(screen.getByRole('button', { name: 'Marcar todos' }))
  expect(document.querySelectorAll('#printable-etiquetas .page-a4-labels')).toHaveLength(2)
  expect(document.querySelectorAll('#printable-etiquetas .page-a4-labels')[0].children).toHaveLength(24)
  expect(document.querySelectorAll('#printable-etiquetas .page-a4-labels')[1].children).toHaveLength(1)
  expect(document.querySelectorAll('#printable-etiquetas [data-label-paper]')).toHaveLength(25)
  fireEvent.click(screen.getByRole('checkbox', { name: 'Código de Barras' }))
  expect(document.querySelector('#printable-etiquetas .gondola-label-barcode')?.getAttribute('data-label-hidden')).toBe('true')
  expect(document.getElementById('printable-etiquetas')?.parentElement).toBe(document.body)
})
