-- F6.2D-B bloque 02e — índices.
-- Orden del bloque 02: 5 de 11.
-- Qué inventaría: definición de índices en public.
-- Columnas: schema_name, table_name, index_name, index_definition.
SELECT schemaname AS schema_name, tablename AS table_name, indexname AS index_name, indexdef AS index_definition
FROM pg_catalog.pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;
