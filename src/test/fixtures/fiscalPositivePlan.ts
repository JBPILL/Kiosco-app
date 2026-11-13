import { createHash, randomUUID } from 'node:crypto'
const hash=(v:string)=>createHash('sha256').update(v).digest('hex')
export function positivePlanFixture(catalogRevision=2){
  const ownerAuthId=randomUUID(),kioskId=randomUUID(),saleId=randomUUID()
  const snapshot={read_only:'on',observed_at:'2026-10-28T07:20:00Z',
    owner:{auth_user_id:ownerAuthId,kiosco_id:kioskId,rol:'DUEÑO',activo:true,es_superadmin:false},kiosk_active:true,
    sale:{id:saleId,kiosco_id:kioskId,estado:'COMPLETADA',fecha_hora:'2026-10-26T15:34:50Z',total:'200.00',has_legacy_cae:false},
    details:[{id:randomUUID(),producto_id:randomUUID(),cantidad:1,precio_unitario:200,subtotal:200,es_devolucion_envase:false}],returns:0,operations:0,
    issuer:{kiosco_id:kioskId,cuit_emisor:'20123456786',punto_venta:2,credencial_id:randomUUID(),certificado_sha256:'a'.repeat(64),revision:1,habilitado:false,actualizado_en:'2026-10-28T01:00:00Z'},
    catalog:{revision:catalogRevision,condiciones:[{id:5,descripcion:'Synthetic final',comprobantes:[11]}],alicuotas:[],fuente_sha256:'b'.repeat(64),consultado_en:'2026-10-28T03:06:15Z',vence_en:'2026-10-29T02:59:00Z',habilitado:false}}
  const snapshotText=JSON.stringify(snapshot)
  const config={projectRef:'acoyfwwmhaeruciyedri',snapshotText,snapshotSha256:hash(snapshotText),ownerAuthId,kioskId,operationId:randomUUID(),catalogRevision,
    invoice:{condicionEmisor:'MONOTRIBUTO',datos:{tipoComprobante:11,concepto:1,tipoDocumento:99,numeroDocumento:'0',condicionIvaReceptor:5,fecha:'20261028',servicioDesde:null,servicioHasta:null,vencimientoPago:null,moneda:'PES',cotizacion:'1',importes:{neto:'200.00',iva:'0.00',noGravado:'0.00',exento:'0.00',tributos:'0.00'},iva:[],tributos:[]}},
    now:'2026-10-28T07:30:00.000Z',startsAt:'2026-10-28T15:10:00.000Z',endsAt:'2026-10-28T15:25:00.000Z',taNotBefore:'2026-10-28T15:06:15.411Z'}
  return {config,snapshot}
}
