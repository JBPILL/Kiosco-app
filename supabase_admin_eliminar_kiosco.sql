-- ==============================================================================
-- FUNCIÓN RPC DE ELIMINACIÓN DE KIOSCOS Y PLAN DE PRUEBA ($0) - KIOSKOPOS
-- Ejecutar este script en el SQL Editor de tu panel de Supabase.
-- ==============================================================================

-- 1. ASEGURAR PLAN DE PRUEBA GRATUITO ($0) EN LA TABLA DE PLANES
INSERT INTO public.planes (nombre, precio_mensual, max_usuarios, descripcion, activo)
VALUES (
  'Plan de Prueba (15 días Gratis)',
  0,
  3,
  'Período inicial de prueba gratuito por 15 días para nuevos comercios sin costo.',
  true
)
ON CONFLICT DO NOTHING;

-- 2. FUNCIÓN DE ELIMINACIÓN EN CASCADA CON PRIVILEGIOS DE SUPERUSUARIO (SECURITY DEFINER)
-- Bypassea restricciones de RLS y elimina en orden todas las referencias foráneas.
CREATE OR REPLACE FUNCTION public.admin_eliminar_kiosco(p_kiosco_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 2.1 Cuentas corrientes y clientes
  DELETE FROM public.movimientos_cuenta_corriente WHERE kiosco_id = p_kiosco_id;
  DELETE FROM public.clientes WHERE kiosco_id = p_kiosco_id;

  -- 2.2 Proveedores y compras
  DELETE FROM public.pagos_proveedor WHERE kiosco_id = p_kiosco_id;
  DELETE FROM public.detalles_compra WHERE compra_id IN (
    SELECT id FROM public.compras_proveedor WHERE kiosco_id = p_kiosco_id
  );
  DELETE FROM public.compras_proveedor WHERE kiosco_id = p_kiosco_id;
  DELETE FROM public.proveedores WHERE kiosco_id = p_kiosco_id;

  -- 2.3 Devoluciones de venta
  DELETE FROM public.detalles_devolucion WHERE devolucion_id IN (
    SELECT id FROM public.devoluciones_venta WHERE kiosco_id = p_kiosco_id
  );
  DELETE FROM public.devoluciones_venta WHERE kiosco_id = p_kiosco_id;

  -- 2.4 Tickets de soporte
  DELETE FROM public.tickets_soporte WHERE kiosco_id = p_kiosco_id;

  -- 2.5 Combos, lotes y promociones
  DELETE FROM public.combo_items WHERE kiosco_id = p_kiosco_id;
  DELETE FROM public.lotes_producto WHERE kiosco_id = p_kiosco_id;
  DELETE FROM public.promociones WHERE kiosco_id = p_kiosco_id;

  -- 2.6 Ventas, detalles y pagos de venta
  DELETE FROM public.detalles_venta WHERE venta_id IN (
    SELECT id FROM public.ventas WHERE kiosco_id = p_kiosco_id
  );
  DELETE FROM public.pagos_venta WHERE venta_id IN (
    SELECT id FROM public.ventas WHERE kiosco_id = p_kiosco_id
  );
  DELETE FROM public.ventas WHERE kiosco_id = p_kiosco_id;

  -- 2.7 Movimientos de stock
  DELETE FROM public.movimientos_stock WHERE kiosco_id = p_kiosco_id;

  -- 2.8 Cajas y sesiones
  DELETE FROM public.movimientos_caja WHERE kiosco_id = p_kiosco_id;
  DELETE FROM public.sesiones_caja WHERE kiosco_id = p_kiosco_id;
  BEGIN
    DELETE FROM public.cajas WHERE kiosco_id = p_kiosco_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 2.9 Productos y categorías
  DELETE FROM public.productos WHERE kiosco_id = p_kiosco_id;
  DELETE FROM public.categorias WHERE kiosco_id = p_kiosco_id;

  -- 2.10 Suscripciones y pagos de suscripción
  DELETE FROM public.pagos_suscripcion WHERE suscripcion_id IN (
    SELECT id FROM public.suscripciones WHERE kiosco_id = p_kiosco_id
  );
  DELETE FROM public.suscripciones WHERE kiosco_id = p_kiosco_id;

  -- 2.11 Configuración AFIP si existiese
  BEGIN
    DELETE FROM public.configuracion_afip WHERE kiosco_id = p_kiosco_id;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- 2.12 Usuarios asociados a este kiosco
  DELETE FROM public.usuarios WHERE kiosco_id = p_kiosco_id;

  -- 2.13 Finalmente eliminar el registro del Kiosco
  DELETE FROM public.kioscos WHERE id = p_kiosco_id;

  RETURN true;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Error al eliminar el kiosco: %', SQLERRM;
END;
$$;

-- Alias retrocompatible por si el frontend llama a fn_eliminar_kiosco
CREATE OR REPLACE FUNCTION public.fn_eliminar_kiosco(p_kiosco_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.admin_eliminar_kiosco(p_kiosco_id);
END;
$$;

-- Dar permisos de ejecución a usuarios autenticados
GRANT EXECUTE ON FUNCTION public.admin_eliminar_kiosco(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fn_eliminar_kiosco(UUID) TO authenticated;
