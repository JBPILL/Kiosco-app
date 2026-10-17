import { useState } from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { Input } from './Input'

it.each([0, '0'])('al enfocar cero %s deja escribir sin cambiar el modelo ni disparar escrituras', value => {
  const cambiar = vi.fn(); const enfocar = vi.fn(); const salir = vi.fn()
  render(<Input aria-label="Cantidad" type="number" value={value} placeholder="0" onChange={cambiar} onFocus={enfocar} onBlur={salir} />)
  const input = screen.getByRole('spinbutton') as HTMLInputElement
  fireEvent.focus(input)
  expect(input.value).toBe('')
  expect(input.getAttribute('placeholder')).toBeNull()
  expect(cambiar).not.toHaveBeenCalled()
  fireEvent.blur(input)
  expect(input.value).toBe('0')
  expect(cambiar).not.toHaveBeenCalled()
  expect(enfocar).toHaveBeenCalledOnce()
  expect(salir).toHaveBeenCalledOnce()
})

function Cantidad() {
  const [value, setValue] = useState('0')
  return <Input aria-label="Cantidad" type="number" step="0.01" value={value} onChange={event => setValue(event.target.value)} />
}

it('permite reemplazar cero por una cantidad decimal y conserva el cero escrito explícitamente', () => {
  render(<Cantidad />)
  const input = screen.getByRole('spinbutton') as HTMLInputElement
  fireEvent.focus(input)
  fireEvent.change(input, { target: { value: '0' } })
  expect(input.value).toBe('0')
  fireEvent.change(input, { target: { value: '0.75' } })
  fireEvent.blur(input)
  expect(input.value).toBe('0.75')
  fireEvent.focus(input)
  expect(input.value).toBe('0.75')
})

it('conserva códigos de texto, valores no cero y reglas nativas de campos obligatorios o inválidos', () => {
  render(<>
    <Input aria-label="Código" value="0" onChange={vi.fn()} />
    <Input aria-label="Existencias" type="number" value="5" onChange={vi.fn()} />
    <Input aria-label="Obligatorio" type="number" required value="0" onChange={vi.fn()} />
    <Input aria-label="Mínimo uno" type="number" min="1" value="0" onChange={vi.fn()} />
    <Input aria-label="Sólo lectura" type="number" readOnly value="0" />
  </>)
  for (const [name, value] of [['Código', '0'], ['Existencias', '5'], ['Obligatorio', '0'], ['Mínimo uno', '0'], ['Sólo lectura', '0']]) {
    const input = screen.getByLabelText(name) as HTMLInputElement
    fireEvent.focus(input)
    expect(input.value).toBe(value)
    fireEvent.blur(input)
  }
  expect((screen.getByLabelText('Mínimo uno') as HTMLInputElement).validity.rangeUnderflow).toBe(true)
})
