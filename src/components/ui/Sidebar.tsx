import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { useThemeStore } from '../../stores/themeStore'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const menuItems = [
  { path: '/',          label: 'Punto de Venta', roles: ['DUEÑO', 'CAJERO'] },
  { path: '/caja',      label: 'Caja y Arqueo',  roles: ['DUEÑO', 'CAJERO'] },
  { path: '/catalogo',  label: 'Catálogo',       roles: ['DUEÑO'] },
  { path: '/stock',     label: 'Stock',          roles: ['DUEÑO'] },
  { path: '/reportes',  label: 'Reportes',       roles: ['DUEÑO', 'VISOR'] },
  { path: '/config',    label: 'Configuración',  roles: ['DUEÑO'] },
]

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { usuario, logout } = useAuthStore()
  const { tema, toggleTema } = useThemeStore()

  const itemsVisibles = menuItems.filter(
    (item) => usuario && item.roles.includes(usuario.rol)
  )

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-full w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
          transform transition-transform duration-200 ease-in-out flex flex-col
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo / Nombre */}
        <div className="px-6 py-5 border-b border-gray-200 dark:border-gray-700">
          <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">🏪 KioskoPOS</h1>
          {usuario && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {usuario.nombre} · <span className="capitalize">{usuario.rol.toLowerCase()}</span>
            </p>
          )}
        </div>

        {/* Navegación */}
        <nav className="px-3 py-4 flex-1 overflow-y-auto">
          {itemsVisibles.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-lg mb-1
                text-base font-medium transition-colors
                ${isActive
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                }
              `}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Toggle de tema */}
        <div className="px-3 py-2 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={toggleTema}
            className="flex items-center gap-3 px-4 py-3 rounded-lg w-full
              text-base font-medium text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            {tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}
          </button>
        </div>

        {/* Cerrar sesión */}
        <div className="px-3 py-2 pb-4">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg w-full
              text-base font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
          >
            <span className="text-xl">🚪</span>
            Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  )
}
