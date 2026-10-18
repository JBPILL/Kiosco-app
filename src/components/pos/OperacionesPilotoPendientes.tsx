import { liveQuery } from 'dexie'
import { useEffect, useRef, useState } from 'react'
import { useAuthStore } from '../../stores/authStore'
import { Button } from '../ui/Button'
import { formatPrecio } from '../../lib/utils'
import { cashReturnOutbox, confirmarEntregaPiloto, contextoOperacionPiloto, envasesOutbox, ejecutarDevolucionEfectivo, ejecutarOperacionEnvase, type ContextoOperacionPiloto } from '../../lib/pilotOperationClient'
import type { OperacionEnvaseLocal } from '../../lib/envasesOutbox'
import type { OperacionPilotoLocal } from '../../lib/durablePilotOperationOutbox'
import type { ResultadoDevolucionEfectivo, SolicitudDevolucionEfectivo } from '../../lib/cashReturnOutbox'

type Fila = { tipo: 'ENVASES'; op: OperacionEnvaseLocal }
  | { tipo: 'DEVOLUCION'; op: OperacionPilotoLocal<SolicitudDevolucionEfectivo, ResultadoDevolucionEfectivo> }

/** Recovery deliberately remains accessible after a feature flag is disabled. */
export function OperacionesPilotoPendientes() {
  const usuario = useAuthStore(state => state.usuario)
  if (!usuario?.activo || !usuario.kiosco_id || !usuario.auth_user_id || usuario.rol === 'VISOR') return null
  const contexto = { kioscoId: usuario.kiosco_id, usuarioId: usuario.id, authId: usuario.auth_user_id }
  return <PendientesDelUsuario key={`${contexto.kioscoId}:${contexto.usuarioId}:${contexto.authId}`} contexto={contexto} />
}

function PendientesDelUsuario({ contexto }: { contexto: ContextoOperacionPiloto }) {
  const [filas, setFilas] = useState<Fila[]>([])
  const [error, setError] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const ocupadoRef = useRef(false)
  const vigente = useRef(true)
  useEffect(() => {
    vigente.current = true
    const observador = liveQuery(async (): Promise<Fila[]> => {
      const [envases, devoluciones] = await Promise.all([
        envasesOutbox.recuperables(contexto.kioscoId, contexto.usuarioId),
        cashReturnOutbox.recuperables(contexto.kioscoId, contexto.usuarioId),
      ])
      return [...envases.map(op => ({ tipo: 'ENVASES' as const, op })), ...devoluciones.map(op => ({ tipo: 'DEVOLUCION' as const, op }))]
    }).subscribe({
      next: datos => { if (vigente.current) setFilas(datos) },
      error: () => { if (vigente.current) setError('No se pudieron consultar los reintegros guardados en este dispositivo.') },
    })
    return () => { vigente.current = false; observador.unsubscribe() }
  }, [contexto.kioscoId, contexto.usuarioId])

  async function resolver(fila: Fila, entrega: boolean) {
    if (ocupadoRef.current) return
    ocupadoRef.current = true; setOcupado(true); setError('')
    try {
      const actual = contextoOperacionPiloto()
      if (JSON.stringify(actual) !== JSON.stringify(contexto)) throw new Error('Cambió la sesión. Ingresá con el usuario original.')
      if (entrega) await confirmarEntregaPiloto(contexto, fila.tipo, fila.op.id)
      else if (fila.tipo === 'ENVASES') await ejecutarOperacionEnvase(contexto, fila.op.solicitud)
      else await ejecutarDevolucionEfectivo(contexto, fila.op.solicitud)
    } catch (e) {
      if (vigente.current) setError(e instanceof Error ? e.message : 'No se pudo recuperar la operación.')
    } finally {
      ocupadoRef.current = false
      if (vigente.current) setOcupado(false)
    }
  }

  if (!filas.length && !error) return null
  return <section aria-label="Reintegros y envases pendientes" className="mx-3 my-2 rounded-xl border border-amber-500/60 bg-amber-50 p-4 text-gray-900 dark:bg-gray-900 dark:text-gray-100 space-y-3">
    <h2 className="font-bold">Operaciones que necesitan revisión</h2>
    <p className="text-sm">Recuperar consulta la operación original. No genera otro reintegro. Antes de entregar dinero, comprobá si ya se pagó al cliente.</p>
    {error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>}
    {filas.map(fila => <div key={`${fila.tipo}:${fila.op.id}`} className="rounded-lg border border-amber-500/40 p-3 space-y-2">
      <p className="font-semibold">{fila.tipo === 'ENVASES' ? 'Recepción u operación de envases' : 'Devolución de venta'} · {fila.op.id.slice(-8)}</p>
      {fila.op.estado === 'CONFIRMADO' && fila.op.resultado ? <>
        <p>Registrado en caja: <strong>{formatPrecio(fila.tipo === 'ENVASES' ? fila.op.resultado?.importe ?? 0 : fila.op.resultado?.monto_total ?? 0)}</strong>.</p>
        <p className="text-sm">Verificá la entrega anterior. Si ya se entregó, no vuelvas a pagar. Esta marca se conserva sólo en este dispositivo.</p>
        <Button size="sm" disabled={ocupado} onClick={() => void resolver(fila, true)}>Ya verifiqué la entrega de efectivo</Button>
      </> : <>
        <p className="text-sm">Respuesta pendiente. No entregues efectivo hasta recuperar la confirmación.</p>
        <Button size="sm" disabled={ocupado} onClick={() => void resolver(fila, false)}>Recuperar operación original</Button>
      </>}
    </div>)}
  </section>
}
