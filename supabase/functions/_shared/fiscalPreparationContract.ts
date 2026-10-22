// DTO público sin claves/custodia. Los campos de identidad e importe de venta
// pertenecen al contexto verificado del servidor, nunca al formulario editable.
import type { FiscalRequestData } from './fiscalReconciliation.ts'

export type FiscalIssuerCondition='MONOTRIBUTO'|'RESPONSABLE_INSCRIPTO'|'EXENTO'
export interface FiscalPreparationInput {
 condicionEmisor:FiscalIssuerCondition
 datos:Pick<FiscalRequestData,'tipoComprobante'|'concepto'|'tipoDocumento'|'numeroDocumento'|'condicionIvaReceptor'|'fecha'|'servicioDesde'|'servicioHasta'|'vencimientoPago'|'moneda'|'cotizacion'|'iva'|'tributos'> & {
  importes:Omit<FiscalRequestData['importes'],'total'>
 }
}
export interface FiscalPreparationContext {
 version:1
 venta_id:string
 total:string
 cuit_emisor:string
 punto_venta:number
 incluye_recepcion_envases:boolean
 revision_parametros:number
 condiciones:readonly {id:number;descripcion:string;comprobantes:readonly number[]}[]
 alicuotas:readonly {id:number;descripcion:string}[]
}
export interface FiscalSaleResolution {
 venta_id:string
 estado:'SIN_PREPARACION'|'NO_DISPONIBLE'|'REGISTRO_FISCAL_HEREDADO'|'REQUIERE_REVISION'|'DATOS_PREPARADOS'|'RESERVADA'|'ENVIO_INCIERTO'|'AUTORIZADA'
 operacion_id:string|null
 preparacion_sha256:string|null
 emision_habilitada:false
}
