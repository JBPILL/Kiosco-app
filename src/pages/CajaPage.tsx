import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { useCajaStore } from '../stores/cajaStore'
import { formatPrecio, formatFecha } from '../lib/utils'
import { Button } from '../components/ui/Button'
import { Input } from '../components/ui/Input'
import { Modal } from '../components/ui/Modal'
import type { SesionCaja, Usuario } from '../types/database'

interface SesionHistorial extends SesionCaja {
  usuario?: Usuario
}

export function CajaPage() {
  const { usuario } = useAuthStore()
  const {
    sesionActiva,
    resumenActivo,
    cargando,
    verificarSesionActiva,
    abrirCaja,
    cargarResumenSesion,
    cerrarCaja,
  } = useCajaStore()

  // Estados para apertura
  const [montoInicial, setMontoInicial] = useState('0')
  const [abriendo, setAbriendo] = useState(false)

  // Estados para cierre / arqueo
  const [modalArqueoOpen, setModalArqueoOpen] = useState(false)
  const [efectivoContado, setEfectivoContado] = useState('')
  const [cerrando, setCerrando] = useState(false)

  // Historial de cierres
  const [historial, setHistorial] = useState<SesionHistorial[]>([])
  const [cargandoHistorial, setCargandoHistorial] = useState(false)
  const [sesionDetalle, setSesionDetalle] = useState<SesionHistorial | null>(null)

  const cargarHistorial = useCallback(async () => {
    if (!usuario?.kiosco_id) return
    setCargandoHistorial(true)

    try {
      const { data, error } = await supabase
        .from('sesiones_caja')
        .select('*, usuario:usuarios(id, nombre, rol)')
        .eq('kiosco_id', usuario.kiosco_id)
        .eq('estado', 'CERRADA')
        .order('fecha_cierre', { ascending: false })
        .limit(20)

      if (error) throw error
      setHistorial((data as SesionHistorial[]) || [])
    } catch (err) {
      console.error('Error cargando historial de caja:', err)
    } finally {
      setCargandoHistorial(false)
    }
  }, [usuario?.kiosco_id])

  useEffect(() => {
    verificarSesionActiva()
    cargarHistorial()
  }, [verificarSesionActiva, cargarHistorial])

  const handleAbrirCaja = async (e: React.FormEvent) => {
    e.preventDefault()
    const fondo = parseFloat(montoInicial) || 0
    setAbriendo(true)
    const ok = await abrirCaja(fondo)
    setAbriendo(false)
    if (ok) {
      setMontoInicial('0')
    }
  }

  const handleAbrirModalArqueo = async () => {
    if (sesionActiva) {
      await cargarResumenSesion(sesionActiva.id)
    }
    setEfectivoContado('')
    setModalArqueoOpen(true)
  }

  const efectivoEsperado = resumenActivo?.efectivo_esperado_en_caja ?? (sesionActiva?.monto_inicial || 0)
  const contadoNum = parseFloat(efectivoContado) || 0
  const diferenciaArqueo = contadoNum - efectivoEsperado

  const handleConfirmarCierre = async () => {
    setCerrando(true)
    const ok = await cerrarCaja(contadoNum)
    setCerrando(false)
    if (ok) {
      setModalArqueoOpen(false)
      cargarHistorial()
    }
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100">Control de Caja y Arqueo</h1>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Apertura de turno, control de efectivo y arqueo al cierre
          </p>
        </div>

        {sesionActiva && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => cargarResumenSesion(sesionActiva.id)}
          >
            Actualizar valores
          </Button>
        )}
      </div>

      {cargando ? (
        <div className="text-center py-12">
          <div className="animate-spin h-8 w-8 border-4 border-indigo-600 border-t-transparent rounded-full mx-auto" />
          <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">Consultando estado de caja...</p>
        </div>
      ) : !sesionActiva ? (
        /* ── CAJA CERRADA: FORMULARIO DE APERTURA ── */
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6 sm:p-8">
          <div className="max-w-md mx-auto text-center space-y-4">
            <div className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              Caja Cerrada
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-gray-100">
              No hay un turno de caja abierto
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Para registrar ventas y cobrar en el punto de venta, iniciá un nuevo turno ingresando el fondo de caja inicial.
            </p>

            <form onSubmit={handleAbrirCaja} className="space-y-4 pt-2 text-left">
              <Input
                label="Fondo inicial de caja (Efectivo para cambio) *"
                type="number"
                min="0"
                step="100"
                placeholder="Ej: 10000"
                value={montoInicial}
                onChange={(e) => setMontoInicial(e.target.value)}
                required
                autoFocus
              />

              <div className="flex gap-2">
                {[5000, 10000, 20000].map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => setMontoInicial(m.toString())}
                    className="flex-1 py-1.5 text-xs font-medium rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300"
                  >
                    {formatPrecio(m)}
                  </button>
                ))}
              </div>

              <Button
                type="submit"
                fullWidth
                size="lg"
                loading={abriendo}
                className="mt-4"
              >
                Abrir turno de caja
              </Button>
            </form>
          </div>
        </div>
      ) : (
        /* ── CAJA ABIERTA: MONITOR EN VIVO Y ARQUEO ── */
        <div className="space-y-6">
          {/* Tarjeta de estado de turno */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-3">
                <span className="inline-flex px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400">
                  Turno en curso
                </span>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Cajero: {sesionActiva.usuario?.nombre || usuario?.nombre || 'Personal'}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Apertura: {formatFecha(sesionActiva.fecha_apertura)}
                  </p>
                </div>
              </div>

              <Button
                variant="danger"
                onClick={handleAbrirModalArqueo}
              >
                Hacer arqueo y cerrar turno
              </Button>
            </div>

            {/* Cuadrícula financiera del turno */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4">
              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Fondo inicial</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {formatPrecio(sesionActiva.monto_inicial)}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-100 dark:border-gray-700">
                <p className="text-xs text-gray-500 dark:text-gray-400">Ventas en efectivo</p>
                <p className="text-xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                  {formatPrecio(resumenActivo?.total_efectivo || 0)}
                </p>
              </div>

              <div className="p-4 rounded-lg bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/40">
                <p className="text-xs text-indigo-700 dark:text-indigo-400 font-medium">
                  Efectivo total esperado en cajón
                </p>
                <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300 mt-1">
                  {formatPrecio(efectivoEsperado)}
                </p>
              </div>
            </div>

            {/* Medios digitales del turno */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-gray-100 dark:border-gray-700 mt-4">
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Mercado Pago</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                  {formatPrecio(resumenActivo?.total_mercadopago || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Transferencia</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                  {formatPrecio(resumenActivo?.total_transferencia || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Tarjeta</p>
                <p className="text-sm font-semibold text-gray-800 dark:text-gray-200 mt-0.5">
                  {formatPrecio(resumenActivo?.total_tarjeta || 0)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-400 dark:text-gray-500">Total ventas turno</p>
                <p className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mt-0.5">
                  {resumenActivo?.total_ventas || 0} operaciones ({formatPrecio(resumenActivo?.total_facturado || 0)})
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORIAL DE TURNOS CERRADOS ── */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Historial de Cierres de Turno
        </h2>

        {cargandoHistorial ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4">Cargando historial...</p>
        ) : historial.length === 0 ? (
          <p className="text-sm text-gray-400 dark:text-gray-500 py-4 text-center">
            Aún no se registraron cierres de caja en el sistema.
          </p>
        ) : (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Cierre</th>
                    <th className="px-4 py-3 font-medium">Cajero</th>
                    <th className="px-4 py-3 font-medium">Fondo inicial</th>
                    <th className="px-4 py-3 font-medium">Esperado</th>
                    <th className="px-4 py-3 font-medium">Contado</th>
                    <th className="px-4 py-3 font-medium">Diferencia</th>
                    <th className="px-4 py-3 font-medium text-right">Detalle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {historial.map((item) => {
                    const dif = item.diferencia ?? 0
                    return (
                      <tr key={item.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                          {item.fecha_cierre ? formatFecha(item.fecha_cierre) : '—'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {item.usuario?.nombre || 'Cajero'}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300">
                          {formatPrecio(item.monto_inicial)}
                        </td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-300 font-medium">
                          {formatPrecio(item.monto_final_sistema || 0)}
                        </td>
                        <td className="px-4 py-3 text-gray-900 dark:text-gray-100 font-medium">
                          {formatPrecio(item.monto_final_declarado || 0)}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex px-2 py-0.5 text-xs font-semibold rounded-full ${
                            dif === 0
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-400'
                              : dif > 0
                              ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-400'
                              : 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-400'
                          }`}>
                            {dif === 0 ? 'Exacto' : dif > 0 ? `+${formatPrecio(dif)}` : formatPrecio(dif)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSesionDetalle(item)}
                          >
                            Ver
                          </Button>
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

      {/* ── MODAL DE ARQUEO Y CIERRE DE CAJA ── */}
      <Modal
        isOpen={modalArqueoOpen}
        onClose={() => setModalArqueoOpen(false)}
        title="Arqueo y Cierre de Turno"
        size="md"
      >
        <div className="space-y-4">
          <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Fondo inicial de turno:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {formatPrecio(sesionActiva?.monto_inicial || 0)}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500 dark:text-gray-400">Efectivo por ventas cobradas:</span>
              <span className="font-semibold text-gray-900 dark:text-gray-100">
                {formatPrecio(resumenActivo?.total_efectivo || 0)}
              </span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between text-base font-bold">
              <span className="text-gray-800 dark:text-gray-200">Total en cajón esperado:</span>
              <span className="text-indigo-600 dark:text-indigo-400">
                {formatPrecio(efectivoEsperado)}
              </span>
            </div>
          </div>

          <div className="space-y-1">
            <Input
              label="Efectivo físico contado en el cajón *"
              type="number"
              min="0"
              step="100"
              placeholder="Ingresá el dinero real contado"
              value={efectivoContado}
              onChange={(e) => setEfectivoContado(e.target.value)}
              required
              autoFocus
            />
            <p className="text-xs text-gray-400 dark:text-gray-500">
              Contá todos los billetes y monedas que tenés en mano.
            </p>
          </div>

          {/* Cálculo de diferencia */}
          {efectivoContado !== '' && (
            <div className={`p-4 rounded-lg text-center ${
              diferenciaArqueo === 0
                ? 'bg-emerald-50 dark:bg-emerald-950/20 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                : diferenciaArqueo > 0
                ? 'bg-blue-50 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800'
                : 'bg-red-50 dark:bg-red-950/20 text-red-800 dark:text-red-300 border border-red-200 dark:border-red-800'
            }`}>
              <p className="text-xs font-semibold uppercase tracking-wider">
                {diferenciaArqueo === 0
                  ? 'Caja exacta'
                  : diferenciaArqueo > 0
                  ? 'Sobrante de caja'
                  : 'Faltante de caja'}
              </p>
              <p className="text-2xl font-bold mt-1">
                {diferenciaArqueo === 0
                  ? '$0'
                  : diferenciaArqueo > 0
                  ? `+${formatPrecio(diferenciaArqueo)}`
                  : formatPrecio(diferenciaArqueo)}
              </p>
            </div>
          )}

          <div className="flex gap-2 pt-2">
            <Button
              variant="danger"
              fullWidth
              loading={cerrando}
              disabled={efectivoContado === ''}
              onClick={handleConfirmarCierre}
            >
              Confirmar cierre de caja
            </Button>
            <Button
              variant="secondary"
              fullWidth
              disabled={cerrando}
              onClick={() => setModalArqueoOpen(false)}
            >
              Volver
            </Button>
          </div>
        </div>
      </Modal>

      {/* ── MODAL DE DETALLE DE ARQUEO HISTÓRICO ── */}
      <Modal
        isOpen={!!sesionDetalle}
        onClose={() => setSesionDetalle(null)}
        title="Detalle del Cierre de Caja"
        size="md"
      >
        {sesionDetalle && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Apertura</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {formatFecha(sesionDetalle.fecha_apertura)}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500 dark:text-gray-400">Cierre</p>
                <p className="font-medium text-gray-900 dark:text-gray-100">
                  {sesionDetalle.fecha_cierre ? formatFecha(sesionDetalle.fecha_cierre) : '—'}
                </p>
              </div>
            </div>

            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Fondo inicial:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrecio(sesionDetalle.monto_inicial)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Monto esperado por sistema:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrecio(sesionDetalle.monto_final_sistema || 0)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500 dark:text-gray-400">Monto contado en mano:</span>
                <span className="font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrecio(sesionDetalle.monto_final_declarado || 0)}
                </span>
              </div>
              <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-bold">
                <span className="text-gray-800 dark:text-gray-200">Diferencia final:</span>
                <span className={`${
                  (sesionDetalle.diferencia ?? 0) === 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : (sesionDetalle.diferencia ?? 0) > 0
                    ? 'text-blue-600 dark:text-blue-400'
                    : 'text-red-600 dark:text-red-400'
                }`}>
                  {(sesionDetalle.diferencia ?? 0) === 0
                    ? 'Exacto ($0)'
                    : (sesionDetalle.diferencia ?? 0) > 0
                    ? `+${formatPrecio(sesionDetalle.diferencia ?? 0)} (Sobrante)`
                    : `${formatPrecio(sesionDetalle.diferencia ?? 0)} (Faltante)`}
                </span>
              </div>
            </div>

            <Button
              variant="secondary"
              fullWidth
              onClick={() => setSesionDetalle(null)}
            >
              Cerrar
            </Button>
          </div>
        )}
      </Modal>
    </div>
  )
}
