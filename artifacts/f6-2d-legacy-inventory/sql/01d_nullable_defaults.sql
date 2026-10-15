-- F6.2D-B bloque 01d — nullable y defaults.
-- Orden: 4 de 5 en el bloque 01.
-- Qué inventaría: nulabilidad y expresión default de columnas no sensibles.
-- Columnas esperadas: table_schema, table_name, ordinal_position, column_name, is_nullable, column_default.
SELECT table_schema, table_name, ordinal_position, column_name, is_nullable, column_default
FROM information_schema.columns
WHERE (table_schema = 'public' OR (table_schema = 'auth' AND table_name = 'users'))
  AND column_name !~* '(password|token|secret|jwt|credential|service_role)'
ORDER BY table_schema, table_name, ordinal_position;
