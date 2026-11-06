-- Private lookup only. Never creates/enables a permission. Requires001–052.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_permiso_envio_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text,p_cuerpo_sha text,p_revision_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cuerpo jsonb; ids uuid[];
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) OR current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Trabajador privado con aislamiento compatible requerido.' USING ERRCODE='42501'; END IF;
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF cuerpo#>>'{cuerpo,sha256}' IS DISTINCT FROM p_cuerpo_sha OR p_revision_id IS NULL THEN RAISE EXCEPTION 'Cuerpo/revisión NC ajenos.' USING ERRCODE='42501'; END IF;
 SELECT array_agg(id ORDER BY id) INTO ids FROM public.fiscal_nc_permisos_homologacion p
 WHERE p.solicitud_id=p_id AND p.revision_id=p_revision_id AND p.actor_auth_id=p_actor_auth_id
  AND p.solicitud_sha256=p_cuerpo_sha AND p.habilitado AND p.creado_en<=clock_timestamp() AND p.vence_en>clock_timestamp()
  AND NOT EXISTS(SELECT 1 FROM public.fiscal_nc_permisos_revocados_homologacion r WHERE r.permiso_id=p.id);
 IF coalesce(cardinality(ids),0)=0 THEN RETURN NULL; END IF;
 IF cardinality(ids)<>1 THEN RAISE EXCEPTION 'Permiso NC ambiguo; requiere revisión privada.' USING ERRCODE='55000'; END IF;
 RETURN public.verificar_permiso_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha,p_cuerpo_sha,p_revision_id,ids[1]);
END $$;
REVOKE ALL ON FUNCTION public.cargar_permiso_envio_nc_homologacion(uuid,uuid,uuid,uuid,text,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_permiso_envio_nc_homologacion(uuid,uuid,uuid,uuid,text,text,uuid) TO service_role;
COMMIT;
