// Offline proposal only. No credentials, HTTP, RPC, database connection or activation.
import { createHash } from 'node:crypto'
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareFiscalData } from '../supabase/functions/_shared/fiscalPreparation.ts'
import { CUSTODY_PROJECT, CLOSED_FISCAL_FLAGS } from './fiscal-custody-plan.mjs'

const fail = () => { throw Error('POSITIVE_ACCEPTANCE_PROPOSAL_REJECTED') }
const hash = text => createHash('sha256').update(text).digest('hex')
// Existing PostgreSQL UUIDs need not have been produced by randomUUID (v4).
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || Object.keys(value).length !== keys.length || keys.some(k => !Object.hasOwn(value, k))) return fail()
}
function time(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,7})?(?:Z|\+00:00)$/.test(value)
    || !Number.isFinite(Date.parse(value))) return fail()
  return Date.parse(value)
}
function businessDay(value) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(value)
  return ['year','month','day'].map(k => parts.find(p => p.type === k).value).join('')
}
/** The snapshot is review material, never authority to activate or bypass live checks. */
export async function planFiscalPositiveAcceptance(input) {
  try {
    exact(input, ['projectRef','snapshotText','snapshotSha256','ownerAuthId','kioskId','operationId','invoice','now','startsAt','endsAt','taNotBefore','catalogRevision'])
    if (input.projectRef !== CUSTODY_PROJECT || ![input.ownerAuthId,input.kioskId,input.operationId].every(uuid)
      || !Number.isSafeInteger(input.catalogRevision) || input.catalogRevision < 2 || input.catalogRevision > 2147483647
      || typeof input.snapshotText !== 'string' || Buffer.byteLength(input.snapshotText) > 65536
      || hash(input.snapshotText) !== input.snapshotSha256) return fail()
    const snapshot = JSON.parse(input.snapshotText)
    exact(snapshot, ['read_only','observed_at','owner','kiosk_active','sale','details','returns','operations','issuer','catalog'])
    const now=time(input.now),start=time(input.startsAt),end=time(input.endsAt),notBefore=time(input.taNotBefore)
    if (start < now || end <= start || end-start > 900000 || start <= notBefore
      || time(snapshot.observed_at) > now || snapshot.read_only !== 'on') return fail()
    const {owner,sale,issuer,catalog,details}=snapshot
    exact(owner,['auth_user_id','kiosco_id','rol','activo','es_superadmin'])
    exact(sale,['id','kiosco_id','estado','fecha_hora','total','has_legacy_cae'])
    exact(issuer,['kiosco_id','cuit_emisor','punto_venta','credencial_id','certificado_sha256','revision','habilitado','actualizado_en'])
    exact(catalog,['revision','condiciones','alicuotas','fuente_sha256','consultado_en','vence_en','habilitado'])
    if (owner.auth_user_id !== input.ownerAuthId || owner.kiosco_id !== input.kioskId || owner.rol !== 'DUEÑO'
      || owner.activo !== true || owner.es_superadmin !== false || snapshot.kiosk_active !== true
      || !uuid(sale.id) || sale.kiosco_id !== input.kioskId || sale.estado !== 'COMPLETADA' || sale.has_legacy_cae !== false
      || typeof sale.total !== 'string' || !/^\d{1,10}\.\d{2}$/.test(sale.total) || Number(sale.total) <= 0
      || snapshot.returns !== 0 || snapshot.operations !== 0
      || issuer.kiosco_id !== input.kioskId || issuer.revision !== 1 || issuer.habilitado !== false
      || !uuid(issuer.credencial_id) || !/^[0-9a-f]{64}$/.test(issuer.certificado_sha256)
      || catalog.revision !== input.catalogRevision || catalog.habilitado !== false || time(catalog.consultado_en)>now || end>time(catalog.vence_en)
      || !Array.isArray(details) || details.length < 1 || details.length > 100) return fail()
    for (const line of details) {
      exact(line,['id','producto_id','cantidad','precio_unitario','subtotal','es_devolucion_envase'])
      if (!uuid(line.id) || !uuid(line.producto_id) || !Number.isSafeInteger(line.cantidad) || line.cantidad<1
        || !Number.isFinite(line.subtotal) || line.subtotal<0 || !Number.isFinite(line.precio_unitario)
        || line.precio_unitario<0 || line.es_devolucion_envase !== false) return fail()
    }
    if (new Set(details.map(d=>d.id)).size!==details.length
      || details.reduce((sum,d)=>sum+Math.round(d.subtotal*100),0)!==Math.round(Number(sale.total)*100)) return fail()
    const invoice=structuredClone(input.invoice)
    // These choices are explicit review inputs for this pilot, not legacy defaults.
    if (invoice?.condicionEmisor!=='MONOTRIBUTO' || invoice.datos?.tipoComprobante!==11
      || invoice.datos.condicionIvaReceptor!==5 || invoice.datos.concepto!==1
      || invoice.datos.tipoDocumento!==99 || invoice.datos.numeroDocumento!=='0'
      || invoice.datos.fecha!==businessDay(start) || businessDay(end-1)!==businessDay(start)) return fail()
    const context={version:1,venta_id:sale.id,total:sale.total,cuit_emisor:issuer.cuit_emisor,punto_venta:issuer.punto_venta,
      incluye_recepcion_envases:false,revision_parametros:catalog.revision,condiciones:catalog.condiciones,alicuotas:catalog.alicuotas}
    const prepared=await prepareFiscalData(context,invoice)
    const requests=[
      {accion:'RESOLVER_VENTA',venta_id:sale.id},
      {accion:'DATOS_FISCALES_VENTA',venta_id:sale.id},
      {accion:'GUARDAR_DATOS_FISCALES',venta_id:sale.id,operacion_id:input.operationId,entrada:invoice},
      {accion:'PREPARAR_COMPROBANTE',operacion_id:input.operationId},
      {accion:'REVISAR_COMPROBANTE',operacion_id:input.operationId},
    ]
    const manifest={version:1,projectRef:CUSTODY_PROJECT,ownerAuthId:input.ownerAuthId,kioskId:input.kioskId,saleId:sale.id,
      operationId:input.operationId,createdAt:new Date(now).toISOString(),startsAt:input.startsAt,endsAt:input.endsAt,
      taNotBefore:input.taNotBefore,snapshotSha256:input.snapshotSha256,invoiceSha256:hash(JSON.stringify(invoice)),
      preparedSha256:prepared.sha256,requestsSha256:hash(JSON.stringify(requests)),issuerRevision:1,catalogRevision:input.catalogRevision,
      flagsForData:['ARCA_HOMO_BACKEND_ENABLED','ARCA_HOMO_DATA_PREPARATION_ENABLED'],
      additionalFlagForBody:'ARCA_HOMO_PREPARATION_ENABLED',
      alwaysClosedFlags:CLOSED_FISCAL_FLAGS.filter(n=>!['ARCA_HOMO_BACKEND_ENABLED','ARCA_HOMO_DATA_PREPARATION_ENABLED','ARCA_HOMO_PREPARATION_ENABLED'].includes(n)),
      requiresSpecificGo:true,requiresLiveRevalidation:true,sqlExecuted:false,requestsExecuted:false,
      hostedAcceptanceProven:false,emissionEnabled:false,automaticApproval:false,rollbackPackageReady:false}
    return {manifest:{...manifest,planSha256:hash(JSON.stringify(manifest))},requests,prepared}
  } catch { return fail() }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if(process.argv.length!==4)throw Error('CLI_INPUT')
    const config=JSON.parse(readFileSync(process.argv[2],'utf8'))
    const {snapshotPath,...settings}=config
    if(typeof snapshotPath!=='string')throw Error('CLI_INPUT')
    const result=await planFiscalPositiveAcceptance({...settings,snapshotText:readFileSync(snapshotPath,'utf8'),now:new Date().toISOString()})
    const destination=resolve(process.argv[3]);mkdirSync(destination)
    for(const [name,data] of Object.entries({manifest:result.manifest,requests:result.requests,prepared:result.prepared}))
      writeFileSync(join(destination,name+'.json'),JSON.stringify(data,null,2),{flag:'wx'})
    console.log('POSITIVE_ACCEPTANCE_DATA_READY plan_sha256='+result.manifest.planSha256+' REMOTE_EXECUTED=false GO_READY=false')
  }catch{console.error('POSITIVE_ACCEPTANCE_PROPOSAL_NOT_CONFIRMED. No network or activation.');process.exitCode=1}
}
