-- Toda intención nueva exige preparación explícita y revisión de representación.
-- No reescribe historia ni convierte intentos existentes en nuevos envíos.
BEGIN;
CREATE OR REPLACE FUNCTION public.fiscal_exigir_presentacion_envio(p_actor_auth_id uuid,p_operacion_id uuid,p_sha text,p_revision_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE binding jsonb; contexto jsonb; revisada jsonb; hechos jsonb; selected_revision uuid;
 prep public.fiscal_preparaciones_homologacion%ROWTYPE; solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;
 op public.fiscal_operaciones_homologacion%ROWTYPE; vinculo public.fiscal_revisiones_presentacion_homologacion%ROWTYPE;
BEGIN
 binding:=public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 SELECT * INTO prep FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=p_operacion_id FOR SHARE;
 IF NOT FOUND OR prep.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR prep.credencial_id::text IS DISTINCT FROM binding->>'credencial_id'
  OR prep.certificado_sha256 IS DISTINCT FROM binding->>'certificado_sha256' OR prep.emisor_revision IS DISTINCT FROM (binding->>'revision')::integer THEN
  RAISE EXCEPTION 'Falta preparación explícita original para un envío nuevo.' USING ERRCODE='42501'; END IF;
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id;
 contexto:=public.cargar_datos_preparacion_homologacion(p_actor_auth_id,op.venta_id);
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR SHARE;
 IF solicitud.operacion_id IS NULL OR p_sha IS NULL OR solicitud.solicitud_sha256 IS DISTINCT FROM p_sha OR solicitud.revision IS DISTINCT FROM 1
  OR solicitud.cuerpo-'numero' IS DISTINCT FROM prep.datos->'datos' OR prep.datos IS DISTINCT FROM prep.canonico::jsonb
  OR prep.preparacion_sha256 IS DISTINCT FROM encode(sha256(convert_to(prep.canonico,'UTF8')),'hex')
  OR prep.parametros_revision IS DISTINCT FROM (contexto->>'revision_parametros')::integer OR contexto->'incluye_recepcion_envases' IS DISTINCT FROM 'false'::jsonb THEN
  RAISE EXCEPTION 'Preparación o cuerpo cambiaron antes del envío.' USING ERRCODE='40001'; END IF;
 hechos:=public.cargar_presentacion_fiscal_homologacion(p_actor_auth_id,op.venta_id,p_operacion_id);
 IF hechos IS NULL OR hechos->>'solicitud_sha256' IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Faltan hechos históricos para el envío.' USING ERRCODE='42501'; END IF;
 revisada:=public.cargar_revision_fiscal_homologacion(p_operacion_id,p_actor_auth_id);
 selected_revision:=(revisada#>>'{aprobacion,id}')::uuid;
 IF selected_revision IS NULL OR p_revision_id IS NOT NULL AND selected_revision IS DISTINCT FROM p_revision_id THEN
  RAISE EXCEPTION 'Falta revisión vigente exacta para el envío.' USING ERRCODE='42501'; END IF;
 SELECT * INTO vinculo FROM public.fiscal_revisiones_presentacion_homologacion WHERE revision_id=selected_revision FOR SHARE;
 IF NOT FOUND OR vinculo.operacion_id IS DISTINCT FROM p_operacion_id OR vinculo.presentacion_sha256 IS DISTINCT FROM hechos->>'presentacion_sha256'
  OR (revisada#>>'{aprobacion,vence_en}')::timestamptz<=clock_timestamp() THEN
  RAISE EXCEPTION 'La revisión no confirmó esta representación.' USING ERRCODE='42501'; END IF;
 -- Parámetros pueden vencer mientras se espera el último lock del vínculo.
 contexto:=public.cargar_datos_preparacion_homologacion(p_actor_auth_id,op.venta_id);
 IF prep.parametros_revision IS DISTINCT FROM (contexto->>'revision_parametros')::integer THEN
  RAISE EXCEPTION 'Cambiaron parámetros después de los locks.' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('operacion_id',p_operacion_id,'solicitud_sha256',p_sha,'presentacion_sha256',vinculo.presentacion_sha256,'revision_id',selected_revision,'emision_habilitada',false);
END $$;
REVOKE ALL ON FUNCTION public.fiscal_exigir_presentacion_envio(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.autorizar_envio_presentado_homologacion(p_actor_auth_id uuid,p_operacion_id uuid,p_sha text,p_revision_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF p_revision_id IS NULL THEN RAISE EXCEPTION 'Revisión exacta requerida.' USING ERRCODE='22023'; END IF;
 RETURN public.fiscal_exigir_presentacion_envio(p_actor_auth_id,p_operacion_id,p_sha,p_revision_id);
END $$;
REVOKE ALL ON FUNCTION public.autorizar_envio_presentado_homologacion(uuid,uuid,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.autorizar_envio_presentado_homologacion(uuid,uuid,text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.fiscal_presentacion_antes_intencion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor uuid;
BEGIN
 IF OLD.intento_id IS NULL AND NEW.intento_id IS NOT NULL THEN
  SELECT actor_auth_id INTO actor FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=NEW.operacion_id;
  IF actor IS NULL THEN RAISE EXCEPTION 'No hay fallback heredado para intenciones nuevas.' USING ERRCODE='42501'; END IF;
  PERFORM public.fiscal_exigir_presentacion_envio(actor,NEW.operacion_id,NEW.solicitud_sha256,NULL);
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_presentacion_antes_intencion() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_presentacion_antes_intencion ON public.fiscal_reservas_homologacion;
CREATE TRIGGER fiscal_presentacion_antes_intencion BEFORE UPDATE ON public.fiscal_reservas_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_presentacion_antes_intencion();
-- 009/011 llaman el helper como SECURITY DEFINER, no desde el cliente privado.
REVOKE ALL ON FUNCTION public.registrar_intento_fiscal_homologacion(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
