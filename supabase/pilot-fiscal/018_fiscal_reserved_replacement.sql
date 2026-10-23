-- F08: corrección reservada ANTES de intención; requiere 001–017 de esta revisión.
-- Conserva número/serie y cuerpos originales. Sin consulta ni emisión ARCA.
BEGIN;
ALTER TABLE public.fiscal_operaciones_homologacion DROP CONSTRAINT IF EXISTS fiscal_operacion_estado_lifecycle;
ALTER TABLE public.fiscal_operaciones_homologacion ADD CONSTRAINT fiscal_operacion_estado_lifecycle CHECK(estado IN ('PREPARADA','CANCELADA','SUSTITUIDA'));
CREATE TABLE IF NOT EXISTS public.fiscal_sustituciones_homologacion (
 operacion_id uuid PRIMARY KEY REFERENCES public.fiscal_operaciones_homologacion(id),
 sucesora_id uuid NOT NULL UNIQUE REFERENCES public.fiscal_operaciones_homologacion(id) DEFERRABLE INITIALLY DEFERRED,
 venta_id uuid NOT NULL REFERENCES public.ventas(id),
 actor_auth_id uuid NOT NULL,
 anterior_sha256 text NOT NULL CHECK(anterior_sha256 ~ '^[0-9a-f]{64}$'),
 preparacion_sha256 text NOT NULL CHECK(preparacion_sha256 ~ '^[0-9a-f]{64}$'),
 sucesora_sha256 text NOT NULL CHECK(sucesora_sha256 ~ '^[0-9a-f]{64}$'),
 reserva_original jsonb NOT NULL CHECK(jsonb_typeof(reserva_original)='object'),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(operacion_id<>sucesora_id)
);
ALTER TABLE public.fiscal_sustituciones_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_sustituciones_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
 WHERE attrelid='public.fiscal_sustituciones_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT (%s),INSERT (%s),UPDATE (%s),REFERENCES (%s) ON public.fiscal_sustituciones_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_sustituciones_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_sustituciones_homologacion','SELECT,INSERT,UPDATE') THEN
   RAISE EXCEPTION 'Privilegios heredados en sustitución fiscal.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_sustitucion_inmutable ON public.fiscal_sustituciones_homologacion;
