-- Fase 4: trazabilidad histórica de mermas y egresos.
-- Requiere haber aplicado supabase_fase_seguridad_costos_privados.sql primero.
-- Aplicar en Supabase SQL Editor antes de desplegar el frontend actualizado.

BEGIN;

ALTER TABLE public.movimientos_stock
  ADD COLUMN IF NOT EXISTS costo_unitario_referencia numeric(12,2),
  ADD COLUMN IF NOT EXISTS lote_producto_id uuid REFERENCES public.lotes_producto(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_mov_stock_lote
  ON public.movimientos_stock(lote_producto_id)
  WHERE lote_producto_id IS NOT NULL;

-- Los registros previos quedan NULL: no se inventa un costo histórico usando el costo actual.
CREATE OR REPLACE FUNCTION public.capturar_costo_historico_movimiento_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Reaplicar esta migración conserva la protección instalada de snapshots privados.
  IF to_regclass('public.movimiento_stock_costos') IS NOT NULL THEN
    NEW.costo_unitario_referencia := NULL;
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' THEN
    -- El costo histórico se congela al insertar el movimiento.
    NEW.costo_unitario_referencia := OLD.costo_unitario_referencia;
    RETURN NEW;
  END IF;

  SELECT pc.precio_costo
    INTO NEW.costo_unitario_referencia
  FROM public.producto_costos pc
  WHERE pc.producto_id = NEW.producto_id
    AND pc.kiosco_id = NEW.kiosco_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_capturar_costo_historico_movimiento_stock ON public.movimientos_stock;
CREATE TRIGGER trg_capturar_costo_historico_movimiento_stock
  BEFORE INSERT
  ON public.movimientos_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.capturar_costo_historico_movimiento_stock();
DROP TRIGGER IF EXISTS trg_inmutar_costo_historico_movimiento_stock ON public.movimientos_stock;
CREATE TRIGGER trg_inmutar_costo_historico_movimiento_stock
  BEFORE UPDATE OF costo_unitario_referencia
  ON public.movimientos_stock
  FOR EACH ROW
  EXECUTE FUNCTION public.capturar_costo_historico_movimiento_stock();
REVOKE ALL ON FUNCTION public.capturar_costo_historico_movimiento_stock() FROM PUBLIC, anon, authenticated;

COMMENT ON COLUMN public.movimientos_stock.costo_unitario_referencia IS
  'Costo unitario del producto al registrar el movimiento; NULL en datos históricos sin snapshot confiable.';
COMMENT ON COLUMN public.movimientos_stock.lote_producto_id IS
  'Lote asociado al egreso cuando la operación identifica un lote concreto.';

-- Stock, lote y kardex se actualizan en una sola transacción para operaciones manuales.
CREATE OR REPLACE FUNCTION public.registrar_movimiento_stock(
  p_producto_id uuid,
  p_tipo text,
  p_cantidad numeric,
  p_motivo text,
  p_notas text DEFAULT NULL,
  p_fecha_vencimiento date DEFAULT NULL,
  p_numero_lote text DEFAULT NULL,
  p_lote_id uuid DEFAULT NULL
)
RETURNS TABLE(stock_anterior numeric, stock_nuevo numeric, movimiento_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kiosco_id uuid;
  v_stock numeric(12,3);
  v_delta numeric(12,3);
  v_nuevo_stock numeric(12,3);
  v_restante numeric(12,3);
  v_lote record;
  v_usuario_id uuid;
  v_movimiento_id uuid;
BEGIN
  IF p_tipo IS NULL OR p_tipo NOT IN ('INGRESO', 'EGRESO', 'AJUSTE')
     OR p_cantidad IS NULL OR p_cantidad = 'NaN'::numeric OR p_cantidad < 0 THEN
    RAISE EXCEPTION 'Tipo o cantidad de movimiento inválidos' USING ERRCODE = '22023';
  END IF;
  IF NULLIF(trim(p_motivo), '') IS NULL OR (p_lote_id IS NOT NULL AND p_tipo <> 'EGRESO') THEN
    RAISE EXCEPTION 'Motivo o asociación de lote inválidos' USING ERRCODE = '22023';
  END IF;
  IF p_tipo <> 'AJUSTE' AND p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a cero' USING ERRCODE = '22023';
  END IF;
  IF p_cantidad <> round(p_cantidad, 3) THEN
    RAISE EXCEPTION 'La cantidad admite como máximo tres decimales' USING ERRCODE = '22023';
  END IF;

  SELECT p.kiosco_id, COALESCE(p.stock_actual, 0)
    INTO v_kiosco_id, v_stock
  FROM public.productos p
  WHERE p.id = p_producto_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Producto no encontrado' USING ERRCODE = 'P0002'; END IF;
  IF NOT COALESCE(auth.role() = 'service_role', false)
     AND NOT public.auth_es_superadmin()
     AND v_kiosco_id IS DISTINCT FROM public.auth_user_kiosco_id() THEN
    RAISE EXCEPTION 'No autorizado para modificar el stock de este comercio' USING ERRCODE = '42501';
  END IF;

  SELECT u.id INTO v_usuario_id
  FROM public.usuarios u
  WHERE u.auth_user_id = (SELECT auth.uid()) AND u.activo = true
  LIMIT 1;

  IF p_tipo = 'INGRESO' THEN
    v_delta := p_cantidad;
  ELSIF p_tipo = 'EGRESO' THEN
    v_delta := -p_cantidad;
  ELSE
    v_delta := p_cantidad - v_stock;
  END IF;
  v_nuevo_stock := round(v_stock + v_delta, 3);
  IF v_nuevo_stock < 0 THEN
    RAISE EXCEPTION 'El egreso supera el stock disponible (%).', v_stock USING ERRCODE = '22023';
  END IF;

  IF p_tipo = 'EGRESO' AND p_lote_id IS NOT NULL THEN
    UPDATE public.lotes_producto l
    SET cantidad_actual = round(l.cantidad_actual - p_cantidad, 3),
        activo = (l.cantidad_actual - p_cantidad) > 0
    WHERE l.id = p_lote_id
      AND l.producto_id = p_producto_id
      AND l.kiosco_id = v_kiosco_id
      AND l.activo = true
      AND l.cantidad_actual >= p_cantidad;
    IF NOT FOUND THEN RAISE EXCEPTION 'El lote no existe o no tiene cantidad suficiente' USING ERRCODE = '22023'; END IF;
  ELSIF v_delta < 0 THEN
    v_restante := -v_delta;
    FOR v_lote IN
      SELECT l.id, l.cantidad_actual
      FROM public.lotes_producto l
      WHERE l.producto_id = p_producto_id
        AND l.kiosco_id = v_kiosco_id
        AND l.activo = true
        AND l.cantidad_actual > 0
      ORDER BY l.fecha_vencimiento ASC, l.fecha_ingreso ASC, l.id
      FOR UPDATE
    LOOP
      EXIT WHEN v_restante <= 0;
      UPDATE public.lotes_producto l
      SET cantidad_actual = round(l.cantidad_actual - LEAST(l.cantidad_actual, v_restante), 3),
          activo = (l.cantidad_actual - LEAST(l.cantidad_actual, v_restante)) > 0
      WHERE l.id = v_lote.id;
      v_restante := round(v_restante - LEAST(v_lote.cantidad_actual, v_restante), 3);
    END LOOP;
  END IF;

  IF p_tipo = 'INGRESO' AND p_fecha_vencimiento IS NOT NULL THEN
    INSERT INTO public.lotes_producto (
      kiosco_id, producto_id, numero_lote, fecha_vencimiento,
      cantidad_inicial, cantidad_actual, activo
    ) VALUES (
      v_kiosco_id, p_producto_id, NULLIF(trim(p_numero_lote), ''), p_fecha_vencimiento,
      p_cantidad, p_cantidad, true
    );
  END IF;

  UPDATE public.productos p
  SET stock_actual = v_nuevo_stock, fecha_actualizacion = now()
  WHERE p.id = p_producto_id;

  INSERT INTO public.movimientos_stock (
    kiosco_id, producto_id, tipo, cantidad, motivo, notas,
    usuario_id, fecha, lote_producto_id
  ) VALUES (
    v_kiosco_id, p_producto_id, p_tipo, v_delta, p_motivo, NULLIF(trim(p_notas), ''),
    v_usuario_id, now(), p_lote_id
  ) RETURNING id INTO v_movimiento_id;

  RETURN QUERY SELECT v_stock, v_nuevo_stock, v_movimiento_id;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_movimiento_stock(uuid, text, numeric, text, text, date, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_movimiento_stock(uuid, text, numeric, text, text, date, text, uuid) TO authenticated, service_role;

-- Validación manual post migración:
-- 1. Registrar un egreso con producto de costo conocido y confirmar snapshot.
-- 2. Cambiar el costo del producto y confirmar que el snapshot anterior no cambia.
-- 3. Editar directamente costo_unitario_referencia: debe conservar el valor original.
-- 4. Registrar un ingreso con vencimiento y comprobar stock, lote y movimiento juntos.
-- 5. Registrar un egreso FEFO o dar de baja un lote y comprobar stock/lotes/kardex.
-- 6. Forzar una cantidad superior al stock: la RPC debe fallar sin mutar ninguna tabla.

COMMIT;
