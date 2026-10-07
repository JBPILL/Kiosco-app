import { renderHook } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import type { CapacidadesOperativas, RubroComercio } from '../types/database'
import { useTenantConfig } from './useTenantConfig'

const sesion = vi.hoisted(() => ({ kiosco: { rubro: 'DIETETICA' as RubroComercio, nombre: 'Mi local',
  capacidades_operativas: undefined as Partial<CapacidadesOperativas> | undefined } }))
vi.mock('../stores/authStore', () => ({ useAuthStore: () => sesion }))

beforeEach(() => { sesion.kiosco.capacidades_operativas = undefined })

it.each([
  { rubro: 'DIETETICA' as const, label: 'Dietética y Almacén Natural', etiqueta: 'Dietética', balanza: true, lotes: true },
  { rubro: 'BAZAR' as const, label: 'Bazar y Regalería', etiqueta: 'Bazar', balanza: false, lotes: false },
])('adapta etiquetas y módulos del rubro $rubro', ({ rubro, label, etiqueta, balanza, lotes }) => {
  sesion.kiosco.rubro = rubro
  const { result } = renderHook(() => useTenantConfig())
  expect(result.current).toMatchObject({ rubro, nombreComercio: 'Mi local', tipoComercioLabel: label,
    etiquetaLocal: etiqueta, tieneEnvases: false, tieneBalanza: balanza, tieneVencimientos: lotes, tieneServiciosRapidos: false })
})

it('conserva las capacidades que el dueño eligió explícitamente', () => {
  sesion.kiosco.rubro = 'DIETETICA'
  sesion.kiosco.capacidades_operativas = { balanza: false, serviciosRapidos: true }
  const { result } = renderHook(() => useTenantConfig())
  expect(result.current.tieneBalanza).toBe(false)
  expect(result.current.tieneVencimientos).toBe(true)
  expect(result.current.tieneServiciosRapidos).toBe(true)
})
