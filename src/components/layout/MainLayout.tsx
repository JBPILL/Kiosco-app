import { useState } from 'react'
import { Outlet, NavLink } from 'react-router-dom'
import { Sidebar } from '../ui/Sidebar'
import { useAuthStore } from '../../stores/authStore'

export function MainLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { usuario, kiosco, suscripcion, diasRestantes, logout } = useAuthStore()

  // Bloqueo total de pantalla si el kiosco está suspendido (excepto para superadmin)
  if (!usuario?.es_superadmin && kiosco?.estado_suscripcion === 'SUSPENDIDO') {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-gray-800 border border-gray-700 rounded-2xl p-8 text-center shadow-xl space-y-5">
          <div className="w-12 h-12 bg-red-900/40 border border-red-700/60 rounded-2xl mx-auto flex items-center justify-center text-red-400 font-bold text-xl">
            !
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Servicio Suspendido</h2>
            <p className="text-sm text-gray-300 mt-2 leading-relaxed">
              El acceso para <strong>{kiosco.nombre}</strong> se encuentra pausado por período de suscripción vencido.
            </p>
            <p className="text-xs text-gray-400 mt-2">
              Comunicate con el administrador para regularizar el abono mensual y reactivar tu sistema al instante.
            </p>
          </div>

          <div className="pt-2 space-y-2.5">
            <a
              href="https://wa.me/5491100000000?text=Hola,%20quisiera%20reactivar%20mi%20suscripci%C3%B3n%20en%20KioskoPOS."
              target="_blank"
              rel="noopener noreferrer"
              className="block w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 font-semibold text-sm transition-colors text-white text-center shadow-md"
            >
              Contactar por WhatsApp
            </a>
            <button
              onClick={logout}
              className="block w-full py-2.5 rounded-xl bg-gray-700 hover:bg-gray-600 font-medium text-xs text-gray-300 transition-colors"
            >
              Cerrar Sesión
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full flex overflow-hidden">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      {/* Contenido principal */}
      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
        {/* Header mobile adaptado a la Dynamic Island / notch de iPhone */}
        <header className="lg:hidden flex items-center justify-between px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex-shrink-0 z-20">
          <div className="flex items-center gap-2.5">
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
          </div>

          {/* Accesos rápidos visibles en la barra superior móvil */}
          <div className="flex items-center gap-1.5">
            {usuario?.es_superadmin && (
              <NavLink
                to="/admin"
                className={({ isActive }) =>
                  `px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200'
                  }`
                }
              >
                Admin
              </NavLink>
            )}
            <NavLink
              to="/clientes"
              className={({ isActive }) =>
                `px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`
              }
            >
              Clientes
            </NavLink>
            <NavLink
              to="/caja"
              className={({ isActive }) =>
                `px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                }`
              }
            >
              Caja
            </NavLink>
          </div>
        </header>

        {/* Banner de Aviso o Alerta de Vencimiento de Suscripción */}
        {!usuario?.es_superadmin && (
          <>
            {kiosco?.estado_suscripcion === 'SOLO_LECTURA' ||
            (diasRestantes !== null && diasRestantes < 0) ? (
              <div className="bg-red-600 text-white px-4 py-2.5 text-xs sm:text-sm font-medium flex items-center justify-between shadow-xs z-10">
                <div className="flex items-center gap-2">
                  <span className="font-bold uppercase tracking-wider px-1.5 py-0.5 bg-red-800 rounded text-[10px]">
                    Solo Lectura
                  </span>
                  <span>
                    Tu suscripción está vencida. Podés consultar stock y reportes, pero las ventas están pausadas hasta regularizar el pago.
                  </span>
                </div>
              </div>
            ) : diasRestantes !== null && diasRestantes >= 0 && diasRestantes <= 5 ? (
              <div className="bg-amber-500 text-gray-950 px-4 py-2 text-xs sm:text-sm font-medium flex items-center justify-between shadow-xs z-10">
                <div className="flex items-center gap-2">
                  <span className="font-bold uppercase tracking-wider px-1.5 py-0.5 bg-amber-700 text-white rounded text-[10px]">
                    Aviso
                  </span>
                  <span>
                    {diasRestantes === 0
                      ? 'Tu suscripción mensual vence hoy. Recordá renovar tu abono para no interrumpir las ventas.'
                      : `Tu suscripción mensual vence en ${diasRestantes} día${diasRestantes > 1 ? 's' : ''} (${suscripcion?.fecha_vencimiento || ''}). Recordá renovar tu abono.`}
                  </span>
                </div>
              </div>
            ) : null}
          </>
        )}

        {/* Área de contenido con scroll suave y padding inferior para no tapar la bottom bar */}
        <main className="flex-1 overflow-y-auto p-3 sm:p-4 lg:p-6 bg-gray-50 dark:bg-gray-900 pb-[max(80px,calc(64px+env(safe-area-inset-bottom)))] lg:pb-[max(16px,env(safe-area-inset-bottom))]">
          <Outlet />
        </main>

        {/* Barra de Navegación Inferior para Celulares (Bottom Nav Bar) */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 z-20 pb-[env(safe-area-inset-bottom)] shadow-lg">
          <div className="grid grid-cols-4 h-14 max-w-md mx-auto">
            <NavLink
              to="/"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`
              }
            >
              <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Ventas</span>
            </NavLink>

            <NavLink
              to="/caja"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`
              }
            >
              <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 9V7a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2m2 4h10a2 2 0 002-2v-6a2 2 0 00-2-2H9a2 2 0 00-2 2v6a2 2 0 002 2zm7-5a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Caja</span>
            </NavLink>

            <NavLink
              to="/clientes"
              className={({ isActive }) =>
                `flex flex-col items-center justify-center text-[11px] font-medium transition-colors ${
                  isActive
                    ? 'text-indigo-600 dark:text-indigo-400 font-bold'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200'
                }`
              }
            >
              <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span>Clientes</span>
            </NavLink>

            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="flex flex-col items-center justify-center text-[11px] font-medium text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-5 h-5 mb-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
              <span>Menú</span>
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}
