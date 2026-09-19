import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SHORTCUT_SECTIONS = [
  {
    title: 'Navegación del Menú Principal',
    items: [
      { key: 'Alt + M / F10', desc: 'Enfocar el menú lateral (navegar con ↑ / ↓ y Enter)' },
      { key: 'Alt + 1', desc: 'Ir a Punto de Venta' },
      { key: 'Alt + 2', desc: 'Ir a Caja y Arqueo' },
      { key: 'Alt + 3', desc: 'Ir a Clientes y Cuenta Corriente' },
      { key: 'Alt + 4 ... 7', desc: 'Ir a Catálogo, Stock, Reportes o Configuración' },
    ],
  },
  {
    title: 'Navegación en el Punto de Venta (POS)',
    items: [
      { key: 'F2', desc: 'Enfocar buscador de productos (o presionar ↓ para ir a categorías)' },
      { key: '← / →', desc: 'Cambiar de categoría en el POS' },
      { key: '↑ / ↓ / ← / →', desc: 'Moverse por la grilla de productos' },
      { key: 'Enter / Espacio', desc: 'Agregar el producto enfocado al ticket' },
      { key: 'F4', desc: 'Abrir ventana de cobro (Cobrar ticket)' },
      { key: 'F8', desc: 'Ver ventas en espera' },
      { key: 'Alt + E / F9', desc: 'Retiro rápido de efectivo / Sangría de caja' },
      { key: 'Escape', desc: 'Cerrar ventana emergente o cancelar' },
      { key: 'Lector USB', desc: 'Escanear en cualquier momento para agregar al ticket' },
    ],
  },
  {
    title: 'Control del Ticket con el Teclado',
    items: [
      { key: 'F6 / Alt + T', desc: 'Enfocar el Ticket de venta' },
      { key: '↑ / ↓', desc: 'Moverse verticalmente entre items, descuento y botón cobrar' },
      { key: '← / → o Tab', desc: 'Moverse entre la fila, botón [-], botón [+] y botón [✕]' },
      { key: 'Enter / Espacio', desc: 'Hacer clic en el botón [-], botón [+] o [✕] enfocado, o en Cobrar' },
      { key: '+ / -', desc: 'Sumar o restar cantidad directamente desde el teclado' },
      { key: 'Supr / Delete', desc: 'Quitar producto del ticket' },
      { key: '← / Esc', desc: 'Volver a la grilla de productos o buscador' },
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
            <div className="divide-y divide-gray-100 dark:divide-gray-700/80 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-gray-900/60">
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
