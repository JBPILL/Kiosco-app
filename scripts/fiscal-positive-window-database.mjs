// Private DB adapter. Clients are supplied by the pinned TLS/session connector.
// Only exact compiled opening/closure SQL may write. All evidence uses a
// DIFFERENT connection in REPEATABLE READ READ ONLY and is rolled back.
import { planFiscalPreparationToggle } from './plan-fiscal-preparation-toggle.mjs'
const fail = () => { throw Error('WINDOW_DATABASE_NOT_CONFIRMED') }
const variableTables = ['fiscal_operaciones_homologacion','fiscal_preparaciones_homologacion','fiscal_solicitudes_homologacion',
  'fiscal_reservas_homologacion','fiscal_series_homologacion','fiscal_ta_homologacion','fiscal_ta_intentos_homologacion']
const zeroTables = ['fiscal_autorizaciones_homologacion','fiscal_reconciliaciones_homologacion','fiscal_permisos_emision_homologacion',
  'fiscal_respuestas_emision_homologacion','fiscal_revisiones_homologacion','fiscal_cancelaciones_preparacion_homologacion',
  'fiscal_sustituciones_homologacion','fiscal_rechazos_corregidos_homologacion','fiscal_presentaciones_homologacion',
  'fiscal_revisiones_presentacion_homologacion','fiscal_preparaciones_nc_homologacion','fiscal_parametros_nc_homologacion',
  'fiscal_nc_borradores_homologacion','fiscal_nc_cancelaciones_homologacion','fiscal_nc_comercial_homologacion',
  'fiscal_nc_desistimientos_homologacion','fiscal_nc_series_homologacion','fiscal_nc_reservas_homologacion',
  'fiscal_nc_ta_vinculos_homologacion','fiscal_nc_revisiones_homologacion','fiscal_nc_permisos_homologacion',
  'fiscal_nc_permisos_revocados_homologacion','fiscal_nc_intenciones_homologacion','fiscal_nc_consultas_homologacion',
  'fiscal_nc_autorizaciones_homologacion','fiscal_nc_conflictos_homologacion','fiscal_nc_respuestas_envio_homologacion',
  'fiscal_nc_resoluciones_homologacion','fiscal_nc_aplicaciones_homologacion','fiscal_nc_reposiciones_homologacion']
const commercialTables = ['productos','ventas','detalles_venta','pagos_venta','sesiones_caja','movimientos_caja','movimientos_stock','devoluciones_venta']
const digestSql = expr => `encode(sha256(convert_to((${expr})::text,'UTF8')),'hex')`
const countsSql = [...variableTables,...zeroTables].map(name => `'${name}',(SELECT count(*)::int FROM public.${name})`).join(',')
const commercialSql = commercialTables.map(name => ['detalles_venta','pagos_venta'].includes(name)
  ? `(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) FROM public.${name} t JOIN public.ventas v ON v.id=t.venta_id WHERE v.kiosco_id=$2)`
  : `(SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.id),'[]'::jsonb) FROM public.${name} t WHERE t.kiosco_id=$2)`).join(',')
