import React from 'react'
import { useThemeStore } from '../../stores/themeStore'

interface ThemeToggleProps {
  variant?: 'desktop' | 'mobile'
  className?: string
}

/**
 * Botón dinámico y visible para alternar entre Modo Claro y Modo Oscuro.
 * - En Desktop: se ubica al lado del texto "Buscá, agregá y cobrá desde un solo lugar" en el POS.
 * - En Celular: se ubica al lado del nombre del sistema ("AlPaso POS") en la barra superior móvil.
 * Cuenta con animación suave (GPU View Transitions API), icono giratorio e indicador de switch.
 */
export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  variant = 'desktop',
  className = '',
}) => {
  const { tema, toggleTema } = useThemeStore()
  const esOscuro = tema === 'dark'

  return (
    <button
      type="button"
      onClick={toggleTema}
      title={esOscuro ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
      aria-label={esOscuro ? 'Cambiar a Modo Claro' : 'Cambiar a Modo Oscuro'}
      className={`
        group relative inline-flex items-center transition-all duration-200 cursor-pointer select-none
        active:scale-95 focus:outline-hidden focus:ring-2 focus:ring-indigo-500/40
        ${
          esOscuro
            ? 'bg-slate-800/90 hover:bg-slate-700/90 text-indigo-300 border-slate-700/90 shadow-2xs shadow-indigo-950/30'
            : 'bg-amber-50 hover:bg-amber-100/90 text-amber-900 border-amber-200/90 shadow-2xs shadow-amber-500/10'
        }
        border
        ${
          variant === 'mobile'
            ? 'px-2 py-1 gap-1.5 rounded-full'
            : 'px-2.5 py-0.5 gap-2 rounded-full'
        }
        ${className}
      `}
    >
      {/* Icono animado: Sol o Luna */}
      <span className="relative flex items-center justify-center shrink-0">
        {esOscuro ? (
          <svg
            className="w-3.5 h-3.5 text-indigo-400 transition-transform duration-300 group-hover:-rotate-12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 13A9 9 0 0 1 11 3 9 9 0 1 0 21 13Z" />
          </svg>
        ) : (
          <svg
            className="w-3.5 h-3.5 text-amber-500 transition-transform duration-300 group-hover:rotate-45"
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
        )}
      </span>

      {/* Texto descriptivo del modo actual */}
      {variant === 'desktop' ? (
        <span className="text-[11px] font-semibold tracking-tight text-gray-700 dark:text-gray-200 whitespace-nowrap">
          {esOscuro ? 'Modo Oscuro' : 'Modo Claro'}
        </span>
      ) : (
        <span className="hidden min-[400px]:inline text-[10px] font-bold tracking-tight text-amber-900 dark:text-indigo-200 whitespace-nowrap">
          {esOscuro ? 'Oscuro' : 'Claro'}
        </span>
      )}

      {/* Cápsula interactiva tipo toggle switch con thumb deslizante */}
      <span
        aria-hidden="true"
        className={`
          relative flex items-center w-6 h-3.5 rounded-full p-0.5 transition-colors duration-200 shrink-0
          ${esOscuro ? 'bg-indigo-900/90' : 'bg-amber-200/90'}
        `}
      >
        <span
          className={`
            w-2.5 h-2.5 rounded-full shadow-2xs transition-transform duration-200 ease-out
            ${esOscuro ? 'translate-x-2.5 bg-indigo-300' : 'translate-x-0 bg-white'}
          `}
        />
      </span>
    </button>
  )
}

export default ThemeToggle
