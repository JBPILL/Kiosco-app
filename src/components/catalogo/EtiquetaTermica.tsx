import { BarcodeSvg } from '../../lib/barcodeSvg'
import { formatPrecio } from '../../lib/utils'
import type { Producto } from '../../types/database'
import './etiquetaTermica.css'

export type FormatoTermico = 'TERMICA_58' | 'TERMICA_80'

export const MEDIDAS_ETIQUETA_TERMICA = {
  TERMICA_58: { papel: 58, contenido: 48, alto: 40 },
  TERMICA_80: { papel: 80, contenido: 72, alto: 40 },
} as const

interface Props {
  producto: Producto
  formato: FormatoTermico
  kioscoNombre: string
  fecha: string
  mostrarNegocio: boolean
  mostrarCodigo: boolean
  mostrarFecha: boolean
}

/** Mismo contenido y geometría física para vista previa e impresión. */
export function EtiquetaTermica({ producto, formato, kioscoNombre, fecha, mostrarNegocio, mostrarCodigo, mostrarFecha }: Props) {
  const medidas = MEDIDAS_ETIQUETA_TERMICA[formato]
  const codigo = producto.codigo_barras || producto.id.slice(0, 8).toUpperCase()
  return (
    <article className="gondola-termica" style={{ width: `${medidas.contenido}mm`, height: `${medidas.alto}mm` }}>
      <div className="gondola-termica-negocio">{mostrarNegocio ? kioscoNombre : ''}</div>
      <div className="gondola-termica-descripcion" title={producto.descripcion}>{producto.descripcion}</div>
      <div className="gondola-termica-precio">
        {formatPrecio(producto.precio_venta)}
        {producto.es_pesable && producto.unidad_medida && <small>/{producto.unidad_medida}</small>}
      </div>
      <div className="gondola-termica-barcode">
        {mostrarCodigo && <><BarcodeSvg value={codigo} height={26} /><span>{codigo}</span></>}
      </div>
      <div className="gondola-termica-fecha">{mostrarFecha ? fecha : ''}</div>
    </article>
  )
}
