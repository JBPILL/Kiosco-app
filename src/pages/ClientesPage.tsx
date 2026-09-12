import { useState, useEffect, useCallback } from 'react'
import { useClienteStore } from '../stores/clienteStore'
import { useCajaStore } from '../stores/cajaStore'
import { formatPrecio, formatFecha, labelMedioPago } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import type { Cliente, MovimientoCuentaCorriente, MedioPago } from '../types/database'

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

  const { sesionActiva, registrarMovimientoCaja } = useCajaStore()

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
      notasAbono || undefined
    )

    if (ok) {
      // Si fue en efectivo y hay caja abierta, registrar como ingreso
      if (medioPagoAbono === 'EFECTIVO' && impactarEnCaja && sesionActiva) {
        await registrarMovimientoCaja(
          'INGRESO',
          'OTRO',
          monto,
          `Cobro cuenta corriente - ${clienteAbonar.nombre}`
        )
      }

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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">
            Clientes y Cuenta Corriente
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Control de clientes, fiados a crédito y registro de cobranzas
          </p>
        </div>

        <Button variant="primary" onClick={handleNuevoCliente} className="self-start sm:self-auto">
          + Nuevo Cliente
        </Button>
      </div>

      {/* Tarjetas de Métricas Globales */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Total Clientes</p>
          <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">{totalClientes}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Deuda Total en la Calle</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
            {formatPrecio(totalDeudaGlobal)}
          </p>
        </div>

        <div className="bg-white dark:bg-gray-800 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">Clientes con Deuda</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            {clientesConDeuda} {clientesConDeuda === 1 ? 'cliente' : 'clientes'}
          </p>
        </div>
      </div>

      {/* Contenedor Principal: Búsqueda, Filtros y Lista */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 sm:p-6 space-y-4">
        {/* Barra superior de filtros */}
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
          <div className="flex-1 max-w-md">
            <input
              type="text"
              placeholder="Buscar por nombre, DNI o teléfono..."
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400"
            />
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            <button
              onClick={() => setFiltroEstado('TODOS')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                filtroEstado === 'TODOS'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Todos ({clientes.length})
            </button>
            <button
              onClick={() => setFiltroEstado('CON_DEUDA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                filtroEstado === 'CON_DEUDA'
                  ? 'bg-amber-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
              }`}
            >
              Con Deuda ({clientesConDeuda})
            </button>
            <button
              onClick={() => setFiltroEstado('AL_DIA')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                filtroEstado === 'AL_DIA'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
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
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 text-xs uppercase">
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
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => abrirFichaCliente(cli)}
                              className="text-xs"
                            >
                              Ficha
                            </Button>
                            {debe && (
                              <Button
                                size="sm"
                                variant="primary"
                                onClick={() => handleAbrirAbonar(cli)}
                                className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                              >
                                Abonar
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEditarCliente(cli)}
                              className="text-xs"
                            >
                              Editar
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleEnviarWhatsApp(cli)}
                              className="text-xs text-emerald-600 hover:text-emerald-700"
                              title="Enviar resumen por WhatsApp"
                            >
                              WhatsApp
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (window.confirm(`¿Eliminar al cliente ${cli.nombre}?`)) {
                                  eliminarCliente(cli.id)
                                }
                              }}
                              className="text-xs text-red-500 hover:text-red-700"
                              title="Eliminar cliente"
                            >
                              Eliminar
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── MODAL ALTA / EDICIÓN DE CLIENTE ── */}
      <Modal
        isOpen={modalClienteOpen}
        onClose={() => setModalClienteOpen(false)}
        title={clienteEditando ? 'Editar Cliente' : 'Nuevo Cliente'}
        size="md"
      >
        <form onSubmit={handleGuardarCliente} className="space-y-4">
          <Input
            label="Nombre completo *"
            type="text"
            placeholder="Ej: Juan Pérez"
            value={formNombre}
            onChange={(e) => setFormNombre(e.target.value)}
            required
            autoFocus
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Teléfono / WhatsApp"
              type="tel"
              placeholder="Ej: 1122334455"
              value={formTelefono}
              onChange={(e) => setFormTelefono(e.target.value)}
            />
            <Input
              label="DNI o CUIT"
              type="text"
              placeholder="Ej: 35123456"
              value={formDni}
              onChange={(e) => setFormDni(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input
              label="Dirección"
              type="text"
              placeholder="Ej: San Martín 123"
              value={formDireccion}
              onChange={(e) => setFormDireccion(e.target.value)}
            />
            <Input
              label="Límite de crédito ($)"
              type="number"
              min="0"
              step="500"
              placeholder="0 = Sin límite"
              value={formLimite}
              onChange={(e) => setFormLimite(e.target.value)}
            />
          </div>

          <Input
            label="Notas / Observaciones"
            type="text"
            placeholder="Ej: Vecino del barrio, cobra los días 5"
            value={formNotas}
            onChange={(e) => setFormNotas(e.target.value)}
          />

          <div className="flex gap-2 pt-2">
            <Button type="submit" variant="primary" fullWidth loading={guardandoCliente}>
              {clienteEditando ? 'Guardar Cambios' : 'Registrar Cliente'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              fullWidth
              disabled={guardandoCliente}
              onClick={() => setModalClienteOpen(false)}
            >
              Cancelar
            </Button>
          </div>
        </form>
      </Modal>

      {/* ── MODAL FICHA DE CUENTA CORRIENTE ── */}
      <Modal
        isOpen={!!clienteFicha}
        onClose={() => setClienteFicha(null)}
        title={`Ficha de Cuenta Corriente — ${clienteFicha?.nombre || ''}`}
        size="lg"
      >
        {clienteFicha && (
          <div className="space-y-4">
            {/* Cabecera del cliente */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl text-xs">
              <div>
                <p className="text-gray-500 dark:text-gray-400">Saldo Deudor Actual</p>
                <p className="text-xl font-black text-red-600 dark:text-red-400 mt-0.5">
                  {formatPrecio(clienteFicha.saldo_deudor)}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Límite de Crédito</p>
                <p className="text-base font-bold text-gray-800 dark:text-gray-200 mt-0.5">
                  {clienteFicha.limite_credito > 0
                    ? formatPrecio(clienteFicha.limite_credito)
                    : 'Sin límite'}
                </p>
              </div>
              <div>
                <p className="text-gray-500 dark:text-gray-400">Contacto</p>
                <p className="font-medium text-gray-700 dark:text-gray-300 mt-0.5">
                  {clienteFicha.telefono || 'Sin teléfono'}
                </p>
              </div>
            </div>

            {/* Acciones directas de la ficha */}
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="primary"
                onClick={() => handleAbrirAbonar(clienteFicha)}
                className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
              >
                + Registrar Abono / Pago
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => handleEnviarWhatsApp(clienteFicha)}
                className="text-xs"
              >
                Enviar Resumen por WhatsApp
              </Button>
            </div>

            {/* Historial de movimientos */}
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                Historial de Compras y Pagos
              </h3>

              {cargandoMovs ? (
                <p className="text-xs text-gray-400 py-6 text-center">Cargando movimientos...</p>
              ) : movimientosCC.length === 0 ? (
                <p className="text-xs text-gray-400 py-6 text-center">
                  Aún no hay movimientos registrados en la cuenta de este cliente.
                </p>
              ) : (
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                      <tr>
                        <th className="px-3 py-2 font-medium">Fecha</th>
                        <th className="px-3 py-2 font-medium">Tipo</th>
                        <th className="px-3 py-2 font-medium">Detalle</th>
                        <th className="px-3 py-2 font-medium text-right">Monto</th>
                        <th className="px-3 py-2 font-medium text-right">Saldo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {movimientosCC.map((m) => {
                        const esCargo = m.tipo === 'CARGO_VENTA'
                        return (
                          <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td className="px-3 py-2 text-gray-600 dark:text-gray-300">
                              {formatFecha(m.fecha_hora)}
                            </td>
                            <td className="px-3 py-2">
                              <span
                                className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                                  esCargo
                                    ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                                    : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400'
                                }`}
                              >
                                {esCargo ? 'Compra' : 'Abono'}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                              {m.notas || (esCargo ? 'Venta en POS' : 'Pago de deuda')}
                              {m.medio_pago && (
                                <span className="text-gray-400 ml-1">
                                  ({labelMedioPago(m.medio_pago)})
                                </span>
                              )}
                            </td>
                            <td
                              className={`px-3 py-2 text-right font-bold ${
                                esCargo
                                  ? 'text-red-600 dark:text-red-400'
                                  : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            >
                              {esCargo ? `+${formatPrecio(m.monto)}` : `-${formatPrecio(m.monto)}`}
                            </td>
                            <td className="px-3 py-2 text-right font-semibold text-gray-800 dark:text-gray-200">
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

            <div className="pt-2">
              <Button variant="secondary" fullWidth onClick={() => setClienteFicha(null)}>
                Cerrar
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* ── MODAL REGISTRAR ABONO / PAGO DE DEUDA ── */}
      <Modal
        isOpen={!!clienteAbonar}
        onClose={() => setClienteAbonar(null)}
        title={`Registrar Abono — ${clienteAbonar?.nombre || ''}`}
        size="md"
      >
        {clienteAbonar && (
          <form onSubmit={handleConfirmarAbono} className="space-y-4">
            <div className="p-3 bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg text-xs space-y-1">
              <div className="flex justify-between text-red-800 dark:text-red-300">
                <span>Deuda actual del cliente:</span>
                <span className="font-bold text-sm">{formatPrecio(clienteAbonar.saldo_deudor)}</span>
              </div>
            </div>

            {/* Monto a abonar */}
            <div>
              <Input
                label="Monto a abonar ($) *"
                type="number"
                min="1"
                step="50"
                placeholder="Ingresá el importe"
                value={montoAbono}
                onChange={(e) => setMontoAbono(e.target.value)}
                required
                autoFocus
              />
              {/* Botón para pagar deuda total si aplica */}
              {clienteAbonar.saldo_deudor > 0 && (
                <div className="flex gap-2 mt-2">
                  <button
                    type="button"
                    onClick={() => setMontoAbono(clienteAbonar.saldo_deudor.toString())}
                    className="px-2.5 py-1 text-xs font-semibold rounded border border-indigo-300 dark:border-indigo-700 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300"
                  >
                    Pagar total ({formatPrecio(clienteAbonar.saldo_deudor)})
                  </button>
                  {[1000, 2000, 5000].map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setMontoAbono(v.toString())}
                      className="px-2.5 py-1 text-xs font-medium rounded border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                    >
                      +{formatPrecio(v)}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Medio de pago */}
            <div>
              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                Medio de pago
              </label>
              <select
                value={medioPagoAbono}
                onChange={(e) => setMedioPagoAbono(e.target.value as MedioPago)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100"
              >
                <option value="EFECTIVO">Efectivo</option>
                <option value="MERCADOPAGO">Mercado Pago</option>
                <option value="TRANSFERENCIA">Transferencia</option>
                <option value="TARJETA">Tarjeta</option>
              </select>
            </div>

            {/* Checkbox de ingreso en caja si es efectivo */}
            {medioPagoAbono === 'EFECTIVO' && sesionActiva && (
              <label className="flex items-center gap-2 p-2.5 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={impactarEnCaja}
                  onChange={(e) => setImpactarEnCaja(e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500"
                />
                <span>Ingresar este dinero en el turno de Caja actual (para arqueo exacto)</span>
              </label>
            )}

            <Input
              label="Detalle o referencia (opcional)"
              type="text"
              placeholder="Ej: Pago entregado por el hijo..."
              value={notasAbono}
              onChange={(e) => setNotasAbono(e.target.value)}
            />

            <div className="flex gap-2 pt-2">
              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={guardandoAbono}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                disabled={!montoAbono || parseFloat(montoAbono) <= 0}
              >
                Confirmar Cobro
              </Button>
              <Button
                type="button"
                variant="secondary"
                fullWidth
                disabled={guardandoAbono}
                onClick={() => setClienteAbonar(null)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        )}
      </Modal>
    </div>
  )
}
