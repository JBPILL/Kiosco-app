-- Paso45. Lecturas comerciales mínimas del backend de checkout.
-- Requiere esquema multirrubro/promociones y actualizar checkout-manual.
BEGIN;
GRANT SELECT (id,kiosco_id,categoria_id,descripcion,precio_venta,precio_envase,es_retornable,es_pesable,activo,es_combo,stock_actual)
ON public.productos TO service_role;
GRANT SELECT (id,kiosco_id,nombre,tipo,producto_id,categoria_id,cantidad_minima,cantidad_paga,precio_unitario_promo,descuento_porcentaje,precio_combo,items_combo,dias_semana,fecha_inicio,fecha_fin,activo)
ON public.promociones TO service_role;
GRANT SELECT (id,kiosco_id,activo,saldo_deudor,limite_credito)
ON public.clientes TO service_role;
GRANT SELECT (id,kiosco_id,combo_producto_id,componente_producto_id,cantidad)
ON public.combo_items TO service_role;
GRANT SELECT (id,kiosco_id,nombre,precio,activo)
ON public.envases_tipos_comercio TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
