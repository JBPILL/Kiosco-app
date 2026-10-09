import type { ReactNode } from 'react'

type Icono = 'usuarios' | 'dinero' | 'alerta' | 'caja' | 'check' | 'oferta' | 'porcentaje' | 'capas' | 'rotacion'
const paths: Record<Icono, string> = {
  usuarios: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-4',
  dinero: 'M12 2v20M17 5H9a4 4 0 0 0 0 8h6a3 3 0 0 1 0 6H6',
  alerta: 'M12 3 2 21h20L12 3ZM12 9v5M12 17h.01',
  caja: 'M3 7 12 2l9 5v10l-9 5-9-5V7Zm0 0 9 5 9-5M12 12v10',
  check: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6L12 2ZM8 12l3 3 5-6',
  oferta: 'M3 3h9l9 9-9 9-9-9V3ZM7 7h.01',
  porcentaje: 'M19 5 5 19M7 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 13a4 4 0 1 0 0 8 4 4 0 0 0 0-8',
  capas: 'M12 2 2 7l10 5 10-5-10-5ZM2 12l10 5 10-5M2 17l10 5 10-5',
  rotacion: 'M3 17l6-6 4 4 8-10M15 5h6v6',
}
const tonos = {
  indigo: 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30',
  emerald: 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30',
  rose: 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/30',
  amber: 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30',
  purple: 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-900/30',
  teal: 'text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30',
}

interface IndicatorCardProps {
  label: string
  valor: ReactNode
  detalle: ReactNode
  icono: Icono
  tono?: keyof typeof tonos
  pie?: ReactNode
}

export function IndicatorCard({ label, valor, detalle, icono, tono = 'indigo', pie }: IndicatorCardProps) {
  const valorTexto = typeof valor === 'string' ? valor.trim() : typeof valor === 'number' ? String(valor) : ''
  const largo = valorTexto.length

  const tamanoValor = largo >= 12
    ? 'text-lg sm:text-xl xl:text-lg 2xl:text-xl'
    : largo >= 8
      ? 'text-xl sm:text-2xl xl:text-[1.35rem] 2xl:text-2xl'
      : 'text-2xl sm:text-3xl xl:text-2xl 2xl:text-3xl'

  return <article className="min-w-0 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 sm:p-5 xl:p-4 2xl:p-5 shadow-md dark:shadow-black/20 flex flex-col justify-between">
    <div className="flex items-start justify-between gap-2">
      <p className="text-xs font-bold uppercase tracking-wide text-gray-500 dark:text-gray-400 leading-relaxed truncate" title={label}>
        {label}
      </p>
      <span className={`shrink-0 rounded-xl p-2 ${tonos[tono]}`}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d={paths[icono]} />
        </svg>
      </span>
    </div>
    <p
      className={`mt-3 ${tamanoValor} font-extrabold tracking-tight tabular-nums text-gray-900 dark:text-gray-100 whitespace-nowrap select-all`}
      title={valorTexto || undefined}
    >
      {valor}
    </p>
    <p className="mt-2 text-xs leading-relaxed text-gray-500 dark:text-gray-400">{detalle}</p>
    {pie && <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700 text-[11px] text-gray-500 dark:text-gray-400">{pie}</div>}
  </article>
}
