-- Paso 52: el cajero confirma ventas exclusivamente por checkout backend.
-- Antes de aplicar: frontend con VITE_CHECKOUT_MANUAL_TRANSACCIONAL=true,
-- Edge Function checkout-manual vigente y migraciones de cierre/autorización.
-- Las colas anteriores requieren conciliación; no convertirlas automáticamente.
BEGIN;
DO $$
DECLARE tabla text;
BEGIN
  IF to_regclass('public.checkout_manual_entradas') IS NULL
    OR to_regprocedure('public.confirmar_venta_manual(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Aplicar checkout manual y su backend antes del paso 52';
  END IF;
  FOREACH tabla IN ARRAY ARRAY['ventas','detalles_venta','pagos_venta'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tabla);
    EXECUTE format('DROP POLICY IF EXISTS ventas_cajero_solo_backend_insert ON public.%I',tabla);
    EXECUTE format('CREATE POLICY ventas_cajero_solo_backend_insert ON public.%I
      AS RESTRICTIVE FOR INSERT TO authenticated
      WITH CHECK (public.auth_es_dueno_o_superadmin())',tabla);
  END LOOP;
END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
