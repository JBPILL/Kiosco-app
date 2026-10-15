WITH required_columns(table_name, column_name) AS (
  VALUES
    ('kioscos','fecha_creacion'),
    ('usuarios','fecha_creacion'),
    ('productos','precio_venta'),
    ('productos','stock_actual'),
    ('productos','fecha_creacion'),
    ('productos','fecha_actualizacion'),
    ('producto_costos','precio_costo'),
    ('producto_costos','fecha_actualizacion'),
    ('combo_items','cantidad'),
    ('combo_items','created_at'),
    ('promociones','fecha_inicio'),
    ('promociones','fecha_fin'),
    ('promociones','cantidad_minima'),
    ('promociones','precio_combo'),
    ('lotes_producto','fecha_vencimiento'),
    ('lotes_producto','fecha_ingreso'),
    ('lotes_producto','cantidad_inicial'),
    ('lotes_producto','cantidad_actual'),
    ('sesiones_caja','fecha_apertura'),
    ('sesiones_caja','fecha_cierre'),
    ('sesiones_caja','monto_inicial'),
    ('sesiones_caja','monto_final_declarado'),
    ('sesiones_caja','monto_final_sistema'),
    ('sesiones_caja','diferencia'),
    ('ventas','fecha_hora'),
    ('ventas','total'),
    ('ventas','anulada_en'),
    ('detalles_venta','cantidad'),
    ('detalles_venta','precio_unitario'),
    ('detalles_venta','subtotal'),
    ('pagos_venta','medio_pago'),
    ('pagos_venta','monto'),
    ('movimientos_stock','cantidad'),
    ('movimientos_stock','fecha'),
    ('movimiento_stock_costos','precio_costo'),
    ('movimientos_caja','monto'),
    ('movimientos_caja','fecha_hora'),
    ('movimientos_caja','tipo'),
    ('ventas','medio_pago'),
    ('checkout_manuales','solicitud'),
    ('checkout_manuales','resultado'),
    ('checkout_manuales','creado_en'),
    ('anulaciones_venta_atomicas','resultado'),
    ('anulaciones_venta_atomicas','creado_en')
)
SELECT
  required_columns.table_name,
  required_columns.column_name,
  columns.data_type,
  columns.udt_name,
  columns.numeric_precision,
  columns.numeric_scale,
  columns.datetime_precision
FROM required_columns
LEFT JOIN information_schema.columns AS columns
  ON columns.table_schema = 'public'
 AND columns.table_name = required_columns.table_name
 AND columns.column_name = required_columns.column_name
ORDER BY required_columns.table_name, required_columns.column_name;
