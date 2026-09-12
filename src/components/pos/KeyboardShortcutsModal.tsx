import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'

interface KeyboardShortcutsModalProps {
  isOpen: boolean
  onClose: () => void
}

const SHORTCUTS = [
  { key: 'F2', desc: 'Enfocar buscador de productos' },
  { key: 'F4', desc: 'Abrir ventana de cobro (Cobrar ticket)' },
  { key: 'F3 / Alt+S', desc: 'Abrir escáner de cámara' },
  { key: 'F8', desc: 'Ver ventas en espera' },
  { key: 'F1', desc: 'Abrir esta guía de atajos' },
  { key: 'Enter', desc: 'Agregar producto seleccionado en búsqueda' },
  { key: 'Escape', desc: 'Cerrar ventana emergente o limpiar búsqueda' },
  { key: 'Lector USB', desc: 'Escanear código en cualquier momento para sumar al ticket' },
]

export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Atajos de Teclado del POS"
      size="sm"
    >
      <div className="space-y-4">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Operá el Punto de Venta rápidamente desde el teclado sin necesidad de usar el mouse:
        </p>

        <div className="divide-y divide-gray-100 dark:divide-gray-700/80 border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-gray-50/50 dark:bg-gray-900/60">
          {SHORTCUTS.map((s) => (
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

        <Button variant="secondary" fullWidth onClick={onClose} size="sm">
          Entendido
        </Button>
      </div>
    </Modal>
  )
}
