-- F6.2D-B bloque 02h — otros tipos de constraints del SELECT original (si existen).
-- Orden del bloque 02: 8 de 11.
-- Preserva tipos distintos a PRIMARY KEY, FOREIGN KEY, UNIQUE y CHECK.
-- Columnas: table_schema, table_name, constraint_name, constraint_type, column_name, ordinal_position, referenced_schema, referenced_table, referenced_column.
SELECT tc.table_schema, tc.table_name, tc.constraint_name, tc.constraint_type,
       kcu.column_name, kcu.ordinal_position,
       ccu.table_schema AS referenced_schema, ccu.table_name AS referenced_table,
       ccu.column_name AS referenced_column
FROM information_schema.table_constraints AS tc
LEFT JOIN information_schema.key_column_usage AS kcu
  ON kcu.constraint_catalog = tc.constraint_catalog
 AND kcu.constraint_schema = tc.constraint_schema
 AND kcu.constraint_name = tc.constraint_name
 AND kcu.table_schema = tc.table_schema
 AND kcu.table_name = tc.table_name
LEFT JOIN information_schema.constraint_column_usage AS ccu
  ON ccu.constraint_catalog = tc.constraint_catalog
 AND ccu.constraint_schema = tc.constraint_schema
 AND ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'  AND tc.constraint_type NOT IN ('PRIMARY KEY','FOREIGN KEY','UNIQUE','CHECK')
ORDER BY tc.table_name, tc.constraint_type, tc.constraint_name, kcu.ordinal_position;
