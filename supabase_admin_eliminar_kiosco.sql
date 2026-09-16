-- ==============================================================================
-- SCRIPT DEFINITIVO DE ELIMINACIÓN DE KIOSCOS Y REPARACIÓN DE CLAVES FORÁNEAS
-- KIOSKOPOS - Panel de SuperAdmin
-- ==============================================================================
-- Ejecutar este script completo en el SQL Editor de tu panel de Supabase.
-- 1. Corrige las claves foráneas de detalles_compra a ON DELETE CASCADE.
-- 2. Asegura el Plan de Prueba gratuito de $0.
-- 3. Crea la función RPC admin_eliminar_kiosco con SECURITY DEFINER que verifica
--    la existencia dinámica de tablas (evita errores si alguna tabla opcional
--    como movimientos_caja o cajas aún no fue creada en la base de datos).
-- ==============================================================================

-- 1. REPARAR CLAVES FORÁNEAS DE DETALLES_COMPRA A ON DELETE CASCADE
DO $$
BEGIN
  -- Clave foránea producto_id en detalles_compra
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'detalles_compra_producto_id_fkey'
      AND table_name = 'detalles_compra'
  ) THEN
    ALTER TABLE public.detalles_compra DROP CONSTRAINT detalles_compra_producto_id_fkey;
  END IF;

  ALTER TABLE public.detalles_compra
    ADD CONSTRAINT detalles_compra_producto_id_fkey
    FOREIGN KEY (producto_id) REFERENCES public.productos(id) ON DELETE CASCADE;

  -- Clave foránea compra_id en detalles_compra
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'detalles_compra_compra_id_fkey'
      AND table_name = 'detalles_compra'
  ) THEN
    ALTER TABLE public.detalles_compra DROP CONSTRAINT detalles_compra_compra_id_fkey;
  END IF;

  ALTER TABLE public.detalles_compra
    ADD CONSTRAINT detalles_compra_compra_id_fkey
    FOREIGN KEY (compra_id) REFERENCES public.compras_proveedor(id) ON DELETE CASCADE;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Ajuste de claves foráneas detalles_compra omitido o ya aplicado: %', SQLERRM;
END;
$$;

-- 2. ASEGURAR PLAN DE PRUEBA GRATUITO ($0) EN LA TABLA DE PLANES
INSERT INTO public.planes (nombre, precio_mensual, max_usuarios, descripcion, activo)
VALUES (
  'Plan de Prueba (15 días Gratis)',
  0,
  3,
  'Período inicial de prueba gratuito por 15 días para nuevos comercios sin costo.',
  true
)
ON CONFLICT DO NOTHING;

