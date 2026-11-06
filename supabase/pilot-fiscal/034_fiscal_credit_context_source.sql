-- Puente privado de lectura: caso durable para validar DTO033 sin reenviar
-- canónicos grandes desde el navegador. No cambia catálogo ni concede permiso.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_fuente_contexto_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE contexto jsonb; caso public.fiscal_nc_borradores_homologacion%ROWTYPE;
BEGIN
 -- 033 verifica actor/factura/caso activo/vínculo/catálogo/emisor y retiene locks.
 contexto:=public.cargar_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 SELECT * INTO caso FROM public.fiscal_nc_borradores_homologacion WHERE id=p_id FOR SHARE;
 IF NOT FOUND OR caso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR caso.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id
  OR caso.propuesta_sha256 IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Fuente NC no disponible.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('contexto',contexto,'propuesta',jsonb_build_object('canonico',caso.canonico,'sha256',caso.propuesta_sha256));
END $$;
REVOKE ALL ON FUNCTION public.cargar_fuente_contexto_nc_homologacion(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_fuente_contexto_nc_homologacion(uuid,uuid,uuid,uuid,text) TO service_role;
COMMIT;
