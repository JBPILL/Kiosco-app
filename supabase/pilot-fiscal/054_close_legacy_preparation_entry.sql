-- Requires the reviewed fiscal baseline and private preparation route012.
-- New remote GO required. No data, function-body, emission or flag changes.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='15s';
DO $legacy_guard$
DECLARE legacy regprocedure:=to_regprocedure('public.preparar_operacion_fiscal_homologacion(uuid,uuid,uuid,jsonb)');
 private_entry regprocedure:=to_regprocedure('public.guardar_datos_preparacion_homologacion(uuid,uuid,uuid,text,text)');
BEGIN
 IF legacy IS NULL OR NOT EXISTS(SELECT 1 FROM pg_proc p WHERE p.oid=legacy
  AND p.proowner=(SELECT oid FROM pg_roles WHERE rolname='postgres') AND p.prosecdef
  AND cardinality(p.proconfig)=1 AND replace(p.proconfig[1],' ','')='search_path=pg_catalog,public'
  AND encode(sha256(convert_to(replace(p.prosrc,E'\r\n',E'\n'),'UTF8')),'hex')='ce6da3e9c57e5bd82e594497220be1669f6abeb431dc154df3d1df99bb367141') THEN
  RAISE EXCEPTION 'LEGACY_FISCAL_ENTRY_SOURCE_MISMATCH'; END IF;
 IF private_entry IS NULL THEN RAISE EXCEPTION 'PRIVATE_PREPARATION_ROUTE_REQUIRED'; END IF;
 IF NOT has_function_privilege('service_role',private_entry,'EXECUTE')
  OR has_function_privilege('authenticated',private_entry,'EXECUTE')
  OR has_function_privilege('anon',private_entry,'EXECUTE') THEN
  RAISE EXCEPTION 'PRIVATE_PREPARATION_ROUTE_REQUIRED'; END IF;
END $legacy_guard$;
REVOKE ALL ON FUNCTION public.preparar_operacion_fiscal_homologacion(uuid,uuid,uuid,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
DO $legacy_closed$
DECLARE legacy regprocedure:='public.preparar_operacion_fiscal_homologacion(uuid,uuid,uuid,jsonb)'::regprocedure;
 role_name text;
BEGIN
 FOREACH role_name IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_function_privilege(role_name,legacy,'EXECUTE') THEN RAISE EXCEPTION 'LEGACY_FISCAL_ENTRY_NOT_CLOSED'; END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM pg_proc p CROSS JOIN LATERAL aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  WHERE p.oid=legacy AND a.privilege_type='EXECUTE' AND a.grantee<>p.proowner) THEN
  RAISE EXCEPTION 'LEGACY_FISCAL_ENTRY_NOT_CLOSED'; END IF;
END $legacy_closed$;
COMMIT;
