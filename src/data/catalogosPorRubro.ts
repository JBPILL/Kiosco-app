import { CATALOGO_MAESTRO_ARGENTINO, type ProductoMaestro } from './catalogoMaestroArgentino'
import { CATALOGO_MAESTRO_LIBRERIA } from './catalogoMaestroLibreria'
import { CATALOGO_MAESTRO_VETERINARIA } from './catalogoMaestroVeterinaria'
import { CATALOGO_MAESTRO_ELECTRONICA } from './catalogoMaestroElectronica'
import type { RubroComercio } from '../types/database'

export function obtenerCatalogoPorRubro(rubro: RubroComercio): ProductoMaestro[] {
  if (rubro === 'PETSHOP_VETERINARIA') return CATALOGO_MAESTRO_VETERINARIA
  if (rubro === 'ELECTRONICA_CELULARES') return CATALOGO_MAESTRO_ELECTRONICA
  return rubro === 'FOTOCOPIADORA_LIBRERIA' ? CATALOGO_MAESTRO_LIBRERIA : CATALOGO_MAESTRO_ARGENTINO
}
export function esCatalogoPlantilla(rubro: RubroComercio): boolean {
  return rubro === 'PETSHOP_VETERINARIA' || rubro === 'ELECTRONICA_CELULARES'
}
