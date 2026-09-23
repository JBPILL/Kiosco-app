import { forwardRef } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', ...props }, ref) => {
    return (
      <div className="w-full">
        {label && (
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500">
              {icon}
            </div>
          )}
          <input
            ref={ref}
            className={`
              w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800
              px-3.5 py-2.5 text-sm text-gray-900 dark:text-gray-100 font-medium
              placeholder:text-gray-400 dark:placeholder:text-gray-500
              focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20
              transition-all duration-150 outline-none
              ${icon ? 'pl-10' : ''}
              ${error ? 'border-red-500 focus:border-red-500' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="mt-1 text-xs text-red-600 dark:text-red-400 font-medium">{error}</p>
        )}
      </div>
    )
  }
)

Input.displayName = 'Input'
