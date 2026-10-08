import { useState, useMemo, useEffect } from 'react'
import { Modal } from '../ui/Modal'
import { Button } from '../ui/Button'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import { getCachedProductos, saveCachedProductos } from '../../lib/utils'
import type { ProductoMaestro } from '../../data/catalogoMaestroArgentino'
import { obtenerCatalogoPorRubro, esCatalogoPlantilla } from '../../data/catalogosPorRubro'
import { useTenantConfig } from '../../hooks/useTenantConfig'
import type { Categoria, Producto } from '../../types/database'
import { v4 as uuidv4 } from 'uuid'
import toast from 'react-hot-toast'
import { auditoriaMotivoPrecioActiva, validarMotivoCambioPrecio } from '../../lib/priceChangeAudit'

interface SiembraCatalogoModalProps {
  isOpen: boolean
  onClose: () => void
  categoriasExistentes: Categoria[]
  onSiembraCompletada: () => Promise<void> | void
}

export function SiembraCatalogoModal({
  isOpen,
  onClose,
  categoriasExistentes,
  onSiembraCompletada,
}: SiembraCatalogoModalProps) {
  const { usuario, kiosco } = useAuthStore()
  const { esFotocopiadora, rubro, tipoComercioLabel } = useTenantConfig()
  const plantilla = esCatalogoPlantilla(rubro)
  const kioscoId = usuario?.kiosco_id || kiosco?.id

  const catalogoBase = useMemo(() => {
    return obtenerCatalogoPorRubro(rubro)
  }, [rubro])

  const categoriasMaestras = useMemo(() => {
    return [...new Set(catalogoBase.map(p => p.categoria_nombre))]
  }, [catalogoBase])

  const [categoriasSeleccionadas, setCategoriasSeleccionadas] = useState<Set<string>>(
    () => new Set(categoriasMaestras)
  )

  useEffect(() => {
    if (isOpen) {
      setCategoriasSeleccionadas(new Set(categoriasMaestras))
    }
  }, [isOpen, categoriasMaestras])

  const [margenGananciaPct, setMargenGananciaPct] = useState<number>(60)
  const [usarPreciosSugeridos, setUsarPreciosSugeridos] = useState<boolean>(true)
  const [omitirExistentes, setOmitirExistentes] = useState<boolean>(true)
  const [motivoPrecio, setMotivoPrecio] = useState('')
  useEffect(() => { setMotivoPrecio('') }, [isOpen])
  const [stockInicialDefault, setStockInicialDefault] = useState<number>(10)

  const [procesando, setProcesando] = useState(false)
  const [progreso, setProgreso] = useState<number>(0)
  const [mensajeEstado, setMensajeEstado] = useState<string>('')

  // Productos a sembrar según categorías seleccionadas
  const productosFiltrados = useMemo(() => {
    return catalogoBase.filter((p) =>
      categoriasSeleccionadas.has(p.categoria_nombre)
    )
  }, [catalogoBase, categoriasSeleccionadas])

  const toggleCategoria = (nombre: string) => {
    setCategoriasSeleccionadas((prev) => {
      const next = new Set(prev)
      if (next.has(nombre)) {
        next.delete(nombre)
      } else {
        next.add(nombre)
      }
      return next
    })
  }

  const toggleTodas = () => {
    if (categoriasSeleccionadas.size === categoriasMaestras.length) {
      setCategoriasSeleccionadas(new Set())
    } else {
      setCategoriasSeleccionadas(new Set(categoriasMaestras))
    }
  }

  const calcularPrecioVentaFinal = (prod: ProductoMaestro): number => {
    if (plantilla) return 0
    if (usarPreciosSugeridos) {
      return prod.precio_venta_sugerido
    }
    const costo = prod.precio_costo_ref || 100
    const calculado = costo * (1 + (margenGananciaPct || 0) / 100)
    // Redondear a decena superior para precios limpios de kiosco
    return Math.ceil(calculado / 10) * 10
  }

  const handleEjecutarSiembra = async () => {
    if (auditoriaMotivoPrecioActiva() && !plantilla && !omitirExistentes) {
      try { validarMotivoCambioPrecio(motivoPrecio) }
      catch (error) { toast.error(error instanceof Error ? error.message : 'Motivo inválido.'); return }
    }
    if (!kioscoId) {
      toast.error('No se encontró un comercio activo identificado')
      return
    }

    if (productosFiltrados.length === 0) {
      toast.error('Seleccioná al menos una categoría para sembrar')
      return
    }

    setProcesando(true)
    setProgreso(5)
    setMensajeEstado('Verificando categorías y stock existente...')
    let insertadosTotal = 0

    try {
      // 1. Obtener productos existentes en el kiosco para detectar códigos duplicados
      const { data: prodsActuales, error: errorLectura } = await supabase
        .from('productos')
        .select('id, codigo_barras, descripcion')
        .eq('kiosco_id', kioscoId)
      if (errorLectura || !prodsActuales) throw new Error('No se pudieron verificar los productos existentes')

      const codigosExistentes = new Set<string>()
      prodsActuales?.forEach((p) => {
        if (p.codigo_barras) codigosExistentes.add(p.codigo_barras.trim().toLowerCase())
      })

      // 2. Mapear y asegurar existencia de categorías
      setProgreso(15)
      setMensajeEstado('Sincronizando categorías...')

      const mapaCategorias = new Map<string, string>()
      const { data: categoriasActuales, error: errorCategorias } = await supabase.from('categorias')
        .select('id,nombre').eq('kiosco_id', kioscoId)
      if (errorCategorias || !categoriasActuales) throw new Error('No se pudieron verificar las categorías existentes')
      categoriasActuales.forEach((c) => {
        mapaCategorias.set(c.nombre.toLowerCase().trim(), c.id)
      })

      // Categorías del maestro que faltan en la base de datos
      const categoriasACrear: string[] = []
      categoriasMaestras.forEach((catNom) => {
        if (!mapaCategorias.has(catNom.toLowerCase().trim())) {
          categoriasACrear.push(catNom)
        }
      })

      if (categoriasACrear.length > 0) {
        const payloadCats = categoriasACrear.map((nombre, i) => ({
          id: uuidv4(),
          kiosco_id: kioscoId,
          nombre,
          color: '#4f46e5',
          orden: categoriasExistentes.length + i + 1,
        }))

        const { data: catsInsertadas, error: errCats } = await supabase
          .from('categorias')
          .insert(payloadCats)
          .select()

        if (errCats || !catsInsertadas || catsInsertadas.length !== payloadCats.length) throw new Error('No se pudieron crear las categorías')
        catsInsertadas.forEach((c) => {
          mapaCategorias.set(c.nombre.toLowerCase().trim(), c.id)
        })
      }

      // 3. Preparar lista de productos finales a insertar
      setProgreso(30)
      setMensajeEstado('Preparando productos...')

      let productosAProcesar = productosFiltrados

      if (plantilla || omitirExistentes) {
        productosAProcesar = productosFiltrados.filter(
          (p) => !codigosExistentes.has(p.codigo_barras.trim().toLowerCase())
        )
      }

      if (productosAProcesar.length === 0) {
        toast('Todos los productos seleccionados ya existen en tu catálogo', { icon: 'ℹ️' })
        setProcesando(false)
        onClose()
        return
      }

      const now = new Date().toISOString()
      const nuevosProductosPayload: Producto[] = productosAProcesar.map((p) => {
        const catId = mapaCategorias.get(p.categoria_nombre.toLowerCase().trim()) || null
        const pVenta = calcularPrecioVentaFinal(p)
        const esFavSugerido = esFotocopiadora && (
          p.categoria_nombre === 'Fotocopias e Impresiones' ||
          p.categoria_nombre === 'Anillados y Plastificados'
        )
        return {
          id: uuidv4(),
          kiosco_id: kioscoId,
          codigo_barras: p.codigo_barras.trim(),
          descripcion: p.descripcion.trim(),
          precio_costo: plantilla ? 0 : p.precio_costo_ref,
          precio_venta: pVenta,
          stock_actual: plantilla ? 0 : p.stock_inicial_sugerido ?? stockInicialDefault,
          stock_minimo: 5,
          categoria_id: catId,
          unidad_medida: p.unidad_medida || 'UN',
          es_pesable: Boolean(p.es_pesable),
          ...(plantilla ? { requiere_vencimiento: p.requiere_vencimiento ?? false, dias_alerta_vencimiento: p.dias_alerta_vencimiento ?? 30 } : {}),
          es_favorito: esFavSugerido,
          activo: !plantilla,
          fecha_creacion: now,
          fecha_actualizacion: now,
        }
      })

      // 4. Inserción por lotes (*chunks* de 40 ítems) para no sobrepasar la red
      const CHUNK_SIZE = 40
      const totalLotes = Math.ceil(nuevosProductosPayload.length / CHUNK_SIZE)

      for (let i = 0; i < totalLotes; i++) {
        const chunk = nuevosProductosPayload.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE)
        const porcentajeLote = Math.round(30 + ((i + 1) / totalLotes) * 60)
        setProgreso(porcentajeLote)
        setMensajeEstado(`Insertando lote ${i + 1} de ${totalLotes} (${insertadosTotal + chunk.length} productos)...`)

        const payload = chunk.map((item) => ({
            id: item.id,
            kiosco_id: item.kiosco_id,
            codigo_barras: item.codigo_barras,
            descripcion: item.descripcion,
            precio_costo: item.precio_costo,
            precio_venta: item.precio_venta,
            stock_actual: item.stock_actual,
            stock_minimo: item.stock_minimo,
            categoria_id: item.categoria_id,
            unidad_medida: item.unidad_medida,
            es_pesable: item.es_pesable,
            ...(plantilla ? { requiere_vencimiento: item.requiere_vencimiento ?? false, dias_alerta_vencimiento: item.dias_alerta_vencimiento ?? 30 } : {}),
            es_favorito: item.es_favorito,
            activo: item.activo,
          }))
        let persistidos: Producto[]
        if (auditoriaMotivoPrecioActiva() && !plantilla && !omitirExistentes) {
          persistidos = []
          for (const fila of payload) {
            const codigo = fila.codigo_barras?.trim().toLowerCase()
            const existente = codigo ? prodsActuales.find(p => p.codigo_barras?.trim().toLowerCase() === codigo) : undefined
            const { id: _idNuevo, kiosco_id: _comercio, ...campos } = fila
            const consulta = existente
              ? supabase.from('productos').update({ ...campos, motivo_cambio_precio: motivoPrecio.trim() })
                .eq('id', existente.id).eq('kiosco_id', kioscoId)
              : supabase.from('productos').upsert(fila, { onConflict: 'kiosco_id,codigo_barras', ignoreDuplicates: true })
            const { data, error } = await consulta.select()
            if (error || !data || (existente && data.length !== 1)) throw new Error(`No se pudo guardar el lote ${i + 1}`)
            persistidos.push(...data as Producto[])
          }
        } else {
          const { data, error } = await supabase.from('productos').upsert(payload,
            { onConflict: 'kiosco_id,codigo_barras', ignoreDuplicates: plantilla || omitirExistentes }).select()
          if (error || !data) throw new Error(`No se pudo guardar el lote ${i + 1}`)
          persistidos = data as Producto[]
        }
        insertadosTotal += persistidos.length
        // Cada lote confirmado permanece disponible incluso si el siguiente falla.
        const mapaFinal = new Map(getCachedProductos(kioscoId).map(p => [p.id, p]))
        for (const producto of persistidos as Producto[]) {
          for (const [id, previo] of mapaFinal) {
            if (previo.codigo_barras && previo.codigo_barras === producto.codigo_barras && id !== producto.id) mapaFinal.delete(id)
          }
          mapaFinal.set(producto.id, producto)
        }
        saveCachedProductos(Array.from(mapaFinal.values()), kioscoId)
      }

      setProgreso(95)
      setMensajeEstado('Actualizando caché local del mostrador...')

      setProgreso(100)
      await onSiembraCompletada()
      toast.success(
        plantilla ? `Se importaron ${insertadosTotal} artículos inactivos. Configurá precios y existencias antes de activarlos.`
          : `Se cargaron ${insertadosTotal} productos en el catálogo.`,
        { icon: '🚀', duration: 4000 }
      )

      onClose()
    } catch (err: unknown) {
      console.error('Error durante la siembra de catálogo:', err)
      toast.error(`${err instanceof Error ? err.message : 'Ocurrió un error al sembrar el catálogo'}. Se confirmaron ${insertadosTotal} artículos; podés reintentar omitiendo los existentes.`)
    } finally {
      setProcesando(false)
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => !procesando && onClose()}
      title=""
      size="lg"
    >
      <div className="space-y-5 -mt-2">
        {/* Cabecera */}
        <div className="flex items-start gap-3 border-b border-gray-100 dark:border-gray-700/60 pb-3">
          <div className="p-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 shrink-0">
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
              {plantilla ? `Catálogo inicial: ${tipoComercioLabel}` : esFotocopiadora
                ? 'Siembra Inicial: Catálogo Fotocopiadora & Librería'
                : 'Siembra Inicial: Catálogo Maestro Kiosco Argentino'}
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {plantilla ? 'Seleccioná las categorías comerciales que usa tu local. Configurá modelos, precios y stock antes de vender.' : esFotocopiadora
                ? 'Cargá automáticamente los servicios clave (fotocopias B/N y color, anillados, plastificados) y útiles escolares más vendidos (resmas, bolígrafos, cuadernos).'
                : 'Cargá automáticamente los artículos más vendidos de Argentina (golosinas, bebidas, cigarrillos, galletitas) con códigos de barras oficiales.'}
            </p>
          </div>
        </div>

        {/* Progreso en curso */}
        {procesando ? (
          <div className="py-8 space-y-4 text-center">
            <div className="w-full bg-gray-100 dark:bg-gray-700 rounded-full h-3 overflow-hidden">
              <div
                className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                style={{ width: `${progreso}%` }}
              />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-bold text-gray-900 dark:text-gray-100">
                {mensajeEstado}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Progreso: {progreso}%
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {plantilla && <p className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 p-3 text-xs text-indigo-700 dark:text-indigo-300">
              Plantilla comercial: los artículos se importan inactivos, con costo, precio y stock en cero.
              Completá precios y existencias reales antes de activarlos. Los códigos VET-/TEC- son internos y podés reemplazarlos por los del proveedor.
            </p>}
            {/* Selección de Categorías */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                  Categorías a Importar ({productosFiltrados.length} productos seleccionados)
                </label>
                <button
                  type="button"
                  onClick={toggleTodas}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                >
                  {categoriasSeleccionadas.size === categoriasMaestras.length
                    ? 'Deseleccionar todas'
                    : 'Seleccionar todas'}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-40 overflow-y-auto pr-1">
                {categoriasMaestras.map((catNom) => {
                  const cantEnCat = catalogoBase.filter(
                    (p) => p.categoria_nombre === catNom
                  ).length
                  const estaCheck = categoriasSeleccionadas.has(catNom)
                  return (
                    <label
                      key={catNom}
                      className={`flex items-center justify-between p-2.5 rounded-xl border text-xs cursor-pointer transition-all ${
                        estaCheck
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200'
                          : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={estaCheck}
                          onChange={() => toggleCategoria(catNom)}
                          className="rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <span className="font-semibold">{catNom}</span>
                      </div>
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 font-bold">
                        {cantEnCat} art.
                      </span>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* Configuración de Precios y Margen */}
            {!plantilla && <div className="bg-gray-50 dark:bg-gray-700/30 p-3.5 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                Estrategia de Precios
              </h3>

              <div className="space-y-2">
                <label className="flex items-center gap-2.5 text-xs text-gray-800 dark:text-gray-200 cursor-pointer">
                  <input
                    type="radio"
                    name="estrategiaPrecios"
                    checked={usarPreciosSugeridos}
                    onChange={() => setUsarPreciosSugeridos(true)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    <strong>Usar precios de venta sugeridos oficiales</strong> (valores estándar de kioscos argentinos)
                  </span>
                </label>

                <label className="flex items-center gap-2.5 text-xs text-gray-800 dark:text-gray-200 cursor-pointer">
                  <input
                    type="radio"
                    name="estrategiaPrecios"
                    checked={!usarPreciosSugeridos}
                    onChange={() => setUsarPreciosSugeridos(false)}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>
                    <strong>Aplicar mi propio margen de ganancia</strong> sobre el costo de referencia
                  </span>
                </label>
              </div>

              {!usarPreciosSugeridos && (
                <div className="pl-6 pt-1 flex items-center gap-3">
                  <label className="text-xs font-medium text-gray-600 dark:text-gray-400">
                    Margen de Ganancia:
                  </label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="10"
                      max="300"
                      step="5"
                      value={margenGananciaPct}
                      onChange={(e) => setMargenGananciaPct(Number(e.target.value))}
                      className="w-20 text-xs font-bold rounded-lg border border-gray-300 dark:border-gray-600 p-1.5 text-center bg-white dark:bg-gray-800"
                    />
                    <span className="text-xs font-bold text-gray-600 dark:text-gray-400">%</span>
                  </div>
                </div>
              )}
            </div>}

            {/* Opciones de stock e idempotencia */}
            {auditoriaMotivoPrecioActiva() && !plantilla && !omitirExistentes && <input aria-label="Motivo del cambio de precio"
              placeholder="Motivo de actualización del catálogo" maxLength={300} value={motivoPrecio}
              onChange={e => setMotivoPrecio(e.target.value)} disabled={procesando}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-transparent px-3.5 py-2.5 text-sm" />}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              {!plantilla && <div className="bg-gray-50 dark:bg-gray-700/30 p-3 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-1">
                <label className="font-semibold text-gray-700 dark:text-gray-300 block">
                  Stock inicial para cada producto:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="0"
                    max="1000"
                    value={stockInicialDefault}
                    onChange={(e) => setStockInicialDefault(Number(e.target.value))}
                    className="w-24 text-xs font-bold rounded-lg border border-gray-300 dark:border-gray-600 p-1.5 text-center bg-white dark:bg-gray-800"
                  />
                  <span className="text-gray-500 text-[11px]">unidades</span>
                </div>
              </div>}

              <div className="bg-gray-50 dark:bg-gray-700/30 p-3 rounded-2xl border border-gray-200 dark:border-gray-700 space-y-2 flex flex-col justify-center">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={plantilla || omitirExistentes}
                    disabled={plantilla}
                    onChange={(e) => setOmitirExistentes(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="font-semibold text-gray-800 dark:text-gray-200">
                    Omitir códigos ya existentes (Recomendado)
                  </span>
                </label>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 pl-5">
                  No modifica los precios ni productos que ya hayas cargado previamente.
                </p>
              </div>
            </div>

            {/* Botones de acción */}
            <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-gray-100 dark:border-gray-700/60">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={procesando}
                className="text-xs"
              >
                Cancelar
              </Button>

              <Button
                type="button"
                variant="primary"
                onClick={handleEjecutarSiembra}
                disabled={procesando || productosFiltrados.length === 0}
                className="text-xs font-bold px-4 py-2.5 shadow-md flex items-center gap-2"
              >
                <span>Sembrar {productosFiltrados.length} Productos</span>
                <span className="text-indigo-200">→</span>
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}
