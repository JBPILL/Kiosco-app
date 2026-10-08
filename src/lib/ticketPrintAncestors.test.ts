import { afterEach, expect, it } from 'vitest'
import { prepararContenedoresImpresion } from './ticketPrintAncestors'
afterEach(() => {
  document.body.innerHTML = ''
  document.body.classList.remove('ticket-print-ancestor')
  document.documentElement.classList.remove('ticket-print-ancestor')
})
it('marca todos los ancestros y los restaura después de imprimir', () => {
  document.body.innerHTML = '<div class="modal"><div class="scroll"><article id="ticket"></article></div></div>'
  const ticket = document.getElementById('ticket')!
  const limpiar = prepararContenedoresImpresion(ticket)
  expect(document.querySelectorAll('.ticket-print-ancestor')).toHaveLength(4)
  expect(ticket.classList.contains('ticket-print-ancestor')).toBe(false)
  limpiar(); limpiar()
  expect(document.querySelectorAll('.ticket-print-ancestor')).toHaveLength(0)
  expect(document.querySelector('.scroll')).toBeTruthy()
})
it('conserva clases preexistentes y tolera desmontaje durante impresión', () => {
  document.body.innerHTML = '<div class="ticket-print-ancestor"><article id="ticket"></article></div>'
  const ticket = document.getElementById('ticket')!
  const padre = ticket.parentElement!
  const limpiar = prepararContenedoresImpresion(ticket)
  padre.remove()
  limpiar()
  expect(padre.classList.contains('ticket-print-ancestor')).toBe(true)
  expect(document.body.classList.contains('ticket-print-ancestor')).toBe(false)
})
