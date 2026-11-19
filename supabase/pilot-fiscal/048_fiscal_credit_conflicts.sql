-- Conflictos NC durables, sin resolución automática ni efecto comercial.
-- Requiere001–047. No acredita procedencia ARCA; sólo trabajador privado validado.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_conflictos_homologacion(
 consulta_id uuid PRIMARY KEY REFERENCES public.fiscal_nc_consultas_homologacion(id),
 solicitud_id uuid NOT NULL REFERENCES public.fiscal_nc_intenciones_homologacion(solicitud_id),
 codigo text NOT NULL CHECK(codigo IN ('CAE_CONTRADICTORIO','DATOS_DISTINTOS')),
 creada_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.fiscal_nc_conflictos_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_nc_conflictos_homologacion FROM PUBLIC,anon,authenticated,service_role;
REVOKE SELECT(consulta_id,solicitud_id,codigo,creada_en),INSERT(consulta_id,solicitud_id,codigo,creada_en),UPDATE(consulta_id,solicitud_id,codigo,creada_en),REFERENCES(consulta_id,solicitud_id,codigo,creada_en) ON public.fiscal_nc_conflictos_homologacion FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_nc_conflicto_inmutable ON public.fiscal_nc_conflictos_homologacion;
CREATE TRIGGER fiscal_nc_conflicto_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_nc_conflictos_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();
CREATE OR REPLACE FUNCTION public.cargar_consulta_nc_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text,p_consulta uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE intento jsonb; consulta public.fiscal_nc_consultas_homologacion%ROWTYPE;
BEGIN
 intento:=public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF intento IS NULL THEN RAISE EXCEPTION 'Consulta requiere intención NC.' USING ERRCODE='55000'; END IF;
 IF p_consulta IS NULL THEN RAISE EXCEPTION 'Conservar UUID de consulta.' USING ERRCODE='22023'; END IF;
 SELECT * INTO consulta FROM public.fiscal_nc_consultas_homologacion WHERE id=p_consulta FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF consulta.solicitud_id IS DISTINCT FROM p_caso OR consulta.actor_auth_id IS DISTINCT FROM p_actor OR consulta.intento_id::text IS DISTINCT FROM intento->>'intento_id'
  OR consulta.solicitud_sha256 IS DISTINCT FROM intento->>'solicitud_sha256' THEN RAISE EXCEPTION 'Consulta NC ajena.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version',1,'consulta_id',p_consulta,'solicitud_id',p_caso,'intento_id',consulta.intento_id,'solicitud_sha256',consulta.solicitud_sha256,
  'estado',CASE WHEN EXISTS(SELECT 1 FROM public.fiscal_nc_conflictos_homologacion WHERE consulta_id=p_consulta) THEN 'CONFLICTO_NC_NO_APLICAR' WHEN consulta.datos#>>'{resultado,estado}'='AUTORIZACION_NC_COINCIDENTE' THEN 'CAE_NC_REGISTRADO_NO_APLICADO' ELSE 'CONSULTA_NC_REGISTRADA' END,
  'observacion',consulta.datos,'emision_habilitada',false,'reintegro_habilitado',false,'reposicion_habilitada',false);
