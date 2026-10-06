import { useState, useMemo, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { SearchInput } from '../ui/SearchInput'
import { formatPrecio } from '../../lib/utils'
import { useAuthStore } from '../../stores/authStore'
import { useEnvasesStore, type TipoEnvase } from '../../stores/envasesStore'
import type { Producto } from '../../types/database'
import toast from 'react-hot-toast'
import { PreciosEnvasesCompartidos } from './PreciosEnvasesCompartidos'

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
    historialMovimientos,
    cargarTiposEnvases,
    actualizarPrecioTipo,
    actualizarStockVacios,
    ajustarStockVacios,
    entregarVaciosADistribuidor,
  } = useEnvasesStore()

  // Pestañas: 'TIPOS' para configurar valores oficiales | 'PRODUCTOS' para asignar en catálogo | 'DEPOSITO' para inventario de vacíos
  const [pestanaActiva, setPestanaActiva] = useState<'TIPOS' | 'PRODUCTOS' | 'DEPOSITO'>('TIPOS')

  const [busqueda, setBusqueda] = useState('')
  const [soloRetornables, setSoloRetornables] = useState(true)
  const [filas, setFilas] = useState<Record<string, FilaEnvase>>({})
  const [guardando, setGuardando] = useState(false)

  // Precios locales de tipos para edición en vivo
  const [preciosTiposLocal, setPreciosTiposLocal] = useState<Record<string, number>>({})

  // Estado para modificación conjunta
  const [modoConjunto, setModoConjunto] = useState<'PORCENTAJE' | 'FIJO' | 'SUMA'>('PORCENTAJE')
  const [valorConjunto, setValorConjunto] = useState('')
  const [mostrarPanelConjunto, setMostrarPanelConjunto] = useState(false)

  // Estado para entrega de vacíos a distribuidores
  const [entregaModalOpen, setEntregaModalOpen] = useState(false)
  const [tipoParaEntrega, setTipoParaEntrega] = useState<TipoEnvase | null>(null)
  const [cantidadEntrega, setCantidadEntrega] = useState<number>(1)
  const [distribuidorEntrega, setDistribuidorEntrega] = useState<string>('Quilmes / Cervecería')
  const [distribuidorPersonalizado, setDistribuidorPersonalizado] = useState<string>('')
  const [notasEntrega, setNotasEntrega] = useState<string>('')

  // Estado para ajuste manual directo de stock
  const [ajusteModalOpen, setAjusteModalOpen] = useState(false)
  const [tipoParaAjuste, setTipoParaAjuste] = useState<TipoEnvase | null>(null)
  const [nuevoStockAjuste, setNuevoStockAjuste] = useState<number>(0)

  // Cargar tipos al abrir
  useEffect(() => {
    if (isOpen) {
      cargarTiposEnvases(usuario?.kiosco_id || undefined)
      setPestanaActiva('TIPOS')
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
          (t.id === '1.5lts' && (envNom.includes('1.5') || envNom.includes('1,5') || envNom.includes('1 1/2'))) ||
          (t.id === '1lt' && !envNom.includes('1.5') && !envNom.includes('1,5') && (envNom.includes('1l') || envNom.includes('litro'))) ||
          (t.id === '2lts' && (envNom.includes('2l') || envNom.includes('2 lt')) && !envNom.includes('2.25') && !envNom.includes('20')) ||
          (t.id === '2.25lts' && (envNom.includes('2.25') || envNom.includes('2,25'))) ||
          (t.id === 'sifon' && (envNom.includes('sifon') || envNom.includes('soda'))) ||
          (t.id === 'bidon20l' && (envNom.includes('bidon') || envNom.includes('20')))
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
          (tipo.id === '1.5lts' && (envNom.includes('1.5') || envNom.includes('1,5') || envNom.includes('1 1/2'))) ||
          (tipo.id === '1lt' && !envNom.includes('1.5') && !envNom.includes('1,5') && (envNom.includes('1l') || envNom.includes('litro'))) ||
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

    toast.success(`Precio de ${tipo.nombre} ($${precio.toLocaleString('es-AR')}) asignado a ${cant} producto(s)`)
  }

  // Modificación conjunta ("conjuntamente") de todos los tipos de envases
  const handleAplicarConjunto = () => {
    const val = parseFloat(valorConjunto)
    if (isNaN(val) || val <= 0) {
      toast.error('Ingresá un valor válido mayor a 0')
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

    // Actualizar también todos los productos retornables
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
            (t.id === '1.5lts' && (envNom.includes('1.5') || envNom.includes('1,5') || envNom.includes('1 1/2'))) ||
            (t.id === '1lt' && !envNom.includes('1.5') && !envNom.includes('1,5') && (envNom.includes('1l') || envNom.includes('litro'))) ||
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

    toast.success('Todos los tipos de envases fueron actualizados conjuntamente')
    setValorConjunto('')
    setMostrarPanelConjunto(false)
  }

  // Handlers para el depósito de envases vacíos
  const handleAbrirEntrega = (tipo: TipoEnvase) => {
    const vacios = tipo.stock_vacios || 0
    if (vacios <= 0) {
      toast.error(`No hay envases vacíos de ${tipo.nombre} en depósito para entregar`)
      return
    }
    setTipoParaEntrega(tipo)
    setCantidadEntrega(Math.min(vacios, 10))
    setDistribuidorEntrega('Quilmes / Cervecería')
    setDistribuidorPersonalizado('')
    setNotasEntrega('')
    setEntregaModalOpen(true)
  }

  const handleConfirmarEntrega = () => {
    if (!tipoParaEntrega) return
    const distrib = distribuidorEntrega === 'OTRO' ? distribuidorPersonalizado.trim() : distribuidorEntrega
    if (!distrib) {
      toast.error('Especificá el nombre del distribuidor o fletero')
      return
    }
    if (cantidadEntrega <= 0) {
      toast.error('La cantidad a entregar debe ser mayor a 0')
      return
    }
    const stockDisponible = tipoParaEntrega.stock_vacios || 0
    if (stockDisponible <= 0) {
      toast.error('No hay envases vacíos disponibles en depósito para entregar')
      return
    }
    if (cantidadEntrega > stockDisponible) {
      toast.error(`No podés entregar más de los ${stockDisponible} envases disponibles en depósito`)
      return
    }

    const ok = entregarVaciosADistribuidor(
      tipoParaEntrega.id,
      cantidadEntrega,
      distrib,
      notasEntrega.trim() || undefined,
      usuario?.kiosco_id || undefined,
      usuario?.nombre || undefined
    )

    if (ok) {
      toast.success(`Entrega registrada: ${cantidadEntrega}x ${tipoParaEntrega.nombre} entregados a ${distrib}`)
      setEntregaModalOpen(false)
      setTipoParaEntrega(null)
    }
  }

  const handleAbrirAjusteManual = (tipo: TipoEnvase) => {
    setTipoParaAjuste(tipo)
    setNuevoStockAjuste(tipo.stock_vacios || 0)
    setAjusteModalOpen(true)
  }

  const handleConfirmarAjusteManual = () => {
    if (!tipoParaAjuste) return
    actualizarStockVacios(
      tipoParaAjuste.id,
      nuevoStockAjuste,
      usuario?.kiosco_id || undefined,
      usuario?.nombre || undefined
    )
    toast.success(`Stock de ${tipoParaAjuste.nombre} actualizado a ${nuevoStockAjuste} unidades`)
    setAjusteModalOpen(false)
    setTipoParaAjuste(null)
  }

  const handleAjusteRapido = (tipoId: string, delta: number) => {
    ajustarStockVacios(
      tipoId,
      delta,
      'AJUSTE_MANUAL',
      usuario?.kiosco_id || undefined,
      usuario?.nombre || undefined,
      `Ajuste rápido en depósito (${delta > 0 ? '+' : ''}${delta})`
    )
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

      let tipoSugerido = tiposEnvases[0]
      const desc = (fila.descripcion || '').toLowerCase()
      if (desc.includes('1.5') || desc.includes('1,5') || desc.includes('1 1/2')) {
        tipoSugerido = tiposEnvases.find((t) => t.id === '1.5lts') || tipoSugerido
      } else if (desc.includes('2.25') || desc.includes('2,25')) {
        tipoSugerido = tiposEnvases.find((t) => t.id === '2.25lts') || tipoSugerido
      } else if (desc.includes('2l') || desc.includes('2 l') || desc.includes('2 lt') || desc.includes('2lt')) {
        tipoSugerido = tiposEnvases.find((t) => t.id === '2lts') || tipoSugerido
      } else if (desc.includes('sifon') || desc.includes('sifón') || desc.includes('soda')) {
        tipoSugerido = tiposEnvases.find((t) => t.id === 'sifon') || tipoSugerido
      } else if (desc.includes('bidon') || desc.includes('bidón') || desc.includes('20')) {
        tipoSugerido = tiposEnvases.find((t) => t.id === 'bidon20l') || tipoSugerido
      } else if (desc.includes('1l') || desc.includes('1 l') || desc.includes('1lt') || desc.includes('litro')) {
        tipoSugerido = tiposEnvases.find((t) => t.id === '1lt') || tipoSugerido
      }

      const precioDefault = tipoSugerido ? (preciosTiposLocal[tipoSugerido.id] ?? tipoSugerido.precio) : 1500
      return {
        ...prev,
        [id]: {
          ...fila,
          esRetornable: checked,
          nombreEnvase: checked && !fila.nombreEnvase ? (tipoSugerido?.nombre || '1lt') : fila.nombreEnvase,
          precioEnvase: checked && fila.precioEnvase === 0 ? precioDefault : fila.precioEnvase,
          modificado: true,
        },
      }
    })
  }

  // Cantidad total de productos marcados como retornables
  const cantRetornables = useMemo(() => {
    return Object.values(filas).filter((f) => f.esRetornable).length
  }, [filas])

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
      toast('No hay cambios pendientes en productos')
      onClose()
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
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Precios de Envases Retornables"
      size="2xl"
      footer={
        <div className="flex flex-col sm:flex-row items-center justify-between gap-2.5 w-full">
          <div className="text-xs text-gray-500 dark:text-gray-400 text-center sm:text-left">
            {pestanaActiva === 'DEPOSITO' ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                Los movimientos de stock y entregas a distribuidores se asientan automáticamente en tiempo real.
              </span>
            ) : cantModificados > 0 ? (
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                {cantModificados} {cantModificados === 1 ? 'producto modificado' : 'productos modificados'} sin guardar
              </span>
            ) : (
              <span>Mostrando {filasVisibles.length} productos en catálogo</span>
            )}
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              className="flex-1 sm:flex-none"
            >
              Cerrar
            </Button>
            {pestanaActiva !== 'DEPOSITO' && (
              <Button
                type="button"
                onClick={handleGuardarTodos}
                loading={guardando}
                disabled={cantModificados === 0}
                className="flex-1 sm:flex-none"
              >
                Guardar todos los cambios ({cantModificados})
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className="flex flex-col h-full space-y-3">
        {pestanaActiva === 'TIPOS' && <PreciosEnvasesCompartidos />}
        {/* Pestañas superiores para navegación fija */}
        <div className="flex items-center gap-1 border-b border-gray-200 dark:border-gray-700 pb-1">
          <button
            type="button"
            onClick={() => setPestanaActiva('TIPOS')}
            className={`px-3 sm:px-4 py-2 text-xs font-bold rounded-t-lg transition-colors cursor-pointer border-b-2 ${
              pestanaActiva === 'TIPOS'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            Tipos Oficiales ({tiposEnvases.length})
          </button>
          <button
            type="button"
            onClick={() => setPestanaActiva('PRODUCTOS')}
            className={`px-3 sm:px-4 py-2 text-xs font-bold rounded-t-lg transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
              pestanaActiva === 'PRODUCTOS'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <span>Productos del Catálogo</span>
            <span className="bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-1.5 py-0.5 text-[10px] rounded-full font-bold">
              {cantRetornables}
            </span>
          </button>
          <button
            type="button"
            onClick={() => setPestanaActiva('DEPOSITO')}
            className={`px-3 sm:px-4 py-2 text-xs font-bold rounded-t-lg transition-colors cursor-pointer border-b-2 flex items-center gap-1.5 ${
              pestanaActiva === 'DEPOSITO'
                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-indigo-50/50 dark:bg-indigo-950/30'
                : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'
            }`}
          >
            <span>Depósito de Vacíos</span>
            <span className="bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-1.5 py-0.5 text-[10px] rounded-full font-bold">
              {tiposEnvases.reduce((acc, t) => acc + (t.stock_vacios || 0), 0)} un.
            </span>
          </button>
        </div>

        {/* ── VISTA 1: TIPOS DE ENVASES OFICIALES (Sin desplazamiento, todo a la vista) ── */}
        {pestanaActiva === 'TIPOS' && (
          <div className="space-y-3.5 animate-in fade-in duration-150">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-gray-50 dark:bg-gray-800/60 p-3 rounded-xl border border-gray-200 dark:border-gray-700">
              <div>
                <p className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  Precios estándar por tipo de envase
                </p>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Podés modificar cada valor individualmente o ajustar todos conjuntamente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setMostrarPanelConjunto(!mostrarPanelConjunto)}
                className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer self-start sm:self-auto"
              >
                {mostrarPanelConjunto ? '✕ Ocultar ajuste conjunto' : 'Modificar conjuntamente'}
              </button>
            </div>

            {/* Panel desplegable de modificación conjunta */}
            {mostrarPanelConjunto && (
              <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl space-y-2.5">
                <span className="text-xs font-bold text-indigo-950 dark:text-indigo-200 block">
                  Ajuste simultáneo para todos los tipos de envases:
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="flex rounded-lg border border-gray-300 dark:border-gray-600 overflow-hidden text-xs bg-white dark:bg-gray-800">
                    <button
                      type="button"
                      onClick={() => setModoConjunto('PORCENTAJE')}
                      className={`px-3 py-1.5 font-semibold transition-colors ${
                        modoConjunto === 'PORCENTAJE'
                          ? 'bg-indigo-600 text-white'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
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
                    Aplicar a todos los tipos
                  </Button>
                </div>
              </div>
            )}

            {/* Cuadrícula fija de los 5 tipos oficiales */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tiposEnvases.map((tipo) => {
                const precioActual = preciosTiposLocal[tipo.id] ?? tipo.precio
                const prodsVinculados = conteoPorTipo[tipo.id] || 0
                return (
                  <div
                    key={tipo.id}
                    className="p-3.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs flex flex-col justify-between gap-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-bold text-sm text-gray-900 dark:text-gray-100">
                          {tipo.nombre}
                        </p>
                        <p className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5">
                          {prodsVinculados} {prodsVinculados === 1 ? 'producto vinculado' : 'productos vinculados'}
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleAplicarTipoAProductos(tipo)}
                        className="px-2 py-1 rounded-md text-[11px] font-semibold bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 transition-colors cursor-pointer"
                        title="Asignar este precio a los productos que usan este envase"
                      >
                        Sincronizar
                      </button>
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                      <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
                        Precio ($):
                      </span>
                      <div className="flex items-center gap-1">
                        <span className="text-gray-400 text-xs">$</span>
                        <input
                          type="number"
                          min="0"
                          step="50"
                          value={precioActual || ''}
                          onChange={(e) => handleCambioPrecioTipo(tipo.id, parseFloat(e.target.value) || 0)}
                          className="w-28 text-right text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 px-2.5 py-1 outline-none focus:border-indigo-500 font-bold tabular-nums"
                        />
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Acceso directo a la tabla de productos */}
            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/60 rounded-xl flex flex-col sm:flex-row items-center justify-between gap-2">
              <span className="text-xs text-emerald-900 dark:text-emerald-300">
                ¿Querés ver o cambiar qué producto tiene cada envase asignado?
              </span>
              <button
                type="button"
                onClick={() => setPestanaActiva('PRODUCTOS')}
                className="text-xs font-bold text-emerald-700 dark:text-emerald-400 hover:underline cursor-pointer whitespace-nowrap"
              >
                Ver productos del catálogo →
              </button>
            </div>
          </div>
        )}

        {/* ── VISTA 2: TABLA DE PRODUCTOS DEL CATÁLOGO (Solo scrollea la tabla, todo lo demás fijo) ── */}
        {pestanaActiva === 'PRODUCTOS' && (
          <div className="flex-1 flex flex-col min-h-0 space-y-2.5 animate-in fade-in duration-150">
            {/* Barra de búsqueda y filtro */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2">
              <div className="flex-1">
                <SearchInput
                  placeholder="Buscar por nombre de producto o tipo de envase..."
                  value={busqueda}
                  onChange={(e) => setBusqueda(e.target.value)}
                  onClear={() => setBusqueda('')}
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer select-none bg-gray-100 dark:bg-gray-700/60 px-2.5 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 flex-shrink-0">
                <input
                  type="checkbox"
                  checked={soloRetornables}
                  onChange={(e) => setSoloRetornables(e.target.checked)}
                  className="w-3.5 h-3.5 rounded text-indigo-600 focus:ring-indigo-500 border-gray-300 dark:border-gray-600"
                />
                <span className="font-medium">Solo retornables</span>
              </label>
            </div>

            {/* Tabla de productos con altura fija y scroll interno */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden flex-1 min-h-0 max-h-[360px] overflow-y-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead className="sticky top-0 bg-gray-100 dark:bg-gray-800/95 text-gray-700 dark:text-gray-200 uppercase text-[10px] font-semibold tracking-wider border-b border-gray-200 dark:border-gray-700 z-10">
                  <tr>
                    <th className="px-3 py-2.5 text-center w-16">Retornable</th>
                    <th className="px-3 py-2.5">Producto</th>
                    <th className="px-3 py-2.5">Tipo de envase oficial</th>
                    <th className="px-3 py-2.5 text-right w-36">Precio envase ($)</th>
                    <th className="px-3 py-2.5 text-center w-24">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60 bg-white dark:bg-gray-800">
                  {filasVisibles.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-10 text-center text-gray-400 dark:text-gray-500 space-y-2">
                        <p>No se encontraron productos con los filtros aplicados.</p>
                        {soloRetornables && cantRetornables === 0 && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => setSoloRetornables(false)}
                              className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer bg-indigo-50 dark:bg-indigo-950/40 px-3 py-1.5 rounded-lg border border-indigo-200 dark:border-indigo-800"
                            >
                              Ver todos los productos del catálogo para configurar envases →
                            </button>
                          </div>
                        )}
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
                            <span className="text-gray-400 text-xs">$</span>
                            <input
                              type="number"
                              min="0"
                              step="50"
                              disabled={!f.esRetornable}
                              value={f.precioEnvase || ''}
                              onChange={(e) => handleCambioPrecioProducto(f.id, parseFloat(e.target.value) || 0)}
                              placeholder="0"
                              className={`w-24 text-right text-xs rounded-md border px-2 py-1 outline-none tabular-nums font-bold transition-colors ${
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
        )}

        {/* ── VISTA 3: INVENTARIO Y DEPÓSITO DE ENVASES VACÍOS ── */}
        {pestanaActiva === 'DEPOSITO' && (
          <div className="space-y-3.5 animate-in fade-in duration-150 overflow-y-auto max-h-[62vh] pr-1">
            {/* Tarjetas de Resumen y Valuación */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block">
                  Envases Vacíos Físicos
                </span>
                <div className="text-2xl font-black text-emerald-700 dark:text-emerald-300 mt-0.5">
                  {tiposEnvases.reduce((acc, t) => acc + (t.stock_vacios || 0), 0)}{' '}
                  <span className="text-xs font-normal">unidades</span>
                </div>
                <p className="text-[10px] text-emerald-600 dark:text-emerald-400 mt-1">
                  En patio / depósito listos para entrega
                </p>
              </div>

              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-xl">
                <span className="text-[11px] font-semibold text-indigo-800 dark:text-indigo-300 block">
                  Valuación de Retorno
                </span>
                <div className="text-2xl font-black text-indigo-700 dark:text-indigo-300 mt-0.5">
                  {formatPrecio(
                    tiposEnvases.reduce((acc, t) => acc + (t.stock_vacios || 0) * (preciosTiposLocal[t.id] ?? t.precio), 0)
                  )}
                </div>
                <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1">
                  Capital recuperable con distribuidores
                </p>
              </div>

              <div className="p-3 bg-purple-50 dark:bg-purple-950/40 border border-purple-200 dark:border-purple-800 rounded-xl">
                <span className="text-[11px] font-semibold text-purple-800 dark:text-purple-300 block">
                  Movimientos Registrados
                </span>
                <div className="text-2xl font-black text-purple-700 dark:text-purple-300 mt-0.5">
                  {historialMovimientos.length}
                </div>
                <p className="text-[10px] text-purple-600 dark:text-purple-400 mt-1">
                  Ingresos, egresos y entregas auditadas
                </p>
              </div>
            </div>

            {/* Tabla de Existencias por Tipo de Envase */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-xs">
              <div className="p-2.5 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold text-gray-900 dark:text-gray-100">
                    Stock en Depósito por Tipo de Envase
                  </h3>
                  <p className="text-[11px] text-gray-500">
                    Registrá entregas de cajones al distribuidor o ajustá las existencias contadas.
                  </p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-gray-100 dark:bg-gray-700/50 text-gray-600 dark:text-gray-300 uppercase text-[10px] tracking-wider">
                    <tr>
                      <th className="px-3 py-2">Tipo de Envase</th>
                      <th className="px-3 py-2 text-right">Valor Unitario</th>
                      <th className="px-3 py-2 text-center">Stock en Depósito</th>
                      <th className="px-3 py-2 text-right">Valuación Subtotal</th>
                      <th className="px-3 py-2 text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {tiposEnvases.map((tipo) => {
                      const stock = tipo.stock_vacios || 0
                      const precio = preciosTiposLocal[tipo.id] ?? tipo.precio
                      const subtotal = stock * precio

                      return (
                        <tr key={tipo.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                          <td className="px-3 py-2.5">
                            <div className="font-bold text-gray-900 dark:text-gray-100">{tipo.nombre}</div>
                            {tipo.descripcion && (
                              <div className="text-[10px] text-gray-500 truncate max-w-xs">{tipo.descripcion}</div>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-gray-700 dark:text-gray-300">
                            {formatPrecio(precio)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleAjusteRapido(tipo.id, -1)}
                                disabled={stock <= 0}
                                className="w-6 h-6 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded disabled:opacity-30 cursor-pointer"
                                title="Restar 1 unidad"
                              >
                                -
                              </button>
                              <span
                                onClick={() => handleAbrirAjusteManual(tipo)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-black cursor-pointer border ${
                                  stock > 0
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                    : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 border-gray-200 dark:border-gray-600'
                                }`}
                                title="Clic para ingresar conteo manual exacto"
                              >
                                {stock} un.
                              </span>
                              <button
                                type="button"
                                onClick={() => handleAjusteRapido(tipo.id, 1)}
                                className="w-6 h-6 flex items-center justify-center font-bold text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 rounded cursor-pointer"
                                title="Sumar 1 unidad"
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-bold text-gray-900 dark:text-gray-100">
                            {formatPrecio(subtotal)}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <button
                              type="button"
                              onClick={() => handleAbrirEntrega(tipo)}
                              disabled={stock <= 0}
                              className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-200 dark:disabled:bg-gray-700 disabled:text-gray-400 text-white transition-all cursor-pointer inline-flex items-center gap-1 shadow-xs"
                              title="Asentar entrega de vacíos al camión del distribuidor"
                            >
                              <span>Entregar a Distribuidor</span>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Registro de Auditoría y Trazabilidad */}
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800 shadow-xs">
              <div className="p-2.5 bg-gray-50 dark:bg-gray-900/60 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-900 dark:text-gray-100">
                  Trazabilidad de Movimientos y Entregas
                </h4>
                <span className="text-[10px] text-gray-500">Últimos movimientos</span>
              </div>

              <div className="max-h-48 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700 text-[11px]">
                {historialMovimientos.length === 0 ? (
                  <div className="p-4 text-center text-gray-400 text-xs">
                    No se registraron movimientos de envases aún. Al recibir envases en el mostrador o entregarlos a distribuidores aparecerán aquí.
                  </div>
                ) : (
                  historialMovimientos.slice(0, 20).map((mov) => {
                    const esIngreso = mov.cantidad > 0
                    const esEntrega = mov.tipo === 'ENTREGA_DISTRIBUIDOR'

                    return (
                      <div key={mov.id} className="p-2.5 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/30">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              esEntrega
                                ? 'bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300'
                                : esIngreso
                                ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300'
                                : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300'
                            }`}
                          >
                            {esEntrega ? 'Entrega Distribuidor' : esIngreso ? 'Ingreso Mostrador' : 'Ajuste Stock'}
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-gray-800 dark:text-gray-200 truncate">
                              {mov.tipoEnvaseNombre} ({mov.cantidad > 0 ? `+${mov.cantidad}` : mov.cantidad} un.)
                              {mov.distribuidor && (
                                <span className="ml-1 text-gray-500 font-normal">→ {mov.distribuidor}</span>
                              )}
                            </p>
                            <p className="text-[10px] text-gray-400">
                              {new Date(mov.fecha).toLocaleString('es-AR')} • Por {mov.usuarioNombre || 'Usuario'}
                              {mov.notas && ` • ${mov.notas}`}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0">
                          <span className="text-[10px] text-gray-500">Saldo depósito:</span>
                          <div className="font-bold text-gray-900 dark:text-gray-100">
                            {mov.stockResultante} un.
                          </div>
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            {/* Submodal para Entrega a Distribuidor */}
            {entregaModalOpen && tipoParaEntrega && (
              <div className="fixed inset-0 z-60 bg-slate-950/65 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-100">
                <div
                  role="dialog"
                  aria-modal="true"
                  className="modal-container bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-slate-300 dark:border-gray-700 ring-1 ring-slate-900/15 dark:ring-white/10 max-w-md w-full p-4 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-gray-700 pb-2.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-gray-100">
                      Entregar {tipoParaEntrega.nombre} a Distribuidor
                    </h3>
                    <button
                      type="button"
                      onClick={() => setEntregaModalOpen(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 text-lg font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-3 text-xs">
                    <div className="bg-gray-50 dark:bg-gray-900/50 p-2.5 rounded-lg">
                      <span className="text-gray-500">Stock disponible en depósito:</span>
                      <div className="text-lg font-black text-gray-800 dark:text-gray-200">
                        {tipoParaEntrega.stock_vacios || 0} unidades
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Cantidad de envases a entregar
                      </label>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setCantidadEntrega((c) => Math.max(1, c - 1))}
                          className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 font-bold rounded-lg text-sm"
                        >
                          -
                        </button>
                        <input
                          type="number"
                          min="1"
                          max={Math.max(1, tipoParaEntrega.stock_vacios || 1)}
                          value={cantidadEntrega}
                          onChange={(e) => {
                            const maxStock = tipoParaEntrega.stock_vacios || 1
                            const val = parseInt(e.target.value, 10) || 1
                            setCantidadEntrega(Math.max(1, Math.min(maxStock, val)))
                          }}
                          className="flex-1 text-center font-bold text-base px-3 py-1.5 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                        />
                        <button
                          type="button"
                          onClick={() => setCantidadEntrega((c) => Math.min(tipoParaEntrega.stock_vacios || 1, c + 1))}
                          className="px-3 py-1.5 bg-gray-100 dark:bg-gray-700 font-bold rounded-lg text-sm"
                        >
                          +
                        </button>
                      </div>
                      <div className="flex gap-1.5 mt-1.5">
                        {[6, 12, 24, tipoParaEntrega.stock_vacios || 0]
                          .filter((v, i, a) => v > 0 && a.indexOf(v) === i && v <= (tipoParaEntrega.stock_vacios || 0))
                          .map((val) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => setCantidadEntrega(Math.min(tipoParaEntrega.stock_vacios || 1, val))}
                              className="px-2 py-0.5 rounded bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold text-[10px] hover:bg-indigo-100"
                            >
                              {val === (tipoParaEntrega.stock_vacios || 0) ? `Todos (${val})` : `${val} un.`}
                            </button>
                          ))}
                      </div>
                    </div>

                    <div>
                      <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Empresa Distribuidora / Fletero
                      </label>
                      <select
                        value={distribuidorEntrega}
                        onChange={(e) => setDistribuidorEntrega(e.target.value)}
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="Quilmes / Cervecería">Quilmes / Cervecería</option>
                        <option value="Coca-Cola / FEMSA">Coca-Cola / FEMSA</option>
                        <option value="Heineken / CCU">Heineken / CCU</option>
                        <option value="Soda / Sifones">Repartidor de Soda</option>
                        <option value="Distribuidora de Aguas">Distribuidora de Aguas</option>
                        <option value="OTRO">Otro proveedor / Fletero particular</option>
                      </select>
                    </div>

                    {distribuidorEntrega === 'OTRO' && (
                      <div>
                        <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                          Nombre del Proveedor / Fletero
                        </label>
                        <input
                          type="text"
                          value={distribuidorPersonalizado}
                          onChange={(e) => setDistribuidorPersonalizado(e.target.value)}
                          placeholder="Ej: Distribuidora Los Andes..."
                          className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block font-semibold text-gray-700 dark:text-gray-300 mb-1">
                        Observación / N° Remito (Opcional)
                      </label>
                      <input
                        type="text"
                        value={notasEntrega}
                        onChange={(e) => setNotasEntrega(e.target.value)}
                        placeholder="Ej: Remito N° 00412 / Chofer Juan..."
                        className="w-full px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <Button variant="secondary" size="sm" onClick={() => setEntregaModalOpen(false)}>
                      Cancelar
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleConfirmarEntrega}>
                      Confirmar Entrega
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Submodal para Ajuste Manual Directo */}
            {ajusteModalOpen && tipoParaAjuste && (
              <div className="fixed inset-0 z-60 bg-slate-950/65 dark:bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 animate-in fade-in duration-100">
                <div
                  role="dialog"
                  aria-modal="true"
                  className="modal-container bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border border-slate-300 dark:border-gray-700 ring-1 ring-slate-900/15 dark:ring-white/10 max-w-xs w-full p-4 space-y-3"
                >
                  <div className="flex items-center justify-between border-b border-slate-200 dark:border-gray-700 pb-2.5">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-gray-100">
                      Conteo de {tipoParaAjuste.nombre}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setAjusteModalOpen(false)}
                      className="text-slate-400 hover:text-slate-700 dark:hover:text-gray-200 text-lg font-bold"
                    >
                      ✕
                    </button>
                  </div>

                  <div className="space-y-2 text-xs">
                    <label className="block font-semibold text-gray-700 dark:text-gray-300">
                      Stock físico real contado en patio:
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={nuevoStockAjuste}
                      onChange={(e) => setNuevoStockAjuste(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full text-center font-bold text-xl px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-indigo-500"
                    />
                    <p className="text-[11px] text-gray-500">
                      Se actualizará el stock inmediatamente en el sistema.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2 border-t border-gray-100 dark:border-gray-700">
                    <Button variant="secondary" size="sm" onClick={() => setAjusteModalOpen(false)}>
                      Cancelar
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleConfirmarAjusteManual}>
                      Guardar Conteo
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  )
}
