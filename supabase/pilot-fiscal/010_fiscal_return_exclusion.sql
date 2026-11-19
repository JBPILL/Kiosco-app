-- PR03: exclusión entre devolución común y reserva fiscal. Requiere 001–009.
-- No instala notas de crédito ni modifica importes/stock/caja. Instalación gated.
BEGIN;
CREATE OR REPLACE FUNCTION public.fiscal_proteger_devolucion_reservada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ids uuid[];
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'La exclusión fiscal requiere READ COMMITTED; reintentar en una transacción nueva.' USING ERRCODE='25001';
 END IF;
 ids:=CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW.venta_id] WHEN 'DELETE' THEN ARRAY[OLD.venta_id]
  ELSE ARRAY[OLD.venta_id,NEW.venta_id] END;
 -- El mismo lock de venta que toma fiscal_operacion_vigente_homologacion.
 -- Comprobar después de esperar: no usar una lectura previa al bloqueo.
 PERFORM 1 FROM public.ventas WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion r
  JOIN public.fiscal_operaciones_homologacion o ON o.id=r.operacion_id WHERE o.venta_id=ANY(ids)) THEN
  RAISE EXCEPTION 'La venta tiene facturación reservada o confirmada; requiere circuito fiscal antes de devolver.' USING ERRCODE='55000';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_proteger_devolucion_reservada() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_devolucion_reservada ON public.devoluciones_venta;
CREATE TRIGGER fiscal_devolucion_reservada BEFORE INSERT OR UPDATE OR DELETE ON public.devoluciones_venta
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_proteger_devolucion_reservada();

CREATE OR REPLACE FUNCTION public.fiscal_proteger_reserva_devuelta() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ids uuid[];
BEGIN
 -- Una snapshot fija podría no ver la devolución que confirmó mientras esperaba.
 IF current_setting('transaction_isolation')<>'read committed' THEN
  RAISE EXCEPTION 'La exclusión fiscal requiere READ COMMITTED; reintentar en una transacción nueva.' USING ERRCODE='25001';
 END IF;
 -- INSERT y cambios defensivos de identidad: proteger ambos extremos.
 SELECT array_agg(DISTINCT venta_id ORDER BY venta_id) INTO ids FROM public.fiscal_operaciones_homologacion
 WHERE id=ANY(CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW.operacion_id] ELSE ARRAY[OLD.operacion_id,NEW.operacion_id] END);
 PERFORM 1 FROM public.ventas WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM public.devoluciones_venta WHERE venta_id=ANY(ids)) THEN
  RAISE EXCEPTION 'La venta tiene devoluciones; no se puede fiscalizar su importe original completo.' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_proteger_reserva_devuelta() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_reserva_devuelta ON public.fiscal_reservas_homologacion;
CREATE TRIGGER fiscal_reserva_devuelta BEFORE INSERT OR UPDATE ON public.fiscal_reservas_homologacion
 FOR EACH ROW EXECUTE FUNCTION public.fiscal_proteger_reserva_devuelta();
COMMIT;
