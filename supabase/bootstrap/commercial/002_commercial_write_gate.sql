-- Optional commercial enforcement, installed after 001_commercial_subscription.sql.
BEGIN;
CREATE OR REPLACE FUNCTION public.exigir_comercio_operativo(p_kiosco_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE estado text; decision text; fila_estado text; vencimiento date;
BEGIN
  -- Serializes against administrative state/renewal changes until transaction end.
  SELECT estado_suscripcion INTO decision FROM public.kioscos WHERE id=p_kiosco_id FOR SHARE;
  SELECT s.estado,s.fecha_vencimiento INTO fila_estado,vencimiento FROM public.suscripciones s
    WHERE s.kiosco_id=p_kiosco_id AND s.estado<>'CANCELADA' FOR SHARE;
  estado:=public.comercial_resolver_estado(decision,fila_estado,vencimiento,public.comercial_hoy());
  IF estado IS DISTINCT FROM 'ACTIVO' THEN
    RAISE EXCEPTION 'Operación bloqueada por estado comercial: %',coalesce(estado,'NO_DISPONIBLE')
      USING ERRCODE='42501';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.validar_escritura_comercial_operativa()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE fila jsonb; kid uuid;
BEGIN
  fila:=CASE WHEN TG_OP='DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  kid:=nullif(fila->>'kiosco_id','')::uuid;
  IF kid IS NULL AND fila ? 'venta_id' THEN
    SELECT kiosco_id INTO kid FROM public.ventas WHERE id=(fila->>'venta_id')::uuid;
  END IF;
  IF kid IS NULL AND fila ? 'compra_id' THEN
    SELECT kiosco_id INTO kid FROM public.compras_proveedor WHERE id=(fila->>'compra_id')::uuid;
  END IF;
  IF kid IS NULL AND fila ? 'producto_id' THEN
    SELECT kiosco_id INTO kid FROM public.productos WHERE id=(fila->>'producto_id')::uuid;
  END IF;
  IF kid IS NULL THEN RAISE EXCEPTION 'Comercio operativo no resuelto' USING ERRCODE='42501'; END IF;
  PERFORM public.exigir_comercio_operativo(kid);
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;

DO $$
DECLARE tabla text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY[
    'categorias','productos','combo_items','promociones','lotes_producto',
    'sesiones_caja','movimientos_caja','ventas','detalles_venta','pagos_venta',
    'movimientos_stock','clientes','movimientos_cuenta_corriente','proveedores',
    'compras_proveedor','detalles_compra','pagos_proveedor','movimientos_proveedor',
    'producto_costos','movimiento_stock_costos','historial_precios_producto',
    'electronica_unidades','electronica_reparaciones','electronica_solicitudes'
  ] LOOP
    IF to_regclass('public.'||tabla) IS NULL THEN
      RAISE EXCEPTION 'Prerequisito operativo ausente: %',tabla;
    END IF;
    EXECUTE format('DROP TRIGGER IF EXISTS comercial_estado_write_gate ON public.%I',tabla);
    EXECUTE format('CREATE TRIGGER comercial_estado_write_gate BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.validar_escritura_comercial_operativa()',tabla);
  END LOOP;
END $$;
ALTER FUNCTION public.exigir_comercio_operativo(uuid) OWNER TO postgres;
ALTER FUNCTION public.validar_escritura_comercial_operativa() OWNER TO postgres;
REVOKE ALL ON FUNCTION public.exigir_comercio_operativo(uuid),public.validar_escritura_comercial_operativa()
  FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
