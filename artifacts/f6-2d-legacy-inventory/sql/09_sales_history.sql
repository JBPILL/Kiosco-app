-- F6.2D-B bloque 09 — ventas, detalles, pagos y anulaciones con agregados no personales.
-- No consulta ni devuelve columnas AFIP/CAE, comprobantes, referencias de pago ni datos de clientes.
-- Diferencias pago-total son diagnósticas: crédito/saldos y estados deben interpretarse antes de GO.
-- Salida: metric, kiosco_id, dimension, row_count, amount_sum.
WITH sale_lines AS (
  SELECT v.id AS venta_id, v.kiosco_id, v.total,
         count(d.id)::bigint AS detail_count, coalesce(sum(d.subtotal), 0)::numeric AS detail_sum
  FROM public.ventas v
  LEFT JOIN public.detalles_venta d ON d.venta_id = v.id
  GROUP BY v.id, v.kiosco_id, v.total
), sales_rollup AS (
  SELECT kiosco_id, estado, count(*)::bigint AS sale_count, sum(total)::numeric AS sale_total
  FROM public.ventas GROUP BY kiosco_id, estado
), detail_rollup AS (
  SELECT kiosco_id, sum(detail_count)::bigint AS detail_count, sum(detail_sum)::numeric AS detail_sum,
         count(*) FILTER (WHERE total <> detail_sum)::bigint AS mismatch_count,
         sum(total - detail_sum)::numeric AS header_minus_detail
  FROM sale_lines GROUP BY kiosco_id
), payment_rollup AS (
  SELECT v.kiosco_id, count(p.id)::bigint AS payment_count, sum(p.monto)::numeric AS payment_sum
  FROM public.ventas v LEFT JOIN public.pagos_venta p ON p.venta_id = v.id GROUP BY v.kiosco_id
), annulment_rollup AS (
  SELECT kiosco_id, count(*)::bigint AS annulment_count FROM public.anulaciones_venta_atomicas GROUP BY kiosco_id
), metrics AS (
  SELECT 'ventas_por_estado'::text AS metric, s.kiosco_id, s.estado::text AS dimension, s.sale_count AS row_count, s.sale_total AS amount_sum
  FROM sales_rollup s
  UNION ALL SELECT 'detalles_venta_y_subtotal', d.kiosco_id, NULL::text, d.detail_count, d.detail_sum FROM detail_rollup d
  UNION ALL SELECT 'cabeceras_venta_distintas_a_detalles', d.kiosco_id, NULL::text, d.mismatch_count, d.header_minus_detail FROM detail_rollup d
  UNION ALL SELECT 'pagos_venta_y_monto', p.kiosco_id, NULL::text, p.payment_count, p.payment_sum FROM payment_rollup p
  UNION ALL SELECT 'anulaciones_atomicas', a.kiosco_id, NULL::text, a.annulment_count, NULL::numeric FROM annulment_rollup a
  UNION ALL SELECT 'pagos_menos_total_venta_diagnostico', s.kiosco_id, NULL::text,
         count(*)::bigint, sum(s.total - coalesce(p.payment_sum, 0))::numeric
    FROM public.ventas s LEFT JOIN (SELECT venta_id, sum(monto)::numeric AS payment_sum FROM public.pagos_venta GROUP BY venta_id) p
      ON p.venta_id = s.id GROUP BY s.kiosco_id
  UNION ALL SELECT 'detalle_venta_venta_huerfana', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.detalles_venta d LEFT JOIN public.ventas v ON v.id = d.venta_id WHERE v.id IS NULL
  UNION ALL SELECT 'detalle_venta_producto_huerfano', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.detalles_venta d LEFT JOIN public.productos p ON p.id = d.producto_id WHERE p.id IS NULL
  UNION ALL SELECT 'detalle_producto_kiosco_cruzado', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.detalles_venta d JOIN public.ventas v ON v.id = d.venta_id JOIN public.productos p ON p.id = d.producto_id
    WHERE v.kiosco_id <> p.kiosco_id
  UNION ALL SELECT 'pago_venta_huerfano', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.pagos_venta p LEFT JOIN public.ventas v ON v.id = p.venta_id WHERE v.id IS NULL
  UNION ALL SELECT 'venta_sesion_huerfana', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.ventas v LEFT JOIN public.sesiones_caja s ON s.id = v.sesion_caja_id WHERE v.sesion_caja_id IS NOT NULL AND s.id IS NULL
  UNION ALL SELECT 'venta_usuario_huerfano', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.ventas v LEFT JOIN public.usuarios u ON u.id = v.usuario_id WHERE v.usuario_id IS NOT NULL AND u.id IS NULL
  UNION ALL SELECT 'venta_sesion_kiosco_cruzado', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.ventas v JOIN public.sesiones_caja s ON s.id = v.sesion_caja_id WHERE v.kiosco_id <> s.kiosco_id
  UNION ALL SELECT 'anulacion_venta_huerfana', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.anulaciones_venta_atomicas a LEFT JOIN public.ventas v ON v.id = a.venta_id WHERE v.id IS NULL
  UNION ALL SELECT 'anulacion_venta_kiosco_cruzado', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.anulaciones_venta_atomicas a JOIN public.ventas v ON v.id = a.venta_id WHERE a.kiosco_id <> v.kiosco_id
)
SELECT metric, kiosco_id, dimension, row_count, amount_sum FROM metrics ORDER BY metric, kiosco_id, dimension;
