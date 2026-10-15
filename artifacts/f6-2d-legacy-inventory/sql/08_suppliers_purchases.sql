-- F6.2D-B bloque 08 — proveedores, compras, detalles y pagos según columnas/FK observadas.
-- No devuelve proveedor, contacto, CUIT, email, comprobante, notas ni fila de negocio.
-- pagos_proveedor se agrega sin asumir que estado='ACTIVO' define el saldo contable.
-- movimientos_proveedor y operaciones_escritura no existen en el esquema observado; no se consultan.
-- Salida: metric, kiosco_id, row_count, amount_sum.
WITH purchase_detail AS (
  SELECT p.id AS compra_id, p.kiosco_id, p.total,
         count(d.id)::bigint AS detail_count, coalesce(sum(d.subtotal), 0)::numeric AS detail_sum
  FROM public.compras_proveedor p
  LEFT JOIN public.detalles_compra d ON d.compra_id = p.id
  GROUP BY p.id, p.kiosco_id, p.total
), supplier_rollup AS (
  SELECT kiosco_id, count(*)::bigint AS supplier_count, sum(saldo_pendiente)::numeric AS balance_sum
  FROM public.proveedores GROUP BY kiosco_id
), purchase_rollup AS (
  SELECT kiosco_id, count(*)::bigint AS purchase_count, sum(total)::numeric AS header_sum,
         count(*) FILTER (WHERE sesion_caja_id IS NOT NULL)::bigint AS with_cash_session
  FROM public.compras_proveedor GROUP BY kiosco_id
), detail_rollup AS (
  SELECT kiosco_id, sum(detail_count)::bigint AS detail_count, sum(detail_sum)::numeric AS detail_sum,
         count(*) FILTER (WHERE total <> detail_sum)::bigint AS purchase_detail_mismatch_count,
         sum(total - detail_sum)::numeric AS header_minus_detail_sum
  FROM purchase_detail GROUP BY kiosco_id
), payment_rollup AS (
  SELECT kiosco_id, count(*)::bigint AS payment_count, sum(monto)::numeric AS payment_sum,
         sum(saldo_anterior)::numeric AS prior_balance_sum, sum(saldo_nuevo)::numeric AS resulting_balance_sum
  FROM public.pagos_proveedor GROUP BY kiosco_id
), metrics AS (
  SELECT 'proveedores_y_saldo_snapshot'::text AS metric, s.kiosco_id, s.supplier_count AS row_count, s.balance_sum AS amount_sum
  FROM supplier_rollup s
  UNION ALL SELECT 'compras_y_total_cabecera', p.kiosco_id, p.purchase_count, p.header_sum FROM purchase_rollup p
  UNION ALL SELECT 'compras_con_sesion_caja', p.kiosco_id, p.with_cash_session, NULL::numeric FROM purchase_rollup p
  UNION ALL SELECT 'detalles_compra_y_subtotal', d.kiosco_id, d.detail_count, d.detail_sum FROM detail_rollup d
  UNION ALL SELECT 'compras_cabecera_distinta_a_detalles', d.kiosco_id, d.purchase_detail_mismatch_count, d.header_minus_detail_sum FROM detail_rollup d
  UNION ALL SELECT 'pagos_proveedor_y_monto', p.kiosco_id, p.payment_count, p.payment_sum FROM payment_rollup p
  UNION ALL SELECT 'pagos_saldo_anterior', p.kiosco_id, p.payment_count, p.prior_balance_sum FROM payment_rollup p
  UNION ALL SELECT 'pagos_saldo_nuevo', p.kiosco_id, p.payment_count, p.resulting_balance_sum FROM payment_rollup p
  UNION ALL SELECT 'compras_proveedor_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.compras_proveedor p LEFT JOIN public.proveedores v ON v.id = p.proveedor_id WHERE v.id IS NULL
  UNION ALL SELECT 'compras_usuario_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.compras_proveedor p LEFT JOIN public.usuarios u ON u.id = p.usuario_id WHERE p.usuario_id IS NOT NULL AND u.id IS NULL
  UNION ALL SELECT 'compras_sesion_huerfana', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.compras_proveedor p LEFT JOIN public.sesiones_caja s ON s.id = p.sesion_caja_id WHERE p.sesion_caja_id IS NOT NULL AND s.id IS NULL
  UNION ALL SELECT 'compras_sesion_abierta', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.compras_proveedor p JOIN public.sesiones_caja s ON s.id = p.sesion_caja_id WHERE s.estado = 'ABIERTA'
  UNION ALL SELECT 'compra_kiosco_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.compras_proveedor p LEFT JOIN public.kioscos k ON k.id = p.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'detalles_compra_compra_huerfana', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.detalles_compra d LEFT JOIN public.compras_proveedor p ON p.id = d.compra_id WHERE p.id IS NULL
  UNION ALL SELECT 'detalles_compra_producto_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.detalles_compra d LEFT JOIN public.productos p ON p.id = d.producto_id WHERE p.id IS NULL
  UNION ALL SELECT 'detalle_compra_producto_kiosco_cruzado', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.detalles_compra d JOIN public.compras_proveedor c ON c.id = d.compra_id JOIN public.productos p ON p.id = d.producto_id
    WHERE c.kiosco_id <> p.kiosco_id
  UNION ALL SELECT 'pago_proveedor_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.pagos_proveedor p LEFT JOIN public.proveedores v ON v.id = p.proveedor_id WHERE v.id IS NULL
  UNION ALL SELECT 'pago_proveedor_sesion_huerfana', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.pagos_proveedor p LEFT JOIN public.sesiones_caja s ON s.id = p.sesion_caja_id WHERE p.sesion_caja_id IS NOT NULL AND s.id IS NULL
  UNION ALL SELECT 'pago_proveedor_sesion_abierta', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.pagos_proveedor p JOIN public.sesiones_caja s ON s.id = p.sesion_caja_id WHERE s.estado = 'ABIERTA'
  UNION ALL SELECT 'pago_proveedor_kiosco_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.pagos_proveedor p LEFT JOIN public.kioscos k ON k.id = p.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'proveedor_kiosco_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.proveedores v LEFT JOIN public.kioscos k ON k.id = v.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'compra_proveedor_kiosco_cruzado', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.compras_proveedor p JOIN public.proveedores v ON v.id = p.proveedor_id WHERE p.kiosco_id <> v.kiosco_id
  UNION ALL SELECT 'pago_proveedor_kiosco_cruzado', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.pagos_proveedor p JOIN public.proveedores v ON v.id = p.proveedor_id WHERE p.kiosco_id <> v.kiosco_id
  UNION ALL SELECT 'movimientos_proveedor_source_relation_absent', NULL::uuid, 0::bigint, NULL::numeric
)
SELECT metric, kiosco_id, row_count, amount_sum FROM metrics ORDER BY metric, kiosco_id;
