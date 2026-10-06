-- Diagnóstico de solo lectura. Ejecutar en SQL Editor de Supabase.
-- No borra, modifica ni concilia registros automáticamente.
-- Limita la fecha o agrega v.kiosco_id = 'UUID' si administrás varios comercios.
WITH pagos AS (
  SELECT venta_id, count(*) AS cantidad_pagos, sum(monto) AS total_pagado
  FROM public.pagos_venta
  GROUP BY venta_id
), detalles AS (
  SELECT venta_id, count(*) AS cantidad_detalles, sum(subtotal) AS total_detalles
  FROM public.detalles_venta
  GROUP BY venta_id
)
SELECT v.id, v.kiosco_id, v.fecha_hora, v.total,
  coalesce(p.cantidad_pagos, 0) AS cantidad_pagos,
  coalesce(p.total_pagado, 0) AS total_pagado,
  coalesce(d.cantidad_detalles, 0) AS cantidad_detalles,
  coalesce(d.total_detalles, 0) AS total_detalles,
  coalesce(p.total_pagado, 0) - v.total AS diferencia_pago,
  v.notas
FROM public.ventas v
LEFT JOIN pagos p ON p.venta_id = v.id
LEFT JOIN detalles d ON d.venta_id = v.id
WHERE v.estado = 'COMPLETADA'
  AND v.notas ILIKE '%offline%'
  AND (coalesce(d.cantidad_detalles, 0) = 0
    OR coalesce(p.cantidad_pagos, 0) = 0
    OR abs(coalesce(p.total_pagado, 0) - v.total) > 0.01)
ORDER BY v.fecha_hora DESC;

-- Líneas iguales para revisión humana: pueden ser pagos mixtos legítimos.
-- NO alcanza para decidir qué fila eliminar.
SELECT v.id AS venta_id, v.kiosco_id, p.medio_pago, p.monto,
  p.referencia, count(*) AS lineas_iguales, array_agg(p.id) AS pagos_ids
FROM public.ventas v
JOIN public.pagos_venta p ON p.venta_id = v.id
WHERE v.estado = 'COMPLETADA' AND v.notas ILIKE '%offline%'
GROUP BY v.id, v.kiosco_id, p.medio_pago, p.monto, p.referencia
HAVING count(*) > 1
ORDER BY v.id;
