-- Fuente privada previa al envío NC; requiere001–042. No concede transporte.
-- No instalación remota, provisión de claves ni llamada ARCA automática.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_fuente_envio_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text,p_cuerpo_sha text,p_revision_id uuid,p_permiso_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE permiso jsonb; cuerpo jsonb; perfil public.usuarios%ROWTYPE; emisor public.fiscal_emisores_homologacion%ROWTYPE;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Requiere trabajador privado NC.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Fuente envío NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 -- Verificador toma lock de serie/permiso; toda autoridad se vuelve a comprobar.
 permiso:=public.verificar_permiso_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha,p_cuerpo_sha,p_revision_id,p_permiso_id);
 IF public.cargar_intencion_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha) IS NOT NULL THEN RAISE EXCEPTION 'Recuperar y conciliar intención NC existente; no preparar otro envío.' USING ERRCODE='55000'; END IF;
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 BEGIN SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Fuente envío NC no autorizada.' USING ERRCODE='42501'; END;
 SELECT * INTO emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=perfil.kiosco_id AND habilitado FOR SHARE;
 IF NOT FOUND OR emisor.cuit_emisor IS DISTINCT FROM cuerpo#>>'{reserva,cuit_emisor}' OR emisor.punto_venta IS DISTINCT FROM (cuerpo#>>'{reserva,punto_venta}')::integer THEN RAISE EXCEPTION 'Emisor NC distinto.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('cuerpo',cuerpo,'permiso',permiso,'binding',jsonb_build_object(
  'version',1,'entorno','HOMOLOGACION','servicio','wsfe','finalidad','ENVIO_NC',
  'venta_id',p_venta_id,'operacion_origen_id',p_operacion_origen_id,'solicitud_id',p_id,'propuesta_sha256',p_sha,
  'preparacion_sha256',permiso->'preparacion_sha256','solicitud_sha256',p_cuerpo_sha,'reserva_id',permiso->'reserva_id','revision_id',p_revision_id,'permiso_id',p_permiso_id,
  'kiosco_id',perfil.kiosco_id,'usuario_id',perfil.id,'actor_auth_id',p_actor_auth_id,
  'cuit_emisor',emisor.cuit_emisor,'punto_venta',emisor.punto_venta,'tipo_comprobante',cuerpo#>'{reserva,tipo_comprobante}','numero',cuerpo#>'{reserva,numero}',
  'credencial_id',emisor.credencial_id,'certificado_sha256',emisor.certificado_sha256,'revision_emisor',emisor.revision,
  'revision_parametros',cuerpo#>'{preparacion,contexto,revision_parametros}','emision_habilitada',false));
END $$;
REVOKE ALL ON FUNCTION public.cargar_fuente_envio_nc_homologacion(uuid,uuid,uuid,uuid,text,text,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_fuente_envio_nc_homologacion(uuid,uuid,uuid,uuid,text,text,uuid,uuid) TO service_role;
COMMIT;