-- 3. FUNCIÓN DE ELIMINACIÓN EN CASCADA CON PRIVILEGIOS DE SUPERUSUARIO (SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.admin_eliminar_kiosco(p_kiosco_id UUID)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- 3.1 Cuentas corrientes y clientes
  IF to_regclass('public.movimientos_cuenta_corriente') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.movimientos_cuenta_corriente WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.clientes') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.clientes WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.2 Proveedores, compras y detalles de compra
  IF to_regclass('public.pagos_proveedor') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.pagos_proveedor WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.detalles_compra') IS NOT NULL THEN
    -- Borrar detalles vinculados a compras del kiosco
    EXECUTE 'DELETE FROM public.detalles_compra WHERE compra_id IN (SELECT id FROM public.compras_proveedor WHERE kiosco_id = $1)' USING p_kiosco_id;
    -- Borrar detalles vinculados a productos del kiosco (evita cualquier violación de FK con productos)
    EXECUTE 'DELETE FROM public.detalles_compra WHERE producto_id IN (SELECT id FROM public.productos WHERE kiosco_id = $1)' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.compras_proveedor') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.compras_proveedor WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.proveedores') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.proveedores WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.3 Devoluciones de venta y detalles de devolución
  IF to_regclass('public.detalles_devolucion') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.detalles_devolucion WHERE devolucion_id IN (SELECT id FROM public.devoluciones_venta WHERE kiosco_id = $1)' USING p_kiosco_id;
    EXECUTE 'DELETE FROM public.detalles_devolucion WHERE producto_id IN (SELECT id FROM public.productos WHERE kiosco_id = $1)' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.devoluciones_venta') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.devoluciones_venta WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.4 Tickets de soporte
  IF to_regclass('public.tickets_soporte') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.tickets_soporte WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.5 Combos, lotes y promociones
  IF to_regclass('public.combo_items') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.combo_items WHERE kiosco_id = $1' USING p_kiosco_id;
    EXECUTE 'DELETE FROM public.combo_items WHERE combo_producto_id IN (SELECT id FROM public.productos WHERE kiosco_id = $1) OR componente_producto_id IN (SELECT id FROM public.productos WHERE kiosco_id = $1)' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.lotes_producto') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.lotes_producto WHERE kiosco_id = $1' USING p_kiosco_id;
    EXECUTE 'DELETE FROM public.lotes_producto WHERE producto_id IN (SELECT id FROM public.productos WHERE kiosco_id = $1)' USING p_kiosco_id;
  END IF;

  -- 3.6 Promociones
  IF to_regclass('public.promociones') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.promociones WHERE kiosco_id = $1' USING p_kiosco_id;
    EXECUTE 'DELETE FROM public.promociones WHERE producto_id IN (SELECT id FROM public.productos WHERE kiosco_id = $1)' USING p_kiosco_id;
  END IF;

  -- 3.7 Ventas, detalles y pagos de venta
  IF to_regclass('public.detalles_venta') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.detalles_venta WHERE venta_id IN (SELECT id FROM public.ventas WHERE kiosco_id = $1)' USING p_kiosco_id;
    EXECUTE 'DELETE FROM public.detalles_venta WHERE producto_id IN (SELECT id FROM public.productos WHERE kiosco_id = $1)' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.pagos_venta') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.pagos_venta WHERE venta_id IN (SELECT id FROM public.ventas WHERE kiosco_id = $1)' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.ventas') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.ventas WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.8 Movimientos de stock
  IF to_regclass('public.movimientos_stock') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.movimientos_stock WHERE kiosco_id = $1' USING p_kiosco_id;
    EXECUTE 'DELETE FROM public.movimientos_stock WHERE producto_id IN (SELECT id FROM public.productos WHERE kiosco_id = $1)' USING p_kiosco_id;
  END IF;

  -- 3.9 Cajas y sesiones (protegidas dinámicamente con to_regclass si la tabla no existe)
  IF to_regclass('public.movimientos_caja') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.movimientos_caja WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.sesiones_caja') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.sesiones_caja WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.cajas') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.cajas WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.10 Productos y categorías
  IF to_regclass('public.productos') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.productos WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.11 Suscripciones y pagos de suscripción
  IF to_regclass('public.pagos_suscripcion') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.pagos_suscripcion WHERE suscripcion_id IN (SELECT id FROM public.suscripciones WHERE kiosco_id = $1)' USING p_kiosco_id;
  END IF;

  IF to_regclass('public.suscripciones') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.suscripciones WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.12 Configuración AFIP (si existe la tabla)
  IF to_regclass('public.configuracion_afip') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.configuracion_afip WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.13 Categorías
  IF to_regclass('public.categorias') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.categorias WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.14 Usuarios asociados a este kiosco
  IF to_regclass('public.usuarios') IS NOT NULL THEN
    EXECUTE 'DELETE FROM public.usuarios WHERE kiosco_id = $1' USING p_kiosco_id;
  END IF;

  -- 3.15 Finalmente eliminar el registro del Kiosco
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

-- Dar permisos de ejecución a usuarios autenticados, anónimos y service_role
GRANT EXECUTE ON FUNCTION public.admin_eliminar_kiosco(UUID) TO authenticated, anon, service_role;
GRANT EXECUTE ON FUNCTION public.fn_eliminar_kiosco(UUID) TO authenticated, anon, service_role;
