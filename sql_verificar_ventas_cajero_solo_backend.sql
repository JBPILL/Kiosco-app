-- Solo lectura. Comprueba la instalación del paso 52; no sustituye una
-- prueba de INSERT con JWT de cajero ni una venta confirmada por backend.
WITH objetivos(tabla) AS (
  VALUES ('ventas'), ('detalles_venta'), ('pagos_venta')
), revision AS (
  SELECT o.tabla,
    coalesce(c.relrowsecurity, false) AS rls_habilitado,
    coalesce(p.polpermissive = false AND p.polcmd = 'a'
      AND p.polroles = ARRAY[r.oid]::oid[]
      AND pg_get_expr(p.polwithcheck, p.polrelid)
        IN ('auth_es_dueno_o_superadmin()', 'public.auth_es_dueno_o_superadmin()'),
      false) AS politica_correcta
  FROM objetivos o
  LEFT JOIN pg_namespace n ON n.nspname = 'public'
  LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = o.tabla
  LEFT JOIN pg_roles r ON r.rolname = 'authenticated'
  LEFT JOIN pg_policy p ON p.polrelid = c.oid
    AND p.polname = 'ventas_cajero_solo_backend_insert'
)
SELECT jsonb_build_object(
  'paso_52_instalado', bool_and(rls_habilitado AND politica_correcta),
  'tablas', jsonb_agg(to_jsonb(revision) ORDER BY tabla)
) AS diagnostico_cajero_backend
FROM revision;
