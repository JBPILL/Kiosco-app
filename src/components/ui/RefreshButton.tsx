import type { ButtonHTMLAttributes } from 'react'

interface RefreshButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  refreshing?: boolean
  label?: string
}

export function RefreshButton({ refreshing = false, label = 'Actualizar', disabled, className = '', ...props }: RefreshButtonProps) {
  return <button {...props} type="button" title={label} aria-label={label} aria-busy={refreshing}
    disabled={disabled || refreshing}
    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 shadow-sm transition-colors hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-indigo-600 dark:hover:text-indigo-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 disabled:cursor-wait disabled:opacity-60 ${className}`}>
    <svg className={`h-4 w-4 ${refreshing ? 'animate-spin motion-reduce:animate-none text-indigo-500' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 3v6h-6M3 21v-6h6M3 10a9 9 0 0 1 15-5l3 4M21 14a9 9 0 0 1-15 5l-3-4" /></svg>
  </button>
}
