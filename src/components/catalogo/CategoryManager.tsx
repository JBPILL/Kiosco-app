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
  onEliminar: (id: string) => Promise<boolean>
}

export function CategoryManager({ categorias, onCrear, onActualizar, onEliminar }: CategoryManagerProps) {
  const [modalOpen, setModalOpen] = useState(false)
  const [editando, setEditando] = useState<Categoria | null>(null)
  const [nombre, setNombre] = useState('')
  const [color, setColor] = useState('#6366f1')
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

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
    await onEliminar(id)
    setConfirmDelete(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Categorías</h3>
        <Button size="sm" onClick={abrirNuevo}>+ Nueva</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        {categorias.map((cat) => (
          <div
            key={cat.id}
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 bg-white"
          >
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.color }} />
            <span className="text-sm font-medium">{cat.nombre}</span>
            <button
              onClick={() => abrirEditar(cat)}
              className="text-gray-400 hover:text-indigo-600 text-xs ml-1"
            >
              ✏️
            </button>
            <button
              onClick={() => setConfirmDelete(cat.id)}
              className="text-gray-400 hover:text-red-600 text-xs"
            >
              🗑️
            </button>
          </div>
        ))}
        {categorias.length === 0 && (
          <p className="text-gray-500 text-sm">No hay categorías. Creá la primera.</p>
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
            <label className="block text-sm font-medium text-gray-700 mb-2">Color</label>
            <div className="flex flex-wrap gap-2">
              {COLORES_PRESET.map((c) => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-full border-2 transition-transform ${
                    color === c ? 'border-gray-900 scale-110' : 'border-transparent'
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
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
        <p className="text-gray-600 mb-4">
          Los productos de esta categoría quedarán sin categoría asignada.
        </p>
        <div className="flex gap-2">
          <Button variant="danger" onClick={() => confirmDelete && handleEliminar(confirmDelete)} fullWidth>
            Eliminar
          </Button>
          <Button variant="secondary" onClick={() => setConfirmDelete(null)} fullWidth>
            Cancelar
          </Button>
        </div>
      </Modal>
    </div>
  )
}
