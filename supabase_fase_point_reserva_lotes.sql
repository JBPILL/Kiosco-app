-- Después de point_reserva_stock. Reservas FEFO privadas; no habilita Point.
BEGIN;
ALTER TABLE public.point_intentos ADD COLUMN IF NOT EXISTS lotes_reservados_at timestamptz;
CREATE TABLE IF NOT EXISTS public.point_reservas_lotes (
  intento_id uuid NOT NULL REFERENCES public.point_intentos(id),
  lote_id uuid NOT NULL REFERENCES public.lotes_producto(id),
  cantidad numeric(12,3) NOT NULL CHECK(cantidad>0 AND cantidad::text NOT IN ('NaN','Infinity','-Infinity')),
  PRIMARY KEY(intento_id,lote_id)
);
ALTER TABLE public.point_reservas_lotes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.point_reservas_lotes FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.point_reservas_lotes TO service_role;
DROP POLICY IF EXISTS point_lotes_servidor ON public.point_reservas_lotes;
CREATE POLICY point_lotes_servidor ON public.point_reservas_lotes FOR SELECT TO service_role USING(true);
CREATE OR REPLACE FUNCTION public.reservar_lotes_point(p_intento_id uuid,p_kiosco_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_intento public.point_intentos%ROWTYPE; v_stock record; v_lote record;
  v_restante numeric; v_retenido numeric; v_tomar numeric;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere el servidor de pagos' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_intento FROM public.point_intentos WHERE id=p_intento_id AND kiosco_id=p_kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no disponible'; END IF;
  IF v_intento.lotes_reservados_at IS NOT NULL THEN RETURN true; END IF;
  IF v_intento.estado<>'PREPARADO' OR v_intento.order_id IS NOT NULL THEN RAISE EXCEPTION 'Reserva de lotes requiere conciliación'; END IF;
  PERFORM public.reservar_stock_point(p_intento_id,p_kiosco_id);
  FOR v_stock IN SELECT * FROM public.point_reservas_stock WHERE intento_id=p_intento_id ORDER BY producto_id LOOP
    -- Conserva el orden de bloqueos producto -> lotes para otros movimientos.
    PERFORM 1 FROM public.productos WHERE id=v_stock.producto_id FOR UPDATE;
    v_restante:=v_stock.cantidad;
    FOR v_lote IN SELECT * FROM public.lotes_producto
      WHERE producto_id=v_stock.producto_id AND kiosco_id=p_kiosco_id AND activo AND cantidad_actual>0
      ORDER BY fecha_vencimiento,fecha_ingreso,id FOR UPDATE LOOP
      EXIT WHEN v_restante<=0;
      SELECT coalesce(sum(r.cantidad),0) INTO v_retenido FROM public.point_reservas_lotes r
        JOIN public.point_intentos i ON i.id=r.intento_id WHERE r.lote_id=v_lote.id
        AND i.estado NOT IN ('CANCELADO','RECHAZADO','VENTA_CONFIRMADA');
      v_tomar:=least(v_restante,greatest(0,v_lote.cantidad_actual-v_retenido));
      IF v_tomar>0 THEN
        INSERT INTO public.point_reservas_lotes VALUES(p_intento_id,v_lote.id,v_tomar);
        v_restante:=v_restante-v_tomar;
      END IF;
    END LOOP;
    -- El stock sin lote permanece cubierto por la reserva física del producto.
  END LOOP;
  UPDATE public.point_intentos SET lotes_reservados_at=now() WHERE id=p_intento_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reservar_lotes_point(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_lotes_point(uuid,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.proteger_lotes_reservados_point()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_retenido numeric;
BEGIN
  SELECT coalesce(sum(r.cantidad),0) INTO v_retenido FROM public.point_reservas_lotes r
    JOIN public.point_intentos i ON i.id=r.intento_id WHERE r.lote_id=OLD.id
    AND i.estado NOT IN ('CANCELADO','RECHAZADO','VENTA_CONFIRMADA');
  IF v_retenido>0 AND (NEW.cantidad_actual IS NULL OR NEW.cantidad_actual<v_retenido
    OR NEW.cantidad_actual::text IN ('NaN','Infinity','-Infinity') OR NOT NEW.activo
    OR ROW(NEW.producto_id,NEW.kiosco_id,NEW.fecha_vencimiento,NEW.fecha_ingreso)
      IS DISTINCT FROM ROW(OLD.producto_id,OLD.kiosco_id,OLD.fecha_vencimiento,OLD.fecha_ingreso)) THEN
    RAISE EXCEPTION 'POINT_LOTE_RESERVADO: el lote tiene cantidades retenidas';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_lotes_reservados_point() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS proteger_lote_point ON public.lotes_producto;
CREATE TRIGGER proteger_lote_point BEFORE UPDATE ON public.lotes_producto
  FOR EACH ROW EXECUTE FUNCTION public.proteger_lotes_reservados_point();
COMMIT;
