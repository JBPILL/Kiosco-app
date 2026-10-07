import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { POS_SHORTCUTS } from '../../lib/keyboardShortcuts'
import { useTenantConfig } from '../../hooks/useTenantConfig'

interface KeyboardShortcutsModalProps { isOpen: boolean; onClose: () => void }
export function KeyboardShortcutsModal({ isOpen, onClose }: KeyboardShortcutsModalProps) {
  const { tieneEnvases } = useTenantConfig()
  const atajos = POS_SHORTCUTS.filter(s => tieneEnvases || s.action !== 'onRecibirEnvases')
  const acciones = [...new Set(atajos.map(s => s.action))]
  const sections = [
    { title: 'Punto de venta', items: acciones.map(action => ({
      key: atajos.filter(s => s.action === action).map(s => s.key).join(' / '),
      desc: atajos.find(s => s.action === action)!.desc,
    })) },
    { title: 'Ticket y navegación', items: [
      { key: 'Tab / Shift + Tab', desc: 'Avanzar / retroceder entre controles' },
      { key: '↑ / ↓', desc: 'Recorrer productos encontrados o filas del ticket' },
      { key: '+ / −', desc: 'Cambiar cantidad con la fila del ticket enfocada' },
      { key: 'Supr', desc: 'Quitar la fila enfocada del ticket' },
      { key: 'Enter', desc: 'Activar el control enfocado' },
      { key: 'Espacio', desc: 'Abrir cobro desde el fondo del POS; en botones activa el botón' },
      { key: 'Esc', desc: 'Cerrar ventana' },
      { key: 'F10 / Alt + M', desc: 'Enfocar menú lateral' },
      { key: 'Alt + 1…9', desc: 'Abrir la opción numerada del menú visible' },
      { key: '← / →', desc: 'Cambiar categoría enfocada o medio de pago' },
    ] },
  ]
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Atajos de teclado" size="lg"
      footer={<Button variant="secondary" fullWidth onClick={onClose} size="sm">Cerrar · Esc</Button>}>
      <div className="space-y-4">
        {sections.map(section => (
          <section key={section.title} className="space-y-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">{section.title}</h3>
            <div className="divide-y divide-gray-200 dark:divide-gray-700 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 shadow-sm overflow-hidden">
              {section.items.map(item => (
                <div key={item.key} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                  <span className="text-gray-700 dark:text-gray-300 font-medium">{item.desc}</span>
                  <kbd className="shrink-0 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-2 py-1 text-[11px] font-semibold text-gray-900 dark:text-white shadow-xs">{item.key}</kbd>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </Modal>
  )
}
