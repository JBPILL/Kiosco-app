-- Sólo lectura. Inventario de permisos efectivos y políticas, no aceptación JWT.
-- No declara segura una política por su nombre ni modifica el circuito operativo.
WITH tablas AS (
  SELECT nombre, to_regclass('public.' || nombre) AS oid
  FROM (VALUES ('devoluciones_venta'), ('detalles_devolucion')) t(nombre)
), diagnosticos AS (
  SELECT t.nombre AS tabla, t.oid IS NOT NULL AS presente,
    coalesce(c.relrowsecurity,false) AS rls_habilitado,
    coalesce((SELECT jsonb_agg(jsonb_build_object(
      'rol', r.rolname,
      'escritura_tabla', coalesce(has_table_privilege(r.oid,t.oid,'INSERT,UPDATE,DELETE'),false),
      'escritura_columnas', coalesce(has_any_column_privilege(r.oid,t.oid,'INSERT,UPDATE'),false)
    ) ORDER BY r.rolname) FROM pg_roles r
      WHERE r.rolname IN ('anon','authenticated','service_role')), '[]'::jsonb) AS permisos,
    coalesce((SELECT jsonb_agg(jsonb_build_object(
      'nombre', p.polname, 'comando', p.polcmd::text, 'permisiva', p.polpermissive,
      'roles', (SELECT jsonb_agg(CASE WHEN x.rol=0 THEN 'PUBLIC' ELSE pg_get_userbyid(x.rol)::text END ORDER BY x.rol)
        FROM unnest(p.polroles) x(rol)),
      'usando', pg_get_expr(p.polqual,p.polrelid),
      'comprobacion', pg_get_expr(p.polwithcheck,p.polrelid)
    ) ORDER BY p.polname) FROM pg_policy p WHERE p.polrelid=t.oid), '[]'::jsonb) AS politicas
  FROM tablas t LEFT JOIN pg_class c ON c.oid=t.oid
)
SELECT jsonb_agg(to_jsonb(d) ORDER BY tabla) AS diagnostico_devoluciones
FROM diagnosticos d;
