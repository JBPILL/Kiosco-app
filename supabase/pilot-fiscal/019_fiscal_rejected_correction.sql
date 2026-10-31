-- F08: corrección de rechazo recibido, requiere 001–018 de esta revisión.
-- No instala/activa worker, consultas ARCA ni emisión. Conservar fila de intento.
BEGIN;
ALTER TABLE public.fiscal_operaciones_homologacion DROP CONSTRAINT IF EXISTS fiscal_operacion_estado_lifecycle;
ALTER TABLE public.fiscal_operaciones_homologacion ADD CONSTRAINT fiscal_operacion_estado_lifecycle CHECK(estado IN ('PREPARADA','CANCELADA','SUSTITUIDA','RECHAZO_CORREGIDO'));
ALTER TABLE public.fiscal_reservas_homologacion DROP CONSTRAINT IF EXISTS fiscal_reserva_estado_final;
ALTER TABLE public.fiscal_reservas_homologacion ADD CONSTRAINT fiscal_reserva_estado_final CHECK(estado IN ('RESERVADA','ENVIO_INCIERTO','AUTORIZADA','RECHAZO_CORREGIDO'));
ALTER TABLE public.fiscal_reservas_homologacion DROP CONSTRAINT IF EXISTS fiscal_reserva_intento_final;
ALTER TABLE public.fiscal_reservas_homologacion ADD CONSTRAINT fiscal_reserva_intento_final CHECK((estado='RESERVADA' AND intento_id IS NULL AND intento_en IS NULL)
 OR (estado IN ('ENVIO_INCIERTO','AUTORIZADA','RECHAZO_CORREGIDO') AND intento_id IS NOT NULL AND intento_en IS NOT NULL));
-- Sólo el intento rechazado archivado puede compartir el número con su sucesora.
-- Una fila vigente/autorizada sigue siendo única globalmente.
DROP INDEX IF EXISTS public.fiscal_reserva_numero_historico;
CREATE UNIQUE INDEX fiscal_reserva_numero_historico ON public.fiscal_reservas_homologacion(cuit_emisor,punto_venta,tipo_comprobante,numero)
 WHERE estado<>'RECHAZO_CORREGIDO';
CREATE TABLE IF NOT EXISTS public.fiscal_rechazos_corregidos_homologacion (
 operacion_id uuid PRIMARY KEY REFERENCES public.fiscal_operaciones_homologacion(id),
 sucesora_id uuid NOT NULL UNIQUE REFERENCES public.fiscal_operaciones_homologacion(id) DEFERRABLE INITIALLY DEFERRED,
 venta_id uuid NOT NULL REFERENCES public.ventas(id),actor_auth_id uuid NOT NULL,intento_id uuid NOT NULL,
 anterior_sha256 text NOT NULL CHECK(anterior_sha256 ~ '^[0-9a-f]{64}$'),
 preparacion_sha256 text NOT NULL CHECK(preparacion_sha256 ~ '^[0-9a-f]{64}$'),
 sucesora_sha256 text NOT NULL CHECK(sucesora_sha256 ~ '^[0-9a-f]{64}$'),
 reserva_original jsonb NOT NULL CHECK(jsonb_typeof(reserva_original)='object'),
 respuesta_original jsonb NOT NULL CHECK(jsonb_typeof(respuesta_original)='object'),
 verificacion jsonb NOT NULL CHECK(jsonb_typeof(verificacion)='object'),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),CHECK(operacion_id<>sucesora_id)
);
ALTER TABLE public.fiscal_rechazos_corregidos_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_rechazos_corregidos_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
 WHERE attrelid='public.fiscal_rechazos_corregidos_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT (%s),INSERT (%s),UPDATE (%s),REFERENCES (%s) ON public.fiscal_rechazos_corregidos_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_rechazos_corregidos_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_rechazos_corregidos_homologacion','SELECT,INSERT,UPDATE') THEN
   RAISE EXCEPTION 'Privilegios heredados en corrección de rechazo fiscal.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_rechazo_corregido_inmutable ON public.fiscal_rechazos_corregidos_homologacion;
