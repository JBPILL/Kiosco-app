export type TipoIdentificador = 'SERIE' | 'IMEI'
export type EstadoReparacion = 'RECIBIDA' | 'DIAGNOSTICO' | 'PRESUPUESTADA' | 'AUTORIZADA' | 'EN_REPARACION' | 'LISTA' | 'ENTREGADA' | 'CANCELADA'
export interface UnidadElectronica {
  id: string
  kiosco_id: string
  detalle_venta_id: string
  venta_id: string
  producto_id: string
  tipo_identificador: TipoIdentificador
  identificador: string
  garantia_hasta: string | null
  condiciones_garantia: string | null
  fecha_creacion: string
  venta_estado: 'COMPLETADA' | 'ANULADA'
  venta_fecha: string
}
export interface DatosReparacion {
  cliente_nombre: string
  cliente_contacto: string | null
  equipo: string
  identificador: string | null
  informe_falla: string
  diagnostico: string | null
  estado: EstadoReparacion
  presupuesto: number | null
}
export interface ReparacionElectronica extends DatosReparacion {
  id: string
  kiosco_id: string
  fecha_ingreso: string
  version: number
}
export interface RegistroUnidad {
  detalleVentaId: string
  tipo: TipoIdentificador
  identificador: string
  garantiaHasta: string | null
  condiciones: string | null
}
export interface DetalleVentaElectronica {
  id: string
  producto_id: string
  cantidad: number
  producto: { descripcion: string; es_pesable?: boolean; es_combo?: boolean } | null
}
export interface VentaElectronica {
  id: string
  fecha_hora: string
  estado: 'COMPLETADA' | 'ANULADA'
  sincronizado: boolean
  detalles: DetalleVentaElectronica[]
}
