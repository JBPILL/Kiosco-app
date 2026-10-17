import { forwardRef, useState } from 'react'
import type { InputHTMLAttributes } from 'react'

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
  icon?: React.ReactNode
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, className = '', onFocus, onBlur, onChange, ...props }, ref) => {
    const [ocultarCero, setOcultarCero] = useState(false)
    const esCero = props.value === 0 || props.value === '0'
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
            value={ocultarCero && esCero ? '' : props.value}
            placeholder={ocultarCero && esCero ? undefined : props.placeholder}
            onFocus={event => {
              // Keep the model intact; only hide an optional, valid numeric zero.
              setOcultarCero(props.type === 'number' && esCero && !!onChange
                && !props.required && !props.readOnly && !props.disabled && event.currentTarget.validity.valid)
              onFocus?.(event)
            }}
            onChange={event => {
              setOcultarCero(false)
              onChange?.(event)
            }}
            onBlur={event => {
              if (ocultarCero && esCero) event.currentTarget.value = String(props.value)
              setOcultarCero(false)
              onBlur?.(event)
            }}
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