CREATE TRIGGER fiscal_rechazo_corregido_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_rechazos_corregidos_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();
CREATE OR REPLACE FUNCTION public.fiscal_conservar_intento_rechazado() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF TG_OP<>'INSERT' AND OLD.estado='RECHAZO_CORREGIDO' THEN
  RAISE EXCEPTION 'El intento rechazado conserva su historial.' USING ERRCODE='55000'; END IF;
 IF TG_OP<>'DELETE' AND NEW.estado='RECHAZO_CORREGIDO' THEN
  IF TG_OP<>'UPDATE' THEN RAISE EXCEPTION 'No crear archivo de rechazo sin intento.' USING ERRCODE='55000'; END IF;
  IF OLD.estado IS DISTINCT FROM 'ENVIO_INCIERTO' OR (to_jsonb(NEW)-'estado') IS DISTINCT FROM (to_jsonb(OLD)-'estado')
   OR NOT EXISTS(SELECT 1 FROM public.fiscal_rechazos_corregidos_homologacion x
    JOIN public.fiscal_respuestas_emision_homologacion a ON a.operacion_id=x.operacion_id AND a.intento_id=x.intento_id
     AND a.actor_auth_id=x.actor_auth_id AND a.solicitud_sha256=x.anterior_sha256 AND a.respuesta=x.respuesta_original
    WHERE x.operacion_id=OLD.operacion_id AND x.reserva_original=to_jsonb(OLD) AND x.intento_id=OLD.intento_id
     AND x.anterior_sha256=OLD.solicitud_sha256 AND a.respuesta->>'estado'='RECHAZO_RECIBIDO') THEN
   RAISE EXCEPTION 'Archivo fiscal sin corrección auditada.' USING ERRCODE='55000'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_conservar_intento_rechazado() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_conservar_intento_rechazado ON public.fiscal_reservas_homologacion;
CREATE TRIGGER fiscal_conservar_intento_rechazado BEFORE INSERT OR UPDATE OR DELETE ON public.fiscal_reservas_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_conservar_intento_rechazado();
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
  IF NEW.estado='RECHAZO_CORREGIDO' AND OLD.estado='PREPARADA' THEN
   IF NOT EXISTS(SELECT 1 FROM public.fiscal_rechazos_corregidos_homologacion x
    JOIN public.fiscal_preparaciones_homologacion p ON p.operacion_id=x.operacion_id AND p.actor_auth_id=x.actor_auth_id
    JOIN public.fiscal_solicitudes_homologacion s ON s.operacion_id=x.operacion_id AND s.solicitud_sha256=x.anterior_sha256 AND s.revision=1
    JOIN public.fiscal_reservas_homologacion r ON r.operacion_id=x.operacion_id AND r.estado='RECHAZO_CORREGIDO'
    WHERE x.operacion_id=OLD.id AND x.venta_id=OLD.venta_id AND (to_jsonb(r)-'estado')=(x.reserva_original-'estado')) THEN
    RAISE EXCEPTION 'Corrección de rechazo no autorizada.' USING ERRCODE='55000'; END IF;
   RETURN NEW;
  END IF;
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
 IF reserva.estado IS NULL OR reserva.estado NOT IN ('ENVIO_INCIERTO','AUTORIZADA','RECHAZO_CORREGIDO')
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