// No TA cipher, token/sign, key or password is selected.
export const positiveWindowReadOnlySql = `SELECT jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),'observed_at',clock_timestamp(),
 'owner',(SELECT jsonb_build_object('auth_user_id',u.auth_user_id,'kiosco_id',u.kiosco_id,'rol',u.rol,'activo',u.activo,'es_superadmin',u.es_superadmin) FROM public.usuarios u WHERE u.auth_user_id=$1),
 'kiosk_active',(SELECT estado_suscripcion='ACTIVO' FROM public.kioscos WHERE id=$2),
 'sale',(SELECT jsonb_build_object('id',v.id,'kiosco_id',v.kiosco_id,'estado',v.estado,'fecha_hora',v.fecha_hora,'total',v.total::text,'has_legacy_cae',nullif(btrim(to_jsonb(v)->>'afip_cae'),'') IS NOT NULL) FROM public.ventas v WHERE v.id=$3),
 'details',(SELECT jsonb_agg(jsonb_build_object('id',d.id,'producto_id',d.producto_id,'cantidad',d.cantidad,'precio_unitario',d.precio_unitario,'subtotal',d.subtotal,'es_devolucion_envase',d.es_devolucion_envase) ORDER BY d.id) FROM public.detalles_venta d WHERE d.venta_id=$3),
 'returns',(SELECT count(*)::int FROM public.devoluciones_venta WHERE venta_id=$3),
 'operations',(SELECT count(*)::int FROM public.fiscal_operaciones_homologacion WHERE venta_id=$3),
 'issuer',(SELECT to_jsonb(e) FROM public.fiscal_emisores_homologacion e WHERE e.kiosco_id=$2),
 'catalog',(SELECT to_jsonb(p) FROM public.fiscal_parametros_homologacion p WHERE revision=$6::integer)) AS snapshot,
 jsonb_build_object(${countsSql}) AS counters,
 ${digestSql("SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY revision),'[]'::jsonb) FROM public.fiscal_parametros_homologacion p WHERE revision<>$6::integer")} AS history_sha256,
 ${digestSql(`SELECT jsonb_build_array(${commercialSql})`)} AS commercial_sha256,
 (SELECT actualizado_en::text FROM public.fiscal_emisores_homologacion WHERE kiosco_id=$2) AS opened_at,
 (SELECT count(*)::int FROM public.fiscal_emisores_homologacion) AS issuer_count,
 (SELECT count(*)::int FROM public.fiscal_parametros_homologacion) AS catalog_count,
 (SELECT jsonb_agg(revision ORDER BY revision) FROM public.fiscal_parametros_homologacion WHERE revision<>$6::integer) AS history_revisions,
 (SELECT count(*)::int FROM public.fiscal_emisores_homologacion WHERE habilitado) AS enabled_issuers,
 (SELECT count(*)::int FROM public.fiscal_parametros_homologacion WHERE habilitado) AS enabled_catalogs,
 NOT EXISTS(SELECT 1 FROM pg_class c CROSS JOIN unnest(ARRAY['anon','authenticated','service_role']) r
 WHERE c.oid IN ('public.fiscal_emisores_homologacion'::regclass,'public.fiscal_parametros_homologacion'::regclass)
 AND (NOT c.relrowsecurity OR pg_get_userbyid(c.relowner)<>'postgres' OR has_table_privilege(r,c.oid,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(r,c.oid,'SELECT,INSERT,UPDATE'))) AS private_acl,
 (SELECT jsonb_build_object('id',o.id,'kioskId',o.kiosco_id,'saleId',o.venta_id,'entorno',o.entorno,
 'actorAuthId',p.actor_auth_id,'preparedHash',p.preparacion_sha256,'preparedValid',p.preparacion_sha256=encode(sha256(convert_to(p.canonico,'UTF8')),'hex'),
 'credentialId',p.credencial_id,'fingerprint',p.certificado_sha256,'issuerRevision',p.emisor_revision,'catalogRevision',p.parametros_revision,
 'requestHash',s.solicitud_sha256,'requestValid',s.solicitud_sha256=encode(sha256(convert_to(s.cuerpo_canonico,'UTF8')),'hex'),
 'requestRevision',s.revision,'requestNumber',s.cuerpo->'numero','number',r.numero,'reservationState',r.estado,'intentId',r.intento_id)
 FROM public.fiscal_operaciones_homologacion o LEFT JOIN public.fiscal_preparaciones_homologacion p ON p.operacion_id=o.id
 LEFT JOIN public.fiscal_solicitudes_homologacion s ON s.operacion_id=o.id LEFT JOIN public.fiscal_reservas_homologacion r ON r.operacion_id=o.id WHERE o.id=$4) AS operation,
 (SELECT jsonb_build_object('fingerprint',t.certificado_sha256,'state',t.estado,'revision',t.revision,'expiresAt',t.vence_en,
 'hasCipher',t.cifrado IS NOT NULL,'origin',i.operacion_origen_id,'intent',t.intento_id) FROM public.fiscal_ta_homologacion t
 LEFT JOIN public.fiscal_ta_intentos_homologacion i ON i.id=t.intento_id WHERE t.certificado_sha256=$5) AS ta`

