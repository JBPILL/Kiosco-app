-- Aplicar después de mermas. Conserva snapshots existentes sin exponerlos al cajero.
BEGIN;
CREATE TABLE IF NOT EXISTS public.movimiento_stock_costos (
  movimiento_id uuid PRIMARY KEY REFERENCES public.movimientos_stock(id) ON DELETE CASCADE,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  precio_costo numeric(12,2)
);
ALTER TABLE public.movimiento_stock_costos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.movimiento_stock_costos FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.movimiento_stock_costos TO authenticated,service_role;
DROP POLICY IF EXISTS costos_movimientos_dueno ON public.movimiento_stock_costos;
CREATE POLICY costos_movimientos_dueno ON public.movimiento_stock_costos FOR SELECT TO authenticated
  USING(public.auth_es_superadmin() OR (kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()));

INSERT INTO public.movimiento_stock_costos(movimiento_id,kiosco_id,precio_costo)
  SELECT id,kiosco_id,costo_unitario_referencia FROM public.movimientos_stock
  WHERE costo_unitario_referencia IS NOT NULL
  ON CONFLICT(movimiento_id) DO NOTHING;
DROP TRIGGER IF EXISTS trg_inmutar_costo_historico_movimiento_stock ON public.movimientos_stock;
UPDATE public.movimientos_stock SET costo_unitario_referencia=NULL WHERE costo_unitario_referencia IS NOT NULL;

CREATE OR REPLACE FUNCTION public.capturar_costo_historico_movimiento_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  NEW.costo_unitario_referencia := NULL;
  RETURN NEW;
END;
$$;
CREATE TRIGGER trg_inmutar_costo_historico_movimiento_stock
  BEFORE UPDATE OF costo_unitario_referencia ON public.movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION public.capturar_costo_historico_movimiento_stock();

CREATE OR REPLACE FUNCTION public.guardar_costo_privado_movimiento_stock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  INSERT INTO public.movimiento_stock_costos(movimiento_id,kiosco_id,precio_costo)
    SELECT NEW.id,NEW.kiosco_id,
      (SELECT pc.precio_costo FROM public.producto_costos pc WHERE pc.producto_id=NEW.producto_id AND pc.kiosco_id=NEW.kiosco_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_guardar_costo_privado_movimiento_stock ON public.movimientos_stock;
CREATE TRIGGER trg_guardar_costo_privado_movimiento_stock AFTER INSERT ON public.movimientos_stock
  FOR EACH ROW EXECUTE FUNCTION public.guardar_costo_privado_movimiento_stock();
REVOKE ALL ON FUNCTION public.guardar_costo_privado_movimiento_stock() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.capturar_costo_historico_movimiento_stock() FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
