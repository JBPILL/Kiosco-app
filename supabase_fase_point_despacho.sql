-- Después de point_confirmar_venta, notificaciones, procesamiento y vinculación.
-- Cola privada y consulta de órdenes conocidas; no programa Cron ni crea cobros.
BEGIN;
ALTER TABLE public.point_intentos ADD COLUMN IF NOT EXISTS revision_pendiente_at timestamptz;
CREATE OR REPLACE FUNCTION public.conciliar_intento_point(
  p_intento_id uuid,p_kiosco_id uuid,p_application_id text,p_account_id text,
  p_order_id text,p_estado text,p_payment_id text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_intento public.point_intentos%ROWTYPE; v_revision boolean:=false;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere el servidor de pagos' USING ERRCODE='42501'; END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('PENDIENTE','CONCILIAR','PAGO_CONFIRMADO','CANCELADO','RECHAZADO') THEN
    RAISE EXCEPTION 'Resultado Point inválido';
  END IF;
  IF coalesce(p_application_id,'') !~ '^[0-9]{1,100}$' OR coalesce(p_account_id,'') !~ '^[0-9]{1,100}$'
    OR coalesce(p_order_id,'') !~ '^ORD[A-Za-z0-9]{1,100}$' THEN RAISE EXCEPTION 'Identidad Point no coincide'; END IF;
  SELECT * INTO v_intento FROM public.point_intentos WHERE id=p_intento_id FOR UPDATE;
  IF NOT FOUND OR v_intento.kiosco_id IS DISTINCT FROM p_kiosco_id
    OR v_intento.application_id IS DISTINCT FROM p_application_id OR v_intento.account_id IS DISTINCT FROM p_account_id
    OR v_intento.order_id IS DISTINCT FROM p_order_id OR p_order_id IS NULL THEN
    RAISE EXCEPTION 'Identidad Point no coincide';
  END IF;
  IF p_estado='PAGO_CONFIRMADO' AND (coalesce(p_payment_id,'') !~ '^PAY[A-Za-z0-9]{1,100}$'
    OR (v_intento.payment_id IS NOT NULL AND v_intento.payment_id IS DISTINCT FROM p_payment_id)) THEN
    RAISE EXCEPTION 'Identidad de pago no coincide';
  END IF;
  IF v_intento.estado IN ('PAGO_CONFIRMADO','VENTA_CONFIRMADA','CANCELADO','RECHAZADO') THEN
    v_revision:=p_estado<>v_intento.estado AND NOT(v_intento.estado='VENTA_CONFIRMADA' AND p_estado='PAGO_CONFIRMADO');
  ELSIF v_intento.estado='CANCELACION_SOLICITADA' AND p_estado='PENDIENTE' THEN
    NULL; -- Una consulta todavía pendiente no revoca la solicitud de cancelación.
  ELSE
    UPDATE public.point_intentos SET estado=p_estado,
      payment_id=CASE WHEN p_estado='PAGO_CONFIRMADO' THEN p_payment_id ELSE payment_id END,
      fecha_actualizacion=now() WHERE id=p_intento_id;
  END IF;
  IF v_revision OR p_estado='CONCILIAR' THEN
    UPDATE public.point_intentos SET revision_pendiente_at=coalesce(revision_pendiente_at,now()) WHERE id=p_intento_id;
  END IF;
  SELECT estado INTO p_estado FROM public.point_intentos WHERE id=p_intento_id;
  RETURN jsonb_build_object('estado',p_estado,'revision',v_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.conciliar_intento_point(uuid,uuid,text,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_intento_point(uuid,uuid,text,text,text,text,text) TO service_role;

-- Webhook y consulta programada comparten la misma transición financiera.
CREATE OR REPLACE FUNCTION public.aplicar_resultado_point(
  p_notificacion_id uuid,p_intento_id uuid,p_kiosco_id uuid,p_application_id text,p_order_id text,p_estado text,p_payment_id text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_notificacion public.point_notificaciones%ROWTYPE; v_intento public.point_intentos%ROWTYPE; v_resultado jsonb;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere el servidor de pagos' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_notificacion FROM public.point_notificaciones WHERE id=p_notificacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notificación no encontrada'; END IF;
  SELECT * INTO v_intento FROM public.point_intentos WHERE id=p_intento_id FOR UPDATE;
  IF NOT FOUND OR v_notificacion.application_id IS DISTINCT FROM p_application_id
    OR v_notificacion.order_id IS DISTINCT FROM p_order_id OR v_intento.kiosco_id IS DISTINCT FROM p_kiosco_id
    OR v_intento.application_id IS DISTINCT FROM p_application_id OR v_intento.order_id IS DISTINCT FROM p_order_id
    OR (v_notificacion.intento_id IS NOT NULL AND v_notificacion.intento_id<>p_intento_id) THEN
    RAISE EXCEPTION 'Identidad Point no coincide';
  END IF;
  v_resultado:=public.conciliar_intento_point(p_intento_id,p_kiosco_id,p_application_id,v_intento.account_id,p_order_id,p_estado,p_payment_id);
  IF v_notificacion.estado='PROCESADA' THEN
    IF (v_resultado->>'revision')::boolean OR p_estado='CONCILIAR' THEN
      UPDATE public.point_notificaciones SET estado='CONCILIAR',fecha_proceso=now() WHERE id=p_notificacion_id;
    END IF;
    RETURN v_resultado->>'estado';
  END IF;
  UPDATE public.point_notificaciones SET intento_id=p_intento_id,
    estado=CASE WHEN (v_resultado->>'revision')::boolean OR p_estado='CONCILIAR' THEN 'CONCILIAR' ELSE 'PROCESADA' END,
    intentos_proceso=intentos_proceso+1,fecha_proceso=now() WHERE id=p_notificacion_id;
  RETURN v_resultado->>'estado';
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_resultado_point(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_resultado_point(uuid,uuid,uuid,text,text,text,text) TO service_role;

CREATE TABLE IF NOT EXISTS public.point_trabajos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intento_id uuid UNIQUE REFERENCES public.point_intentos(id),
  notificacion_id uuid UNIQUE REFERENCES public.point_notificaciones(id),
  proximo_proceso_at timestamptz NOT NULL DEFAULT now(),
  lease_token uuid,lease_hasta timestamptz,
  fallos_consecutivos integer NOT NULL DEFAULT 0 CHECK(fallos_consecutivos BETWEEN 0 AND 20),
  intentos_proceso bigint NOT NULL DEFAULT 0 CHECK(intentos_proceso>=0),
  ultimo_resultado text CHECK(ultimo_resultado IN ('FINALIZADO','PENDIENTE','CONCILIAR','ERROR')),
  finalizado_at timestamptz,fecha_creacion timestamptz NOT NULL DEFAULT now(),
  CHECK((intento_id IS NULL)<>(notificacion_id IS NULL)),
  CHECK((lease_token IS NULL)=(lease_hasta IS NULL))
);
CREATE INDEX IF NOT EXISTS point_trabajos_pendientes ON public.point_trabajos(proximo_proceso_at,id) WHERE finalizado_at IS NULL;
ALTER TABLE public.point_trabajos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.point_trabajos FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.point_trabajos TO service_role;
DROP POLICY IF EXISTS point_trabajos_servidor ON public.point_trabajos;
CREATE POLICY point_trabajos_servidor ON public.point_trabajos FOR SELECT TO service_role USING(true);

CREATE OR REPLACE FUNCTION public.encolar_notificacion_point()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.point_trabajos(notificacion_id) VALUES(NEW.id) ON CONFLICT(notificacion_id) DO NOTHING;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.encolar_notificacion_point() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS encolar_notificacion_point ON public.point_notificaciones;
CREATE TRIGGER encolar_notificacion_point AFTER INSERT ON public.point_notificaciones FOR EACH ROW EXECUTE FUNCTION public.encolar_notificacion_point();

CREATE OR REPLACE FUNCTION public.encolar_intento_point()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF TG_OP='UPDATE' AND NEW.order_id IS NOT DISTINCT FROM OLD.order_id AND NEW.estado IS NOT DISTINCT FROM OLD.estado THEN RETURN NEW; END IF;
  IF NEW.order_id IS NOT NULL AND NEW.estado NOT IN ('VENTA_CONFIRMADA','CANCELADO','RECHAZADO') THEN
    INSERT INTO public.point_trabajos(intento_id) VALUES(NEW.id) ON CONFLICT(intento_id) DO UPDATE
      SET proximo_proceso_at=least(point_trabajos.proximo_proceso_at,now()),finalizado_at=NULL;
  ELSIF NEW.estado IN ('VENTA_CONFIRMADA','CANCELADO','RECHAZADO') THEN
    UPDATE public.point_trabajos SET finalizado_at=coalesce(finalizado_at,now()) WHERE intento_id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.encolar_intento_point() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS encolar_intento_point ON public.point_intentos;
CREATE TRIGGER encolar_intento_point AFTER INSERT OR UPDATE OF order_id,estado ON public.point_intentos FOR EACH ROW EXECUTE FUNCTION public.encolar_intento_point();

INSERT INTO public.point_trabajos(intento_id) SELECT id FROM public.point_intentos
  WHERE order_id IS NOT NULL AND estado NOT IN ('VENTA_CONFIRMADA','CANCELADO','RECHAZADO') ON CONFLICT(intento_id) DO NOTHING;
INSERT INTO public.point_trabajos(notificacion_id) SELECT n.id FROM public.point_notificaciones n
  LEFT JOIN public.point_intentos i ON i.id=n.intento_id
  WHERE n.intento_id IS NULL OR i.estado NOT IN ('VENTA_CONFIRMADA','CANCELADO','RECHAZADO') ON CONFLICT(notificacion_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.tomar_trabajo_point()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_trabajo public.point_trabajos%ROWTYPE;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere el servidor de pagos' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_trabajo FROM public.point_trabajos WHERE finalizado_at IS NULL AND proximo_proceso_at<=now()
    AND (lease_hasta IS NULL OR lease_hasta<=now()) ORDER BY proximo_proceso_at,fecha_creacion,id FOR UPDATE SKIP LOCKED LIMIT 1;
  IF NOT FOUND THEN RETURN NULL; END IF;
  UPDATE public.point_trabajos SET lease_token=gen_random_uuid(),lease_hasta=now()+interval '5 minutes',intentos_proceso=intentos_proceso+1
    WHERE id=v_trabajo.id RETURNING * INTO v_trabajo;
  RETURN jsonb_build_object('id',v_trabajo.id,'intentoId',v_trabajo.intento_id,'notificacionId',v_trabajo.notificacion_id,'leaseToken',v_trabajo.lease_token);
END;
$$;
REVOKE ALL ON FUNCTION public.tomar_trabajo_point() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.tomar_trabajo_point() TO service_role;

CREATE OR REPLACE FUNCTION public.terminar_trabajo_point(p_id uuid,p_lease_token uuid,p_resultado text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_trabajo public.point_trabajos%ROWTYPE; v_estado text; v_final boolean; v_fallos integer; v_segundos integer;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere el servidor de pagos' USING ERRCODE='42501'; END IF;
  IF p_resultado IS NULL OR p_resultado NOT IN ('FINALIZADO','PENDIENTE','CONCILIAR','ERROR') THEN RAISE EXCEPTION 'Resultado de trabajo inválido'; END IF;
  SELECT * INTO v_trabajo FROM public.point_trabajos WHERE id=p_id AND lease_token=p_lease_token FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  -- No bloquear el intento: su trigger toma la fila del trabajo en el orden inverso.
  SELECT i.estado INTO v_estado FROM public.point_intentos i WHERE i.id=coalesce(v_trabajo.intento_id,
    (SELECT n.intento_id FROM public.point_notificaciones n WHERE n.id=v_trabajo.notificacion_id));
  v_final:=coalesce(v_estado IN ('VENTA_CONFIRMADA','CANCELADO','RECHAZADO'),false);
  IF p_resultado='FINALIZADO' AND NOT v_final THEN RETURN false; END IF;
  v_fallos:=CASE WHEN p_resultado='ERROR' THEN least(20,v_trabajo.fallos_consecutivos+1) ELSE 0 END;
  v_segundos:=CASE WHEN p_resultado='ERROR' THEN least(900,5*power(2,least(v_fallos,8)))::integer
    WHEN p_resultado='CONCILIAR' THEN 300 ELSE 30 END;
  UPDATE public.point_trabajos SET lease_token=NULL,lease_hasta=NULL,fallos_consecutivos=v_fallos,ultimo_resultado=p_resultado,
    proximo_proceso_at=now()+make_interval(secs=>v_segundos),finalizado_at=CASE WHEN v_final THEN coalesce(finalizado_at,now()) ELSE finalizado_at END
    WHERE id=p_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.terminar_trabajo_point(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.terminar_trabajo_point(uuid,uuid,text) TO service_role;
-- Exploración de cuentas reanudable. La versión evita perder avances de otro worker.
ALTER TABLE public.point_notificaciones ADD COLUMN IF NOT EXISTS recuperacion_checkpoint jsonb;
ALTER TABLE public.point_notificaciones ADD COLUMN IF NOT EXISTS recuperacion_version integer NOT NULL DEFAULT 0;
CREATE OR REPLACE FUNCTION public.guardar_recuperacion_point(p_notificacion_id uuid,p_version integer,p_checkpoint jsonb)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_version integer;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere el servidor de pagos' USING ERRCODE='42501'; END IF;
  IF p_checkpoint IS NOT NULL AND (jsonb_typeof(p_checkpoint) IS DISTINCT FROM 'object'
    OR coalesce(p_checkpoint->>'configuracion','') !~ '^[0-9a-f]{64}$'
    OR coalesce(p_checkpoint->>'siguiente','') !~ '^[0-9]{1,9}$'
    OR jsonb_typeof(p_checkpoint->'candidatos') IS DISTINCT FROM 'array'
    OR octet_length(p_checkpoint::text)>65536) THEN RAISE EXCEPTION 'Recuperación Point inválida'; END IF;
  IF p_checkpoint IS NOT NULL AND ((p_checkpoint->>'siguiente')::integer>256
    OR jsonb_array_length(p_checkpoint->'candidatos')>(p_checkpoint->>'siguiente')::integer) THEN
    RAISE EXCEPTION 'Recuperación Point inválida';
  END IF;
  UPDATE public.point_notificaciones SET recuperacion_checkpoint=p_checkpoint,recuperacion_version=recuperacion_version+1
    WHERE id=p_notificacion_id AND recuperacion_version=p_version RETURNING recuperacion_version INTO v_version;
  IF NOT FOUND THEN RAISE EXCEPTION 'Recuperación Point actualizada por otro trabajador'; END IF;
  RETURN v_version;
END;
$$;
REVOKE ALL ON FUNCTION public.guardar_recuperacion_point(uuid,integer,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.guardar_recuperacion_point(uuid,integer,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
