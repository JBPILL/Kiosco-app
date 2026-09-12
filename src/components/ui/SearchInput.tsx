import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

interface SearchInputProps extends InputHTMLAttributes<HTMLInputElement> {
  onClear?: () => void
}

export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
  ({ onClear, value, className = '', ...props }, ref) => {
    return (
      <div className="relative w-full">
        {/* Icono de búsqueda */}
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 pointer-events-none">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          ref={ref}
          type="text"
          value={value}
          className={`
            w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800
            pl-9 pr-8 py-2 text-sm text-gray-900 dark:text-gray-100
            placeholder:text-gray-400 dark:placeholder:text-gray-500
            focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 dark:focus:ring-indigo-400
            transition-colors
            ${className}
          `}
          {...props}
        />
        {/* Botón limpiar */}
        {value && String(value).length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-0.5"
            aria-label="Limpiar búsqueda"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    )
  }
)

SearchInput.displayName = 'SearchInput'
