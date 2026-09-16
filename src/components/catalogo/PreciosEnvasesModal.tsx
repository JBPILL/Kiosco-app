import { useState, useMemo, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { SearchInput } from '../ui/SearchInput'
import { formatPrecio } from '../../lib/utils'
import type { Producto } from '../../types/database'
import toast from 'react-hot-toast'

interface PreciosEnvasesModalProps {
  isOpen: boolean
  onClose: () => void
  productos: Producto[]
  onActualizarProducto: (id: string, cambios: Partial<Producto>) => Promise<boolean>
  onRecargarProductos?: () => Promise<void>
}

interface FilaEnvase {
  id: string
  descripcion: string
  precioVenta: number
  categoriaNombre?: string
  esRetornable: boolean
  precioEnvase: number
  nombreEnvase: string
  modificado: boolean
}

export function PreciosEnvasesModal({
  isOpen,
  onClose,
  productos,
  onActualizarProducto,
  onRecargarProductos,
}: PreciosEnvasesModalProps) {
  const [busqueda, setBusqueda] = useState('')
  const [soloRetornables, setSoloRetornables] = useState(true)
  const [filas, setFilas] = useState<Record<string, FilaEnvase>>({})
  const [precioMasivo, setPrecioMasivo] = useState('')
  const [guardando, setGuardando] = useState(false)

  // Inicializar filas desde la lista de productos
  useEffect(() => {
    if (!isOpen) return
    const map: Record<string, FilaEnvase> = {}
    productos.forEach((p) => {
      map[p.id] = {
        id: p.id,
        descripcion: p.descripcion,
        precioVenta: p.precio_venta,
        categoriaNombre: p.categoria?.nombre,
        esRetornable: p.es_retornable || false,
        precioEnvase: p.precio_envase || 0,
        nombreEnvase: p.nombre_envase || '',
        modificado: false,
      }
    })
    setFilas(map)
    setBusqueda('')
  }, [isOpen, productos])

  const handleCambioPrecio = (id: string, nuevoPrecio: number) => {
    setFilas((prev) => {
      const fila = prev[id]
      if (!fila) return prev
      return {
        ...prev,
        [id]: {
          ...fila,
          precioEnvase: Math.max(0, nuevoPrecio),
          modificado: true,
        },
      }
    })
  }

  const handleCambioNombre = (id: string, nuevoNombre: string) => {
    setFilas((prev) => {
      const fila = prev[id]
      if (!fila) return prev
      return {
        ...prev,
        [id]: {
          ...fila,
          nombreEnvase: nuevoNombre,
          modificado: true,
        },
      }
    })
  }

  const handleToggleRetornable = (id: string, checked: boolean) => {
    setFilas((prev) => {
      const fila = prev[id]
      if (!fila) return prev
      return {
        ...prev,
        [id]: {
          ...fila,
          esRetornable: checked,
          precioEnvase: checked && fila.precioEnvase === 0 ? 1500 : fila.precioEnvase,
          modificado: true,
        },
      }
    })
  }

  // Filtrado de productos visibles
  const filasVisibles = useMemo(() => {
    const list = Object.values(filas)
    return list.filter((f) => {
      if (soloRetornables && !f.esRetornable) return false
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim()
        const matchDesc = f.descripcion.toLowerCase().includes(q)
        const matchEnv = f.nombreEnvase.toLowerCase().includes(q)
        const matchCat = (f.categoriaNombre || '').toLowerCase().includes(q)
        if (!matchDesc && !matchEnv && !matchCat) return false
      }
      return true
    })
  }, [filas, soloRetornables, busqueda])

  const cantModificados = useMemo(() => {
    return Object.values(filas).filter((f) => f.modificado).length
  }, [filas])

  // Aplicar precio masivo a los retornables visibles
  const handleAplicarPrecioMasivo = () => {
    const p = parseFloat(precioMasivo)
    if (isNaN(p) || p <= 0) {
      toast.error('Ingresá un precio válido mayor a $0')
      return
    }

    const afectados = filasVisibles.filter((f) => f.esRetornable)
    if (afectados.length === 0) {
      toast.error('No hay productos retornables en la vista actual')
      return
    }

    setFilas((prev) => {
      const next = { ...prev }
      afectados.forEach((f) => {
        next[f.id] = {
          ...next[f.id],
          precioEnvase: p,
          modificado: true,
        }
      })
      return next
    })

    toast.success(`Precio de $${p.toLocaleString('es-AR')} asignado a ${afectados.length} productos`)
    setPrecioMasivo('')
  }

  // Guardar un producto individual
  const handleGuardarFila = async (id: string) => {
    const fila = filas[id]
    if (!fila) return

    setGuardando(true)
    const ok = await onActualizarProducto(id, {
      es_retornable: fila.esRetornable,
      precio_envase: fila.precioEnvase,
      nombre_envase: fila.nombreEnvase.trim() || undefined,
    })
    setGuardando(false)

    if (ok) {
      setFilas((prev) => ({
        ...prev,
        [id]: { ...prev[id], modificado: false },
      }))
      toast.success(`Envase de "${fila.descripcion}" guardado`)
      if (onRecargarProductos) await onRecargarProductos()
    }
  }

  // Guardar todos los cambios
  const handleGuardarTodos = async () => {
    const modificados = Object.values(filas).filter((f) => f.modificado)
    if (modificados.length === 0) {
      toast('No hay cambios pendientes para guardar')
      return
    }

    setGuardando(true)
    let errores = 0

    for (const fila of modificados) {
      const ok = await onActualizarProducto(fila.id, {
        es_retornable: fila.esRetornable,
        precio_envase: fila.precioEnvase,
        nombre_envase: fila.nombreEnvase.trim() || undefined,
      })
      if (!ok) errores++
    }

    setGuardando(false)

    if (errores === 0) {
      toast.success(`Se actualizaron ${modificados.length} envases retornables`)
      setFilas((prev) => {
        const next = { ...prev }
        modificados.forEach((m) => {
          if (next[m.id]) next[m.id] = { ...next[m.id], modificado: false }
        })
        return next
      })
      if (onRecargarProductos) await onRecargarProductos()
      onClose()
    } else {
      toast.error(`Ocurrió un problema al guardar ${errores} producto(s)`)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Precios de Envases Retornables" size="xl">
      <div className="space-y-4">
        <p className="text-xs text-gray-600 dark:text-gray-400">
          Modificá el precio que se cobra por cada botella vacía cuando el cliente no trae su envase. Podés cambiar cada producto por separado o aplicar un valor a todos juntos.
        </p>

        {/* Panel de ajuste masivo */}
        <div className="p-3 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl">
          <label className="block text-xs font-semibold text-gray-800 dark:text-gray-200 mb-1.5">
            Ajuste masivo para los productos retornables filtrados:
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            <div className="w-full sm:w-48">
              <input
                type="number"
                min="0"
                step="50"
                placeholder="Ej: 1800"
                value={precioMasivo}
                onChange={(e) => setPrecioMasivo(e.target.value)}
                className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-2 outline-none focus:border-indigo-500 font-mono font-bold"
              />
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAplicarPrecioMasivo}
              className="text-xs border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 font-semibold"
            >
              Asignar precio a todos los retornables
            </Button>
          </div>
        </div>

        {/* Barra de búsqueda y selector de filtro */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
          <div className="flex-1">
            <SearchInput
              placeholder="Buscar por nombre de producto o tipo de envase..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onClear={() => setBusqueda('')}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none bg-gray-100 dark:bg-gray-700/60 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600">
              <input
                type="checkbox"
                checked={soloRetornables}
                onChange={(e) => setSoloRetornables(e.target.checked)}
                className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600"
              />
              <span className="font-medium">Solo retornables</span>
            </label>
          </div>
        </div>

        {/* Tabla de productos y envases */}
        <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden max-h-[420px] overflow-y-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800/95 text-gray-700 dark:text-gray-200 uppercase text-[10px] font-semibold tracking-wider border-b border-gray-200 dark:border-gray-700 z-10">
              <tr>
                <th className="px-3 py-2.5">Retornable</th>
                <th className="px-3 py-2.5">Producto</th>
                <th className="px-3 py-2.5">Tipo de envase</th>
                <th className="px-3 py-2.5 text-right">Precio envase ($)</th>
                <th className="px-3 py-2.5 text-center">Acción</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
              {filasVisibles.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-400 dark:text-gray-500">
                    No se encontraron productos con los filtros aplicados.
                  </td>
                </tr>
              ) : (
                filasVisibles.map((f) => (
                  <tr
                    key={f.id}
                    className={`hover:bg-gray-50/80 dark:hover:bg-gray-700/40 transition-colors ${
                      f.modificado ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''
                    }`}
                  >
                    {/* Checkbox retornable */}
                    <td className="px-3 py-2 text-center w-16">
                      <input
                        type="checkbox"
                        checked={f.esRetornable}
                        onChange={(e) => handleToggleRetornable(f.id, e.target.checked)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600 cursor-pointer"
                      />
                    </td>

                    {/* Descripción y categoría */}
                    <td className="px-3 py-2 min-w-[180px]">
                      <div className="font-semibold text-gray-900 dark:text-gray-100">{f.descripcion}</div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">
                        {f.categoriaNombre && <span>{f.categoriaNombre}</span>}
                        <span>Precio venta: {formatPrecio(f.precioVenta)}</span>
                      </div>
                    </td>

                    {/* Nombre del envase */}
                    <td className="px-3 py-2 min-w-[150px]">
                      <input
                        type="text"
                        placeholder="Ej: Cerveza 1L Vidrio"
                        disabled={!f.esRetornable}
                        value={f.nombreEnvase}
                        onChange={(e) => handleCambioNombre(f.id, e.target.value)}
                        className={`w-full text-xs rounded-md border px-2 py-1 outline-none transition-colors ${
                          !f.esRetornable
                            ? 'bg-gray-100 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed'
                            : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-indigo-500'
                        }`}
                      />
                    </td>

                    {/* Precio del envase */}
                    <td className="px-3 py-2 text-right w-36">
                      <div className="inline-flex items-center justify-end gap-1">
                        <span className="text-gray-400 font-mono">$</span>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          disabled={!f.esRetornable}
                          value={f.precioEnvase || ''}
                          onChange={(e) => handleCambioPrecio(f.id, parseFloat(e.target.value) || 0)}
                          placeholder="0"
                          className={`w-24 text-right text-xs rounded-md border px-2 py-1 outline-none font-mono font-bold transition-colors ${
                            !f.esRetornable
                              ? 'bg-gray-100 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed'
                              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-indigo-500'
                          }`}
                        />
                      </div>
                    </td>

                    {/* Acción individual */}
                    <td className="px-3 py-2 text-center w-24">
                      {f.modificado ? (
                        <button
                          type="button"
                          onClick={() => handleGuardarFila(f.id)}
                          disabled={guardando}
                          className="px-2 py-1 rounded text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer transition-all"
                        >
                          Guardar
                        </button>
                      ) : (
                        <span className="text-[10px] text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer con resumen y botones */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 pt-2 border-t border-gray-100 dark:border-gray-700">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {cantModificados > 0 ? (
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {cantModificados} {cantModificados === 1 ? 'producto modificado' : 'productos modificados'} sin guardar
              </span>
            ) : (
              <span>Mostrando {filasVisibles.length} productos</span>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1 sm:flex-none"
            >
              Cerrar
            </Button>
            <Button
              type="button"
              onClick={handleGuardarTodos}
              loading={guardando}
              disabled={cantModificados === 0}
              className="flex-1 sm:flex-none"
            >
              Guardar todos los cambios ({cantModificados})
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
