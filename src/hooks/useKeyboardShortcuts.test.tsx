import { fireEvent, renderHook } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useKeyboardShortcuts } from './useKeyboardShortcuts'
import { POS_SHORTCUTS } from '../lib/keyboardShortcuts'

it.each(POS_SHORTCUTS)('ejecuta $key una sola vez', shortcut => {
  const handler = vi.fn()
  renderHook(() => useKeyboardShortcuts({ [shortcut.action]: handler }))
  fireEvent.keyDown(window, { key: shortcut.tecla, altKey: Boolean(shortcut.alt), ctrlKey: Boolean(shortcut.ctrl) })
  expect(handler).toHaveBeenCalledOnce()
})
it('no roba espacio de un botón ni texto de un campo', () => {
  const cobrar = vi.fn(); const manual = vi.fn(); const buscar = vi.fn()
  renderHook(() => useKeyboardShortcuts({ onCobrar: cobrar, onCobroManual: manual, onFocusSearch: buscar }))
  const button = document.createElement('button'); const input = document.createElement('input')
  document.body.append(button,input)
  try {
    fireEvent.keyDown(button, { key: ' ', code: 'Space' })
    fireEvent.keyDown(input, { key: ' ', code: 'Space' })
    fireEvent.keyDown(input, { key: 'F7' })
    expect(cobrar).not.toHaveBeenCalled(); expect(manual).not.toHaveBeenCalled()
    fireEvent.keyDown(input, { key: 'F2' }); expect(buscar).toHaveBeenCalledOnce()
    fireEvent.keyDown(document.body, { key: ' ', code: 'Space' }); expect(cobrar).toHaveBeenCalledOnce()
  } finally { button.remove(); input.remove() }
})
it('ignora repetición, composición, AltGr y combinaciones diferentes', () => {
  const handler = vi.fn(); renderHook(() => useKeyboardShortcuts({ onNuevoTicket: handler }))
  for (const extra of [{ repeat: true }, { isComposing: true }, { ctrlKey: true }, { shiftKey: true }, { metaKey: true }]) {
    fireEvent.keyDown(window, { key: 'n', altKey: true, ...extra })
  }
  expect(handler).not.toHaveBeenCalled()
})

it('permite abrir cobro y herramientas desde el buscador principal del POS', () => {
  const handler = vi.fn(); renderHook(() => useKeyboardShortcuts({ onCobrar: handler, onCobroManual: handler }))
  const input = document.createElement('input'); input.dataset.posSearch = 'true'; document.body.append(input)
  try { fireEvent.keyDown(input,{ key: 'F4' }); fireEvent.keyDown(input,{ key: 'F7' }); expect(handler).toHaveBeenCalledTimes(2) }
  finally { input.remove() }
})
it('no abre acciones del fondo si hay un modal ni usa eventos ya consumidos', () => {
  const handler = vi.fn(); renderHook(() => useKeyboardShortcuts({ onCobrar: handler }))
  const modal = document.createElement('div'); modal.setAttribute('role','dialog'); modal.setAttribute('aria-modal','true')
  document.body.append(modal)
  fireEvent.keyDown(window, { key: 'F4' }); expect(handler).not.toHaveBeenCalled(); modal.remove()
  const event = new KeyboardEvent('keydown',{ key: 'F4',cancelable: true }); event.preventDefault(); window.dispatchEvent(event)
  expect(handler).not.toHaveBeenCalled()
})
it('no cancela la tecla si falta la acción o el hook está desactivado', () => {
  const first = renderHook(() => useKeyboardShortcuts({}))
  const event = new KeyboardEvent('keydown',{ key: 'r',altKey: true,cancelable: true }); window.dispatchEvent(event)
  expect(event.defaultPrevented).toBe(false); first.unmount()
  const handler = vi.fn(); renderHook(() => useKeyboardShortcuts({ onCobrar: handler },false))
  fireEvent.keyDown(window,{ key: 'F4' }); expect(handler).not.toHaveBeenCalled()
})
