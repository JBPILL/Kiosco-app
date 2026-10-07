import { useEffect } from 'react'
import { esCampoEditable, ignorarAtajoGlobal, POS_SHORTCUTS } from '../lib/keyboardShortcuts'
import type { KeyboardShortcutsHandlers } from '../lib/keyboardShortcuts'

export function useKeyboardShortcuts(handlers: KeyboardShortcutsHandlers, enabled = true) {
  useEffect(() => {
    if (!enabled) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (ignorarAtajoGlobal(event)) return
      const editable = esCampoEditable(event.target)
      const shortcut = POS_SHORTCUTS.find(s => s.tecla.toLowerCase() === event.key.toLowerCase()
        && Boolean(s.alt) === event.altKey && Boolean(s.ctrl) === event.ctrlKey && !event.shiftKey)
      if (shortcut) {
        // Buscar puede recuperar el foco desde un campo; las demás acciones esperan a salir de él.
        const buscadorPOS = event.target instanceof HTMLElement && Boolean(event.target.closest('[data-pos-search="true"]'))
        if (editable && !buscadorPOS && shortcut.action !== 'onFocusSearch' && shortcut.action !== 'onOpenHelp') return
        const handler = handlers[shortcut.action]
        if (!handler) return
        event.preventDefault()
        handler()
      } else if (event.code === 'Space' && !editable && !event.altKey && !event.ctrlKey && !event.shiftKey
        && !(event.target instanceof HTMLElement && event.target.closest('button,a,[role="button"],summary'))) {
        if (!handlers.onCobrar) return
        event.preventDefault()
        handlers.onCobrar()
      } else if (event.key === 'Escape' && !event.altKey && !event.ctrlKey && !event.shiftKey) {
        handlers.onEscape?.()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handlers, enabled])
}
