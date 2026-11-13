-- Metadata privada para consulta de numeración NC, no permiso de emisión/TA.
-- Requiere001–037. Sin instalación/provisión/activación remota automática.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_fuente_numeracion_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text,p_preparacion_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE perfil public.usuarios%ROWTYPE; emisor public.fiscal_emisores_homologacion%ROWTYPE; preparacion jsonb; contexto jsonb;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Requiere trabajador privado NC.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Fuente NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF p_preparacion_sha IS NULL OR p_preparacion_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Conservar preparación NC.' USING ERRCODE='22023'; END IF;
 BEGIN
  SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Numeración NC no autorizada.' USING ERRCODE='42501'; END;
 IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin IS DISTINCT FROM false OR perfil.kiosco_id IS NULL THEN RAISE EXCEPTION 'Numeración NC no autorizada.' USING ERRCODE='42501'; END IF;
 preparacion:=public.cargar_preparacion_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF preparacion IS NULL OR preparacion->>'estado' IS DISTINCT FROM 'DATOS_NC_PREPARADOS' OR preparacion#>>'{preparacion,sha256}' IS DISTINCT FROM p_preparacion_sha THEN RAISE EXCEPTION 'Preparación NC no disponible.' USING ERRCODE='55000'; END IF;
 IF public.cargar_reserva_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha) IS NOT NULL THEN RAISE EXCEPTION 'Recuperar cuerpo NC existente antes de consultar.' USING ERRCODE='55000'; END IF;
 contexto:=public.cargar_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF contexto IS DISTINCT FROM preparacion->'contexto' THEN RAISE EXCEPTION 'Contexto NC cambió.' USING ERRCODE='22023'; END IF;
 IF (SELECT kiosco_id FROM public.ventas WHERE id=p_venta_id) IS DISTINCT FROM perfil.kiosco_id THEN RAISE EXCEPTION 'Comercio NC distinto.' USING ERRCODE='42501'; END IF;
 SELECT * INTO emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=perfil.kiosco_id AND habilitado FOR SHARE;
 IF NOT FOUND OR emisor.cuit_emisor IS DISTINCT FROM contexto->>'cuit_emisor' OR emisor.punto_venta IS DISTINCT FROM (contexto->>'punto_venta')::integer
  OR emisor.revision IS DISTINCT FROM (contexto->>'revision_emisor')::integer THEN RAISE EXCEPTION 'Emisor NC cambió.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('preparacion',preparacion,'binding',jsonb_build_object('version',1,'entorno','HOMOLOGACION','servicio','wsfe','finalidad','NUMERACION_NC',
  'venta_id',p_venta_id,'operacion_origen_id',p_operacion_origen_id,'solicitud_id',p_id,'propuesta_sha256',p_sha,'preparacion_sha256',p_preparacion_sha,
  'kiosco_id',perfil.kiosco_id,'usuario_id',perfil.id,'actor_auth_id',p_actor_auth_id,'cuit_emisor',emisor.cuit_emisor,'punto_venta',emisor.punto_venta,
  'tipo_comprobante',contexto->'tipo_nota_credito','credencial_id',emisor.credencial_id,'certificado_sha256',emisor.certificado_sha256,
  'revision_emisor',emisor.revision,'revision_parametros',contexto->'revision_parametros','emision_habilitada',false));
END $$;
REVOKE ALL ON FUNCTION public.cargar_fuente_numeracion_nc_homologacion(uuid,uuid,uuid,uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_fuente_numeracion_nc_homologacion(uuid,uuid,uuid,uuid,text,text) TO service_role;
COMMIT;
