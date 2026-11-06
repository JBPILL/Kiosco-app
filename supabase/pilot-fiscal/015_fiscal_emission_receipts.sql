-- Auditoría de recepción, separada de autorización/conciliación. Requiere 001–014.
-- Sin SOAP, tokens, permisos nuevos ni liberación de reservas. Instalación por gate.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_respuestas_emision_homologacion (
 operacion_id uuid NOT NULL REFERENCES public.fiscal_solicitudes_homologacion(operacion_id),
 intento_id uuid NOT NULL,
 actor_auth_id uuid NOT NULL,
 solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
 respuesta jsonb NOT NULL CHECK(jsonb_typeof(respuesta)='object'),
 registrado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(operacion_id,intento_id)
);
ALTER TABLE public.fiscal_respuestas_emision_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_respuestas_emision_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
 WHERE attrelid='public.fiscal_respuestas_emision_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT (%s),UPDATE (%s),SELECT (%s),REFERENCES (%s) ON public.fiscal_respuestas_emision_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_respuestas_emision_homologacion','SELECT,INSERT,UPDATE,DELETE')
   OR has_any_column_privilege(rol,'public.fiscal_respuestas_emision_homologacion','SELECT,INSERT,UPDATE') THEN
   RAISE EXCEPTION 'Privilegios heredados en auditoría fiscal.'; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.fiscal_respuesta_emision_inmutable() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 RAISE EXCEPTION 'La recepción fiscal conserva su auditoría inmutable.' USING ERRCODE='55000';
END $$;
REVOKE ALL ON FUNCTION public.fiscal_respuesta_emision_inmutable() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_respuesta_emision_inmutable ON public.fiscal_respuestas_emision_homologacion;
CREATE TRIGGER fiscal_respuesta_emision_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_respuestas_emision_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_respuesta_emision_inmutable();

CREATE OR REPLACE FUNCTION public.fiscal_exigir_intento_respuesta(p_actor_auth_id uuid,p_operacion_id uuid,p_intento_id uuid,p_sha text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.fiscal_operaciones_homologacion%ROWTYPE; reserva public.fiscal_reservas_homologacion%ROWTYPE;
 solicitud public.fiscal_solicitudes_homologacion%ROWTYPE; permiso public.fiscal_permisos_emision_homologacion%ROWTYPE;
 revision public.fiscal_revisiones_homologacion%ROWTYPE;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) OR current_setting('transaction_isolation')<>'read committed'
  OR p_actor_auth_id IS NULL OR p_operacion_id IS NULL OR p_intento_id IS NULL OR p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$' THEN
  RAISE EXCEPTION 'Registro privado de respuesta no autorizado.' USING ERRCODE='42501'; END IF;
 -- Sólo vínculos históricos del envío ya consumido. Revocar/rotar después del envío
 -- no borra evidencia recibida; tampoco concede permiso para otro intento.
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id AND entorno='HOMOLOGACION' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Registro privado de respuesta no autorizado.' USING ERRCODE='42501'; END IF;
 SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=op.id FOR SHARE;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=op.id FOR SHARE;
 SELECT * INTO permiso FROM public.fiscal_permisos_emision_homologacion WHERE operacion_id=op.id FOR SHARE;
 SELECT * INTO revision FROM public.fiscal_revisiones_homologacion WHERE id=permiso.revision_aprobada_id FOR SHARE;
 IF reserva.estado IS NULL OR reserva.estado NOT IN ('ENVIO_INCIERTO','AUTORIZADA')
  OR reserva.intento_id IS DISTINCT FROM p_intento_id OR reserva.solicitud_sha256 IS DISTINCT FROM p_sha
  OR solicitud.solicitud_sha256 IS DISTINCT FROM p_sha OR solicitud.revision NOT IN (1,2)
  OR permiso.usado_por_intento IS DISTINCT FROM p_intento_id OR permiso.usado_en IS NULL
  OR permiso.solicitud_sha256 IS DISTINCT FROM p_sha OR revision.id IS NULL
  OR revision.operacion_id IS DISTINCT FROM op.id OR revision.usuario_id IS DISTINCT FROM op.usuario_id
  OR revision.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR revision.solicitud_sha256 IS DISTINCT FROM p_sha
  OR revision.solicitud_revision IS DISTINCT FROM 1 OR revision.credencial_id IS DISTINCT FROM permiso.credencial_id
  OR revision.certificado_sha256 IS DISTINCT FROM permiso.certificado_sha256 OR revision.emisor_revision IS DISTINCT FROM permiso.emisor_revision THEN
  RAISE EXCEPTION 'Registro privado de respuesta no autorizado.' USING ERRCODE='42501'; END IF;
 PERFORM public.fiscal_exigir_actor_preparacion(op.id,p_actor_auth_id);
