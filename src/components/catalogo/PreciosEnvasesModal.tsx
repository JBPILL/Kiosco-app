import { useState, useMemo, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { SearchInput } from '../ui/SearchInput'
import { formatPrecio } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { useEnvasesStore, type TipoEnvase } from '../../stores/envasesStore'
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
  const { usuario } = useAuthStore()
  const {
    tiposEnvases,
    cargarTiposEnvases,
    actualizarPrecioTipo,
  } = useEnvasesStore()

  const [busqueda, setBusqueda] = useState('')
  const [soloRetornables, setSoloRetornables] = useState(true)
  const [filas, setFilas] = useState<Record<string, FilaEnvase>>({})
  const [guardando, setGuardando] = useState(false)

  // Estados locales para los tipos de envases (para permitir edición en vivo por uno o conjuntamente)
  const [preciosTiposLocal, setPreciosTiposLocal] = useState<Record<string, number>>({})

  // Estado para modificación conjunta
  const [modoConjunto, setModoConjunto] = useState<'FIJO' | 'PORCENTAJE' | 'SUMA'>('PORCENTAJE')
  const [valorConjunto, setValorConjunto] = useState('')
  const [mostrarPanelConjunto, setMostrarPanelConjunto] = useState(false)

  // Cargar tipos al abrir
  useEffect(() => {
    if (isOpen) {
      cargarTiposEnvases(usuario?.kiosco_id || undefined)
    }
  }, [isOpen, usuario?.kiosco_id, cargarTiposEnvases])

  // Sincronizar precios locales de tipos
  useEffect(() => {
    const map: Record<string, number> = {}
    tiposEnvases.forEach((t) => {
      map[t.id] = t.precio
    })
    setPreciosTiposLocal(map)
  }, [tiposEnvases])

  // Inicializar filas desde productos
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

  // Conteo de productos asociados por tipo de envase
  const conteoPorTipo = useMemo(() => {
    const conteo: Record<string, number> = {}
    tiposEnvases.forEach((t) => {
      conteo[t.id] = 0
    })

    Object.values(filas).forEach((f) => {
      if (!f.esRetornable) return
      const envNom = (f.nombreEnvase || '').toLowerCase()
      tiposEnvases.forEach((t) => {
        if (
          envNom === t.nombre.toLowerCase() ||
          (t.id === '1lt' && (envNom.includes('1l') || envNom.includes('1 lt') || envNom.includes('1lt'))) ||
          (t.id === '2lts' && (envNom.includes('2l') || envNom.includes('2 l') || envNom.includes('2lt')) && !envNom.includes('2.25') && !envNom.includes('2,25') && !envNom.includes('20')) ||
          (t.id === '2.25lts' && (envNom.includes('2.25') || envNom.includes('2,25'))) ||
          (t.id === 'sifon' && (envNom.includes('sifon') || envNom.includes('sifón') || envNom.includes('soda'))) ||
          (t.id === 'bidon20l' && (envNom.includes('bidon') || envNom.includes('bidón') || envNom.includes('20')))
        ) {
          conteo[t.id] = (conteo[t.id] || 0) + 1
        }
      })
    })

    return conteo
  }, [filas, tiposEnvases])

  // Modificar precio de un tipo individualmente ("por uno")
  const handleCambioPrecioTipo = (tipoId: string, nuevoPrecio: number) => {
    const p = Math.max(0, nuevoPrecio)
    setPreciosTiposLocal((prev) => ({ ...prev, [tipoId]: p }))
    actualizarPrecioTipo(tipoId, p, usuario?.kiosco_id || undefined)

    // Opcional: sincronizar en vivo los productos que tengan ese tipo asignado
    const tipo = tiposEnvases.find((t) => t.id === tipoId)
    if (tipo) {
      setFilas((prev) => {
        const next = { ...prev }
        let hubieronCambios = false
        Object.values(next).forEach((f) => {
          if (f.esRetornable && f.nombreEnvase.toLowerCase() === tipo.nombre.toLowerCase()) {
            next[f.id] = { ...f, precioEnvase: p, modificado: true }
            hubieronCambios = true
          }
        })
        return hubieronCambios ? next : prev
      })
    }
  }

  // Aplicar precio de un tipo a todos los productos asociados
  const handleAplicarTipoAProductos = (tipo: TipoEnvase) => {
    const precio = preciosTiposLocal[tipo.id] ?? tipo.precio
    let cant = 0
    setFilas((prev) => {
      const next = { ...prev }
      Object.values(next).forEach((f) => {
        const envNom = (f.nombreEnvase || '').toLowerCase()
        const coincide =
          envNom === tipo.nombre.toLowerCase() ||
          (tipo.id === '1lt' && (envNom.includes('1l') || envNom.includes('litro'))) ||
          (tipo.id === '2lts' && (envNom.includes('2l') || envNom.includes('2 lt')) && !envNom.includes('2.25')) ||
          (tipo.id === '2.25lts' && (envNom.includes('2.25') || envNom.includes('2,25'))) ||
          (tipo.id === 'sifon' && (envNom.includes('sifon') || envNom.includes('soda'))) ||
          (tipo.id === 'bidon20l' && (envNom.includes('bidon') || envNom.includes('20')))

        if (f.esRetornable && coincide) {
          next[f.id] = {
            ...f,
            nombreEnvase: tipo.nombre,
            precioEnvase: precio,
            modificado: true,
          }
          cant++
        }
      })
      return next
    })

    toast.success(`Precio de ${tipo.nombre} ($${precio.toLocaleString('es-AR')}) aplicado a ${cant} productos`)
  }

  // Modificación conjunta ("conjuntamente") de todos los tipos de envases
  const handleAplicarConjunto = () => {
    const val = parseFloat(valorConjunto)
    if (isNaN(val) || val <= 0) {
      toast.error('Ingresá un valor numérico válido mayor a 0')
      return
    }

    const nuevosPrecios: Record<string, number> = {}

    tiposEnvases.forEach((t) => {
      let nuevoP = t.precio
      if (modoConjunto === 'PORCENTAJE') {
        nuevoP = Math.round(t.precio * (1 + val / 100))
      } else if (modoConjunto === 'FIJO') {
        nuevoP = val
      } else if (modoConjunto === 'SUMA') {
        nuevoP = t.precio + val
      }
      nuevosPrecios[t.id] = nuevoP
      actualizarPrecioTipo(t.id, nuevoP, usuario?.kiosco_id || undefined)
    })

    setPreciosTiposLocal(nuevosPrecios)

    // Actualizar también todos los productos retornables con sus respectivos nuevos precios
    setFilas((prev) => {
      const next = { ...prev }
      Object.values(next).forEach((f) => {
        if (!f.esRetornable) return
        const envNom = (f.nombreEnvase || '').toLowerCase()
        let aplicado = false

        tiposEnvases.forEach((t) => {
          if (aplicado) return
          const coincide =
            envNom === t.nombre.toLowerCase() ||
            (t.id === '1lt' && (envNom.includes('1l') || envNom.includes('litro'))) ||
            (t.id === '2lts' && (envNom.includes('2l') || envNom.includes('2 lt')) && !envNom.includes('2.25')) ||
            (t.id === '2.25lts' && (envNom.includes('2.25') || envNom.includes('2,25'))) ||
            (t.id === 'sifon' && (envNom.includes('sifon') || envNom.includes('soda'))) ||
            (t.id === 'bidon20l' && (envNom.includes('bidon') || envNom.includes('20')))

          if (coincide) {
            next[f.id] = {
              ...f,
              nombreEnvase: t.nombre,
              precioEnvase: nuevosPrecios[t.id],
              modificado: true,
            }
            aplicado = true
          }
        })

        // Si no coincidió con ninguno específico pero es retornable y se eligió precio fijo
        if (!aplicado && modoConjunto === 'FIJO') {
          next[f.id] = {
            ...f,
            precioEnvase: val,
            modificado: true,
          }
        }
      })
      return next
    })

    toast.success('Todos los tipos de envases y sus productos fueron actualizados conjuntamente')
    setValorConjunto('')
    setMostrarPanelConjunto(false)
  }

  // Handlers para la tabla de productos
  const handleCambioPrecioProducto = (id: string, nuevoPrecio: number) => {
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

  const handleSeleccionarTipoEnProducto = (id: string, tipoNombre: string) => {
    const tipo = tiposEnvases.find((t) => t.nombre === tipoNombre)
    const precioSugerido = tipo ? (preciosTiposLocal[tipo.id] ?? tipo.precio) : 1500

    setFilas((prev) => {
      const fila = prev[id]
      if (!fila) return prev
      return {
        ...prev,
        [id]: {
          ...fila,
          nombreEnvase: tipoNombre,
          precioEnvase: precioSugerido,
          modificado: true,
        },
      }
    })
  }

  const handleToggleRetornable = (id: string, checked: boolean) => {
    setFilas((prev) => {
      const fila = prev[id]
      if (!fila) return prev
      const primerTipo = tiposEnvases[0]
      const precioDefault = primerTipo ? (preciosTiposLocal[primerTipo.id] ?? primerTipo.precio) : 1500
      return {
        ...prev,
        [id]: {
          ...fila,
          esRetornable: checked,
          nombreEnvase: checked && !fila.nombreEnvase ? (primerTipo?.nombre || '1LT') : fila.nombreEnvase,
          precioEnvase: checked && fila.precioEnvase === 0 ? precioDefault : fila.precioEnvase,
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
          Configurá los precios de los tipos oficiales de envases retornables (modificación individual o conjunta) y vinculalos a los productos del catálogo.
        </p>

        {/* ── SECCIÓN 1: LISTA DE TIPOS DE ENVASES (1LT, 2.25lts, 2lts, Sifón, Bidón 20lts) ── */}
        <div className="p-3.5 bg-gray-50 dark:bg-gray-800/80 border border-gray-200 dark:border-gray-700 rounded-xl space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-200 dark:border-gray-700 pb-2">
            <div>
              <h3 className="text-xs font-bold text-gray-900 dark:text-gray-100 uppercase tracking-wider">
                Tipos de Envases Oficiales
              </h3>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Podés modificar el valor de cada tipo por separado o ajustar todos conjuntamente.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setMostrarPanelConjunto(!mostrarPanelConjunto)}
              className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline self-start sm:self-auto cursor-pointer"
            >
              {mostrarPanelConjunto ? 'Ocultar ajuste conjunto' : 'Modificar conjuntamente'}
            </button>
          </div>

          {/* Panel desplegable de modificación conjunta */}
          {mostrarPanelConjunto && (
            <div className="p-3 bg-white dark:bg-gray-900/60 border border-indigo-200 dark:border-indigo-900/50 rounded-lg space-y-2.5">
              <span className="text-xs font-bold text-indigo-900 dark:text-indigo-300 block">
                Ajuste Conjunto para Todos los Tipos:
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs">
                  <button
                    type="button"
                    onClick={() => setModoConjunto('PORCENTAJE')}
                    className={`px-3 py-1.5 font-semibold transition-colors ${
                      modoConjunto === 'PORCENTAJE'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    % Aumento
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoConjunto('FIJO')}
                    className={`px-3 py-1.5 font-semibold border-l border-gray-300 dark:border-gray-600 transition-colors ${
                      modoConjunto === 'FIJO'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    Precio Fijo
                  </button>
                  <button
                    type="button"
                    onClick={() => setModoConjunto('SUMA')}
                    className={`px-3 py-1.5 font-semibold border-l border-gray-300 dark:border-gray-600 transition-colors ${
                      modoConjunto === 'SUMA'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-gray-50 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100'
                    }`}
                  >
                    +$ Sumar monto
                  </button>
                </div>

                <div className="w-28">
                  <input
                    type="number"
                    min="0"
                    placeholder={modoConjunto === 'PORCENTAJE' ? 'Ej: 15' : 'Ej: 2000'}
                    value={valorConjunto}
                    onChange={(e) => setValorConjunto(e.target.value)}
                    className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-3 py-1.5 outline-none focus:border-indigo-500 font-mono font-bold"
                  />
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleAplicarConjunto}
                  className="text-xs shadow-xs"
                >
                  Aplicar a todos
                </Button>
              </div>
            </div>
          )}

          {/* Grilla con la lista de tipos oficiales (Edición "por uno") */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {tiposEnvases.map((tipo) => {
              const precioActual = preciosTiposLocal[tipo.id] ?? tipo.precio
              const prodsVinculados = conteoPorTipo[tipo.id] || 0
              return (
                <div
                  key={tipo.id}
                  className="p-3 bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col justify-between gap-2 shadow-2xs"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-xs text-gray-900 dark:text-gray-100">
                        {tipo.nombre}
                      </p>
                      <p className="text-[10px] text-gray-400 dark:text-gray-500 truncate">
                        {prodsVinculados} {prodsVinculados === 1 ? 'producto vinculado' : 'productos vinculados'}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => handleAplicarTipoAProductos(tipo)}
                      title="Asignar este precio a los productos que usan este envase"
                      className="px-2 py-0.5 rounded text-[10px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 transition-colors"
                    >
                      Sincronizar
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100 dark:border-gray-800">
                    <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
                      Precio ($):
                    </span>
                    <div className="flex items-center gap-1">
                      <span className="text-gray-400 font-mono text-xs">$</span>
                      <input
                        type="number"
                        min="0"
                        step="50"
                        value={precioActual || ''}
                        onChange={(e) => handleCambioPrecioTipo(tipo.id, parseFloat(e.target.value) || 0)}
                        className="w-24 text-right text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2 py-1 outline-none focus:border-indigo-500 font-mono font-bold"
                      />
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* ── SECCIÓN 2: PRODUCTOS DEL CATÁLOGO ── */}
        <div className="space-y-2.5">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
            <div className="flex-1">
              <SearchInput
                placeholder="Buscar por nombre de producto o tipo de envase..."
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                onClear={() => setBusqueda('')}
              />
            </div>
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

          {/* Tabla de productos y asignación de tipo de envase */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800/95 text-gray-700 dark:text-gray-200 uppercase text-[10px] font-semibold tracking-wider border-b border-gray-200 dark:border-gray-700 z-10">
                <tr>
                  <th className="px-3 py-2.5 text-center">Retornable</th>
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

                      {/* Selector de tipo de envase oficial */}
                      <td className="px-3 py-2 min-w-[170px]">
                        <select
                          disabled={!f.esRetornable}
                          value={f.nombreEnvase || ''}
                          onChange={(e) => handleSeleccionarTipoEnProducto(f.id, e.target.value)}
                          className={`w-full text-xs rounded-md border px-2 py-1 outline-none transition-colors ${
                            !f.esRetornable
                              ? 'bg-gray-100 dark:bg-gray-800/40 border-gray-200 dark:border-gray-700 text-gray-400 cursor-not-allowed'
                              : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:border-indigo-500 font-medium'
                          }`}
                        >
                          <option value="">-- Seleccionar tipo --</option>
                          {tiposEnvases.map((tipo) => (
                            <option key={tipo.id} value={tipo.nombre}>
                              {tipo.nombre} ({formatPrecio(preciosTiposLocal[tipo.id] ?? tipo.precio)})
                            </option>
                          ))}
                        </select>
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
                            onChange={(e) => handleCambioPrecioProducto(f.id, parseFloat(e.target.value) || 0)}
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
