import { create } from 'zustand'

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>
}

interface PwaState {
  puedeInstalar: boolean
  estaInstalado: boolean
  deferredPrompt: BeforeInstallPromptEvent | null
  initPwa: () => void
  instalarApp: () => Promise<boolean>
}

export const usePwaStore = create<PwaState>((set, get) => ({
  puedeInstalar: false,
  estaInstalado: false,
  deferredPrompt: null,

  initPwa: () => {
    if (typeof window === 'undefined') return

    // 1. Detectar si ya está corriendo en modo standalone (instalada)
    const isStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true ||
      document.referrer.includes('android-app://')

    if (isStandalone) {
      set({ estaInstalado: true, puedeInstalar: false })
    }

    // 2. Escuchar el evento del navegador que habilita la instalación
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      set({
        deferredPrompt: e as BeforeInstallPromptEvent,
        puedeInstalar: true,
      })
    })

    // 3. Escuchar cuando la app se instala con éxito
    window.addEventListener('appinstalled', () => {
      set({
        estaInstalado: true,
        puedeInstalar: false,
        deferredPrompt: null,
      })
    })
  },

  instalarApp: async () => {
    const prompt = get().deferredPrompt
    if (!prompt) return false

    try {
      await prompt.prompt()
      const choice = await prompt.userChoice
      if (choice.outcome === 'accepted') {
        set({ puedeInstalar: false, estaInstalado: true, deferredPrompt: null })
        return true
      }
      return false
    } catch (err) {
      console.warn('Error al solicitar instalación de PWA:', err)
      return false
    }
  },
}))
