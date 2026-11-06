import type { FiscalRequestData } from '../../../supabase/functions/_shared/fiscalReconciliation'
import { prepareFiscalPresentationFacts } from '../../../supabase/functions/_shared/fiscalPresentation'
import { freezeFiscalRequest } from '../../../supabase/functions/_shared/fiscalReconciliation'
import { wsfeSample } from './fiscalWsfe'
export async function fiscalRepresentationFixture(overrides:Partial<FiscalRequestData>={}){
 const sale=crypto.randomUUID(),operation=crypto.randomUUID(),detail=crypto.randomUUID(),actor=crypto.randomUUID(),frozen=await freezeFiscalRequest({...wsfeSample,...overrides})
 const facts=await prepareFiscalPresentationFacts({version:1,emisor:{razon_social:'Emisor histórico',domicilio_comercial:'Calle 1',ingresos_brutos:'Exento',inicio_actividades:'20200101'},receptor:{nombre:'Consumidor final',domicilio:'Sin identificar'},lineas:[{detalle_id:detail,descripcion:'Artículo con ajuste del ticket'}],otros_impuestos_nacionales_indirectos:'0.00'})
 const wire={version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',venta_id:sale,operacion_id:operation,condicion_emisor:'MONOTRIBUTO',condicion_receptor:'Condición histórica',
  constancia:{version:1,entorno:'HOMOLOGACION',estado:'AUTORIZADA',venta_id:sale,operacion_id:operation,solicitud:frozen,autorizacion:{cae:'11111111111111',vencimiento:'20261031',procesado_en:null}},
  hechos:{operacion_id:operation,venta_id:sale,solicitud_sha256:frozen.sha256,presentacion_sha256:facts.sha256,estado:'DATOS_REPRESENTACION_GUARDADOS',emision_habilitada:false,canonico:facts.canonico},
  contexto:{venta_id:sale,operacion_id:operation,solicitud_sha256:frozen.sha256,lineas:[{detalle_id:detail,cantidad:'2.000',precio_unitario:'100.00',subtotal:frozen.solicitud.importes.total}]}}
 return {sale,operation,actor,wire}
}
