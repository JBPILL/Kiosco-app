import { useEffect, useRef, useMemo, useState } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../stores/authStore'
import { usePwaStore } from '../../stores/pwaStore'
import { KeyboardShortcutsModal } from '../pos/KeyboardShortcutsModal'
import { AlPasoLogo } from './AlPasoLogo'
import { esCampoEditable, ignorarAtajoGlobal } from '../../lib/keyboardShortcuts'

interface SidebarProps {
  isOpen: boolean
  onClose: () => void
}

const menuItems = [
  { path: '/',          label: 'Punto de Venta', roles: ['DUEÑO', 'CAJERO'] },
  { path: '/caja',      label: 'Caja y Turno',   roles: ['DUEÑO', 'CAJERO'] },
  { path: '/clientes',  label: 'Clientes',       roles: ['DUEÑO', 'CAJERO'] },
  { path: '/electronica', label: 'Electrónica y reparaciones', roles: ['DUEÑO'] },
  { path: '/catalogo',  label: 'Catálogo',       roles: ['DUEÑO'] },
  { path: '/promociones', label: 'Promociones',  roles: ['DUEÑO'] },
  { path: '/stock',     label: 'Stock',          roles: ['DUEÑO'] },
  { path: '/proveedores', label: 'Proveedores',  roles: ['DUEÑO'] },
  { path: '/reportes',  label: 'Reportes',       roles: ['DUEÑO', 'VISOR'] },
]

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { usuario, kiosco, logout } = useAuthStore()
  const { puedeInstalar, estaInstalado, instalarApp } = usePwaStore()
  const [modalShortcutsOpen, setModalShortcutsOpen] = useState(false)
  const itemRefs = useRef<(HTMLAnchorElement | null)[]>([])

  const itemsVisibles = useMemo(() => {
    if (!usuario) return []
    // Si es superadmin sin kiosco, su menú es 100% administrativo
    if (usuario.es_superadmin && !usuario.kiosco_id) {
      return [
        { path: '/admin', label: 'Panel Super-Admin', roles: ['DUEÑO', 'CAJERO', 'VISOR'], esAdmin: true },
      ]
    }
    const items = menuItems.filter((item) => item.roles.includes(usuario.rol)
      && (item.path !== '/electronica' || (kiosco?.rubro === 'ELECTRONICA_CELULARES' && kiosco.id === usuario.kiosco_id)))
    if (usuario.es_superadmin) {
      return [
        { path: '/admin', label: 'Panel Super-Admin', roles: ['DUEÑO', 'CAJERO', 'VISOR'], esAdmin: true },
        ...items,
      ]
    }
    return items
  }, [usuario, kiosco])

  // Enfocar el elemento principal de la pantalla activa (ej: buscador de POS)
  const focusMainScreen = () => {
    // 1. Buscar input de búsqueda principal
    const input = document.querySelector<HTMLInputElement>(
      'main input[type="text"], main input[type="search"], main input:not([type="hidden"])'
    )
    if (input) {
      input.focus()
      input.select?.()
      return
    }

    // 2. Si no hay input, buscar el primer botón o enlace interactivo
    const btn = document.querySelector<HTMLElement>(
      'main button:not([disabled]), main a:not([disabled])'
    )
    if (btn) {
      btn.focus()
      return
    }

    // 3. Fallback: evento global para el buscador del POS
    window.dispatchEvent(new CustomEvent('pos-focus-search'))
  }

  // Manejo de flechitas y Tab dentro del menú de navegación
  const handleItemKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const nextIndex = (index + 1) % itemsVisibles.length
      itemRefs.current[nextIndex]?.focus()
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const prevIndex = (index - 1 + itemsVisibles.length) % itemsVisibles.length
      itemRefs.current[prevIndex]?.focus()
    } else if (e.key === 'ArrowRight') {
      // Flecha derecha: pasar directamente a la pantalla principal
      e.preventDefault()
      focusMainScreen()
    } else if (e.key === 'Tab' && !e.shiftKey) {
      // Si estamos en la última opción del menú y presiona Tab, pasar a la pantalla principal
      if (index === itemsVisibles.length - 1) {
        e.preventDefault()
        focusMainScreen()
      }
    } else if (e.key === 'Home') {
      e.preventDefault()
      itemRefs.current[0]?.focus()
    } else if (e.key === 'End') {
      e.preventDefault()
      itemRefs.current[itemsVisibles.length - 1]?.focus()
    }
  }

  // Atajos globales: Alt+M o F10 para enfocar menú, y Alt+1..7 para navegación directa
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (ignorarAtajoGlobal(e)) return
      // F1: Abrir modal de atajos de teclado
      if (e.key === 'F1' && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        e.preventDefault()
        setModalShortcutsOpen(true)
        return
      }

      if (esCampoEditable(e.target)) return
      // Alt + M o F10: Enfocar el menú lateral
      if (!e.shiftKey && !e.ctrlKey && ((e.altKey && e.key.toLowerCase() === 'm') || (!e.altKey && e.key === 'F10'))) {
        e.preventDefault()
        const activeIdx = itemsVisibles.findIndex((item) => item.path === location.pathname)
        const targetIdx = activeIdx >= 0 ? activeIdx : 0
        itemRefs.current[targetIdx]?.focus()
        return
      }

      // Alt + 1 ... Alt + 7: Navegación rápida directa a pantallas
      if (e.altKey && !e.ctrlKey && !e.shiftKey) {
        const num = parseInt(e.key, 10)
        if (!isNaN(num) && num >= 1 && num <= itemsVisibles.length) {
          e.preventDefault()
          navigate(itemsVisibles[num - 1].path)
          onClose()
        }
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [itemsVisibles, location.pathname, navigate, onClose])

  return (
    <>
      {/* Overlay mobile */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-xs transition-opacity"
          onClick={onClose}
        />
      )}

      {/* Sidebar con soporte para Dynamic Island y Home Indicator de iOS */}
      <aside
        className={`
          fixed top-0 left-0 z-50 h-dvh max-h-dvh w-72 max-w-[85vw] bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700
          transform transition-transform duration-200 ease-in-out flex flex-col overflow-hidden
          lg:translate-x-0 lg:static lg:z-auto lg:h-full lg:max-h-none lg:w-56 xl:w-64 shadow-2xl lg:shadow-xs
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        {/* Logo / Encabezado */}
        <div className="px-4 pt-[max(12px,env(safe-area-inset-top))] pb-3 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center justify-between">
            <AlPasoLogo size="sm" />
            <button
              onClick={onClose}
              className="lg:hidden p-1.5 -mr-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 text-lg"
              aria-label="Cerrar menú"
            >
              ✕
            </button>
          </div>
          {usuario && (
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 truncate">
              {usuario.nombre} ·{' '}
              <span className="capitalize font-semibold text-indigo-600 dark:text-indigo-400">
                {usuario.es_superadmin && !usuario.kiosco_id ? 'Super-Admin' : usuario.rol.toLowerCase()}
              </span>
            </p>
          )}
        </div>

        {/* Navegación con soporte para flechitas de teclado */}
        <nav className="px-2 py-2 flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-0.5" role="menu" aria-label="Menú principal">
          {itemsVisibles.map((item, index) => (
            <NavLink
              key={item.path}
              ref={(el) => { itemRefs.current[index] = el }}
              to={item.path}
              onClick={onClose}
              onKeyDown={(e) => handleItemKeyDown(e, index)}
              className={({ isActive }) => `
                flex items-center justify-between px-3 py-2 rounded-lg min-h-[36px]
                text-sm font-medium transition-all
                focus:outline-hidden focus:bg-indigo-100/80 dark:focus:bg-gray-700 focus:text-indigo-900 dark:focus:text-white
                ${isActive
                  ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-semibold'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                }
              `}
            >
              <span className="truncate">{item.label}</span>
              <kbd className="hidden lg:inline-block flex-shrink-0 ml-1 px-1 py-0.5 rounded text-[9px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600">
                Alt+{index + 1}
              </kbd>
            </NavLink>
          ))}
        </nav>

        {/* Acciones del Sistema: Configuración, Atajos [F1] y Soporte (solo para comercios, oculto en modo Super-Admin) */}
        {!(usuario?.es_superadmin && !usuario.kiosco_id) && (
          <div className="px-2 py-1.5 border-t border-gray-200 dark:border-gray-700 flex-shrink-0 space-y-0.5">
            {usuario?.rol === 'DUEÑO' && (
              <NavLink
                to="/config"
                onClick={onClose}
                className={({ isActive }) => `
                  flex items-center justify-between px-3 py-2 rounded-lg w-full text-sm font-medium transition-colors
                  ${
                    isActive
                      ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-semibold'
                      : 'text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100'
                  }
                `}
              >
                <span>Configuración</span>
              </NavLink>
            )}

            <button
              type="button"
              onClick={() => {
                setModalShortcutsOpen(true)
                onClose()
              }}
              className="flex items-center justify-between px-3 py-2 rounded-lg w-full text-xs font-semibold text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700 hover:text-gray-900 dark:hover:text-gray-100 transition-colors cursor-pointer"
              title="Ver atajos de teclado [F1]"
            >
              <span>Atajos [F1]</span>
              <kbd className="px-1 py-0.5 rounded text-[9px] font-mono text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-gray-700/60 border border-gray-200 dark:border-gray-600">
                F1
              </kbd>
            </button>

            <NavLink
              to="/soporte"
              onClick={onClose}
              className={({ isActive }) => `
                flex items-center px-3 py-2 rounded-lg w-full text-xs font-semibold transition-colors
                ${
                  isActive
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300'
                    : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30'
                }
              `}
            >
              Soporte y Ayuda
            </NavLink>
          </div>
        )}

        {/* Botón para instalar PWA de escritorio en la computadora */}
        {puedeInstalar && !estaInstalado && (
          <div className="px-2 py-1 border-t border-gray-100 dark:border-gray-700/50 flex-shrink-0">
            <button
              onClick={() => {
                instalarApp()
                onClose()
              }}
              className="flex items-center justify-between px-3 py-2 rounded-lg w-full text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:scale-98 text-white shadow-xs transition-all"
            >
              <span>Instalar en Escritorio</span>
              <span className="text-[10px] bg-indigo-800/80 px-1.5 py-0.5 rounded font-mono">APP</span>
            </button>
          </div>
        )}

        {/* Cerrar sesión */}
        <div className="px-2 pt-1 pb-[max(8px,env(safe-area-inset-bottom))] border-t border-gray-100 dark:border-gray-700/50 flex-shrink-0">
          <button
            onClick={logout}
            onKeyDown={(e) => {
              if (e.key === 'Tab' && !e.shiftKey) {
                e.preventDefault()
                focusMainScreen()
              }
            }}
            className="flex items-center px-3 py-2 rounded-lg w-full
              text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 focus:outline-hidden focus:bg-red-100/70 dark:focus:bg-red-950/40 transition-colors"
          >
            Cerrar Sesión
          </button>
        </div>
      </aside>

      {/* Modal global de Atajos de Teclado */}
      <KeyboardShortcutsModal
        isOpen={modalShortcutsOpen}
        onClose={() => setModalShortcutsOpen(false)}
      />
    </>
  )
}
