import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ThemeToggle } from './ThemeToggle'
import { useThemeStore } from '../../stores/themeStore'

describe('ThemeToggle Component', () => {
  beforeEach(() => {
    // Restablecer a modo claro para consistencia
    useThemeStore.setState({ tema: 'light' })
  })

  it('renderiza correctamente en variante desktop y muestra "Modo Claro"', () => {
    render(<ThemeToggle variant="desktop" />)

    const button = screen.getByRole('button', { name: /cambiar a modo oscuro/i })
    expect(button).toBeTruthy()
    expect(screen.getByText('Modo Claro')).toBeTruthy()
  })

  it('renderiza correctamente en variante mobile', () => {
    render(<ThemeToggle variant="mobile" />)

    const button = screen.getByRole('button', { name: /cambiar a modo oscuro/i })
    expect(button).toBeTruthy()
    expect(screen.getByText('Claro')).toBeTruthy()
  })

  it('alterna dinámicamente entre modo claro y oscuro al hacer click', () => {
    render(<ThemeToggle variant="desktop" />)

    const button = screen.getByRole('button')
    expect(screen.getByText('Modo Claro')).toBeTruthy()

    // Alternar a modo oscuro
    fireEvent.click(button)
    expect(screen.getByText('Modo Oscuro')).toBeTruthy()
    expect(screen.getByRole('button', { name: /cambiar a modo claro/i })).toBeTruthy()

    // Alternar de regreso a modo claro
    fireEvent.click(button)
    expect(screen.getByText('Modo Claro')).toBeTruthy()
    expect(screen.getByRole('button', { name: /cambiar a modo oscuro/i })).toBeTruthy()
  })
})
