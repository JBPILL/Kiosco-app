-- F6.2D-B bloque 02j — policies de RLS.
-- Orden del bloque 02: 10 de 11.
-- Columnas: schema_name, table_name, policy_name, permissive, roles, cmd, qual, with_check.
SELECT schemaname AS schema_name, tablename AS table_name, policyname AS policy_name,
       permissive, roles, cmd, qual, with_check
FROM pg_catalog.pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
