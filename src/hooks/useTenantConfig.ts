import { useAuthStore } from '../stores/authStore'
import type { CapacidadesOperativas, RubroComercio } from '../types/database'

export function capacidadesPorDefecto(rubro?: RubroComercio): CapacidadesOperativas {
  return {
    envases: rubro === 'KIOSCO',
    balanza: rubro === 'KIOSCO' || rubro === 'PETSHOP_VETERINARIA' || rubro === 'DIETETICA',
    vencimientos: rubro === 'KIOSCO' || rubro === 'PETSHOP_VETERINARIA' || rubro === 'DIETETICA',
    serviciosRapidos: rubro === 'FOTOCOPIADORA_LIBRERIA',
  }
}

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
  const capacidades = { ...capacidadesPorDefecto(rubro), ...(kiosco?.capacidades_operativas || {}) }

  return {
    rubro,
    esFotocopiadora,
    esKiosco,
    esGeneral,
    // El rubro sugiere defaults; la capacidad persistida por comercio puede habilitar otros casos.
    tieneEnvases: capacidades.envases,
    // Los atributos por producto siguen determinando si el ítem se pesa.
    tieneBalanza: capacidades.balanza,
    // Lotes y fechas se activan independientemente del rubro.
    tieneVencimientos: capacidades.vencimientos,
    // Servicios directos de fotocopias, impresiones, anillados y plastificados
    tieneServiciosRapidos: capacidades.serviciosRapidos,
    // Textos adaptables para la interfaz
    nombreComercio: kiosco?.nombre || 'Comercio',
    tipoComercioLabel: rubro === 'PETSHOP_VETERINARIA' ? 'Pet Shop y Veterinaria'
      : rubro === 'DIETETICA' ? 'Dietética y Almacén Natural'
      : rubro === 'BAZAR' ? 'Bazar y Regalería'
      : rubro === 'ELECTRONICA_CELULARES' ? 'Electrónica y Celulares'
      : esFotocopiadora
      ? 'Fotocopiadora y Librería'
      : esGeneral
      ? 'Comercio General'
      : 'Kiosco y Almacén',
    etiquetaLocal: rubro === 'PETSHOP_VETERINARIA' ? 'Veterinaria'
      : rubro === 'DIETETICA' ? 'Dietética'
      : rubro === 'BAZAR' ? 'Bazar'
      : rubro === 'ELECTRONICA_CELULARES' ? 'Electrónica'
      : esFotocopiadora ? 'Librería' : esKiosco ? 'Kiosco' : 'Comercio',
  }
}
