// Tipos y modelos para Facturación Electrónica AFIP (WSFEv1)

export type CondicionIva = 'MONOTRIBUTO' | 'RESPONSABLE_INSCRIPTO' | 'EXENTO'
export type CondicionIvaAFIP = CondicionIva

export type EntornoAFIP = 'HOMOLOGACION' | 'PRODUCCION'

export type TipoComprobanteAFIP =
  | 11 // Factura C (Monotributo a Consumidor Final / Responsable)
  | 13 // Nota de Crédito C
  | 6  // Factura B (Responsable Inscripto a Consumidor Final)
  | 8  // Nota de Crédito B
  | 1  // Factura A (Responsable Inscripto a Responsable Inscripto)
  | 3  // Nota de Crédito A

export type TipoDocumentoCliente =
  | 99 // Consumidor Final (Doc 0)
  | 96 // DNI
  | 80 // CUIT
  | 86 // CUIL
  | 94 // Pasaporte

export type TipoDocumentoAFIP = TipoDocumentoCliente

export interface ConfiguracionAFIP {
  habilitado: boolean
  cuit: string
  razon_social: string
  condicion_iva: CondicionIva
  punto_venta: number
  iibb?: string | null
  inicio_actividades?: string | null
  entorno: EntornoAFIP
  certificado_crt?: string | null
  clave_privada_key?: string | null
  facturar_automatico: boolean
  monto_minimo_auto: number
  ultimo_nro_comprobante?: number
}

export interface ComprobanteAFIPResult {
  cae: string
  vto_cae: string
  tipo_comprobante: TipoComprobanteAFIP
  letra: 'C' | 'B' | 'A'
  punto_venta: number
  nro_comprobante: number
  cuit_emisor: string
  razon_social: string
  condicion_iva: string
  iibb?: string | null
  inicio_actividades?: string | null
  tipo_doc_cliente: TipoDocumentoCliente
  nro_doc_cliente: string
  nombre_cliente?: string | null
  total: number
  fecha_emision: string
  qr_url: string
  es_homologacion: boolean
}
