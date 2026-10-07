export interface KeyboardShortcutsHandlers {
  onFocusSearch?: () => void
  onFocusTicket?: () => void
  onCobrar?: () => void
  onVentasEnEspera?: () => void
  onOpenScanner?: () => void
  onOpenHelp?: () => void
  onRetiroCaja?: () => void
  onEscape?: () => void
  onCobroManual?: () => void
  onPromociones?: () => void
  onHistorialTickets?: () => void
  onRecibirEnvases?: () => void
  onNuevoTicket?: () => void
  onTicketAnterior?: () => void
  onTicketSiguiente?: () => void
  onPausarTicket?: () => void
}
export const POS_SHORTCUTS: ReadonlyArray<{ action: keyof KeyboardShortcutsHandlers; key: string; desc: string; tecla: string; alt?: boolean; ctrl?: boolean }> = [
  { action: 'onOpenHelp', key: 'F1', desc: 'Ver atajos', tecla: 'F1' },
  { action: 'onFocusSearch', key: 'F2', desc: 'Buscar productos', tecla: 'F2' },
  { action: 'onFocusSearch', key: 'Ctrl + B', desc: 'Buscar productos', tecla: 'b', ctrl: true },
  { action: 'onFocusSearch', key: 'Alt + B', desc: 'Buscar productos', tecla: 'b', alt: true },
  { action: 'onOpenScanner', key: 'F3', desc: 'Escáner de cámara', tecla: 'F3' },
  { action: 'onCobrar', key: 'F4', desc: 'Abrir cobro', tecla: 'F4' },
  { action: 'onCobrar', key: 'Ctrl + Enter', desc: 'Abrir cobro', tecla: 'Enter', ctrl: true },
  { action: 'onFocusTicket', key: 'F6', desc: 'Enfocar ticket', tecla: 'F6' },
  { action: 'onFocusTicket', key: 'Alt + T', desc: 'Enfocar ticket', tecla: 't', alt: true },
  { action: 'onCobroManual', key: 'F7', desc: 'Cobro manual / servicio', tecla: 'F7' },
  { action: 'onVentasEnEspera', key: 'F8', desc: 'Tickets en espera', tecla: 'F8' },
  { action: 'onRetiroCaja', key: 'F9', desc: 'Abrir retiro de caja', tecla: 'F9' },
  { action: 'onRetiroCaja', key: 'Alt + E', desc: 'Abrir retiro de caja', tecla: 'e', alt: true },
  { action: 'onOpenScanner', key: 'Alt + S', desc: 'Escáner de cámara', tecla: 's', alt: true },
  { action: 'onPromociones', key: 'Alt + P', desc: 'Combos y ofertas', tecla: 'p', alt: true },
  { action: 'onHistorialTickets', key: 'Alt + H', desc: 'Tickets emitidos', tecla: 'h', alt: true },
  { action: 'onRecibirEnvases', key: 'Alt + R', desc: 'Recibir envases', tecla: 'r', alt: true },
  { action: 'onNuevoTicket', key: 'Alt + N', desc: 'Nuevo ticket', tecla: 'n', alt: true },
  { action: 'onTicketAnterior', key: 'Alt + ←', desc: 'Ticket anterior', tecla: 'ArrowLeft', alt: true },
  { action: 'onTicketSiguiente', key: 'Alt + →', desc: 'Ticket siguiente', tecla: 'ArrowRight', alt: true },
  { action: 'onPausarTicket', key: 'Alt + G', desc: 'Guardar ticket en espera', tecla: 'g', alt: true },
]
export function ignorarAtajoGlobal(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.repeat || event.isComposing || event.metaKey
    || (event.altKey && event.ctrlKey) || Boolean(document.querySelector('[role="dialog"][aria-modal="true"]'))
}
export function esCampoEditable(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (Boolean(target.closest('input,textarea,select'))
    || target.isContentEditable || Boolean(target.closest('[contenteditable="true"],[contenteditable=""]')))
}
