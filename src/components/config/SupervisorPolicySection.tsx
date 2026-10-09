import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { consultarPoliticaSupervisor, configurarPoliticaSupervisor } from '../../lib/supervisorPolicyClient'
import type { PoliticaDescuentoSupervisor } from '../../lib/supervisorDiscountPolicy'
import { Button } from '../ui/Button'
import { RefreshButton } from '../ui/RefreshButton'
import { Percent } from './ConfigIcons'

export interface SupervisorPolicySectionProps {
  recargaTrigger?: number
  mostrarBotonRefresco?: boolean
}

export function SupervisorPolicySection({
  recargaTrigger = 0,
  mostrarBotonRefresco = false,
}: SupervisorPolicySectionProps = {}) {
  const usuario = useAuthStore(state => state.usuario)
  const contexto = JSON.stringify([usuario?.id, usuario?.auth_user_id, usuario?.kiosco_id, usuario?.rol, usuario?.activo])
  const [estado, setEstado] = useState<{ contexto: string; politica: PoliticaDescuentoSupervisor } | null>(null)
  const [valor, setValor] = useState('')
  const [mensaje, setMensaje] = useState<{ contexto: string; texto: string } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [recarga, setRecarga] = useState(0)
  const secuencia = useRef(0)
  const enviando = useRef(false)

  useEffect(() => {
    const solicitud = ++secuencia.current
    setEstado(null)
    setValor('')
    setMensaje(null)
    if (usuario?.rol !== 'DUEÑO' || !usuario.activo) return
    setCargando(true)
    void consultarPoliticaSupervisor().then(politica => {
      if (solicitud !== secuencia.current) return
      setEstado({ contexto, politica })
      setValor(String(politica.umbralPorcentaje))
    }).catch(() => {
      if (solicitud === secuencia.current) setMensaje({ contexto, texto: 'No se pudo consultar el umbral. Revisá la conexión y el SQL 36.' })
    }).finally(() => {
      if (solicitud === secuencia.current) setCargando(false)
    })
    return () => { secuencia.current++ }
  }, [contexto, recarga, recargaTrigger])

  const vigente = estado?.contexto === contexto
  const numero = Number(valor.replace(',', '.'))
  const valido = vigente && /^\d{1,3}([.,]\d{1,2})?$/.test(valor) && numero >= 0 && numero <= 100

  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valido || cargando || enviando.current) return
    enviando.current = true
    setGuardando(true)
    setMensaje(null)
    const solicitud = secuencia.current
    try {
      const politica = await configurarPoliticaSupervisor(numero)
      if (solicitud !== secuencia.current) return
      setEstado({ contexto, politica })
      setValor(String(politica.umbralPorcentaje))
      setMensaje({ contexto, texto: 'Umbral guardado' })
    } catch {
      if (solicitud === secuencia.current) setMensaje({ contexto, texto: 'No se confirmó el guardado. Actualizá para comprobar el valor vigente.' })
    } finally {
      enviando.current = false
      setGuardando(false)
    }
  }

  if (usuario?.rol !== 'DUEÑO' || !usuario.activo) return null

  const opcionesRapidas = [5, 10, 15, 20, 25]

  return (
    <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-xs space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-3 border-b border-gray-100 dark:border-gray-700/60">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-amber-50 dark:bg-amber-950/40 p-2.5 text-amber-600 dark:text-amber-400 border border-amber-100 dark:border-amber-900/50">
            <Percent size={20} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-sm font-bold text-gray-900 dark:text-gray-100">Descuentos del cajero</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Límite porcentual que un cajero puede aplicar libremente sin requerir PIN de supervisor.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {vigente && (
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200/60 dark:border-indigo-800/50">
              Umbral activo: {valor}%
            </span>
          )}
          {mostrarBotonRefresco && (
            <RefreshButton
              label="Actualizar umbral"
              refreshing={cargando}
              disabled={guardando}
              onClick={() => setRecarga(v => v + 1)}
            />
          )}
        </div>
      </div>

      <form onSubmit={guardar} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
            Porcentaje máximo sin PIN
          </label>

          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mr-1">Valores sugeridos:</span>
            {opcionesRapidas.map((pct) => (
              <button
                key={pct}
                type="button"
                disabled={!vigente || cargando || guardando}
                onClick={() => setValor(String(pct))}
                className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all border ${
                  String(pct) === valor
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                    : 'bg-gray-50 dark:bg-gray-900/40 hover:bg-gray-100 dark:hover:bg-gray-700/60 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-36">
              <input
                aria-label="Porcentaje máximo sin PIN"
                inputMode="decimal"
                value={vigente ? valor : ''}
                disabled={!vigente || cargando || guardando}
                onChange={event => setValor(event.target.value)}
                placeholder="15"
                className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 pl-3.5 pr-8 py-2 text-sm dark:text-gray-100 font-semibold outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 dark:text-gray-500 pointer-events-none">
                %
              </span>
            </div>

            <Button
              type="submit"
              size="sm"
              loading={guardando}
              disabled={!valido || cargando}
              className="shadow-xs font-semibold"
            >
              Guardar umbral
            </Button>
          </div>
        </div>

        <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
          Los descuentos superiores requieren PIN. Los cobros preparados conservan su regla original.
        </p>

        {mensaje?.contexto === contexto && (
          <p
            role="status"
            className={`text-xs ${
              mensaje.texto.includes('guardado')
                ? 'text-emerald-600 dark:text-emerald-400 font-semibold'
                : 'text-amber-600 dark:text-amber-400 font-medium'
            }`}
          >
            {mensaje.texto}
          </p>
        )}
      </form>
    </section>
  )
}