END $$;
REVOKE ALL ON FUNCTION public.fiscal_exigir_intento_respuesta(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.cargar_respuesta_emision_homologacion(p_actor_auth_id uuid,p_operacion_id uuid,p_intento_id uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE respuesta public.fiscal_respuestas_emision_homologacion%ROWTYPE;
BEGIN
 PERFORM public.fiscal_exigir_intento_respuesta(p_actor_auth_id,p_operacion_id,p_intento_id,p_sha);
 SELECT * INTO respuesta FROM public.fiscal_respuestas_emision_homologacion WHERE operacion_id=p_operacion_id AND intento_id=p_intento_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF respuesta.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR respuesta.solicitud_sha256 IS DISTINCT FROM p_sha THEN
  RAISE EXCEPTION 'Respuesta fiscal inconsistente.' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('operacion_id',p_operacion_id,'intento_id',p_intento_id,'solicitud_sha256',p_sha,'respuesta',respuesta.respuesta,'registrada',true);
END $$;
CREATE OR REPLACE FUNCTION public.registrar_respuesta_emision_homologacion(p_actor_auth_id uuid,p_operacion_id uuid,p_intento_id uuid,p_sha text,p_respuesta jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE anterior public.fiscal_respuestas_emision_homologacion%ROWTYPE; codigo jsonb;
BEGIN
 PERFORM public.fiscal_exigir_intento_respuesta(p_actor_auth_id,p_operacion_id,p_intento_id,p_sha);
 IF jsonb_typeof(p_respuesta) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Respuesta fiscal inválida.' USING ERRCODE='22023'; END IF;
 IF (SELECT count(*) FROM jsonb_object_keys(p_respuesta))<>3 OR NOT(p_respuesta ?& ARRAY['estado','codigos','puedeReenviar'])
  OR jsonb_typeof(p_respuesta->'estado') IS DISTINCT FROM 'string'
  OR p_respuesta->>'estado' NOT IN ('APROBACION_RECIBIDA','RECHAZO_RECIBIDO','SIN_CONFIRMACION')
  OR p_respuesta->'puedeReenviar' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(p_respuesta->'codigos') IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'Respuesta fiscal inválida.' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_respuesta->'codigos')>200 THEN RAISE EXCEPTION 'Demasiados códigos fiscales.' USING ERRCODE='22023'; END IF;
 FOR codigo IN SELECT value FROM jsonb_array_elements(p_respuesta->'codigos') LOOP
  IF jsonb_typeof(codigo) IS DISTINCT FROM 'number' OR codigo::text !~ '^[1-9][0-9]{0,9}$' THEN
   RAISE EXCEPTION 'Código fiscal inválido.' USING ERRCODE='22023'; END IF;
  IF (codigo::text)::numeric>2147483647 THEN RAISE EXCEPTION 'Código fiscal inválido.' USING ERRCODE='22023'; END IF;
 END LOOP;
 SELECT * INTO anterior FROM public.fiscal_respuestas_emision_homologacion WHERE operacion_id=p_operacion_id AND intento_id=p_intento_id;
 IF FOUND THEN
  IF anterior.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR anterior.solicitud_sha256 IS DISTINCT FROM p_sha OR anterior.respuesta IS DISTINCT FROM p_respuesta THEN
   RAISE EXCEPTION 'Respuesta fiscal contradictoria; conservar auditoría original.' USING ERRCODE='22023'; END IF;
 ELSE
  INSERT INTO public.fiscal_respuestas_emision_homologacion(operacion_id,intento_id,actor_auth_id,solicitud_sha256,respuesta)
   VALUES(p_operacion_id,p_intento_id,p_actor_auth_id,p_sha,p_respuesta);
 END IF;
 RETURN public.cargar_respuesta_emision_homologacion(p_actor_auth_id,p_operacion_id,p_intento_id,p_sha);
END $$;
REVOKE ALL ON FUNCTION public.cargar_respuesta_emision_homologacion(uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.registrar_respuesta_emision_homologacion(uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_respuesta_emision_homologacion(uuid,uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_respuesta_emision_homologacion(uuid,uuid,uuid,text,jsonb) TO service_role;
COMMIT;
