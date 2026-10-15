-- YA EJECUTADO. NO VOLVER A EJECUTAR salvo indicación expresa.
-- F6.2D-B bloque 02g — metadata de functions/RPC, sin cuerpos ni ejecución.
-- Orden lógico del bloque 02: 7 de 11. Resultado ya recibido por el usuario.
-- Columnas: schema_name, function_name, identity_arguments, result_type, security_definer, volatility, function_settings.
SELECT n.nspname AS schema_name, p.proname AS function_name,
       pg_catalog.pg_get_function_identity_arguments(p.oid) AS identity_arguments,
       pg_catalog.pg_get_function_result(p.oid) AS result_type,
       p.prosecdef AS security_definer, p.provolatile AS volatility,
       p.proconfig AS function_settings
FROM pg_catalog.pg_proc AS p
JOIN pg_catalog.pg_namespace AS n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public','auth')
ORDER BY n.nspname, p.proname, identity_arguments;
