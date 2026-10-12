-- Paso 29: cierre de caja protegido por checkout manual preparado en servidor.
-- Requiere pasos 26, 27 y 28. No activa Point.
BEGIN;
CREATE INDEX IF NOT EXISTS checkout_manual_entradas_caja_idx
  ON public.checkout_manual_entradas(kiosco_id,(snapshot->>'sesion_caja_id'));
CREATE OR REPLACE FUNCTION public.proteger_cierre_caja_checkout_manual()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF (NEW.estado IS DISTINCT FROM 'ABIERTA' OR NEW.fecha_cierre IS NOT NULL
    OR NEW.kiosco_id IS DISTINCT FROM OLD.kiosco_id OR NEW.usuario_id IS DISTINCT FROM OLD.usuario_id)
    AND EXISTS (
      SELECT 1 FROM public.checkout_manual_entradas e
      WHERE e.kiosco_id=OLD.kiosco_id AND e.snapshot->>'sesion_caja_id'=OLD.id::text
        AND NOT EXISTS (
          SELECT 1 FROM public.checkout_manual_cancelaciones c
          WHERE c.id=e.id AND c.kiosco_id=e.kiosco_id AND c.entrada=e.entrada)
        AND NOT EXISTS (
          SELECT 1 FROM public.checkout_manuales m JOIN public.ventas v ON v.id=m.venta_id
          WHERE m.id=e.id AND m.kiosco_id=e.kiosco_id AND m.resultado IS NOT NULL
            AND m.venta_id=e.id AND v.kiosco_id=e.kiosco_id AND v.sesion_caja_id=OLD.id
            AND v.usuario_id=e.usuario_id AND v.estado IN ('COMPLETADA','ANULADA'))
    ) THEN
    RAISE EXCEPTION 'CHECKOUT_MANUAL_PENDIENTE: conciliá los cobros manuales antes de cerrar la caja' USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.proteger_cierre_caja_checkout_manual() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS proteger_cierre_checkout_manual ON public.sesiones_caja;
CREATE TRIGGER proteger_cierre_checkout_manual BEFORE UPDATE OF estado,fecha_cierre,kiosco_id,usuario_id ON public.sesiones_caja
  FOR EACH ROW EXECUTE FUNCTION public.proteger_cierre_caja_checkout_manual();
NOTIFY pgrst,'reload schema';
COMMIT;
