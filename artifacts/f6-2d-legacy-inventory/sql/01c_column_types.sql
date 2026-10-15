-- F6.2D-B bloque 01c — tipos de columnas.
-- Orden: 3 de 5 en el bloque 01.
-- Qué inventaría: tipos declarados y tipos internos de columnas no sensibles.
-- Columnas esperadas: table_schema, table_name, ordinal_position, column_name, data_type, udt_name.
SELECT table_schema, table_name, ordinal_position, column_name, data_type, udt_name
FROM information_schema.columns
WHERE (table_schema = 'public' OR (table_schema = 'auth' AND table_name = 'users'))
  AND column_name !~* '(password|token|secret|jwt|credential|service_role)'
ORDER BY table_schema, table_name, ordinal_position;
