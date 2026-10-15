-- F6.2D-B bloque 00 — diagnóstico y metadata solamente.
-- Antes de ejecutar: confirmar manualmente en el Dashboard que la URL/proyecto visible es wlqujnwxrmksheubfrha.
-- Si el ref no coincide exactamente, NO ejecutar los demás bloques.
-- Qué valida: contexto SQL visible y schemas de la sesión. No identifica project ref.
-- Copiar: las cuatro filas completas; current_user puede ser el rol SQL de la sesión.
SELECT
  current_database() AS database_name,
  current_user AS sql_role,
  version() AS postgres_version,
  current_schemas(true) AS visible_schemas;
