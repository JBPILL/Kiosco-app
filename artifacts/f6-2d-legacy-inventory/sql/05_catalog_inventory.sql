-- F6.2D-B bloque 05 — catálogo con relaciones y claves lógicas observadas.
-- No devuelve nombres, códigos de barras, precios individuales ni datos de contacto.
-- Sumas NUMERIC exactas para precios/costos; los importes no se interpretan como totales contables.
-- Salida compacta: metric, row_count, amount_sum.
WITH metrics AS (
  SELECT 'categorias_filas'::text AS metric, count(*)::bigint AS row_count, NULL::numeric AS amount_sum FROM public.categorias
  UNION ALL SELECT 'proveedores_filas', count(*)::bigint, NULL::numeric FROM public.proveedores
  UNION ALL SELECT 'productos_filas', count(*)::bigint, NULL::numeric FROM public.productos
  UNION ALL SELECT 'productos_stock_actual_sum', count(*)::bigint, sum(stock_actual)::numeric FROM public.productos
  UNION ALL SELECT 'productos_precio_costo_sum', count(*)::bigint, sum(precio_costo)::numeric FROM public.productos
  UNION ALL SELECT 'productos_precio_venta_sum', count(*)::bigint, sum(precio_venta)::numeric FROM public.productos
  UNION ALL SELECT 'combo_items_filas', count(*)::bigint, NULL::numeric FROM public.combo_items
  UNION ALL SELECT 'producto_costos_filas', count(*)::bigint, sum(precio_costo)::numeric FROM public.producto_costos
  UNION ALL SELECT 'promociones_filas', count(*)::bigint, NULL::numeric FROM public.promociones
  UNION ALL SELECT 'lotes_producto_filas', count(*)::bigint, sum(cantidad_actual)::numeric FROM public.lotes_producto
  UNION ALL SELECT 'productos_sin_categoria', count(*)::bigint, NULL::numeric FROM public.productos WHERE categoria_id IS NULL
  UNION ALL SELECT 'productos_sin_proveedor', count(*)::bigint, NULL::numeric FROM public.productos WHERE proveedor_id IS NULL
  UNION ALL SELECT 'productos_sin_codigo_barras', count(*)::bigint, NULL::numeric FROM public.productos WHERE codigo_barras IS NULL OR btrim(codigo_barras) = ''
  UNION ALL SELECT 'lotes_sin_numero_lote', count(*)::bigint, NULL::numeric FROM public.lotes_producto WHERE numero_lote IS NULL OR btrim(numero_lote) = ''
  UNION ALL SELECT 'categoria_kiosco_huerfano', count(*)::bigint, NULL::numeric FROM public.categorias c
    LEFT JOIN public.kioscos k ON k.id = c.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'proveedor_kiosco_huerfano', count(*)::bigint, NULL::numeric FROM public.proveedores v
    LEFT JOIN public.kioscos k ON k.id = v.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'producto_kiosco_huerfano', count(*)::bigint, NULL::numeric FROM public.productos p
    LEFT JOIN public.kioscos k ON k.id = p.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'grupos_categoria_kiosco_nombre_duplicados', count(*)::bigint, NULL::numeric FROM (
    SELECT kiosco_id, lower(btrim(nombre)) FROM public.categorias GROUP BY kiosco_id, lower(btrim(nombre)) HAVING count(*) > 1
  ) AS d
  UNION ALL SELECT 'grupos_producto_kiosco_codigo_duplicados', count(*)::bigint, NULL::numeric FROM (
    SELECT kiosco_id, lower(btrim(codigo_barras)) FROM public.productos
    WHERE codigo_barras IS NOT NULL AND btrim(codigo_barras) <> ''
    GROUP BY kiosco_id, lower(btrim(codigo_barras)) HAVING count(*) > 1
  ) AS d
  UNION ALL SELECT 'productos_categoria_huerfana', count(*)::bigint, NULL::numeric FROM public.productos p
    LEFT JOIN public.categorias c ON c.id = p.categoria_id WHERE p.categoria_id IS NOT NULL AND c.id IS NULL
  UNION ALL SELECT 'productos_proveedor_huerfano', count(*)::bigint, NULL::numeric FROM public.productos p
    LEFT JOIN public.proveedores v ON v.id = p.proveedor_id WHERE p.proveedor_id IS NOT NULL AND v.id IS NULL
  UNION ALL SELECT 'productos_categoria_kiosco_cruzado', count(*)::bigint, NULL::numeric FROM public.productos p
    JOIN public.categorias c ON c.id = p.categoria_id WHERE p.kiosco_id <> c.kiosco_id
  UNION ALL SELECT 'productos_proveedor_kiosco_cruzado', count(*)::bigint, NULL::numeric FROM public.productos p
    JOIN public.proveedores v ON v.id = p.proveedor_id WHERE p.kiosco_id <> v.kiosco_id
  UNION ALL SELECT 'combo_producto_huerfano', count(*)::bigint, NULL::numeric FROM public.combo_items i
    LEFT JOIN public.productos p ON p.id = i.combo_producto_id WHERE p.id IS NULL
  UNION ALL SELECT 'combo_componente_huerfano', count(*)::bigint, NULL::numeric FROM public.combo_items i
    LEFT JOIN public.productos p ON p.id = i.componente_producto_id WHERE p.id IS NULL
  UNION ALL SELECT 'combo_item_kiosco_huerfano', count(*)::bigint, NULL::numeric FROM public.combo_items i
    LEFT JOIN public.kioscos k ON k.id = i.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'combo_item_kiosco_cruzado', count(*)::bigint, NULL::numeric FROM public.combo_items i
    JOIN public.productos combo ON combo.id = i.combo_producto_id
    JOIN public.productos componente ON componente.id = i.componente_producto_id
    WHERE i.kiosco_id <> combo.kiosco_id OR i.kiosco_id <> componente.kiosco_id
  UNION ALL SELECT 'producto_costos_producto_huerfano', count(*)::bigint, NULL::numeric FROM public.producto_costos pc
    LEFT JOIN public.productos p ON p.id = pc.producto_id WHERE p.id IS NULL
  UNION ALL SELECT 'producto_costos_kiosco_huerfano', count(*)::bigint, NULL::numeric FROM public.producto_costos pc
    LEFT JOIN public.kioscos k ON k.id = pc.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'producto_costos_kiosco_cruzado', count(*)::bigint, NULL::numeric FROM public.producto_costos pc
    JOIN public.productos p ON p.id = pc.producto_id WHERE p.kiosco_id <> pc.kiosco_id
  UNION ALL SELECT 'promocion_producto_huerfano', count(*)::bigint, NULL::numeric FROM public.promociones pr
    LEFT JOIN public.productos p ON p.id = pr.producto_id WHERE pr.producto_id IS NOT NULL AND p.id IS NULL
  UNION ALL SELECT 'promocion_categoria_huerfana', count(*)::bigint, NULL::numeric FROM public.promociones pr
    LEFT JOIN public.categorias c ON c.id = pr.categoria_id WHERE pr.categoria_id IS NOT NULL AND c.id IS NULL
  UNION ALL SELECT 'promocion_kiosco_huerfano', count(*)::bigint, NULL::numeric FROM public.promociones pr
    LEFT JOIN public.kioscos k ON k.id = pr.kiosco_id WHERE k.id IS NULL
  UNION ALL SELECT 'promocion_producto_kiosco_cruzado', count(*)::bigint, NULL::numeric FROM public.promociones pr
    JOIN public.productos p ON p.id = pr.producto_id WHERE pr.producto_id IS NOT NULL AND pr.kiosco_id <> p.kiosco_id
  UNION ALL SELECT 'promocion_categoria_kiosco_cruzado', count(*)::bigint, NULL::numeric FROM public.promociones pr
    JOIN public.categorias c ON c.id = pr.categoria_id WHERE pr.categoria_id IS NOT NULL AND pr.kiosco_id <> c.kiosco_id
  UNION ALL SELECT 'lote_producto_huerfano', count(*)::bigint, NULL::numeric FROM public.lotes_producto l
    LEFT JOIN public.productos p ON p.id = l.producto_id WHERE p.id IS NULL
  UNION ALL SELECT 'lote_kiosco_cruzado', count(*)::bigint, NULL::numeric FROM public.lotes_producto l
    JOIN public.productos p ON p.id = l.producto_id WHERE l.kiosco_id <> p.kiosco_id
)
SELECT metric, row_count, amount_sum FROM metrics ORDER BY metric;
