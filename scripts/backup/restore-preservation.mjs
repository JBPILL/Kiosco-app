// Fixed commercial inventory, no credentials/security-secret/fiscal-TA tables.
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { loadRestorePlan, inspectRestoreJournal, valueHash, PLAN_HASH } from './restore-acceptance-engine.mjs'
const plan=loadRestorePlan(),fail=()=>{throw Error('RESTORE_PRESERVATION_NOT_CONFIRMED')}
export const RESTORE_PRESERVATION_TABLES=Object.freeze([
 'kioscos','usuarios','categorias','productos','combo_items','promociones','lotes_producto','sesiones_caja','movimientos_caja','ventas','detalles_venta','pagos_venta','movimientos_stock','clientes','movimientos_cuenta_corriente','devoluciones_venta','producto_costos','movimiento_stock_costos','auditoria_operaciones','checkout_manuales','checkout_manual_entradas','checkout_manual_cancelaciones','anulaciones_venta_atomicas','proveedores','compras_proveedor','detalles_compra','pagos_proveedor','movimientos_proveedor','operaciones_escritura','operaciones_stock','historial_precios_producto','planes','suscripciones','pagos_suscripcion','operaciones_comerciales','auditoria_comercial_admin','envases_tipos_comercio','envases_saldos','envases_operaciones','envases_movimientos','envases_checkout_operaciones','envases_pendientes','devoluciones_parciales_atomicas','detalles_devolucion','devolucion_reposiciones_atomicas','piloto_operaciones_capacidades','tickets_soporte','electronica_unidades','electronica_reparaciones','electronica_solicitudes',
].sort())
const quote=value=>"'"+String(value).replaceAll("'","''")+"'"
const uuid=value=>quote(value)+'::uuid'
const md5=text=>{const s=createHash('md5').update(text).digest('hex');return s.slice(0,8)+'-'+s.slice(8,12)+'-'+s.slice(12,16)+'-'+s.slice(16,20)+'-'+s.slice(20)}
const operations=new Set(),stock=new Set()
for(const step of [...plan.steps,...plan.cashierDeniedCalls]){
 const p=step.params;operations.add(p.p_operacion_id)
 if(step.rpc==='restaurar_producto_backup'){
  const catalog=md5(p.p_operacion_id+':catalogo');operations.add(catalog);stock.add(md5(catalog+':stock'))
  for(const lot of p.p_datos.lotes_backup)operations.add(md5(p.p_operacion_id+':lote:'+lot.id))
 }
}
const predicates={
 clientes:`t.id<>${uuid(plan.fixtureIds.client)}`,proveedores:`t.id<>${uuid(plan.fixtureIds.provider)}`,
 productos:`t.id<>${uuid(plan.fixtureIds.product)}`,lotes_producto:`t.id<>${uuid(plan.fixtureIds.batch)}`,
 producto_costos:`t.producto_id<>${uuid(plan.fixtureIds.product)}`,
 movimientos_stock:`t.producto_id<>${uuid(plan.fixtureIds.product)}`,
 movimiento_stock_costos:`NOT EXISTS(SELECT 1 FROM public.movimientos_stock m WHERE m.id=t.movimiento_id AND m.producto_id=${uuid(plan.fixtureIds.product)})`,
 historial_precios_producto:`t.producto_id<>${uuid(plan.fixtureIds.product)}`,
 operaciones_escritura:`t.id NOT IN (${[...operations].sort().map(uuid).join(',')})`,
 operaciones_stock:`t.id NOT IN (${[...stock].sort().map(uuid).join(',')})`,
}
export const RESTORE_PRESERVATION_SCOPE_HASH=valueHash({tables:RESTORE_PRESERVATION_TABLES,predicates,planHash:PLAN_HASH})
export function buildRestorePreservationReadSql(){
 const reads=RESTORE_PRESERVATION_TABLES.map(table=>`SELECT ${quote(table)} name,count(*)::int count,encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text,'UTF8')),'hex') sha256 FROM public.${table} t WHERE ${predicates[table]??'true'}`)
 return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s'; SET LOCAL TIME ZONE 'UTC';
SELECT jsonb_build_object('read_only',current_setting('transaction_read_only'),'query_role',current_user,'observed_at',clock_timestamp(),'server_version',current_setting('server_version'),'scope_hash',${quote(RESTORE_PRESERVATION_SCOPE_HASH)},'plan_hash',${quote(PLAN_HASH)},'tables',(SELECT jsonb_agg(to_jsonb(x) ORDER BY name) FROM (${reads.join('\nUNION ALL\n')}) x)) AS evidence;
ROLLBACK;
`
}
function observation(value,now){
 const age=now-Date.parse(value?.observed_at)
 if(value?.read_only!=='on'||value.query_role!=='postgres'||value.scope_hash!==RESTORE_PRESERVATION_SCOPE_HASH||value.plan_hash!==PLAN_HASH||typeof value.server_version!=='string'||!Number.isFinite(age)||age< -30000||age>300000||!Array.isArray(value.tables)||value.tables.length!==RESTORE_PRESERVATION_TABLES.length)fail()
 const rows=[...value.tables].sort((a,b)=>a.name<b.name?-1:a.name>b.name?1:0)
 for(let i=0;i<rows.length;i++)if(rows[i].name!==RESTORE_PRESERVATION_TABLES[i]||!Number.isSafeInteger(rows[i].count)||rows[i].count<0||!/^[a-f0-9]{64}$/.test(rows[i].sha256)||Object.keys(rows[i]).sort().join(',')!=='count,name,sha256')fail()
 return rows
}
export function createRestorePreservationBaseline(journal,value,now=Date.now()){
 try{
  const state=inspectRestoreJournal(journal)
  if(state.cursor!==0||state.pending||state.stopped)fail()
  const tables=observation(value,now),body={version:1,planHash:PLAN_HASH,scopeHash:RESTORE_PRESERVATION_SCOPE_HASH,journalHeader:journal.records()[0].hash,observedAt:value.observed_at,serverVersion:value.server_version,tables}
  return Object.freeze({...body,baselineHash:valueHash(body)})
 }catch{fail()}
}
export function writeRestorePreservationBaseline(journal,value,now=Date.now()){
 const baseline=createRestorePreservationBaseline(journal,value,now)
 const file=path.join(path.dirname(journal.file),'preservation-baseline.json')
 let fd,failed=false
 try{fd=fs.openSync(file,'wx',0o600);fs.writeFileSync(fd,JSON.stringify(baseline)+'\n','utf8');fs.fsyncSync(fd)}catch{failed=true}finally{try{if(fd!==undefined)fs.closeSync(fd)}catch{failed=true}}
 if(failed)fail()
 return baseline
}
export function loadRestorePreservationBaseline(journal){
 try{
  const file=path.join(path.dirname(journal.file),'preservation-baseline.json'),info=fs.lstatSync(file)
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>65536)fail()
  return JSON.parse(fs.readFileSync(file,'utf8'))
 }catch{fail()}
}
export function verifyRestorePreservation(journal,baseline,value,reviewedHash,now=Date.now()){
 try{
  const state=inspectRestoreJournal(journal),{baselineHash,...body}=baseline??{}
  if(state.pending||state.stopped||Object.keys(body).sort().join(',')!=='journalHeader,observedAt,planHash,scopeHash,serverVersion,tables,version'||baselineHash!==reviewedHash||!/^([a-f0-9]{64})$/.test(reviewedHash)||valueHash(body)!==baselineHash||body.version!==1||body.planHash!==PLAN_HASH||body.scopeHash!==RESTORE_PRESERVATION_SCOPE_HASH||body.journalHeader!==journal.records()[0].hash||body.serverVersion!==value?.server_version)fail()
  const age=now-Date.parse(body.observedAt)
  if(!Number.isFinite(age)||age< -30000||valueHash(observation(value,now))!==valueHash(body.tables))fail()
  return Object.freeze({status:'REVIEWED_COMMERCIAL_INVENTORY_MATCH_ONLY',tables:RESTORE_PRESERVATION_TABLES.length,cursor:state.cursor,baselineHash})
 }catch{fail()}
}
