SELECT
  tipo::text AS tipo,
  count(*)::bigint AS row_count,
  sum(cantidad)::numeric AS cantidad_sum,
  min(cantidad)::numeric AS cantidad_min,
  max(cantidad)::numeric AS cantidad_max,
  count(*) FILTER (WHERE cantidad < 0)::bigint AS cantidad_negativa,
  count(*) FILTER (WHERE cantidad = 0)::bigint AS cantidad_cero,
  count(*) FILTER (WHERE cantidad > 0)::bigint AS cantidad_positiva
FROM public.movimientos_stock
GROUP BY tipo
ORDER BY tipo;
