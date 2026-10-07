import type { ReactNode } from 'react'

interface Props { titulo: string; children: ReactNode }
export function ModalGuide({ titulo, children }: Props) {
  return <div className="flex items-start gap-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50 dark:bg-indigo-950/30 p-4 shadow-sm">
    <span className="shrink-0 rounded-xl bg-white dark:bg-gray-800 p-2 text-indigo-500 shadow-sm"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18ZM12 7h.01M12 11v6" /></svg></span>
    <div className="min-w-0"><p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">{titulo}</p><div className="mt-1 text-xs leading-relaxed text-indigo-700 dark:text-indigo-300">{children}</div></div>
  </div>
}