CREATE OR REPLACE FUNCTION public.consultar_correccion_rechazo_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE;x public.fiscal_rechazos_corregidos_homologacion%ROWTYPE;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 SELECT * INTO x FROM public.fiscal_rechazos_corregidos_homologacion WHERE operacion_id=p_operacion_id;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF x.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR x.venta_id IS DISTINCT FROM venta.id THEN
  RAISE EXCEPTION 'Corrección fiscal no autorizada.' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_operaciones_homologacion o
  JOIN public.fiscal_reservas_homologacion r ON r.operacion_id=o.id AND r.estado='RECHAZO_CORREGIDO' AND (to_jsonb(r)-'estado')=(x.reserva_original-'estado')
  JOIN public.fiscal_solicitudes_homologacion s ON s.operacion_id=o.id AND s.solicitud_sha256=x.anterior_sha256 AND s.revision=1
  JOIN public.fiscal_preparaciones_homologacion p ON p.operacion_id=o.id AND p.actor_auth_id=x.actor_auth_id
  JOIN public.fiscal_respuestas_emision_homologacion a ON a.operacion_id=o.id AND a.intento_id=x.intento_id AND a.actor_auth_id=x.actor_auth_id AND a.solicitud_sha256=x.anterior_sha256 AND a.respuesta=x.respuesta_original
  JOIN public.fiscal_operaciones_homologacion n ON n.id=x.sucesora_id AND n.venta_id=o.venta_id AND n.kiosco_id=o.kiosco_id AND n.usuario_id=o.usuario_id AND n.venta_snapshot=o.venta_snapshot
  JOIN public.fiscal_preparaciones_homologacion np ON np.operacion_id=n.id AND np.actor_auth_id=x.actor_auth_id AND np.preparacion_sha256=x.preparacion_sha256
  JOIN public.fiscal_solicitudes_homologacion ns ON ns.operacion_id=n.id AND ns.solicitud_sha256=x.sucesora_sha256 AND ns.cuerpo-'numero'=np.datos->'datos'
   AND ns.cuerpo->'numero'=s.cuerpo->'numero' AND ns.cuerpo->'tipoComprobante'=s.cuerpo->'tipoComprobante' AND ns.cuerpo->'puntoVenta'=s.cuerpo->'puntoVenta' AND ns.cuerpo->'cuitEmisor'=s.cuerpo->'cuitEmisor'
  WHERE o.id=x.operacion_id AND o.estado='RECHAZO_CORREGIDO' AND o.venta_id=venta.id AND o.kiosco_id=venta.kiosco_id
   AND o.usuario_id=(SELECT id FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo)) THEN
  RAISE EXCEPTION 'Corrección de rechazo incoherente.' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('operacion_id',x.operacion_id,'sucesora_id',x.sucesora_id,'venta_id',x.venta_id,'anterior_sha256',x.anterior_sha256,
  'preparacion_sha256',x.preparacion_sha256,'sucesora_sha256',x.sucesora_sha256,'numero',(x.reserva_original->>'numero')::integer,'estado','RECHAZO_CORREGIDO','emision_habilitada',false);
END $$;

-- Fuente exclusivamente privada para verificar antes de cargar TA y consultar.
CREATE OR REPLACE FUNCTION public.cargar_fuente_correccion_rechazo_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE;op public.fiscal_operaciones_homologacion%ROWTYPE;r public.fiscal_reservas_homologacion%ROWTYPE;
 s public.fiscal_solicitudes_homologacion%ROWTYPE;p public.fiscal_preparaciones_homologacion%ROWTYPE;b jsonb;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id;
 IF op.id IS NULL OR op.venta_id IS DISTINCT FROM venta.id OR op.kiosco_id IS DISTINCT FROM venta.kiosco_id THEN
  RAISE EXCEPTION 'Fuente de rechazo no autorizada.' USING ERRCODE='42501'; END IF;
 b:=public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 op:=public.fiscal_operacion_vigente_homologacion(p_operacion_id);
 SELECT * INTO r FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR SHARE;
 SELECT * INTO s FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR SHARE;
 SELECT * INTO p FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=p_operacion_id;
 IF r.estado IS DISTINCT FROM 'ENVIO_INCIERTO' OR s.revision IS DISTINCT FROM 1 OR r.solicitud_sha256 IS DISTINCT FROM s.solicitud_sha256
  OR p.operacion_id IS NULL OR p.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR p.credencial_id::text IS DISTINCT FROM b->>'credencial_id'
  OR p.certificado_sha256 IS DISTINCT FROM b->>'certificado_sha256' OR p.emisor_revision IS DISTINCT FROM (b->>'revision')::integer
  OR EXISTS(SELECT 1 FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id=p_operacion_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_reconciliaciones_homologacion WHERE operacion_id=p_operacion_id AND (decision->>'estado'='AUTORIZACION_COINCIDENTE' OR decision->>'codigo' IN ('DATOS_DISTINTOS','CONSULTA_DISTINTA'))) THEN
  RAISE EXCEPTION 'Falta rechazo recibido corregible.' USING ERRCODE='55000'; END IF;
 PERFORM public.fiscal_exigir_intento_respuesta(p_actor_auth_id,p_operacion_id,r.intento_id,s.solicitud_sha256);
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_respuestas_emision_homologacion a WHERE a.operacion_id=p_operacion_id AND a.intento_id=r.intento_id
  AND a.actor_auth_id=p_actor_auth_id AND a.solicitud_sha256=s.solicitud_sha256 AND a.respuesta->>'estado'='RECHAZO_RECIBIDO') THEN
  RAISE EXCEPTION 'Falta recepción de rechazo confirmada.' USING ERRCODE='55000'; END IF;
 RETURN jsonb_build_object('operacion_id',p_operacion_id,'venta_id',venta.id,'intento_id',r.intento_id,'revision',1,
  'solicitud',jsonb_build_object('version',1,'solicitud',s.cuerpo,'sha256',s.solicitud_sha256),'binding',b);
