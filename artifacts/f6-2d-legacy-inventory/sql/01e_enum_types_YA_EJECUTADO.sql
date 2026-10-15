-- YA EJECUTADO. NO VOLVER A EJECUTAR salvo indicación expresa.
-- F6.2D-B bloque 01e — etiquetas de ENUMs en public/auth.
-- Orden lógico: 5 de 5. Resultado ya recibido por el usuario.
-- Columnas esperadas: schema_name, enum_name, enumsortorder, enumlabel.
SELECT n.nspname AS schema_name, t.typname AS enum_name, e.enumsortorder, e.enumlabel
FROM pg_catalog.pg_type AS t
JOIN pg_catalog.pg_enum AS e ON e.enumtypid = t.oid
JOIN pg_catalog.pg_namespace AS n ON n.oid = t.typnamespace
WHERE n.nspname IN ('public', 'auth')
ORDER BY n.nspname, t.typname, e.enumsortorder;
