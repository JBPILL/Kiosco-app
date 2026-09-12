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

function applyTheme(tema: Theme) {
  const root = document.documentElement
  if (tema === 'dark') {
    root.classList.add('dark')
  } else {
    root.classList.remove('dark')
  }
  localStorage.setItem('kioskopos-theme', tema)
}

export const useThemeStore = create<ThemeState>((set) => {
  // Aplicar tema inicial
  const initial = getInitialTheme()
  applyTheme(initial)

  return {
    tema: initial,
    toggleTema: () =>
      set((state) => {
        const nuevo: Theme = state.tema === 'light' ? 'dark' : 'light'
        applyTheme(nuevo)
        return { tema: nuevo }
      }),
    setTema: (tema: Theme) => {
      applyTheme(tema)
      set({ tema })
    },
  }
})
