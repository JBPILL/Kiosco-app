\set ON_ERROR_STOP on
SELECT set_config('f6.expected_project_ref', :'expected_ref', false);
SELECT set_config('f6.actual_project_ref', :'actual_ref', false);
DO $$
DECLARE expected_ref text := current_setting('f6.expected_project_ref', true);
  actual_ref text := current_setting('f6.actual_project_ref', true);
  required text[] := ARRAY[
  'kioscos','usuarios','categorias','productos','combo_items','promociones','lotes_producto',
  'sesiones_caja','movimientos_caja','ventas','detalles_venta','pagos_venta','movimientos_stock',
  'clientes','movimientos_cuenta_corriente','proveedores','compras_proveedor','detalles_compra',
  'pagos_proveedor','tickets_soporte','operaciones_stock','electronica_unidades','electronica_reparaciones'
];
  missing text[];
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run postflight as postgres'; END IF;
  IF coalesce(expected_ref,'')<>'' AND expected_ref IS DISTINCT FROM actual_ref THEN RAISE EXCEPTION 'Project ref mismatch'; END IF;
  SELECT array_agg(t) INTO missing FROM unnest(required) t WHERE to_regclass('public.'||t) IS NULL;
  IF missing IS NOT NULL THEN RAISE EXCEPTION 'Required bootstrap relations missing: %',missing; END IF;
  IF EXISTS (SELECT 1 FROM unnest(required) t JOIN pg_class c ON c.oid=to_regclass('public.'||t) WHERE NOT c.relrowsecurity) THEN
    RAISE EXCEPTION 'Required relation without RLS';
  END IF;
  IF to_regprocedure('public.registrar_movimiento_stock_idempotente(uuid,uuid,text,numeric,text,text,date,text,uuid)') IS NULL
    OR to_regprocedure('public.resolver_operacion_stock(uuid,uuid,uuid,boolean)') IS NULL
    OR to_regprocedure('public.solicitar_apertura_manual_cajon(uuid,text)') IS NULL
    OR to_regprocedure('public.registrar_resultado_apertura_cajon(uuid,text)') IS NULL
    OR to_regprocedure('public.electronica_registrar_unidad(uuid,uuid,text,text,date,text)') IS NULL
    OR to_regprocedure('public.electronica_guardar_reparacion(uuid,uuid,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Required pilot RPC missing';
  END IF;
  IF has_table_privilege('authenticated','public.movimientos_stock','INSERT') THEN RAISE EXCEPTION 'Browser has direct stock INSERT'; END IF;
  IF NOT has_function_privilege('authenticated','public.registrar_movimiento_stock_idempotente(uuid,uuid,text,numeric,text,text,date,text,uuid)','EXECUTE') THEN
    RAISE EXCEPTION 'Authenticated stock RPC missing EXECUTE';
  END IF;
END $$;
