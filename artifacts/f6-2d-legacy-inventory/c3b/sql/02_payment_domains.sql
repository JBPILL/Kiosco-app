SELECT
  dominio,
  valor,
  row_count
FROM (
  SELECT
    'pagos_venta.medio_pago'::text AS dominio,
    medio_pago::text AS valor,
    count(*)::bigint AS row_count
  FROM public.pagos_venta
  GROUP BY medio_pago
  UNION ALL
  SELECT
    'movimientos_caja.tipo'::text,
    tipo::text,
    count(*)::bigint
  FROM public.movimientos_caja
  GROUP BY tipo
  UNION ALL
  SELECT 'proveedores.count'::text, NULL::text, count(*)::bigint
  FROM public.proveedores
  UNION ALL
  SELECT 'compras_proveedor.count'::text, NULL::text, count(*)::bigint
  FROM public.compras_proveedor
  UNION ALL
  SELECT 'detalles_compra.count'::text, NULL::text, count(*)::bigint
  FROM public.detalles_compra
  UNION ALL
  SELECT 'pagos_proveedor.count'::text, NULL::text, count(*)::bigint
  FROM public.pagos_proveedor
) AS payment_domains
ORDER BY dominio, valor;