CREATE TRIGGER fiscal_sustitucion_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_sustituciones_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();
CREATE OR REPLACE FUNCTION public.fiscal_operacion_conservar_cancelacion() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cancelacion public.fiscal_cancelaciones_preparacion_homologacion%ROWTYPE;
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'La operación fiscal conserva su historial.' USING ERRCODE='55000'; END IF;
 IF TG_OP='INSERT' THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:operation:'||NEW.id::text,0));
  SELECT * INTO cancelacion FROM public.fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=NEW.id;
  IF NEW.estado IS DISTINCT FROM 'PREPARADA' OR cancelacion.operacion_id IS NOT NULL THEN
   RAISE EXCEPTION 'Identidad fiscal cancelada; no reactivar.' USING ERRCODE='55000'; END IF;
 ELSE
  SELECT * INTO cancelacion FROM public.fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=NEW.id;
  IF (to_jsonb(NEW)-'estado') IS DISTINCT FROM (to_jsonb(OLD)-'estado') THEN
   RAISE EXCEPTION 'La operación fiscal conserva sus datos originales.' USING ERRCODE='55000'; END IF;
  IF NEW.estado='SUSTITUIDA' AND OLD.estado='PREPARADA' THEN
   IF NOT EXISTS(SELECT 1 FROM public.fiscal_sustituciones_homologacion x
    JOIN public.fiscal_preparaciones_homologacion p ON p.operacion_id=x.operacion_id AND p.actor_auth_id=x.actor_auth_id
    JOIN public.fiscal_solicitudes_homologacion s ON s.operacion_id=x.operacion_id AND s.solicitud_sha256=x.anterior_sha256 AND s.revision=1
    JOIN public.fiscal_reservas_homologacion r ON r.operacion_id=x.operacion_id AND to_jsonb(r)=x.reserva_original
    WHERE x.operacion_id=OLD.id AND x.venta_id=OLD.venta_id AND r.estado='RESERVADA' AND r.intento_id IS NULL AND r.intento_en IS NULL)
    OR EXISTS(SELECT 1 FROM public.fiscal_permisos_emision_homologacion WHERE operacion_id=OLD.id AND usado_por_intento IS NOT NULL) THEN
    RAISE EXCEPTION 'Sustitución fiscal no autorizada.' USING ERRCODE='55000'; END IF;
   RETURN NEW;
  END IF;
  IF NEW.estado IS DISTINCT FROM OLD.estado AND (OLD.estado IS DISTINCT FROM 'PREPARADA' OR NEW.estado IS DISTINCT FROM 'CANCELADA'
   OR cancelacion.operacion_id IS NULL OR cancelacion.venta_id IS DISTINCT FROM OLD.venta_id OR cancelacion.kiosco_id IS DISTINCT FROM OLD.kiosco_id
   OR cancelacion.usuario_id IS DISTINCT FROM OLD.usuario_id OR cancelacion.origen_estado IS DISTINCT FROM 'DATOS_PREPARADOS'
   OR NOT EXISTS(SELECT 1 FROM public.fiscal_preparaciones_homologacion p WHERE p.operacion_id=OLD.id AND p.actor_auth_id=cancelacion.actor_auth_id AND p.preparacion_sha256=cancelacion.preparacion_sha256)
   OR EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion WHERE operacion_id=OLD.id)
   OR EXISTS(SELECT 1 FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=OLD.id)) THEN
   RAISE EXCEPTION 'Transición fiscal no autorizada.' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_operacion_conservar_cancelacion() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.consultar_sustitucion_fiscal_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE; x public.fiscal_sustituciones_homologacion%ROWTYPE;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 SELECT * INTO x FROM public.fiscal_sustituciones_homologacion WHERE operacion_id=p_operacion_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF x.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR x.venta_id IS DISTINCT FROM venta.id THEN
  RAISE EXCEPTION 'Sustitución fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_operaciones_homologacion o
  JOIN public.fiscal_preparaciones_homologacion p ON p.operacion_id=o.id AND p.actor_auth_id=x.actor_auth_id
  JOIN public.fiscal_solicitudes_homologacion s ON s.operacion_id=o.id AND s.solicitud_sha256=x.anterior_sha256
  JOIN public.fiscal_operaciones_homologacion n ON n.id=x.sucesora_id AND n.venta_id=o.venta_id AND n.kiosco_id=o.kiosco_id AND n.usuario_id=o.usuario_id
  JOIN public.fiscal_preparaciones_homologacion np ON np.operacion_id=n.id AND np.actor_auth_id=x.actor_auth_id AND np.preparacion_sha256=x.preparacion_sha256
  JOIN public.fiscal_solicitudes_homologacion ns ON ns.operacion_id=n.id AND ns.solicitud_sha256=x.sucesora_sha256
  WHERE o.id=x.operacion_id AND o.estado='SUSTITUIDA' AND o.venta_id=venta.id AND o.kiosco_id=venta.kiosco_id
   AND o.usuario_id=(SELECT id FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo)) THEN
  RAISE EXCEPTION 'Sustitución fiscal incoherente.' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('operacion_id',x.operacion_id,'sucesora_id',x.sucesora_id,'venta_id',x.venta_id,
  'anterior_sha256',x.anterior_sha256,'preparacion_sha256',x.preparacion_sha256,'sucesora_sha256',x.sucesora_sha256,
  'numero',(x.reserva_original->>'numero')::integer,'estado','SUSTITUIDA','emision_habilitada',false);
END $$;

