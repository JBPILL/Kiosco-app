-- Sólo lectura. Cambiar el UUID si se comprueba otro ticket.
WITH ticket AS (
  SELECT 'ef754442-ec79-480c-844e-4091d1ff71ea'::uuid id
), esperados AS (
  SELECT (c->>'producto_id')::uuid producto_id,
    sum((d->>'cantidad')::numeric*(c->>'cantidad')::numeric) cantidad
  FROM public.checkout_manuales m JOIN ticket ON m.venta_id=ticket.id,
    LATERAL jsonb_array_elements(m.solicitud->'detalles') d,
    LATERAL jsonb_array_elements(CASE WHEN jsonb_array_length(d->'componentes')>0 THEN d->'componentes'
      ELSE jsonb_build_array(jsonb_build_object('producto_id',d->>'producto_id','cantidad',1)) END) c
  WHERE NOT (d->>'es_devolucion_envase')::boolean
    AND (d->'articulo_libre'='null'::jsonb OR NOT d?'articulo_libre')
  GROUP BY 1
), cantidades AS (
  SELECT producto_id,
    coalesce(sum(cantidad) FILTER(WHERE tipo='EGRESO' AND notas='Checkout manual '||ticket.id::text),0) salida,
    coalesce(sum(cantidad) FILTER(WHERE tipo='INGRESO' AND notas='Anulación atómica '||ticket.id::text),0) ingreso
  FROM public.movimientos_stock CROSS JOIN ticket
  WHERE notas IN('Checkout manual '||ticket.id::text,'Anulación atómica '||ticket.id::text)
  GROUP BY producto_id
)
SELECT v.id venta_id,v.estado,v.total,v.motivo_anulacion,v.anulada_por,v.anulada_en,
  a.venta_id IS NOT NULL registro_atomico,
  (SELECT count(*) FROM public.auditoria_operaciones u WHERE u.entidad_id=v.id
    AND u.entidad='ventas' AND u.accion='VENTA_ANULADA') auditorias,
  (SELECT coalesce(sum(p.monto),0) FROM public.pagos_venta p WHERE p.venta_id=v.id) pagos_conservados,
  NOT EXISTS(SELECT 1 FROM esperados e FULL JOIN cantidades c USING(producto_id)
    WHERE e.cantidad IS DISTINCT FROM c.salida OR e.cantidad IS DISTINCT FROM c.ingreso) cantidades_restituidas,
  (SELECT count(*) FROM public.movimientos_caja m WHERE m.descripcion='Anulación atómica '||v.id::text) egresos_caja,
  a.resultado->>'sesion_reintegro' sesion_reintegro,
  a.resultado->>'reintegro_efectivo' efectivo_reintegrado
FROM public.ventas v JOIN ticket ON ticket.id=v.id
LEFT JOIN public.anulaciones_venta_atomicas a ON a.venta_id=v.id;
