-- Preflight de catálogo exclusivamente de lectura para anular_venta_atomica.
-- No consulta filas de ventas/clientes ni ejecuta las funciones inspeccionadas.
-- Ejecutar en SQL Editor de Supabase sólo con acceso de lectura/autorizado.

WITH funciones_objetivo(nombre, firma) AS (
  VALUES
    ('public.anular_venta_atomica', 'public.anular_venta_atomica(uuid,text,uuid)'),
    ('public.proteger_anulacion_atomica', 'public.proteger_anulacion_atomica()'),
    ('public.proteger_lineas_venta_anulada', 'public.proteger_lineas_venta_anulada()'),
    ('public.proteger_devolucion_venta_vigente', 'public.proteger_devolucion_venta_vigente()'),
    ('public.auth_user_kiosco_id', 'public.auth_user_kiosco_id()'),
    ('public.auth_es_dueno_o_superadmin', 'public.auth_es_dueno_o_superadmin()'),
    ('auth.uid', 'auth.uid()')
), tablas_objetivo(nombre) AS (
  VALUES
    ('ventas'), ('detalles_venta'), ('pagos_venta'), ('productos'),
    ('movimientos_stock'), ('lotes_producto'), ('movimientos_caja'),
    ('movimientos_cuenta_corriente'), ('clientes'), ('sesiones_caja'),
    ('checkout_manuales'), ('anulaciones_venta_atomicas'),
    ('auditoria_operaciones'), ('devoluciones_venta')
), funciones AS (
  SELECT f.nombre, f.firma, to_regprocedure(f.firma) AS oid
  FROM funciones_objetivo f
)
SELECT jsonb_build_object(
  'funciones', (
    SELECT jsonb_agg(jsonb_build_object(
      'nombre', f.nombre,
      'firma', f.firma,
      'existe', f.oid IS NOT NULL,
      'owner', CASE WHEN p.oid IS NOT NULL THEN pg_get_userbyid(p.proowner) END,
      'return_type', CASE WHEN p.oid IS NOT NULL THEN pg_get_function_result(p.oid) END,
      'security_definer', p.prosecdef,
      'configuracion', p.proconfig,
      'acl', p.proacl::text,
      'permisos', (
        SELECT jsonb_object_agg(r.rolname, has_function_privilege(r.oid, p.oid, 'EXECUTE'))
        FROM pg_roles r
        WHERE r.rolname IN ('anon', 'authenticated', 'service_role', 'postgres')
      ),
      'public_execute', coalesce((
        SELECT bool_or(a.grantee = 0 AND a.privilege_type = 'EXECUTE')
        FROM aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
      ), false),
      'definition', CASE WHEN p.oid IS NOT NULL THEN pg_get_functiondef(p.oid) END
    ) ORDER BY f.nombre)
    FROM funciones f LEFT JOIN pg_proc p ON p.oid = f.oid
  ),
  'triggers', (
    SELECT jsonb_agg(jsonb_build_object(
      'tabla', c.relname,
      'trigger', t.tgname,
      'habilitado', t.tgenabled IN ('O', 'A'),
      'funcion', format('%I.%I', ns.nspname, p.proname),
      'owner_funcion', pg_get_userbyid(p.proowner),
      'security_definer', p.prosecdef,
      'configuracion_funcion', p.proconfig,
      'definicion_trigger', pg_get_triggerdef(t.oid),
      'definicion_funcion', pg_get_functiondef(p.oid)
    ) ORDER BY c.relname, t.tgname)
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace table_ns ON table_ns.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace ns ON ns.oid = p.pronamespace
    WHERE table_ns.nspname = 'public'
      AND c.relname IN (SELECT nombre FROM tablas_objetivo)
      AND NOT t.tgisinternal
  ),
  'tablas', (
    SELECT jsonb_agg(jsonb_build_object(
      'tabla', t.nombre,
      'existe', c.oid IS NOT NULL,
      'rls', coalesce(c.relrowsecurity, false),
      'force_rls', coalesce(c.relforcerowsecurity, false),
      'policies', coalesce((
        SELECT jsonb_agg(jsonb_build_object(
          'nombre', pol.polname,
          'roles', pol.polroles,
          'comando', pol.polcmd,
          'using', pg_get_expr(pol.polqual, pol.polrelid),
          'with_check', pg_get_expr(pol.polwithcheck, pol.polrelid)
        ) ORDER BY pol.polname)
        FROM pg_policy pol WHERE pol.polrelid = c.oid
      ), '[]'::jsonb)
    ) ORDER BY t.nombre)
    FROM tablas_objetivo t
    LEFT JOIN pg_namespace n ON n.nspname = 'public'
    LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = t.nombre
  ),
  'constraints', (
    SELECT jsonb_agg(jsonb_build_object(
      'tabla', c.relname,
      'constraint', con.conname,
      'tipo', con.contype,
      'validada', con.convalidated,
      'definicion', pg_get_constraintdef(con.oid)
    ) ORDER BY c.relname, con.conname)
    FROM pg_constraint con
    JOIN pg_class c ON c.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname IN (SELECT nombre FROM tablas_objetivo)
  )
) AS preflight_anulacion_atomica;
