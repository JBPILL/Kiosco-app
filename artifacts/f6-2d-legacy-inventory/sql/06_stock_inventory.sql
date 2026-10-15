-- F6.2D-B bloque 06 — snapshots, lotes y ledger de stock según columnas/FK observadas.
-- No devuelve productos, IDs de movimientos ni notas. tipo se muestra sólo como dimensión agregada;
-- no se presupone que cantidad sea delta firmado ni se calcula un neto semántico.
-- operaciones_stock queda OUT_OF_SCOPE y sólo se cuenta como diagnóstico.
-- Salida: metric, kiosco_id, dimension, row_count, numeric_total.
WITH metrics AS (
  SELECT 'stock_snapshot'::text AS metric, p.kiosco_id, NULL::text AS dimension,
         count(*)::bigint AS row_count, sum(p.stock_actual)::numeric AS numeric_total
  FROM public.productos p GROUP BY p.kiosco_id
  UNION ALL
  SELECT 'lotes_cantidad_actual', l.kiosco_id, NULL::text, count(*)::bigint,
         sum(l.cantidad_actual)::numeric FROM public.lotes_producto l GROUP BY l.kiosco_id
  UNION ALL
  SELECT 'lotes_cantidad_inicial', l.kiosco_id, NULL::text, count(*)::bigint,
         sum(l.cantidad_inicial)::numeric FROM public.lotes_producto l GROUP BY l.kiosco_id
  UNION ALL
  SELECT 'movimientos_cantidad_por_tipo', m.kiosco_id, m.tipo, count(*)::bigint,
         sum(m.cantidad)::numeric FROM public.movimientos_stock m GROUP BY m.kiosco_id, m.tipo
  UNION ALL
  SELECT 'movimiento_stock_costos', c.kiosco_id, NULL::text, count(*)::bigint,
         sum(c.precio_costo)::numeric FROM public.movimiento_stock_costos c GROUP BY c.kiosco_id
  UNION ALL
  SELECT 'operaciones_stock_fuera_scope', o.kiosco_id, NULL::text, count(*)::bigint,
         NULL::numeric FROM public.operaciones_stock o GROUP BY o.kiosco_id
  UNION ALL SELECT 'movimientos_producto_huerfano', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.movimientos_stock m LEFT JOIN public.productos p ON p.id = m.producto_id WHERE p.id IS NULL
  UNION ALL SELECT 'movimientos_kiosco_huerfano', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.movimientos_stock m LEFT JOIN public.kioscos k ON k.id = m.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'movimientos_usuario_huerfano', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.movimientos_stock m LEFT JOIN public.usuarios u ON u.id = m.usuario_id WHERE m.usuario_id IS NOT NULL AND u.id IS NULL
  UNION ALL SELECT 'movimientos_lote_huerfano', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.movimientos_stock m LEFT JOIN public.lotes_producto l ON l.id = m.lote_producto_id WHERE m.lote_producto_id IS NOT NULL AND l.id IS NULL
  UNION ALL SELECT 'movimientos_producto_kiosco_cruzado', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.movimientos_stock m JOIN public.productos p ON p.id = m.producto_id WHERE m.kiosco_id <> p.kiosco_id
  UNION ALL SELECT 'movimientos_lote_producto_kiosco_inconsistente', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.movimientos_stock m JOIN public.lotes_producto l ON l.id = m.lote_producto_id
    WHERE m.producto_id <> l.producto_id OR m.kiosco_id <> l.kiosco_id
  UNION ALL SELECT 'lotes_producto_huerfano', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.lotes_producto l LEFT JOIN public.productos p ON p.id = l.producto_id WHERE p.id IS NULL
  UNION ALL SELECT 'lotes_kiosco_huerfano', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.lotes_producto l LEFT JOIN public.kioscos k ON k.id = l.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'costos_movimiento_huerfano', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.movimiento_stock_costos c LEFT JOIN public.movimientos_stock m ON m.id = c.movimiento_id WHERE m.id IS NULL
  UNION ALL SELECT 'costos_kiosco_mismatch', NULL::uuid, NULL::text, count(*)::bigint, NULL::numeric
    FROM public.movimiento_stock_costos c JOIN public.movimientos_stock m ON m.id = c.movimiento_id WHERE c.kiosco_id <> m.kiosco_id
)
SELECT metric, kiosco_id, dimension, row_count, numeric_total FROM metrics ORDER BY metric, kiosco_id, dimension;