END $$;
CREATE OR REPLACE FUNCTION public.registrar_consulta_nc_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text,p_consulta uuid,p_datos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE intento jsonb; cuerpo jsonb; previa jsonb; resultado jsonb; autorizado public.fiscal_nc_autorizaciones_homologacion%ROWTYPE;
 instante timestamptz; inicio timestamptz; fecha text; vence text; proceso text; conflicto text;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Diario NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF p_consulta IS NULL THEN RAISE EXCEPTION 'Conservar UUID de consulta.' USING ERRCODE='22023'; END IF;
 intento:=public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF intento IS NULL THEN RAISE EXCEPTION 'Requiere intención durable.' USING ERRCODE='55000'; END IF;
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 PERFORM 1 FROM public.fiscal_nc_series_homologacion WHERE cuit_emisor=cuerpo#>>'{reserva,cuit_emisor}' AND punto_venta=(cuerpo#>>'{reserva,punto_venta}')::integer AND tipo_comprobante=(cuerpo#>>'{reserva,tipo_comprobante}')::integer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Serie NC no disponible.' USING ERRCODE='55000'; END IF;
 PERFORM public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 previa:=public.cargar_consulta_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha,p_consulta);
 IF previa IS NOT NULL THEN
  IF previa->'observacion' IS DISTINCT FROM p_datos THEN RAISE EXCEPTION 'UUID consulta con otros datos.' USING ERRCODE='22023'; END IF;
  RETURN previa;
 END IF;
 PERFORM public.checkout_objeto(p_datos,ARRAY['intento_id','solicitud_sha256','consultado_en','resultado','emision_habilitada']);
 IF p_datos->>'intento_id' IS DISTINCT FROM intento->>'intento_id' OR p_datos->>'solicitud_sha256' IS DISTINCT FROM intento->>'solicitud_sha256'
  OR jsonb_typeof(p_datos->'intento_id') IS DISTINCT FROM 'string' OR jsonb_typeof(p_datos->'solicitud_sha256') IS DISTINCT FROM 'string' OR p_datos->'emision_habilitada' IS DISTINCT FROM 'false'::jsonb OR jsonb_typeof(p_datos->'consultado_en') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'Identidad de consulta NC distinta.' USING ERRCODE='22023'; END IF;
 instante:=(p_datos->>'consultado_en')::timestamptz;
 SELECT creado_en INTO inicio FROM public.fiscal_nc_intenciones_homologacion WHERE solicitud_id=p_caso;
 IF NOT isfinite(instante) OR instante<inicio OR instante>clock_timestamp()+interval '5 seconds' OR instante<clock_timestamp()-interval '5 minutes' THEN RAISE EXCEPTION 'Fecha consulta no vigente.' USING ERRCODE='22023'; END IF;
 resultado:=p_datos->'resultado';
 IF resultado->>'estado'='CONCILIAR' THEN
  PERFORM public.checkout_objeto(resultado,ARRAY['estado','codigo','puedeReenviar']);
  IF resultado->>'codigo' IS NULL OR resultado->>'codigo' NOT IN ('RESPUESTA_INVALIDA','SIN_CONFIRMACION','DATOS_DISTINTOS','ASOCIACION_INCOMPLETA') THEN RAISE EXCEPTION 'Resultado NC no admitido.' USING ERRCODE='22023'; END IF;
  IF resultado->>'codigo'='DATOS_DISTINTOS' THEN conflicto:='DATOS_DISTINTOS'; END IF;
 ELSIF resultado->>'estado'='AUTORIZACION_NC_COINCIDENTE' THEN
  PERFORM public.checkout_objeto(resultado,ARRAY['estado','cae','vencimiento','procesadoEn','solicitudSha256','puedeReenviar']);
  IF jsonb_typeof(resultado->'solicitudSha256') IS DISTINCT FROM 'string' OR resultado->>'solicitudSha256' IS DISTINCT FROM intento->>'solicitud_sha256' OR jsonb_typeof(resultado->'cae') IS DISTINCT FROM 'string'
   OR resultado->>'cae' !~ '^[0-9]{14}$' OR resultado->>'cae' ~ '^0+$' OR jsonb_typeof(resultado->'procesadoEn') IS DISTINCT FROM 'string' THEN RAISE EXCEPTION 'CAE NC inválido.' USING ERRCODE='22023'; END IF;
  fecha:=(cuerpo#>>'{cuerpo,canonico}')::jsonb#>>'{solicitud,fecha}';
  vence:=public.fiscal_fecha_catalogo_nc(resultado->'vencimiento');proceso:=resultado->>'procesadoEn';
  IF proceso !~ '^[0-9]{8}([0-9]{6})?$' OR public.fiscal_fecha_catalogo_nc(to_jsonb(left(proceso,8)))<fecha OR left(proceso,8)>vence OR vence<fecha
   OR (length(proceso)=14 AND (substr(proceso,9,2)::integer>23 OR substr(proceso,11,2)::integer>59 OR substr(proceso,13,2)::integer>59)) THEN RAISE EXCEPTION 'Fechas CAE NC inválidas.' USING ERRCODE='22023'; END IF;
  SELECT * INTO autorizado FROM public.fiscal_nc_autorizaciones_homologacion WHERE solicitud_id=p_caso FOR SHARE;
  IF FOUND AND (autorizado.cae IS DISTINCT FROM resultado->>'cae' OR autorizado.vencimiento IS DISTINCT FROM vence OR autorizado.solicitud_sha256 IS DISTINCT FROM intento->>'solicitud_sha256') THEN conflicto:='CAE_CONTRADICTORIO'; END IF;
 ELSE RAISE EXCEPTION 'Resultado NC no admitido.' USING ERRCODE='22023'; END IF;
 IF resultado->'puedeReenviar' IS DISTINCT FROM 'false'::jsonb THEN RAISE EXCEPTION 'Consulta no concede reenvío.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.fiscal_nc_consultas_homologacion(id,solicitud_id,intento_id,actor_auth_id,solicitud_sha256,datos) VALUES(p_consulta,p_caso,(intento->>'intento_id')::uuid,p_actor,intento->>'solicitud_sha256',p_datos);
 IF conflicto IS NOT NULL THEN
  INSERT INTO public.fiscal_nc_conflictos_homologacion(consulta_id,solicitud_id,codigo) VALUES(p_consulta,p_caso,conflicto);
 END IF;
 IF conflicto IS NULL AND resultado->>'estado'='AUTORIZACION_NC_COINCIDENTE' AND autorizado.solicitud_id IS NULL THEN
  INSERT INTO public.fiscal_nc_autorizaciones_homologacion(solicitud_id,consulta_id,intento_id,solicitud_sha256,cae,vencimiento) VALUES(p_caso,p_consulta,(intento->>'intento_id')::uuid,intento->>'solicitud_sha256',resultado->>'cae',vence);
 END IF;
 RETURN public.cargar_consulta_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha,p_consulta);
