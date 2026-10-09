import { moduleTabsClassName, moduleTabClassName, moduleTabActiveClassName, moduleTabInactiveClassName } from '../components/ui/moduleTabStyles'
import { IndicatorCard } from '../components/ui/IndicatorCard'
import { useState, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { useProveedorStore } from '../stores/proveedorStore'
import { useProducts } from '../hooks/useProducts'
import { useCajaStore } from '../stores/cajaStore'
import { useAuthStore } from '../stores/authStore'
import { useBarcodeGun } from '../hooks/useBarcodeGun'
import { playScanSound } from '../lib/sound'
import { formatPrecio, formatFecha, labelMedioPago } from '../lib/utils'
import { validarCUIT, formatearCUIT } from '../lib/cuitUtils'
import { exportarDetalleCompraExcel } from '../lib/exportUtils'
import { IconExportar } from '../components/ui/Icons'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import { ComprobantePagoModal } from '../components/proveedores/ComprobantePagoModal'
import type {
  Proveedor,
  CompraProveedor,
  DetalleCompra,
  MedioPagoCompra,
  PagoProveedor,
  Producto,
} from '../types/database'
import toast from 'react-hot-toast'

interface RenglonCompra {
  producto_id: string
  producto: Producto
  cantidad: number
  precio_costo_unitario: number
  subtotal: number
}

export function ProveedoresPage() {
  const { usuario, kiosco } = useAuthStore()
  const {
    proveedores,
    compras,
    pagos,
    cargando,
    cargandoCompras,
    cargandoPagos,
    cargarProveedores,
    crearProveedor,
    actualizarProveedor,
    eliminarProveedor,
    cargarPagos,
    abonarSaldoProveedor,
    ajustarSaldoProveedor,
    anularPagoProveedor,
    cargarCompras,
    cargarDetallesCompra,
    registrarCompra,
    anularCompra,
  } = useProveedorStore()

  const {
    productos,
    categorias,
    cargarProductos,
    crearProducto,
    actualizarProducto,
  } = useProducts()

  const { sesionActiva, verificarSesionActiva } = useCajaStore()
  const location = useLocation()

  // Pestaña activa: directorio | nueva_compra | historial | pagos
  const [tabActiva, setTabActiva] = useState<'directorio' | 'nueva_compra' | 'historial' | 'pagos'>('directorio')

  // --- Filtros Directorio ---
  const [busquedaDir, setBusquedaDir] = useState('')
  const [filtroDeuda, setFiltroDeuda] = useState<'TODOS' | 'CON_DEUDA'>('TODOS')

  // --- Modal Alta / Edición Proveedor ---
  const [modalProveedorOpen, setModalProveedorOpen] = useState(false)
  const [proveedorEditando, setProveedorEditando] = useState<Proveedor | null>(null)
  const [formNombre, setFormNombre] = useState('')
  const [formContacto, setFormContacto] = useState('')
  const [formTelefono, setFormTelefono] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formCuit, setFormCuit] = useState('')
  const [formDiasVisita, setFormDiasVisita] = useState('')
  const [formCbuAlias, setFormCbuAlias] = useState('')
  const [formSaldoInicial, setFormSaldoInicial] = useState('')
  const [guardandoProveedor, setGuardandoProveedor] = useState(false)

  // --- Modal Abonar Saldo ---
  const [modalAbonarOpen, setModalAbonarOpen] = useState(false)
  const [proveedorAbonar, setProveedorAbonar] = useState<Proveedor | null>(null)
  const [montoAbono, setMontoAbono] = useState('')
  const [medioPagoAbono, setMedioPagoAbono] = useState<'EFECTIVO' | 'TRANSFERENCIA' | 'OTRO'>('EFECTIVO')
  const [comprobanteRefAbono, setComprobanteRefAbono] = useState('')
  const [notasAbono, setNotasAbono] = useState('')
  const [descontarAbonoDeCaja, setDescontarAbonoDeCaja] = useState(true)
  const [guardandoAbono, setGuardandoAbono] = useState(false)

  // --- Modal Ajuste Manual de Saldo ---
  const [modalAjusteOpen, setModalAjusteOpen] = useState(false)
  const [proveedorAjuste, setProveedorAjuste] = useState<Proveedor | null>(null)
  const [nuevoSaldoAjuste, setNuevoSaldoAjuste] = useState('')
  const [motivoAjuste, setMotivoAjuste] = useState('')
  const [guardandoAjuste, setGuardandoAjuste] = useState(false)

  // --- Modal Comprobante de Pago Generado ---
  const [modalComprobantePagoOpen, setModalComprobantePagoOpen] = useState(false)
  const [pagoSeleccionado, setPagoSeleccionado] = useState<PagoProveedor | null>(null)

  // --- Formulario Nueva Compra ---
  const [compraProveedorId, setCompraProveedorId] = useState('')
  const [compraComprobante, setCompraComprobante] = useState('')
  const [compraFecha, setCompraFecha] = useState(() => new Date().toISOString().slice(0, 16))
  const [compraMedioPago, setCompraMedioPago] = useState<MedioPagoCompra>('EFECTIVO')
  const [compraDescontarCaja, setCompraDescontarCaja] = useState(true)
  const [compraNotas, setCompraNotas] = useState('')
  const [renglones, setRenglones] = useState<RenglonCompra[]>([])
  const [guardandoCompra, setGuardandoCompra] = useState(false)

  // --- Carga Rápida de Compra ---
  const [modoCompra, setModoCompra] = useState<'rapida' | 'detallada'>('rapida')
  const [cargaRapidaTotal, setCargaRapidaTotal] = useState('')
  const [cargaRapidaMedio, setCargaRapidaMedio] = useState<MedioPagoCompra>('EFECTIVO')
  const [cargaRapidaNotas, setCargaRapidaNotas] = useState('')
  const [guardandoCargaRapida, setGuardandoCargaRapida] = useState(false)

  // Buscador de productos para compra
  const [busquedaProducto, setBusquedaProducto] = useState('')
  const [productoSeleccionado, setProductoSeleccionado] = useState<Producto | null>(null)
  const [cantidadIngresar, setCantidadIngresar] = useState('1')
  const [costoIngresar, setCostoIngresar] = useState('')

  // Edición / asignación rápida de código a producto existente
  const [editandoCodigoExistente, setEditandoCodigoExistente] = useState(false)
  const [codigoExistenteInput, setCodigoExistenteInput] = useState('')
  const [guardandoCodigoExistente, setGuardandoCodigoExistente] = useState(false)

  // --- Modal Creación Rápida de Producto al Vuelo ---
  const [modalCrearProductoRapidoOpen, setModalCrearProductoRapidoOpen] = useState(false)
  const [nuevoProdCodigo, setNuevoProdCodigo] = useState('')
  const [nuevoProdDescripcion, setNuevoProdDescripcion] = useState('')
  const [nuevoProdCategoriaId, setNuevoProdCategoriaId] = useState('')
  const [nuevoProdCosto, setNuevoProdCosto] = useState('')
  const [nuevoProdVenta, setNuevoProdVenta] = useState('')
  const [nuevoProdCantidad, setNuevoProdCantidad] = useState('1')
  const [guardandoNuevoProd, setGuardandoNuevoProd] = useState(false)

  // --- Historial y Detalles de Compra ---
  const [busquedaHistorial, setBusquedaHistorial] = useState('')
  const [modalDetalleOpen, setModalDetalleOpen] = useState(false)
  const [compraDetalle, setCompraDetalle] = useState<CompraProveedor | null>(null)
  const [detallesCargados, setDetallesCargados] = useState<DetalleCompra[]>([])
  const [cargandoRenglones, setCargandoRenglones] = useState(false)

  // --- Historial de Pagos ---
  const [busquedaPagos, setBusquedaPagos] = useState('')

  // Cargas iniciales
  useEffect(() => {
    cargarProveedores()
    cargarCompras()
    cargarPagos()
    cargarProductos()
    verificarSesionActiva()
  }, [cargarProveedores, cargarCompras, cargarPagos, cargarProductos, verificarSesionActiva])

  // Deep-link desde reporte de rotación para devolución o reposición con proveedor
  useEffect(() => {
    const state = location.state as { productoId?: string; proveedorId?: string } | null
    if (state?.proveedorId) {
      setCompraProveedorId(state.proveedorId)
      setTabActiva('nueva_compra')
      setModoCompra('detallada')
    }
    if (state?.productoId && productos.length > 0) {
      const prod = productos.find((p) => p.id === state.productoId)
      if (prod) {
        setProductoSeleccionado(prod)
        setCostoIngresar(String(prod.precio_costo || ''))
        setTabActiva('nueva_compra')
        setModoCompra('detallada')
      }
    }
  }, [location.state, productos])

  // Lector de código de barras físico (USB / Bluetooth) en la pestaña de Recepción
  useBarcodeGun({
    enabled:
      tabActiva === 'nueva_compra' &&
      !modalCrearProductoRapidoOpen &&
      !modalProveedorOpen &&
      !modalAbonarOpen &&
      !modalAjusteOpen &&
      !modalDetalleOpen &&
      !modalComprobantePagoOpen,
    onScan: (codigoEscaneado) => {
      handleEscanearCodigo(codigoEscaneado)
    },
  })

  const handleEscanearCodigo = (code: string) => {
    const codigoLimpio = code.trim()
    const encontrado = productos.find(
      (p) =>
        p.codigo_barras === codigoLimpio ||
        (p.codigo_barras && p.codigo_barras.trim() === codigoLimpio)
    )

    if (encontrado) {
      playScanSound('success')
      handleSeleccionarProducto(encontrado)
      toast.success(`Producto escaneado: ${encontrado.descripcion}`)
    } else {
      playScanSound('warning')
      // Abrir modal de creación rápida con el código pre-cargado
      setNuevoProdCodigo(codigoLimpio)
      setNuevoProdDescripcion('')
      setNuevoProdCosto(costoIngresar || '')
      setNuevoProdVenta('')
      setNuevoProdCantidad(cantidadIngresar || '1')
      setNuevoProdCategoriaId(categorias[0]?.id || '')
      setModalCrearProductoRapidoOpen(true)
      toast(`Código ${codigoLimpio} no encontrado en catálogo. Crealo al vuelo.`, { icon: '✨' })
    }
  }

  // Métricas
  const totalProveedores = proveedores.length
  const totalDeudaProveedores = useMemo(() => {
    return proveedores.reduce((sum, p) => sum + (Number(p.saldo_pendiente) || 0), 0)
  }, [proveedores])

  const totalComprasRecibidas = useMemo(() => {
    return compras
      .filter((c) => c.estado === 'RECIBIDA')
      .reduce((sum, c) => sum + (Number(c.total) || 0), 0)
  }, [compras])

  const totalPagosRealizados = useMemo(() => {
    return pagos
      .filter((p) => p.estado !== 'ANULADO')
      .reduce((sum, p) => sum + (Number(p.monto) || 0), 0)
  }, [pagos])

  // Filtrado de Proveedores
  const proveedoresFiltrados = useMemo(() => {
    return proveedores.filter((p) => {
      const q = busquedaDir.toLowerCase()
      const match =
        p.nombre.toLowerCase().includes(q) ||
        (p.contacto_nombre && p.contacto_nombre.toLowerCase().includes(q)) ||
        (p.cuit && p.cuit.includes(q)) ||
        (p.telefono && p.telefono.includes(q)) ||
        (p.dias_visita && p.dias_visita.toLowerCase().includes(q))

      if (!match) return false
      if (filtroDeuda === 'CON_DEUDA') return (p.saldo_pendiente || 0) > 0
      return true
    })
  }, [proveedores, busquedaDir, filtroDeuda])

  // Filtrado de Productos para sugerencias en Nueva Compra
  const sugerenciasProductos = useMemo(() => {
    if (!busquedaProducto.trim()) return []
    const q = busquedaProducto.toLowerCase()
    return productos
      .filter(
        (prod) =>
          prod.descripcion.toLowerCase().includes(q) ||
          (prod.codigo_barras && prod.codigo_barras.includes(q))
      )
      .slice(0, 8)
  }, [productos, busquedaProducto])

  // Total de la compra en curso
  const totalCompraCalculado = useMemo(() => {
    return renglones.reduce((sum, r) => sum + r.subtotal, 0)
  }, [renglones])

  const totalBultosCalculado = useMemo(() => {
    return renglones.reduce((sum, r) => sum + r.cantidad, 0)
  }, [renglones])

  // Handlers Proveedor
  const handleNuevoProveedor = () => {
    setProveedorEditando(null)
    setFormNombre('')
    setFormContacto('')
    setFormTelefono('')
    setFormEmail('')
    setFormCuit('')
    setFormDiasVisita('')
    setFormCbuAlias('')
    setFormSaldoInicial('')
    setModalProveedorOpen(true)
  }

  const cerrarModalProveedor = () => {
    setModalProveedorOpen(false)
    setProveedorEditando(null)
    setFormNombre('')
    setFormContacto('')
    setFormTelefono('')
    setFormEmail('')
    setFormCuit('')
    setFormDiasVisita('')
    setFormCbuAlias('')
    setFormSaldoInicial('')
  }

  const handleEditarProveedor = (p: Proveedor) => {
    setProveedorEditando(p)
    setFormNombre(p.nombre)
    setFormContacto(p.contacto_nombre || '')
    setFormTelefono(p.telefono || '')
    setFormEmail(p.email || '')
    setFormCuit(p.cuit || '')
    setFormDiasVisita(p.dias_visita || '')
    setFormCbuAlias(p.cbu_alias || '')
    setFormSaldoInicial(p.saldo_pendiente ? String(p.saldo_pendiente) : '')
    setModalProveedorOpen(true)
  }

  const handleGuardarProveedor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (guardandoProveedor) return
    const nombreLimpio = formNombre.trim()
    if (!nombreLimpio) {
      toast.error('El nombre del proveedor es obligatorio')
      return
    }

    const saldoNum = Number(formSaldoInicial) || 0
    if (saldoNum < 0) {
      toast.error('El saldo pendiente no puede ser negativo')
      return
    }

    const cuitLimpio = formCuit.trim()
    if (cuitLimpio && !validarCUIT(cuitLimpio)) {
      toast.error('El CUIT ingresado no es válido según el algoritmo Módulo 11 de AFIP')
      return
    }
    const cuitFinal = cuitLimpio ? formatearCUIT(cuitLimpio) : null

    setGuardandoProveedor(true)
    try {
      if (proveedorEditando) {
        await actualizarProveedor(proveedorEditando.id, {
          nombre: nombreLimpio,
          contacto_nombre: formContacto.trim() || null,
          telefono: formTelefono.trim() || null,
          email: formEmail.trim() || null,
          cuit: cuitFinal,
          dias_visita: formDiasVisita.trim() || null,
          cbu_alias: formCbuAlias.trim() || null,
          saldo_pendiente: saldoNum,
        })
      } else {
        await crearProveedor({
          nombre: nombreLimpio,
          contacto_nombre: formContacto.trim() || null,
          telefono: formTelefono.trim() || null,
          email: formEmail.trim() || null,
          cuit: cuitFinal,
          dias_visita: formDiasVisita.trim() || null,
          cbu_alias: formCbuAlias.trim() || null,
          saldo_pendiente: saldoNum,
        })
      }
      cerrarModalProveedor()
    } finally {
      setGuardandoProveedor(false)
    }
  }

  const handleEliminarProveedor = async (p: Proveedor) => {
    if (confirm(`¿Estás seguro de eliminar al proveedor "${p.nombre}"?`)) {
      await eliminarProveedor(p.id)
    }
  }

  // Handlers Abonar Saldo / Pago
  const handleAbrirAbonar = (p: Proveedor) => {
    setProveedorAbonar(p)
    setMontoAbono(String(p.saldo_pendiente || ''))
    setMedioPagoAbono('EFECTIVO')
    setComprobanteRefAbono('')
    setNotasAbono('')
    setDescontarAbonoDeCaja(Boolean(sesionActiva))
    setModalAbonarOpen(true)
  }

  const handleFijarMontoPreset = (porcentaje: number) => {
    if (!proveedorAbonar) return
    const deuda = proveedorAbonar.saldo_pendiente || 0
    if (deuda <= 0) {
      setMontoAbono('')
      return
    }
    const valor = porcentaje === 1 ? deuda : Math.round(deuda * porcentaje * 100) / 100
    setMontoAbono(String(valor))
  }

  const handleGuardarAbono = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!proveedorAbonar || guardandoAbono) return
    const monto = Number(montoAbono)
    if (isNaN(monto) || monto <= 0) {
      toast.error('Ingresá un monto válido mayor a cero')
      return
    }

    setGuardandoAbono(true)
    try {
      const comprobanteGenerado = await abonarSaldoProveedor(
        proveedorAbonar.id,
        monto,
        medioPagoAbono,
        descontarAbonoDeCaja,
        notasAbono,
        comprobanteRefAbono
      )
      if (comprobanteGenerado) {
        setModalAbonarOpen(false)
        setPagoSeleccionado(comprobanteGenerado)
        setModalComprobantePagoOpen(true)
      }
    } finally {
      setGuardandoAbono(false)
    }
  }

  // Handlers Ajuste Manual de Saldo
  const handleAbrirAjuste = (p: Proveedor) => {
    setProveedorAjuste(p)
    setNuevoSaldoAjuste(String(p.saldo_pendiente || 0))
    setMotivoAjuste('')
    setModalAjusteOpen(true)
  }

  const handleGuardarAjuste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!proveedorAjuste || guardandoAjuste) return
    const saldo = parseFloat(nuevoSaldoAjuste)
    if (isNaN(saldo) || saldo < 0) {
      toast.error('Ingresá un saldo válido mayor o igual a 0')
      return
    }

    setGuardandoAjuste(true)
    try {
      const ok = await ajustarSaldoProveedor(proveedorAjuste.id, saldo, motivoAjuste)
      if (ok) {
        setModalAjusteOpen(false)
      }
    } finally {
      setGuardandoAjuste(false)
    }
  }

  // Copiar alias al portapapeles
  const handleCopiarAlias = (alias: string) => {
    navigator.clipboard.writeText(alias)
    toast.success('Alias/CBU copiado al portapapeles')
  }

  // Handlers Nueva Compra
  const handleSeleccionarProducto = (prod: Producto) => {
    setProductoSeleccionado(prod)
    setBusquedaProducto(prod.descripcion)
    setCostoIngresar(String(prod.precio_costo || ''))
    setCantidadIngresar('1')
    setEditandoCodigoExistente(false)
    setCodigoExistenteInput(prod.codigo_barras || '')
  }

  const handleBusquedaKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      const query = busquedaProducto.trim()
      if (!query) return

      // Buscar coincidencia exacta por código o descripción
      const matchExacto = productos.find(
        (p) =>
          p.codigo_barras?.toLowerCase() === query.toLowerCase() ||
          p.descripcion.toLowerCase() === query.toLowerCase()
      )

      if (matchExacto) {
        handleSeleccionarProducto(matchExacto)
        playScanSound('success')
        return
      }

      // Si hay 1 sola coincidencia parcial en sugerencias, seleccionarla
      if (sugerenciasProductos.length === 1) {
        handleSeleccionarProducto(sugerenciasProductos[0])
        playScanSound('success')
        return
      }

      // Si no existe, abrir modal de creación rápida
      abrirModalCrearProductoRapido(query)
    }
  }

  const abrirModalCrearProductoRapido = (terminoInicial?: string) => {
    const texto = (terminoInicial || busquedaProducto).trim()
    const esCodigo = /^\d{6,}$/.test(texto)

    setNuevoProdCodigo(esCodigo ? texto : '')
    setNuevoProdDescripcion(esCodigo ? '' : texto)
    setNuevoProdCosto(costoIngresar || '')
    setNuevoProdVenta('')
    setNuevoProdCantidad(cantidadIngresar || '1')
    setNuevoProdCategoriaId(categorias[0]?.id || '')
    setModalCrearProductoRapidoOpen(true)
  }

  const handleGuardarNuevoProductoRapido = async (e: React.FormEvent) => {
    e.preventDefault()
    if (guardandoNuevoProd) return
    if (!nuevoProdDescripcion.trim()) {
      toast.error('El nombre del producto es obligatorio')
      return
    }
    const costo = parseFloat(nuevoProdCosto) || 0
    const venta = parseFloat(nuevoProdVenta)
    if (isNaN(venta) || venta <= 0) {
      toast.error('Ingresá un precio de venta válido mayor a 0')
      return
    }
    const cant = parseInt(nuevoProdCantidad, 10) || 1

    setGuardandoNuevoProd(true)
    try {
      const productoCreado = await crearProducto({
        descripcion: nuevoProdDescripcion.trim(),
        codigo_barras: nuevoProdCodigo.trim() || null,
        categoria_id: nuevoProdCategoriaId || null,
        precio_costo: costo,
        precio_venta: venta,
        stock_actual: 0,
        stock_minimo: 5,
        es_favorito: false,
      })

      if (productoCreado) {
        const renglonNuevo: RenglonCompra = {
          producto_id: productoCreado.id,
          producto: productoCreado,
          cantidad: cant,
          precio_costo_unitario: costo,
          subtotal: cant * costo,
        }
        setRenglones([...renglones, renglonNuevo])
        setModalCrearProductoRapidoOpen(false)
        playScanSound('success')
        toast.success(`"${productoCreado.descripcion}" creado y agregado al remito`)
        setBusquedaProducto('')
      }
    } finally {
      setGuardandoNuevoProd(false)
    }
  }

  // Asignar / Cambiar código de barras a producto existente seleccionado
  const handleGuardarCodigoExistente = async () => {
    if (!productoSeleccionado || guardandoCodigoExistente) return
    const nuevoCodigo = codigoExistenteInput.trim() || null

    setGuardandoCodigoExistente(true)
    try {
      const ok = await actualizarProducto(productoSeleccionado.id, {
        codigo_barras: nuevoCodigo,
      })
      if (ok) {
        setProductoSeleccionado({
          ...productoSeleccionado,
          codigo_barras: nuevoCodigo,
        })
        setEditandoCodigoExistente(false)
        toast.success(nuevoCodigo ? `Código de barras ${nuevoCodigo} asignado` : 'Código eliminado')
      }
    } finally {
      setGuardandoCodigoExistente(false)
    }
  }

  // Calculadora de margen en creación rápida
  const margenNuevoProd = useMemo(() => {
    const c = parseFloat(nuevoProdCosto) || 0
    const v = parseFloat(nuevoProdVenta) || 0
    if (c <= 0 || v <= 0) return null
    const ganancia = v - c
    const pct = Math.round((ganancia / c) * 100)
    return { ganancia, pct }
  }, [nuevoProdCosto, nuevoProdVenta])

  const aplicarMargenVenta = (porcentaje: number) => {
    const c = parseFloat(nuevoProdCosto) || 0
    if (c <= 0) {
      toast.error('Ingresá primero el precio de costo')
      return
    }
    const precioCalculado = Math.round(c * (1 + porcentaje / 100))
    setNuevoProdVenta(String(precioCalculado))
  }

  const handleAgregarRenglon = () => {
    if (!productoSeleccionado) {
      toast.error('Seleccioná un producto del catálogo')
      return
    }
    const cant = parseInt(cantidadIngresar, 10)
    if (isNaN(cant) || cant <= 0) {
      toast.error('Ingresá una cantidad válida mayor a 0')
      return
    }
    const costo = parseFloat(costoIngresar)
    if (isNaN(costo) || costo < 0) {
      toast.error('Ingresá un costo unitario válido')
      return
    }

    const indexExistente = renglones.findIndex((r) => r.producto_id === productoSeleccionado.id)
    if (indexExistente >= 0) {
      const actualizados = [...renglones]
      const actual = actualizados[indexExistente]
      const nuevaCantidad = actual.cantidad + cant
      actualizados[indexExistente] = {
        ...actual,
        cantidad: nuevaCantidad,
        precio_costo_unitario: costo,
        subtotal: nuevaCantidad * costo,
      }
      setRenglones(actualizados)
    } else {
      setRenglones([
        ...renglones,
        {
          producto_id: productoSeleccionado.id,
          producto: productoSeleccionado,
          cantidad: cant,
          precio_costo_unitario: costo,
          subtotal: cant * costo,
        },
      ])
    }

    setProductoSeleccionado(null)
    setBusquedaProducto('')
    setCostoIngresar('')
    setCantidadIngresar('1')
  }

  const handleModificarCantidadRenglon = (index: number, delta: number) => {
    const actualizados = [...renglones]
    const actual = actualizados[index]
    const nuevaCant = Math.max(1, actual.cantidad + delta)
    actualizados[index] = {
      ...actual,
      cantidad: nuevaCant,
      subtotal: nuevaCant * actual.precio_costo_unitario,
    }
    setRenglones(actualizados)
  }

  const handleEliminarRenglon = (index: number) => {
    setRenglones(renglones.filter((_, i) => i !== index))
  }

  // Odoo ERP: Auto-reordering rules (Punto de pedido automático según stock mínimo)
  const handleCalcularPuntoPedido = () => {
    const productosBajoStock = productos.filter(
      (p) => p.activo && p.stock_minimo > 0 && p.stock_actual <= p.stock_minimo
    )

    if (productosBajoStock.length === 0) {
      toast('No hay productos con stock igual o inferior al punto de pedido mínimo', {
        icon: 'i',
      })
      return
    }

    const nuevosRenglones: RenglonCompra[] = productosBajoStock.map((prod) => {
      // Reposición sugerida: Llevar stock al doble del mínimo
      const reposicionSugerida = Math.max(1, prod.stock_minimo * 2 - Math.max(0, prod.stock_actual))
      const costo = prod.precio_costo || 0
      return {
        producto_id: prod.id,
        producto: prod,
        cantidad: reposicionSugerida,
        precio_costo_unitario: costo,
        subtotal: reposicionSugerida * costo,
      }
    })

    // Si ya había productos en el remito, unificamos evitando duplicados
    const mapaActual = new Map(renglones.map((r) => [r.producto_id, r]))
    nuevosRenglones.forEach((nr) => {
      if (mapaActual.has(nr.producto_id)) {
        const existente = mapaActual.get(nr.producto_id)!
        mapaActual.set(nr.producto_id, {
          ...existente,
          cantidad: Math.max(existente.cantidad, nr.cantidad),
          subtotal: Math.max(existente.cantidad, nr.cantidad) * existente.precio_costo_unitario,
        })
      } else {
        mapaActual.set(nr.producto_id, nr)
      }
    })

    const listaFinal = Array.from(mapaActual.values())
    setRenglones(listaFinal)
    toast.success(
      `Punto de pedido calculado: ${productosBajoStock.length} artículos agregados al remito`
    )
  }

  // Odoo ERP: Generador de Orden de Compra por WhatsApp
  const handleEnviarPedidoWhatsApp = () => {
    if (renglones.length === 0) {
      toast.error('Agregá al menos un artículo para generar el pedido')
      return
    }

    const prov = proveedores.find((p) => p.id === compraProveedorId)
    const lineas = renglones.map(
      (r) => `- ${r.producto.descripcion}: ${r.cantidad} u.`
    )

    const mensaje =
      `*PEDIDO DE REPOSICIÓN*\n` +
      `Proveedor: ${prov?.nombre || 'General'}\n` +
      `Fecha: ${new Date().toLocaleDateString('es-AR')}\n\n` +
      `*Artículos solicitados:*\n` +
      lineas.join('\n') +
      `\n\n*Total estimado:* ${formatPrecio(totalCompraCalculado)}\n` +
      `*Solicitado por:* ${usuario?.nombre || kiosco?.nombre || 'AlPaso POS'}`

    if (navigator.clipboard) {
      navigator.clipboard.writeText(mensaje)
    }

    let telefonoLimpio = prov?.telefono ? prov.telefono.replace(/[^0-9]/g, '') : ''
    if (telefonoLimpio && !telefonoLimpio.startsWith('54') && telefonoLimpio.length <= 11) {
      // Formato Argentina: 549...
      telefonoLimpio = `549${telefonoLimpio}`
    }

    const waUrl = telefonoLimpio
      ? `https://wa.me/${telefonoLimpio}?text=${encodeURIComponent(mensaje)}`
      : `https://wa.me/?text=${encodeURIComponent(mensaje)}`

    window.open(waUrl, '_blank')
    toast.success('Pedido copiado al portapapeles y WhatsApp abierto')
  }

  const handleIniciarCompraAProveedor = (p: Proveedor) => {
    setCompraProveedorId(p.id)
    setTabActiva('nueva_compra')
  }

  const handleGuardarCompra = async () => {
    if (guardandoCompra) return
    if (!compraProveedorId) {
      toast.error('Seleccioná el proveedor emisor')
      return
    }
    if (renglones.length === 0) {
      toast.error('Agregá al menos un producto a la compra')
      return
    }

    setGuardandoCompra(true)
    try {
      const resultado = await registrarCompra(
        {
          proveedor_id: compraProveedorId,
          nro_comprobante: compraComprobante.trim() || null,
          fecha: new Date(compraFecha).toISOString(),
          total: totalCompraCalculado,
          medio_pago: compraMedioPago,
          pagado_en_caja: compraDescontarCaja && compraMedioPago === 'EFECTIVO',
          notas: compraNotas.trim() || null,
          detalles: renglones.map((r) => ({
            producto_id: r.producto_id,
            cantidad: r.cantidad,
            precio_costo_unitario: r.precio_costo_unitario,
            subtotal: r.subtotal,
            producto: r.producto,
          })),
        },
        compraDescontarCaja
      )

      if (resultado.success) {
        setCompraComprobante('')
        setCompraNotas('')
        setRenglones([])
        setTabActiva('historial')
        cargarProductos()
      }
    } finally {
      setGuardandoCompra(false)
    }
  }

  const handleGuardarCargaRapida = async () => {
    if (guardandoCargaRapida) return
    if (!compraProveedorId) {
      toast.error('Seleccioná el proveedor')
      return
    }
    const totalNum = parseFloat(cargaRapidaTotal)
    if (!totalNum || totalNum <= 0) {
      toast.error('Ingresá un monto total válido')
      return
    }
    setGuardandoCargaRapida(true)
    try {
      const resultado = await registrarCompra(
        {
          proveedor_id: compraProveedorId,
          nro_comprobante: null,
          fecha: new Date().toISOString(),
          total: totalNum,
          medio_pago: cargaRapidaMedio,
          pagado_en_caja: cargaRapidaMedio === 'EFECTIVO',
          notas: cargaRapidaNotas.trim() || 'Carga rápida',
          detalles: [],
        },
        cargaRapidaMedio === 'EFECTIVO'
      )
      if (resultado.success) {
        setCargaRapidaTotal('')
        setCargaRapidaNotas('')
        setCompraProveedorId('')
        toast.success('Compra registrada correctamente')
        setTabActiva('historial')
      }
    } finally {
      setGuardandoCargaRapida(false)
    }
  }

  // Handlers Historial de Compras
  const handleVerDetalleCompra = async (c: CompraProveedor) => {
    setCompraDetalle(c)
    setModalDetalleOpen(true)
    setCargandoRenglones(true)
    const items = await cargarDetallesCompra(c.id)
    setDetallesCargados(items)
    setCargandoRenglones(false)
  }

  const handleAnularCompra = async (c: CompraProveedor) => {
    if (confirm(`¿Estás seguro de ANULAR el comprobante "${c.nro_comprobante || 'S/N'}" por ${formatPrecio(c.total)}?`)) {
      await anularCompra(c.id)
    }
  }

  const handleImprimirRemito = () => {
    window.print()
  }

  const handleCompartirRemitoWhatsApp = () => {
    if (!compraDetalle) return
    let msg = `*CONSTANCIA DE RECEPCIÓN / REMITO*\n`
    msg += `Proveedor: *${compraDetalle.proveedor?.nombre || 'Proveedor'}*\n`
    msg += `Comprobante N°: *${compraDetalle.nro_comprobante || 'S/N'}*\n`
    msg += `Fecha: ${formatFecha(compraDetalle.fecha)}\n`
    msg += `--------------------------------\n`
    detallesCargados.forEach((d) => {
      msg += `${d.cantidad}x ${d.producto?.descripcion || 'Producto'} ($${d.precio_costo_unitario.toLocaleString('es-AR')}) = $${d.subtotal.toLocaleString('es-AR')}\n`
    })
    msg += `--------------------------------\n`
    msg += `*TOTAL COMPRA: ${formatPrecio(compraDetalle.total)}*\n`
    msg += `Medio de Pago: ${compraDetalle.medio_pago}\n`
    if (compraDetalle.notas) msg += `Notas: ${compraDetalle.notas}\n`
    msg += `Recepción confirmada en inventario.`

    const tel = compraDetalle.proveedor?.telefono?.replace(/\D/g, '') || ''
    const url = tel
      ? `https://api.whatsapp.com/send?phone=${tel}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  const handleExportarExcelRemito = async () => {
    if (!compraDetalle) return
    const kiosco = useAuthStore.getState().kiosco
    await exportarDetalleCompraExcel(compraDetalle, detallesCargados, kiosco?.nombre || 'Kiosco')
    toast.success('Remito exportado en formato Excel (.xlsx)')
  }

  // Handlers Historial de Pagos
  const handleVerComprobantePago = (p: PagoProveedor) => {
    setPagoSeleccionado(p)
    setModalComprobantePagoOpen(true)
  }

  const handleAnularPago = async (p: PagoProveedor) => {
    if (
      confirm(
        `¿Deseas anular el pago de ${formatPrecio(p.monto)} a "${p.proveedor?.nombre || 'Proveedor'}"? Esto restituirá la deuda en la cuenta corriente.`
      )
    ) {
      await anularPagoProveedor(p.id)
    }
  }

  const comprasFiltradas = useMemo(() => {
    return compras.filter((c) => {
      const q = busquedaHistorial.toLowerCase()
      const matchProv = c.proveedor?.nombre.toLowerCase().includes(q) || false
      const matchComp = c.nro_comprobante?.toLowerCase().includes(q) || false
      return matchProv || matchComp
    })
  }, [compras, busquedaHistorial])

  const pagosFiltrados = useMemo(() => {
    return pagos.filter((p) => {
      const q = busquedaPagos.toLowerCase()
      const matchProv = p.proveedor?.nombre.toLowerCase().includes(q) || false
      const matchRef = p.comprobante_ref?.toLowerCase().includes(q) || false
      return matchProv || matchRef
    })
  }, [pagos, busquedaPagos])

  const calculoSaldoAbono = useMemo(() => {
    if (!proveedorAbonar) return { restante: 0, esTotal: true, aFavor: 0 }
    const deuda = proveedorAbonar.saldo_pendiente || 0
    const pago = Number(montoAbono) || 0
    const diff = deuda - pago
    return {
      restante: Math.max(0, diff),
      esTotal: diff <= 0,
      aFavor: diff < 0 ? Math.abs(diff) : 0,
    }
  }, [proveedorAbonar, montoAbono])

  return (
    <div className="max-w-6xl mx-auto space-y-4">
      {/* Encabezado */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 sm:gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Proveedores y Compras
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
            Recepción de mercadería, remitos y control de pagos
          </p>
        </div>

      </div>
      {/* Categorías del módulo */}
        <div className={moduleTabsClassName}>
          <button
            type="button"
            onClick={() => setTabActiva('directorio')}
            className={`${moduleTabClassName} ${
              tabActiva === 'directorio'
                ? moduleTabActiveClassName
                : moduleTabInactiveClassName
            }`}
          >
            Directorio ({totalProveedores})
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('nueva_compra')}
            title="Cargar nueva compra o remito de proveedor"
            className={`${moduleTabClassName} ${
              tabActiva === 'nueva_compra'
                ? moduleTabActiveClassName
                : moduleTabInactiveClassName
            }`}
          >
            Nueva Compra
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('historial')}
            title="Historial de comprobantes y remitos"
            className={`${moduleTabClassName} ${
              tabActiva === 'historial'
                ? moduleTabActiveClassName
                : moduleTabInactiveClassName
            }`}
          >
            Compras ({compras.length})
          </button>
          <button
            type="button"
            onClick={() => setTabActiva('pagos')}
            title="Historial de pagos a proveedores y recibos"
            className={`${moduleTabClassName} ${
              tabActiva === 'pagos'
                ? moduleTabActiveClassName
                : moduleTabInactiveClassName
            }`}
          >
            Pagos ({pagos.length})
          </button>
        </div>

      {/* Tarjetas de métricas rápidas */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <IndicatorCard label="Proveedores Registrados" valor={totalProveedores} icono="usuarios" detalle="Contactos disponibles para compras y pagos" />
        <IndicatorCard label="Cuentas por Pagar (Deuda)" valor={formatPrecio(totalDeudaProveedores)} icono="alerta" tono="amber" detalle="Saldo pendiente con tus proveedores" />
        <IndicatorCard label="Compras Recibidas" valor={formatPrecio(totalComprasRecibidas)} icono="caja" detalle="Importe de compras registradas como recibidas" />
        <IndicatorCard label="Pagos Emitidos" valor={formatPrecio(totalPagosRealizados)} icono="dinero" tono="emerald" detalle="Pagos registrados, sin incluir anulados" />
      </div>
      {/* ─────────────────────────────────────────────────────────────
          TAB 1: DIRECTORIO DE PROVEEDORES
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === 'directorio' && (
        <div className="space-y-3">
          <div className="flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20">
            <div className="flex flex-1 flex-wrap gap-3 items-center min-w-0">
              <div className="relative flex-1 max-w-md">
                <input
                  type="text"
                  placeholder="Buscar proveedor, contacto, CUIT o teléfono..."
                  value={busquedaDir}
                  onChange={(e) => setBusquedaDir(e.target.value)}
                  className="w-full pl-3 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:bg-white dark:focus:bg-gray-800 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <select
                value={filtroDeuda}
                onChange={(e) => setFiltroDeuda(e.target.value as any)}
                aria-label="Filtrar por deuda de proveedor"
                className="py-2 px-3 text-xs sm:text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-700 dark:text-gray-300"
              >
                <option value="TODOS">Todos</option>
                <option value="CON_DEUDA">Con saldo a pagar</option>
              </select>
            </div>

            <Button onClick={handleNuevoProveedor} size="sm">
              + Nuevo Proveedor
            </Button>
          </div>

          {cargando ? (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Cargando directorio de proveedores...
            </div>
          ) : proveedoresFiltrados.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-200 dark:border-gray-700 text-center shadow-md dark:shadow-black/20">
              <span className="mb-3 inline-flex rounded-2xl bg-indigo-50 dark:bg-indigo-900/30 p-4 text-indigo-500"><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8M17 4a4 4 0 0 1 0 7M22 21v-2a4 4 0 0 0-3-4" /></svg></span>
              <p className="text-gray-600 dark:text-gray-300 font-medium">No se encontraron proveedores</p>
              <p className="text-xs text-gray-400 mt-1">
                {busquedaDir || filtroDeuda !== 'TODOS' ? 'Probá con otra búsqueda o cambiá el filtro de deuda' : 'Registrá a tu primer proveedor para organizar compras y remitos'}
              </p>
              <Button onClick={handleNuevoProveedor} size="sm" className="mt-3">
                Crear Proveedor
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {proveedoresFiltrados.map((p) => {
                const tieneDeuda = (p.saldo_pendiente || 0) > 0
                const whatsappNumber = p.telefono?.replace(/\D/g, '')

                return (
                  <div
                    key={p.id}
                    className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-md dark:shadow-black/20 flex flex-col justify-between hover:border-indigo-300 dark:hover:border-indigo-700 transition-colors"
                  >
                    <div>
                      <div className="flex justify-between items-start">
                        <div>
                          <h2 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">
                            {p.nombre}
                          </h2>
                          {p.contacto_nombre && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                              Contacto: {p.contacto_nombre}
                            </p>
                          )}
                        </div>

                        {tieneDeuda && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 dark:bg-amber-900/40 text-amber-800 dark:text-amber-300">
                            Deuda: {formatPrecio(p.saldo_pendiente)}
                          </span>
                        )}
                      </div>

                      <div className="mt-3 space-y-1.5 text-xs text-gray-600 dark:text-gray-400">
                        {p.dias_visita && (
                          <div className="flex items-center gap-1.5">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Visita:</span>
                            <span className="bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 px-1.5 py-0.5 rounded font-medium">
                              {p.dias_visita}
                            </span>
                          </div>
                        )}

                        {p.cuit && (
                          <div>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">CUIT:</span> {p.cuit}
                          </div>
                        )}

                        {p.telefono && (
                          <div className="flex items-center gap-2 pt-0.5">
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Tel:</span>
                            <span>{p.telefono}</span>
                            {whatsappNumber && (
                              <a
                                href={`https://wa.me/${whatsappNumber}`}
                                target="_blank"
                                rel="noreferrer"
                                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline"
                              >
                                [WhatsApp]
                              </a>
                            )}
                            <a
                              href={`tel:${p.telefono}`}
                              className="text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 hover:underline"
                            >
                              [Llamar]
                            </a>
                          </div>
                        )}

                        {p.cbu_alias && (
                          <div className="flex items-center justify-between pt-1 bg-gray-50 dark:bg-gray-900 p-1.5 rounded-lg border border-gray-100 dark:border-gray-700">
                            <span className="truncate text-[11px]">
                              <strong className="text-gray-700 dark:text-gray-300">Alias/CBU:</strong> {p.cbu_alias}
                            </span>
                            <button
                              onClick={() => handleCopiarAlias(p.cbu_alias!)}
                              className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline ml-2 flex-shrink-0"
                            >
                              Copiar
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-gray-100 dark:border-gray-700/60 flex items-center justify-between gap-2 text-xs flex-wrap">
                      <div className="flex gap-1.5 flex-wrap items-center">
                        <button
                          type="button"
                          onClick={() => handleIniciarCompraAProveedor(p)}
                          className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-semibold text-blue-700 dark:text-blue-300 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950/50 dark:hover:bg-blue-900/60 border border-blue-200 dark:border-blue-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          Comprar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAbrirAbonar(p)}
                          className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/50 dark:hover:bg-emerald-900/60 border border-emerald-200 dark:border-emerald-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          Pagar / Abonar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAbrirAjuste(p)}
                          className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-semibold text-amber-700 dark:text-amber-300 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/50 dark:hover:bg-amber-900/60 border border-amber-200 dark:border-amber-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                          title="Ajustar saldo sin mover caja"
                        >
                          Ajustar
                        </button>
                      </div>

                      <div className="flex gap-1.5 items-center">
                        <button
                          type="button"
                          onClick={() => handleEditarProveedor(p)}
                          className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleEliminarProveedor(p)}
                          className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 dark:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: REGISTRAR COMPRA / RECEPCIÓN DE MERCADERÍA
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === 'nueva_compra' && (
        <div className="space-y-4">

          {/* ── Selector de modo ── */}
          <div className="flex flex-wrap bg-gray-100 dark:bg-gray-800 p-1 rounded-xl border border-gray-200 dark:border-gray-700 gap-1 self-start">
            <button
              type="button"
              onClick={() => setModoCompra('rapida')}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${
                modoCompra === 'rapida'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Carga Rápida
            </button>
            <button
              type="button"
              onClick={() => setModoCompra('detallada')}
              className={`px-4 py-1.5 text-sm font-semibold rounded-lg transition-all ${
                modoCompra === 'detallada'
                  ? 'bg-white dark:bg-gray-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Detallada (por producto)
            </button>
          </div>

          {/* ── Modo Carga Rápida ── */}
          {modoCompra === 'rapida' && (
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)] items-start">
            <div className="bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 space-y-4">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2">
                Carga Rápida de Compra
              </h2>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Proveedor *
                </label>
                <select
                  value={compraProveedorId}
                  onChange={(e) => setCompraProveedorId(e.target.value)}
                  className="w-full py-2.5 px-3.5 text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="">-- Seleccionar Proveedor --</option>
                  {proveedores.map((prov) => (
                    <option key={prov.id} value={prov.id}>
                      {prov.nombre} {prov.saldo_pendiente > 0 ? `(Deuda: ${formatPrecio(prov.saldo_pendiente)})` : ''}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Monto total de la compra *
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Ej: 15000"
                  value={cargaRapidaTotal}
                  onChange={(e) => setCargaRapidaTotal(e.target.value)}
                  className="w-full py-2.5 px-3.5 text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Medio de pago
                </label>
                <select
                  value={cargaRapidaMedio}
                  onChange={(e) => setCargaRapidaMedio(e.target.value as MedioPagoCompra)}
                  className="w-full py-2.5 px-3.5 text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="EFECTIVO">Efectivo (pagado de caja)</option>
                  <option value="TRANSFERENCIA">Transferencia bancaria (pagado)</option>
                  <option value="CUENTA_CORRIENTE">Quedó a deber (cuenta corriente / deuda)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Notas (opcional)
                </label>
                <input
                  type="text"
                  placeholder="Ej: Remito 0492, mercadería general"
                  value={cargaRapidaNotas}
                  onChange={(e) => setCargaRapidaNotas(e.target.value)}
                  className="w-full py-2.5 px-3.5 text-sm font-medium rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>

              <Button
                variant="primary"
                onClick={handleGuardarCargaRapida}
                loading={guardandoCargaRapida}
                fullWidth
              >
                Registrar Compra
              </Button>
            </div>
            <aside className="rounded-2xl border border-indigo-200 dark:border-indigo-800/50 bg-indigo-50 dark:bg-indigo-950/20 p-5 shadow-sm space-y-4">
              <span className="inline-flex rounded-lg bg-indigo-100 dark:bg-indigo-900/50 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">Guía de compra</span>
              <h3 className="font-bold text-gray-900 dark:text-gray-100">Elegí cómo registrar la mercadería</h3>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400"><strong>Carga rápida:</strong> registra el importe y su pago o deuda. Al no detallar productos, no aumenta el stock.</p>
              <p className="text-sm leading-relaxed text-gray-600 dark:text-gray-400"><strong>Detallada por producto:</strong> permite ingresar cantidades y costos para recibir mercadería y actualizar el inventario.</p>
              <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-4 text-xs leading-relaxed text-gray-600 dark:text-gray-400"><strong className="block mb-1 text-gray-900 dark:text-gray-100">¿Cómo impacta el pago?</strong>El efectivo se registra como salida de caja. La transferencia se registra como pagada. Si queda a deber, aumenta la cuenta corriente del proveedor.</div>
              {!proveedores.length && <Button variant="secondary" size="sm" onClick={handleNuevoProveedor}>Crear proveedor para comenzar</Button>}
            </aside>
            </div>
          )}

          {/* ── Modo Detallado (original) ── */}
          {modoCompra === 'detallada' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3.5 items-start">
          <div className="lg:col-span-1 space-y-3">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 space-y-2.5">
              <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1.5">
                Datos del Comprobante
              </h2>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Proveedor *
                  </label>
                  <select
                    value={compraProveedorId}
                    onChange={(e) => setCompraProveedorId(e.target.value)}
                    className="w-full py-1.5 px-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="">-- Seleccionar Proveedor --</option>
                    {proveedores.map((prov) => (
                      <option key={prov.id} value={prov.id}>
                        {prov.nombre} {prov.saldo_pendiente > 0 ? `(Deuda: ${formatPrecio(prov.saldo_pendiente)})` : ''}
                      </option>
                    ))}
                  </select>
                  {proveedores.length === 0 && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                      No hay proveedores. Creá uno en el Directorio primero.
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    N° Factura / Remito
                  </label>
                  <input
                    type="text"
                    placeholder="Ej: REM-0001-000492"
                    value={compraComprobante}
                    onChange={(e) => setCompraComprobante(e.target.value)}
                    className="w-full py-1.5 px-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Fecha y Hora
                  </label>
                  <input
                    type="datetime-local"
                    value={compraFecha}
                    onChange={(e) => setCompraFecha(e.target.value)}
                    className="w-full py-1.5 px-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Medio de Pago
                  </label>
                  <select
                    value={compraMedioPago}
                    onChange={(e) => setCompraMedioPago(e.target.value as MedioPagoCompra)}
                    className="w-full py-1.5 px-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                    <option value="CUENTA_CORRIENTE">Cuenta Corriente (A Pagar)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-1">
                    Notas / Observaciones
                  </label>
                  <input
                    type="text"
                    placeholder="Detalles sobre entrega, lotes o descuentos..."
                    value={compraNotas}
                    onChange={(e) => setCompraNotas(e.target.value)}
                    className="w-full py-1.5 px-2.5 text-xs rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                  />
                </div>

                {compraMedioPago === 'EFECTIVO' && (
                  <div className="sm:col-span-2 pt-0.5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                      <input
                        type="checkbox"
                        checked={compraDescontarCaja && Boolean(sesionActiva)}
                        disabled={!sesionActiva}
                        onChange={(e) => setCompraDescontarCaja(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <span>
                        Descontar de la caja activa
                        {!sesionActiva && ' (Caja cerrada)'}
                      </span>
                    </label>
                    {sesionActiva && compraDescontarCaja && (
                      <p className="text-[10px] text-gray-500 dark:text-gray-400 mt-0.5 pl-5">
                        Se registrará un egreso de ${formatPrecio(totalCompraCalculado)} en la sesión actual.
                      </p>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Panel de Búsqueda y Escáner de Productos */}
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 space-y-2.5">
              <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 pb-1.5">
                <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                  Buscar o Escanear Producto
                </h2>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-semibold">
                  Pistola Activa
                </span>
              </div>

              <div className="relative">
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Código de barras o Nombre (Enter para buscar)
                </label>
                <input
                  type="text"
                  placeholder="Escanear con pistola o escribir..."
                  value={busquedaProducto}
                  onKeyDown={handleBusquedaKeyDown}
                  onChange={(e) => {
                    setBusquedaProducto(e.target.value)
                    setProductoSeleccionado(null)
                  }}
                  className="w-full py-2 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />

                {/* Lista de sugerencias o botón de creación al vuelo */}
                {busquedaProducto.trim().length > 0 && !productoSeleccionado && (
                  <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 max-h-56 overflow-y-auto">
                    {sugerenciasProductos.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleSeleccionarProducto(p)}
                        className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 dark:hover:bg-gray-700 border-b border-gray-100 dark:border-gray-700 last:border-0"
                      >
                        <div className="font-semibold text-gray-900 dark:text-gray-100">{p.descripcion}</div>
                        <div className="text-gray-500 dark:text-gray-400 flex justify-between mt-0.5">
                          <span>
                            {p.codigo_barras ? `Código: ${p.codigo_barras}` : 'Sin código de barras'}
                          </span>
                          <span>Costo act: {formatPrecio(p.precio_costo)}</span>
                        </div>
                      </button>
                    ))}

                    {/* Botón destacado para crear producto nuevo si no existe */}
                    <button
                      type="button"
                      onClick={() => abrirModalCrearProductoRapido()}
                      className="w-full text-left px-3 py-2.5 text-xs bg-indigo-50/70 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 font-bold text-indigo-700 dark:text-indigo-300 flex items-center justify-between border-t border-indigo-200 dark:border-indigo-800"
                    >
                      <span>+ Crear nuevo producto: "{busquedaProducto}"</span>
                      <span className="text-[10px] bg-indigo-200 dark:bg-indigo-800 px-1.5 py-0.5 rounded">
                        Al vuelo
                      </span>
                    </button>
                  </div>
                )}
              </div>

              {/* Ficha del producto seleccionado para ingresar cantidades y código */}
              {productoSeleccionado && (
                <div className="p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg border border-indigo-100 dark:border-indigo-800/50 space-y-2.5">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="text-xs font-bold text-indigo-900 dark:text-indigo-200">
                        {productoSeleccionado.descripcion}
                      </div>
                      <div className="text-[11px] text-gray-600 dark:text-gray-400 mt-0.5">
                        Stock actual: <strong>{productoSeleccionado.stock_actual} unidades</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setProductoSeleccionado(null)}
                      className="text-gray-400 hover:text-gray-600 text-xs"
                    >
                      ✕
                    </button>
                  </div>

                  {/* Asignar o actualizar código de barras al producto existente */}
                  <div className="pt-1 border-t border-indigo-100 dark:border-indigo-800/60 text-[11px]">
                    {!editandoCodigoExistente ? (
                      <div className="flex justify-between items-center">
                        <span className="text-gray-600 dark:text-gray-400">
                          Código de barras:
                          <strong className="ml-1 font-mono text-gray-800 dark:text-gray-200">
                            {productoSeleccionado.codigo_barras || 'Sin asignar'}
                          </strong>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setCodigoExistenteInput(productoSeleccionado.codigo_barras || '')
                            setEditandoCodigoExistente(true)
                          }}
                          className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold text-[10px]"
                        >
                          {productoSeleccionado.codigo_barras ? 'Modificar' : '+ Asignar código'}
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1.5 items-center">
                        <input
                          type="text"
                          placeholder="Escanear o tipear código..."
                          value={codigoExistenteInput}
                          onChange={(e) => setCodigoExistenteInput(e.target.value)}
                          className="flex-1 py-1 px-2 text-xs rounded border border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 font-mono text-gray-900 dark:text-gray-100"
                        />
                        <button
                          type="button"
                          disabled={guardandoCodigoExistente}
                          onClick={handleGuardarCodigoExistente}
                          className="px-2 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold"
                        >
                          Guardar
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditandoCodigoExistente(false)}
                          className="px-1.5 py-1 text-gray-500 text-[10px]"
                        >
                          Cancelar
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Inputs de cantidad y costo */}
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-0.5">
                        Cant. a ingresar
                      </label>
                      <input
                        type="number"
                        min="1"
                        value={cantidadIngresar}
                        onChange={(e) => setCantidadIngresar(e.target.value)}
                        className="w-full py-1 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-gray-700 dark:text-gray-300 mb-0.5">
                        Nuevo Costo ($)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={costoIngresar}
                        onChange={(e) => setCostoIngresar(e.target.value)}
                        className="w-full py-1 px-2 text-sm rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 font-bold"
                      />
                    </div>
                  </div>

                  <Button onClick={handleAgregarRenglon} size="sm" fullWidth className="mt-2">
                    + Agregar al Comprobante
                  </Button>
                </div>
              )}
            </div>
          </div>

          {/* Columna Derecha: Tabla de Renglones Recibidos */}
          <div className="lg:col-span-2 space-y-3">
            <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 flex flex-col justify-between min-h-[360px]">
              <div>
                <div className="flex flex-wrap justify-between items-center gap-2 border-b border-gray-200 dark:border-gray-700 pb-2 mb-3">
                  <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">
                    Artículos en el Remito ({renglones.length})
                  </h2>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCalcularPuntoPedido}
                      className="px-2.5 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-lg border border-indigo-200 dark:border-indigo-800 transition-colors cursor-pointer"
                      title="Calcular automáticamente reposición de productos que llegaron a su stock mínimo"
                    >
                      Punto de Pedido Auto
                    </button>
                    {renglones.length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={handleEnviarPedidoWhatsApp}
                          className="px-2.5 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 rounded-lg border border-emerald-200 dark:border-emerald-800 transition-colors cursor-pointer"
                          title="Enviar orden de compra directa al WhatsApp del proveedor"
                        >
                          WhatsApp Pedido
                        </button>
                        <button
                          type="button"
                          onClick={() => setRenglones([])}
                          className="text-xs text-red-600 hover:underline cursor-pointer"
                        >
                          Vaciar lista
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {renglones.length === 0 ? (
                  <div className="py-16 text-center text-gray-400 dark:text-gray-500">
                    <p className="font-medium text-sm">No hay productos agregados a la recepción</p>
                    <p className="text-xs mt-1">
                      Escanéalos con la pistola lectora o buscalos en el panel lateral. Si un producto es nuevo, podés crearlo al vuelo.
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                          <th className="py-2 px-1">Producto</th>
                          <th className="py-2 px-1 text-center">Stock Actual</th>
                          <th className="py-2 px-1 text-center">Cantidad</th>
                          <th className="py-2 px-1 text-right">Costo Unit.</th>
                          <th className="py-2 px-1 text-right">Subtotal</th>
                          <th className="py-2 px-1 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                        {renglones.map((r, idx) => (
                          <tr key={r.producto_id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                            <td className="py-2.5 px-1">
                              <div className="font-semibold text-gray-900 dark:text-gray-100">
                                {r.producto.descripcion}
                              </div>
                              {r.producto.codigo_barras && (
                                <div className="text-[10px] text-gray-400 font-mono">
                                  {r.producto.codigo_barras}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-1 text-center text-gray-500 dark:text-gray-400">
                              {r.producto.stock_actual}
                            </td>
                            <td className="py-2.5 px-1 text-center">
                              <div className="inline-flex items-center gap-1">
                                <button
                                  onClick={() => handleModificarCantidadRenglon(idx, -1)}
                                  className="w-5 h-5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center hover:bg-gray-200"
                                >
                                  -
                                </button>
                                <span className="font-bold px-1.5">{r.cantidad}</span>
                                <button
                                  onClick={() => handleModificarCantidadRenglon(idx, 1)}
                                  className="w-5 h-5 rounded bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold flex items-center justify-center hover:bg-gray-200"
                                >
                                  +
                                </button>
                              </div>
                            </td>
                            <td className="py-2.5 px-1 text-right font-medium">
                              {formatPrecio(r.precio_costo_unitario)}
                              {r.producto.precio_costo !== r.precio_costo_unitario && (
                                <div className="text-[9px] text-indigo-600 dark:text-indigo-400">
                                  Ant: {formatPrecio(r.producto.precio_costo)}
                                </div>
                              )}
                            </td>
                            <td className="py-2.5 px-1 text-right font-bold text-gray-900 dark:text-gray-100">
                              {formatPrecio(r.subtotal)}
                            </td>
                            <td className="py-2.5 px-1 text-center">
                              <button
                                onClick={() => handleEliminarRenglon(idx)}
                                className="text-red-500 hover:text-red-700 text-xs font-semibold px-1"
                              >
                                Quitar
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700 mt-4">
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5">
                    <div>
                      Unidades a ingresar al inventario: <strong>{totalBultosCalculado}</strong>
                    </div>
                    <div>
                      Impacto de stock: Automático en catálogo y auditoría
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <span className="text-xs text-gray-500 dark:text-gray-400">Total a Pagar</span>
                      <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400 leading-tight">
                        {formatPrecio(totalCompraCalculado)}
                      </div>
                    </div>

                    <Button
                      onClick={handleGuardarCompra}
                      loading={guardandoCompra}
                      disabled={renglones.length === 0 || !compraProveedorId}
                      size="lg"
                    >
                      Confirmar Ingreso
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: HISTORIAL DE COMPRAS
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === 'historial' && (
        <div className="space-y-3">
          <div className="flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Buscar por proveedor o nro de comprobante..."
                value={busquedaHistorial}
                onChange={(e) => setBusquedaHistorial(e.target.value)}
                className="w-full pl-3 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:bg-white dark:focus:bg-gray-800 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          {cargandoCompras ? (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Cargando historial de compras...
            </div>
          ) : comprasFiltradas.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-200 dark:border-gray-700 text-center shadow-md dark:shadow-black/20">
              <p className="text-gray-600 dark:text-gray-300 font-medium">No hay compras registradas</p>
              <p className="text-xs text-gray-400 mt-1">
                {busquedaHistorial
                  ? 'No hay comprobantes que coincidan con la búsqueda'
                  : 'Cargá los remitos y facturas de tus proveedores en la pestaña "Nueva Compra"'}
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                    <th className="py-3 px-3">Fecha</th>
                    <th className="py-3 px-3">Proveedor</th>
                    <th className="py-3 px-3">Comprobante</th>
                    <th className="py-3 px-3">Medio Pago</th>
                    <th className="py-3 px-3 text-right">Total</th>
                    <th className="py-3 px-3 text-center">Estado</th>
                    <th className="py-3 px-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {comprasFiltradas.map((c) => {
                    const esAnulada = c.estado === 'ANULADA'
                    return (
                      <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        <td className="py-3 px-3 text-gray-600 dark:text-gray-400 tabular-nums">
                          {formatFecha(c.fecha)}
                        </td>
                        <td className="py-3 px-3 font-semibold text-gray-900 dark:text-gray-100">
                          {c.proveedor?.nombre || 'Proveedor Desconocido'}
                        </td>
                        <td className="py-3 px-3 text-gray-500 dark:text-gray-400 font-mono">
                          {c.nro_comprobante || 'S/N'}
                        </td>
                        <td className="py-3 px-3 text-gray-600 dark:text-gray-400">
                          {labelMedioPago(c.medio_pago)}
                          {c.pagado_en_caja && (
                            <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">
                              (Descontado de caja)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-bold tabular-nums text-gray-900 dark:text-gray-100 text-sm">
                          {formatPrecio(c.total)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              esAnulada
                                ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {c.estado}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleVerDetalleCompra(c)}
                              className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                            >
                              Ver Renglones
                            </button>
                            {!esAnulada && (
                              <button
                                type="button"
                                onClick={() => handleAnularCompra(c)}
                                className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 dark:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                              >
                                Anular
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 4: HISTORIAL DE PAGOS A PROVEEDORES
          ───────────────────────────────────────────────────────────── */}
      {tabActiva === 'pagos' && (
        <div className="space-y-3">
          <div className="flex flex-col xl:flex-row gap-3 justify-between items-stretch xl:items-center bg-white dark:bg-gray-800 p-4 sm:p-5 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                placeholder="Buscar por proveedor o referencia..."
                value={busquedaPagos}
                onChange={(e) => setBusquedaPagos(e.target.value)}
                className="w-full pl-3 pr-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:bg-white dark:focus:bg-gray-800 focus:outline-hidden focus:border-indigo-500"
              />
            </div>
          </div>

          {cargandoPagos ? (
            <div className="p-8 text-center text-sm text-gray-500 dark:text-gray-400">
              Cargando historial de pagos...
            </div>
          ) : pagosFiltrados.length === 0 ? (
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl border border-gray-200 dark:border-gray-700 text-center shadow-md dark:shadow-black/20">
              <p className="text-gray-600 dark:text-gray-300 font-medium">No hay pagos registrados</p>
              <p className="text-xs text-gray-400 mt-1">
                {busquedaPagos
                  ? 'No hay pagos que coincidan con la búsqueda'
                  : 'Al abonar saldo a tus proveedores se generarán automáticamente las constancias de pago aquí.'}
              </p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-md dark:shadow-black/20 overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                    <th className="py-3 px-3">Fecha</th>
                    <th className="py-3 px-3">Proveedor</th>
                    <th className="py-3 px-3">Medio Pago</th>
                    <th className="py-3 px-3 text-right">Monto Abonado</th>
                    <th className="py-3 px-3 text-right">Saldo Restante</th>
                    <th className="py-3 px-3 text-center">Estado</th>
                    <th className="py-3 px-3 text-center">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {pagosFiltrados.map((p) => {
                    const esAnulado = p.estado === 'ANULADO'
                    return (
                      <tr key={p.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/40">
                        <td className="py-3 px-3 text-gray-600 dark:text-gray-400 tabular-nums">
                          {formatFecha(p.fecha)}
                        </td>
                        <td className="py-3 px-3 font-semibold text-gray-900 dark:text-gray-100">
                          {p.proveedor?.nombre || 'Proveedor'}
                          {p.comprobante_ref && (
                            <span className="block text-[10px] text-gray-400 font-mono">
                              Ref: {p.comprobante_ref}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-gray-600 dark:text-gray-400">
                          {p.medio_pago}
                          {p.pagado_en_caja && (
                            <span className="block text-[10px] text-emerald-600 dark:text-emerald-400">
                              (Egreso en caja)
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right font-bold tabular-nums text-gray-900 dark:text-gray-100 text-sm">
                          {formatPrecio(p.monto)}
                        </td>
                        <td className="py-3 px-3 text-right font-medium text-gray-600 dark:text-gray-400">
                          {formatPrecio(p.saldo_nuevo)}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              esAnulado
                                ? 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400'
                                : 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400'
                            }`}
                          >
                            {p.estado}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <div className="flex items-center justify-center gap-1.5 flex-wrap">
                            <button
                              type="button"
                              onClick={() => handleVerComprobantePago(p)}
                              className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-semibold text-indigo-600 dark:text-indigo-300 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/50 dark:hover:bg-indigo-900/60 border border-indigo-200 dark:border-indigo-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                            >
                              Ver / Imprimir
                            </button>
                            {!esAnulado && (
                              <button
                                type="button"
                                onClick={() => handleAnularPago(p)}
                                className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-semibold text-red-600 dark:text-red-300 bg-red-50 hover:bg-red-100 dark:bg-red-950/50 dark:hover:bg-red-900/60 border border-red-200 dark:border-red-800/60 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                                title="Anular pago y restituir deuda"
                              >
                                Anular
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ALTA / EDICIÓN PROVEEDOR
          ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={modalProveedorOpen}
        onClose={cerrarModalProveedor}
        title={proveedorEditando ? 'Editar Proveedor' : 'Registrar Nuevo Proveedor'}
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row gap-2.5 w-full">
            <Button
              type="button"
              variant="secondary"
              disabled={guardandoProveedor}
              onClick={cerrarModalProveedor}
              className="order-2 sm:order-1 sm:w-1/3 py-2.5 text-sm font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-proveedor"
              variant="primary"
              loading={guardandoProveedor}
              className="order-1 sm:order-2 sm:w-2/3 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              {proveedorEditando ? 'Guardar Cambios' : 'Registrar Proveedor'}
            </Button>
          </div>
        }
      >
        <form id="form-proveedor" onSubmit={handleGuardarProveedor} className="space-y-4">
          {/* Banner de Ayuda Rápida / Guía */}
          <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center gap-3 text-xs text-indigo-950 dark:text-indigo-200">
            <span className="font-bold uppercase text-[10px] tracking-wider px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 border border-indigo-300 dark:border-indigo-700 shrink-0">
              Guía
            </span>
            <p className="leading-relaxed font-medium">
              {proveedorEditando
                ? 'Actualizá los datos de contacto, días de visita o datos bancarios del distribuidor.'
                : 'Registrá a tu distribuidor o preventista con su teléfono y días de visita para enviar pedidos por WhatsApp y gestionar sus cuentas corrientes.'}
            </p>
          </div>

          {/* Bloque 1: Datos de la Empresa y Contacto */}
          <div className="space-y-3 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              1. Datos de la Empresa y Contacto
            </p>
            <div className="space-y-3">
              <div>
                <Input
                  label="Nombre de la empresa o proveedor *"
                  placeholder="Ej: Distribuidora Norte, Arcor, Quilmes..."
                  value={formNombre}
                  onChange={(e) => setFormNombre(e.target.value)}
                  required
                  autoFocus
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                  Nombre comercial con el que identificás a la distribuidora o mayorista.
                </span>
              </div>

              <div>
                <Input
                  label="Persona de contacto / Preventista"
                  placeholder="Ej: Marcelo Gómez (Vendedor)"
                  value={formContacto}
                  onChange={(e) => setFormContacto(e.target.value)}
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                  Nombre del vendedor o chofer que toma los pedidos en tu negocio.
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Input
                    label="Teléfono / WhatsApp"
                    placeholder="Ej: 11 2345-6789"
                    value={formTelefono}
                    onChange={(e) => setFormTelefono(e.target.value)}
                  />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                    Permite enviar la lista de pedidos directamente por WhatsApp.
                  </span>
                </div>
                <div>
                  <Input
                    label="CUIT"
                    placeholder="Ej: 30-12345678-9"
                    value={formCuit}
                    onChange={(e) => setFormCuit(e.target.value)}
                  />
                  {formCuit.trim().length > 0 ? (
                    validarCUIT(formCuit.trim()) ? (
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                        CUIT Válido (Módulo 11 Verificado)
                      </span>
                    ) : (
                      <span className="text-[11px] text-red-600 dark:text-red-400 font-medium flex items-center gap-1 mt-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        CUIT inválido: no coincide el dígito verificador oficial de AFIP
                      </span>
                    )
                  ) : (
                    <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                      Clave fiscal para conciliación de comprobantes y facturas.
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Bloque 2: Operatoria Comercial y Pagos */}
          <div className="space-y-3 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              2. Operatoria Comercial y Pagos
            </p>
            <div className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <Input
                    label="Días de visita habituales"
                    placeholder="Ej: Martes y Viernes"
                    value={formDiasVisita}
                    onChange={(e) => setFormDiasVisita(e.target.value)}
                  />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                    Te recordará cuándo preparar el pedido de reposición.
                  </span>
                </div>
                <div>
                  <Input
                    label="Email comercial"
                    type="email"
                    placeholder="ventas@proveedor.com"
                    value={formEmail}
                    onChange={(e) => setFormEmail(e.target.value)}
                  />
                  <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                    Para recibir listas de precios y facturas digitales.
                  </span>
                </div>
              </div>

              <div>
                <Input
                  label="CBU o Alias bancario para transferencias"
                  placeholder="Ej: distribuidora.norte.mp"
                  value={formCbuAlias}
                  onChange={(e) => setFormCbuAlias(e.target.value)}
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                  Copiá y pegá su alias rápidamente al momento de abonar facturas pendientes.
                </span>
              </div>

              <div>
                <Input
                  label="Saldo pendiente inicial ($)"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={formSaldoInicial}
                  onChange={(e) => setFormSaldoInicial(e.target.value)}
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                  Si ya mantenés una deuda previa con este proveedor, indicala acá. Si empezás de cero, dejá 0.
                </span>
              </div>
            </div>
          </div>
        </form>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: ABONAR SALDO / PAGO A PROVEEDOR
          ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={modalAbonarOpen}
        onClose={() => setModalAbonarOpen(false)}
        title="Registrar Pago a Proveedor"
        size="md"
      >
        {proveedorAbonar && (
          <form onSubmit={handleGuardarAbono} className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-700 text-xs">
              <div className="text-gray-500 dark:text-gray-400">Proveedor</div>
              <div className="font-bold text-gray-900 dark:text-gray-100 text-sm mt-0.5">
                {proveedorAbonar.nombre}
              </div>
              <div className="mt-2 flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Deuda actual en cuenta:</span>
                <span className="text-base font-black text-amber-600 dark:text-amber-400">
                  {formatPrecio(proveedorAbonar.saldo_pendiente)}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Atajos de importe rápido:
              </label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleFijarMontoPreset(1)}
                  className="py-1.5 px-2 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-bold text-xs hover:bg-indigo-100 text-center"
                >
                  Total (100%)
                </button>
                <button
                  type="button"
                  onClick={() => handleFijarMontoPreset(0.5)}
                  className="py-1.5 px-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-200 text-center"
                >
                  Mitad (50%)
                </button>
                <button
                  type="button"
                  onClick={() => handleFijarMontoPreset(0.25)}
                  className="py-1.5 px-2 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-bold text-xs hover:bg-gray-200 text-center"
                >
                  Cuarto (25%)
                </button>
              </div>
            </div>

            <div>
              <Input
                label="Monto a pagar ($) *"
                type="number"
                step="0.01"
                min="0.01"
                value={montoAbono}
                onChange={(e) => setMontoAbono(e.target.value)}
                required
              />

              <div className="mt-1.5 px-2.5 py-1.5 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs flex justify-between items-center">
                <span className="text-gray-500 dark:text-gray-400">Saldo tras este pago:</span>
                <span
                  className={`font-bold ${
                    calculoSaldoAbono.esTotal
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {calculoSaldoAbono.esTotal
                    ? 'Deuda saldada ($0)'
                    : formatPrecio(calculoSaldoAbono.restante)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  Medio de Pago
                </label>
                <select
                  value={medioPagoAbono}
                  onChange={(e) => setMedioPagoAbono(e.target.value as any)}
                  className="w-full py-2 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                >
                  <option value="EFECTIVO">Efectivo</option>
                  <option value="TRANSFERENCIA">Transferencia Bancaria</option>
                  <option value="OTRO">Otro / Cheque</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                  N° Referencia / Operación
                </label>
                <input
                  type="text"
                  placeholder="Ej: Op. 1294821"
                  value={comprobanteRefAbono}
                  onChange={(e) => setComprobanteRefAbono(e.target.value)}
                  className="w-full py-2 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
                />
              </div>
            </div>

            {medioPagoAbono === 'EFECTIVO' && (
              <div>
                <label className="flex items-center gap-2 cursor-pointer text-xs text-gray-700 dark:text-gray-300">
                  <input
                    type="checkbox"
                    checked={descontarAbonoDeCaja && Boolean(sesionActiva)}
                    disabled={!sesionActiva}
                    onChange={(e) => setDescontarAbonoDeCaja(e.target.checked)}
                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-4 w-4"
                  />
                  <span>
                    Descontar egreso de la caja activa
                    {!sesionActiva && ' (Caja cerrada)'}
                  </span>
                </label>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Notas / Concepto
              </label>
              <input
                type="text"
                placeholder="Ej: Pago factura de la semana pasada"
                value={notasAbono}
                onChange={(e) => setNotasAbono(e.target.value)}
                className="w-full py-2 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalAbonarOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={guardandoAbono}>
                Confirmar y Emitir Comprobante
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: AJUSTE MANUAL DE SALDO
          ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={modalAjusteOpen}
        onClose={() => setModalAjusteOpen(false)}
        title="Ajustar Saldo de Proveedor"
        size="sm"
      >
        {proveedorAjuste && (
          <form onSubmit={handleGuardarAjuste} className="space-y-3">
            <div className="bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-700 text-xs">
              <span className="text-gray-500 dark:text-gray-400">Proveedor:</span>
              <p className="font-bold text-gray-900 dark:text-gray-100 text-sm mt-0.5">
                {proveedorAjuste.nombre}
              </p>
              <div className="mt-2 flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Saldo actual registrado:</span>
                <span className="font-bold text-gray-900 dark:text-gray-100">
                  {formatPrecio(proveedorAjuste.saldo_pendiente)}
                </span>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 dark:text-gray-400">
              Permite aplicar notas de crédito, descuentos comerciales por pronto pago o corregir errores iniciales sin mover la caja.
            </p>

            <Input
              label="Nuevo saldo exacto ($) *"
              type="number"
              step="0.01"
              min="0"
              value={nuevoSaldoAjuste}
              onChange={(e) => setNuevoSaldoAjuste(e.target.value)}
              required
            />

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Motivo del ajuste
              </label>
              <input
                type="text"
                placeholder="Ej: Descuento comercial por pronto pago"
                value={motivoAjuste}
                onChange={(e) => setMotivoAjuste(e.target.value)}
                className="w-full py-2 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              />
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setModalAjusteOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" loading={guardandoAjuste}>
                Guardar Ajuste
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: CREACIÓN RÁPIDA DE PRODUCTO AL VUELO
          ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={modalCrearProductoRapidoOpen}
        onClose={() => setModalCrearProductoRapidoOpen(false)}
        title="Crear Producto Nuevo al Vuelo"
        size="md"
      >
        <form onSubmit={handleGuardarNuevoProductoRapido} className="space-y-3 text-xs">
          <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/40 rounded-lg border border-indigo-200 dark:border-indigo-800 text-indigo-900 dark:text-indigo-200">
            Completá los datos del nuevo producto recibido. Se guardará en el catálogo y se agregará directamente al remito actual.
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Código de Barras (opcional)"
              placeholder="Escaneá con la pistola o tipealo"
              value={nuevoProdCodigo}
              onChange={(e) => setNuevoProdCodigo(e.target.value)}
            />

            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Categoría
              </label>
              <select
                value={nuevoProdCategoriaId}
                onChange={(e) => setNuevoProdCategoriaId(e.target.value)}
                className="w-full py-2 px-3 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="">-- Sin Categoría --</option>
                {categorias.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.nombre}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <Input
            label="Descripción / Nombre del Producto *"
            placeholder="Ej: Alfajor Havanna 70% Cacao"
            value={nuevoProdDescripcion}
            onChange={(e) => setNuevoProdDescripcion(e.target.value)}
            required
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Input
                label="Precio de Costo ($) *"
                type="number"
                step="0.01"
                min="0"
                placeholder="Costo que te cobra el proveedor"
                value={nuevoProdCosto}
                onChange={(e) => setNuevoProdCosto(e.target.value)}
                required
              />
            </div>

            <div>
              <Input
                label="Precio de Venta Mostrador ($) *"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="Precio a cobrar en caja"
                value={nuevoProdVenta}
                onChange={(e) => setNuevoProdVenta(e.target.value)}
                required
              />
            </div>
          </div>

          {/* Atajos de margen rápido */}
          <div>
            <div className="flex justify-between items-center mb-1">
              <span className="text-[11px] font-semibold text-gray-600 dark:text-gray-400">
                Atajo para calcular precio de venta según costo:
              </span>
              {margenNuevoProd && (
                <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                  Margen: +{margenNuevoProd.pct}% (Ganancia: {formatPrecio(margenNuevoProd.ganancia)})
                </span>
              )}
            </div>
            <div className="grid grid-cols-4 gap-1.5">
              <button
                type="button"
                onClick={() => aplicarMargenVenta(30)}
                className="py-1 px-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-200 text-center"
              >
                +30%
              </button>
              <button
                type="button"
                onClick={() => aplicarMargenVenta(50)}
                className="py-1 px-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-200 text-center"
              >
                +50%
              </button>
              <button
                type="button"
                onClick={() => aplicarMargenVenta(80)}
                className="py-1 px-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-200 text-center"
              >
                +80%
              </button>
              <button
                type="button"
                onClick={() => aplicarMargenVenta(100)}
                className="py-1 px-1.5 rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-200 text-center"
              >
                +100%
              </button>
            </div>
          </div>

          <div className="pt-1">
            <Input
              label="Cantidad recibida en este remito"
              type="number"
              min="1"
              value={nuevoProdCantidad}
              onChange={(e) => setNuevoProdCantidad(e.target.value)}
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200 dark:border-gray-700">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setModalCrearProductoRapidoOpen(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" loading={guardandoNuevoProd}>
              Crear e Ingresar al Remito
            </Button>
          </div>
        </form>
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: DETALLES DE COMPRA / RENGLONES (CON IMPRESIÓN Y EXPORTACIÓN)
          ───────────────────────────────────────────────────────────── */}
      <Modal
        isOpen={modalDetalleOpen}
        onClose={() => setModalDetalleOpen(false)}
        title="Detalle del Comprobante / Remito"
        size="lg"
      >
        {compraDetalle && (
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-gray-50 dark:bg-gray-900 p-3 rounded-lg border border-gray-100 dark:border-gray-700">
              <div>
                <span className="text-gray-400">Proveedor</span>
                <p className="font-bold text-gray-900 dark:text-gray-100 text-sm mt-0.5">
                  {compraDetalle.proveedor?.nombre || 'S/D'}
                </p>
              </div>
              <div>
                <span className="text-gray-400">N° Comprobante</span>
                <p className="font-bold text-gray-900 dark:text-gray-100 text-sm mt-0.5 font-mono">
                  {compraDetalle.nro_comprobante || 'S/N'}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Fecha</span>
                <p className="font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                  {formatFecha(compraDetalle.fecha)}
                </p>
              </div>
              <div>
                <span className="text-gray-400">Medio Pago</span>
                <p className="font-bold text-gray-900 dark:text-gray-100 mt-0.5">
                  {labelMedioPago(compraDetalle.medio_pago)}
                </p>
              </div>
            </div>

            {compraDetalle.notas && (
              <div className="p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded border border-yellow-200 dark:border-yellow-800 text-yellow-800 dark:text-yellow-200">
                <strong>Notas:</strong> {compraDetalle.notas}
              </div>
            )}

            <div
              id="printable-remito"
              className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-800"
            >
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                    <th className="py-2 px-3">Producto</th>
                    <th className="py-2 px-3 text-center">Cantidad</th>
                    <th className="py-2 px-3 text-right">Costo Unit.</th>
                    <th className="py-2 px-3 text-right">Subtotal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700/60">
                  {cargandoRenglones ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-400">
                        Cargando renglones...
                      </td>
                    </tr>
                  ) : detallesCargados.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-gray-400">
                        No hay renglones asociados a este comprobante
                      </td>
                    </tr>
                  ) : (
                    detallesCargados.map((d) => (
                      <tr key={d.id}>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-gray-900 dark:text-gray-100">
                            {d.producto?.descripcion || 'Producto'}
                          </span>
                          {d.producto?.codigo_barras && (
                            <span className="block text-[10px] text-gray-400 font-mono">
                              {d.producto.codigo_barras}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">{d.cantidad}</td>
                        <td className="py-2.5 px-3 text-right">{formatPrecio(d.precio_costo_unitario)}</td>
                        <td className="py-2.5 px-3 text-right font-bold text-gray-900 dark:text-gray-100">
                          {formatPrecio(d.subtotal)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2">
              <div className="text-gray-500">
                Estado: <strong className="uppercase">{compraDetalle.estado}</strong>
              </div>
              <div className="text-right">
                <span className="text-gray-400 mr-2">Total Comprobante:</span>
                <strong className="text-lg font-black text-indigo-600 dark:text-indigo-400">
                  {formatPrecio(compraDetalle.total)}
                </strong>
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end pt-3 border-t border-gray-200 dark:border-gray-700">
              <Button
                variant="secondary"
                size="sm"
                onClick={handleExportarExcelRemito}
                className="inline-flex items-center gap-1.5"
                title="Descargar remito de mercadería en formato Excel corporativo (.xlsx)"
              >
                <IconExportar />
                <span>Exportar Excel</span>
              </Button>
              <Button
                variant="success"
                size="sm"
                onClick={handleCompartirRemitoWhatsApp}
                disabled={detallesCargados.length === 0}
              >
                WhatsApp
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleImprimirRemito}
                disabled={detallesCargados.length === 0}
              >
                Imprimir Remito
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModalDetalleOpen(false)}
              >
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ─────────────────────────────────────────────────────────────
          MODAL: COMPROBANTE DE PAGO (RECIBO TÉRMICO / EXPORTAR)
          ───────────────────────────────────────────────────────────── */}
      <ComprobantePagoModal
        isOpen={modalComprobantePagoOpen}
        onClose={() => setModalComprobantePagoOpen(false)}
        pago={pagoSeleccionado}
        nombreKiosco={kiosco?.nombre || 'AlPaso POS'}
        telefonoKiosco={usuario?.email || null}
      />
    </div>
  )
}
