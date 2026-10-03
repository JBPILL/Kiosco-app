-- ==============================================================================
-- MIGRACIÓN: Funciones RPC para operaciones atómicas de stock
-- ==============================================================================
-- Ejecutar en el SQL Editor de Supabase.
-- Resuelve el antipatrón Read-Modify-Write que causa lost updates
-- cuando múltiples cajeros venden el mismo producto simultáneamente.
-- ==============================================================================

-- 1. Decrementar stock atómicamente (usado al vender)
CREATE OR REPLACE FUNCTION decrementar_stock(p_producto_id UUID, p_cantidad NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  v_nuevo_stock NUMERIC;
BEGIN
  UPDATE productos
  SET stock_actual = GREATEST(0, stock_actual - p_cantidad)
  WHERE id = p_producto_id
  RETURNING stock_actual INTO v_nuevo_stock;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado: %', p_producto_id;
  END IF;

  RETURN v_nuevo_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Incrementar stock atómicamente (usado en devoluciones y anulaciones)
CREATE OR REPLACE FUNCTION incrementar_stock(p_producto_id UUID, p_cantidad NUMERIC)
RETURNS NUMERIC AS $$
DECLARE
  v_nuevo_stock NUMERIC;
BEGIN
  UPDATE productos
  SET stock_actual = stock_actual + p_cantidad
  WHERE id = p_producto_id
  RETURNING stock_actual INTO v_nuevo_stock;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado: %', p_producto_id;
  END IF;

  RETURN v_nuevo_stock;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Grants para que el cliente autenticado pueda llamar a las funciones
GRANT EXECUTE ON FUNCTION decrementar_stock(UUID, NUMERIC) TO authenticated;
GRANT EXECUTE ON FUNCTION incrementar_stock(UUID, NUMERIC) TO authenticated;
