-- Historial paginado del Dueño original, sin catálogo/emisor vigente ni ARCA.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_historial_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_despues integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE casos jsonb; ultimo integer; continuar integer;
BEGIN
 PERFORM public.cargar_representacion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id);
 IF p_despues IS NULL OR p_despues<0 THEN RAISE EXCEPTION 'Cursor NC inválido.' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('secuencia',b.secuencia,'acuse',public.fiscal_nc_ack(b.id),
  'propuesta',jsonb_build_object('canonico',b.canonico,'sha256',b.propuesta_sha256)) ORDER BY b.secuencia),'[]'::jsonb),max(b.secuencia) INTO casos,ultimo
 FROM (SELECT * FROM public.fiscal_nc_borradores_homologacion x WHERE x.operacion_origen_id=p_operacion_origen_id AND x.actor_auth_id=p_actor_auth_id AND x.secuencia>p_despues ORDER BY x.secuencia LIMIT 10) b;
 IF ultimo IS NOT NULL AND EXISTS(SELECT 1 FROM public.fiscal_nc_borradores_homologacion b WHERE b.operacion_origen_id=p_operacion_origen_id AND b.actor_auth_id=p_actor_auth_id AND b.secuencia>ultimo) THEN continuar:=ultimo; END IF;
 RETURN jsonb_build_object('version',1,'venta_id',p_venta_id,'operacion_origen_id',p_operacion_origen_id,'despues',p_despues,'casos',casos,'continuar_desde',continuar);
END $$;
REVOKE ALL ON FUNCTION public.cargar_historial_nc_homologacion(uuid,uuid,uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_historial_nc_homologacion(uuid,uuid,uuid,integer) TO service_role;
COMMIT;
