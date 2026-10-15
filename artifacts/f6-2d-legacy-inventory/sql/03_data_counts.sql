-- F6.2D-B bloque 03 — COUNT(*) exacto por entidad del contrato.
-- Fuente: relaciones observadas en public durante 01a/01b (columnas); una fila por entidad.
-- Las tres tablas marcadas SOURCE_RELATION_ABSENT no aparecen en el inventario observado;
-- su conteo exacto en este esquema es cero. Revisar el blocker en la documentación.
-- Los conteos incluyen fixtures/synthetic; son baseline bruto, no conteo migrable aprobado.
-- Salida: table_name, migration_disposition, exact_row_count.
SELECT 'kioscos'::text AS table_name, 'REQUIRED'::text AS migration_disposition, count(*)::bigint AS exact_row_count FROM public.kioscos
UNION ALL SELECT 'usuarios', 'REQUIRED', count(*)::bigint FROM public.usuarios
UNION ALL SELECT 'categorias', 'OPTIONAL', count(*)::bigint FROM public.categorias
UNION ALL SELECT 'proveedores', 'REQUIRED_IF_PURCHASES', count(*)::bigint FROM public.proveedores
UNION ALL SELECT 'clientes', 'OPTIONAL', count(*)::bigint FROM public.clientes
UNION ALL SELECT 'productos', 'REQUIRED', count(*)::bigint FROM public.productos
UNION ALL SELECT 'combo_items', 'OPTIONAL', count(*)::bigint FROM public.combo_items
UNION ALL SELECT 'promociones', 'OPTIONAL', count(*)::bigint FROM public.promociones
UNION ALL SELECT 'producto_costos', 'REQUIRED_IF_COSTS_USED', count(*)::bigint FROM public.producto_costos
UNION ALL SELECT 'lotes_producto', 'REQUIRED_IF_LOTS_USED', count(*)::bigint FROM public.lotes_producto
UNION ALL SELECT 'sesiones_caja', 'REQUIRED_CLOSED_ONLY', count(*)::bigint FROM public.sesiones_caja
UNION ALL SELECT 'operaciones_escritura', 'SOURCE_RELATION_ABSENT', 0::bigint
UNION ALL SELECT 'ventas', 'REQUIRED_COMPATIBLE_HISTORY', count(*)::bigint FROM public.ventas
UNION ALL SELECT 'compras_proveedor', 'REQUIRED_COMPATIBLE_HISTORY', count(*)::bigint FROM public.compras_proveedor
UNION ALL SELECT 'detalles_venta', 'REQUIRED_WITH_SALE', count(*)::bigint FROM public.detalles_venta
UNION ALL SELECT 'pagos_venta', 'REQUIRED_WITH_SALE', count(*)::bigint FROM public.pagos_venta
UNION ALL SELECT 'movimientos_stock', 'REQUIRED_COMPATIBLE_HISTORY', count(*)::bigint FROM public.movimientos_stock
UNION ALL SELECT 'movimientos_caja', 'REQUIRED_CLOSED_SESSION_ONLY', count(*)::bigint FROM public.movimientos_caja
UNION ALL SELECT 'detalles_compra', 'REQUIRED_WITH_PURCHASE', count(*)::bigint FROM public.detalles_compra
UNION ALL SELECT 'pagos_proveedor', 'REQUIRED_COMPATIBLE_HISTORY', count(*)::bigint FROM public.pagos_proveedor
UNION ALL SELECT 'movimiento_stock_costos', 'OPTIONAL_COMPATIBLE', count(*)::bigint FROM public.movimiento_stock_costos
UNION ALL SELECT 'movimientos_proveedor', 'SOURCE_RELATION_ABSENT', 0::bigint
UNION ALL SELECT 'historial_precios_producto', 'SOURCE_RELATION_ABSENT', 0::bigint
UNION ALL SELECT 'movimientos_cuenta_corriente', 'REQUIRED_IF_CREDIT_HISTORY', count(*)::bigint FROM public.movimientos_cuenta_corriente
UNION ALL SELECT 'checkout_manuales', 'CONDITIONAL_AUDIT_EVIDENCE', count(*)::bigint FROM public.checkout_manuales
UNION ALL SELECT 'anulaciones_venta_atomicas', 'CONDITIONAL_AUDIT_EVIDENCE', count(*)::bigint FROM public.anulaciones_venta_atomicas
UNION ALL SELECT 'operaciones_stock', 'OUT_OF_SCOPE_DIAGNOSTIC', count(*)::bigint FROM public.operaciones_stock
ORDER BY table_name;
