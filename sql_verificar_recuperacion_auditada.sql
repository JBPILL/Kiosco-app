-- Sólo lectura: catálogo del paso 53. No prueba JWT, código Edge ni atomicidad.
WITH objetos AS (
  SELECT to_regclass('public.checkout_recuperaciones') AS tabla,
    to_regprocedure('public.confirmar_checkout_recuperado(uuid,jsonb)') AS funcion
), controles AS (
  SELECT
    o.tabla IS NOT NULL AS tabla_presente,
    coalesce(c.relrowsecurity,false) AS rls_habilitado,
    o.funcion IS NOT NULL AS funcion_presente,
    coalesce(f.prosecdef,false) AS ejecuta_como_propietario,
    coalesce(f.proconfig @> ARRAY['search_path=pg_catalog, public'],false) AS search_path_correcto,
    NOT EXISTS (
      SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated','service_role')
      AND (has_table_privilege(r.oid,o.tabla,'INSERT,UPDATE,DELETE')
        OR has_any_column_privilege(r.oid,o.tabla,'INSERT,UPDATE'))
    ) AND o.tabla IS NOT NULL AS sin_escritura_directa,
    EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname='service_role'
      AND has_function_privilege(r.oid,o.funcion,'EXECUTE')) AS servidor_puede_ejecutar,
    NOT EXISTS (SELECT 1 FROM pg_roles r WHERE r.rolname IN ('anon','authenticated')
      AND has_function_privilege(r.oid,o.funcion,'EXECUTE')) AND o.funcion IS NOT NULL AS navegador_no_ejecuta,
    EXISTS (SELECT 1 FROM pg_policy p JOIN pg_roles r ON r.rolname='authenticated'
      WHERE p.polrelid=o.tabla AND p.polname='checkout_recuperacion_dueno'
        AND p.polcmd='r' AND p.polroles=ARRAY[r.oid]::oid[]
        AND pg_get_expr(p.polqual,p.polrelid) IN (
          '((kiosco_id = auth_user_kiosco_id()) AND auth_es_dueno_o_superadmin())',
          '((kiosco_id = public.auth_user_kiosco_id()) AND public.auth_es_dueno_o_superadmin())'
        )) AS politica_lectura_correcta
  FROM objetos o LEFT JOIN pg_class c ON c.oid=o.tabla LEFT JOIN pg_proc f ON f.oid=o.funcion
)
SELECT to_jsonb(controles) AS diagnostico_recuperacion_auditada FROM controles;
