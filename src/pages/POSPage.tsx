import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useCartStore } from '../stores/cartStore'
import { useCajaStore } from '../stores/cajaStore'
import { useAuthStore } from '../stores/authStore'
import { usePromocionStore } from '../stores/promocionStore'
import { useComboStore } from '../stores/comboStore'
import { formatPrecio, formatFecha, getCachedProductos, saveCachedProductos } from '../lib/utils'
import { ProductSearch } from '../components/pos/ProductSearch'
import { FavoritesGrid } from '../components/pos/FavoritesGrid'
import { CartPanel } from '../components/pos/CartPanel'
import { PaymentModal } from '../components/pos/PaymentModal'
import { CobrosManualesPendientes } from '../components/pos/CobrosManualesPendientes'
import { TicketReceiptModal, type TicketData } from '../components/pos/TicketReceiptModal'
import { abrirCajonDineroDirecto, getAperturaAutomaticaCajon } from '../lib/escposPrinter'
import { BarcodeScannerModal } from '../components/pos/BarcodeScannerModal'
import { KeyboardShortcutsModal } from '../components/pos/KeyboardShortcutsModal'
import { ArticuloLibreModal } from '../components/pos/ArticuloLibreModal'
import { BalanzaManualModal } from '../components/pos/BalanzaManualModal'
import { DevolucionModal } from '../components/pos/DevolucionModal'
import { HistorialTicketsModal } from '../components/pos/HistorialTicketsModal'
import { RecibirEnvaseModal } from '../components/pos/RecibirEnvaseModal'
import { RetiroCajaModal } from '../components/pos/RetiroCajaModal'
import { AltaRapidaModal } from '../components/pos/AltaRapidaModal'
import { buscarEnCatalogoMaestro, type ProductoMaestro } from '../data/catalogoMaestroArgentino'
import { CATALOGO_MAESTRO_LIBRERIA } from '../data/catalogoMaestroLibreria'
import { parsearCodigoBalanza, buscarProductoPorCodigoBalanza } from '../lib/barcodeParser'
import { useBarcodeGun } from '../hooks/useBarcodeGun'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { playScanSound } from '../lib/sound'
import { Modal } from '../components/ui/Modal'
import { Button } from '../components/ui/Button'
import type { Producto, Categoria } from '../types/database'
import { useDevolucionStore, type VentaConDetalles } from '../stores/devolucionStore'
import { useRealtimeSync, registrarToqueLocal, type KioskoProductsUpdatedDetail } from '../hooks/useRealtimeSync'
import { useTenantConfig } from '../hooks/useTenantConfig'
import toast from 'react-hot-toast'

