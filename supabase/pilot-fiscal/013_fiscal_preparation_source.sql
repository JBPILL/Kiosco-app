-- F08: fuente privada para preparar numeración/cuerpo. Requiere 001–012.
-- No instala ni habilita consulta ARCA o emisión. Sin filas/flags/credenciales.
BEGIN;
CREATE OR REPLACE FUNCTION public.cargar_fuente_preparacion_homologacion(p_actor_auth_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE binding jsonb; contexto jsonb; previa public.fiscal_preparaciones_homologacion%ROWTYPE;
 solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;
BEGIN
 binding:=public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 PERFORM public.fiscal_exigir_actor_preparacion(p_operacion_id,p_actor_auth_id);
 SELECT * INTO previa FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=p_operacion_id;
 IF NOT FOUND OR previa.actor_auth_id IS DISTINCT FROM p_actor_auth_id THEN
  RAISE EXCEPTION 'Faltan datos explícitos de preparación.' USING ERRCODE='42501'; END IF;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR SHARE;
 IF FOUND THEN
  IF (solicitud.cuerpo-'numero') IS DISTINCT FROM previa.datos->'datos' THEN
   RAISE EXCEPTION 'El cuerpo difiere de la preparación.' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('operacion_id',p_operacion_id,'estado','CUERPO_EXISTENTE','contexto',NULL,'canonico',NULL,'preparacion_sha256',NULL);
 END IF;
 contexto:=public.cargar_datos_preparacion_homologacion(p_actor_auth_id,(previa.datos->>'venta_id')::uuid);
 IF previa.credencial_id::text IS DISTINCT FROM binding->>'credencial_id'
  OR previa.certificado_sha256 IS DISTINCT FROM binding->>'certificado_sha256' OR previa.emisor_revision IS DISTINCT FROM (binding->>'revision')::integer
  OR previa.parametros_revision IS DISTINCT FROM (contexto->>'revision_parametros')::integer THEN
  RAISE EXCEPTION 'Cambió el contexto de preparación.' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('operacion_id',p_operacion_id,'estado','DATOS_PREPARADOS','contexto',contexto,'canonico',previa.canonico,'preparacion_sha256',previa.preparacion_sha256);
END $$;
REVOKE ALL ON FUNCTION public.cargar_fuente_preparacion_homologacion(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_fuente_preparacion_homologacion(uuid,uuid) TO service_role;
COMMIT;
