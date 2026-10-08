-- Sólo lectura. Venta informada por el usuario. No elimina movimientos ni ajusta stock.
WITH objetivo AS (
  SELECT 'ef754442-ec79-480c-844e-4091d1ff71ea'::uuid AS venta_id
), venta AS (
  SELECT v.* FROM public.ventas v JOIN objetivo o ON o.venta_id=v.id
), movimientos AS (
  SELECT m.*,p.descripcion AS producto,p.stock_actual AS stock_actual_producto
  FROM public.movimientos_stock m JOIN venta v ON m.kiosco_id=v.kiosco_id
  LEFT JOIN public.productos p ON p.id=m.producto_id AND p.kiosco_id=m.kiosco_id
  WHERE strpos(coalesce(m.notas,''),v.id::text)>0
), triggers AS (
  SELECT t.tgname AS trigger,t.tgenabled AS habilitado,
    pg_get_triggerdef(t.oid) AS definicion_trigger,
    n.nspname||'.'||p.proname AS funcion,
    pg_get_functiondef(p.oid) AS definicion_funcion
  FROM pg_trigger t JOIN pg_proc p ON p.oid=t.tgfoid
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE t.tgrelid='public.ventas'::regclass AND NOT t.tgisinternal
)
SELECT jsonb_build_object(
  'venta',(SELECT to_jsonb(v) FROM venta v),
  'registro_anulacion',(SELECT to_jsonb(a) FROM public.anulaciones_venta_atomicas a
    JOIN objetivo o ON o.venta_id=a.venta_id),
  'movimientos_relacionados',coalesce((SELECT jsonb_agg(to_jsonb(m) ORDER BY fecha,id) FROM movimientos m),'[]'::jsonb),
  'triggers_ventas',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY trigger) FROM triggers t),'[]'::jsonb)
) AS diagnostico_stock_anulacion;