export function POSPage() {
  const navigate = useNavigate()
  const { usuario, kiosco } = useAuthStore()
  const { tieneEnvases, tieneBalanza, tieneServiciosRapidos, esFotocopiadora } = useTenantConfig()
  const { sesionActiva, verificarSesionActiva } = useCajaStore()
  const { promociones, cargarPromociones } = usePromocionStore()
  const { buscarVentaParaDevolucion } = useDevolucionStore()
  const [favoritos, setFavoritos] = useState<Producto[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [categoriaActiva, setCategoriaActiva] = useState<string | null>(null)
  const [productosCategoria, setProductosCategoria] = useState<Producto[]>([])
  const [paymentOpen, setPaymentOpen] = useState(false)
  const [cartModalOpen, setCartModalOpen] = useState(false)
  const [modalEsperaOpen, setModalEsperaOpen] = useState(false)
  const [modalScannerOpen, setModalScannerOpen] = useState(false)
  const [modalShortcutsOpen, setModalShortcutsOpen] = useState(false)
  const [modalLibreOpen, setModalLibreOpen] = useState(false)
  const [descripcionLibreInicial, setDescripcionLibreInicial] = useState<string>()
  const [modalBalanzaOpen, setModalBalanzaOpen] = useState(false)
  const [modalDevolucionOpen, setModalDevolucionOpen] = useState(false)
  const [modalTicketsOpen, setModalTicketsOpen] = useState(false)
  const [modalRetiroOpen, setModalRetiroOpen] = useState(false)
  const [ventaParaDevolver, setVentaParaDevolver] = useState<VentaConDetalles | null>(null)
  const [modalEnvaseOpen, setModalEnvaseOpen] = useState(false)
  const [modalPromosOpen, setModalPromosOpen] = useState(false)
  const [productoPesableModal, setProductoPesableModal] = useState<Producto | null>(null)
  const [ticketReciente, setTicketReciente] = useState<TicketData | null>(null)
  const [ticketModalOpen, setTicketModalOpen] = useState(false)
  const aperturasCajonProcesadas = useRef(new Set<string>())

  // Asistente On-The-Fly Catálogo Semilla
  const [modalAltaRapidaOpen, setModalAltaRapidaOpen] = useState(false)
  const [codigoParaAlta, setCodigoParaAlta] = useState('')
  const [productoSugeridoParaAlta, setProductoSugeridoParaAlta] = useState<ProductoMaestro | null>(null)

  const {
    agregarProducto,
    totalItems,
    totalMonto,
    ventasEnEspera,
    recuperarVenta,
    eliminarVentaEnEspera,
  } = useCartStore()

  const cantItems = totalItems()
  const total = totalMonto()

  // Cargar favoritos
  const cargarFavoritos = useCallback(async () => {
    const kid = usuario?.kiosco_id || kiosco?.id
    let query = supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .eq('es_favorito', true)
      .order('descripcion')
      .limit(1000)
    if (kid) query = query.eq('kiosco_id', kid)
    const { data } = await query
    setFavoritos(data || [])
  }, [usuario?.kiosco_id, kiosco?.id])

  // Cargar categorías
  const cargarCategorias = useCallback(async () => {
    const kid = usuario?.kiosco_id || kiosco?.id
    let query = supabase
      .from('categorias')
      .select('*')
      .order('orden')
      .limit(1000)
    if (kid) query = query.eq('kiosco_id', kid)
    const { data } = await query
    setCategorias(data || [])
  }, [usuario?.kiosco_id, kiosco?.id])

  // Cargar productos por categoría
  const cargarPorCategoria = useCallback(async (catId: string) => {
    const kid = usuario?.kiosco_id || kiosco?.id
    let query = supabase
      .from('productos')
      .select('*')
      .eq('activo', true)
      .eq('categoria_id', catId)
      .order('descripcion')
      .limit(10000)
    if (kid) query = query.eq('kiosco_id', kid)
    const { data } = await query
    setProductosCategoria(data || [])
  }, [usuario?.kiosco_id, kiosco?.id])

  // Precargar el catálogo completo en la caché local para escaneos instantáneos (< 2ms)
  const precargarCatalogoCompleto = useCallback(async () => {
    const kid = usuario?.kiosco_id || kiosco?.id
    if (!kid) return
    try {
      const cached = getCachedProductos(kid)
      if (cached.length === 0) {
        const { data } = await supabase
          .from('productos')
          .select('*, categoria:categorias(nombre, color)')
          .eq('kiosco_id', kid)
          .eq('activo', true)
          .order('descripcion')
          .limit(10000)
        if (data && data.length > 0) {
          saveCachedProductos(data, kid)
        }
      }
    } catch (err) {
      console.warn('Aviso precargando catálogo en POS:', err)
    }
  }, [usuario?.kiosco_id, kiosco?.id])

  useEffect(() => {
    cargarFavoritos()
    cargarCategorias()
    precargarCatalogoCompleto()
    verificarSesionActiva()
    const kid = usuario?.kiosco_id || kiosco?.id
    if (kid) {
      cargarPromociones(kid)
      useComboStore.getState().cargarCombos(kid)
    }
  }, [cargarFavoritos, cargarCategorias, precargarCatalogoCompleto, verificarSesionActiva, cargarPromociones, usuario?.kiosco_id, kiosco?.id])

  useEffect(() => {
    if (categoriaActiva) {
      cargarPorCategoria(categoriaActiva)
    }
  }, [categoriaActiva, cargarPorCategoria])

  const refrescarProductosVista = useCallback(() => {
    cargarFavoritos()
    if (categoriaActiva) {
      cargarPorCategoria(categoriaActiva)
    }
  }, [cargarFavoritos, categoriaActiva, cargarPorCategoria])

  useEffect(() => {
    window.addEventListener('kiosko-manual-checkout-confirmado', refrescarProductosVista)
    return () => window.removeEventListener('kiosko-manual-checkout-confirmado', refrescarProductosVista)
  }, [refrescarProductosVista])

  useRealtimeSync(usuario?.kiosco_id || kiosco?.id)

  // Suscripción a eventos realtime para actualizar favoritos y categoría in-place sin peticiones de red masivas
  useEffect(() => {
    const handleRealtime = (e: Event) => {
      const detail = (e as CustomEvent<KioskoProductsUpdatedDetail>).detail
      if (!detail || !detail.producto) return

      const { eventType, producto, productoOld } = detail

      setFavoritos((prev) => {
        if (eventType === 'DELETE' || producto.activo === false || !producto.es_favorito) {
          return prev.filter((p) => p.id !== (producto.id || productoOld?.id))
        }
        const exists = prev.some((p) => p.id === producto.id)
        if (exists) {
          return prev.map((p) => (p.id === producto.id ? { ...p, ...producto } : p))
        }
        if (producto.es_favorito) {
          return [...prev, producto]
        }
        return prev
      })

      setProductosCategoria((prev) => {
        if (eventType === 'DELETE' || producto.activo === false) {
          return prev.filter((p) => p.id !== (producto.id || productoOld?.id))
        }
        if (categoriaActiva && producto.categoria_id === categoriaActiva) {
          const exists = prev.some((p) => p.id === producto.id)
          if (exists) {
            return prev.map((p) => (p.id === producto.id ? { ...p, ...producto } : p))
          }
          return [...prev, producto]
        }
        return prev.filter((p) => p.id !== producto.id)
      })
    }

    window.addEventListener('kiosko-products-updated', handleRealtime)
    return () => {
      window.removeEventListener('kiosko-products-updated', handleRealtime)
    }
  }, [categoriaActiva])

  const handleSeleccion = (producto: Producto, cantidad?: number) => {
    if (cantidad && cantidad > 0) {
      agregarProducto(producto, cantidad)
      return
    }
    // Desactivar la integración de balanza no convierte un producto por peso en una unidad.
    if (producto.es_pesable) {
      setProductoPesableModal(producto)
      setModalBalanzaOpen(true)
      return
    }
    agregarProducto(producto)
  }

  const handleVentaCompletada = (ticket?: TicketData) => {
    // Registrar toque local de los productos para evitar ecos
    if (ticket && ticket.items) {
      ticket.items.forEach((it: any) => {
        if (it.producto?.id) registrarToqueLocal(it.producto.id)
      })
    }
    verificarSesionActiva()
    setCartModalOpen(false)
    if (ticket) {
      const ventaOffline = ticket.notas?.includes('[GUARDADO OFFLINE]') ?? false
      const incluyeEfectivo = ticket.pagos?.length
        ? ticket.pagos.some((pago) => (pago.medioPago || '').toUpperCase().includes('EFECTIVO') && pago.monto > 0)
        : (ticket.medioPago || '').toUpperCase().includes('EFECTIVO')
      if (
        !ventaOffline &&
        incluyeEfectivo &&
        getAperturaAutomaticaCajon() &&
        !aperturasCajonProcesadas.current.has(ticket.ventaId)
      ) {
        aperturasCajonProcesadas.current.add(ticket.ventaId)
        void abrirCajonDineroDirecto().then((resultado) => {
          if (!resultado.ok) toast.error(`Venta registrada; no se pudo abrir el cajón: ${resultado.mensaje}`)
        })
      }
      setTicketReciente(ticket)
      setTicketModalOpen(true)
    }
  }

  const handleRecuperar = (id: string) => {
    recuperarVenta(id)
    setModalEsperaOpen(false)
    toast.success('Venta recuperada en el ticket')
  }

  const handleAgregarComboAlTicket = async (promo: any) => {
    if (!promo.items_combo || promo.items_combo.length === 0) return
    const ids = promo.items_combo.map((ic: any) => ic.producto_id)
    const { data: prods } = await supabase.from('productos').select('*').in('id', ids)
    if (!prods || prods.length === 0) {
      toast.error('No se encontraron los productos del combo en el catálogo')
      return
    }

    let agregados = 0
    for (const ic of promo.items_combo) {
      const p = prods.find((prod) => prod.id === ic.producto_id)
      if (p) {
        agregarProducto(p, ic.cantidad)
        agregados++
      }
    }

    if (agregados > 0) {
      toast.success(`Combo "${promo.nombre}" cargado al ticket`)
      setModalPromosOpen(false)
    }
  }

  // Navegación por teclado en las pestañas de categorías
  const categoryRefs = useRef<(HTMLButtonElement | null)[]>([])
  const totalTabs = 1 + categorias.length

  useEffect(() => {
    const handleFocusCategory = () => {
      const activeIdx = categoriaActiva
        ? categorias.findIndex((c) => c.id === categoriaActiva) + 1
        : 0
      categoryRefs.current[activeIdx >= 0 ? activeIdx : 0]?.focus()
    }
    window.addEventListener('pos-focus-category', handleFocusCategory)
    return () => window.removeEventListener('pos-focus-category', handleFocusCategory)
  }, [categoriaActiva, categorias])

  const handleCategoryKeyDown = (
    e: React.KeyboardEvent,
    index: number,
    catId: string | null
  ) => {
    if (e.key === 'ArrowRight') {
      e.preventDefault()
      const next = (index + 1) % totalTabs
      categoryRefs.current[next]?.focus()
      setCategoriaActiva(next === 0 ? null : categorias[next - 1].id)
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      const prev = (index - 1 + totalTabs) % totalTabs
      categoryRefs.current[prev]?.focus()
      setCategoriaActiva(prev === 0 ? null : categorias[prev - 1].id)
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('pos-focus-grid'))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      window.dispatchEvent(new CustomEvent('pos-focus-search'))
    } else if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setCategoriaActiva(catId)
    }
  }

  // Detección de escaneo desde pistola de código de barras USB / Bluetooth (Cache-First instantáneo)
  const handleBarcodeGunScan = useCallback(
    async (code: string) => {
      const codeTrim = code.trim()
      if (!codeTrim) return

      const kid = usuario?.kiosco_id || kiosco?.id

      // 0. Comprobar si el código escaneado corresponde a un comprobante (Ticket de venta o Cierre de caja)
      if (/^t-[a-f0-9]{4,36}$/i.test(codeTrim) || /^ticket-[a-f0-9-]+$/i.test(codeTrim)) {
        playScanSound()
        const ventaCandidata = await buscarVentaParaDevolucion(codeTrim, kid)
        if (ventaCandidata) {
          playScanSound('success')
          window.dispatchEvent(new CustomEvent('pos-clear-search'))
          setVentaParaDevolver(ventaCandidata)
          setModalDevolucionOpen(true)
          toast.success(`Ticket #${ventaCandidata.id.slice(0, 8).toUpperCase()} cargado para devolución`)
        } else {
          playScanSound('error')
          toast.error(`No se encontró la venta con código ${codeTrim}`)
        }
        return
      }

      if (/^[zx]-[a-f0-9]{4,36}$/i.test(codeTrim)) {
        playScanSound('warning')
        toast('El código escaneado corresponde a un comprobante de cierre de caja', { icon: 'ℹ️' })
        return
      }

      // 1. Comprobar si es código de balanza comercial argentina (EAN-13 con prefijo 20 o 02)
      if (tieneBalanza) {
        const parsedBalanza = parsearCodigoBalanza(codeTrim)
        if (parsedBalanza) {
          let matchBalanza: { producto: Producto; pesoKg: number } | null = null
          const todos: Producto[] = getCachedProductos(kid)
          if (todos.length > 0) {
            matchBalanza = buscarProductoPorCodigoBalanza(codeTrim, todos)
          }

          if (matchBalanza) {
            agregarProducto(matchBalanza.producto, matchBalanza.pesoKg)
            toast.success(`${matchBalanza.producto.descripcion} (${matchBalanza.pesoKg} kg) agregado`)
            return
          }

          // Si no estaba en caché local, buscar en Supabase por plu_balanza o codigo_barras
          try {
            let queryBalanza = supabase
              .from('productos')
              .select('*, categoria:categorias(nombre, color)')
              .eq('activo', true)
              .or(`plu_balanza.eq.${parsedBalanza.plu4},plu_balanza.eq.${parsedBalanza.pluCorto},plu_balanza.eq.${parsedBalanza.plu5},codigo_barras.eq.${parsedBalanza.plu4},codigo_barras.eq.${parsedBalanza.pluCorto}`)
              .limit(1)
            if (kid) queryBalanza = queryBalanza.eq('kiosco_id', kid)
            const { data } = await queryBalanza.maybeSingle()

            if (data) {
              agregarProducto(data, parsedBalanza.pesoKg)
              toast.success(`${data.descripcion} (${parsedBalanza.pesoKg} kg) agregado`)
              return
            }
          } catch (errBalanza) {
            console.warn('Error buscando producto de balanza en Supabase:', errBalanza)
          }
        }
      }

      // 1. Buscar de inmediato en la caché local (< 2ms, sin lag de red)
      let productoEncontrado: Producto | null = null
      const todos: Producto[] = getCachedProductos(kid)
      if (todos.length > 0) {
        productoEncontrado = todos.find((p) => p.activo && p.codigo_barras === codeTrim) || null
      }

      if (productoEncontrado) {
        window.dispatchEvent(new CustomEvent('pos-clear-search'))
        if (productoEncontrado.es_pesable) {
          setProductoPesableModal(productoEncontrado)
          setModalBalanzaOpen(true)
          return
        }
        agregarProducto(productoEncontrado)
        toast.success(`${productoEncontrado.descripcion} agregado`)
        return
      }

      // 2. Si no estaba en caché, buscar en Supabase
      try {
        let queryGun = supabase
          .from('productos')
          .select('*, categoria:categorias(nombre, color)')
          .eq('activo', true)
          .eq('codigo_barras', codeTrim)
          .limit(1)
        if (kid) queryGun = queryGun.eq('kiosco_id', kid)

        const { data, error } = await queryGun.maybeSingle()

        if (error) throw error

        if (data) {
          window.dispatchEvent(new CustomEvent('pos-clear-search'))
          if (data.es_pesable) {
            setProductoPesableModal(data)
            setModalBalanzaOpen(true)
            return
          }
          agregarProducto(data)
          toast.success(`${data.descripcion} agregado`)

          // Actualizar caché local agregando el producto nuevo
          const list: Producto[] = getCachedProductos(kid)
          if (!list.some((p) => p.id === data.id)) {
            saveCachedProductos([data, ...list], kid)
          }
        } else {
          // Disparar Asistente de Alta Rápida On-The-Fly con Catálogo Semilla
          window.dispatchEvent(new CustomEvent('pos-clear-search'))
          const matchMaestro = esFotocopiadora
            ? CATALOGO_MAESTRO_LIBRERIA.find((p) => p.codigo_barras === codeTrim) || buscarEnCatalogoMaestro(codeTrim)
            : buscarEnCatalogoMaestro(codeTrim)
          playScanSound('warning')
          setCodigoParaAlta(codeTrim)
          setProductoSugeridoParaAlta(matchMaestro || null)
          setModalAltaRapidaOpen(true)
        }
      } catch (err) {
        console.error('Error procesando código de pistola:', err)
        playScanSound('error')
        toast.error('No se pudo verificar el código de barras en la red')
      }
    },
    [agregarProducto, usuario?.kiosco_id, kiosco?.id, esFotocopiadora, tieneBalanza, buscarVentaParaDevolucion]
  )

  // Asistente on-the-fly disparado cuando el cajero presiona Enter en un código desconocido en el buscador
  const handleCodigoNoEncontradoDesdeBuscador = useCallback(
    (code: string) => {
      const codeTrim = code.trim()
      if (!codeTrim) return
      const matchMaestro = esFotocopiadora
        ? CATALOGO_MAESTRO_LIBRERIA.find((p) => p.codigo_barras === codeTrim) || buscarEnCatalogoMaestro(codeTrim)
        : buscarEnCatalogoMaestro(codeTrim)
      playScanSound('warning')
      setCodigoParaAlta(codeTrim)
      setProductoSugeridoParaAlta(matchMaestro || null)
      setModalAltaRapidaOpen(true)
    },
    [esFotocopiadora]
  )

  const handleAbrirCobro = () => {
    if (!sesionActiva?.id) {
      toast.error('Caja cerrada: Debés abrir el turno de caja antes de cobrar.', {
        icon: '🔒',
        duration: 4000,
      })
      return
    }
    const montoTotal = totalMonto()
    if (montoTotal <= 0) {
      toast.error(
        'El ticket posee saldo a favor del cliente o monto $0. Utilizá "Recibir Envase > Pagar en efectivo" o agregá productos para cobrar.',
        { duration: 5000 }
      )
      return
    }
    setPaymentOpen(true)
  }

  const cambiarTicketConTeclado = (direccion: -1 | 1) => {
    const carrito = useCartStore.getState()
    const indice = carrito.tabs.findIndex(tab => tab.id === carrito.tabActivaId)
    if (indice < 0 || carrito.tabs.length < 2) return
    carrito.cambiarTab(carrito.tabs[(indice + direccion + carrito.tabs.length) % carrito.tabs.length].id)
    window.dispatchEvent(new CustomEvent('pos-focus-search'))
  }

  useBarcodeGun({
    onScan: handleBarcodeGunScan,
    enabled: !paymentOpen && !cartModalOpen && !modalScannerOpen && !modalEsperaOpen && !ticketModalOpen && !modalBalanzaOpen && !modalDevolucionOpen && !modalTicketsOpen && !modalEnvaseOpen && !modalRetiroOpen && !modalAltaRapidaOpen && !modalLibreOpen && !modalPromosOpen && !modalShortcutsOpen,
  })

  // Atajos de teclado para PC de escritorio
  useKeyboardShortcuts(
    {
      onFocusSearch: () => {
        window.dispatchEvent(new CustomEvent('pos-focus-search'))
      },
      onFocusTicket: () => {
        window.dispatchEvent(new CustomEvent('pos-focus-ticket'))
      },
      onCobrar: () => {
        if (cantItems > 0 && totalMonto() > 0 && !paymentOpen) {
          handleAbrirCobro()
        }
      },
      onVentasEnEspera: () => {
        setModalEsperaOpen((prev) => !prev)
      },
      onOpenScanner: () => {
        setModalScannerOpen((prev) => !prev)
      },
      onOpenHelp: () => {
        setModalShortcutsOpen((prev) => !prev)
      },
      onRetiroCaja: () => {
        setModalRetiroOpen((prev) => !prev)
      },
      onCobroManual: () => { setDescripcionLibreInicial(undefined); setModalLibreOpen(true) },
      onPromociones: () => {
        const kid = usuario?.kiosco_id || kiosco?.id
        if (kid) cargarPromociones(kid)
        setModalPromosOpen(true)
      },
      onHistorialTickets: () => setModalTicketsOpen(true),
      onRecibirEnvases: tieneEnvases ? () => setModalEnvaseOpen(true) : undefined,
      onNuevoTicket: () => {
        useCartStore.getState().crearNuevaTab()
        window.dispatchEvent(new CustomEvent('pos-focus-search'))
      },
      onTicketAnterior: () => cambiarTicketConTeclado(-1),
      onTicketSiguiente: () => cambiarTicketConTeclado(1),
      onPausarTicket: () => {
        if (useCartStore.getState().suspenderVentaActual()) toast.success('Venta guardada en espera')
      },
      onEscape: () => {
        if (modalAltaRapidaOpen) setModalAltaRapidaOpen(false)
        else if (modalRetiroOpen) setModalRetiroOpen(false)
        else if (modalPromosOpen) setModalPromosOpen(false)
        else if (modalTicketsOpen) setModalTicketsOpen(false)
        else if (modalDevolucionOpen) setModalDevolucionOpen(false)
        else if (modalBalanzaOpen) setModalBalanzaOpen(false)
        else if (modalScannerOpen) setModalScannerOpen(false)
        else if (modalShortcutsOpen) setModalShortcutsOpen(false)
        else if (modalEsperaOpen) setModalEsperaOpen(false)
        else if (paymentOpen) setPaymentOpen(false)
        else if (cartModalOpen) setCartModalOpen(false)
        else if (ticketModalOpen) setTicketModalOpen(false)
      },
    },
    true
  )

  return (
    <div className={`w-full h-full min-w-0 flex flex-col gap-2.5 ${cantItems > 0 ? 'pb-[calc(80px+env(safe-area-inset-bottom))]' : 'pb-0'} lg:pb-0 overflow-hidden`}>
      <CobrosManualesPendientes onVerTicket={ticket => { setTicketReciente(ticket); setTicketModalOpen(true); refrescarProductosVista() }} />
      <header className="flex shrink-0 items-center justify-between gap-3 px-1 py-1">
        <div className="flex min-w-0 items-center gap-3"><span className="hidden sm:flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-indigo-500 shadow-sm"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 8h18l-2 12H5L3 8ZM8 8l4-6 4 6M8 12v5M12 12v5M16 12v5" /></svg></span><div><h1 className="text-lg sm:text-xl font-bold tracking-tight text-gray-900 dark:text-gray-100">Punto de Venta</h1><p className="hidden sm:block text-xs text-gray-500 dark:text-gray-400">Buscá, agregá y cobrá desde un solo lugar</p></div></div>
        {sesionActiva && <span className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300"><span className="h-2 w-2 rounded-full bg-emerald-500" />Turno abierto</span>}
      </header>
      {/* Banner de advertencia solo si la caja está cerrada */}
      {!sesionActiva && (
        <div className="flex items-center justify-between gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/40 rounded-lg text-amber-800 dark:text-amber-300 text-xs flex-shrink-0">
          <span className="truncate">
            <strong>Caja cerrada:</strong> No hay turno iniciado.
          </span>
          <button
            onClick={() => navigate('/caja')}
            className="px-2.5 py-0.5 bg-amber-600 hover:bg-amber-700 text-white rounded text-xs font-semibold active:scale-95 transition-all cursor-pointer flex-shrink-0"
          >
            Abrir turno
          </button>
        </div>
      )}

      {/* Contenedor principal */}
      <div className="flex-1 flex flex-col lg:flex-row gap-3 min-h-0 min-w-0 overflow-hidden">
        {/* Columna de productos */}
        <div className="flex-1 flex flex-col min-h-0 min-w-0 overflow-hidden">
          {/* Buscador + botones de acción (scroll horizontal en notebooks) */}
          <div className="flex flex-col gap-3 mb-3 flex-shrink-0 min-w-0 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/70 p-3 shadow-md dark:shadow-black/20">
            {/* Fila 1: Buscador (ocupa todo el ancho) */}
            <div className="w-full min-w-0">
              <ProductSearch
                onSelect={handleSeleccion}
                onOpenScanner={() => setModalScannerOpen(true)}
                onCodigoNoEncontrado={handleCodigoNoEncontradoDesdeBuscador}
              />
            </div>
            {/* Fila 2: Botones de acción responsive adaptables a notebooks y pantallas compactas */}
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setDescripcionLibreInicial(undefined)
                  setModalLibreOpen(true)
                }}
                className="min-h-10 px-3 flex items-center gap-1 rounded-xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold whitespace-nowrap active:scale-95 transition-all shadow-sm cursor-pointer"
                title="Cobro manual / servicio (F7)"
              >
                <span className="text-sm font-bold leading-none">+</span>
                <span>Cobro Manual</span>
              </button>
              {tieneServiciosRapidos && ['Fotocopias', 'Impresiones', 'Anillado', 'Plastificado'].map((concepto) => (
                <button
                  key={concepto}
                  type="button"
                  onClick={() => {
                    setDescripcionLibreInicial(concepto)
                    setModalLibreOpen(true)
                  }}
                  className="min-h-10 px-3 inline-flex items-center gap-2 rounded-xl border border-violet-300 dark:border-violet-700 bg-violet-50/80 hover:bg-violet-100 dark:bg-violet-950/40 dark:hover:bg-violet-900/50 text-violet-800 dark:text-violet-200 text-xs font-bold whitespace-nowrap active:scale-95 transition-all shadow-sm cursor-pointer"
                  title={`Cobrar ${concepto.toLowerCase()} sin descontar stock`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 3h12v18H6V3ZM9 7h6M9 11h6M9 15h4" /></svg>
                  {concepto}
                </button>
              ))}
              <button
                type="button"
                onClick={() => {
                  const kid = usuario?.kiosco_id || kiosco?.id
                  if (kid) cargarPromociones(kid)
                  setModalPromosOpen(true)
                }}
                className="min-h-10 px-3 flex items-center gap-1.5 rounded-xl border border-teal-300 dark:border-teal-700 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 text-teal-800 dark:text-teal-200 text-xs font-bold whitespace-nowrap active:scale-95 transition-all shadow-sm cursor-pointer"
                title="Combos y ofertas (Alt + P)"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 3h9l9 9-9 9-9-9V3ZM7 7h.01" /></svg><span>Combos y Ofertas</span>
                {promociones.filter((p) => p.activo).length > 0 && (
                  <span className="px-1.5 py-0.5 bg-teal-200 dark:bg-teal-800 text-teal-900 dark:text-teal-100 rounded-full text-[10px] font-bold">
                    {promociones.filter((p) => p.activo).length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setModalTicketsOpen(true)}
                className="min-h-10 px-3 flex items-center gap-1.5 rounded-xl border border-indigo-200 dark:border-indigo-800/80 bg-indigo-50/70 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-bold whitespace-nowrap active:scale-95 transition-all shadow-sm cursor-pointer"
                title="Tickets emitidos y reimpresión (Alt + H)"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 3h12v18H6V3ZM9 7h6M9 11h6M9 15h4" /></svg><span>Tickets Emitidos</span>
              </button>
              {tieneEnvases && (
                <button
                  type="button"
                  onClick={() => setModalEnvaseOpen(true)}
                  className="min-h-10 px-3 flex items-center gap-1.5 rounded-xl border border-emerald-300 dark:border-emerald-700 bg-emerald-50/80 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 text-xs font-bold whitespace-nowrap active:scale-95 transition-all shadow-sm cursor-pointer"
                  title="Recibir envases (Alt + R)"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M9 2h6v5l3 4v10H6V11l3-4V2ZM6 13h12" /></svg><span>Recepción Envases</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setModalRetiroOpen(true)}
                className="min-h-10 px-3 flex items-center gap-1.5 rounded-xl border border-amber-300 dark:border-amber-700 bg-amber-50/90 hover:bg-amber-100 dark:bg-amber-950/40 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-200 text-xs font-bold whitespace-nowrap active:scale-95 transition-all shadow-sm cursor-pointer"
                title="Retiro de plata del cajón o pago rápido a proveedor"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M3 6h18v12H3V6ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6" /></svg><span>Retirar Plata</span>
              </button>
            </div>
          </div>

          {/* Categorías deslizables con margen de scroll y espaciador final */}
          <div
            onWheel={(e) => {
              if (e.deltaY !== 0) {
                e.currentTarget.scrollLeft += e.deltaY
              }
            }}
            className="flex items-center gap-2 overflow-x-auto p-2 scroll-smooth min-w-0 mb-2 scrollbar-hide rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/50 shrink-0"
          >
            {/* Botón de ventas en espera si existen */}
            {ventasEnEspera.length > 0 && (
              <button
                onClick={() => setModalEsperaOpen(true)}
                className="px-3 py-2 rounded-xl text-xs font-bold whitespace-nowrap min-h-[32px] bg-amber-500 hover:bg-amber-600 text-white shadow-xs flex-shrink-0 animate-pulse active:scale-95 transition-all cursor-pointer"
              >
                En espera ({ventasEnEspera.length})
              </button>
            )}

            <button
              ref={(el) => { categoryRefs.current[0] = el }}
              onClick={() => setCategoriaActiva(null)}
              onKeyDown={(e) => handleCategoryKeyDown(e, 0, null)}
              className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap min-h-[32px] transition-all focus:outline-hidden cursor-pointer flex-shrink-0 ${
                !categoriaActiva
                  ? 'bg-indigo-600 text-white shadow-xs focus:bg-indigo-700'
                  : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-indigo-50/80 dark:focus:bg-gray-700 focus:text-indigo-900 dark:focus:text-white'
              }`}
            >
              Favoritos
            </button>
            {categorias.map((cat, idx) => (
              <button
                key={cat.id}
                ref={(el) => { categoryRefs.current[idx + 1] = el }}
                onClick={() => setCategoriaActiva(cat.id)}
                onKeyDown={(e) => handleCategoryKeyDown(e, idx + 1, cat.id)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap min-h-[32px] transition-all border focus:outline-hidden cursor-pointer flex-shrink-0 ${
                  categoriaActiva === cat.id
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-bold focus:border-indigo-600'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 focus:border-indigo-500 dark:focus:border-indigo-400 focus:bg-indigo-50/80 dark:focus:bg-gray-700 focus:text-indigo-900 dark:focus:text-white'
                }`}
              >
                {cat.nombre}
              </button>
            ))}
            {/* Espacio final de resguardo para que la última categoría se vea completa al 100% */}
            <div className="w-8 shrink-0 h-1 pointer-events-none" aria-hidden="true" />
          </div>

          {/* Grilla compacta de productos */}
          <div className="flex-1 overflow-y-auto p-1.5 pr-2 min-h-0 min-w-0">
            {!categoriaActiva ? (
              <FavoritesGrid productos={favoritos} onSelect={handleSeleccion} />
            ) : (
              <FavoritesGrid productos={productosCategoria} onSelect={handleSeleccion} />
            )}
          </div>
        </div>

        {/* Columna derecha: Ticket en Desktop / Pantallas grandes */}
        <div className="hidden lg:flex flex-col w-[350px] xl:w-[400px] flex-shrink-0 min-h-0 h-full">
          <CartPanel onCobrar={handleAbrirCobro} />
        </div>
      </div>

      {/* ── BARRA INFERIOR DE COBRO PARA CELULARES (iPhone y Android) ── */}
      {cantItems > 0 && (
        <div className="fixed bottom-0 left-0 right-0 p-2.5 pb-[max(10px,env(safe-area-inset-bottom))] bg-white/95 dark:bg-gray-800/95 backdrop-blur-md border-t border-gray-200 dark:border-gray-700 shadow-xl lg:hidden z-30 animate-in slide-in-from-bottom-2 duration-150">
          <div className="flex items-center justify-between gap-3 max-w-md mx-auto">
            <button
              onClick={() => setCartModalOpen(true)}
              className="flex flex-col text-left py-0.5"
            >
              <span className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-300">
                Ticket ({cantItems} {cantItems === 1 ? 'item' : 'items'}) ↗
              </span>
              <span className="text-lg font-black text-gray-900 dark:text-white">
                {formatPrecio(total)}
              </span>
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCartModalOpen(true)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 font-medium text-xs text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 active:scale-95 transition-all"
              >
                Ver ticket
              </button>
              <button
                onClick={handleAbrirCobro}
                className="px-4 py-1.5 rounded-lg font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm text-sm active:scale-95 transition-all cursor-pointer"
              >
                Cobrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Ticket para Celular */}
      <Modal
        isOpen={cartModalOpen}
        onClose={() => setCartModalOpen(false)}
        title="Ticket de Venta"
        size="md"
      >
        <div className="h-[65dvh] -mx-2">
          <CartPanel
            onCobrar={() => {
              setCartModalOpen(false)
              handleAbrirCobro()
            }}
          />
        </div>
      </Modal>

      {/* Modal Ventas en Espera */}
      <Modal
        isOpen={modalEsperaOpen}
        onClose={() => setModalEsperaOpen(false)}
        title={`Ventas en Espera (${ventasEnEspera.length})`}
        size="md"
      >
        <div className="space-y-3">
          {ventasEnEspera.length === 0 ? (
            <p className="text-center py-6 text-gray-400 dark:text-gray-500 text-sm">
              No hay ventas en espera actualmente.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
              {ventasEnEspera.map((v) => (
                <div
                  key={v.id}
                  className="p-3.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-gray-900 dark:text-white">
                        {v.nota || 'Venta sin referencia'}
                      </span>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400">
                        {formatFecha(v.fecha)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-300 mt-1 line-clamp-2">
                      {v.items.map((i) => `${i.cantidad}x ${i.producto.descripcion}`).join(', ')}
                    </p>
                    <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400 mt-1.5">
                      Total: {formatPrecio(v.total)} ({v.items.reduce((s, i) => s + i.cantidad, 0)} items)
                    </p>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-auto flex-shrink-0">
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleRecuperar(v.id)}
                      className="font-semibold shadow-xs"
                    >
                      Recuperar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40 text-xs font-semibold"
                      onClick={() => eliminarVentaEnEspera(v.id)}
                    >
                      Descartar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2">
            <Button
              variant="secondary"
              fullWidth
              size="sm"
              onClick={() => setModalEsperaOpen(false)}
            >
              Cerrar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal de cobro */}
      <PaymentModal
        isOpen={paymentOpen}
        onClose={() => setPaymentOpen(false)}
        onVentaCompletada={handleVentaCompletada}
      />

      {/* Modal de comprobante térmico / WhatsApp */}
      <TicketReceiptModal
        isOpen={ticketModalOpen}
        onClose={() => setTicketModalOpen(false)}
        ticket={ticketReciente}
      />

      {/* Modal de escaneo por cámara */}
      <BarcodeScannerModal
        isOpen={modalScannerOpen}
        onClose={() => setModalScannerOpen(false)}
        onProductScanned={(producto) => {
          handleSeleccion(producto)
        }}
      />

      {/* Modal de ingreso de peso para artículos de balanza / fiambrería */}
      <BalanzaManualModal
        isOpen={modalBalanzaOpen}
        lecturaSerialHabilitada={tieneBalanza}
        onClose={() => {
          setModalBalanzaOpen(false)
          setProductoPesableModal(null)
        }}
        producto={productoPesableModal}
        onConfirmar={(pesoKg) => {
          if (productoPesableModal) {
            agregarProducto(productoPesableModal, pesoKg)
            toast.success(`${productoPesableModal.descripcion} (${pesoKg} kg) agregado`)
          }
        }}
      />

      {/* Modal de ayuda con atajos de teclado */}
      <KeyboardShortcutsModal
        isOpen={modalShortcutsOpen}
        onClose={() => setModalShortcutsOpen(false)}
      />

      {/* Modal de cobro de ítem libre */}
      <ArticuloLibreModal
        isOpen={modalLibreOpen}
        descripcionInicial={descripcionLibreInicial}
        onClose={() => {
          setModalLibreOpen(false)
          setDescripcionLibreInicial(undefined)
        }}
      />

      {/* Modal de devoluciones y cambios de venta */}
      <DevolucionModal
        isOpen={modalDevolucionOpen}
        ventaInicial={ventaParaDevolver}
        onClose={() => {
          setModalDevolucionOpen(false)
          setVentaParaDevolver(null)
        }}
        onDevolucionExitosa={() => {
          refrescarProductosVista()
          verificarSesionActiva()
        }}
      />

      {/* Modal de historial de comprobantes y reimpresión */}
      <HistorialTicketsModal
        isOpen={modalTicketsOpen}
        onClose={() => setModalTicketsOpen(false)}
        onIniciarDevolucion={(v) => {
          setVentaParaDevolver(v)
          setModalDevolucionOpen(true)
        }}
      />

      {/* Modal de Combos y Promociones Activas */}
      <Modal
        isOpen={modalPromosOpen}
        onClose={() => setModalPromosOpen(false)}
        title="Promociones y Combos Disponibles"
        size="lg"
      >
        <div className="space-y-3">

          <div className="flex flex-wrap gap-2 text-xs"><span className="rounded-xl bg-indigo-50 dark:bg-indigo-950/40 px-3 py-2 font-semibold text-indigo-700 dark:text-indigo-300">{promociones.filter((p) => p.activo).length} reglas habilitadas</span><span className="rounded-xl bg-teal-50 dark:bg-teal-950/40 px-3 py-2 font-semibold text-teal-700 dark:text-teal-300">{promociones.filter((p) => p.activo && p.tipo === 'COMBO').length} combos</span></div>

          <div className="space-y-2.5 max-h-[60vh] overflow-y-auto pr-1">
            {promociones.filter((p) => p.activo).length === 0 ? (
              <div className="text-center py-10 px-4 space-y-3 bg-gray-50 dark:bg-gray-900/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                <p className="text-sm font-bold text-gray-800 dark:text-gray-200">
                  No hay promociones ni combos activos en este momento
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                  Podés configurar combos de productos (ej: Fernet + Coca + Hielo o Sándwiches) o promociones 2x1 en el módulo de Promociones.
                </p>
                <Button
                  size="sm"
                  onClick={() => {
                    setModalPromosOpen(false)
                    navigate('/promociones')
                  }}
                  className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs mt-1"
                >
                  Ir a Crear Combos / Promociones
                </Button>
              </div>
            ) : (
              promociones
                .filter((p) => p.activo)
                .map((promo) => {
                  const esCombo = promo.tipo === 'COMBO'
                  return (
                    <div
                      key={promo.id}
                      className="p-4 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md dark:shadow-black/20"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-2">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                              esCombo
                                ? 'bg-teal-100 text-teal-700 dark:bg-teal-950/70 dark:text-teal-300'
                                : 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/70 dark:text-indigo-300'
                            }`}
                          >
                            {esCombo ? 'Combo Pack' : promo.tipo}
                          </span>
                          <h4 className="text-sm font-bold text-gray-900 dark:text-gray-100 leading-snug [overflow-wrap:anywhere]">
                            {promo.nombre}
                          </h4>
                        </div>

                        {esCombo && promo.items_combo && (
                          <div className="text-[11px] text-gray-600 dark:text-gray-300 space-y-0.5 mt-1">
                            <p className="text-[10px] text-gray-400 font-semibold uppercase">Incluye:</p>
                            {promo.items_combo.map((ic, i) => (
                              <p key={i}>
                                • {ic.cantidad} {ic.producto?.unidad_medida === 'KG' ? 'kg' : 'u.'} de {ic.producto?.descripcion || 'Producto'}
                              </p>
                            ))}
                          </div>
                        )}

                        {!esCombo && (
                          <p className="text-xs text-gray-600 dark:text-gray-300">
                            {promo.producto?.descripcion ? `Producto: ${promo.producto.descripcion}` : ''}
                            {promo.tipo === 'NXM' && ` · Llevás ${promo.cantidad_minima}, pagás ${promo.cantidad_paga}`}
                            {promo.tipo === 'VOLUMEN' && ` · Desde ${promo.cantidad_minima} unidades a ${formatPrecio(promo.precio_unitario_promo || 0)} c/u`}
                            {promo.tipo === 'PORCENTAJE' && ` · ${promo.descuento_porcentaje}% OFF`}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-3 justify-between sm:justify-end flex-shrink-0">
                        {esCombo ? (
                          <>
                            <div className="text-right">
                              <span className="text-[10px] text-gray-400 block">Precio combo:</span>
                              <span className="text-base font-bold text-teal-600 dark:text-teal-400 tabular-nums">
                                {formatPrecio(promo.precio_combo || 0)}
                              </span>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => handleAgregarComboAlTicket(promo)}
                              className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs whitespace-nowrap"
                            >
                              + Cargar al Ticket
                            </Button>
                          </>
                        ) : (
                          <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                            Aplicación automática
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })
            )}
          </div>

          <div className="pt-2 border-t border-gray-100 dark:border-gray-700/80 flex justify-end">
            <button
              type="button"
              onClick={() => {
                setModalPromosOpen(false)
                navigate('/promociones')
              }}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Configurar o crear nuevas promociones →
            </button>
          </div>
        </div>
      </Modal>

      {/* Modal para recibir envases retornables vacíos */}
      {tieneEnvases && (
        <RecibirEnvaseModal
          isOpen={modalEnvaseOpen}
          onClose={() => setModalEnvaseOpen(false)}
        />
      )}

      {/* Modal para retiro rápido de efectivo en mostrador (Sangría de caja) */}
      <RetiroCajaModal
        isOpen={modalRetiroOpen}
        onClose={() => setModalRetiroOpen(false)}
      />

      {/* Asistente On-The-Fly: Alta Rápida de producto desde Mostrador con Catálogo Semilla */}
      <AltaRapidaModal
        isOpen={modalAltaRapidaOpen}
        onClose={() => setModalAltaRapidaOpen(false)}
        codigo={codigoParaAlta}
        productoSugerido={productoSugeridoParaAlta}
        categorias={categorias}
        onCategoriaCreada={(nuevaCat) => setCategorias((prev) => [...prev, nuevaCat])}
        onGuardadoExitoso={(nuevoProd, cant) => {
          handleSeleccion(nuevoProd, cant)
          refrescarProductosVista()
        }}
      />
    </div>
  )
}
