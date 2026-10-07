import { CATALOGO_MAESTRO_ARGENTINO, type ProductoMaestro } from './catalogoMaestroArgentino'
import { CATALOGO_MAESTRO_LIBRERIA } from './catalogoMaestroLibreria'
import { CATALOGO_MAESTRO_VETERINARIA } from './catalogoMaestroVeterinaria'
import { CATALOGO_MAESTRO_ELECTRONICA } from './catalogoMaestroElectronica'
import { CATALOGO_MAESTRO_DIETETICA } from './catalogoMaestroDietetica'
import { CATALOGO_MAESTRO_BAZAR } from './catalogoMaestroBazar'
import type { RubroComercio } from '../types/database'

export function obtenerCatalogoPorRubro(rubro: RubroComercio): ProductoMaestro[] {
  if (rubro === 'PETSHOP_VETERINARIA') return CATALOGO_MAESTRO_VETERINARIA
  if (rubro === 'ELECTRONICA_CELULARES') return CATALOGO_MAESTRO_ELECTRONICA
  if (rubro === 'DIETETICA') return CATALOGO_MAESTRO_DIETETICA
  if (rubro === 'BAZAR') return CATALOGO_MAESTRO_BAZAR
  return rubro === 'FOTOCOPIADORA_LIBRERIA' ? CATALOGO_MAESTRO_LIBRERIA : CATALOGO_MAESTRO_ARGENTINO
}
export function esCatalogoPlantilla(rubro: RubroComercio): boolean {
  return rubro === 'PETSHOP_VETERINARIA' || rubro === 'ELECTRONICA_CELULARES' || rubro === 'DIETETICA' || rubro === 'BAZAR'
}
