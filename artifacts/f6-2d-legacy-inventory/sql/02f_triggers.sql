-- F6.2D-B bloque 02f — triggers.
-- Orden del bloque 02: 6 de 11.
-- Qué inventaría: eventos y características de triggers definidos en public.
-- Columnas: schema_name, table_name, trigger_name, event_manipulation, action_timing, action_orientation, action_statement.
SELECT event_object_schema AS schema_name, event_object_table AS table_name,
       trigger_name, event_manipulation, action_timing, action_orientation, action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
ORDER BY event_object_table, trigger_name, event_manipulation;
