WITH payloads AS (
  SELECT 'checkout_manuales'::text AS relation_name, 'solicitud'::text AS column_name, to_jsonb(solicitud) AS payload
  FROM public.checkout_manuales
  UNION ALL
  SELECT 'checkout_manuales', 'resultado', to_jsonb(resultado)
  FROM public.checkout_manuales
  UNION ALL
  SELECT 'anulaciones_venta_atomicas', 'resultado', to_jsonb(resultado)
  FROM public.anulaciones_venta_atomicas
), shaped AS (
  SELECT
    relation_name,
    column_name,
    COALESCE(jsonb_typeof(payload), 'sql_null') AS json_type,
    CASE
      WHEN jsonb_typeof(payload) = 'object' THEN payload
      ELSE '{}'::jsonb
    END AS object_payload
  FROM payloads
)
SELECT
  relation_name,
  column_name,
  json_type,
  keys.key_name,
  count(*)::bigint AS row_count
FROM shaped
LEFT JOIN LATERAL jsonb_object_keys(object_payload) AS keys(key_name) ON true
GROUP BY relation_name, column_name, json_type, keys.key_name
ORDER BY relation_name, column_name, json_type, keys.key_name;
