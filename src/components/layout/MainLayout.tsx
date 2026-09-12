import { useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from '../ui/Sidebar'

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Header mobile adaptado a la Dynamic Island / notch de iPhone */}
        <header className="lg:hidden flex items-center gap-3 px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 z-20">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-200 active:scale-95 transition-transform"
            aria-label="Abrir menú"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <h1 className="text-lg font-bold text-indigo-600 dark:text-indigo-400 tracking-tight">KioskoPOS</h1>
        </header>

        {/* Área de contenido con scroll suave y safe-area bottom */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 bg-gray-50 dark:bg-gray-900 pb-[max(16px,env(safe-area-inset-bottom))]">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
