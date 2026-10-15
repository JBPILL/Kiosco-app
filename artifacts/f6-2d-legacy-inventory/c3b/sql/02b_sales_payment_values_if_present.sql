SELECT
  'ventas.medio_pago'::text AS dominio,
  medio_pago::text AS valor,
  count(*)::bigint AS row_count
FROM public.ventas
GROUP BY medio_pago
ORDER BY valor;
