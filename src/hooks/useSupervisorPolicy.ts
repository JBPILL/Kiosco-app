import { useEffect, useState } from 'react'
import { consultarPoliticaSupervisor } from '../lib/supervisorPolicyClient'
import type { PoliticaDescuentoSupervisor } from '../lib/supervisorDiscountPolicy'

export function useSupervisorPolicy(activo: boolean, contexto: string) {
  const [recarga, setRecarga] = useState(0)
  const [resultado, setResultado] = useState<{ contexto: string; politica: PoliticaDescuentoSupervisor | null; error: boolean } | null>(null)
  useEffect(() => {
    let vigente = true
    setResultado(null)
    if (!activo) return
    void consultarPoliticaSupervisor().then(politica => {
      if (vigente) setResultado({ contexto, politica, error: false })
    }).catch(() => {
      if (vigente) setResultado({ contexto, politica: null, error: true })
    })
    return () => { vigente = false }
  }, [activo, contexto, recarga])
  const coincide = activo && resultado?.contexto === contexto
  return { politica: coincide ? resultado.politica : null,
    cargando: activo && !coincide, error: coincide && resultado.error,
    reintentar: () => { setResultado(null); setRecarga(valor => valor + 1) } }
}
