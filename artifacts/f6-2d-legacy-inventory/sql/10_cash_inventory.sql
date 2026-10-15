-- F6.2D-B bloque 10 — caja cerrada, movimientos y dependencias por sesión.
-- No devuelve IDs de sesiones, usuario, notas, descripciones ni movimientos individuales.
-- estado ABIERTA cuenta como bloqueo explícito; se excluye de sumas de cierres migrables.
-- Salida agregada: metric, kiosco_id, dimension, row_count y montos NUMERIC según encabezado.
WITH sessions AS (
  SELECT kiosco_id, estado::text AS estado, count(*)::bigint AS session_count,
         (sum(monto_inicial) FILTER (WHERE estado <> 'ABIERTA' AND fecha_cierre IS NOT NULL))::numeric AS opening_sum,
         (sum(monto_final_declarado) FILTER (WHERE estado <> 'ABIERTA' AND fecha_cierre IS NOT NULL))::numeric AS declared_close_sum,
         (sum(monto_final_sistema) FILTER (WHERE estado <> 'ABIERTA' AND fecha_cierre IS NOT NULL))::numeric AS system_close_sum,
         (sum(diferencia) FILTER (WHERE estado <> 'ABIERTA' AND fecha_cierre IS NOT NULL))::numeric AS difference_sum,
         count(*) FILTER (WHERE estado = 'ABIERTA')::bigint AS open_count,
         count(*) FILTER (WHERE fecha_cierre IS NOT NULL)::bigint AS closed_timestamp_count
  FROM public.sesiones_caja GROUP BY kiosco_id, estado
), cash_moves AS (
  SELECT kiosco_id, tipo::text AS tipo, count(*)::bigint AS movement_count, sum(monto)::numeric AS movement_sum
  FROM public.movimientos_caja GROUP BY kiosco_id, tipo
), metrics AS (
  SELECT 'sesiones_por_estado'::text AS metric, s.kiosco_id, s.estado AS dimension, s.session_count AS row_count,
         s.opening_sum AS amount_1, s.declared_close_sum AS amount_2,
         s.system_close_sum AS amount_3, s.difference_sum AS amount_4
  FROM sessions s
  UNION ALL SELECT 'sesiones_abiertas_blocker', s.kiosco_id, s.estado, s.open_count,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric FROM sessions s WHERE s.estado = 'ABIERTA'
  UNION ALL SELECT 'sesiones_con_fecha_cierre', s.kiosco_id, s.estado, s.closed_timestamp_count,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric FROM sessions s
  UNION ALL SELECT 'movimientos_caja_por_tipo', m.kiosco_id, m.tipo, m.movement_count,
         m.movement_sum, NULL::numeric, NULL::numeric, NULL::numeric FROM cash_moves m
  UNION ALL SELECT 'movimientos_caja_sesion_huerfana', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.movimientos_caja m LEFT JOIN public.sesiones_caja s ON s.id = m.sesion_caja_id WHERE s.id IS NULL
  UNION ALL SELECT 'movimiento_caja_kiosco_huerfano', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.movimientos_caja m LEFT JOIN public.kioscos k ON k.id = m.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'movimiento_caja_usuario_huerfano', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.movimientos_caja m LEFT JOIN public.usuarios u ON u.id = m.usuario_id WHERE m.usuario_id IS NOT NULL AND u.id IS NULL
  UNION ALL SELECT 'movimiento_caja_sesion_kiosco_cruzado', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.movimientos_caja m JOIN public.sesiones_caja s ON s.id = m.sesion_caja_id WHERE m.kiosco_id <> s.kiosco_id
  UNION ALL SELECT 'ventas_en_sesion_abierta', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.ventas v JOIN public.sesiones_caja s ON s.id = v.sesion_caja_id WHERE s.estado = 'ABIERTA'
  UNION ALL SELECT 'ventas_en_sesion_cerrada', s.kiosco_id, NULL::text, count(*)::bigint,
         sum(v.total)::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.ventas v JOIN public.sesiones_caja s ON s.id = v.sesion_caja_id
    WHERE s.estado <> 'ABIERTA' AND s.fecha_cierre IS NOT NULL GROUP BY s.kiosco_id
  UNION ALL SELECT 'compras_en_sesion_abierta', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.compras_proveedor p JOIN public.sesiones_caja s ON s.id = p.sesion_caja_id WHERE s.estado = 'ABIERTA'
  UNION ALL SELECT 'compras_en_sesion_cerrada', s.kiosco_id, NULL::text, count(*)::bigint,
         sum(p.total)::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.compras_proveedor p JOIN public.sesiones_caja s ON s.id = p.sesion_caja_id
    WHERE s.estado <> 'ABIERTA' AND s.fecha_cierre IS NOT NULL GROUP BY s.kiosco_id
  UNION ALL SELECT 'pagos_proveedor_en_sesion_abierta', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.pagos_proveedor p JOIN public.sesiones_caja s ON s.id = p.sesion_caja_id WHERE s.estado = 'ABIERTA'
  UNION ALL SELECT 'pagos_proveedor_en_sesion_cerrada', s.kiosco_id, NULL::text, count(*)::bigint,
         sum(p.monto)::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.pagos_proveedor p JOIN public.sesiones_caja s ON s.id = p.sesion_caja_id
    WHERE s.estado <> 'ABIERTA' AND s.fecha_cierre IS NOT NULL GROUP BY s.kiosco_id
  UNION ALL SELECT 'venta_sesion_kiosco_cruzado', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.ventas v JOIN public.sesiones_caja s ON s.id = v.sesion_caja_id WHERE v.kiosco_id <> s.kiosco_id
  UNION ALL SELECT 'compra_sesion_kiosco_cruzado', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.compras_proveedor p JOIN public.sesiones_caja s ON s.id = p.sesion_caja_id WHERE p.kiosco_id <> s.kiosco_id
  UNION ALL SELECT 'pago_proveedor_sesion_kiosco_cruzado', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.pagos_proveedor p JOIN public.sesiones_caja s ON s.id = p.sesion_caja_id WHERE p.kiosco_id <> s.kiosco_id
  UNION ALL SELECT 'sesion_usuario_huerfano', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.sesiones_caja s LEFT JOIN public.usuarios u ON u.id = s.usuario_id WHERE u.id IS NULL
  UNION ALL SELECT 'sesion_kiosco_huerfano', NULL::uuid, NULL::text, count(*)::bigint,
         NULL::numeric, NULL::numeric, NULL::numeric, NULL::numeric
    FROM public.sesiones_caja s LEFT JOIN public.kioscos k ON k.id = s.kiosco_id WHERE k.id IS NULL
)
SELECT metric, kiosco_id, dimension, row_count, amount_1, amount_2, amount_3, amount_4
FROM metrics ORDER BY metric, kiosco_id, dimension;
