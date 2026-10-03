import type { SVGProps } from 'react'

/**
 * Ícono estándar para acciones de Exportar (bandeja con flecha saliente hacia arriba)
 */
export function IconExportar({
  className = 'w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0',
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" y1="3" x2="12" y2="15" />
    </svg>
  )
}

/**
 * Ícono estándar para acciones de Importar (bandeja con flecha entrante hacia abajo)
 */
export function IconImportar({
  className = 'w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0',
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  )
}
