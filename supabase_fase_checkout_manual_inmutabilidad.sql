-- Paso 47: proteger frente a cajeros la cabecera, artículos y pagos preparados.
-- Requiere checkout manual/backend y helpers de seguridad por comercio.
-- Las funciones SECURITY DEFINER del cierre siguen escribiendo como propietario.
-- Conserva permisos del dueño; SELECT y políticas de ventas anteriores no cambian.
BEGIN;
DO $$ BEGIN
  IF to_regclass('public.checkout_manual_entradas') IS NULL
    OR to_regclass('public.checkout_manuales') IS NULL
    OR to_regclass('public.pagos_venta') IS NULL THEN
    RAISE EXCEPTION 'Aplicar primero checkout manual y backend';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.venta_checkout_manual_protegida(p_venta_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.checkout_manual_entradas e
    WHERE e.id=p_venta_id
      AND (e.kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin())
  ) OR EXISTS (
    SELECT 1 FROM public.checkout_manuales m
    WHERE (m.id=p_venta_id OR m.venta_id=p_venta_id)
      AND (m.kiosco_id=public.auth_user_kiosco_id() OR public.auth_es_superadmin())
  );
$$;
REVOKE ALL ON FUNCTION public.venta_checkout_manual_protegida(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.venta_checkout_manual_protegida(uuid) TO authenticated;

-- RESTRICTIVE se combina con todas las políticas permisivas existentes.
-- También evalúa la identidad nueva en UPDATE: no permite mover una fila
-- desde una venta anterior hacia un ticket transaccional protegido.
DO $$
DECLARE tabla text; columna text; operacion text; nombre text; condicion text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['ventas','detalles_venta','pagos_venta'] LOOP
    columna:=CASE WHEN tabla='ventas' THEN 'id' ELSE 'venta_id' END;
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tabla);
    condicion:=format('(public.auth_es_dueno_o_superadmin() OR NOT public.venta_checkout_manual_protegida(%I))',columna);
    FOREACH operacion IN ARRAY ARRAY['INSERT','UPDATE','DELETE'] LOOP
      nombre:='checkout_manual_inmutable_'||lower(operacion);
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I',nombre,tabla);
      EXECUTE format('CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR %s TO authenticated %s %s',
        nombre,tabla,operacion,
        CASE WHEN operacion IN ('UPDATE','DELETE') THEN 'USING '||condicion ELSE '' END,
        CASE WHEN operacion IN ('INSERT','UPDATE') THEN 'WITH CHECK '||condicion ELSE '' END);
    END LOOP;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
