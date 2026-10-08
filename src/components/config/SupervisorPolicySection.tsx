import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { consultarPoliticaSupervisor, configurarPoliticaSupervisor } from '../../lib/supervisorPolicyClient'
import type { PoliticaDescuentoSupervisor } from '../../lib/supervisorDiscountPolicy'
import { Button } from '../ui/Button'
import { RefreshButton } from '../ui/RefreshButton'

export function SupervisorPolicySection() {
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
    setEstado(null); setValor(''); setMensaje(null)
    if (usuario?.rol !== 'DUEÑO' || !usuario.activo) return
    setCargando(true)
    void consultarPoliticaSupervisor().then(politica => {
      if (solicitud !== secuencia.current) return
      setEstado({ contexto, politica }); setValor(String(politica.umbralPorcentaje))
    }).catch(() => {
      if (solicitud === secuencia.current) setMensaje({ contexto, texto: 'No se pudo consultar el umbral. Revisá la conexión y el SQL 36.' })
    }).finally(() => { if (solicitud === secuencia.current) setCargando(false) })
    return () => { secuencia.current++ }
  }, [contexto, recarga])

  const vigente = estado?.contexto === contexto
  const numero = Number(valor.replace(',', '.'))
  const valido = vigente && /^\d{1,3}([.,]\d{1,2})?$/.test(valor) && numero >= 0 && numero <= 100
  async function guardar(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!valido || cargando || enviando.current) return
    enviando.current = true; setGuardando(true); setMensaje(null)
    const solicitud = secuencia.current
    try {
      const politica = await configurarPoliticaSupervisor(numero)
      if (solicitud !== secuencia.current) return
      setEstado({ contexto, politica }); setValor(String(politica.umbralPorcentaje)); setMensaje({ contexto, texto: 'Umbral guardado' })
    } catch {
      if (solicitud === secuencia.current) setMensaje({ contexto, texto: 'No se confirmó el guardado. Actualizá para comprobar el valor vigente.' })
    } finally { enviando.current = false; setGuardando(false) }
  }
  if (usuario?.rol !== 'DUEÑO' || !usuario.activo) return null
  return <section className="rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 p-5 sm:p-6 shadow-xs">
    <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold dark:text-gray-100">Descuentos del cajero</h2><RefreshButton label="Actualizar umbral" refreshing={cargando} disabled={guardando} onClick={() => setRecarga(valor => valor + 1)} /></div>
    <form onSubmit={guardar} className="mt-4 space-y-3">
      <label className="block text-xs font-semibold text-gray-700 dark:text-gray-300">Porcentaje máximo sin PIN
        <div className="mt-1.5 flex items-center gap-3"><input aria-label="Porcentaje máximo sin PIN" inputMode="decimal" value={vigente ? valor : ''} disabled={!vigente || cargando || guardando} onChange={event => setValor(event.target.value)} className="w-28 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900/50 px-3 py-2.5 text-sm dark:text-gray-100" /><span>%</span>
          <Button type="submit" size="sm" loading={guardando} disabled={!valido || cargando}>Guardar umbral</Button></div>
      </label>
      <p className="text-[11px] text-gray-500">Los descuentos superiores requieren PIN. Los cobros preparados conservan su regla original.</p>
      <p role="status" className="text-xs text-gray-500">{mensaje?.contexto === contexto ? mensaje.texto : ''}</p>
    </form>
  </section>
}
