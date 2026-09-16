import { useState, useEffect, useMemo } from 'react'
import { useAuthStore } from '../stores/authStore'
import { usePromocionStore } from '../stores/promocionStore'
import { useCartStore } from '../stores/cartStore'
import { useProducts } from '../hooks/useProducts'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { SearchInput } from '../components/ui/SearchInput'
import { formatPrecio } from '../lib/utils'
import type { Promocion, TipoPromocion } from '../types/database'
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
  const { usuario } = useAuthStore()
  const { promociones, cargando, cargarPromociones, crearPromocion, actualizarPromocion, eliminarPromocion, toggleActiva } = usePromocionStore()
  const { recalcularPromociones } = useCartStore()
  const { productos, categorias, cargarProductos, cargarCategorias } = useProducts()

  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'TODAS' | 'ACTIVAS' | 'INACTIVAS'>('TODAS')
  const [filtroTipo, setFiltroTipo] = useState<'TODOS' | TipoPromocion>('TODOS')

  const [modalFormOpen, setModalFormOpen] = useState(false)
  const [promoEnEdicion, setPromoEnEdicion] = useState<Promocion | null>(null)

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
  const totalNxM = promociones.filter((p) => p.tipo === 'NXM').length
  const totalVolumen = promociones.filter((p) => p.tipo === 'VOLUMEN').length
  const totalPorcentaje = promociones.filter((p) => p.tipo === 'PORCENTAJE').length

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
    setCantidadMinima(String(p.cantidad_minima || 2))
    setCantidadPaga(p.cantidad_paga ? String(p.cantidad_paga) : '1')
    setModoVolumen(p.precio_unitario_promo ? 'PRECIO' : 'PORCENTAJE')
    setPrecioUnitarioPromo(p.precio_unitario_promo ? String(p.precio_unitario_promo) : '')
    setDescuentoPorcentaje(p.descuento_porcentaje ? String(p.descuento_porcentaje) : '15')
    setDiasSeleccionados(p.dias_semana || [])
    setFechaInicio(p.fecha_inicio || '')
    setFechaFin(p.fecha_fin || '')
    setActiva(p.activo)
    setFiltroProductoModal('')
    setModalFormOpen(true)
  }

  const handleToggleDia = (dia: number) => {
    setDiasSeleccionados((prev) =>
      prev.includes(dia) ? prev.filter((d) => d !== dia) : [...prev, dia]
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!usuario?.kiosco_id) return

    if (!nombre.trim()) {
      toast.error('Ingresá un nombre identificador para la promoción')
      return
    }

    if (ambito === 'PRODUCTO' && !productoId) {
      toast.error('Seleccioná un producto de destino')
      return
    }

    if (ambito === 'CATEGORIA' && !categoriaId) {
      toast.error('Seleccioná una categoría de destino')
      return
    }

    const cantMinNum = Number(cantidadMinima)
    if (isNaN(cantMinNum) || cantMinNum < 1) {
      toast.error('La cantidad mínima debe ser al menos 1')
      return
    }

    let cantPagaNum: number | null = null
    if (tipo === 'NXM') {
      cantPagaNum = Number(cantidadPaga)
      if (isNaN(cantPagaNum) || cantPagaNum < 1 || cantPagaNum >= cantMinNum) {
        toast.error(`Para una promo NxM, la cantidad a pagar debe ser menor a la cantidad llevada (ej. 2x1, 3x2)`)
        return
      }
    }

    let precioPromoNum: number | null = null
    let descPorcNum: number | null = null

    if (tipo === 'VOLUMEN') {
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
      producto_id: ambito === 'PRODUCTO' ? productoId : null,
      categoria_id: ambito === 'CATEGORIA' ? categoriaId : null,
      cantidad_minima: cantMinNum,
      cantidad_paga: cantPagaNum,
      precio_unitario_promo: precioPromoNum,
      descuento_porcentaje: descPorcNum,
      dias_semana: diasSeleccionados.length > 0 ? diasSeleccionados : null,
      fecha_inicio: fechaInicio || null,
      fecha_fin: fechaFin || null,
      activo: activa,
    }

    if (promoEnEdicion) {
      await actualizarPromocion(promoEnEdicion.id, payload)
    } else {
      await crearPromocion(payload)
    }

    recalcularPromociones()
    setModalFormOpen(false)
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Promociones y Ofertas
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Configurá reglas automáticas (2x1, 3x2, precios por volumen o % OFF) que se descuentan solas en el punto de venta.
          </p>
        </div>
        <Button onClick={abrirCrear} variant="primary" className="whitespace-nowrap flex-shrink-0">
          + Nueva Promoción
        </Button>
      </div>

      {/* Tarjetas de Métricas */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 sm:gap-4">
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
        <div className="col-span-2 sm:col-span-1 bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs">
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
          <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
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
              <option value="NXM">NxM (2x1, 3x2)</option>
              <option value="VOLUMEN">Por Volumen</option>
              <option value="PORCENTAJE">Porcentaje Directo</option>
            </select>
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {promocionesFiltradas.map((promo) => {
            const esNxM = promo.tipo === 'NXM'
            const esVolumen = promo.tipo === 'VOLUMEN'
            const esPorcentaje = promo.tipo === 'PORCENTAJE'

            return (
              <div
                key={promo.id}
                className={`relative flex flex-col justify-between p-4 rounded-xl border transition-all ${
                  promo.activo
                    ? 'bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 shadow-xs hover:border-indigo-300 dark:hover:border-indigo-700'
                    : 'bg-gray-50 dark:bg-gray-900/60 border-gray-200 dark:border-gray-800 opacity-70'
                }`}
              >
                <div>
                  {/* Fila superior: Tipo y Estado */}
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                          esNxM
                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60'
                            : esVolumen
                            ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/70 dark:text-purple-300 border border-purple-200 dark:border-purple-800/60'
                            : 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                        }`}
                      >
                        {esNxM ? 'NxM' : esVolumen ? 'Por Volumen' : '% Descuento'}
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

                    {/* Switch rápido de activar/pausar */}
                    <button
                      type="button"
                      onClick={() => handleToggle(promo.id)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-lg transition-all ${
                        promo.activo
                          ? 'bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800/60'
                          : 'bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/60'
                      }`}
                    >
                      {promo.activo ? 'Pausar' : 'Activar'}
                    </button>
                  </div>

                  {/* Título de la promo */}
                  <h3 className="text-base font-bold text-gray-900 dark:text-gray-100">
                    {promo.nombre}
                  </h3>

                  {/* Destino (Producto o Categoría) */}
                  <div className="mt-1 text-xs text-gray-600 dark:text-gray-300">
                    {promo.producto ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">Producto:</span>
                        <span>{promo.producto.descripcion}</span>
                        <span className="text-gray-400 font-mono">({formatPrecio(promo.producto.precio_venta)})</span>
                      </div>
                    ) : promo.categoria ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-gray-800 dark:text-gray-200">Categoría completa:</span>
                        <span className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-700 font-medium">
                          {promo.categoria.nombre}
                        </span>
                      </div>
                    ) : (
                      <span className="text-gray-400 italic">Sin asignación</span>
                    )}
                  </div>

                  {/* Regla explicada en texto claro */}
                  <div className="mt-2.5 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900/50 border border-gray-100 dark:border-gray-700/60 text-xs">
                    {esNxM && (
                      <p className="text-gray-800 dark:text-gray-200 font-medium">
                        Llevás <strong>{promo.cantidad_minima}</strong>, pagás <strong>{promo.cantidad_paga}</strong>{' '}
                        <span className="text-indigo-600 dark:text-indigo-400">
                          ({Number(promo.cantidad_minima) - Number(promo.cantidad_paga || 1)} unidad/es de regalo por cada {promo.cantidad_minima})
                        </span>
                      </p>
                    )}
                    {esVolumen && (
                      <p className="text-gray-800 dark:text-gray-200 font-medium">
                        Llevando <strong>{promo.cantidad_minima} o más</strong> unidades:{' '}
                        {promo.precio_unitario_promo ? (
                          <span className="text-purple-600 dark:text-purple-400 font-bold">
                            {formatPrecio(promo.precio_unitario_promo)} c/u
                          </span>
                        ) : (
                          <span className="text-purple-600 dark:text-purple-400 font-bold">
                            {promo.descuento_porcentaje}% de descuento
                          </span>
                        )}
                      </p>
                    )}
                    {esPorcentaje && (
                      <p className="text-gray-800 dark:text-gray-200 font-medium">
                        Descuento directo de{' '}
                        <span className="text-amber-600 dark:text-amber-400 font-bold">
                          {promo.descuento_porcentaje}% OFF
                        </span>{' '}
                        en cada unidad.
                      </p>
                    )}
                  </div>

                  {/* Días y Vigencia */}
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-gray-500 dark:text-gray-400">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">Días:</span>
                    {promo.dias_semana && promo.dias_semana.length > 0 ? (
                      <div className="flex gap-1">
                        {DIAS_SEMANA_OPCIONES.map((dia) => {
                          const seleccionado = promo.dias_semana?.includes(dia.valor)
                          return (
                            <span
                              key={dia.valor}
                              className={`px-1 rounded text-[10px] font-bold ${
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

                    {(promo.fecha_inicio || promo.fecha_fin) && (
                      <span className="ml-auto text-[10px] text-gray-400">
                        {promo.fecha_inicio ? `Desde: ${promo.fecha_inicio}` : ''}{' '}
                        {promo.fecha_fin ? `Hasta: ${promo.fecha_fin}` : ''}
                      </span>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/80 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => abrirEditar(promo)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleEliminar(promo.id, promo.nombre)}
                    className="px-2.5 py-1 text-xs font-medium rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors"
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
      >
        <form onSubmit={handleSubmit} className="space-y-4">
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
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTipo('NXM')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
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
                onClick={() => setTipo('VOLUMEN')}
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
                onClick={() => setTipo('PORCENTAJE')}
                className={`p-2.5 rounded-xl border text-left transition-all ${
                  tipo === 'PORCENTAJE'
                    ? 'border-amber-600 bg-amber-50/80 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-bold ring-2 ring-amber-500'
                    : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
              >
                <p className="text-xs font-bold">Descuento Directo</p>
                <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5">% de descuento fijo</p>
              </button>
            </div>
          </div>

          {/* Ámbito: Producto vs Categoría */}
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

          {/* Selector de Producto */}
          {ambito === 'PRODUCTO' && (
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
          {ambito === 'CATEGORIA' && (
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

          {/* Configuración según el tipo seleccionado */}
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
              <div>
                <label className="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                  Porcentaje de Descuento (%) *
                </label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={descuentoPorcentaje}
                  onChange={(e) => setDescuentoPorcentaje(e.target.value)}
                  placeholder="Ej: 10, 15, 20"
                  required
                />
              </div>
            )}
          </div>

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

          {/* Botones */}
          <div className="pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalFormOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" variant="primary">
              {promoEnEdicion ? 'Guardar Cambios' : 'Crear Promoción'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
