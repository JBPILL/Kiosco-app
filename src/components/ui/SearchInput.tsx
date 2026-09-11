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
        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>
        <input
          ref={ref}
          type="text"
          value={value}
          className={`
            w-full rounded-xl border-2 border-gray-200 bg-white
            pl-10 pr-10 py-3 text-lg
            placeholder:text-gray-400
            focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200
            transition-colors duration-150
            ${className}
          `}
          {...props}
        />
        {/* Botón limpiar */}
        {value && String(value).length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        )}
      </div>
    )
  }
)

SearchInput.displayName = 'SearchInput'