END $$;
-- Recuperación por caso aun si el consumidor perdió su UUID de consulta.
CREATE OR REPLACE FUNCTION public.cargar_autorizacion_nc_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE intento jsonb; autorizado public.fiscal_nc_autorizaciones_homologacion%ROWTYPE; conflicto uuid;
BEGIN
 intento:=public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF intento IS NULL THEN RAISE EXCEPTION 'Requiere intención NC.' USING ERRCODE='55000'; END IF;
 SELECT consulta_id INTO conflicto FROM public.fiscal_nc_conflictos_homologacion WHERE solicitud_id=p_caso ORDER BY creada_en,consulta_id LIMIT 1;
 IF FOUND THEN RETURN public.cargar_consulta_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha,conflicto); END IF;
 SELECT * INTO autorizado FROM public.fiscal_nc_autorizaciones_homologacion WHERE solicitud_id=p_caso FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF autorizado.intento_id::text IS DISTINCT FROM intento->>'intento_id' OR autorizado.solicitud_sha256 IS DISTINCT FROM intento->>'solicitud_sha256' THEN RAISE EXCEPTION 'Autorización NC distinta.' USING ERRCODE='42501'; END IF;
 RETURN public.cargar_consulta_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha,autorizado.consulta_id);
END $$;
REVOKE ALL ON FUNCTION public.cargar_autorizacion_nc_homologacion(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_autorizacion_nc_homologacion(uuid,uuid,uuid,uuid,text) TO service_role;
REVOKE ALL ON FUNCTION public.cargar_consulta_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid),public.registrar_consulta_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_consulta_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid),public.registrar_consulta_nc_homologacion(uuid,uuid,uuid,uuid,text,uuid,jsonb) TO service_role;

-- Gate para futura aplicación: mantener el lock hasta completar la transacción.
-- Ausencia de conflicto NO acredita CAE ni autorización de aplicación.
CREATE OR REPLACE FUNCTION public.exigir_nc_sin_conflictos_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cuerpo jsonb;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Gate NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha) IS NULL THEN RAISE EXCEPTION 'Requiere intención NC.' USING ERRCODE='55000'; END IF;
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 PERFORM 1 FROM public.fiscal_nc_series_homologacion WHERE cuit_emisor=cuerpo#>>'{reserva,cuit_emisor}' AND punto_venta=(cuerpo#>>'{reserva,punto_venta}')::integer AND tipo_comprobante=(cuerpo#>>'{reserva,tipo_comprobante}')::integer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Serie NC no disponible.' USING ERRCODE='55000'; END IF;
 PERFORM public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_conflictos_homologacion WHERE solicitud_id=p_caso) THEN RAISE EXCEPTION 'Conflicto NC pendiente: no aplicar.' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.exigir_nc_sin_conflictos_homologacion(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.exigir_nc_sin_conflictos_homologacion(uuid,uuid,uuid,uuid,text) TO service_role;
COMMIT;
