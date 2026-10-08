/** Libera contenedores de vista previa sólo durante la impresión. */
export function prepararContenedoresImpresion(ticket: HTMLElement): () => void {
  const modificados: HTMLElement[] = []
  let padre = ticket.parentElement
  while (padre) {
    if (!padre.classList.contains('ticket-print-ancestor')) {
      padre.classList.add('ticket-print-ancestor')
      modificados.push(padre)
    }
    padre = padre.parentElement
  }
  return () => modificados.forEach(elemento => elemento.classList.remove('ticket-print-ancestor'))
}
