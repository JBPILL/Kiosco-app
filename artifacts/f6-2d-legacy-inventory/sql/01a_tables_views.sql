-- F6.2D-B bloque 01a — tablas y vistas.
-- Orden: 1 de 5 en el bloque 01.
-- Qué inventaría: objetos public y auth.users visibles en information_schema.
-- Columnas esperadas: table_schema, table_name, table_type.
SELECT table_schema, table_name, table_type
FROM information_schema.tables
WHERE (table_schema = 'public' OR (table_schema = 'auth' AND table_name = 'users'))
ORDER BY table_schema, table_name;
