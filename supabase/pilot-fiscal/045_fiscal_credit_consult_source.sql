-- Fuente exclusiva de consulta/reconciliación NC ya intentada. Requiere001–044.
-- No renueva permiso de envío, no transmite, no instala remotamente.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_fuente_consulta_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE intento jsonb; cuerpo jsonb; perfil public.usuarios%ROWTYPE; emisor public.fiscal_emisores_homologacion%ROWTYPE; permiso public.fiscal_nc_permisos_homologacion%ROWTYPE;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Requiere trabajador privado NC.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Consulta NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 intento:=public.cargar_intencion_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF intento IS NULL THEN RAISE EXCEPTION 'Consulta NC requiere intención durable.' USING ERRCODE='55000'; END IF;
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 BEGIN SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Consulta NC no autorizada.' USING ERRCODE='42501'; END;
 IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin IS DISTINCT FROM false OR perfil.kiosco_id IS NULL
  OR perfil.kiosco_id IS DISTINCT FROM (SELECT kiosco_id FROM public.ventas WHERE id=p_venta_id) THEN RAISE EXCEPTION 'Consulta NC no autorizada.' USING ERRCODE='42501'; END IF;
 SELECT * INTO permiso FROM public.fiscal_nc_permisos_homologacion WHERE id=(intento->>'permiso_id')::uuid FOR SHARE;
 IF NOT FOUND OR permiso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR permiso.solicitud_id IS DISTINCT FROM p_id
  OR permiso.solicitud_sha256 IS DISTINCT FROM intento->>'solicitud_sha256' THEN RAISE EXCEPTION 'Autoridad histórica NC distinta.' USING ERRCODE='42501'; END IF;
 -- Vencimiento/revocación de envío no borra la incertidumbre. Custodia global sí
 -- debe seguir habilitada y coincidir: ninguna rotación adopta otra clave implícitamente.
 SELECT * INTO emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=perfil.kiosco_id AND habilitado FOR SHARE;
 IF NOT FOUND OR emisor.credencial_id IS DISTINCT FROM permiso.credencial_id OR emisor.certificado_sha256 IS DISTINCT FROM permiso.certificado_sha256
  OR emisor.revision IS DISTINCT FROM permiso.emisor_revision OR emisor.cuit_emisor IS DISTINCT FROM cuerpo#>>'{reserva,cuit_emisor}'
  OR emisor.punto_venta IS DISTINCT FROM (cuerpo#>>'{reserva,punto_venta}')::integer THEN RAISE EXCEPTION 'Custodia NC no disponible para consulta.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('cuerpo',cuerpo,'intencion',intento,'binding',jsonb_build_object(
  'version',1,'entorno','HOMOLOGACION','servicio','wsfe','finalidad','CONSULTA_NC','venta_id',p_venta_id,'operacion_origen_id',p_operacion_origen_id,'solicitud_id',p_id,
  'propuesta_sha256',p_sha,'preparacion_sha256',intento->'preparacion_sha256','solicitud_sha256',intento->'solicitud_sha256','reserva_id',intento->'reserva_id',
  'revision_id',intento->'revision_id','permiso_id',intento->'permiso_id','intento_id',intento->'intento_id',
  'kiosco_id',perfil.kiosco_id,'usuario_id',perfil.id,'actor_auth_id',p_actor_auth_id,'cuit_emisor',emisor.cuit_emisor,'punto_venta',emisor.punto_venta,
  'tipo_comprobante',cuerpo#>'{reserva,tipo_comprobante}','numero',cuerpo#>'{reserva,numero}','credencial_id',emisor.credencial_id,'certificado_sha256',emisor.certificado_sha256,
  'revision_emisor',emisor.revision,'revision_parametros',cuerpo#>'{preparacion,contexto,revision_parametros}','emision_habilitada',false));
END $$;
REVOKE ALL ON FUNCTION public.cargar_fuente_consulta_nc_homologacion(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_fuente_consulta_nc_homologacion(uuid,uuid,uuid,uuid,text) TO service_role;
COMMIT;
