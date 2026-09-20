import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SHORTCUT_SECTIONS = [
  {
    title: 'Teclas Universales Fáciles (Sin necesidad de mouse)',
    items: [
      { key: 'Tab / Shift + Tab', desc: 'Avanzar y retroceder entre botones, campos y opciones' },
      { key: 'Flechas ↑ / ↓', desc: 'Moverse por la lista de productos encontrados o ítems del ticket' },
      { key: 'Flechas ← / →', desc: 'Cambiar de categoría de producto o medio de pago (Efectivo, MP...)' },
      { key: 'Enter', desc: 'Confirmar la acción: cargar producto al ticket o confirmar el cobro' },
      { key: 'Barra Espaciadora', desc: 'Cobrar ticket de venta (cuando no estás escribiendo en el buscador)' },
      { key: 'Escape (Esc)', desc: 'Cerrar cualquier ventana emergente o volver atrás' },
    ],
  },
  {
    title: 'Control del Ticket con el Teclado',
    items: [
      { key: '+ / -', desc: 'Sumar o restar unidades del producto seleccionado' },
      { key: 'Supr / Delete', desc: 'Quitar producto del ticket' },
      { key: 'F6 / Alt + T', desc: 'Enfocar el ticket de venta' },
      { key: 'Lector de Barras USB', desc: 'Escanear en cualquier momento para agregar directo al ticket' },
    ],
  },
  {
    title: 'Atajos de Teclas de Función (Opcionales)',
    items: [
      { key: 'F4 / Ctrl + Enter', desc: 'Abrir ventana de cobro' },
      { key: 'F2 / Ctrl + B', desc: 'Enfocar barra de búsqueda de productos' },
      { key: 'Alt + 1 ... 7', desc: 'Ir a Ventas, Caja, Clientes, Catálogo, Stock o Reportes' },
      { key: 'F8', desc: 'Ver tickets guardados en espera' },
      { key: 'F9 / Alt + E', desc: 'Retiro de plata del cajón' },
    ],
  },
]

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Atajos de Teclado y Flechitas"
      size="md"
    >
      <div className="space-y-4 max-h-[75dvh] overflow-y-auto pr-1">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Podés operar todo el sistema y moverte por los menús usando el teclado sin necesidad del mouse:
        </p>

        {SHORTCUT_SECTIONS.map((sec) => (
          <div key={sec.title} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
              {sec.title}
            </h3>
            <div className="divide-y divide-gray-100 dark:divide-gray-700/80 border border-gray-300 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-gray-900/60">
              {sec.items.map((s) => (
                <div
                  key={s.key}
                  className="flex items-center justify-between px-3.5 py-2.5 text-xs hover:bg-gray-100/60 dark:hover:bg-gray-800/60 transition-colors"
                >
                  <span className="text-gray-700 dark:text-gray-300 font-medium">
                    {s.desc}
                  </span>
                  <kbd className="px-2 py-1 rounded-md bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 font-mono text-[11px] font-bold text-gray-900 dark:text-white shadow-xs ml-3 whitespace-nowrap">
                    {s.key}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div className="pt-2">
          <Button variant="secondary" fullWidth onClick={onClose} size="sm">
            Entendido
          </Button>
        </div>
      </div>
    </Modal>
  )
}
