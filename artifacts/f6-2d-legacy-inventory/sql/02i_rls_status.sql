-- F6.2D-B bloque 02i — estado RLS por relación.
-- Orden del bloque 02: 9 de 11.
-- Columnas: schema_name, table_name, rls_enabled, rls_forced.
SELECT n.nspname AS schema_name, c.relname AS table_name, c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_catalog.pg_class AS c
JOIN pg_catalog.pg_namespace AS n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relkind IN ('r','p','v','m')
ORDER BY c.relname;