CREATE OR REPLACE FUNCTION public.sustituir_reserva_fiscal_homologacion(
 p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid,p_sucesora_id uuid,p_anterior_sha text,p_canonico text,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE; op public.fiscal_operaciones_homologacion%ROWTYPE;
 reserva public.fiscal_reservas_homologacion%ROWTYPE; solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;
 previa public.fiscal_preparaciones_homologacion%ROWTYPE; permiso public.fiscal_permisos_emision_homologacion%ROWTYPE;
 anterior jsonb; binding jsonb; cuerpo jsonb; canonico text; sha text; lock_id uuid; ack jsonb;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 IF p_operacion_id IS NULL OR p_sucesora_id IS NULL OR p_operacion_id=p_sucesora_id OR p_anterior_sha IS NULL
  OR p_anterior_sha !~ '^[0-9a-f]{64}$' OR p_canonico IS NULL OR octet_length(p_canonico)>262144 OR p_sha IS NULL
  OR p_sha IS DISTINCT FROM encode(sha256(convert_to(p_canonico,'UTF8')),'hex') THEN
  RAISE EXCEPTION 'Identidad de sustitución inválida.' USING ERRCODE='22023'; END IF;
 FOR lock_id IN SELECT unnest(ARRAY[p_operacion_id,p_sucesora_id]) ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:operation:'||lock_id::text,0));
 END LOOP;
 anterior:=public.consultar_sustitucion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 IF anterior IS NOT NULL THEN
  IF anterior->>'sucesora_id' IS DISTINCT FROM p_sucesora_id::text OR anterior->>'anterior_sha256' IS DISTINCT FROM p_anterior_sha
   OR anterior->>'preparacion_sha256' IS DISTINCT FROM p_sha
   OR NOT EXISTS(SELECT 1 FROM public.fiscal_preparaciones_homologacion p WHERE p.operacion_id=p_sucesora_id AND p.canonico=p_canonico) THEN
   RAISE EXCEPTION 'Otro contenido de sustitución ya confirmado.' USING ERRCODE='40001'; END IF;
  RETURN anterior;
 END IF;
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id;
 IF op.id IS NULL OR op.venta_id IS DISTINCT FROM venta.id OR op.kiosco_id IS DISTINCT FROM venta.kiosco_id THEN
  RAISE EXCEPTION 'Venta fiscal ajena.' USING ERRCODE='42501'; END IF;
 binding:=public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 PERFORM public.fiscal_exigir_actor_preparacion(p_operacion_id,p_actor_auth_id);
 op:=public.fiscal_operacion_vigente_homologacion(p_operacion_id);
 IF op.venta_id IS DISTINCT FROM venta.id THEN RAISE EXCEPTION 'Venta fiscal ajena.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.fiscal_series_homologacion WHERE cuit_emisor=op.contexto->>'cuit_emisor'
  AND punto_venta=(op.contexto->>'punto_venta')::integer AND tipo_comprobante=(op.contexto->>'tipo_comprobante')::integer FOR UPDATE;
 SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
 SELECT * INTO previa FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=p_operacion_id;
 SELECT * INTO permiso FROM public.fiscal_permisos_emision_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
 IF reserva.operacion_id IS NULL OR reserva.estado IS DISTINCT FROM 'RESERVADA' OR reserva.intento_id IS NOT NULL OR reserva.intento_en IS NOT NULL
  OR NOT EXISTS(SELECT 1 FROM public.fiscal_series_homologacion s WHERE s.cuit_emisor=reserva.cuit_emisor AND s.punto_venta=reserva.punto_venta AND s.tipo_comprobante=reserva.tipo_comprobante AND s.ultimo_observado=reserva.numero-1)
  OR solicitud.operacion_id IS NULL OR solicitud.revision IS DISTINCT FROM 1 OR solicitud.solicitud_sha256 IS DISTINCT FROM p_anterior_sha
  OR reserva.solicitud_sha256 IS DISTINCT FROM p_anterior_sha OR previa.operacion_id IS NULL
  OR previa.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR previa.credencial_id::text IS DISTINCT FROM binding->>'credencial_id'
  OR previa.certificado_sha256 IS DISTINCT FROM binding->>'certificado_sha256' OR previa.emisor_revision IS DISTINCT FROM (binding->>'revision')::integer
  OR permiso.usado_por_intento IS NOT NULL OR permiso.usado_en IS NOT NULL
  OR EXISTS(SELECT 1 FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id=p_operacion_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_reconciliaciones_homologacion WHERE operacion_id=p_operacion_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_respuestas_emision_homologacion WHERE operacion_id=p_operacion_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_operaciones_homologacion WHERE id=p_sucesora_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=p_sucesora_id) THEN
  RAISE EXCEPTION 'La reserva requiere conciliación; no sustituir.' USING ERRCODE='55000'; END IF;
 cuerpo:=(p_canonico::jsonb->'datos')||jsonb_build_object('numero',reserva.numero);
 IF cuerpo->>'cuitEmisor' IS DISTINCT FROM reserva.cuit_emisor OR (cuerpo->>'puntoVenta')::integer IS DISTINCT FROM reserva.punto_venta
  OR (cuerpo->>'tipoComprobante')::integer IS DISTINCT FROM reserva.tipo_comprobante THEN
  RAISE EXCEPTION 'La sustitución conserva la serie y el número.' USING ERRCODE='22023'; END IF;
 canonico:=cuerpo::text;sha:=encode(sha256(convert_to(canonico,'UTF8')),'hex');
 INSERT INTO public.fiscal_sustituciones_homologacion(operacion_id,sucesora_id,venta_id,actor_auth_id,anterior_sha256,preparacion_sha256,sucesora_sha256,reserva_original)
  VALUES(p_operacion_id,p_sucesora_id,venta.id,p_actor_auth_id,p_anterior_sha,p_sha,sha,to_jsonb(reserva));
 UPDATE public.fiscal_operaciones_homologacion SET estado='SUSTITUIDA' WHERE id=p_operacion_id AND estado='PREPARADA';
 IF NOT FOUND THEN RAISE EXCEPTION 'No se confirmó sustitución original.' USING ERRCODE='40001'; END IF;
 ack:=public.guardar_datos_preparacion_homologacion(p_actor_auth_id,p_venta_id,p_sucesora_id,p_canonico,p_sha);
 IF ack->>'operacion_id' IS DISTINCT FROM p_sucesora_id::text OR ack->>'preparacion_sha256' IS DISTINCT FROM p_sha THEN
  RAISE EXCEPTION 'No se confirmó preparación sucesora.' USING ERRCODE='40001'; END IF;
 PERFORM public.fiscal_validar_cuerpo_homologacion(p_sucesora_id,canonico,sha);
 INSERT INTO public.fiscal_solicitudes_homologacion(operacion_id,cuerpo_canonico,cuerpo,solicitud_sha256) VALUES(p_sucesora_id,canonico,cuerpo,sha);
 UPDATE public.fiscal_reservas_homologacion SET operacion_id=p_sucesora_id,solicitud_sha256=sha
  WHERE operacion_id=p_operacion_id AND estado='RESERVADA' AND intento_id IS NULL AND solicitud_sha256=p_anterior_sha;
 IF NOT FOUND THEN RAISE EXCEPTION 'No se confirmó transferencia de reserva.' USING ERRCODE='40001'; END IF;
 UPDATE public.fiscal_permisos_emision_homologacion SET habilitado=false WHERE operacion_id=p_operacion_id;
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion r WHERE r.operacion_id=p_sucesora_id
  AND (to_jsonb(r)-'operacion_id'-'solicitud_sha256')=(to_jsonb(reserva)-'operacion_id'-'solicitud_sha256') AND r.solicitud_sha256=sha)
  OR EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_permisos_emision_homologacion WHERE operacion_id=p_operacion_id AND habilitado)
  OR EXISTS(SELECT 1 FROM public.fiscal_permisos_emision_homologacion WHERE operacion_id=p_sucesora_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_revisiones_homologacion WHERE operacion_id=p_sucesora_id) THEN
  RAISE EXCEPTION 'Transferencia fiscal incoherente.' USING ERRCODE='40001'; END IF;
 RETURN public.consultar_sustitucion_fiscal_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
END $$;
REVOKE ALL ON FUNCTION public.consultar_sustitucion_fiscal_homologacion(uuid,uuid,uuid),public.sustituir_reserva_fiscal_homologacion(uuid,uuid,uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_sustitucion_fiscal_homologacion(uuid,uuid,uuid),public.sustituir_reserva_fiscal_homologacion(uuid,uuid,uuid,uuid,text,text,text) TO service_role;
COMMIT;
