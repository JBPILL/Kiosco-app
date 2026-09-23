-- ==============================================================================
-- MIGRACIÓN SUPABASE: HABILITACIÓN DE DECIMALES / PESABLES (KILOS / GRAMOS)
-- ==============================================================================
-- Esta migración convierte las columnas de cantidad y stock de tipo INTEGER a
-- NUMERIC(12,3) para permitir ventas por balanza comercial o números flotantes
-- (ejemplo: 0.75 kg de Jamón, 1.25 kg de Pan, etc.) sin error de syntax integer.
--
-- INSTRUCCIONES:
-- 1. Ve a tu panel de Supabase: https://app.supabase.com
-- 2. Selecciona tu proyecto y abre la pestaña "SQL Editor".
-- 3. Crea una "New Query", pega todo este código y haz clic en "Run".
-- ==============================================================================

-- 1. DETALLES DE VENTA (Permitir cantidades decimales en el ticket)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'detalles_venta' 
      AND column_name = 'cantidad'
  ) THEN
    ALTER TABLE public.detalles_venta 
      ALTER COLUMN cantidad TYPE NUMERIC(12,3);
  END IF;
END $$;

-- 2. MOVIMIENTOS DE STOCK (Permitir egresos/ingresos decimales en kardex)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'movimientos_stock' 
      AND column_name = 'cantidad'
  ) THEN
    ALTER TABLE public.movimientos_stock 
      ALTER COLUMN cantidad TYPE NUMERIC(12,3);
  END IF;
END $$;

-- 3. PRODUCTOS (Permitir stock actual y stock mínimo decimal para pesables)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'productos' 
      AND column_name = 'stock_actual'
  ) THEN
    ALTER TABLE public.productos 
      ALTER COLUMN stock_actual TYPE NUMERIC(12,3);
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'productos' 
      AND column_name = 'stock_minimo'
  ) THEN
    ALTER TABLE public.productos 
      ALTER COLUMN stock_minimo TYPE NUMERIC(12,3);
  END IF;
END $$;

-- 4. DETALLES DE DEVOLUCIÓN (Reintegros de productos pesables)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'detalles_devolucion' 
      AND column_name = 'cantidad'
  ) THEN
    ALTER TABLE public.detalles_devolucion 
      ALTER COLUMN cantidad TYPE NUMERIC(12,3);
  END IF;
END $$;

-- 5. DETALLES DE COMPRA A PROVEEDORES (Recepción por peso)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'detalles_compra' 
      AND column_name = 'cantidad'
  ) THEN
    ALTER TABLE public.detalles_compra 
      ALTER COLUMN cantidad TYPE NUMERIC(12,3);
  END IF;
END $$;

-- 6. LOTES DE PRODUCTO (Trazabilidad y vencimientos de fiambres/pesables)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'lotes_producto' 
      AND column_name = 'cantidad_actual'
  ) THEN
    ALTER TABLE public.lotes_producto 
      ALTER COLUMN cantidad_actual TYPE NUMERIC(12,3),
      ALTER COLUMN cantidad_inicial TYPE NUMERIC(12,3);
  END IF;
END $$;

-- 7. COMBOS / PACKS (Porciones fraccionadas en combos si aplica)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'combo_items' 
      AND column_name = 'cantidad'
  ) THEN
    ALTER TABLE public.combo_items 
      ALTER COLUMN cantidad TYPE NUMERIC(12,3);
  END IF;
END $$;

-- ==============================================================================
-- FIN DE LA MIGRACIÓN
-- ==============================================================================
