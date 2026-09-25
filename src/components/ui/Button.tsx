import { forwardRef } from 'react'
import type { ButtonHTMLAttributes } from 'react'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'warning' | 'teal' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  fullWidth?: boolean
  loading?: boolean
}

const variantStyles = {
  primary: 'border-2 border-indigo-500 hover:border-indigo-600 dark:border-indigo-400 bg-indigo-600 text-white hover:bg-indigo-700 active:bg-indigo-800',
  secondary: 'border-2 border-gray-300 dark:border-gray-500 bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 hover:bg-gray-200 dark:hover:bg-gray-700 hover:border-gray-400 dark:hover:border-gray-400 active:bg-gray-300 dark:active:bg-gray-600',
  danger: 'border-2 border-red-500 hover:border-red-600 dark:border-red-400 bg-red-600 text-white hover:bg-red-700 active:bg-red-800',
  success: 'border-2 border-emerald-500 hover:border-emerald-600 dark:border-emerald-400 bg-emerald-600 text-white hover:bg-emerald-700 active:bg-emerald-800',
  warning: 'border-2 border-amber-500 hover:border-amber-600 dark:border-amber-400 bg-amber-600 text-white hover:bg-amber-700 active:bg-amber-800',
  teal: 'border-2 border-teal-500 hover:border-teal-600 dark:border-teal-400 bg-teal-600 text-white hover:bg-teal-700 active:bg-teal-800',
  ghost: 'border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-600 bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 active:bg-gray-200 dark:active:bg-gray-700',
}

const sizeStyles = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-base',
  lg: 'px-6 py-3 text-lg',
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = 'primary',
      size = 'md',
      fullWidth = false,
      loading = false,
      disabled,
      className = '',
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        className={`
          inline-flex items-center justify-center gap-2
          font-medium rounded-lg transition-colors duration-150
          disabled:opacity-50 disabled:cursor-not-allowed
          ${variantStyles[variant]}
          ${sizeStyles[size]}
          ${fullWidth ? 'w-full' : ''}
          ${className}
        `}
        disabled={disabled || loading}
        {...props}
      >
        {loading && (
          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        )}
        {children}
      </button>
    )
  }
)

Button.displayName = 'Button'
