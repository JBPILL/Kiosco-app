-- Paso 48: quitar escritura anónima en ventas y sus registros dependientes.
-- No elimina filas, no cambia SELECT ni permisos explícitos de authenticated.
BEGIN;
DO $$
DECLARE tabla text; columnas text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['ventas','detalles_venta','pagos_venta'] LOOP
    IF to_regclass('public.'||tabla) IS NULL THEN
      RAISE EXCEPTION 'Tabla requerida no encontrada: %',tabla;
    END IF;
    EXECUTE format('REVOKE INSERT,UPDATE,DELETE ON TABLE public.%I FROM PUBLIC,anon',tabla);
    -- También eliminar concesiones por columna: revocar sólo la tabla no las quita.
    SELECT string_agg(quote_ident(a.attname),',' ORDER BY a.attnum) INTO columnas
    FROM pg_attribute a
    WHERE a.attrelid=to_regclass('public.'||tabla) AND a.attnum>0 AND NOT a.attisdropped;
    IF columnas IS NOT NULL THEN
      EXECUTE format('REVOKE INSERT (%s),UPDATE (%s) ON TABLE public.%I FROM PUBLIC,anon',columnas,columnas,tabla);
    END IF;
    IF has_table_privilege('anon','public.'||tabla,'INSERT')
      OR has_table_privilege('anon','public.'||tabla,'UPDATE')
      OR has_table_privilege('anon','public.'||tabla,'DELETE')
      OR has_any_column_privilege('anon','public.'||tabla,'INSERT')
      OR has_any_column_privilege('anon','public.'||tabla,'UPDATE') THEN
      RAISE EXCEPTION 'anon conserva escritura heredada sobre %. Revisar membresías de roles',tabla;
    END IF;
  END LOOP;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
