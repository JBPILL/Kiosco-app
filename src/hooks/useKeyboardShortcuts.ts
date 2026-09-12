import { useEffect } from 'react'

interface KeyboardShortcutsHandlers {
  onFocusSearch?: () => void
  onCobrar?: () => void
  onVentasEnEspera?: () => void
  onOpenScanner?: () => void
  onOpenHelp?: () => void
  onEscape?: () => void
}

/**
 * Atajos de teclado para Punto de Venta (POS) en PC de escritorio
 */
export function useKeyboardShortcuts(
  handlers: KeyboardShortcutsHandlers,
  enabled: boolean = true
) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // F1: Ayuda de atajos
      if (e.key === 'F1') {
        e.preventDefault()
        handlers.onOpenHelp?.()
        return
      }

      // F2: Enfocar barra de búsqueda
      if (e.key === 'F2') {
        e.preventDefault()
        handlers.onFocusSearch?.()
        return
      }

      // F4: Abrir Cobro
      if (e.key === 'F4') {
        e.preventDefault()
        handlers.onCobrar?.()
        return
      }

      // F8: Ventas en espera
      if (e.key === 'F8') {
        e.preventDefault()
        handlers.onVentasEnEspera?.()
        return
      }

      // Alt + S o F3: Escáner de cámara
      if ((e.altKey && e.key.toLowerCase() === 's') || e.key === 'F3') {
        e.preventDefault()
        handlers.onOpenScanner?.()
        return
      }

      // Escape: Cerrar modales o cancelar
      if (e.key === 'Escape') {
        handlers.onEscape?.()
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handlers, enabled])
}
