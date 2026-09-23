import { useState, useEffect } from 'react'
import { useAFIPStore, validarCUIT } from '../../stores/afipStore'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'
import { TicketReceiptModal, type TicketData } from '../pos/TicketReceiptModal'
import type { ConfiguracionAFIP, CondicionIvaAFIP, EntornoAFIP } from '../../types/afip'
import toast from 'react-hot-toast'

export function AFIPConfigSection() {
  const { usuario } = useAuthStore()
  const esDuenio = usuario?.rol === 'DUEÑO' || usuario?.es_superadmin
  const { config, cargando, guardando, cargarConfiguracion, guardarConfiguracion, emitirComprobantePrueba } =
    useAFIPStore()

  // Estado local del formulario
  const [habilitado, setHabilitado] = useState(false)
  const [cuit, setCuit] = useState('')
  const [razonSocial, setRazonSocial] = useState('')
  const [condicionIva, setCondicionIva] = useState<CondicionIvaAFIP>('MONOTRIBUTO')
  const [puntoVenta, setPuntoVenta] = useState(2)
  const [iibb, setIibb] = useState('')
  const [inicioActividades, setInicioActividades] = useState('')
  const [entorno, setEntorno] = useState<EntornoAFIP>('HOMOLOGACION')
  const [facturarAutomatico, setFacturarAutomatico] = useState(false)
  const [montoMinimoAuto, setMontoMinimoAuto] = useState(0)

  // Estado para guía desplegable
  const [mostrarGuia, setMostrarGuia] = useState(false)

  // Modal de ticket de prueba
  const [ticketPrueba, setTicketPrueba] = useState<TicketData | null>(null)
  const [generandoPrueba, setGenerandoPrueba] = useState(false)

  useEffect(() => {
    cargarConfiguracion()
  }, [cargarConfiguracion])

  useEffect(() => {
    if (config) {
      setHabilitado(config.habilitado)
      setCuit(config.cuit || '')
      setRazonSocial(config.razon_social || '')
      setCondicionIva(config.condicion_iva || 'MONOTRIBUTO')
      setPuntoVenta(config.punto_venta || 2)
      setIibb(config.iibb || '')
      setInicioActividades(config.inicio_actividades || '')
      setEntorno(config.entorno || 'HOMOLOGACION')
      setFacturarAutomatico(config.facturar_automatico || false)
      setMontoMinimoAuto(config.monto_minimo_auto || 0)
    }
  }, [config])

  // Validación de CUIT en vivo
  const cuitLimpio = cuit.replace(/\D/g, '')
  const cuitValido = cuitLimpio.length === 11 ? validarCUIT(cuitLimpio) : null

  const handleGuardar = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!esDuenio) {
      toast.error('Acceso denegado: Solo el Dueño puede modificar la configuración fiscal')
      return
    }

    if (habilitado) {
      if (!cuitLimpio) {
        toast.error('Debés ingresar el CUIT para habilitar la facturación ARCA')
        return
      }
      if (!validarCUIT(cuitLimpio)) {
        toast.error('El CUIT ingresado no es válido según el algoritmo Módulo 11 de ARCA')
        return
      }
      if (puntoVenta <= 0) {
        toast.error('El Punto de Venta debe ser mayor a 0 (ej: 2)')
        return
      }
    }

    const nuevaConfig: Partial<ConfiguracionAFIP> = {
      habilitado,
      cuit: cuitLimpio,
      razon_social: razonSocial.trim(),
      condicion_iva: condicionIva,
      punto_venta: Number(puntoVenta),
      iibb: iibb.trim(),
      inicio_actividades: inicioActividades.trim(),
      entorno,
      facturar_automatico: facturarAutomatico,
      monto_minimo_auto: Number(montoMinimoAuto) || 0,
    }

    const ok = await guardarConfiguracion(nuevaConfig)
    if (ok) {
      // guardarConfiguracion ya emite toast de éxito
    }
  }

  const handleToggleHabilitado = async () => {
    if (!esDuenio) {
      toast.error('Acceso denegado: Solo el Dueño puede modificar la configuración fiscal')
      return
    }

    const nuevoEstado = !habilitado

    if (nuevoEstado) {
      if (!cuitLimpio) {
        toast.error('Para activar la facturación ARCA, primero ingresá tu CUIT')
        return
      }
      if (!validarCUIT(cuitLimpio)) {
        toast.error('El CUIT ingresado no es válido según el algoritmo Módulo 11 de ARCA')
        return
      }
      if (puntoVenta <= 0) {
        toast.error('El Punto de Venta debe ser mayor a 0 (ej: 2)')
        return
      }
    }

    setHabilitado(nuevoEstado)

    const ok = await guardarConfiguracion({
      habilitado: nuevoEstado,
      cuit: cuitLimpio,
      razon_social: razonSocial.trim(),
      condicion_iva: condicionIva,
      punto_venta: Number(puntoVenta),
      iibb: iibb.trim(),
      inicio_actividades: inicioActividades.trim(),
      entorno,
      facturar_automatico: facturarAutomatico,
      monto_minimo_auto: Number(montoMinimoAuto) || 0,
    })

    if (!ok) {
      // Revertir si falló
      setHabilitado(!nuevoEstado)
    }
  }

  const handleProbarComprobante = async () => {
    setGenerandoPrueba(true)
    try {
      const res = await emitirComprobantePrueba()
      if (!res) {
        toast.error('No se pudo generar el comprobante de prueba')
        return
      }

      // Estructurar TicketData para el modal de impresión
      const dataTicketPrueba: TicketData = {
        ventaId: 'TEST-' + Math.floor(1000 + Math.random() * 9000),
        fecha: new Date().toISOString(),
        items: [
          { descripcion: 'Gaseosa Cola 500ml', cantidad: 1, precioUnitario: 900, subtotal: 900 },
          { descripcion: 'Alfajor Triple Chocolate', cantidad: 1, precioUnitario: 600, subtotal: 600 },
        ],
        subtotal: 1500,
        total: 1500,
        medioPago: 'EFECTIVO',
        pagaCon: 2000,
        vuelto: 500,
        kioscoNombre: razonSocial || 'KioskoPOS Demo',
        kioscoDireccion: 'Av. Siempre Viva 742',
        kioscoTelefono: '011-4455-6677',
        cajeroNombre: 'Cajero de Prueba',
        clienteNombre: 'Consumidor Final',
        afip: {
          tipoComprobante: res.tipo_comprobante,
          tipoComprobanteNombre: `Factura ${res.letra}`,
          letra: res.letra,
          puntoVenta: res.punto_venta,
          nroComprobante: res.nro_comprobante,
          cae: res.cae,
          vtoCae: res.vto_cae,
          qrUrl: res.qr_url,
          cuitEmisor: res.cuit_emisor,
          condicionIva: res.condicion_iva,
          iibb: res.iibb,
          inicioActividades: res.inicio_actividades,
          tipoDocCliente: 99,
          nroDocCliente: '0',
        },
      }

      setTicketPrueba(dataTicketPrueba)
    } catch (err) {
      console.error(err)
      toast.error('Error al emitir comprobante de prueba')
    } finally {
      setGenerandoPrueba(false)
    }
  }

  if (cargando) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 animate-pulse">
        <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
        <div className="h-4 bg-gray-100 dark:bg-gray-700/50 rounded w-2/3 mb-6"></div>
        <div className="h-24 bg-gray-100 dark:bg-gray-700/50 rounded"></div>
      </div>
    )
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      {/* Encabezado y Switch Habilitar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-700">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Facturación Electrónica ARCA (WSFEv1)
            </h2>
            <span
              className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${
                habilitado
                  ? 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                  : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400'
              }`}
            >
              {habilitado ? 'Habilitada' : 'Deshabilitada'}
            </span>
          </div>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Emisión de Facturas C y B electrónicas con CAE y código QR oficial (RG 4892) para tickets térmicos y digitales.
          </p>
        </div>

        {/* Toggle principal accesible con posicion fija y animacion fluida */}
        <div className="flex items-center gap-3 select-none flex-shrink-0 w-36 sm:w-40 justify-start">
          <button
            type="button"
            role="switch"
            aria-checked={habilitado}
            onClick={handleToggleHabilitado}
            className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
              habilitado ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs ring-0 transition duration-200 ease-in-out ${
                habilitado ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
          <span className="text-sm font-semibold text-gray-900 dark:text-gray-200 w-24 flex-shrink-0 select-none">
            {habilitado ? 'Activa en POS' : 'Inactiva'}
          </span>
        </div>
      </div>

      {/* Formulario de Configuración Fiscal */}
      <form onSubmit={handleGuardar} className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* CUIT */}
          <div>
            <Input
              label="CUIT del Titular / Comercio *"
              placeholder="Ej: 20351234568 (11 dígitos sin guiones)"
              value={cuit}
              onChange={(e) => setCuit(e.target.value)}
              disabled={!habilitado}
              required={habilitado}
            />
            {cuitLimpio.length > 0 && (
              <p
                className={`text-xs mt-1 font-medium ${
                  cuitValido
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : cuitLimpio.length === 11
                    ? 'text-red-600 dark:text-red-400'
                    : 'text-gray-400'
                }`}
              >
                {cuitValido
                  ? 'CUIT válido (verificación Módulo 11 aprobada)'
                  : cuitLimpio.length === 11
                  ? 'CUIT inválido (no coincide con el dígito verificador)'
                  : `Ingresados ${cuitLimpio.length} de 11 dígitos`}
              </p>
            )}
          </div>

          {/* Razón Social */}
          <Input
            label="Razón Social o Nombre de Fantasía"
            placeholder="Ej: Juan Pérez / Kiosco El Sol"
            value={razonSocial}
            onChange={(e) => setRazonSocial(e.target.value)}
            disabled={!habilitado}
          />

          {/* Condición ante el IVA */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Condición ante el IVA *
            </label>
            <select
              value={condicionIva}
              onChange={(e) => setCondicionIva(e.target.value as CondicionIvaAFIP)}
              disabled={!habilitado}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:bg-gray-100 dark:disabled:bg-gray-900"
            >
              <option value="MONOTRIBUTO">Responsable Monotributo (Emite Factura C)</option>
              <option value="RESPONSABLE_INSCRIPTO">Responsable Inscripto (Emite Factura B / A)</option>
            </select>
          </div>

          {/* Punto de Venta ARCA */}
          <div>
            <Input
              label="Punto de Venta ARCA *"
              type="number"
              min={1}
              max={9999}
              placeholder="Ej: 2"
              value={puntoVenta.toString()}
              onChange={(e) => setPuntoVenta(parseInt(e.target.value) || 1)}
              disabled={!habilitado}
              required={habilitado}
            />
            <p className="text-[11px] text-gray-400 mt-0.5">
              Debe ser un punto de venta habilitado en ARCA para "Facturación Web Services".
            </p>
          </div>

          {/* Ingresos Brutos */}
          <Input
            label="Número de Ingresos Brutos (IIBB)"
            placeholder="Ej: 20-35123456-8 o Exento"
            value={iibb}
            onChange={(e) => setIibb(e.target.value)}
            disabled={!habilitado}
          />

          {/* Inicio de Actividades */}
          <Input
            label="Fecha Inicio de Actividades"
            placeholder="Ej: 01/03/2021"
            value={inicioActividades}
            onChange={(e) => setInicioActividades(e.target.value)}
            disabled={!habilitado}
          />

          {/* Entorno de Trabajo */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Entorno ARCA
            </label>
            <select
              value={entorno}
              onChange={(e) => setEntorno(e.target.value as EntornoAFIP)}
              disabled={!habilitado}
              className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 disabled:opacity-60 disabled:bg-gray-100 dark:disabled:bg-gray-900"
            >
              <option value="HOMOLOGACION">Homologación / Modo Pruebas (Recomendado para inicio)</option>
              <option value="PRODUCCION">Producción (Comprobantes Fiscales Reales)</option>
            </select>
          </div>

          {/* Último Comprobante */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Último Comprobante Emitido
            </label>
            <div className="px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 text-sm font-mono font-bold text-gray-700 dark:text-gray-300">
              N° {String(config?.ultimo_nro_comprobante || 0).padStart(8, '0')}
            </div>
          </div>
        </div>

        {/* Automatización de Facturación */}
        <div className="p-4 rounded-xl border border-gray-100 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50 space-y-3">
          <h3 className="text-sm font-bold text-gray-900 dark:text-gray-100">
            Reglas de Emisión en Caja
          </h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={facturarAutomatico}
                onChange={(e) => setFacturarAutomatico(e.target.checked)}
                disabled={!habilitado}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
              />
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                Tildar "Emitir Factura ARCA" automáticamente en cada venta
              </span>
            </label>

            <div className="flex items-center gap-3 pt-1">
              <span className="text-xs text-gray-600 dark:text-gray-400">
                O facturar automáticamente cuando el monto de venta sea mayor o igual a:
              </span>
              <div className="w-36">
                <input
                  type="number"
                  min={0}
                  step={500}
                  value={montoMinimoAuto || ''}
                  onChange={(e) => setMontoMinimoAuto(parseFloat(e.target.value) || 0)}
                  disabled={!habilitado}
                  placeholder="$ 0"
                  className="w-full px-2.5 py-1 text-xs rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 disabled:opacity-60"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Botones de acción */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <div className="flex items-center gap-2">
            <Button type="submit" loading={guardando} disabled={cargando}>
              Guardar configuración fiscal
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleProbarComprobante}
              loading={generandoPrueba}
              disabled={!habilitado}
            >
              Emitir comprobante de prueba
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setMostrarGuia(!mostrarGuia)}
            className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:underline"
          >
            {mostrarGuia ? '▲ Ocultar guía de vinculación ARCA' : '▼ Ver instructivo paso a paso de ARCA'}
          </button>
        </div>
      </form>

      {/* Guía Desplegable Paso a Paso */}
      {mostrarGuia && (
        <div className="p-4 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 text-xs text-gray-700 dark:text-gray-300 space-y-3">
          <h4 className="font-bold text-sm text-blue-900 dark:text-blue-200">
            Guía rápida: Cómo configurar la Facturación Electrónica en ARCA
          </h4>
          <ol className="list-decimal pl-4 space-y-2 leading-relaxed">
            <li>
              <strong>Crear Punto de Venta Web Services:</strong> Ingresá en el portal de ARCA con tu CUIT y Clave Fiscal (Nivel 3). Entrá a <em>"Administración de Puntos de Venta y Domicilios"</em> y agregá un nuevo punto de venta (por ejemplo, el <strong>2</strong> o superior) seleccionando el tipo de sistema <strong>"Facturación Electrónica - Web Services"</strong>.
            </li>
            <li>
              <strong>Delegación del Servicio WSFEv1:</strong> En <em>"Administrador de Relaciones de Clave Fiscal"</em>, asociá el servicio <strong>"Facturación Electrónica" (WSFEv1)</strong>.
            </li>
            <li>
              <strong>Cargar datos en KioskoPOS:</strong> Ingresá el CUIT y el número de punto de venta creado aquí arriba. En modo <em>Homologación</em> podés probar la impresión y el código QR de inmediato sin enviar datos a ARCA. Al pasar a <em>Producción</em>, las ventas quedarán registradas formalmente.
            </li>
          </ol>
          <p className="text-[11px] text-blue-800 dark:text-blue-300 italic pt-1">
            Normativa de referencia: RG 4892 ARCA (Código QR obligatorio en comprobantes electrónicos emitidos en puntos de venta físicos o digitales).
          </p>
        </div>
      )}

      {/* Modal de Comprobante de Prueba */}
      {ticketPrueba && (
        <TicketReceiptModal
          isOpen={!!ticketPrueba}
          onClose={() => setTicketPrueba(null)}
          ticket={ticketPrueba}
        />
      )}
    </div>
  )
}
