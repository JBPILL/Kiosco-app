-- Después de point_intentos y point_caja. Integración todavía pendiente de confirmación de venta.
BEGIN;
ALTER TABLE public.point_intentos ADD COLUMN IF NOT EXISTS stock_reservado_at timestamptz;
CREATE TABLE IF NOT EXISTS public.point_reservas_stock (
  intento_id uuid NOT NULL REFERENCES public.point_intentos(id),
  producto_id uuid NOT NULL REFERENCES public.productos(id),
  cantidad numeric(12,3) NOT NULL CHECK(cantidad>0 AND cantidad::text NOT IN ('NaN','Infinity','-Infinity')),
  PRIMARY KEY(intento_id,producto_id)
);
ALTER TABLE public.point_reservas_stock ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.point_reservas_stock FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.point_reservas_stock TO service_role;
DROP POLICY IF EXISTS point_reservas_servidor ON public.point_reservas_stock;
CREATE POLICY point_reservas_servidor ON public.point_reservas_stock FOR SELECT TO service_role USING(true);

CREATE OR REPLACE FUNCTION public.reservar_stock_point(p_intento_id uuid,p_kiosco_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_intento public.point_intentos%ROWTYPE; v_plan jsonb; v_linea jsonb;
  v_producto uuid; v_cantidad numeric; v_stock numeric; v_retenido numeric;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Se requiere el servidor de pagos' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_intento FROM public.point_intentos WHERE id=p_intento_id AND kiosco_id=p_kiosco_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no disponible'; END IF;
  IF v_intento.stock_reservado_at IS NOT NULL THEN RETURN true; END IF;
  IF v_intento.estado<>'PREPARADO' OR v_intento.order_id IS NOT NULL THEN
    RAISE EXCEPTION 'El intento requiere conciliación antes de reservar stock';
  END IF;
  PERFORM 1 FROM public.sesiones_caja
    WHERE id=(v_intento.solicitud->>'sesionCajaId')::uuid AND kiosco_id=p_kiosco_id
      AND usuario_id=(v_intento.solicitud->>'usuarioId')::uuid AND estado='ABIERTA' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La caja original ya no está abierta'; END IF;
  v_plan:=v_intento.solicitud#>'{cotizacion,ticket,consumoStock}';
  IF jsonb_typeof(v_plan) IS DISTINCT FROM 'array' OR jsonb_array_length(v_plan)>10000 THEN
    RAISE EXCEPTION 'Plan físico inválido';
  END IF;
  FOR v_linea IN SELECT value FROM jsonb_array_elements(v_plan) ORDER BY value->>'productoId' LOOP
    IF jsonb_typeof(v_linea->'cantidad') IS DISTINCT FROM 'number'
      OR coalesce(v_linea->>'productoId','') !~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN
      RAISE EXCEPTION 'Consumo físico inválido';
    END IF;
    v_producto:=(v_linea->>'productoId')::uuid; v_cantidad:=(v_linea->>'cantidad')::numeric;
    IF v_cantidad<=0 OR v_cantidad<>round(v_cantidad,3) OR v_cantidad>999999999 THEN
      RAISE EXCEPTION 'Cantidad física inválida';
    END IF;
    SELECT stock_actual INTO v_stock FROM public.productos
      WHERE id=v_producto AND kiosco_id=p_kiosco_id AND activo AND NOT coalesce(es_combo,false) FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Producto físico no disponible'; END IF;
    SELECT coalesce(sum(r.cantidad),0) INTO v_retenido FROM public.point_reservas_stock r
      JOIN public.point_intentos i ON i.id=r.intento_id WHERE r.producto_id=v_producto
      AND i.estado NOT IN ('CANCELADO','RECHAZADO','VENTA_CONFIRMADA');
    IF v_stock IS NULL OR v_stock::text IN ('NaN','Infinity','-Infinity') OR v_stock-v_retenido<v_cantidad THEN
      RAISE EXCEPTION 'Stock disponible insuficiente';
    END IF;
    INSERT INTO public.point_reservas_stock VALUES(p_intento_id,v_producto,v_cantidad);
  END LOOP;
  UPDATE public.point_intentos SET stock_reservado_at=now() WHERE id=p_intento_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.reservar_stock_point(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reservar_stock_point(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.proteger_stock_reservado_point()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_retenido numeric;
BEGIN
  SELECT coalesce(sum(r.cantidad),0) INTO v_retenido FROM public.point_reservas_stock r
    JOIN public.point_intentos i ON i.id=r.intento_id WHERE r.producto_id=OLD.id
    AND i.estado NOT IN ('CANCELADO','RECHAZADO','VENTA_CONFIRMADA');
  IF v_retenido>0 AND (NEW.stock_actual IS NULL OR NEW.stock_actual::text IN ('NaN','Infinity','-Infinity')
    OR NEW.stock_actual<v_retenido OR NOT NEW.activo OR coalesce(NEW.es_combo,false)
    OR NEW.kiosco_id IS DISTINCT FROM OLD.kiosco_id) THEN
    RAISE EXCEPTION 'POINT_STOCK_RESERVADO: el producto tiene cantidades retenidas para un cobro';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_stock_reservado_point() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS proteger_stock_point ON public.productos;
CREATE TRIGGER proteger_stock_point BEFORE UPDATE OF stock_actual,activo,es_combo,kiosco_id ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_stock_reservado_point();
COMMIT;