function stamp(value) {
  if (typeof value !== 'string') return fail()
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(?:Z|\+00(?::?00)?)$/)
  if (!match) return fail()
  return match[1]+'T'+match[2]+'.'+(match[3]??'').padEnd(6,'0')+'Z'
}
function canonical(value, key='') {
  if (['actualizado_en','consultado_en','vence_en','fecha_hora'].includes(key) && typeof value === 'string') return stamp(value)
  if (Array.isArray(value)) return value.map(item=>canonical(item))
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(name=>[name,canonical(value[name],name)]))
  return value
}
const equal = (left,right) => JSON.stringify(canonical(left))===JSON.stringify(canonical(right))
export async function createPositiveWindowDatabase({ client, observer, config, historySha256, commercialSha256, now=Date.now }) {
  const capture=historySha256===null&&commercialSha256===null
  if (client === observer || !capture&&![historySha256,commercialSha256].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value))) return fail()
  const input = JSON.parse(JSON.stringify(config)), plan = await planFiscalPreparationToggle(input), m=plan.data.manifest, source=JSON.parse(input.snapshotText)
  let reading = false, observerPoisoned=false, baselineValidated=false, baseline=null
  async function read() {
    if (reading || observerPoisoned) return fail()
    reading = true
    let observed, failed=false
    try {
      await observer.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      await observer.query("SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout='15s'")
      const response = await observer.query(positiveWindowReadOnlySql,[m.ownerAuthId,m.kioskId,m.saleId,m.operationId,source.issuer.certificado_sha256,m.catalogRevision])
      if (response.rows.length!==1) return fail()
      const value=response.rows[0], timestamp=Date.parse(value.snapshot?.observed_at), current=now()
      if (value.snapshot?.read_only!=='on'||!Number.isFinite(timestamp)||!Number.isSafeInteger(current)||Math.abs(current-timestamp)>30000
        ||historySha256!==null&&value.history_sha256!==historySha256||commercialSha256!==null&&value.commercial_sha256!==commercialSha256
        ||value.issuer_count!==1||value.catalog_count!==m.catalogRevision||!Array.isArray(value.history_revisions)
        ||value.history_revisions.length!==m.catalogRevision-1||value.history_revisions.some((revision,index)=>revision!==index+1)||value.private_acl!==true
        ||![value.history_sha256,value.commercial_sha256].every(item=>typeof item==='string'&&/^[a-f0-9]{64}$/.test(item))) return fail()
      for(const table of zeroTables)if(value.counters[table]!==0)return fail()
      for(const table of variableTables)if(!Number.isSafeInteger(value.counters[table])||value.counters[table]<0||value.counters[table]>1)return fail()
      observed=value
    } catch { failed=true }
    try { await observer.query('ROLLBACK') } catch { failed=true; observerPoisoned=true }
    reading=false
    if(failed)return fail()
    return observed
  }
  function validate(value, mode, receipt) {
    const snapshot=value.snapshot, wanted=JSON.parse(input.snapshotText)
    const active=mode==='active'||mode==='receipt'
    wanted.issuer.habilitado=active;wanted.catalog.habilitado=active
    if(receipt){
      if(receipt.planSha256!==m.planSha256||receipt.operationId!==m.operationId||stamp(value.opened_at)!==stamp(receipt.openedAt)
        ||stamp(value.opened_at)<=stamp(source.issuer.actualizado_en)||stamp(value.opened_at)<stamp(input.startsAt)||stamp(value.opened_at)>=stamp(input.endsAt))return fail()
      wanted.issuer.actualizado_en=receipt.openedAt
    }
    const keys=['sale','details','returns','issuer','catalog']
    // An owned receipt is cleanup metadata, not permission to prepare. Owner /
    // subscription revocation or expiry must stop actions but not strand our
    // original window open. Active-use validation remains strict below.
    if(mode==='active'||mode==='baseline'){ keys.push('owner','kiosk_active');if(Date.parse(snapshot.catalog.vence_en)<=now())return fail() }
    if(keys.some(key=>!equal(snapshot[key],wanted[key]))||value.enabled_issuers!==(active?1:0)||value.enabled_catalogs!==(active?1:0))return fail()
    if(mode==='baseline'){
      if(snapshot.operations!==0||value.operation!==null||value.ta!==null||variableTables.some(table=>value.counters[table]!==0))return fail()
      return
    }
    const op=value.operation,n=value.counters.fiscal_operaciones_homologacion
    if(snapshot.operations!==n||n!==value.counters.fiscal_preparaciones_homologacion||(!op)!==(n===0))return fail()
    if(op&&(op.id!==m.operationId||op.kioskId!==m.kioskId||op.saleId!==m.saleId||op.entorno!=='HOMOLOGACION'||op.actorAuthId!==m.ownerAuthId
      ||op.preparedHash!==m.preparedSha256||op.preparedValid!==true||op.credentialId!==source.issuer.credencial_id||op.fingerprint!==source.issuer.certificado_sha256
      ||op.issuerRevision!==1||op.catalogRevision!==m.catalogRevision||op.intentId!==null))return fail()
    if(value.ta&&(n!==1||value.ta.fingerprint!==source.issuer.certificado_sha256||value.ta.origin!==m.operationId
      ||value.counters.fiscal_ta_intentos_homologacion!==1))return fail()
  }
  async function writerSettings(receipt) {
    if(!baselineValidated)return fail()
    await client.query("SELECT set_config('kioskopos.window_target','acoyfwwmhaeruciyedri',false),set_config('kioskopos.window_plan',$1,false)",[m.planSha256])
    if(receipt!==undefined)await client.query("SELECT set_config('kioskopos.window_opened_at',$1,false)",[receipt])
  }
  return Object.freeze({ projectRef:input.projectRef,planSha256:m.planSha256,
    async assertClosedBaseline(){
      const value=await read();validate(value,'baseline')
      // Anchor only a successfully validated CLOSED, fresh, read-only state.
      // Never refresh/replace an anchor later to accommodate drift.
      if(!baselineValidated){
        historySha256=value.history_sha256;commercialSha256=value.commercial_sha256
        baseline=Object.freeze({historySha256,commercialSha256,observedAt:value.snapshot.observed_at})
        baselineValidated=true
      }
    },
    baselineMetadata(){if(!baselineValidated)return fail();return baseline},
    async executeOpen(sql){if(sql!==plan.activationSql)return fail();await writerSettings();try{await client.query(sql)}catch{await client.query('ROLLBACK').catch(()=>{});return fail()}},
    async readOpenedReceipt(){if(!baselineValidated)return fail();const value=await read(),receipt={planSha256:m.planSha256,operationId:m.operationId,openedAt:value.opened_at};validate(value,'receipt',receipt);return Object.freeze(receipt)},
    async assertActiveBinding(receipt){if(!baselineValidated)return fail();validate(await read(),'active',receipt)},
    async executeClose(sql,openedAt){if(sql!==plan.closureSql||typeof openedAt!=='string')return fail();stamp(openedAt);await writerSettings(openedAt);try{await client.query(sql)}catch{await client.query('ROLLBACK').catch(()=>{});return fail()}},
    async verifyPrepared(summary){
      if(!baselineValidated)return fail()
      const value=await read(),receipt={planSha256:m.planSha256,operationId:m.operationId,openedAt:value.opened_at};validate(value,'active',receipt)
      const op=value.operation,ta=value.ta
      if(variableTables.some(table=>value.counters[table]!==1)||!op||!ta||summary.operationId!==m.operationId||summary.saleId!==m.saleId
        ||summary.requestSha256!==op.requestHash||summary.number!==op.number||op.requestNumber!==op.number||op.requestValid!==true
        ||op.requestRevision!==1||op.reservationState!=='RESERVADA'||ta.state!=='DISPONIBLE'||ta.hasCipher!==true||ta.origin!==m.operationId
        ||ta.fingerprint!==source.issuer.certificado_sha256||!Number.isSafeInteger(ta.revision)||ta.revision<1||!ta.intent||!Number.isFinite(Date.parse(ta.expiresAt))||Date.parse(ta.expiresAt)<=now())return fail()
    },
    async verifyClosed(receipt,summary){if(!baselineValidated)return fail();const value=await read();validate(value,'closed',receipt)
      if(summary&&(value.operation?.requestHash!==summary.requestSha256||value.operation?.number!==summary.number||value.operation?.requestValid!==true
        ||value.operation?.reservationState!=='RESERVADA'||value.counters.fiscal_solicitudes_homologacion!==1))return fail()
    },
  })
}
