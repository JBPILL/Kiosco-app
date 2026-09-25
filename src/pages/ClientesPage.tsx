import { useState, useEffect, useCallback } from 'react'
import { useClienteStore } from '../stores/clienteStore'
import { useCajaStore } from '../stores/cajaStore'
import { formatPrecio, formatFecha, labelMedioPago } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import type { Cliente, MovimientoCuentaCorriente, MedioPago } from '../types/database'

const MEDIOS_PAGO_CLIENTE: { valor: MedioPago; label: string; desc: string }[] = [
  { valor: 'EFECTIVO', label: 'Efectivo', desc: 'Dinero en mano' },
  { valor: 'MERCADOPAGO', label: 'Mercado Pago', desc: 'Transferencia o QR' },
  { valor: 'TRANSFERENCIA', label: 'Transferencia', desc: 'CBU / CVU Bancario' },
  { valor: 'TARJETA', label: 'Tarjeta', desc: 'Débito o Crédito' },
]

const LIMITES_RAPIDOS_CLIENTE = [10000, 20000, 50000, 100000]
const BILLETES_RAPIDOS_ABONO = [1000, 2000, 5000, 10000, 20000]

export function ClientesPage() {
  const {
    clientes,
    cargando,
    cargarClientes,
    crearCliente,
    actualizarCliente,
    eliminarCliente,
    registrarAbono,
    cargarMovimientosCliente,
  } = useClienteStore()

  const { sesionActiva } = useCajaStore()

  // Filtros y búsqueda
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'TODOS' | 'CON_DEUDA' | 'AL_DIA'>('TODOS')

  // Modal Alta / Edición Cliente
  const [modalClienteOpen, setModalClienteOpen] = useState(false)
  const [clienteEditando, setClienteEditando] = useState<Cliente | null>(null)
  const [formNombre, setFormNombre] = useState('')
  const [formTelefono, setFormTelefono] = useState('')
  const [formDni, setFormDni] = useState('')
  const [formDireccion, setFormDireccion] = useState('')
  const [formEmail, setFormEmail] = useState('')
  const [formLimite, setFormLimite] = useState('')
  const [formNotas, setFormNotas] = useState('')
  const [guardandoCliente, setGuardandoCliente] = useState(false)
  const [mostrarMasDatos, setMostrarMasDatos] = useState(false)

  // Modal Ficha / Estado de Cuenta
  const [clienteFicha, setClienteFicha] = useState<Cliente | null>(null)
  const [movimientosCC, setMovimientosCC] = useState<MovimientoCuentaCorriente[]>([])
  const [cargandoMovs, setCargandoMovs] = useState(false)

  // Modal Abonar Deuda
  const [clienteAbonar, setClienteAbonar] = useState<Cliente | null>(null)
  const [montoAbono, setMontoAbono] = useState('')
  const [medioPagoAbono, setMedioPagoAbono] = useState<MedioPago>('EFECTIVO')
  const [notasAbono, setNotasAbono] = useState('')
  const [impactarEnCaja, setImpactarEnCaja] = useState(true)
  const [guardandoAbono, setGuardandoAbono] = useState(false)

  useEffect(() => {
    cargarClientes()
  }, [cargarClientes])

  // Cargar movimientos cuando se abre la ficha
  const abrirFichaCliente = useCallback(async (cliente: Cliente) => {
    setClienteFicha(cliente)
    setCargandoMovs(true)
    const movs = await cargarMovimientosCliente(cliente.id)
    setMovimientosCC(movs)
    setCargandoMovs(false)
  }, [cargarMovimientosCliente])

  // Métricas
  const totalClientes = clientes.length
  const totalDeudaGlobal = clientes.reduce((sum, c) => sum + (c.saldo_deudor || 0), 0)
  const clientesConDeuda = clientes.filter((c) => (c.saldo_deudor || 0) > 0).length

  // Filtrado de clientes
  const clientesFiltrados = clientes.filter((c) => {
    const matchTexto =
      c.nombre.toLowerCase().includes(busqueda.toLowerCase()) ||
      (c.dni_cuit && c.dni_cuit.includes(busqueda)) ||
      (c.telefono && c.telefono.includes(busqueda))

    if (!matchTexto) return false
    if (filtroEstado === 'CON_DEUDA') return (c.saldo_deudor || 0) > 0
    if (filtroEstado === 'AL_DIA') return (c.saldo_deudor || 0) <= 0
    return true
  })

  // Handlers Cliente
  const handleNuevoCliente = () => {
    setClienteEditando(null)
    setFormNombre('')
    setFormTelefono('')
    setFormDni('')
    setFormDireccion('')
    setFormEmail('')
    setFormLimite('')
    setFormNotas('')
    setMostrarMasDatos(false)
    setModalClienteOpen(true)
  }

  const handleEditarCliente = (cli: Cliente) => {
    setClienteEditando(cli)
    setFormNombre(cli.nombre)
    setFormTelefono(cli.telefono || '')
    setFormDni(cli.dni_cuit || '')
    setFormDireccion(cli.direccion || '')
    setFormEmail(cli.email || '')
    setFormLimite(cli.limite_credito ? cli.limite_credito.toString() : '')
    setFormNotas(cli.notas || '')
    setMostrarMasDatos(Boolean(cli.dni_cuit || cli.direccion || cli.email))
    setModalClienteOpen(true)
  }

  const handleGuardarCliente = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formNombre.trim()) return

    setGuardandoCliente(true)
    const limiteNum = parseFloat(formLimite) || 0

    if (clienteEditando) {
      await actualizarCliente(clienteEditando.id, {
        nombre: formNombre.trim(),
        telefono: formTelefono.trim() || null,
        dni_cuit: formDni.trim() || null,
        direccion: formDireccion.trim() || null,
        email: formEmail.trim() || null,
        limite_credito: limiteNum,
        notas: formNotas.trim() || null,
      })
    } else {
      await crearCliente({
        nombre: formNombre.trim(),
        telefono: formTelefono.trim() || null,
        dni_cuit: formDni.trim() || null,
        direccion: formDireccion.trim() || null,
        email: formEmail.trim() || null,
        limite_credito: limiteNum,
        notas: formNotas.trim() || null,
      })
    }

    setGuardandoCliente(false)
    setModalClienteOpen(false)
  }

  // Handlers Abono
  const handleAbrirAbonar = (cli: Cliente) => {
    setClienteAbonar(cli)
    setMontoAbono(cli.saldo_deudor > 0 ? cli.saldo_deudor.toString() : '')
    setMedioPagoAbono('EFECTIVO')
    setNotasAbono('')
    setImpactarEnCaja(!!sesionActiva)
  }

  const handleConfirmarAbono = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!clienteAbonar) return
    const monto = parseFloat(montoAbono) || 0
    if (monto <= 0) return

    setGuardandoAbono(true)
    const ok = await registrarAbono(
      clienteAbonar.id,
      monto,
      medioPagoAbono,
      notasAbono || undefined,
      impactarEnCaja
    )

    if (ok) {
      setClienteAbonar(null)
      // Si la ficha del cliente estaba abierta, refrescarla
      if (clienteFicha?.id === clienteAbonar.id) {
        const actualizado = clientes.find((c) => c.id === clienteAbonar.id)
        if (actualizado) abrirFichaCliente(actualizado)
      }
    }

    setGuardandoAbono(false)
  }

  // WhatsApp Estado de Cuenta
  const handleEnviarWhatsApp = (cli: Cliente) => {
    let msg = `*Estado de Cuenta - Kiosko*\n`
    msg += `Cliente: *${cli.nombre}*\n`
    msg += `Fecha: ${formatFecha(new Date().toISOString())}\n`
    msg += `--------------------------------\n`
    msg += `Saldo Deudor Actual: *${formatPrecio(cli.saldo_deudor)}*\n`
    if (cli.limite_credito > 0) {
      msg += `Límite de Crédito: ${formatPrecio(cli.limite_credito)}\n`
      const disponible = Math.max(0, cli.limite_credito - cli.saldo_deudor)
      msg += `Crédito Disponible: ${formatPrecio(disponible)}\n`
    }
    msg += `--------------------------------\n`
    msg += `¡Muchas gracias!`

    const telLimpio = cli.telefono ? cli.telefono.replace(/\D/g, '') : ''
    const url = telLimpio
      ? `https://api.whatsapp.com/send?phone=${telLimpio}&text=${encodeURIComponent(msg)}`
      : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-gray-100 tracking-tight">
            Clientes y Cuenta Corriente
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
            Control de clientes, fiados a crédito y registro de cobranzas
          </p>
        </div>
      </div>

      {/* Tarjetas de Métricas Globales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        {/* Tarjeta 1: Total Clientes */}
        <div className="p-4 sm:p-5 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xs flex flex-col justify-between transition-all hover:border-gray-300 dark:hover:border-gray-600">
          <div>
            <p className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400">
              Total Clientes
            </p>
            <p className="text-2xl sm:text-3xl font-black text-gray-900 dark:text-gray-100 mt-1 tracking-tight">
              {totalClientes}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/80 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">
            <span>Al día: {clientes.length - clientesConDeuda}</span>
            <span>{clientesConDeuda > 0 ? `${clientesConDeuda} con deuda` : 'Todos al día'}</span>
          </div>
        </div>

        {/* Tarjeta 2: Deuda en Calle */}
        <div className="p-4 sm:p-5 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xs flex flex-col justify-between transition-all hover:border-gray-300 dark:hover:border-gray-600">
          <div>
            <p className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400">
              Deuda en Calle
            </p>
            <p className="text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400 mt-1 tracking-tight truncate">
              {formatPrecio(totalDeudaGlobal)}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/80 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">
            <span>Total fiado en compras</span>
            <span>Por cobrar</span>
          </div>
        </div>

        {/* Tarjeta 3: Con Deuda */}
        <div className="p-4 sm:p-5 rounded-2xl border-2 border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-xs flex flex-col justify-between transition-all hover:border-gray-300 dark:hover:border-gray-600">
          <div>
            <p className="text-xs sm:text-sm font-semibold text-gray-500 dark:text-gray-400">
              Con Deuda
            </p>
            <p className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400 mt-1 tracking-tight">
              {clientesConDeuda}
            </p>
          </div>
          <div className="mt-3 pt-2.5 border-t border-gray-100 dark:border-gray-700/80 flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 font-medium">
            <span>{totalClientes > 0 ? `${Math.round((clientesConDeuda / totalClientes) * 100)}% de la cartera` : '0%'}</span>
            <span>{clientesConDeuda > 0 ? 'Con saldo pendiente' : 'Al día'}</span>
          </div>
        </div>
      </div>

      {/* Contenedor Principal: Búsqueda, Filtros y Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border-2 border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4 shadow-xs">
        {/* Barra superior de filtros */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex-1 flex items-center gap-2 max-w-xl">
            <input
              type="text"
              placeholder="Buscar por nombre, DNI o teléfono..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border-2 border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:border-indigo-500 outline-none"
            />
            <Button
              variant="primary"
              onClick={handleNuevoCliente}
              className="whitespace-nowrap flex-shrink-0 text-xs sm:text-sm font-semibold shadow-xs"
            >
              + Nuevo Cliente
            </Button>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFiltroEstado('TODOS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border-2 cursor-pointer ${
                filtroEstado === 'TODOS'
                  ? 'border-indigo-600 bg-indigo-600 text-white shadow-xs'
                  : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              Todos ({clientes.length})
            </button>
            <button
              onClick={() => setFiltroEstado('CON_DEUDA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border-2 cursor-pointer ${
                filtroEstado === 'CON_DEUDA'
                  ? 'border-amber-600 bg-amber-600 text-white shadow-xs'
                  : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              Con Deuda ({clientesConDeuda})
            </button>
            <button
              onClick={() => setFiltroEstado('AL_DIA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all border-2 cursor-pointer ${
                filtroEstado === 'AL_DIA'
                  ? 'border-emerald-600 bg-emerald-600 text-white shadow-xs'
                  : 'border-gray-300 dark:border-gray-600 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              Al Día ({clientes.length - clientesConDeuda})
            </button>
          </div>
        </div>

        {/* Tabla / Lista de Clientes */}
        {cargando ? (
          <div className="text-center py-12">
            <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">Cargando clientes...</p>
          </div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="text-center py-12 text-gray-400 dark:text-gray-500 text-sm">
            {clientes.length === 0
              ? 'No hay clientes registrados aún. Presioná "+ Nuevo Cliente" para comenzar.'
              : 'No se encontraron clientes con el filtro seleccionado.'}
          </div>
        ) : (
          <>
            {/* ── VISTA MÓVIL: Tarjetas individuales táctiles (sm:hidden) ── */}
            <div className="sm:hidden space-y-3">
              {clientesFiltrados.map((cli) => {
                const debe = (cli.saldo_deudor || 0) > 0
                return (
                  <div
                    key={cli.id}
                    className="p-3.5 bg-gray-50 dark:bg-gray-900/60 rounded-xl border border-gray-200 dark:border-gray-700 shadow-xs space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <h3 className="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight">
                          {cli.nombre}
                        </h3>
                        {cli.direccion && (
                          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{cli.direccion}</p>
                        )}
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-600 dark:text-gray-400">
                          {cli.telefono && <span>Tel: {cli.telefono}</span>}
                          {cli.dni_cuit && <span>DNI: {cli.dni_cuit}</span>}
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span
                          className={`inline-flex px-2.5 py-1 text-xs font-bold rounded-full ${
                            debe
                              ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                              : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400'
                          }`}
                        >
                          {debe ? `Debe: ${formatPrecio(cli.saldo_deudor)}` : '$0 (Al día)'}
                        </span>
                        {cli.limite_credito > 0 && (
                          <p className="text-[10px] text-gray-400 mt-1">Límite: {formatPrecio(cli.limite_credito)}</p>
                        )}
                      </div>
                    </div>

                    {/* Botones de acción táctiles en móvil con bordes nítidos */}
                    <div className="grid grid-cols-2 gap-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                      <button
                        type="button"
                        onClick={() => abrirFichaCliente(cli)}
                        className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-bold text-gray-800 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 border-2 border-gray-300 dark:border-gray-500 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                      >
                        Ficha / Historial
                      </button>
                      {debe ? (
                        <button
                          type="button"
                          onClick={() => handleAbrirAbonar(cli)}
                          className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border-2 border-emerald-400 dark:border-emerald-600 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          Abonar deuda
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleEditarCliente(cli)}
                          className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-800 dark:text-indigo-200 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border-2 border-indigo-400 dark:border-indigo-600 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          Editar
                        </button>
                      )}
                      {debe && (
                        <button
                          type="button"
                          onClick={() => handleEditarCliente(cli)}
                          className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-800 dark:text-indigo-200 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border-2 border-indigo-400 dark:border-indigo-600 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                        >
                          Editar
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleEnviarWhatsApp(cli)}
                        className="inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-bold text-teal-800 dark:text-teal-200 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 border-2 border-teal-400 dark:border-teal-600 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                      >
                        WhatsApp
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`¿Eliminar al cliente ${cli.nombre}?`)) {
                            eliminarCliente(cli.id)
                          }
                        }}
                        className={`inline-flex items-center justify-center px-2.5 py-1.5 rounded-lg text-xs font-bold text-red-800 dark:text-red-200 bg-red-50 hover:bg-red-100 dark:bg-red-950/60 dark:hover:bg-red-900/60 border-2 border-red-400 dark:border-red-600 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap ${debe ? 'col-span-2' : ''}`}
                      >
                        Eliminar cliente
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* ── VISTA ESCRITORIO: Tabla completa (hidden sm:block) ── */}
            <div className="hidden sm:block border-2 border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-900 border-b-2 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Cliente</th>
                      <th className="px-4 py-3 font-semibold">Contacto / DNI</th>
                      <th className="px-4 py-3 font-semibold">Límite Crédito</th>
                      <th className="px-4 py-3 font-semibold">Saldo Deudor</th>
                      <th className="px-4 py-3 font-semibold text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {clientesFiltrados.map((cli) => {
                      const debe = (cli.saldo_deudor || 0) > 0
                      return (
                        <tr key={cli.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                          <td className="px-4 py-3">
                            <p className="font-bold text-gray-900 dark:text-gray-100">{cli.nombre}</p>
                            {cli.direccion && (
                              <p className="text-xs text-gray-400 dark:text-gray-500">{cli.direccion}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                            {cli.telefono && <p>Tel: {cli.telefono}</p>}
                            {cli.dni_cuit && <p>DNI: {cli.dni_cuit}</p>}
                            {!cli.telefono && !cli.dni_cuit && <span className="text-gray-400">—</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-600 dark:text-gray-300">
                            {cli.limite_credito > 0 ? formatPrecio(cli.limite_credito) : 'Sin límite'}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex px-2 py-0.5 text-xs font-bold rounded-full ${
                                debe
                                  ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                                  : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400'
                              }`}
                            >
                              {debe ? formatPrecio(cli.saldo_deudor) : '$0 (Al día)'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                type="button"
                                onClick={() => abrirFichaCliente(cli)}
                                className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold text-gray-800 dark:text-gray-200 bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600 border-2 border-gray-300 dark:border-gray-500 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                              >
                                Ficha
                              </button>
                              {debe && (
                                <button
                                  type="button"
                                  onClick={() => handleAbrirAbonar(cli)}
                                  className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-950/60 dark:hover:bg-emerald-900/60 border-2 border-emerald-400 dark:border-emerald-600 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                                >
                                  Abonar
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleEditarCliente(cli)}
                                className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold text-indigo-800 dark:text-indigo-200 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/60 dark:hover:bg-indigo-900/60 border-2 border-indigo-400 dark:border-indigo-600 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                              >
                                Editar
                              </button>
                              <button
                                type="button"
                                onClick={() => handleEnviarWhatsApp(cli)}
                                className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold text-teal-800 dark:text-teal-200 bg-teal-50 hover:bg-teal-100 dark:bg-teal-950/60 dark:hover:bg-teal-900/60 border-2 border-teal-400 dark:border-teal-600 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                                title="Enviar resumen por WhatsApp"
                              >
                                WhatsApp
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (window.confirm(`¿Eliminar al cliente ${cli.nombre}?`)) {
                                    eliminarCliente(cli.id)
                                  }
                                }}
                                className="inline-flex items-center justify-center px-2.5 py-1 rounded-lg text-xs font-bold text-red-800 dark:text-red-200 bg-red-50 hover:bg-red-100 dark:bg-red-950/60 dark:hover:bg-red-900/60 border-2 border-red-400 dark:border-red-600 transition-all active:scale-95 cursor-pointer shadow-2xs whitespace-nowrap"
                                title="Eliminar cliente"
                              >
                                Eliminar
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── MODAL ALTA / EDICIÓN DE CLIENTE ── */}
      <Modal
        isOpen={modalClienteOpen}
        onClose={() => setModalClienteOpen(false)}
        title={clienteEditando ? 'Modificar Datos del Cliente' : 'Registrar Nuevo Cliente'}
        size="lg"
        footer={
          <div className="flex flex-col sm:flex-row gap-2.5 w-full">
            <Button
              type="button"
              variant="secondary"
              disabled={guardandoCliente}
              onClick={() => setModalClienteOpen(false)}
              className="order-2 sm:order-1 sm:w-1/3 py-2.5 text-sm font-semibold"
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              form="form-cliente"
              variant="primary"
              loading={guardandoCliente}
              className="order-1 sm:order-2 sm:w-2/3 py-2.5 text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
            >
              {clienteEditando ? 'Guardar Cambios' : 'Registrar Cliente'}
            </Button>
          </div>
        }
      >
        <form id="form-cliente" onSubmit={handleGuardarCliente} className="space-y-4">
          {/* Banner de Ayuda Rápida */}
          <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/40 border-2 border-indigo-200 dark:border-indigo-800 rounded-xl flex items-center gap-3 text-xs text-indigo-950 dark:text-indigo-200">
            <span className="font-bold uppercase text-[10px] tracking-wider px-2 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900 border border-indigo-300 dark:border-indigo-700 shrink-0">
              Guía
            </span>
            <p className="leading-relaxed font-medium">
              Completá el nombre del cliente y su número de WhatsApp para poder fiarle mercadería y enviarle recordatorios de deuda con un solo clic.
            </p>
          </div>

          {/* Bloque 1: Identificación y Contacto */}
          <div className="space-y-3 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              1. Datos Principales
            </p>
            <div className="space-y-3">
              <Input
                label="Nombre o Apodo del Cliente *"
                type="text"
                placeholder="Ej: Don Carlos, Juan Pérez, Vecina Marta..."
                value={formNombre}
                onChange={(e) => setFormNombre(e.target.value)}
                required
                autoFocus
              />

              <div>
                <Input
                  label="Celular o WhatsApp (para avisos de deuda)"
                  type="tel"
                  placeholder="Ej: 11 2345-6789"
                  value={formTelefono}
                  onChange={(e) => setFormTelefono(e.target.value)}
                />
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
                  Permite enviarle su resumen de cuenta por WhatsApp automáticamente.
                </span>
              </div>
            </div>
          </div>

          {/* Bloque 2: Cuenta Corriente y Límite de Fiado */}
          <div className="space-y-3 bg-gray-50/60 dark:bg-gray-800/40 p-4 rounded-xl border-2 border-gray-200 dark:border-gray-700">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
              2. Cuenta Corriente y Fiado
            </p>
            <div>
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Límite máximo de fiado / crédito ($)
              </label>
              <Input
                type="number"
                min="0"
                step="500"
                placeholder="0 = Sin límite de fiado"
                value={formLimite}
                onChange={(e) => setFormLimite(e.target.value)}
              />

              {/* Botones de selección rápida de límite */}
              <div className="flex flex-wrap gap-2 mt-2">
                <button
                  type="button"
                  onClick={() => setFormLimite('0')}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-all cursor-pointer ${
                    formLimite === '0' || formLimite === ''
                      ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs'
                      : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                  }`}
                >
                  Sin límite ($0)
                </button>
                {LIMITES_RAPIDOS_CLIENTE.map((lim) => (
                  <button
                    key={lim}
                    type="button"
                    onClick={() => setFormLimite(lim.toString())}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg border-2 transition-all cursor-pointer ${
                      formLimite === lim.toString()
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                    }`}
                  >
                    {formatPrecio(lim)}
                  </button>
                ))}
              </div>
            </div>

            <Input
              label="Notas o indicaciones (opcional)"
              type="text"
              placeholder="Ej: Vecino de la esquina, paga los días 5..."
              value={formNotas}
              onChange={(e) => setFormNotas(e.target.value)}
            />
          </div>

          {/* Bloque 3: Datos Extras y Facturación (Acordeón desplegable) */}
          <div className="border-2 border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden bg-white dark:bg-gray-800">
            <button
              type="button"
              onClick={() => setMostrarMasDatos((v) => !v)}
              className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-bold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/60 transition-colors cursor-pointer"
            >
              <span>{mostrarMasDatos ? 'Ocultar datos fiscales y domicilio' : '¿Necesitás cargar DNI, Email o Dirección? (Opcional)'}</span>
              <span className="font-mono text-xs">{mostrarMasDatos ? '▲' : '▼'}</span>
            </button>

            {mostrarMasDatos && (
              <div className="px-4 pb-4 pt-2 space-y-3 border-t border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/40">
                <Input
                  label="DNI o CUIT (para Facturación Electrónica ARCA)"
                  type="text"
                  placeholder="Ej: 35123456 o 20-35123456-9"
                  value={formDni}
                  onChange={(e) => setFormDni(e.target.value)}
                />
                <Input
                  label="Correo Electrónico (Email)"
                  type="email"
                  placeholder="Ej: cliente@email.com"
                  value={formEmail}
                  onChange={(e) => setFormEmail(e.target.value)}
                />
                <Input
                  label="Dirección o Domicilio"
                  type="text"
                  placeholder="Ej: San Martín 123, Depto 4"
                  value={formDireccion}
                  onChange={(e) => setFormDireccion(e.target.value)}
                />
              </div>
            )}
          </div>
        </form>
      </Modal>

      {/* ── MODAL FICHA DE CUENTA CORRIENTE ── */}
      <Modal
        isOpen={!!clienteFicha}
        onClose={() => setClienteFicha(null)}
        title={`Ficha de Cuenta Corriente — ${clienteFicha?.nombre || ''}`}
        size="xl"
        footer={
          <div className="flex justify-end w-full">
            <Button
              type="button"
              variant="secondary"
              onClick={() => setClienteFicha(null)}
              className="py-2.5 px-6 text-sm font-semibold"
            >
              Cerrar Ficha
            </Button>
          </div>
        }
      >
        {clienteFicha && (
          <div className="space-y-4">
            {/* Panel Superior KPI del Cliente */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Tarjeta de Saldo */}
              <div
                className={`p-4 rounded-xl border-2 flex flex-col justify-between ${
                  clienteFicha.saldo_deudor > 0
                    ? 'bg-red-50 dark:bg-red-950/40 border-red-300 dark:border-red-800 text-red-900 dark:text-red-300'
                    : 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-300'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-wider block">
                      {clienteFicha.saldo_deudor > 0 ? 'Deuda Pendiente / Fiado' : 'Cuenta al Día'}
                    </span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded border uppercase ${
                      clienteFicha.saldo_deudor > 0
                        ? 'border-red-300 dark:border-red-700 bg-red-100 dark:bg-red-900/60 text-red-800 dark:text-red-300'
                        : 'border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300'
                    }`}>
                      {clienteFicha.saldo_deudor > 0 ? 'Pendiente' : 'Al Día'}
                    </span>
                  </div>
                  <p className="text-2xl sm:text-3xl font-black mt-2">
                    {formatPrecio(clienteFicha.saldo_deudor)}
                  </p>
                </div>
                <span className="text-[11px] opacity-80 mt-1">
                  {clienteFicha.saldo_deudor > 0
                    ? 'Dinero que debe por compras en el kiosco.'
                    : 'No tiene deuda registrada actualmente.'}
                </span>
              </div>

              {/* Tarjeta de Límite de Crédito */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/60 border-2 border-gray-200 dark:border-gray-700 rounded-xl flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                    Límite de Fiado
                  </span>
                  <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                    {clienteFicha.limite_credito > 0
                      ? formatPrecio(clienteFicha.limite_credito)
                      : 'Sin límite fijado'}
                  </p>
                </div>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">
                  {clienteFicha.limite_credito > 0
                    ? clienteFicha.saldo_deudor >= clienteFicha.limite_credito
                      ? 'Límite máximo alcanzado'
                      : `Disponible para fiar: ${formatPrecio(clienteFicha.limite_credito - clienteFicha.saldo_deudor)}`
                    : 'Puede fiar sin restricción de monto'}
                </span>
              </div>

              {/* Tarjeta de Contacto */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/60 border-2 border-gray-200 dark:border-gray-700 rounded-xl flex flex-col justify-between">
                <div>
                  <span className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 block">
                    Contacto
                  </span>
                  <p className="text-base font-bold text-gray-900 dark:text-gray-100 mt-1 truncate">
                    {clienteFicha.telefono || 'Sin teléfono guardado'}
                  </p>
                </div>
                <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 truncate">
                  {clienteFicha.direccion || 'Sin dirección cargada'}
                </span>
              </div>
            </div>

            {/* Acciones directas grandes y táctiles con bordes nítidos */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => handleAbrirAbonar(clienteFicha)}
                className="py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all border-2 border-emerald-500 hover:border-emerald-400"
              >
                <span>Registrar Pago / Cobrar Deuda</span>
              </button>
              <button
                type="button"
                onClick={() => handleEnviarWhatsApp(clienteFicha)}
                className="py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 active:scale-98 text-white font-bold text-sm shadow-sm flex items-center justify-center gap-2 cursor-pointer transition-all border-2 border-emerald-600 hover:border-emerald-500"
              >
                <span>Enviar Resumen por WhatsApp</span>
              </button>
            </div>

            {/* Historial de compras y pagos */}
            <div className="space-y-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">
                Historial de Compras (Fiado) y Pagos
              </h3>

              {cargandoMovs ? (
                <p className="text-xs text-gray-400 py-8 text-center">Cargando movimientos del cliente...</p>
              ) : movimientosCC.length === 0 ? (
                <div className="p-8 text-center bg-gray-50 dark:bg-gray-800/40 rounded-xl border border-dashed border-gray-200 dark:border-gray-700">
                  <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">
                    Aún no hay movimientos registrados
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    Cuando este cliente compre fiado en el Punto de Venta o registre un pago, figurará aquí.
                  </p>
                </div>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 sticky top-0">
                      <tr>
                        <th className="px-3.5 py-2.5 font-bold">Fecha</th>
                        <th className="px-3.5 py-2.5 font-bold">Movimiento</th>
                        <th className="px-3.5 py-2.5 font-bold">Detalle</th>
                        <th className="px-3.5 py-2.5 font-bold text-right">Importe</th>
                        <th className="px-3.5 py-2.5 font-bold text-right">Saldo Deudor</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {movimientosCC.map((m) => {
                        const esCargo = m.tipo === 'CARGO_VENTA'
                        return (
                          <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/60 transition-colors">
                            <td className="px-3.5 py-2.5 text-gray-600 dark:text-gray-300 whitespace-nowrap">
                              {formatFecha(m.fecha_hora)}
                            </td>
                            <td className="px-3.5 py-2.5 whitespace-nowrap">
                              <span
                                className={`px-2.5 py-1 rounded-lg font-bold text-[11px] ${
                                  esCargo
                                    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400'
                                }`}
                              >
                                {esCargo ? 'Compra (Fiado)' : 'Abono (Pago)'}
                              </span>
                            </td>
                            <td className="px-3.5 py-2.5 text-gray-700 dark:text-gray-300">
                              {m.notas || (esCargo ? 'Venta en mostrador' : 'Pago de deuda')}
                              {m.medio_pago && (
                                <span className="text-gray-400 ml-1.5 text-[11px]">
                                  • {labelMedioPago(m.medio_pago)}
                                </span>
                              )}
                            </td>
                            <td
                              className={`px-3.5 py-2.5 text-right font-black whitespace-nowrap ${
                                esCargo
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {esCargo ? `+${formatPrecio(m.monto)}` : `-${formatPrecio(m.monto)}`}
                            </td>
                            <td className="px-3.5 py-2.5 text-right font-bold text-gray-900 dark:text-gray-100 whitespace-nowrap">
                              {formatPrecio(m.saldo_resultante)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* ── MODAL REGISTRAR ABONO / PAGO DE DEUDA ── */}
      <Modal
        isOpen={!!clienteAbonar}
        onClose={() => setClienteAbonar(null)}
        title={`Cobrar Deuda — ${clienteAbonar?.nombre || ''}`}
        size="md"
        footer={
          clienteAbonar ? (
            <div className="flex flex-col sm:flex-row gap-2.5 w-full">
              <Button
                type="button"
                variant="secondary"
                disabled={guardandoAbono}
                onClick={() => setClienteAbonar(null)}
                className="order-2 sm:order-1 sm:w-1/3 py-2.5 text-sm font-semibold"
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form="form-abono"
                variant="primary"
                loading={guardandoAbono}
                className="order-1 sm:order-2 sm:w-2/3 py-2.5 text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm flex items-center justify-center gap-2 border-2 border-emerald-500"
                disabled={!montoAbono || parseFloat(montoAbono) <= 0}
              >
                Confirmar y Guardar Cobro
              </Button>
            </div>
          ) : undefined
        }
      >
        {clienteAbonar && (
          <form id="form-abono" onSubmit={handleConfirmarAbono} className="space-y-4">
            {/* Tarjeta de Deuda Pendiente */}
            <div className="p-3.5 bg-red-50 dark:bg-red-950/40 border-2 border-red-300 dark:border-red-800 rounded-xl flex items-center justify-between">
              <div>
                <span className="text-xs font-bold text-red-800 dark:text-red-300 block">
                  Deuda actual a cobrar:
                </span>
                <span className="text-[11px] text-red-700/80 dark:text-red-400/80">
                  Saldo pendiente en su cuenta
                </span>
              </div>
              <span className="text-xl sm:text-2xl font-black text-red-600 dark:text-red-400">
                {formatPrecio(clienteAbonar.saldo_deudor)}
              </span>
            </div>

            {/* Monto a abonar */}
            <div className="space-y-2">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                ¿Cuánto dinero entrega el cliente? *
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-gray-400">
                  $
                </span>
                <input
                  type="number"
                  min="1"
                  step="50"
                  placeholder="0"
                  value={montoAbono}
                  onChange={(e) => setMontoAbono(e.target.value)}
                  required
                  autoFocus
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border-2 border-indigo-300 dark:border-indigo-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-xl font-black tracking-tight focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-gray-300"
                />
              </div>

              {/* Botón rápido para saldar toda la deuda */}
              {clienteAbonar.saldo_deudor > 0 && (
                <button
                  type="button"
                  onClick={() => setMontoAbono(clienteAbonar.saldo_deudor.toString())}
                  className="w-full py-2.5 px-3 rounded-xl border-2 border-indigo-400 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-800 dark:text-indigo-200 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 cursor-pointer transition-colors shadow-xs"
                >
                  Cobrar la deuda completa ({formatPrecio(clienteAbonar.saldo_deudor)})
                </button>
              )}

              {/* Botones de billetes rápidos con bordes nítidos */}
              <div className="grid grid-cols-5 gap-1.5 pt-1">
                {BILLETES_RAPIDOS_ABONO.map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setMontoAbono(v.toString())}
                    className={`py-1.5 text-xs font-bold rounded-xl border-2 transition-all cursor-pointer text-center select-none active:scale-95 ${
                      parseFloat(montoAbono) === v
                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 shadow-xs'
                        : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                    }`}
                  >
                    +{formatPrecio(v)}
                  </button>
                ))}
              </div>
            </div>

            {/* Selector Visual de Medio de Pago */}
            <div className="space-y-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-gray-700 dark:text-gray-300">
                ¿Cómo te paga? *
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MEDIOS_PAGO_CLIENTE.map((mp) => {
                  const seleccionado = medioPagoAbono === mp.valor
                  return (
                    <button
                      key={mp.valor}
                      type="button"
                      onClick={() => setMedioPagoAbono(mp.valor)}
                      className={`p-2.5 rounded-xl border-2 text-left transition-all cursor-pointer ${
                        seleccionado
                          ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/50 text-emerald-950 dark:text-emerald-200 shadow-xs ring-1 ring-emerald-500/50'
                          : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-400'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold">{mp.label}</span>
                        {seleccionado && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300">
                            Activo
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-gray-500 dark:text-gray-400 block mt-0.5">
                        {mp.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Checkbox de ingreso en caja si es efectivo */}
            {medioPagoAbono === 'EFECTIVO' && sesionActiva && (
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/40 border-2 border-amber-300 dark:border-amber-700/80 text-xs text-amber-950 dark:text-amber-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={impactarEnCaja}
                  onChange={(e) => setImpactarEnCaja(e.target.checked)}
                  className="rounded mt-0.5 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <div>
                  <span className="font-bold block">
                    Sumar este efectivo a la caja del turno activo
                  </span>
                  <span className="text-[11px] opacity-80 block mt-0.5">
                    Recomendado para que la plata física en el cajón coincida con el arqueo de cierre.
                  </span>
                </div>
              </label>
            )}

            {/* Detalle o referencia */}
            <div className="space-y-1">
              <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">
                Anotación o referencia (opcional)
              </label>
              <input
                type="text"
                placeholder="Ej: Pago entregado por el hijo, dejó seña..."
                value={notasAbono}
                onChange={(e) => setNotasAbono(e.target.value)}
                className="w-full px-3.5 py-2 text-sm rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
