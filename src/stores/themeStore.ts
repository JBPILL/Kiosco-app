import { create } from 'zustand'

type Theme = 'light' | 'dark'

interface ThemeState {
  tema: Theme
  toggleTema: () => void
  setTema: (tema: Theme) => void
}

// Leer preferencia guardada o del sistema
function getInitialTheme(): Theme {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem('kioskopos-theme') as Theme | null
  if (saved === 'dark' || saved === 'light') return saved
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

function applyThemeDirect(tema: Theme) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  if (tema === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  localStorage.setItem('kioskopos-theme', tema)
}

/**
 * Aplica el cambio de tema de forma fluida utilizando View Transitions API
 * (GPU-accelerated snapshot crossfade en Chrome, Edge y navegadores modernos)
 * con fallback a CSS transition de clase temporal para evitar freeze del main thread.
 */
function cambiarTemaConTransicion(tema: Theme, onActualizarEstado: () => void) {
  if (typeof document === 'undefined') {
    applyThemeDirect(tema)
    onActualizarEstado()
    return
  }

  const root = document.documentElement
  const doc = document as unknown as { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }

  // 1. Si el navegador soporta View Transitions (Chrome 111+, Edge, Safari 18+),
  // se ejecuta una transición nativa acelerada por GPU de 60/120 fps.
  if (typeof doc.startViewTransition === 'function' && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    doc.startViewTransition(() => {
      applyThemeDirect(tema)
      onActualizarEstado()
    })
    return
  }

  // 2. Fallback: activar clase temporal 'theme-transition' durante la animación
  // y retirarla al terminar para no sobrecargar el árbol DOM de forma permanente.
  root.classList.add('theme-transition')
  applyThemeDirect(tema)
  onActualizarEstado()
  window.setTimeout(() => {
    root.classList.remove('theme-transition')
  }, 350)
}

export const useThemeStore = create<ThemeState>((set, get) => {
  // Aplicar tema inicial de inmediato sin animación
  const initial = getInitialTheme()
  applyThemeDirect(initial)

  return {
    tema: initial,
    toggleTema: () => {
      const nuevo: Theme = get().tema === 'light' ? 'dark' : 'light'
      cambiarTemaConTransicion(nuevo, () => {
        set({ tema: nuevo })
      })
    },
    setTema: (tema: Theme) => {
      if (get().tema === tema) return
      cambiarTemaConTransicion(tema, () => {
        set({ tema })
      })
    },
  }
})
