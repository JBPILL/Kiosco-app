\set ON_ERROR_STOP on
SELECT set_config('f6.expected_project_ref', :'expected_ref', false);
SELECT set_config('f6.actual_project_ref', :'actual_ref', false);
DO $$
DECLARE expected_ref text := current_setting('f6.expected_project_ref', true);
  actual_ref text := current_setting('f6.actual_project_ref', true);
  unexpected_public_objects integer;
BEGIN
  IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Run preflight as postgres'; END IF;
  IF coalesce(expected_ref,'')<>'' AND expected_ref IS DISTINCT FROM actual_ref THEN
    RAISE EXCEPTION 'Project ref mismatch';
  END IF;
  -- Supabase may install public objects through platform extensions. Permit
  -- only extension-owned objects from this reviewed system allowlist; any
  -- application or unknown extension object means the target is not clean.
  WITH public_objects AS (
    SELECT 'pg_class'::regclass AS class_id,c.oid AS object_id
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m','S','f')
    UNION ALL
    SELECT 'pg_proc'::regclass,p.oid
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public'
    UNION ALL
    SELECT 'pg_type'::regclass,t.oid
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='public' AND t.typrelid=0 AND t.typtype IN ('d','e','r','m')
  )
  SELECT count(*) INTO unexpected_public_objects FROM public_objects o
  LEFT JOIN pg_depend d ON d.classid=o.class_id AND d.objid=o.object_id AND d.deptype='e'
  LEFT JOIN pg_extension e ON d.refclassid='pg_extension'::regclass AND d.refobjid=e.oid
  WHERE e.extname IS NULL OR e.extname NOT IN (
    'address_standardizer','address_standardizer_data_us','btree_gist','citext','cube',
    'earthdistance','fuzzystrmatch','hstore','ltree','pg_graphql','pg_net',
    'pg_stat_statements','pgcrypto','pgjwt','pg_trgm','pg_uuidv7','pgvector',
    'postgis','postgis_tiger_geocoder','postgis_topology','supabase_vault',
    'tablefunc','tcn','unaccent','uuid-ossp','vector'
  );
  IF unexpected_public_objects <> 0 THEN RAISE EXCEPTION 'public schema contains non-allowlisted application/platform objects (%)',unexpected_public_objects; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relname = ANY(ARRAY[
      'kioscos','usuarios','categorias','productos','producto_costos','combo_items','promociones',
      'lotes_producto','movimientos_stock','movimiento_stock_costos','clientes','movimientos_cuenta_corriente',
      'proveedores','compras_proveedor','detalles_compra','pagos_proveedor','sesiones_caja','movimientos_caja',
      'ventas','detalles_venta','pagos_venta','tickets_soporte','operaciones_stock','electronica_unidades',
      'electronica_reparaciones','checkout_manuales','anulaciones_venta_atomicas'
    ])) THEN
    RAISE EXCEPTION 'Target already contains KioskoPOS contract relations';
  END IF;
END $$;
