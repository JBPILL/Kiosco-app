BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY;
SET LOCAL statement_timeout='10s';
WITH RECURSIVE tables AS (
 SELECT c.oid,c.relname,c.relrowsecurity,c.relforcerowsecurity FROM pg_catalog.pg_class c
 JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relname=ANY(ARRAY['clientes','proveedores','productos','lotes_producto','producto_costos','movimientos_stock','movimiento_stock_costos','historial_precios_producto','operaciones_escritura','auditoria_operaciones','combo_items','usuarios','kioscos','suscripciones','categorias','operaciones_stock'])
), triggers AS (
 SELECT t.* FROM pg_catalog.pg_trigger t JOIN tables r ON r.oid=t.tgrelid WHERE NOT t.tgisinternal
), function_roots AS (
 SELECT p.*,n.nspname FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
 WHERE p.prokind='f' AND (p.oid IN(SELECT tgfoid FROM triggers) OR n.nspname='public' AND p.proname=ANY(ARRAY['guardar_producto_transaccional','registrar_movimiento_stock_idempotente','registrar_movimiento_stock','auth_user_rol','restaurar_contacto_backup','restaurar_producto_backup','restaurar_lote_backup','capacidades_restauracion_backup','exigir_comercio_operativo','comercial_resolver_estado','comercial_hoy','actor_operativo_actual','auth_es_superadmin','auth_es_dueno_o_superadmin','auth_user_kiosco_id']))
), function_ids(oid) AS (
 SELECT oid FROM function_roots
 UNION
 SELECT q.oid FROM function_ids f JOIN pg_catalog.pg_proc p ON p.oid=f.oid
 CROSS JOIN LATERAL regexp_matches(p.prosrc,'public\.([a-z_][a-z_0-9]*)[[:space:]]*\(','g') AS m(parts)
 JOIN pg_catalog.pg_proc q ON q.proname=m.parts[1] JOIN pg_catalog.pg_namespace n ON n.oid=q.pronamespace
 WHERE n.nspname='public' AND q.prokind='f'
), functions AS (
 SELECT p.*,n.nspname FROM function_ids f JOIN pg_catalog.pg_proc p ON p.oid=f.oid JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
)
SELECT jsonb_build_object(
 'read_only',current_setting('transaction_read_only'),'query_role',current_user,'observed_at',now(),'server_version',current_setting('server_version'),
 'identity_fuse',EXISTS(SELECT 1 FROM public.usuarios u JOIN public.kioscos k ON k.id=u.kiosco_id WHERE u.auth_user_id='0e90b9a7-36d2-4762-ab1a-4982996cf9aa'::uuid AND u.kiosco_id='b7254826-c767-4098-94b8-71013c12021d'::uuid AND u.activo AND u.es_superadmin IS FALSE AND u.rol=('DUE'||chr(209)||'O') AND k.estado_suscripcion='ACTIVO'),
 'tables',(SELECT jsonb_agg(jsonb_build_object('name',relname,'rls',relrowsecurity,'force_rls',relforcerowsecurity,'authenticated_select',has_table_privilege('authenticated',oid,'SELECT')) ORDER BY relname) FROM tables),
 'functions',(SELECT jsonb_agg(jsonb_build_object('signature',nspname||'.'||oid::regprocedure::text,'name',proname,'owner',pg_get_userbyid(proowner),'security_definer',prosecdef,'volatility',provolatile,'config_sha256',encode(sha256(convert_to(coalesce(array_to_string(proconfig,chr(10)),''),'UTF8')),'hex'),'body_sha256',encode(sha256(convert_to(replace(prosrc,chr(13)||chr(10),chr(10)),'UTF8')),'hex'),'authenticated_execute',has_function_privilege('authenticated',oid,'EXECUTE'),'anon_execute',has_function_privilege('anon',oid,'EXECUTE')) ORDER BY nspname,proname,oid::regprocedure::text) FROM functions),
 'triggers',(SELECT jsonb_agg(jsonb_build_object('table',tgrelid::regclass::text,'name',tgname,'enabled',tgenabled,'function',tgfoid::regprocedure::text,'definition_sha256',encode(sha256(convert_to(pg_get_triggerdef(oid),'UTF8')),'hex')) ORDER BY tgrelid::regclass::text,tgname) FROM triggers),
 'columns',(SELECT jsonb_agg(jsonb_build_object('table',t.relname,'column',a.attname,'not_null',a.attnotnull,'type',pg_catalog.format_type(a.atttypid,a.atttypmod)) ORDER BY t.relname,a.attname) FROM pg_catalog.pg_attribute a JOIN tables t ON t.oid=a.attrelid WHERE a.attnum>0 AND NOT a.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'type',c.contype,'validated',c.convalidated,'definition_sha256',encode(sha256(convert_to(pg_get_constraintdef(c.oid),'UTF8')),'hex')) ORDER BY c.conrelid::regclass::text,c.conname) FROM pg_catalog.pg_constraint c JOIN tables t ON t.oid=c.conrelid WHERE c.contype<>'n')
) AS evidence;
ROLLBACK;
