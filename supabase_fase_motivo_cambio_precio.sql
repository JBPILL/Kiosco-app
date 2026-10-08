-- Justificación específica para cambios del precio de venta. Aplicación coordinada con el cliente.
-- Requiere roles RLS, seguridad de perfiles y auditoría de anulaciones.
-- No restringe el alta rápida de productos ni los movimientos de stock del cajero.

BEGIN;

ALTER TABLE public.productos ADD COLUMN IF NOT EXISTS motivo_cambio_precio text;
ALTER TABLE public.productos DROP CONSTRAINT IF EXISTS productos_motivo_precio_transitorio;
ALTER TABLE public.productos ADD CONSTRAINT productos_motivo_precio_transitorio
  CHECK (motivo_cambio_precio IS NULL);

ALTER TABLE public.auditoria_operaciones
  ADD COLUMN IF NOT EXISTS detalles jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.auditar_cambio_precio_producto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usuario_id uuid;
  v_rol text;
  v_mantenimiento boolean;
  v_motivo text;
BEGIN
  IF NEW.precio_venta IS NOT DISTINCT FROM OLD.precio_venta THEN
    NEW.motivo_cambio_precio := NULL;
    RETURN NEW;
  END IF;

  v_mantenimiento := auth.uid() IS NULL AND auth.role() IS NULL
    AND session_user IN ('postgres', 'supabase_admin');
  IF NOT COALESCE((
    COALESCE(auth.role() = 'service_role', false)
    OR public.auth_es_superadmin()
    OR (public.auth_es_dueno_o_superadmin() AND NEW.kiosco_id = public.auth_user_kiosco_id())
    OR v_mantenimiento
  ), false) THEN
    RAISE EXCEPTION 'Solo el dueño puede modificar precios de catálogo.' USING ERRCODE = '42501';
  END IF;

  v_motivo := btrim(NEW.motivo_cambio_precio);
  IF v_motivo IS NULL OR char_length(v_motivo) < 5 OR char_length(v_motivo) > 300 THEN
    RAISE EXCEPTION 'Indicá un motivo de cambio de precio de 5 a 300 caracteres.' USING ERRCODE = '22023';
  END IF;

  SELECT u.id INTO v_usuario_id FROM public.usuarios u
  WHERE u.auth_user_id = auth.uid() AND u.activo = true LIMIT 1;
  v_rol := CASE
    WHEN auth.role() = 'service_role' THEN 'service_role'
    WHEN v_mantenimiento THEN 'ADMIN_SQL'
    ELSE public.auth_user_rol()
  END;

  INSERT INTO public.auditoria_operaciones (
    kiosco_id, usuario_id, actor_auth_id, actor_rol, accion, entidad, entidad_id, motivo, detalles
  ) VALUES (
    NEW.kiosco_id, v_usuario_id, auth.uid(), v_rol,
    'PRECIO_VENTA_MODIFICADO', 'productos', NEW.id, v_motivo,
    jsonb_build_object('precio_anterior', OLD.precio_venta, 'precio_nuevo', NEW.precio_venta)
  );
  NEW.motivo_cambio_precio := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auditar_cambio_precio_producto ON public.productos;
CREATE TRIGGER trg_auditar_cambio_precio_producto
  BEFORE UPDATE ON public.productos
  FOR EACH ROW EXECUTE FUNCTION public.auditar_cambio_precio_producto();
REVOKE ALL ON FUNCTION public.auditar_cambio_precio_producto() FROM PUBLIC, anon, authenticated;

COMMIT;

