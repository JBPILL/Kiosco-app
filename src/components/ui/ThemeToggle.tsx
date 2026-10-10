import React from 'react'
import { useThemeStore } from '../../stores/themeStore'

interface ThemeToggleProps {
  size?: 'sm' | 'md'
  className?: string
}

/**
 * Botón minimalista para alternar entre Modo Claro y Modo Oscuro:
 * - Diseño compacto tipo squircle idéntico al botón del Punto de Venta.
 * - Iconos dinámicos de Sol ☀️ y Luna 🌙 con transición suave de rotación y escala.
 * - Sin texto, completamente limpio y minimalista.
 * - Accesible con título y aria-label dinámicos según el estado.
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  size = 'sm',
  className = '',
}) => {
  const { tema, toggleTema } = useThemeStore()
  const esOscuro = tema === 'dark'

  const dimensiones = size === 'md' ? 'h-8 w-8 rounded-xl' : 'h-7 w-7 rounded-lg sm:rounded-xl'
  const iconSize = size === 'md' ? 'w-4.5 h-4.5' : 'w-4 h-4'

  return (
    <button
      type="button"
      onClick={toggleTema}
      title={esOscuro ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
      aria-label={esOscuro ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
      className={`
        group relative inline-flex items-center justify-center shrink-0
        ${dimensiones}
        border border-gray-200 dark:border-gray-700
        bg-white dark:bg-gray-800
        hover:bg-gray-50 dark:hover:bg-gray-700/60
        hover:border-amber-300 dark:hover:border-indigo-500
        shadow-xs
        transition-all duration-200 cursor-pointer select-none
        active:scale-90 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40
        ${className}
      `}
    >
      <span className={`relative ${iconSize} flex items-center justify-center`}>
        {/* Sol dinámico (visible en modo claro) */}
        <svg
          className={`
            ${iconSize} text-amber-500 absolute inset-0 transition-all duration-300 ease-out
            ${
              esOscuro
                ? 'rotate-90 scale-0 opacity-0 pointer-events-none'
                : 'rotate-0 scale-100 opacity-100 group-hover:rotate-45'
            }
          `}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5l1.5 1.5M5 19l1.5-1.5M17.5 6.5l1.5-1.5" />
        </svg>

        {/* Luna dinámica (visible en modo oscuro) */}
        <svg
          className={`
            ${iconSize} text-indigo-400 absolute inset-0 transition-all duration-300 ease-out
            ${
              esOscuro
                ? 'rotate-0 scale-100 opacity-100 group-hover:-rotate-12'
                : '-rotate-90 scale-0 opacity-0 pointer-events-none'
            }
          `}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      </span>
    </button>
  )
}

export default ThemeToggle