END $$;
REVOKE ALL ON FUNCTION public.cargar_fuente_correccion_rechazo_homologacion(uuid,uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_fuente_correccion_rechazo_homologacion(uuid,uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.corregir_rechazo_fiscal_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_id uuid,p_sucesora_id uuid,
 p_intento_id uuid,p_anterior_sha text,p_canonico text,p_sha text,p_verificacion jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE venta public.ventas%ROWTYPE;op public.fiscal_operaciones_homologacion%ROWTYPE;reserva public.fiscal_reservas_homologacion%ROWTYPE;
 solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;previa public.fiscal_preparaciones_homologacion%ROWTYPE;
 respuesta public.fiscal_respuestas_emision_homologacion%ROWTYPE;binding jsonb;anterior jsonb;cuerpo jsonb;canonico text;sha text;lock_id uuid;ack jsonb;
 instante timestamptz;consulta_en timestamptz;ultimo_en timestamptz;
BEGIN
 venta:=public.fiscal_venta_preparacion_homologacion(p_actor_auth_id,p_venta_id);
 IF p_operacion_id IS NULL OR p_sucesora_id IS NULL OR p_operacion_id=p_sucesora_id OR p_intento_id IS NULL OR p_anterior_sha IS NULL
  OR p_anterior_sha !~ '^[0-9a-f]{64}$' OR p_canonico IS NULL OR octet_length(p_canonico)>262144 OR p_sha IS NULL
  OR p_sha IS DISTINCT FROM encode(sha256(convert_to(p_canonico,'UTF8')),'hex') THEN
  RAISE EXCEPTION 'Identidad de corrección fiscal inválida.' USING ERRCODE='22023'; END IF;
 FOR lock_id IN SELECT unnest(ARRAY[p_operacion_id,p_sucesora_id]) ORDER BY 1 LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:operation:'||lock_id::text,0));
 END LOOP;
 anterior:=public.consultar_correccion_rechazo_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
 IF anterior IS NOT NULL THEN
  IF anterior->>'sucesora_id' IS DISTINCT FROM p_sucesora_id::text OR anterior->>'anterior_sha256' IS DISTINCT FROM p_anterior_sha
   OR anterior->>'preparacion_sha256' IS DISTINCT FROM p_sha OR NOT EXISTS(SELECT 1 FROM public.fiscal_preparaciones_homologacion p WHERE p.operacion_id=p_sucesora_id AND p.canonico=p_canonico)
   OR NOT EXISTS(SELECT 1 FROM public.fiscal_rechazos_corregidos_homologacion x WHERE x.operacion_id=p_operacion_id AND x.intento_id=p_intento_id AND x.verificacion=p_verificacion) THEN
   RAISE EXCEPTION 'Otro contenido de corrección ya confirmado.' USING ERRCODE='40001'; END IF;
  RETURN anterior;
 END IF;
 SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id;
 IF op.id IS NULL OR op.venta_id IS DISTINCT FROM venta.id OR op.kiosco_id IS DISTINCT FROM venta.kiosco_id THEN
  RAISE EXCEPTION 'Venta fiscal ajena.' USING ERRCODE='42501'; END IF;
 binding:=public.autorizar_consulta_fiscal_homologacion(p_actor_auth_id,p_operacion_id);
 op:=public.fiscal_operacion_vigente_homologacion(p_operacion_id);
 PERFORM 1 FROM public.fiscal_series_homologacion WHERE cuit_emisor=op.contexto->>'cuit_emisor'
  AND punto_venta=(op.contexto->>'punto_venta')::integer AND tipo_comprobante=(op.contexto->>'tipo_comprobante')::integer FOR UPDATE;
 SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
 SELECT * INTO previa FROM public.fiscal_preparaciones_homologacion WHERE operacion_id=p_operacion_id;
 PERFORM public.fiscal_exigir_intento_respuesta(p_actor_auth_id,p_operacion_id,p_intento_id,p_anterior_sha);
 SELECT * INTO respuesta FROM public.fiscal_respuestas_emision_homologacion WHERE operacion_id=p_operacion_id AND intento_id=p_intento_id;
 IF reserva.estado IS DISTINCT FROM 'ENVIO_INCIERTO' OR reserva.intento_id IS DISTINCT FROM p_intento_id OR reserva.solicitud_sha256 IS DISTINCT FROM p_anterior_sha
  OR solicitud.revision IS DISTINCT FROM 1 OR solicitud.solicitud_sha256 IS DISTINCT FROM p_anterior_sha OR previa.operacion_id IS NULL
  OR previa.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR previa.credencial_id::text IS DISTINCT FROM binding->>'credencial_id'
  OR previa.certificado_sha256 IS DISTINCT FROM binding->>'certificado_sha256' OR previa.emisor_revision IS DISTINCT FROM (binding->>'revision')::integer
  OR respuesta.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR respuesta.solicitud_sha256 IS DISTINCT FROM p_anterior_sha OR respuesta.respuesta->>'estado' IS DISTINCT FROM 'RECHAZO_RECIBIDO'
  OR EXISTS(SELECT 1 FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id=p_operacion_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_reconciliaciones_homologacion WHERE operacion_id=p_operacion_id AND (decision->>'estado'='AUTORIZACION_COINCIDENTE' OR decision->>'codigo' IN ('DATOS_DISTINTOS','CONSULTA_DISTINTA')))
  OR EXISTS(SELECT 1 FROM public.fiscal_operaciones_homologacion WHERE id=p_sucesora_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_cancelaciones_preparacion_homologacion WHERE operacion_id=p_sucesora_id) THEN
  RAISE EXCEPTION 'El intento requiere conciliación; no corregir.' USING ERRCODE='55000'; END IF;
 IF jsonb_typeof(p_verificacion) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(p_verificacion))<>7
  OR NOT(p_verificacion ?& ARRAY['version','resultado','consulta','codigo','consultado_en','ultimo_autorizado','ultimo_consultado_en'])
  OR p_verificacion->'version' IS DISTINCT FROM '1'::jsonb OR p_verificacion->>'resultado' IS DISTINCT FROM 'NO_ENCONTRADO'
  OR p_verificacion->'codigo' IS DISTINCT FROM '602'::jsonb
  OR p_verificacion->'consulta' IS DISTINCT FROM jsonb_build_object('entorno','HOMOLOGACION','cuitEmisor',reserva.cuit_emisor,'puntoVenta',reserva.punto_venta,'tipoComprobante',reserva.tipo_comprobante,'numero',reserva.numero)
  OR p_verificacion->'ultimo_autorizado' IS DISTINCT FROM to_jsonb(reserva.numero-1)
  OR NOT EXISTS(SELECT 1 FROM public.fiscal_series_homologacion s WHERE s.cuit_emisor=reserva.cuit_emisor AND s.punto_venta=reserva.punto_venta AND s.tipo_comprobante=reserva.tipo_comprobante AND s.ultimo_observado=reserva.numero-1) THEN
  RAISE EXCEPTION 'Falta verificación de ausencia y numeración exactas.' USING ERRCODE='22023'; END IF;
 BEGIN
  IF jsonb_typeof(p_verificacion->'consultado_en') IS DISTINCT FROM 'string' OR jsonb_typeof(p_verificacion->'ultimo_consultado_en') IS DISTINCT FROM 'string'
   OR p_verificacion->>'consultado_en' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$'
   OR p_verificacion->>'ultimo_consultado_en' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(\.[0-9]{1,6})?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN RAISE EXCEPTION 'Formato temporal inválido.'; END IF;
  consulta_en:=(p_verificacion->>'consultado_en')::timestamptz;ultimo_en:=(p_verificacion->>'ultimo_consultado_en')::timestamptz;
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'Fechas de verificación inválidas.' USING ERRCODE='22023'; END;
 instante:=clock_timestamp();
 IF consulta_en<instante-interval '2 minutes' OR ultimo_en<consulta_en OR ultimo_en>instante+interval '30 seconds' THEN
  RAISE EXCEPTION 'Verificación fiscal vencida o fuera de orden.' USING ERRCODE='22023'; END IF;
 cuerpo:=(p_canonico::jsonb->'datos')||jsonb_build_object('numero',reserva.numero);
 IF cuerpo->>'cuitEmisor' IS DISTINCT FROM reserva.cuit_emisor OR cuerpo->'puntoVenta' IS DISTINCT FROM to_jsonb(reserva.punto_venta)
  OR cuerpo->'tipoComprobante' IS DISTINCT FROM to_jsonb(reserva.tipo_comprobante) THEN
  RAISE EXCEPTION 'La corrección conserva serie y número.' USING ERRCODE='22023'; END IF;
 canonico:=public.fiscal_json_canonico_homologacion(cuerpo);sha:=encode(sha256(convert_to(canonico,'UTF8')),'hex');
 INSERT INTO public.fiscal_rechazos_corregidos_homologacion(operacion_id,sucesora_id,venta_id,actor_auth_id,intento_id,anterior_sha256,preparacion_sha256,sucesora_sha256,reserva_original,respuesta_original,verificacion)
 VALUES(p_operacion_id,p_sucesora_id,venta.id,p_actor_auth_id,p_intento_id,p_anterior_sha,p_sha,sha,to_jsonb(reserva),respuesta.respuesta,p_verificacion);
 UPDATE public.fiscal_reservas_homologacion SET estado='RECHAZO_CORREGIDO' WHERE operacion_id=p_operacion_id AND estado='ENVIO_INCIERTO';
 IF NOT FOUND THEN RAISE EXCEPTION 'No se confirmó archivo de rechazo.' USING ERRCODE='40001'; END IF;
 UPDATE public.fiscal_operaciones_homologacion SET estado='RECHAZO_CORREGIDO' WHERE id=p_operacion_id AND estado='PREPARADA';
 IF NOT FOUND THEN RAISE EXCEPTION 'No se confirmó cierre de operación rechazada.' USING ERRCODE='40001'; END IF;
 ack:=public.guardar_datos_preparacion_homologacion(p_actor_auth_id,p_venta_id,p_sucesora_id,p_canonico,p_sha);
 IF ack->>'operacion_id' IS DISTINCT FROM p_sucesora_id::text OR ack->>'preparacion_sha256' IS DISTINCT FROM p_sha THEN
  RAISE EXCEPTION 'No se confirmó preparación corregida.' USING ERRCODE='40001'; END IF;
 PERFORM public.fiscal_validar_cuerpo_homologacion(p_sucesora_id,canonico,sha);
 INSERT INTO public.fiscal_solicitudes_homologacion(operacion_id,cuerpo_canonico,cuerpo,solicitud_sha256) VALUES(p_sucesora_id,canonico,cuerpo,sha);
 INSERT INTO public.fiscal_reservas_homologacion(operacion_id,cuit_emisor,punto_venta,tipo_comprobante,numero,solicitud_sha256)
 VALUES(p_sucesora_id,reserva.cuit_emisor,reserva.punto_venta,reserva.tipo_comprobante,reserva.numero,sha);
 UPDATE public.fiscal_permisos_emision_homologacion SET habilitado=false WHERE operacion_id=p_operacion_id;
 IF NOT EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion r WHERE r.operacion_id=p_sucesora_id AND r.estado='RESERVADA' AND r.intento_id IS NULL AND r.intento_en IS NULL
  AND r.cuit_emisor=reserva.cuit_emisor AND r.punto_venta=reserva.punto_venta AND r.tipo_comprobante=reserva.tipo_comprobante AND r.numero=reserva.numero AND r.solicitud_sha256=sha)
  OR EXISTS(SELECT 1 FROM public.fiscal_permisos_emision_homologacion WHERE operacion_id=p_operacion_id AND habilitado)
  OR EXISTS(SELECT 1 FROM public.fiscal_permisos_emision_homologacion WHERE operacion_id=p_sucesora_id)
  OR EXISTS(SELECT 1 FROM public.fiscal_revisiones_homologacion WHERE operacion_id=p_sucesora_id) THEN
  RAISE EXCEPTION 'Corrección fiscal incoherente.' USING ERRCODE='40001'; END IF;
 -- Cargar catálogo/preparación también puede esperar locks: no renovar la prueba.
 instante:=clock_timestamp();
 IF consulta_en<instante-interval '2 minutes' OR ultimo_en<consulta_en OR ultimo_en>instante+interval '30 seconds' THEN
  RAISE EXCEPTION 'Verificación fiscal venció antes del cierre.' USING ERRCODE='22023'; END IF;
 RETURN public.consultar_correccion_rechazo_homologacion(p_actor_auth_id,p_venta_id,p_operacion_id);
END $$;
REVOKE ALL ON FUNCTION public.consultar_correccion_rechazo_homologacion(uuid,uuid,uuid),public.corregir_rechazo_fiscal_homologacion(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_correccion_rechazo_homologacion(uuid,uuid,uuid),public.corregir_rechazo_fiscal_homologacion(uuid,uuid,uuid,uuid,uuid,text,text,text,jsonb) TO service_role;
COMMIT;
