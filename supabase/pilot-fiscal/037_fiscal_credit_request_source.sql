-- Fuente privada de cuerpo NC durable; sólo lectura, no revisión ni permiso.
-- Requiere001–036. Sin instalación remota automática.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_fuente_cuerpo_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE reserva jsonb; preparacion jsonb; cuerpo public.fiscal_nc_reservas_homologacion%ROWTYPE;
BEGIN
 reserva:=public.cargar_reserva_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF reserva IS NULL THEN RETURN NULL; END IF;
 preparacion:=public.cargar_preparacion_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 SELECT * INTO cuerpo FROM public.fiscal_nc_reservas_homologacion WHERE solicitud_id=p_id FOR SHARE;
 IF NOT FOUND OR cuerpo.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR cuerpo.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id
  OR cuerpo.propuesta_sha256 IS DISTINCT FROM p_sha OR cuerpo.preparacion_sha256 IS DISTINCT FROM preparacion#>>'{preparacion,sha256}'
  OR cuerpo.reserva_id::text IS DISTINCT FROM reserva->>'reserva_id' THEN RAISE EXCEPTION 'Cuerpo NC no disponible.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('preparacion',preparacion,'reserva',reserva,'cuerpo',jsonb_build_object('canonico',cuerpo.canonico,'sha256',cuerpo.solicitud_sha256));
END $$;
REVOKE ALL ON FUNCTION public.cargar_fuente_cuerpo_nc_homologacion(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_fuente_cuerpo_nc_homologacion(uuid,uuid,uuid,uuid,text) TO service_role;
COMMIT;
