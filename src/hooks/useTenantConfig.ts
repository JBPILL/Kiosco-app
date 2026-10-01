import { useAuthStore } from '../stores/authStore'
import type { RubroComercio } from '../types/database'

export interface TenantConfig {
  rubro: RubroComercio
  esFotocopiadora: boolean
  esKiosco: boolean
  esGeneral: boolean
  // Capacidades y módulos disponibles según el rubro
  tieneEnvases: boolean
  tieneBalanza: boolean
  tieneVencimientos: boolean
  tieneServiciosRapidos: boolean
  // Textos y etiquetas adaptadas
  nombreComercio: string
  tipoComercioLabel: string
  etiquetaLocal: string
}

export function useTenantConfig(): TenantConfig {
  const { kiosco } = useAuthStore()

  const rubro: RubroComercio = kiosco?.rubro || 'KIOSCO'
  const esFotocopiadora = rubro === 'FOTOCOPIADORA_LIBRERIA'
  const esKiosco = rubro === 'KIOSCO'
  const esGeneral = rubro === 'GENERAL'

  return {
    rubro,
    esFotocopiadora,
    esKiosco,
    esGeneral,
    // Envases retornables: exclusivo de kioscos/minimercados (cervezas, gaseosas)
    tieneEnvases: esKiosco,
    // Balanza para pesables: fiambres, quesos, verduras (no aplica a librería)
    tieneBalanza: esKiosco,
    // Lotes y fechas de caducidad para perecederos (no aplica a papelería y útiles)
    tieneVencimientos: esKiosco,
    // Servicios directos de fotocopias, impresiones, anillados y plastificados
    tieneServiciosRapidos: esFotocopiadora,
    // Textos adaptables para la interfaz
    nombreComercio: kiosco?.nombre || 'Comercio',
    tipoComercioLabel: esFotocopiadora
      ? 'Fotocopiadora y Librería'
      : esGeneral
      ? 'Comercio General'
      : 'Kiosco y Almacén',
    etiquetaLocal: esFotocopiadora ? 'Librería' : esKiosco ? 'Kiosco' : 'Comercio',
  }
}
