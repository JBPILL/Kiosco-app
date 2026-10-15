-- F6.2D-B bloque 01b — nombres y orden de columnas.
-- Orden: 2 de 5 en el bloque 01.
-- Qué inventaría: columnas no sensibles de public y auth.users.
-- Columnas esperadas: table_schema, table_name, ordinal_position, column_name.
SELECT table_schema, table_name, ordinal_position, column_name
FROM information_schema.columns
WHERE (table_schema = 'public' OR (table_schema = 'auth' AND table_name = 'users'))
  AND column_name !~* '(password|token|secret|jwt|credential|service_role)'
ORDER BY table_schema, table_name, ordinal_position;
