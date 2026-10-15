-- F6.2D-B bloque 11 — baseline exacto, agregado y repetible por kiosco.
-- Métricas alineadas a entidades/columnas observadas y al contrato de migración.
-- No incluye filas de negocio, PII, secretos, AFIP/CAE ni recursos OUT_OF_SCOPE.
-- Abiertas se informan como blocker y no se suman a métricas de cierre migrables.
-- Para repetir en destino, usar los mismos nombres de métrica tras aprobar el mapping target.
-- Salida: metric, kiosco_id, dimension, row_count, amount_sum (NUMERIC exacto).
WITH metrics AS (
  SELECT 'kioscos'::text AS metric, NULL::uuid AS kiosco_id, NULL::text AS dimension,
         count(*)::bigint AS row_count, NULL::numeric AS amount_sum FROM public.kioscos
  UNION ALL SELECT 'usuarios', kiosco_id, NULL::text, count(*)::bigint, NULL::numeric FROM public.usuarios GROUP BY kiosco_id
  UNION ALL SELECT 'categorias', kiosco_id, NULL::text, count(*)::bigint, NULL::numeric FROM public.categorias GROUP BY kiosco_id
  UNION ALL SELECT 'proveedores', kiosco_id, NULL::text, count(*)::bigint, sum(saldo_pendiente)::numeric FROM public.proveedores GROUP BY kiosco_id
  UNION ALL SELECT 'clientes', kiosco_id, NULL::text, count(*)::bigint, sum(saldo_deudor)::numeric FROM public.clientes GROUP BY kiosco_id
  UNION ALL SELECT 'combo_items', kiosco_id, NULL::text, count(*)::bigint, NULL::numeric FROM public.combo_items GROUP BY kiosco_id
  UNION ALL SELECT 'promociones', kiosco_id, NULL::text, count(*)::bigint, NULL::numeric FROM public.promociones GROUP BY kiosco_id
  UNION ALL SELECT 'productos_stock_snapshot', kiosco_id, NULL::text, count(*)::bigint, sum(stock_actual)::numeric FROM public.productos GROUP BY kiosco_id
  UNION ALL SELECT 'productos_precio_costo_snapshot', kiosco_id, NULL::text, count(*)::bigint, sum(precio_costo)::numeric FROM public.productos GROUP BY kiosco_id
  UNION ALL SELECT 'productos_precio_venta_snapshot', kiosco_id, NULL::text, count(*)::bigint, sum(precio_venta)::numeric FROM public.productos GROUP BY kiosco_id
  UNION ALL SELECT 'producto_costos_snapshot', kiosco_id, NULL::text, count(*)::bigint, sum(precio_costo)::numeric FROM public.producto_costos GROUP BY kiosco_id
  UNION ALL SELECT 'lotes_cantidad_actual', kiosco_id, NULL::text, count(*)::bigint, sum(cantidad_actual)::numeric FROM public.lotes_producto GROUP BY kiosco_id
  UNION ALL SELECT 'movimientos_stock_por_tipo', kiosco_id, tipo::text, count(*)::bigint, sum(cantidad)::numeric FROM public.movimientos_stock GROUP BY kiosco_id, tipo
  UNION ALL SELECT 'movimiento_stock_costos', kiosco_id, NULL::text, count(*)::bigint, sum(precio_costo)::numeric FROM public.movimiento_stock_costos GROUP BY kiosco_id
  UNION ALL SELECT 'clientes_cc_movimientos', kiosco_id, NULL::text, count(*)::bigint, sum(monto)::numeric FROM public.movimientos_cuenta_corriente GROUP BY kiosco_id
  UNION ALL SELECT 'ventas_por_estado', kiosco_id, estado::text, count(*)::bigint, sum(total)::numeric FROM public.ventas GROUP BY kiosco_id, estado
  UNION ALL SELECT 'detalles_venta', v.kiosco_id, NULL::text, count(*)::bigint, sum(d.subtotal)::numeric
    FROM public.detalles_venta d JOIN public.ventas v ON v.id = d.venta_id GROUP BY v.kiosco_id
  UNION ALL SELECT 'pagos_venta', v.kiosco_id, NULL::text, count(*)::bigint, sum(p.monto)::numeric
    FROM public.pagos_venta p JOIN public.ventas v ON v.id = p.venta_id GROUP BY v.kiosco_id
  UNION ALL SELECT 'compras_proveedor', kiosco_id, NULL::text, count(*)::bigint, sum(total)::numeric FROM public.compras_proveedor GROUP BY kiosco_id
  UNION ALL SELECT 'detalles_compra', p.kiosco_id, NULL::text, count(*)::bigint, sum(d.subtotal)::numeric
    FROM public.detalles_compra d JOIN public.compras_proveedor p ON p.id = d.compra_id GROUP BY p.kiosco_id
  UNION ALL SELECT 'pagos_proveedor', kiosco_id, NULL::text, count(*)::bigint, sum(monto)::numeric FROM public.pagos_proveedor GROUP BY kiosco_id
  UNION ALL SELECT 'checkout_manuales_evidencia', kiosco_id, NULL::text, count(*)::bigint, NULL::numeric FROM public.checkout_manuales GROUP BY kiosco_id
  UNION ALL SELECT 'anulaciones_venta_atomicas_evidencia', kiosco_id, NULL::text, count(*)::bigint, NULL::numeric FROM public.anulaciones_venta_atomicas GROUP BY kiosco_id
  UNION ALL SELECT 'sesiones_caja_abiertas_blocker', kiosco_id, estado::text, count(*)::bigint, NULL::numeric
    FROM public.sesiones_caja WHERE estado = 'ABIERTA' GROUP BY kiosco_id, estado
  UNION ALL SELECT 'sesiones_caja_por_estado', kiosco_id, estado::text, count(*)::bigint, NULL::numeric
    FROM public.sesiones_caja GROUP BY kiosco_id, estado
  UNION ALL SELECT 'sesiones_caja_cerradas', kiosco_id, NULL::text, count(*)::bigint, sum(monto_final_declarado)::numeric
    FROM public.sesiones_caja WHERE estado <> 'ABIERTA' AND fecha_cierre IS NOT NULL GROUP BY kiosco_id
  UNION ALL SELECT 'sesiones_caja_cierre_sistema', kiosco_id, NULL::text, count(*)::bigint, sum(monto_final_sistema)::numeric
    FROM public.sesiones_caja WHERE estado <> 'ABIERTA' AND fecha_cierre IS NOT NULL GROUP BY kiosco_id
  UNION ALL SELECT 'sesiones_caja_diferencias', kiosco_id, NULL::text, count(*)::bigint, sum(diferencia)::numeric
    FROM public.sesiones_caja WHERE estado <> 'ABIERTA' AND fecha_cierre IS NOT NULL GROUP BY kiosco_id
  UNION ALL SELECT 'movimientos_caja_por_tipo', kiosco_id, tipo::text, count(*)::bigint, sum(monto)::numeric
    FROM public.movimientos_caja GROUP BY kiosco_id, tipo
  UNION ALL SELECT 'operaciones_escritura_source_relation_absent', NULL::uuid, NULL::text, 0::bigint, NULL::numeric
  UNION ALL SELECT 'movimientos_proveedor_source_relation_absent', NULL::uuid, NULL::text, 0::bigint, NULL::numeric
  UNION ALL SELECT 'historial_precios_producto_source_relation_absent', NULL::uuid, NULL::text, 0::bigint, NULL::numeric
)
SELECT metric, kiosco_id, dimension, row_count, amount_sum FROM metrics ORDER BY metric, kiosco_id, dimension;
