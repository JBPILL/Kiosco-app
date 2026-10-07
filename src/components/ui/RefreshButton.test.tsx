import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { RefreshButton } from './RefreshButton'
import { IndicatorCard } from './IndicatorCard'

it('refresca con icono sin texto visible y conserva nombre accesible', () => {
  const onClick = vi.fn()
  render(<RefreshButton onClick={onClick} label="Actualizar stock" />)
  const button = screen.getByRole('button', { name: 'Actualizar stock' })
  expect(button.textContent).toBe('')
  fireEvent.click(button)
  expect(onClick).toHaveBeenCalledOnce()
})

it('anima el icono y evita clics repetidos durante la carga', () => {
  const onClick = vi.fn()
  render(<RefreshButton refreshing onClick={onClick} />)
  const button = screen.getByRole('button', { name: 'Actualizar' })
  expect(button.getAttribute('aria-busy')).toBe('true')
  expect(button.querySelector('svg')?.classList.contains('animate-spin')).toBe(true)
  fireEvent.click(button)
  expect(onClick).not.toHaveBeenCalled()
})

it('presenta indicador, explicación y pie sin ocultar importes largos', () => {
  render(<IndicatorCard label="Deuda" valor="$ 123.456.789" detalle="Saldo pendiente" pie="Registrá la cobranza" icono="dinero" tono="rose" />)
  expect(screen.getByText('$ 123.456.789').className).not.toContain('truncate')
  expect(screen.getByText('Saldo pendiente')).toBeTruthy()
  expect(screen.getByText('Registrá la cobranza')).toBeTruthy()
  expect(screen.getByRole('article').className).toContain('shadow-md')
})
