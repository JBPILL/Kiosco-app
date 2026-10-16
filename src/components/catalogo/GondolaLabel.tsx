import type { Producto } from '../../types/database'
import { BarcodeSvg } from '../../lib/barcodeSvg'
import { formatPrecio } from '../../lib/utils'
import './gondola-label.css'

export type FormatoEtiqueta = 'A4' | 'TERMICA_58' | 'TERMICA_80'
export const LABEL_DIMENSIONS: Record<FormatoEtiqueta, { width: number; height: number }> = {
  A4: { width: 65, height: 33 },
  TERMICA_58: { width: 54, height: 40 },
  TERMICA_80: { width: 76, height: 40 },
}
interface GondolaLabelProps {
  producto: Producto
  formato: FormatoEtiqueta
  negocio: string
  fecha: string
  mostrarCodigo: boolean
  mostrarNegocio: boolean
  mostrarFecha: boolean
}

/** The same physical card is used for preview and print; hidden options reserve their rows. */
export function GondolaLabel({ producto, formato, negocio, fecha, mostrarCodigo, mostrarNegocio, mostrarFecha }: GondolaLabelProps) {
  const dimensions = LABEL_DIMENSIONS[formato]
  const codigo = producto.codigo_barras || producto.id.slice(0, 8).toUpperCase()
  return (
    <div data-label-paper data-formato={formato} className="gondola-label"
      style={{ width: `${dimensions.width}mm`, height: `${dimensions.height}mm` }}>
      <div className="gondola-label-header" data-label-hidden={!mostrarNegocio} style={{ visibility: mostrarNegocio ? 'visible' : 'hidden' }}>{negocio}</div>
      <div className="gondola-label-name" title={producto.descripcion}>{producto.descripcion}</div>
      <div className="gondola-label-price">
        {formatPrecio(producto.precio_venta)}
        {producto.es_pesable && producto.unidad_medida && <span className="gondola-label-unit">/{producto.unidad_medida}</span>}
      </div>
      <div className="gondola-label-barcode" data-label-hidden={!mostrarCodigo} style={{ visibility: mostrarCodigo ? 'visible' : 'hidden' }}>
        <BarcodeSvg value={codigo} height={24} />
        <span>{codigo}</span>
      </div>
      <div className="gondola-label-date" data-label-hidden={!mostrarFecha} style={{ visibility: mostrarFecha ? 'visible' : 'hidden' }}>{fecha}</div>
    </div>
  )
}
