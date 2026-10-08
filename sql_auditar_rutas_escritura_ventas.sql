-- Inventario de permisos efectivos y políticas, sin escribir datos comerciales.
-- Ejecutar en SQL Editor con un rol que pueda consultar los catálogos.
-- Un permiso true indica acceso al objeto; las políticas y funciones deben
-- revisarse para determinar si permiten eludir autorización de supervisor.
-- Este inventario NO sustituye pruebas con JWT real ni prueba denegación RLS.
BEGIN TRANSACTION READ ONLY;

WITH objetivos(nombre) AS (
  VALUES ('ventas'), ('detalles_venta'), ('pagos_venta'),
    ('checkout_manual_entradas'), ('checkout_manuales')
), roles(nombre) AS (VALUES ('anon'), ('authenticated'), ('service_role')),
permisos AS (
SELECT o.nombre AS tabla, r.nombre AS rol,
  c.oid IS NOT NULL AS existe,
  c.relrowsecurity AS rls_habilitado,
  c.relforcerowsecurity AS rls_forzado,
  CASE WHEN c.oid IS NOT NULL AND pr.oid IS NOT NULL
    THEN has_table_privilege(pr.oid, c.oid, 'INSERT') END AS puede_insertar,
  CASE WHEN c.oid IS NOT NULL AND pr.oid IS NOT NULL
    THEN has_table_privilege(pr.oid, c.oid, 'UPDATE') END AS puede_actualizar,
  CASE WHEN c.oid IS NOT NULL AND pr.oid IS NOT NULL
    THEN has_any_column_privilege(pr.oid, c.oid, 'INSERT') END AS puede_insertar_columnas,
  CASE WHEN c.oid IS NOT NULL AND pr.oid IS NOT NULL
    THEN has_any_column_privilege(pr.oid, c.oid, 'UPDATE') END AS puede_actualizar_columnas,
  CASE WHEN c.oid IS NOT NULL AND pr.oid IS NOT NULL
    THEN has_table_privilege(pr.oid, c.oid, 'DELETE') END AS puede_borrar
FROM objetivos o CROSS JOIN roles r
LEFT JOIN pg_namespace n ON n.nspname='public'
LEFT JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=o.nombre
LEFT JOIN pg_roles pr ON pr.rolname=r.nombre
ORDER BY o.nombre,r.nombre
), politicas AS (

SELECT tablename AS tabla, policyname AS politica, permissive, roles,
  cmd AS operacion, qual AS condicion_filas, with_check AS condicion_escritura
FROM pg_policies
WHERE schemaname='public'
  AND tablename IN ('ventas','detalles_venta','pagos_venta',
    'checkout_manual_entradas','checkout_manuales')
ORDER BY tablename,policyname
), funciones AS (

-- Incluye sobrecargas: no confundir funciones que comparten nombre.
SELECT p.oid::regprocedure::text AS funcion,
  p.prosecdef AS ejecuta_como_propietario,
  p.proconfig AS configuracion,
  r.rolname AS rol,
  has_function_privilege(r.oid,p.oid,'EXECUTE') AS puede_ejecutar
FROM pg_proc p
JOIN pg_namespace n ON n.oid=p.pronamespace
CROSS JOIN pg_roles r
WHERE n.nspname='public'
  AND r.rolname IN ('anon','authenticated','service_role')
  AND (p.proname ILIKE '%venta%' OR p.proname ILIKE '%checkout%')
ORDER BY funcion,r.rolname
)
SELECT jsonb_build_object(
  'permisos_tablas',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM permisos p),'[]'::jsonb),
  'politicas_rls',coalesce((SELECT jsonb_agg(to_jsonb(p)) FROM politicas p),'[]'::jsonb),
  'funciones',coalesce((SELECT jsonb_agg(to_jsonb(f)) FROM funciones f),'[]'::jsonb)
) AS diagnostico_completo;

ROLLBACK;
