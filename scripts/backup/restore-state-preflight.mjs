// Read-only checks for owned fixtures. No dispatch, credential reader or SQL mutation.
import { createHash } from 'node:crypto'
import { loadRestorePlan, inspectRestoreJournal, valueHash, PLAN_HASH } from './restore-acceptance-engine.mjs'
const plan = loadRestorePlan(), kid = plan.kioskId
const actions = [...plan.steps.flatMap(step => step.expected === 'REJECT' ? [step] : [step, step]), ...plan.cashierDeniedCalls]
const literal = value => "'" + String(value).replaceAll("'", "''") + "'"
const json = value => literal(JSON.stringify(value)) + '::jsonb'
const id = value => literal(value) + '::uuid'
const md5 = text => {
  const hex = createHash('md5').update(text).digest('hex')
  return hex.slice(0,8)+'-'+hex.slice(8,12)+'-'+hex.slice(12,16)+'-'+hex.slice(16,20)+'-'+hex.slice(20)
}
const fail = () => { throw Error('RESTORE_STATE_NOT_CONFIRMED') }
function model(journal) {
  const state = inspectRestoreJournal(journal)
  if (state.pending || state.stopped) fail()
  const owned = new Map(), latest = {}, stock = []
  let previousStock=0,previousProvider=null
  for (const step of actions.slice(0,state.cursor)) {
    const p = step.params, data = p.p_datos, op = p.p_operacion_id
    if (step.expected === 'REJECT' || owned.has(op)) continue
    let request, type, table, key, member = 'registro'
    if (step.rpc === 'restaurar_contacto_backup') { request = {tabla:p.p_tabla,registro_id:p.p_registro_id,datos:data,actor_auth_id:state.actors.OWNER};type='BACKUP_CONTACTO';table=p.p_tabla;key=p.p_registro_id }
    else if (step.rpc === 'restaurar_lote_backup') { request={lote_id:p.p_lote_id,datos:data,actor_auth_id:state.actors.OWNER};type='BACKUP_LOTE';table='lotes_producto';key=p.p_lote_id }
    else {
      request={producto_id:p.p_producto_id,datos:data,actor_auth_id:state.actors.OWNER};type='BACKUP_PRODUCTO';table='productos';key=p.p_producto_id;member='producto'
      const catalog = md5(op+':catalogo'), {proveedor_id:_provider,lotes_backup:lots,...catalogData}=data
      owned.set(catalog,{type:'CATALOGO_PRODUCTO',request:{producto:p.p_producto_id,datos:catalogData},parent:op,relation:'catalog',prior_provider:previousProvider})
      stock.push({id:md5(catalog+':stock'),previous:previousStock,target:data.stock_actual,request:{producto:p.p_producto_id,tipo:'AJUSTE',cantidad:data.stock_actual,motivo:'AJUSTE_MANUAL',notas:'Stock inicial/ajuste desde catálogo',vencimiento:null,numero_lote:null,lote:null}})
      previousStock=data.stock_actual;previousProvider=data.proveedor_id
      for (const lot of lots) {
        const {id:lotId,...lotData}=lot
        owned.set(md5(op+':lote:'+lotId),{type:'BACKUP_LOTE',request:{lote_id:lotId,datos:lotData,actor_auth_id:state.actors.OWNER},parent:op,relation:'lot'})
        latest.lotes_producto={op,member:'lotes',key:lotId}
      }
    }
    owned.set(op,{type,request,ackHash:state.acks[op]})
    latest[table]={op,member,key}
  }
  return {state,owned,latest,stock}
}
export function buildRestoreStateReadSql(journal) {
  const {state,owned,latest,stock}=model(journal)
  const expected = [...owned].map(([operation,row])=>({id:operation,...row}))
  const fixtureTables={clientes:plan.fixtureIds.client,proveedores:plan.fixtureIds.provider,productos:plan.fixtureIds.product,lotes_producto:plan.fixtureIds.batch}
  const fixtures=Object.entries(fixtureTables).map(([table,key])=>{
    const wanted=latest[table]
    const match=wanted ? `(SELECT t IS NOT DISTINCT FROM jsonb_populate_record(NULL::public.${table},${wanted.member==='lotes'?"o.resultado->'lotes'->0":'o.resultado->'+literal(wanted.member)}) FROM public.${table} t JOIN public.operaciones_escritura o ON o.id=${id(wanted.op)} WHERE t.id=${id(key)})` : 'true'
    return literal(table)+`,jsonb_build_object('count',(SELECT count(*)::int FROM public.${table} WHERE id=${id(key)}),'matches',${match})`
  }).join(',')
  const allIds=new Set(),allStockIds=new Set()
  for(const step of [...plan.steps,...plan.cashierDeniedCalls]){
    const p=step.params;allIds.add(p.p_operacion_id)
    if(step.rpc==='restaurar_producto_backup'){
      const catalog=md5(p.p_operacion_id+':catalogo');allIds.add(catalog);allStockIds.add(md5(catalog+':stock'))
      for(const lot of p.p_datos.lotes_backup)allIds.add(md5(p.p_operacion_id+':lote:'+lot.id))
    }
  }
  const ids = [...allIds].map(id).join(',')
  const stockIds = [...allStockIds].map(id).join(',')
  return `BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s'; SET LOCAL TIME ZONE 'UTC';
WITH expected AS (SELECT * FROM jsonb_to_recordset(${json(expected)}) AS x(id uuid,type text,request jsonb,parent uuid,relation text,prior_provider uuid)), expected_stock AS (SELECT * FROM jsonb_to_recordset(${json(stock)}) AS x(id uuid,previous numeric,target numeric,request jsonb)), selected AS (
 SELECT o.*,e.request expected_request,e.type expected_type,e.parent expected_parent,e.relation expected_relation,e.prior_provider FROM public.operaciones_escritura o LEFT JOIN expected e ON e.id=o.id
 WHERE o.id IN (${ids}) OR o.kiosco_id=${id(kid)} AND (o.solicitud->>'producto_id'=${literal(plan.fixtureIds.product)} OR o.solicitud->>'producto'=${literal(plan.fixtureIds.product)} OR o.solicitud->>'lote_id'=${literal(plan.fixtureIds.batch)} OR o.solicitud->>'registro_id' IN (${literal(plan.fixtureIds.client)},${literal(plan.fixtureIds.provider)}))
), checked AS (SELECT o.*,o.kiosco_id=${id(kid)} AND o.tipo=o.expected_type AND o.solicitud=o.expected_request AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=o.usuario_id AND u.auth_user_id=${id(state.actors.OWNER)} AND u.activo AND NOT u.es_superadmin AND u.kiosco_id=${id(kid)} AND u.rol=('DUE'||chr(209)||'O')) AND (o.expected_relation IS NULL OR EXISTS(SELECT 1 FROM public.operaciones_escritura parent WHERE parent.id=o.expected_parent AND o.resultado IS NOT DISTINCT FROM CASE WHEN o.expected_relation='catalog' THEN jsonb_build_object('producto',(parent.resultado->'producto')||jsonb_build_object('proveedor_id',o.prior_provider),'precio_costo',parent.resultado->'precio_costo') ELSE jsonb_build_object('id',o.expected_request->'lote_id','kiosco_id',${id(kid)},'registro',parent.resultado->'lotes'->0) END)) AS matches FROM selected o)
SELECT jsonb_build_object('read_only',current_setting('transaction_read_only'),'observed_at',clock_timestamp(),'plan_hash',${literal(PLAN_HASH)},'cursor',${state.cursor},
 'commercial_active',(SELECT count(*)=1 AND bool_and(public.comercial_resolver_estado(k.estado_suscripcion,s.estado,s.fecha_vencimiento,public.comercial_hoy())='ACTIVO') FROM public.kioscos k LEFT JOIN public.suscripciones s ON s.kiosco_id=k.id AND s.estado<>'CANCELADA' WHERE k.id=${id(kid)}),
 'owner_active',(SELECT count(*)=1 AND bool_and(kiosco_id=${id(kid)} AND NOT es_superadmin AND rol=('DUE'||chr(209)||'O')) FROM public.usuarios WHERE auth_user_id=${id(state.actors.OWNER)} AND activo),
 'cashier_active',(SELECT count(*)=1 AND bool_and(kiosco_id=${id(kid)} AND NOT es_superadmin AND rol='CAJERO') FROM public.usuarios WHERE auth_user_id=${id(state.actors.CASHIER)} AND activo),
 'fixtures',jsonb_build_object(${fixtures}),
 'operations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'matches',o.matches,'result',CASE WHEN o.matches THEN o.resultado ELSE NULL END) ORDER BY o.id),'[]'::jsonb) FROM checked o),
 'stock_ids',(SELECT coalesce(jsonb_agg(s.id ORDER BY s.id),'[]'::jsonb) FROM public.operaciones_stock s WHERE s.id IN (${stockIds}) OR s.solicitud->>'producto'=${literal(plan.fixtureIds.product)}),
 'stock_context',(SELECT coalesce(bool_and(e.id IS NOT NULL AND s.kiosco_id=${id(kid)} AND s.solicitud=e.request AND (s.resultado->>'stock_anterior')::numeric=e.previous AND (s.resultado->>'stock_nuevo')::numeric=e.target AND EXISTS(SELECT 1 FROM public.movimientos_stock m JOIN public.usuarios u ON u.id=m.usuario_id WHERE m.id=(s.resultado->>'movimiento_id')::uuid AND m.kiosco_id=${id(kid)} AND m.producto_id=${id(plan.fixtureIds.product)} AND m.tipo='AJUSTE' AND m.delta_stock=e.target-e.previous AND m.cantidad=abs(e.target-e.previous) AND m.motivo='AJUSTE_MANUAL' AND m.notas='Stock inicial/ajuste desde catálogo' AND m.lote_producto_id IS NULL AND u.auth_user_id=${id(state.actors.OWNER)})),true) FROM public.operaciones_stock s LEFT JOIN expected_stock e ON e.id=s.id WHERE s.id IN (${stockIds}) OR s.solicitud->>'producto'=${literal(plan.fixtureIds.product)}),
 'movements',(SELECT count(*)::int FROM public.movimientos_stock WHERE producto_id=${id(plan.fixtureIds.product)}),
 'cost_rows',(SELECT count(*)::int FROM public.producto_costos WHERE producto_id=${id(plan.fixtureIds.product)} AND kiosco_id=${id(kid)} AND precio_costo=0),
 'movement_cost_rows',(SELECT count(*)::int FROM public.movimiento_stock_costos c JOIN public.movimientos_stock m ON m.id=c.movimiento_id WHERE m.producto_id=${id(plan.fixtureIds.product)} AND c.kiosco_id=${id(kid)} AND c.precio_costo=0),
 'price_history_total',(SELECT count(*)::int FROM public.historial_precios_producto WHERE producto_id=${id(plan.fixtureIds.product)}),
 'price_history_matches',(SELECT coalesce(bool_and(h.kiosco_id=${id(kid)} AND h.precio_venta_anterior IS NULL AND h.precio_costo_anterior IS NULL AND h.precio_venta_nuevo=200 AND h.precio_costo_nuevo=0 AND h.motivo='Actualización de catálogo' AND h.operacion_id=${id(md5(plan.steps.find(step=>step.rpc==='restaurar_producto_backup').params.p_operacion_id+':catalogo'))} AND EXISTS(SELECT 1 FROM public.usuarios u WHERE u.id=h.usuario_id AND u.auth_user_id=${id(state.actors.OWNER)})),true) FROM public.historial_precios_producto h WHERE h.producto_id=${id(plan.fixtureIds.product)})
) AS evidence;
ROLLBACK;
`
}
export function verifyRestoreStateRead(journal,value,now=Date.now()) {
  try {
    const {state,owned,latest,stock}=model(journal),age=now-Date.parse(value?.observed_at)
    if(value?.read_only!=='on'||value.plan_hash!==PLAN_HASH||value.cursor!==state.cursor||!Number.isFinite(age)||age< -30000||age>300000||value.commercial_active!==true||value.owner_active!==true||value.cashier_active!==true)fail()
    for(const table of ['clientes','proveedores','productos','lotes_producto'])if(value.fixtures?.[table]?.count!==(latest[table]?1:0)||value.fixtures[table].matches!==true)fail()
    if(!Array.isArray(value.operations)||value.operations.length!==owned.size||new Set(value.operations.map(row=>row.id)).size!==owned.size)fail()
    for(const row of value.operations){const expected=owned.get(row.id);if(!expected||row.matches!==true||!row.result||expected.ackHash&&valueHash(row.result)!==expected.ackHash)fail()}
    if(valueHash(value.stock_ids)!==valueHash(stock.map(row=>row.id).sort())||value.stock_context!==true||value.movements!==stock.length||value.cost_rows!==(latest.productos?1:0)||value.movement_cost_rows!==stock.length||value.price_history_total!==(latest.productos?1:0)||value.price_history_matches!==true)fail()
    return Object.freeze({status:'OWNED_FIXTURES_MATCH_ONLY',cursor:state.cursor,operations:owned.size,stockOperations:stock.length})
  }catch{fail()}
}
