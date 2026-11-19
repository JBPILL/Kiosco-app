-- Respuesta candidata NC privada/inmutable: no acredita CAE ni permite reenvío.
-- Requiere001–048; SQL valida enlace/forma, no procedencia SOAP/ARCA.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_respuestas_envio_homologacion(
 intento_id uuid PRIMARY KEY REFERENCES public.fiscal_nc_intenciones_homologacion(intento_id),
 solicitud_id uuid NOT NULL UNIQUE REFERENCES public.fiscal_nc_intenciones_homologacion(solicitud_id),
 actor_auth_id uuid NOT NULL,solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
 datos jsonb NOT NULL,creada_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.fiscal_nc_respuestas_envio_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_nc_respuestas_envio_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid='public.fiscal_nc_respuestas_envio_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.fiscal_nc_respuestas_envio_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_nc_respuestas_envio_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_nc_respuestas_envio_homologacion','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Respuesta NC expuesta.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_nc_respuesta_inmutable ON public.fiscal_nc_respuestas_envio_homologacion;
CREATE TRIGGER fiscal_nc_respuesta_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_nc_respuestas_envio_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();
CREATE OR REPLACE FUNCTION public.cargar_respuesta_envio_nc_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE intento jsonb; respuesta public.fiscal_nc_respuestas_envio_homologacion%ROWTYPE;
BEGIN
 intento:=public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF intento IS NULL THEN RAISE EXCEPTION 'Respuesta requiere intención NC.' USING ERRCODE='55000'; END IF;
 SELECT * INTO respuesta FROM public.fiscal_nc_respuestas_envio_homologacion WHERE solicitud_id=p_caso FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF respuesta.intento_id::text IS DISTINCT FROM intento->>'intento_id' OR respuesta.actor_auth_id IS DISTINCT FROM p_actor OR respuesta.solicitud_sha256 IS DISTINCT FROM intento->>'solicitud_sha256' THEN RAISE EXCEPTION 'Respuesta NC ajena.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version',1,'solicitud_id',p_caso,'intento_id',respuesta.intento_id,'solicitud_sha256',respuesta.solicitud_sha256,'estado','RESPUESTA_NC_REGISTRADA_NO_CONFIRMADA','observacion',respuesta.datos,'emision_habilitada',false,'reintegro_habilitado',false,'reposicion_habilitada',false);
END $$;
CREATE OR REPLACE FUNCTION public.registrar_respuesta_envio_nc_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text,p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE intento jsonb; cuerpo jsonb; previa jsonb; resultado jsonb; codigo jsonb; instante timestamptz; inicio timestamptz;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Respuesta NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 intento:=public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF intento IS NULL THEN RAISE EXCEPTION 'Requiere intención NC durable.' USING ERRCODE='55000'; END IF;
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 PERFORM 1 FROM public.fiscal_nc_series_homologacion WHERE cuit_emisor=cuerpo#>>'{reserva,cuit_emisor}' AND punto_venta=(cuerpo#>>'{reserva,punto_venta}')::integer AND tipo_comprobante=(cuerpo#>>'{reserva,tipo_comprobante}')::integer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Serie NC no disponible.' USING ERRCODE='55000'; END IF;
 -- Identidad actual se vuelve a comprobar después de la espera.
 PERFORM public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 previa:=public.cargar_respuesta_envio_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF previa IS NOT NULL THEN
  IF previa->'observacion' IS DISTINCT FROM p_datos THEN RAISE EXCEPTION 'Intención NC con otra respuesta.' USING ERRCODE='22023'; END IF;
  RETURN previa;
 END IF;
 PERFORM public.checkout_objeto(p_datos,ARRAY['intento_id','solicitud_sha256','recibido_en','resultado','emision_habilitada']);
 IF jsonb_typeof(p_datos->'intento_id') IS DISTINCT FROM 'string' OR p_datos->>'intento_id' IS DISTINCT FROM intento->>'intento_id' OR jsonb_typeof(p_datos->'solicitud_sha256') IS DISTINCT FROM 'string' OR p_datos->>'solicitud_sha256' IS DISTINCT FROM intento->>'solicitud_sha256' OR p_datos->'emision_habilitada' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(p_datos->'recibido_en') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Identidad de respuesta NC distinta.' USING ERRCODE='22023'; END IF;
 instante:=(p_datos->>'recibido_en')::timestamptz;
 SELECT creado_en INTO inicio FROM public.fiscal_nc_intenciones_homologacion WHERE solicitud_id=p_caso;
 IF NOT isfinite(instante) OR instante<inicio OR instante>clock_timestamp()+interval '5 seconds' OR instante<clock_timestamp()-interval '5 minutes' THEN RAISE EXCEPTION 'Fecha de respuesta NC no vigente.' USING ERRCODE='22023'; END IF;
 resultado:=p_datos->'resultado';PERFORM public.checkout_objeto(resultado,ARRAY['estado','codigos','puedeReenviar']);
 IF resultado->>'estado' IS NULL OR resultado->>'estado' NOT IN ('APROBACION_RECIBIDA','RECHAZO_RECIBIDO','SIN_CONFIRMACION') OR resultado->'puedeReenviar' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(resultado->'codigos') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Candidato NC inválido.' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(resultado->'codigos')>200 THEN RAISE EXCEPTION 'Demasiados códigos NC.' USING ERRCODE='22023'; END IF;
 FOR codigo IN SELECT value FROM jsonb_array_elements(resultado->'codigos') LOOP
  IF jsonb_typeof(codigo) IS DISTINCT FROM 'number' OR codigo::text !~ '^[1-9][0-9]{0,9}$' OR codigo::text::numeric>2147483647 THEN RAISE EXCEPTION 'Código NC inválido.' USING ERRCODE='22023'; END IF;
 END LOOP;
 INSERT INTO public.fiscal_nc_respuestas_envio_homologacion(intento_id,solicitud_id,actor_auth_id,solicitud_sha256,datos) VALUES((intento->>'intento_id')::uuid,p_caso,p_actor,intento->>'solicitud_sha256',p_datos);
 RETURN public.cargar_respuesta_envio_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
END $$;
REVOKE ALL ON FUNCTION public.cargar_respuesta_envio_nc_homologacion(uuid,uuid,uuid,uuid,text),public.registrar_respuesta_envio_nc_homologacion(uuid,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_respuesta_envio_nc_homologacion(uuid,uuid,uuid,uuid,text),public.registrar_respuesta_envio_nc_homologacion(uuid,uuid,uuid,uuid,text,jsonb) TO service_role;
COMMIT;
