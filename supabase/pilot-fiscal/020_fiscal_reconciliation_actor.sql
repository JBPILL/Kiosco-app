-- Conciliación privada ligada al Auth verificado y al emisor exacto.
-- Instalación fiscal remota requiere autorización de la familia compatible.
BEGIN;
CREATE OR REPLACE FUNCTION public.autorizar_conciliacion_revisada_homologacion(p_actor_auth_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE binding jsonb;
BEGIN
 binding:=public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 -- Compatibilidad del diario anterior a datos explícitos; no inventar un Auth.
 IF to_regclass('public.fiscal_preparaciones_homologacion') IS NOT NULL THEN
  PERFORM public.fiscal_exigir_actor_preparacion(p_operacion_id,p_actor_auth_id);
 END IF;
 RETURN binding;
END $$;
CREATE OR REPLACE FUNCTION public.registrar_conciliacion_revisada_homologacion(
 p_actor_auth_id uuid,p_binding jsonb,p_id uuid,p_operacion_id uuid,p_intento_id uuid,p_sha text,p_revision integer,p_decision jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE binding jsonb; resultado jsonb;
BEGIN
 -- Los locks de autorización se conservan hasta terminar este registro.
 binding:=public.autorizar_conciliacion_revisada_homologacion(p_actor_auth_id,p_operacion_id);
 IF p_binding IS NULL OR binding IS DISTINCT FROM p_binding THEN
  RAISE EXCEPTION 'Cambió la autorización de conciliación.' USING ERRCODE='42501'; END IF;
 resultado:=public.registrar_reconciliacion_fiscal_homologacion(p_id,p_operacion_id,p_intento_id,p_sha,p_revision,p_decision);
 IF public.autorizar_conciliacion_revisada_homologacion(p_actor_auth_id,p_operacion_id) IS DISTINCT FROM binding THEN
  RAISE EXCEPTION 'Cambió la autorización durante conciliación.' USING ERRCODE='42501'; END IF;
 RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.autorizar_conciliacion_revisada_homologacion(uuid,uuid),public.registrar_conciliacion_revisada_homologacion(uuid,jsonb,uuid,uuid,uuid,text,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.autorizar_conciliacion_revisada_homologacion(uuid,uuid),public.registrar_conciliacion_revisada_homologacion(uuid,jsonb,uuid,uuid,uuid,text,integer,jsonb) TO service_role;
COMMIT;
