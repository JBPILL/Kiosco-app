-- Después de point_reserva_lotes. No habilitar producción antes del checkout transaccional.
BEGIN;
ALTER TABLE public.point_intentos ADD COLUMN IF NOT EXISTS credito_reservado_at timestamptz;
CREATE TABLE IF NOT EXISTS public.point_reservas_credito (
  intento_id uuid PRIMARY KEY REFERENCES public.point_intentos(id),
  cliente_id uuid NOT NULL REFERENCES public.clientes(id),
  monto_centavos bigint NOT NULL CHECK(monto_centavos>0 AND monto_centavos<=9007199254740991)
);
ALTER TABLE public.point_reservas_credito ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.point_reservas_credito FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.point_reservas_credito TO service_role;
DROP POLICY IF EXISTS point_credito_servidor ON public.point_reservas_credito;
CREATE POLICY point_credito_servidor ON public.point_reservas_credito FOR SELECT TO service_role USING(true);
CREATE OR REPLACE FUNCTION public.reservar_checkout_point(p_intento_id uuid,p_kiosco_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_intento public.point_intentos%ROWTYPE; v_cliente uuid; v_monto numeric;
  v_calculado numeric; v_saldo numeric; v_limite numeric; v_retenido numeric;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere el servidor de pagos' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_intento FROM public.point_intentos WHERE id=p_intento_id AND kiosco_id=p_kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no disponible'; END IF;
  IF v_intento.credito_reservado_at IS NOT NULL THEN RETURN true; END IF;
  IF v_intento.estado<>'PREPARADO' OR v_intento.order_id IS NOT NULL THEN RAISE EXCEPTION 'La reserva requiere conciliación'; END IF;
  v_monto:=(v_intento.solicitud#>>'{cotizacion,cobro,montoCuentaCorrienteCentavos}')::numeric;
  IF v_monto IS NULL OR v_monto<0 OR v_monto<>trunc(v_monto) OR v_monto>9007199254740991
    OR v_monto::text IN ('NaN','Infinity','-Infinity') THEN RAISE EXCEPTION 'Importe de crédito inválido'; END IF;
  SELECT coalesce(sum((p->>'montoCentavos')::numeric),0) INTO v_calculado
    FROM jsonb_array_elements(v_intento.solicitud#>'{entrada,pagos}') p WHERE p->>'medio'='CUENTA_CORRIENTE';
  IF v_monto<>v_calculado THEN RAISE EXCEPTION 'División de crédito inconsistente'; END IF;
  PERFORM public.reservar_lotes_point(p_intento_id,p_kiosco_id);
  IF v_monto>0 THEN
    v_cliente:=(v_intento.solicitud#>>'{entrada,clienteId}')::uuid;
    SELECT saldo_deudor,limite_credito INTO v_saldo,v_limite FROM public.clientes
      WHERE id=v_cliente AND kiosco_id=p_kiosco_id AND activo FOR UPDATE;
    IF NOT FOUND OR v_saldo IS NULL OR v_limite IS NULL OR v_limite<0
      OR v_saldo::text IN ('NaN','Infinity','-Infinity') OR v_limite::text IN ('NaN','Infinity','-Infinity') THEN
      RAISE EXCEPTION 'Cliente o crédito no disponible';
    END IF;
    SELECT coalesce(sum(r.monto_centavos),0) INTO v_retenido FROM public.point_reservas_credito r
      JOIN public.point_intentos i ON i.id=r.intento_id WHERE r.cliente_id=v_cliente
      AND i.estado NOT IN ('CANCELADO','RECHAZADO','VENTA_CONFIRMADA');
    -- Límite cero conserva la interpretación vigente de crédito sin tope.
    IF round(v_saldo*100)+v_retenido+v_monto>999999999999 THEN
      RAISE EXCEPTION 'Saldo de crédito fuera de rango';
    END IF;
    IF v_limite>0 AND round(v_saldo*100)+v_retenido+v_monto>round(v_limite*100) THEN
      RAISE EXCEPTION 'Crédito disponible insuficiente';
    END IF;
    INSERT INTO public.point_reservas_credito VALUES(p_intento_id,v_cliente,v_monto::bigint);
  END IF;
  UPDATE public.point_intentos SET credito_reservado_at=now() WHERE id=p_intento_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reservar_checkout_point(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_checkout_point(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.proteger_credito_reservado_point()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_retenido numeric;
BEGIN
  SELECT coalesce(sum(r.monto_centavos),0) INTO v_retenido FROM public.point_reservas_credito r
    JOIN public.point_intentos i ON i.id=r.intento_id WHERE r.cliente_id=OLD.id
    AND i.estado NOT IN ('CANCELADO','RECHAZADO','VENTA_CONFIRMADA');
  IF v_retenido>0 AND (NOT NEW.activo OR NEW.kiosco_id IS DISTINCT FROM OLD.kiosco_id
    OR NEW.saldo_deudor IS NULL OR NEW.limite_credito IS NULL OR NEW.limite_credito<0
    OR NEW.saldo_deudor::text IN ('NaN','Infinity','-Infinity') OR NEW.limite_credito::text IN ('NaN','Infinity','-Infinity')
    OR (NEW.limite_credito>0 AND round(NEW.saldo_deudor*100)+v_retenido>round(NEW.limite_credito*100))) THEN
    RAISE EXCEPTION 'POINT_CREDITO_RESERVADO: el cliente tiene crédito retenido';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_credito_reservado_point() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS proteger_credito_point ON public.clientes;
CREATE TRIGGER proteger_credito_point BEFORE UPDATE OF saldo_deudor,limite_credito,activo,kiosco_id ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.proteger_credito_reservado_point();
COMMIT;
