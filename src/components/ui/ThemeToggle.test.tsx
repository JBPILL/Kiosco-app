import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'
import { useThemeStore } from '../../stores/themeStore'

describe('ThemeToggle Component (Minimalista)', () => {
  beforeEach(() => {
    // Restablecer a modo claro para consistencia
    useThemeStore.setState({ tema: 'light' })
  })

  it('renderiza como un botón minimalista sin texto', () => {
    render(<ThemeToggle />)

    const button = screen.getByRole('button', { name: /cambiar a modo oscuro/i })
    expect(button).toBeTruthy()
    // No debe contener texto plano dentro del botón
    expect(button.textContent).toBe('')
  })

  it('incluye iconos dinámicos para sol y luna', () => {
    const { container } = render(<ThemeToggle />)

    // Debe contener los 2 SVG dinámicos (sol y luna)
    const svgs = container.querySelectorAll('svg')
    expect(svgs.length).toBe(2)
  })

  it('alterna dinámicamente entre sol y luna sin texto al hacer click', () => {
    render(<ThemeToggle />)

    const button = screen.getByRole('button')
    expect(button.getAttribute('aria-label')).toBe('Cambiar a Modo Oscuro')
    expect(button.getAttribute('title')).toBe('Cambiar a Modo Oscuro')

    // Alternar a modo oscuro
    fireEvent.click(button)
    expect(button.getAttribute('aria-label')).toBe('Cambiar a Modo Claro')
    expect(button.getAttribute('title')).toBe('Cambiar a Modo Claro')
    expect(button.textContent).toBe('')

    // Alternar de regreso a modo claro
    fireEvent.click(button)
    expect(button.getAttribute('aria-label')).toBe('Cambiar a Modo Oscuro')
    expect(button.getAttribute('title')).toBe('Cambiar a Modo Oscuro')
    expect(button.textContent).toBe('')
  })
})
