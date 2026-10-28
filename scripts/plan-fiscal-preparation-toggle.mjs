// Administrative SQL proposal only: never connects, executes or changes flags.
import { createHash } from 'node:crypto'
import { planFiscalPositiveAcceptance } from './plan-fiscal-positive-acceptance.mjs'
const quote = value => "'"+value.replaceAll("'","''")+"'"
const sha = value => createHash('sha256').update(value).digest('hex')

export async function planFiscalPreparationToggle(input) {
  const data=await planFiscalPositiveAcceptance(input)
  const s=JSON.parse(input.snapshotText),p=data.manifest
  const issuer=quote(JSON.stringify(s.issuer)),catalog=quote(JSON.stringify(s.catalog))
  const common=`SET LOCAL lock_timeout='5s';
SET LOCAL standard_conforming_strings=on;
SET LOCAL search_path=pg_catalog,public;
DO $window$ DECLARE expected_issuer public.fiscal_emisores_homologacion%ROWTYPE;
 expected_catalog public.fiscal_parametros_homologacion%ROWTYPE;
 actual_issuer public.fiscal_emisores_homologacion%ROWTYPE;
 actual_catalog public.fiscal_parametros_homologacion%ROWTYPE;
 actor public.usuarios%ROWTYPE; sale public.ventas%ROWTYPE; tabla text; rol text;
BEGIN
 IF current_user IS DISTINCT FROM 'postgres'
 OR current_setting('kioskopos.window_target',true) IS DISTINCT FROM 'acoyfwwmhaeruciyedri'
 OR current_setting('kioskopos.window_plan',true) IS DISTINCT FROM '${p.planSha256}' THEN
 RAISE EXCEPTION 'WINDOW_GO_REQUIRED'; END IF;
 SELECT * INTO expected_issuer FROM jsonb_populate_record(NULL::public.fiscal_emisores_homologacion,${issuer}::jsonb);
 SELECT * INTO expected_catalog FROM jsonb_populate_record(NULL::public.fiscal_parametros_homologacion,${catalog}::jsonb);
`
  const locks=`LOCK TABLE public.fiscal_emisores_homologacion IN SHARE ROW EXCLUSIVE MODE;
 LOCK TABLE public.fiscal_parametros_homologacion IN SHARE ROW EXCLUSIVE MODE;
 SELECT * INTO actual_issuer FROM public.fiscal_emisores_homologacion WHERE kiosco_id='${p.kioskId}'::uuid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WINDOW_BINDING_CHANGED'; END IF;
 SELECT * INTO actual_catalog FROM public.fiscal_parametros_homologacion WHERE revision=2 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WINDOW_BINDING_CHANGED'; END IF;
`
  const finish=`END $window$;
COMMIT;
`
  const activationSql=`-- REVIEW/GO REQUIRED. Administrative metadata only. No private flag or ARCA call.
-- Exclusive operator window required; no other metadata editors until closure.
BEGIN;
${common}
 BEGIN
 SELECT * INTO STRICT actor FROM public.usuarios WHERE auth_user_id='${p.ownerAuthId}'::uuid FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'WINDOW_OWNER_CHANGED'; END;
 IF actor.activo IS DISTINCT FROM true OR actor.rol IS DISTINCT FROM 'DUEÑO'
 OR actor.es_superadmin IS DISTINCT FROM false OR actor.kiosco_id IS DISTINCT FROM '${p.kioskId}'::uuid THEN
 RAISE EXCEPTION 'WINDOW_OWNER_CHANGED'; END IF;
 PERFORM 1 FROM public.kioscos WHERE id=actor.kiosco_id AND estado_suscripcion='ACTIVO' FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'WINDOW_KIOSK_CHANGED'; END IF;
 SELECT * INTO sale FROM public.ventas WHERE id='${p.saleId}'::uuid AND kiosco_id=actor.kiosco_id FOR UPDATE;
 IF NOT FOUND OR sale.estado IS DISTINCT FROM 'COMPLETADA' OR sale.total IS DISTINCT FROM ${quote(s.sale.total)}::numeric
 OR sale.fecha_hora IS DISTINCT FROM ${quote(s.sale.fecha_hora)}::timestamptz
 OR nullif(btrim(to_jsonb(sale)->>'afip_cae'),'') IS NOT NULL THEN RAISE EXCEPTION 'WINDOW_SALE_CHANGED'; END IF;
 PERFORM 1 FROM public.detalles_venta WHERE venta_id=sale.id FOR SHARE;
 IF (SELECT jsonb_agg(jsonb_build_object('id',id,'producto_id',producto_id,'cantidad',cantidad,'precio_unitario',precio_unitario,'subtotal',subtotal,'es_devolucion_envase',es_devolucion_envase) ORDER BY id)
 FROM public.detalles_venta WHERE venta_id=sale.id) IS DISTINCT FROM ${quote(JSON.stringify(s.details))}::jsonb
 OR EXISTS(SELECT 1 FROM public.devoluciones_venta WHERE venta_id=sale.id)
 OR EXISTS(SELECT 1 FROM public.fiscal_operaciones_homologacion WHERE venta_id=sale.id) THEN
 RAISE EXCEPTION 'WINDOW_SALE_CHANGED'; END IF;
 ${locks}
 FOREACH tabla IN ARRAY ARRAY['fiscal_emisores_homologacion','fiscal_parametros_homologacion'] LOOP
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=('public.'||tabla)::regclass AND relrowsecurity AND pg_get_userbyid(relowner)='postgres') THEN
 RAISE EXCEPTION 'WINDOW_PRIVATE_TABLE_CHANGED'; END IF;
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
 IF has_table_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE,DELETE')
 OR has_any_column_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE') THEN
 RAISE EXCEPTION 'WINDOW_PRIVATE_TABLE_CHANGED'; END IF;
 END LOOP; END LOOP;
 IF to_jsonb(actual_issuer) IS DISTINCT FROM to_jsonb(expected_issuer)
 OR to_jsonb(actual_catalog) IS DISTINCT FROM to_jsonb(expected_catalog)
 OR EXISTS(SELECT 1 FROM public.fiscal_emisores_homologacion WHERE habilitado)
 OR EXISTS(SELECT 1 FROM public.fiscal_parametros_homologacion WHERE habilitado) THEN
 RAISE EXCEPTION 'WINDOW_BINDING_CHANGED'; END IF;
 -- Time is checked AFTER every blocking lock, immediately before updates.
 IF clock_timestamp()<${quote(p.startsAt)}::timestamptz OR clock_timestamp()>=${quote(p.endsAt)}::timestamptz
 OR actual_catalog.vence_en<${quote(p.endsAt)}::timestamptz THEN RAISE EXCEPTION 'WINDOW_NOT_CURRENT'; END IF;
 UPDATE public.fiscal_emisores_homologacion SET habilitado=true WHERE kiosco_id=actor.kiosco_id;
 UPDATE public.fiscal_parametros_homologacion SET habilitado=true WHERE revision=2;
${finish}`
  const closureSql=`-- Close private PREPARATION/DATA/BACKEND flags FIRST, under the same reviewed GO.
-- No expiry restriction: closure must remain possible after the window ends.
-- Does not delete operations, bodies, reservations, TA or any commercial history.
-- No persistent window lease exists: exclusive operator window is mandatory.
BEGIN;
${common}
 ${locks}
 IF (to_jsonb(actual_issuer)-'habilitado') IS DISTINCT FROM (to_jsonb(expected_issuer)-'habilitado')
 OR (to_jsonb(actual_catalog)-'habilitado') IS DISTINCT FROM (to_jsonb(expected_catalog)-'habilitado') THEN
 RAISE EXCEPTION 'WINDOW_CLOSE_DRIFT_REVIEW_REQUIRED'; END IF;
 UPDATE public.fiscal_emisores_homologacion SET habilitado=false WHERE kiosco_id='${p.kioskId}'::uuid AND habilitado;
 UPDATE public.fiscal_parametros_homologacion SET habilitado=false WHERE revision=2 AND habilitado;
${finish}`
  const verificationSql=`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT jsonb_build_object('read_only',current_setting('transaction_read_only'),
 'issuer_enabled',(SELECT habilitado FROM public.fiscal_emisores_homologacion WHERE kiosco_id='${p.kioskId}'::uuid),
 'catalog_enabled',(SELECT habilitado FROM public.fiscal_parametros_homologacion WHERE revision=2),
 'enabled_issuers',(SELECT count(*) FROM public.fiscal_emisores_homologacion WHERE habilitado),
 'enabled_catalogs',(SELECT count(*) FROM public.fiscal_parametros_homologacion WHERE habilitado),
 'operation_id','${p.operationId}',
 'operations_for_sale',(SELECT count(*) FROM public.fiscal_operaciones_homologacion WHERE venta_id='${p.saleId}'::uuid)) AS verification;
ROLLBACK;
`
  return {data,activationSql,closureSql,verificationSql,manifest:{version:1,dataPlanSha256:p.planSha256,
    activationSha256:sha(activationSql),closureSha256:sha(closureSql),verificationSha256:sha(verificationSql),
    requiresExclusiveOperator:true,persistentWindowLease:false,sqlExecuted:false,flagsChanged:false,
    operatorAssistantReady:false,readyForGo:false}}
}
