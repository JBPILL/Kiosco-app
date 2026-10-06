-- Aplicar después de las migraciones de intentos y notificaciones Point.
-- Solo registra resultados ya comprobados por el procesador servidor.
BEGIN;
CREATE OR REPLACE FUNCTION public.aplicar_resultado_point(
  p_notificacion_id uuid, p_intento_id uuid, p_kiosco_id uuid,
  p_application_id text, p_order_id text, p_estado text, p_payment_id text DEFAULT NULL
)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  v_notificacion public.point_notificaciones%ROWTYPE;
  v_intento public.point_intentos%ROWTYPE;
  v_revision boolean := false;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Esta operación requiere el servidor de pagos' USING ERRCODE='42501';
  END IF;
  IF p_estado IS NULL OR p_estado NOT IN ('PENDIENTE','CONCILIAR','PAGO_CONFIRMADO','CANCELADO','RECHAZADO') THEN
    RAISE EXCEPTION 'Resultado Point inválido' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_notificacion FROM public.point_notificaciones WHERE id=p_notificacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Notificación no encontrada' USING ERRCODE='P0002'; END IF;
  SELECT * INTO v_intento FROM public.point_intentos WHERE id=p_intento_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no encontrado' USING ERRCODE='P0002'; END IF;
  IF v_notificacion.application_id IS DISTINCT FROM p_application_id
    OR v_notificacion.order_id IS DISTINCT FROM p_order_id
    OR v_intento.kiosco_id IS DISTINCT FROM p_kiosco_id
    OR v_intento.order_id IS DISTINCT FROM p_order_id
    OR (v_notificacion.intento_id IS NOT NULL AND v_notificacion.intento_id <> p_intento_id) THEN
    RAISE EXCEPTION 'Identidad Point no coincide' USING ERRCODE='22023';
  END IF;
  IF v_notificacion.estado='PROCESADA' THEN RETURN v_intento.estado; END IF;
  IF p_estado='PAGO_CONFIRMADO' AND (p_payment_id IS NULL OR p_payment_id !~ '^PAY[A-Za-z0-9]{1,100}$') THEN
    RAISE EXCEPTION 'Falta la identidad del pago confirmado' USING ERRCODE='22023';
  END IF;
  IF v_intento.payment_id IS NOT NULL AND p_estado='PAGO_CONFIRMADO'
    AND v_intento.payment_id IS DISTINCT FROM p_payment_id THEN
    RAISE EXCEPTION 'El intento ya tiene otro pago' USING ERRCODE='22023';
  END IF;
  -- Un mensaje tardío nunca revierte un pago confirmado ni un estado final.
  IF v_intento.estado IN ('PAGO_CONFIRMADO','VENTA_CONFIRMADA','CANCELADO','RECHAZADO') THEN
    v_revision := p_estado <> v_intento.estado
      AND NOT (v_intento.estado='VENTA_CONFIRMADA' AND p_estado='PAGO_CONFIRMADO');
  ELSE
    UPDATE public.point_intentos SET estado=p_estado,
      payment_id=CASE WHEN p_estado='PAGO_CONFIRMADO' THEN p_payment_id ELSE payment_id END,
      fecha_actualizacion=now() WHERE id=p_intento_id;
  END IF;
  UPDATE public.point_notificaciones SET intento_id=p_intento_id,
    estado=CASE WHEN v_revision OR p_estado='CONCILIAR' THEN 'CONCILIAR' ELSE 'PROCESADA' END,
    intentos_proceso=intentos_proceso+1, fecha_proceso=now() WHERE id=p_notificacion_id;
  SELECT estado INTO p_estado FROM public.point_intentos WHERE id=p_intento_id;
  RETURN p_estado;
END;
$$;
REVOKE ALL ON FUNCTION public.aplicar_resultado_point(uuid,uuid,uuid,text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.aplicar_resultado_point(uuid,uuid,uuid,text,text,text,text) TO service_role;
COMMIT;
