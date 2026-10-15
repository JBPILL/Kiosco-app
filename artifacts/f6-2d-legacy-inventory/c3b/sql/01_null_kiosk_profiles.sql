SELECT
  rol,
  es_superadmin,
  activo,
  count(*)::bigint AS perfiles
FROM public.usuarios
WHERE kiosco_id IS NULL
GROUP BY rol, es_superadmin, activo
ORDER BY rol, es_superadmin, activo;
