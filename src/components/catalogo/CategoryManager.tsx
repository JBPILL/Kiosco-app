import { useState } from 'react'
import type { Categoria } from '../../types/database'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { Modal } from '../ui/Modal'

const COLORES_PRESET = [
  '#ef4444', '#f59e0b', '#10b981', '#3b82f6',
  '#6366f1', '#8b5cf6', '#ec4899', '#f97316',
  '#06b6d4', '#84cc16', '#d97706', '#6b7280',
]

interface CategoryManagerProps {
  categorias: Categoria[]
  onCrear: (nombre: string, color: string) => Promise<boolean>
  onActualizar: (id: string, nombre: string, color: string) => Promise<boolean>
  onEliminar: (id: string, eliminarProductos?: boolean) => Promise<boolean>
}

export function CategoryManager({ categorias, onCrear, onActualizar, onEliminar }: CategoryManagerProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [eliminarProductosAsociados, setEliminarProductosAsociados] = useState(true)

  const abrirNuevo = () => {
    setEditando(null)
    setNombre('')
    setColor('#6366f1')
    setModalOpen(true)
  }

  const abrirEditar = (cat: Categoria) => {
    setEditando(cat)
    setNombre(cat.nombre)
    setColor(cat.color)
    setModalOpen(true)
  }

  const guardar = async () => {
    if (!nombre.trim()) return
    let ok: boolean
    if (editando) {
      ok = await onActualizar(editando.id, nombre.trim(), color)
    } else {
      ok = await onCrear(nombre.trim(), color)
    }
    if (ok) setModalOpen(false)
  }

  const handleEliminar = async (id: string) => {
    await onEliminar(id, eliminarProductosAsociados)
    setConfirmDelete(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2.5">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">Categorías ({categorias.length})</h3>
        <button
          type="button"
          onClick={abrirNuevo}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/80 transition-all active:scale-95 shadow-2xs cursor-pointer"
        >
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          <span>Nueva categoría</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {categorias.map((cat) => (
          <div
            key={cat.id}
            className="group inline-flex items-center gap-2 pl-2.5 pr-1.5 py-1 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-600 transition-all shadow-xs"
          >
            {/* Indicador de color de la categoría */}
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: cat.color }}
            />

            {/* Nombre de la categoría */}
            <span className="font-semibold text-xs text-gray-800 dark:text-gray-100">
              {cat.nombre}
            </span>

            {/* Separador vertical sutil */}
            <div className="h-3.5 w-px bg-gray-200 dark:border-gray-700 dark:bg-gray-700 ml-0.5" />

            {/* Botones de acción organizados */}
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => abrirEditar(cat)}
                className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                title={`Editar ${cat.nombre}`}
              >
                Editar
              </button>

              <button
                type="button"
                onClick={() => setConfirmDelete(cat.id)}
                className="inline-flex items-center justify-center px-2 py-0.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                title={`Eliminar ${cat.nombre}`}
              >
                Eliminar
              </button>
            </div>
          </div>
        ))}
        {categorias.length === 0 && (
          <p className="text-gray-500 dark:text-gray-400 text-xs py-1">No hay categorías creadas.</p>
        )}
      </div>

      {/* Modal crear/editar */}
      <Modal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editando ? 'Editar categoría' : 'Nueva categoría'}
        size="sm"
      >
        <div className="space-y-4">
          <Input
            label="Nombre"
            placeholder="Ej: Golosinas"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
            autoFocus
          />
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORES_PRESET.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform cursor-pointer ${
                    color === c ? 'border-gray-900 dark:border-white scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {/* Vista previa del chip */}
          <div className="pt-1">
            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Vista previa
            </label>
            <div className="inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xs">
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: color }}
              />
              <span className="font-semibold text-xs text-gray-800 dark:text-gray-100">
                {nombre.trim() || 'Nueva categoría'}
              </span>
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button onClick={guardar} fullWidth>Guardar</Button>
            <Button variant="secondary" onClick={() => setModalOpen(false)} fullWidth>Cancelar</Button>
          </div>
        </div>
      </Modal>

      {/* Confirmación de eliminación */}
      <Modal
        isOpen={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        title="¿Eliminar categoría?"
        size="sm"
      >
        <div className="space-y-3 mb-4">
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
            ¿Qué deseás hacer con los productos pertenecientes a esta categoría?
          </p>

          <label className="flex items-start gap-2.5 p-2.5 rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/20 cursor-pointer">
            <input
              type="checkbox"
              checked={eliminarProductosAsociados}
              onChange={(e) => setEliminarProductosAsociados(e.target.checked)}
              className="mt-0.5 rounded text-red-600 focus:ring-red-500"
            />
            <div className="text-xs">
              <span className="font-bold text-red-800 dark:text-red-300">
                Eliminar también los productos de esta categoría
              </span>
              <p className="text-red-600 dark:text-red-400 mt-0.5">
                Los productos (incluidos combos y recetas) se darán de baja del catálogo y ya no aparecerán en la lista.
              </p>
            </div>
          </label>

          {!eliminarProductosAsociados && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 italic">
              Si desmarcás esta opción, los productos se conservarán en el catálogo como artículos sin categoría asignada.
            </p>
          )}
        </div>

        <div className="flex gap-2">
          <Button variant="danger" onClick={() => confirmDelete && handleEliminar(confirmDelete)} fullWidth>
            Eliminar Categoría
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} fullWidth>
            Cancelar
          </Button>
        </div>
      </Modal>
    </div>
  )
}
