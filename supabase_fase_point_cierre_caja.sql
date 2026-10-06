-- Después de supabase_fase_point_caja.sql. Impide cerrar un turno sin conciliar Point.
BEGIN;
CREATE OR REPLACE FUNCTION public.proteger_cierre_caja_point()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
BEGIN
  IF NEW.estado='CERRADA' AND OLD.estado IS DISTINCT FROM NEW.estado
    AND EXISTS(SELECT 1 FROM public.point_intentos
      WHERE kiosco_id=OLD.kiosco_id AND solicitud->>'sesionCajaId'=OLD.id::text
        AND estado NOT IN ('CANCELADO','RECHAZADO','VENTA_CONFIRMADA')) THEN
    RAISE EXCEPTION 'POINT_COBRO_PENDIENTE: conciliá los cobros Point antes de cerrar la caja' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_cierre_caja_point() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS proteger_cierre_point ON public.sesiones_caja;
CREATE TRIGGER proteger_cierre_point BEFORE UPDATE OF estado ON public.sesiones_caja
  FOR EACH ROW EXECUTE FUNCTION public.proteger_cierre_caja_point();
COMMIT;
