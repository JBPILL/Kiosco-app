-- F6.2D-B bloque 07 — clientes y cuenta corriente con métricas agregadas por kiosco.
-- Usa sólo columnas observadas: clientes.saldo_deudor y movimientos(fecha_hora,saldo_resultante,monto).
-- No devuelve nombre, contacto, notas ni identificadores de clientes/ventas.
-- La diferencia snapshot-vs-último-ledger es diagnóstica; saldos iniciales sin ledger requieren análisis.
-- Salida: metric, kiosco_id, row_count, amount_sum.
WITH latest_ledger AS (
  SELECT kiosco_id, cliente_id, saldo_resultante
  FROM (
    SELECT m.kiosco_id, m.cliente_id, m.saldo_resultante,
           row_number() OVER (PARTITION BY m.kiosco_id, m.cliente_id ORDER BY m.fecha_hora DESC, m.id DESC) AS rn
    FROM public.movimientos_cuenta_corriente m
  ) ranked
  WHERE rn = 1
), client_rollup AS (
  SELECT kiosco_id, count(*)::bigint AS client_count, sum(saldo_deudor)::numeric AS balance_sum
  FROM public.clientes GROUP BY kiosco_id
), ledger_rollup AS (
  SELECT kiosco_id, count(*)::bigint AS movement_count, sum(monto)::numeric AS movement_amount_sum,
         sum(saldo_resultante)::numeric AS resulting_balance_sum
  FROM public.movimientos_cuenta_corriente GROUP BY kiosco_id
), latest_rollup AS (
  SELECT kiosco_id, count(*)::bigint AS clients_with_ledger,
         sum(saldo_resultante)::numeric AS latest_balance_sum
  FROM latest_ledger GROUP BY kiosco_id
), snapshot_ledger_diff AS (
  SELECT c.kiosco_id, count(*) FILTER (WHERE l.cliente_id IS NULL)::bigint AS clients_without_ledger,
         sum(c.saldo_deudor - coalesce(l.saldo_resultante, 0))::numeric AS balance_delta
  FROM public.clientes c
  LEFT JOIN latest_ledger l ON l.kiosco_id = c.kiosco_id AND l.cliente_id = c.id
  GROUP BY c.kiosco_id
), metrics AS (
  SELECT 'clientes_y_saldo_snapshot'::text AS metric, c.kiosco_id, c.client_count AS row_count, c.balance_sum AS amount_sum
  FROM client_rollup c
  UNION ALL SELECT 'movimientos_cc_y_monto', l.kiosco_id, l.movement_count, l.movement_amount_sum FROM ledger_rollup l
  UNION ALL SELECT 'movimientos_cc_saldos_resultantes', l.kiosco_id, l.movement_count, l.resulting_balance_sum FROM ledger_rollup l
  UNION ALL SELECT 'ultimo_saldo_ledger_por_cliente', l.kiosco_id, l.clients_with_ledger, l.latest_balance_sum FROM latest_rollup l
  UNION ALL SELECT 'diferencia_snapshot_vs_ultimo_ledger', d.kiosco_id, d.clients_without_ledger, d.balance_delta
  FROM snapshot_ledger_diff d
  UNION ALL SELECT 'movimientos_cliente_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.movimientos_cuenta_corriente m LEFT JOIN public.clientes c ON c.id = m.cliente_id WHERE c.id IS NULL
  UNION ALL SELECT 'movimientos_kiosco_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.movimientos_cuenta_corriente m LEFT JOIN public.kioscos k ON k.id = m.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'movimientos_usuario_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.movimientos_cuenta_corriente m LEFT JOIN public.usuarios u ON u.id = m.usuario_id WHERE m.usuario_id IS NOT NULL AND u.id IS NULL
  UNION ALL SELECT 'movimientos_venta_huerfana', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.movimientos_cuenta_corriente m LEFT JOIN public.ventas v ON v.id = m.venta_id WHERE m.venta_id IS NOT NULL AND v.id IS NULL
  UNION ALL SELECT 'movimientos_cliente_kiosco_cruzado', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.movimientos_cuenta_corriente m JOIN public.clientes c ON c.id = m.cliente_id WHERE m.kiosco_id <> c.kiosco_id
  UNION ALL SELECT 'clientes_kiosco_huerfano', NULL::uuid, count(*)::bigint, NULL::numeric
    FROM public.clientes c LEFT JOIN public.kioscos k ON k.id = c.kiosco_id WHERE k.id IS NULL
)
SELECT metric, kiosco_id, row_count, amount_sum FROM metrics ORDER BY metric, kiosco_id;
