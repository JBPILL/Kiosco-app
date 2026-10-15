-- F6.2D-B bloque 02k — grants visibles para relaciones public.
-- Orden del bloque 02: 11 de 11.
-- Columnas: table_schema, table_name, grantee, privilege_type, is_grantable.
SELECT table_schema, table_name, grantee, privilege_type, is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
ORDER BY table_name, grantee, privilege_type;
