import { NavLink } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const menuItems = [
  { path: '/',          label: 'Punto de Venta', icon: '🛒', roles: ['DUEÑO', 'CAJERO'] },
  { path: '/catalogo',  label: 'Catálogo',       icon: '📦', roles: ['DUEÑO'] },
  { path: '/stock',     label: 'Stock',          icon: '📊', roles: ['DUEÑO'] },
  { path: '/reportes',  label: 'Reportes',       icon: '📈', roles: ['DUEÑO', 'VISOR'] },
  { path: '/config',    label: 'Configuración',  icon: '⚙️', roles: ['DUEÑO'] },
]

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const { usuario, logout } = useAuthStore()

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
          fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-gray-200
          transform transition-transform duration-200 ease-in-out
          lg:translate-x-0 lg:static lg:z-auto
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo / Nombre */}
        <div className="px-6 py-5 border-b border-gray-200">
          <h1 className="text-xl font-bold text-indigo-600">🏪 KioskoPOS</h1>
          {usuario && (
            <p className="text-sm text-gray-500 mt-1">
              {usuario.nombre} · <span className="capitalize">{usuario.rol.toLowerCase()}</span>
            </p>
          )}
        </div>

        {/* Navegación */}
        <nav className="px-3 py-4 flex-1">
          {itemsVisibles.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center gap-3 px-4 py-3 rounded-lg mb-1
                text-base font-medium transition-colors
                ${isActive
                  ? 'bg-indigo-50 text-indigo-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }
              `}
            >
              <span className="text-xl">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Cerrar sesión */}
        <div className="px-3 py-4 border-t border-gray-200">
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 rounded-lg w-full
              text-base font-medium text-red-600 hover:bg-red-50 transition-colors"
          >
            <span className="text-xl">🚪</span>
            Cerrar Sesión
          </button>
        </div>
      </aside>
    </>
  )
}
