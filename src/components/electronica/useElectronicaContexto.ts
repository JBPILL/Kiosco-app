import { useCallback, useEffect, useRef } from 'react'
import { v4 as uuidv4 } from 'uuid'
import { useAuthStore } from '../../stores/authStore'

export function identidadElectronica(): string {
  const { usuario, kiosco } = useAuthStore.getState()
  return JSON.stringify([usuario?.id, usuario?.rol, usuario?.kiosco_id, kiosco?.id, kiosco?.rubro])
}
export function useElectronicaContexto(identidad: string): () => boolean {
  const montado = useRef(true)
  useEffect(() => { montado.current = true; return () => { montado.current = false } }, [])
  return useCallback(() => montado.current && identidadElectronica() === identidad, [identidad])
}
/** Cada cambio del formulario renueva la solicitud; reintentar el mismo conserva su UUID. */
export function useSolicitudElectronica(firma: string): string {
  const solicitud = useRef<{ firma: string; id: string } | null>(null)
  if (solicitud.current?.firma !== firma) solicitud.current = { firma, id: uuidv4() }
  return solicitud.current.id
}
