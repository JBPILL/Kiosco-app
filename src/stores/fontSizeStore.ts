import { create } from 'zustand'

export type FontSizeLevel = 'compacto' | 'normal' | 'grande' | 'extra'

export interface FontSizeOption {
  id: FontSizeLevel
  label: string
  porcentaje: string
  descripcion: string
  escalaMobile: string
  escalaDesktop: string
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  {
    id: 'compacto',
    label: 'Compacto',
    porcentaje: '90%',
    descripcion: 'Mayor densidad de datos en pantalla',
    escalaMobile: '14px',
    escalaDesktop: '14.5px',
  },
  {
    id: 'normal',
    label: 'Normal',
    porcentaje: '100%',
    descripcion: 'Tamaño estándar equilibrado',
    escalaMobile: '16px',
    escalaDesktop: '16px',
  },
  {
    id: 'grande',
    label: 'Grande',
    porcentaje: '115%',
    descripcion: 'Lectura cómoda y descanso visual',
    escalaMobile: '17.5px',
    escalaDesktop: '18.5px',
  },
  {
    id: 'extra',
    label: 'Extra Grande',
    porcentaje: '130%',
    descripcion: 'Máxima legibilidad para adultos mayores',
    escalaMobile: '19px',
    escalaDesktop: '21px',
  },
]

const ORDER: FontSizeLevel[] = ['compacto', 'normal', 'grande', 'extra']
const STORAGE_KEY = 'alpaso-pos-font-size'

function getInitialFontSize(): FontSizeLevel {
  if (typeof window === 'undefined') return 'normal'
  try {
    const saved = localStorage.getItem(STORAGE_KEY) as FontSizeLevel | null
    if (saved && ORDER.includes(saved)) {
      return saved
    }
  } catch {
    // Si localStorage no está disponible
  }
  return 'normal'
}

export function applyFontSize(level: FontSizeLevel) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.setAttribute('data-font-size', level)
  try {
    localStorage.setItem(STORAGE_KEY, level)
  } catch {
    // Silencioso
  }
}

interface FontSizeState {
  fontSize: FontSizeLevel
  setFontSize: (level: FontSizeLevel) => void
  increaseFontSize: () => void
  decreaseFontSize: () => void
  resetFontSize: () => void
}

export const useFontSizeStore = create<FontSizeState>((set) => {
  const initial = getInitialFontSize()
  applyFontSize(initial)

  return {
    fontSize: initial,
    setFontSize: (level) => {
      applyFontSize(level)
      set({ fontSize: level })
    },
    increaseFontSize: () => {
      set((state) => {
        const currentIndex = ORDER.indexOf(state.fontSize)
        if (currentIndex < ORDER.length - 1) {
          const next = ORDER[currentIndex + 1]
          applyFontSize(next)
          return { fontSize: next }
        }
        return state
      })
    },
    decreaseFontSize: () => {
      set((state) => {
        const currentIndex = ORDER.indexOf(state.fontSize)
        if (currentIndex > 0) {
          const prev = ORDER[currentIndex - 1]
          applyFontSize(prev)
          return { fontSize: prev }
        }
        return state
      })
    },
    resetFontSize: () => {
      applyFontSize('normal')
      set({ fontSize: 'normal' })
    },
  }
})
