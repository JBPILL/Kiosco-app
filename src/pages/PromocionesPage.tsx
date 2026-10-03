import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../stores/authStore'
import { usePromocionStore } from '../stores/promocionStore'
import { useCartStore } from '../stores/cartStore'
import { useProducts } from '../hooks/useProducts'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { SearchInput } from '../components/ui/SearchInput'
import { formatPrecio } from '../lib/utils'
import type { Promocion, TipoPromocion, ItemComboPromo } from '../types/database'
import toast from 'react-hot-toast'

const DIAS_SEMANA_OPCIONES = [
  { valor: 1, label: 'Lun', nombreCompleto: 'Lunes' },
  { valor: 2, label: 'Mar', nombreCompleto: 'Martes' },
  { valor: 3, label: 'Mié', nombreCompleto: 'Miércoles' },
  { valor: 4, label: 'Jue', nombreCompleto: 'Jueves' },
  { valor: 5, label: 'Vie', nombreCompleto: 'Viernes' },
  { valor: 6, label: 'Sáb', nombreCompleto: 'Sábado' },
  { valor: 0, label: 'Dom', nombreCompleto: 'Domingo' },
]

export function PromocionesPage() {
  const navigate = useNavigate()
  const { usuario } = useAuthStore()
  const { promociones, cargando, cargarPromociones, crearPromocion, actualizarPromocion, eliminarPromocion, toggleActiva } = usePromocionStore()
  const { recalcularPromociones } = useCartStore()
  const { productos, categorias, cargarProductos, cargarCategorias } = useProducts()

  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'ACTIVAS' | 'INACTIVAS'>('TODAS')
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | TipoPromocion>('TODOS')

  const [modalFormOpen, setModalFormOpen] = useState(false)
  const [promoEnEdicion, setPromoEnEdicion] = useState<Promocion | null>(null)
  const [guardando, setGuardando] = useState(false)

  // Campos de formulario
  const [nombre, setNombre] = useState('')
  const [tipo, setTipo] = useState<TipoPromocion>('NXM')
  const [ambito, setAmbito] = useState<'PRODUCTO' | 'CATEGORIA'>('PRODUCTO')
  const [productoId, setProductoId] = useState<string>('')
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [cantidadMinima, setCantidadMinima] = useState<string>('2')
  const [cantidadPaga, setCantidadPaga] = useState<string>('1')
  const [modoVolumen, setModoVolumen] = useState<'PRECIO' | 'PORCENTAJE'>('PRECIO')
  const [precioUnitarioPromo, setPrecioUnitarioPromo] = useState<string>('')
  const [descuentoPorcentaje, setDescuentoPorcentaje] = useState<string>('15')
  const [itemsCombo, setItemsCombo] = useState<ItemComboPromo[]>([])
  const [precioCombo, setPrecioCombo] = useState<string>('')
  const [productoParaComboId, setProductoParaComboId] = useState<string>('')
  const [cantidadParaCombo, setCantidadParaCombo] = useState<string>('1')
  const [diasSeleccionados, setDiasSeleccionados] = useState<number[]>([])
  const [fechaInicio, setFechaInicio] = useState<string>('')
  const [fechaFin, setFechaFin] = useState<string>('')
  const [activa, setActiva] = useState(true)
  const [filtroProductoModal, setFiltroProductoModal] = useState('')

  useEffect(() => {
    if (usuario?.kiosco_id) {
      cargarPromociones(usuario.kiosco_id)
      cargarProductos()
      cargarCategorias()
    }
  }, [usuario?.kiosco_id, cargarPromociones, cargarProductos, cargarCategorias])

  // Filtrado de promociones en la lista
  const promocionesFiltradas = useMemo(() => {
    return promociones.filter((p) => {
      // Filtro texto
      if (busqueda.trim()) {
        const q = busqueda.toLowerCase().trim()
        const nombreMatch = p.nombre.toLowerCase().includes(q)
        const prodMatch = p.producto?.descripcion?.toLowerCase().includes(q)
        const catMatch = p.categoria?.nombre?.toLowerCase().includes(q)
        if (!nombreMatch && !prodMatch && !catMatch) return false
      }
      // Filtro estado
      if (filtroEstado === 'ACTIVAS' && !p.activo) return false
      if (filtroEstado === 'INACTIVAS' && p.activo) return false
      // Filtro tipo
      if (filtroTipo !== 'TODOS' && p.tipo !== filtroTipo) return false

      return true
    })
  }, [promociones, busqueda, filtroEstado, filtroTipo])

  // Métricas
  const totalPromos = promociones.length
  const totalActivas = promociones.filter((p) => p.activo).length
  const totalCombos = promociones.filter((p) => p.tipo === 'COMBO').length
  const totalNxM = promociones.filter((p) => p.tipo === 'NXM').length
  const totalVolumen = promociones.filter((p) => p.tipo === 'VOLUMEN').length
  const totalPorcentaje = promociones.filter((p) => p.tipo === 'PORCENTAJE').length

  // Suma de precios regulares para el combo configurado en el modal
  const sumaRegularCombo = useMemo(() => {
    return itemsCombo.reduce((acc, it) => {
      const prod = productos.find((p) => p.id === it.producto_id)
      return acc + (prod ? prod.precio_venta * it.cantidad : 0)
    }, 0)
  }, [itemsCombo, productos])

  // Productos para el selector en el modal
  const productosFiltradosModal = useMemo(() => {
    if (!filtroProductoModal.trim()) return productos.slice(0, 30)
    const q = filtroProductoModal.toLowerCase().trim()
    return productos
      .filter((p) => p.descripcion.toLowerCase().includes(q) || p.codigo_barras?.includes(q))
      .slice(0, 30)
  }, [productos, filtroProductoModal])

  const productoSeleccionadoObj = useMemo(() => {
    return productos.find((p) => p.id === productoId)
  }, [productos, productoId])

  const abrirCrear = () => {
    setPromoEnEdicion(null)
    setNombre('')
    setTipo('NXM')
    setAmbito('PRODUCTO')
    setProductoId(productos.length > 0 ? productos[0].id : '')
    setCategoriaId(categorias.length > 0 ? categorias[0].id : '')
    setCantidadMinima('2')
    setCantidadPaga('1')
    setModoVolumen('PRECIO')
    setPrecioUnitarioPromo('')
    setDescuentoPorcentaje('15')
    setItemsCombo([])
    setPrecioCombo('')
    setProductoParaComboId('')
    setCantidadParaCombo('1')
    setDiasSeleccionados([])
    setFechaInicio('')
    setFechaFin('')
    setActiva(true)
    setFiltroProductoModal('')
    setModalFormOpen(true)
  }

  const abrirEditar = (p: Promocion) => {
    setPromoEnEdicion(p)
    setNombre(p.nombre)
    setTipo(p.tipo)
    setAmbito(p.producto_id ? 'PRODUCTO' : 'CATEGORIA')
    setProductoId(p.producto_id || (productos[0]?.id || ''))
    setCategoriaId(p.categoria_id || (categorias[0]?.id || ''))
    setCantidadMinima(p.cantidad_minima != null ? String(p.cantidad_minima) : (p.tipo === 'PORCENTAJE' ? '1' : '2'))
    setCantidadPaga(p.cantidad_paga != null ? String(p.cantidad_paga) : '1')
    setModoVolumen(p.precio_unitario_promo != null ? 'PRECIO' : 'PORCENTAJE')
    setPrecioUnitarioPromo(p.precio_unitario_promo != null ? String(p.precio_unitario_promo) : '')
    setDescuentoPorcentaje(p.descuento_porcentaje != null ? String(p.descuento_porcentaje) : '15')
    setItemsCombo(p.items_combo ? [...p.items_combo] : [])
    setPrecioCombo(p.precio_combo != null ? String(p.precio_combo) : '')
    setProductoParaComboId('')
    setCantidadParaCombo('1')
    setDiasSeleccionados(p.dias_semana || [])
    setFechaInicio(p.fecha_inicio || '')
    setFechaFin(p.fecha_fin || '')
    setActiva(p.activo)
    setFiltroProductoModal('')
    setModalFormOpen(true)
  }

  const handleCargarComboEnCarrito = (promo: Promocion) => {
    if (!promo.items_combo || promo.items_combo.length === 0) {
      toast.error('Este combo no tiene productos configurados')
      return
    }
    let agregados = 0
    for (const ic of promo.items_combo) {
      const prod = productos.find((p) => p.id === ic.producto_id)
      if (prod) {
        useCartStore.getState().agregarProducto(prod, ic.cantidad)
        agregados++
      }
    }
    if (agregados > 0) {
      toast.success(`Combo "${promo.nombre}" cargado en el ticket`)
      navigate('/')
    } else {
      toast.error('No se encontraron los productos del combo en el catálogo')
    }
  }

  const handleToggleDia = (dia: number) => {
    setDiasSeleccionados((prev) =>
      prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (guardando || !usuario?.kiosco_id) return

    if (!nombre.trim()) {
      toast.error('Ingresá un nombre identificador para la promoción')
      return
    }

    if (tipo !== 'COMBO') {
      if (ambito === 'PRODUCTO' && !productoId) {
        toast.error('Seleccioná un producto de destino')
        return
      }

      if (ambito === 'CATEGORIA' && !categoriaId) {
        toast.error('Seleccioná una categoría de destino')
        return
      }
    }

    let pComboNum: number | null = null
    if (tipo === 'COMBO') {
      if (itemsCombo.length < 2) {
        toast.error('Un combo debe incluir al menos 2 productos')
        return
      }
      pComboNum = parseFloat(precioCombo)
      if (isNaN(pComboNum) || pComboNum <= 0) {
        toast.error('Ingresá un precio especial de venta válido para el combo')
        return
      }
    }

    if (fechaInicio && fechaFin && fechaFin < fechaInicio) {
      toast.error('La fecha de fin no puede ser anterior a la fecha de inicio')
      return
    }

    const cantMinNum = Number(cantidadMinima)
    if (tipo !== 'COMBO' && (isNaN(cantMinNum) || cantMinNum < 1)) {
      toast.error('La cantidad mínima debe ser al menos 1')
      return
    }

    let cantPagaNum: number | null = null
    if (tipo === 'NXM') {
      if (cantMinNum < 2) {
        toast.error('Para una promo NxM, la cantidad mínima debe ser al menos 2 (ej. 2x1, 3x2)')
        return
      }
      cantPagaNum = Number(cantidadPaga)
      if (isNaN(cantPagaNum) || cantPagaNum < 1 || cantPagaNum >= cantMinNum) {
        toast.error(`Para una promo NxM, la cantidad a pagar debe ser menor a la cantidad llevada (ej. 2x1, 3x2)`)
        return
      }
    }

    let precioPromoNum: number | null = null
    let descPorcNum: number | null = null

    if (tipo === 'VOLUMEN') {
      if (cantMinNum < 2) {
        toast.error('Para una promoción por volumen, la cantidad mínima debe ser al menos 2')
        return
      }
      if (modoVolumen === 'PRECIO') {
        precioPromoNum = Number(precioUnitarioPromo)
        if (isNaN(precioPromoNum) || precioPromoNum <= 0) {
          toast.error('Ingresá un precio unitario promocional válido')
          return
        }
      } else {
        descPorcNum = Number(descuentoPorcentaje)
        if (isNaN(descPorcNum) || descPorcNum <= 0 || descPorcNum > 100) {
          toast.error('El porcentaje de descuento debe estar entre 1 y 100')
          return
        }
      }
    }

    if (tipo === 'PORCENTAJE') {
      descPorcNum = Number(descuentoPorcentaje)
      if (isNaN(descPorcNum) || descPorcNum <= 0 || descPorcNum > 100) {
        toast.error('El porcentaje de descuento debe estar entre 1 y 100')
        return
      }
    }

    const payload = {
      kiosco_id: usuario.kiosco_id,
      nombre: nombre.trim(),
      tipo,
      producto_id: tipo === 'COMBO' ? null : (ambito === 'PRODUCTO' ? productoId : null),
      categoria_id: tipo === 'COMBO' ? null : (ambito === 'CATEGORIA' ? categoriaId : null),
      cantidad_minima: tipo === 'COMBO' ? 1 : cantMinNum,
      cantidad_paga: cantPagaNum,
      precio_unitario_promo: precioPromoNum,
      descuento_porcentaje: descPorcNum,
      precio_combo: pComboNum,
      items_combo: tipo === 'COMBO' ? itemsCombo : null,
      dias_semana: diasSeleccionados.length > 0 ? diasSeleccionados : null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      activo: activa,
    }

    setGuardando(true)
    try {
      if (promoEnEdicion) {
        await actualizarPromocion(promoEnEdicion.id, payload)
      } else {
        await crearPromocion(payload)
      }

      recalcularPromociones()
      setModalFormOpen(false)
    } finally {
      setGuardando(false)
    }
  }

  const handleEliminar = async (id: string, nombrePromo: string) => {
    if (window.confirm(`¿Estás seguro de eliminar la promoción "${nombrePromo}"?`)) {
      await eliminarPromocion(id)
      recalcularPromociones()
    }
  }

  const handleToggle = async (id: string) => {
    await toggleActiva(id)
    recalcularPromociones()
  }

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-16">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Promociones y Ofertas
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
            Configurá reglas automáticas (2x1, 3x2, precios por volumen o % OFF) que se descuentan solas en el punto de venta.
          </p>
        </div>
      </div>

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3 sm:gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider">
            Total Reglas
          </p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
            {totalPromos}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <p className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            Activas Ahora
          </p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">
            {totalActivas}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <p className="text-xs font-semibold text-teal-600 dark:text-teal-400 uppercase tracking-wider">
            Combos
          </p>
          <p className="text-2xl font-bold text-teal-600 dark:text-teal-400 mt-1">
            {totalCombos}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <p className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
            NxM (2x1 / 3x2)
          </p>
          <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mt-1">
            {totalNxM}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 uppercase tracking-wider">
            Por Volumen
          </p>
          <p className="text-2xl font-bold text-purple-600 dark:text-purple-400 mt-1">
            {totalVolumen}
          </p>
        </div>
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
          <p className="text-xs font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-wider">
            % Descuento
          </p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {totalPorcentaje}
          </p>
        </div>
      </div>

      {/* Barra de Búsqueda y Filtros */}
      <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1">
            <SearchInput
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onClear={() => setBusqueda('')}
              placeholder="Buscar por nombre, producto o categoría..."
            />
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0 flex-wrap sm:flex-nowrap">
            {/* Filtro estado */}
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as any)}
              className="h-10 px-3 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="TODAS">Todos los estados</option>
              <option value="ACTIVAS">Solo Activas</option>
              <option value="INACTIVAS">Solo Pausadas</option>
            </select>

            {/* Filtro tipo */}
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value as any)}
              className="h-10 px-3 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:ring-2 focus:ring-indigo-500"
            >
              <option value="TODOS">Todos los tipos</option>
              <option value="COMBO">Combos / Packs</option>
              <option value="NXM">NxM (2x1, 3x2)</option>
              <option value="VOLUMEN">Por Volumen</option>
              <option value="PORCENTAJE">Porcentaje Directo</option>
            </select>

            <Button
              onClick={abrirCrear}
              variant="primary"
              className="h-10 px-4 text-xs font-semibold whitespace-nowrap flex-shrink-0 shadow-xs"
            >
              + Nueva Promoción
            </Button>
          </div>
        </div>
      </div>

      {/* Lista de Promociones */}
      {cargando ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-500 mt-2">Cargando promociones...</p>
        </div>
      ) : promocionesFiltradas.length === 0 ? (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-12 text-center text-gray-500 dark:text-gray-400">
          <p className="text-base font-semibold">No se encontraron promociones</p>
          <p className="text-xs mt-1">
            {busqueda || filtroEstado !== 'TODAS' || filtroTipo !== 'TODOS'
              ? 'Probá ajustando los filtros de búsqueda.'
              : 'Creá tu primera promoción con el botón "+ Nueva Promoción".'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3.5">
          {promocionesFiltradas.map((promo) => {
            const esCombo = promo.tipo === 'COMBO'
            const esNxM = promo.tipo === 'NXM'
            const esVolumen = promo.tipo === 'VOLUMEN'
            const esPorcentaje = promo.tipo === 'PORCENTAJE'

            return (
              <div
                key={promo.id}
                className={`relative flex flex-col justify-between p-3.5 sm:p-4 rounded-xl border transition-all ${
                  promo.activo
                    ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700'
                    : 'bg-gray-50 dark:bg-gray-900/60 border-gray-200 dark:border-gray-800 opacity-75'
                }`}
              >
                <div>
                  {/* Fila superior: Badges de Tipo, Estado y Precio Combo */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          esCombo
                            ? 'bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300 border border-teal-200 dark:border-teal-800/60'
                            : esNxM
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60'
                            : esVolumen
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                        }`}
                      >
                        {esCombo ? 'Combo Pack' : esNxM ? 'NxM' : esVolumen ? 'Por Volumen' : '% Descuento'}
                      </span>
                      {promo.activo ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/70 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60">
                          Activa
                        </span>
                      ) : (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-400">
                          En Pausa
                        </span>
                      )}
                    </div>

                    {esCombo && promo.precio_combo ? (
                      <span className="text-sm font-black text-teal-600 dark:text-teal-400 tabular-nums flex-shrink-0">
                        {formatPrecio(promo.precio_combo)}
                      </span>
                    ) : null}
                  </div>

                  {/* Título de la promo */}
                  <h3 className="text-sm sm:text-base font-bold text-gray-900 dark:text-gray-100 leading-snug">
                    {promo.nombre}
                  </h3>

                  {/* Destino (Producto, Categoría o Combo) */}
                  <div className="mt-1.5 text-xs text-gray-600 dark:text-gray-300">
                    {esCombo ? (
                      <div className="space-y-1">
                        <span className="font-semibold text-gray-700 dark:text-gray-300 text-[11px] block">
                          Incluye {promo.items_combo?.length || 0} productos:
                        </span>
                        <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
                          {promo.items_combo?.map((ic, idx) => {
                            const pObj = productos.find((p) => p.id === ic.producto_id)
                            return (
                              <span
                                key={idx}
                                className="inline-flex items-center px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700/70 text-[11px] text-gray-800 dark:text-gray-200 font-medium"
                              >
                                <strong>{ic.cantidad}{pObj?.unidad_medida === 'KG' ? 'kg' : 'u'}</strong>&nbsp;× {pObj?.descripcion || 'Producto'}
                              </span>
                            )
                          })}
                        </div>
                      </div>
                    ) : promo.producto ? (
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Producto:</span>
                        <span>{promo.producto.descripcion}</span>
                        <span className="text-gray-400 tabular-nums">({formatPrecio(promo.producto.precio_venta)})</span>
                      </div>
                    ) : promo.categoria ? (
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <span className="font-semibold text-gray-700 dark:text-gray-300">Categoría completa:</span>
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-medium">
                          {promo.categoria.nombre}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic text-xs">Sin asignación</span>
                    )}
                  </div>

                  {/* Regla explicada en texto claro */}
                  <div className="mt-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/60 text-xs">
                    {esCombo && (
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-[10px] text-gray-500 dark:text-gray-400 block leading-tight">Combo completo:</span>
                          <span className="text-teal-600 dark:text-teal-400 font-bold text-sm tabular-nums">
                            {formatPrecio(promo.precio_combo || 0)}
                          </span>
                        </div>
                        {promo.activo && (
                          <button
                            type="button"
                            onClick={() => handleCargarComboEnCarrito(promo)}
                            className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs rounded-lg active:scale-95 transition-all shadow-2xs flex-shrink-0 cursor-pointer"
                          >
                            + Cargar al Ticket
                          </button>
                        )}
                      </div>
                    )}
                    {esNxM && (
                      <p className="text-gray-800 dark:text-gray-200 font-medium text-xs">
                        Llevás <strong>{promo.cantidad_minima}</strong>, pagás <strong>{promo.cantidad_paga}</strong>{' '}
                        <span className="text-indigo-600 dark:text-indigo-400">
                          ({Number(promo.cantidad_minima) - Number(promo.cantidad_paga || 1)} unidad/es de regalo)
                        </span>
                      </p>
                    )}
                    {esVolumen && (
                      <p className="text-gray-800 dark:text-gray-200 font-medium text-xs">
                        Llevando <strong>{promo.cantidad_minima} o más</strong>:{' '}
                        {promo.precio_unitario_promo ? (
                          <span className="text-purple-600 dark:text-purple-400 font-bold">
                            {formatPrecio(promo.precio_unitario_promo)} c/u
                          </span>
                        ) : (
                          <span className="text-purple-600 dark:text-purple-400 font-bold">
                            {promo.descuento_porcentaje}% OFF
                          </span>
                        )}
                      </p>
                    )}
                    {esPorcentaje && (
                      <p className="text-gray-800 dark:text-gray-200 font-medium text-xs">
                        {Number(promo.cantidad_minima) > 1 ? (
                          <>
                            Llevando <strong>{promo.cantidad_minima} o más</strong>: descuento de{' '}
                            <span className="text-amber-600 dark:text-amber-400 font-bold">
                              {promo.descuento_porcentaje}% OFF
                            </span>{' '}
                            en cada unidad.
                          </>
                        ) : (
                          <>
                            Descuento directo de{' '}
                            <span className="text-amber-600 dark:text-amber-400 font-bold">
                              {promo.descuento_porcentaje}% OFF
                            </span>{' '}
                            en cada unidad.
                          </>
                        )}
                      </p>
                    )}
                  </div>

                  {/* Días y Vigencia */}
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-1.5 text-[10px] text-gray-500 dark:text-gray-400">
                    <div className="flex items-center gap-1">
                      <span className="font-semibold text-gray-600 dark:text-gray-400">Días:</span>
                      {promo.dias_semana && promo.dias_semana.length > 0 ? (
                        <div className="flex gap-0.5">
                          {DIAS_SEMANA_OPCIONES.map((dia) => {
                            const seleccionado = promo.dias_semana?.includes(dia.valor)
                            return (
                              <span
                                key={dia.valor}
                                className={`px-1 rounded text-[9px] font-bold ${
                                  seleccionado
                                    ? 'bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300'
                                    : 'text-gray-300 dark:text-gray-600'
                                }`}
                              >
                                {dia.label}
                              </span>
                            )
                          })}
                        </div>
                      ) : (
                        <span>Todos los días</span>
                      )}
                    </div>

                    {(promo.fecha_inicio || promo.fecha_fin) && (
                      <span className="text-[10px] text-gray-400">
                        {promo.fecha_inicio ? `Desde: ${promo.fecha_inicio}` : ''}{' '}
                        {promo.fecha_fin ? `Hasta: ${promo.fecha_fin}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Acciones: Pausar, Editar y Eliminar agrupados con diseño intuitivo y visible */}
                <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/80 flex items-center justify-end gap-1.5 flex-wrap">
                  {/* Botón Pausar / Activar */}
                  <button
                    type="button"
                    onClick={() => handleToggle(promo.id)}
                    title={promo.activo ? 'Pausar promoción temporalmente' : 'Activar promoción'}
                    className={`inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap ${
                      promo.activo
                        ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                        : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                    }`}
                  >
                    {promo.activo ? 'Pausar' : 'Activar'}
                  </button>

                  {/* Botón Editar */}
                  <button
                    type="button"
                    onClick={() => abrirEditar(promo)}
                    title="Modificar regla o precios de esta promoción"
                    className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    Editar
                  </button>

                  {/* Botón Eliminar */}
                  <button
                    type="button"
                    onClick={() => handleEliminar(promo.id, promo.nombre)}
                    title="Eliminar esta promoción permanentemente"
                    className="inline-flex items-center px-2.5 py-1.5 rounded-lg text-xs font-semibold text-red-600 dark:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal Crear / Editar Promoción */}
      <Modal
        isOpen={modalFormOpen}
        onClose={() => setModalFormOpen(false)}
        title={promoEnEdicion ? 'Editar Regla de Promoción' : 'Nueva Regla de Promoción'}
        size="lg"
        footer={
          <div className="flex justify-end gap-2 w-full">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalFormOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" form="modal-promo-form" variant="primary" disabled={guardando}>
              {guardando ? 'Guardando...' : (promoEnEdicion ? 'Guardar Cambios' : 'Crear Promoción')}
            </Button>
          </div>
        }
      >
        <form id="modal-promo-form" onSubmit={handleSubmit} className="space-y-3">
          {/* Nombre */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Nombre de la Promoción *
            </label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ej: 2x1 Alfajores Jorgito, Promo Cervezas 3x2, etc."
              required
            />
          </div>

          {/* Tipo de Regla */}
          <div>
            <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
              Tipo de Promoción
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => {
                  setTipo('NXM')
                  if (Number(cantidadMinima) < 2) setCantidadMinima('2')
                  if (Number(cantidadPaga) < 1) setCantidadPaga('1')
                }}
                className={`p-2 rounded-xl border text-left transition-all ${
                  tipo === 'NXM'
                    ? 'border-indigo-600 bg-indigo-50/80 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-bold ring-2 ring-indigo-500'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <p className="text-xs font-bold">NxM (Llevá X, Pagá Y)</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">2x1, 3x2, 4x3</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipo('VOLUMEN')
                  if (Number(cantidadMinima) < 2) setCantidadMinima('2')
                }}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  tipo === 'VOLUMEN'
                    ? 'border-purple-600 bg-purple-50/80 dark:bg-purple-950/40 text-purple-900 dark:text-purple-200 font-bold ring-2 ring-purple-500'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <p className="text-xs font-bold">Por Volumen</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Precio mayorista x cant</p>
              </button>
              <button
                type="button"
                onClick={() => {
                  setTipo('PORCENTAJE')
                  if (!cantidadMinima || Number(cantidadMinima) < 1) setCantidadMinima('1')
                }}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  tipo === 'PORCENTAJE'
                    ? 'border-amber-600 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-bold ring-2 ring-amber-500'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <p className="text-xs font-bold">Descuento Directo</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">% de descuento fijo</p>
              </button>
              <button
                type="button"
                onClick={() => setTipo('COMBO')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  tipo === 'COMBO'
                    ? 'border-teal-600 bg-teal-50/80 dark:bg-teal-950/40 text-teal-900 dark:text-teal-200 font-bold ring-2 ring-teal-500'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <p className="text-xs font-bold">Combo / Pack</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">Varios productos juntos</p>
              </button>
            </div>
          </div>

          {/* Ámbito: Producto vs Categoría (Solo para promociones individuales) */}
          {tipo !== 'COMBO' && (
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                ¿A qué se aplica?
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAmbito('PRODUCTO')}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold ${
                    ambito === 'PRODUCTO'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  Producto Específico
                </button>
                <button
                  type="button"
                  onClick={() => setAmbito('CATEGORIA')}
                  className={`flex-1 py-1.5 rounded-lg border text-xs font-semibold ${
                    ambito === 'CATEGORIA'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                  }`}
                >
                  Categoría Completa
                </button>
              </div>
            </div>
          )}

          {/* Selector de Producto */}
          {tipo !== 'COMBO' && ambito === 'PRODUCTO' && (
            <div className="space-y-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                Seleccionar Producto
              </label>
              <input
                type="text"
                value={filtroProductoModal}
                onChange={(e) => setFiltroProductoModal(e.target.value)}
                placeholder="Filtrar productos por nombre o código..."
                className="w-full h-8 px-2.5 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
              <select
                value={productoId}
                onChange={(e) => setProductoId(e.target.value)}
                className="w-full h-9 px-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                required
              >
                <option value="">-- Seleccionar producto --</option>
                {productosFiltradosModal.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.descripcion} ({formatPrecio(p.precio_venta)})
                  </option>
                ))}
              </select>
              {productoSeleccionadoObj && (
                <p className="text-[11px] text-gray-500">
                  Precio venta actual: <strong>{formatPrecio(productoSeleccionadoObj.precio_venta)}</strong> | Stock: {productoSeleccionadoObj.stock_actual}
                </p>
              )}
            </div>
          )}

          {/* Selector de Categoría */}
          {tipo !== 'COMBO' && ambito === 'CATEGORIA' && (
            <div className="space-y-2 p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                Seleccionar Categoría
              </label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="w-full h-9 px-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                required
              >
                <option value="">-- Seleccionar categoría --</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Constructor de COMBO / PACK */}
          {tipo === 'COMBO' && (
            <div className="space-y-3 p-3.5 rounded-xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-800 dark:text-gray-200">
                  Productos que integran el combo *
                </label>
                <span className="text-[11px] text-gray-500">Mínimo 2 productos</span>
              </div>

              {/* Lista de productos ya agregados al combo */}
              {itemsCombo.length === 0 ? (
                <p className="text-xs text-gray-500 italic p-3 bg-white dark:bg-gray-800 rounded-lg border border-dashed border-gray-300 dark:border-gray-700 text-center">
                  El combo aún no tiene productos. Agregá al menos 2 productos abajo.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {itemsCombo.map((ic, idx) => {
                    const prod = productos.find((p) => p.id === ic.producto_id)
                    const subtotalItem = prod ? prod.precio_venta * ic.cantidad : 0
                    return (
                      <div
                        key={idx}
                        className="flex items-center justify-between gap-2 p-2 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-gray-900 dark:text-gray-100 truncate">
                            {prod?.descripcion || 'Producto'}
                          </p>
                          <p className="text-[10px] text-gray-500">
                            Unitario: {prod ? formatPrecio(prod.precio_venta) : '$0'}
                          </p>
                        </div>

                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min="0.001"
                            step="any"
                            value={ic.cantidad}
                            onChange={(e) => {
                              const nuevaCant = parseFloat(e.target.value) || 0
                              setItemsCombo((prev) =>
                                prev.map((item, i) => (i === idx ? { ...item, cantidad: nuevaCant } : item))
                              )
                            }}
                            className="w-20 h-7 text-xs font-semibold text-center border border-gray-200 dark:border-gray-700 rounded bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100"
                            placeholder="Cant"
                          />
                          <span className="text-xs text-gray-500 w-6">
                            {prod?.unidad_medida === 'KG' ? 'kg' : 'u.'}
                          </span>
                          <span className="text-xs font-bold text-gray-700 dark:text-gray-300 w-16 text-right tabular-nums">
                            {formatPrecio(subtotalItem)}
                          </span>
                          <button
                            type="button"
                            onClick={() => setItemsCombo((prev) => prev.filter((_, i) => i !== idx))}
                            className="p-1 text-red-600 hover:text-red-700 text-xs font-bold"
                            title="Quitar del combo"
                          >
                            ✕
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Selector para agregar producto al combo */}
              <div className="pt-2 border-t border-teal-200 dark:border-teal-800/60 space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2">
                  <div className="sm:col-span-8">
                    <select
                      value={productoParaComboId}
                      onChange={(e) => setProductoParaComboId(e.target.value)}
                      className="w-full h-8 px-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                    >
                      <option value="">-- Seleccionar producto para agregar --</option>
                      {productos.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.descripcion} ({formatPrecio(p.precio_venta)} {p.unidad_medida === 'KG' ? '/kg' : 'c/u'})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <input
                      type="number"
                      min="0.001"
                      step="any"
                      value={cantidadParaCombo}
                      onChange={(e) => setCantidadParaCombo(e.target.value)}
                      placeholder="Cant / kg"
                      className="w-full h-8 px-2 text-xs rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-medium text-center"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="w-full h-8 text-xs font-bold whitespace-nowrap"
                      onClick={() => {
                        if (!productoParaComboId) {
                          toast.error('Seleccioná un producto para agregar al combo')
                          return
                        }
                        const cantNum = parseFloat(cantidadParaCombo)
                        if (isNaN(cantNum) || cantNum <= 0) {
                          toast.error('Ingresá una cantidad válida')
                          return
                        }
                        if (itemsCombo.some((it) => it.producto_id === productoParaComboId)) {
                          toast.error('Este producto ya está en el combo')
                          return
                        }
                        setItemsCombo((prev) => [
                          ...prev,
                          { producto_id: productoParaComboId, cantidad: cantNum },
                        ])
                        setProductoParaComboId('')
                        setCantidadParaCombo('1')
                      }}
                    >
                      + Agregar
                    </Button>
                  </div>
                </div>
              </div>

              {/* Definición del Precio Promocional del Combo */}
              <div className="p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 space-y-2">
                <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
                  <span>Suma regular individual:</span>
                  <span className="font-bold tabular-nums text-gray-900 dark:text-gray-100">
                    {formatPrecio(sumaRegularCombo)}
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-teal-700 dark:text-teal-300 mb-1">
                    Precio Especial del Combo Completo ($) *
                  </label>
                  <Input
                    type="number"
                    min="1"
                    step="any"
                    value={precioCombo}
                    onChange={(e) => setPrecioCombo(e.target.value)}
                    placeholder="Ej: 8500"
                    required
                  />
                </div>

                {Number(precioCombo) > 0 && sumaRegularCombo > 0 && (
                  <div className="flex items-center justify-between text-xs p-2 rounded bg-teal-50 dark:bg-teal-950/40 text-teal-800 dark:text-teal-300 font-semibold">
                    <span>Ahorro del cliente:</span>
                    <span>
                      {formatPrecio(Math.max(0, sumaRegularCombo - Number(precioCombo)))} ({sumaRegularCombo > 0 ? Math.round((Math.max(0, sumaRegularCombo - Number(precioCombo)) / sumaRegularCombo) * 100) : 0}% OFF)
                    </span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Configuración según el tipo seleccionado (NxM, Volumen, Porcentaje) */}
          {tipo !== 'COMBO' && (
            <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 space-y-3">
              {tipo === 'NXM' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Llevás (Unidades) *
                    </label>
                    <Input
                      type="number"
                      min="2"
                      step="1"
                      value={cantidadMinima}
                      onChange={(e) => setCantidadMinima(e.target.value)}
                      placeholder="Ej: 2, 3"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Pagás (Unidades) *
                    </label>
                    <Input
                      type="number"
                      min="1"
                      step="1"
                      value={cantidadPaga}
                      onChange={(e) => setCantidadPaga(e.target.value)}
                      placeholder="Ej: 1, 2"
                      required
                    />
                  </div>
                  <div className="col-span-2 text-xs text-indigo-700 dark:text-indigo-300 font-medium">
                    Vista previa: Promoción {cantidadMinima}x{cantidadPaga} — El cliente paga {cantidadPaga} por cada {cantidadMinima} unidades.
                  </div>
                </div>
              )}

              {tipo === 'VOLUMEN' && (
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      A partir de cuántas unidades *
                    </label>
                    <Input
                      type="number"
                      min="2"
                      step="1"
                      value={cantidadMinima}
                      onChange={(e) => setCantidadMinima(e.target.value)}
                      placeholder="Ej: 3, 6, 12"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                      Beneficio por escala
                    </label>
                    <div className="flex gap-2 mb-2">
                      <button
                        type="button"
                        onClick={() => setModoVolumen('PRECIO')}
                        className={`flex-1 py-1 text-xs font-semibold rounded ${
                          modoVolumen === 'PRECIO'
                            ? 'bg-purple-600 text-white'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border'
                        }`}
                      >
                        Precio Unitario Especial ($)
                      </button>
                      <button
                        type="button"
                        onClick={() => setModoVolumen('PORCENTAJE')}
                        className={`flex-1 py-1 text-xs font-semibold rounded ${
                          modoVolumen === 'PORCENTAJE'
                            ? 'bg-purple-600 text-white'
                            : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border'
                        }`}
                      >
                        Porcentaje OFF (%)
                      </button>
                    </div>
                    {modoVolumen === 'PRECIO' ? (
                      <div>
                        <Input
                          type="number"
                          min="1"
                          step="1"
                          value={precioUnitarioPromo}
                          onChange={(e) => setPrecioUnitarioPromo(e.target.value)}
                          placeholder="Ej: 800"
                          required
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                          Cada unidad costará este importe llevando {cantidadMinima} o más.
                        </p>
                      </div>
                    ) : (
                      <div>
                        <Input
                          type="number"
                          min="1"
                          max="100"
                          step="1"
                          value={descuentoPorcentaje}
                          onChange={(e) => setDescuentoPorcentaje(e.target.value)}
                          placeholder="Ej: 15"
                          required
                        />
                        <p className="text-[11px] text-gray-500 mt-1">
                          Se descontará este porcentaje en cada unidad llevando {cantidadMinima} o más.
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {tipo === 'PORCENTAJE' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        A partir de cuántas unidades *
                      </label>
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={cantidadMinima}
                        onChange={(e) => setCantidadMinima(e.target.value)}
                        placeholder="Ej: 1, 3, 5"
                        required
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                        Porcentaje de Descuento (%) *
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max="100"
                        step="any"
                        value={descuentoPorcentaje}
                        onChange={(e) => setDescuentoPorcentaje(e.target.value)}
                        placeholder="Ej: 10, 15, 20"
                        required
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400">
                    {Number(cantidadMinima) > 1
                      ? `Llevando ${cantidadMinima} o más unidades, se descontará un ${descuentoPorcentaje || 0}% en cada una.`
                      : `Se descontará un ${descuentoPorcentaje || 0}% directo desde la primera unidad.`}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Días de la semana */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300">
                Días de Vigencia
              </label>
              <button
                type="button"
                onClick={() => setDiasSeleccionados([])}
                className="text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline"
              >
                {diasSeleccionados.length === 0 ? 'Todos los días' : 'Marcar todos los días'}
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap">
              {DIAS_SEMANA_OPCIONES.map((dia) => {
                const checked = diasSeleccionados.includes(dia.valor)
                return (
                  <button
                    key={dia.valor}
                    type="button"
                    onClick={() => handleToggleDia(dia.valor)}
                    className={`px-3 py-1 text-xs font-bold rounded-lg border transition-all ${
                      checked
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {dia.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Rango de fechas opcional */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Fecha Desde (Opcional)
              </label>
              <Input
                type="date"
                value={fechaInicio}
                onChange={(e) => setFechaInicio(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                Fecha Hasta (Opcional)
              </label>
              <Input
                type="date"
                value={fechaFin}
                onChange={(e) => setFechaFin(e.target.value)}
              />
            </div>
          </div>

          {/* Estado Activo */}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="activa_check"
              checked={activa}
              onChange={(e) => setActiva(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <label htmlFor="activa_check" className="text-xs font-semibold text-gray-700 dark:text-gray-300 cursor-pointer">
              Promoción activa inmediatamente al guardar
            </label>
          </div>
        </form>
      </Modal>
    </div>
  )
}
