-- Aplicar después de supabase_fase_point_intentos.sql.
BEGIN;
CREATE OR REPLACE FUNCTION public.vincular_orden_point(
  p_intento_id uuid,p_kiosco_id uuid,p_application_id text,p_account_id text,p_order_id text
) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_intento public.point_intentos%ROWTYPE;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Esta operación requiere el servidor de pagos' USING ERRCODE='42501';
  END IF;
  IF p_order_id IS NOT NULL AND p_order_id !~ '^ORD[A-Za-z0-9_-]{1,100}$' THEN
    RAISE EXCEPTION 'Identificador de orden inválido' USING ERRCODE='22023';
  END IF;
  SELECT * INTO v_intento FROM public.point_intentos WHERE id=p_intento_id FOR UPDATE;
  IF NOT FOUND OR v_intento.kiosco_id IS DISTINCT FROM p_kiosco_id
    OR v_intento.application_id IS DISTINCT FROM p_application_id
    OR v_intento.account_id IS DISTINCT FROM p_account_id THEN
    RAISE EXCEPTION 'Identidad del intento no coincide' USING ERRCODE='42501';
  END IF;
  IF v_intento.estado IN ('CANCELADO','RECHAZADO') THEN
    RAISE EXCEPTION 'El intento ya terminó';
  END IF;
  IF v_intento.order_id IS NOT NULL AND p_order_id IS NOT NULL AND v_intento.order_id<>p_order_id THEN
    RAISE EXCEPTION 'El intento ya tiene otra orden';
  END IF;
  UPDATE public.point_intentos SET
    order_id=coalesce(order_id,p_order_id),
    estado=CASE
      WHEN estado IN ('PAGO_CONFIRMADO','VENTA_CONFIRMADA','CANCELACION_SOLICITADA') THEN estado
      WHEN p_order_id IS NULL THEN 'CONCILIAR'
      WHEN order_id IS NULL THEN 'PENDIENTE'
      ELSE estado END,
    fecha_actualizacion=now()
    WHERE id=p_intento_id RETURNING estado INTO v_intento.estado;
  RETURN v_intento.estado;
END;
$$;
REVOKE ALL ON FUNCTION public.vincular_orden_point(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.vincular_orden_point(uuid,uuid,text,text,text) TO service_role;
COMMIT;
