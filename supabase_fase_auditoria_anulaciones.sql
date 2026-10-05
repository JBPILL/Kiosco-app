-- Fase 1: actor y motivo verificables para anulaciones, también si se llama a Supabase directamente.
-- Requiere haber aplicado supabase_seguridad_roles_rls.sql (RLS de ventas limita UPDATE a dueños).

BEGIN;

ALTER TABLE public.ventas
  ADD COLUMN IF NOT EXISTS motivo_anulacion text,
  ADD COLUMN IF NOT EXISTS anulada_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS anulada_en timestamptz;

CREATE TABLE IF NOT EXISTS public.auditoria_operaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES public.usuarios(id) ON DELETE SET NULL,
  actor_auth_id uuid,
  actor_rol text,
  accion text NOT NULL,
  entidad text NOT NULL,
  entidad_id uuid NOT NULL,
  motivo text NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Conservar identidad de sesión aun si luego se elimina el perfil del usuario.
ALTER TABLE public.auditoria_operaciones
  ADD COLUMN IF NOT EXISTS actor_auth_id uuid,
  ADD COLUMN IF NOT EXISTS actor_rol text;

CREATE INDEX IF NOT EXISTS idx_auditoria_operaciones_kiosco_fecha
  ON public.auditoria_operaciones(kiosco_id, creado_en DESC);
ALTER TABLE public.auditoria_operaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS auditoria_operaciones_dueno_select ON public.auditoria_operaciones;
CREATE POLICY auditoria_operaciones_dueno_select
  ON public.auditoria_operaciones FOR SELECT TO authenticated
  USING (public.auth_es_superadmin() OR (
    kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()
  ));
REVOKE ALL ON public.auditoria_operaciones FROM anon, authenticated;
GRANT SELECT ON public.auditoria_operaciones TO authenticated;

CREATE OR REPLACE FUNCTION public.auditar_anulacion_venta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_usuario_id uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.estado = 'ANULADA' OR NEW.anulada_por IS NOT NULL OR NEW.anulada_en IS NOT NULL THEN
      RAISE EXCEPTION 'Creá la venta y usá el flujo de anulación para registrar actor y fecha verificables.' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.kiosco_id IS DISTINCT FROM OLD.kiosco_id THEN
    RAISE EXCEPTION 'La identidad y el comercio de una venta son inmutables.' USING ERRCODE = '42501';
  END IF;
  IF OLD.estado = 'ANULADA' AND NEW.estado <> 'ANULADA' THEN
    RAISE EXCEPTION 'Una venta anulada no puede reactivarse; registrá una nueva operación.' USING ERRCODE = '42501';
  END IF;
  IF OLD.estado = 'ANULADA' AND NEW.motivo_anulacion IS DISTINCT FROM OLD.motivo_anulacion THEN
    RAISE EXCEPTION 'El motivo de anulación es inmutable.' USING ERRCODE = '42501';
  END IF;
  IF OLD.estado = 'ANULADA' AND (
    NEW.anulada_en IS DISTINCT FROM OLD.anulada_en
    OR (
      NEW.anulada_por IS DISTINCT FROM OLD.anulada_por
      -- Permitir exclusivamente SET NULL de la FK al eliminar el usuario.
      -- Ese UPDATE proviene de un trigger referencial anidado, no de PostgREST.
      AND NOT (NEW.anulada_por IS NULL AND pg_trigger_depth() > 1)
    )
  ) THEN
    RAISE EXCEPTION 'El actor y la fecha de anulación son inmutables.' USING ERRCODE = '42501';
  END IF;
  IF NEW.estado <> 'ANULADA' AND (NEW.anulada_por IS NOT NULL OR NEW.anulada_en IS NOT NULL) THEN
    RAISE EXCEPTION 'Una venta vigente no puede contener datos de anulación.' USING ERRCODE = '42501';
  END IF;

  IF OLD.estado IS DISTINCT FROM 'ANULADA' AND NEW.estado = 'ANULADA' THEN
    IF NULLIF(trim(NEW.motivo_anulacion), '') IS NULL OR length(trim(NEW.motivo_anulacion)) < 5 THEN
      RAISE EXCEPTION 'Se requiere un motivo de anulación de al menos 5 caracteres.' USING ERRCODE = '22023';
    END IF;
    IF NOT COALESCE(auth.role() = 'service_role', false)
       AND NOT public.auth_es_superadmin()
       AND NOT (NEW.kiosco_id = public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin()) THEN
      RAISE EXCEPTION 'Solo el dueño puede anular ventas.' USING ERRCODE = '42501';
    END IF;

    SELECT u.id INTO v_usuario_id
    FROM public.usuarios u
    WHERE u.auth_user_id = (SELECT auth.uid()) AND u.activo = true
    LIMIT 1;

    NEW.anulada_por := v_usuario_id;
    NEW.anulada_en := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.registrar_auditoria_anulacion_venta()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.estado IS DISTINCT FROM 'ANULADA' AND NEW.estado = 'ANULADA' THEN
    INSERT INTO public.auditoria_operaciones (
      kiosco_id, usuario_id, actor_auth_id, actor_rol, accion, entidad, entidad_id, motivo, creado_en
    ) VALUES (
      NEW.kiosco_id, NEW.anulada_por, auth.uid(),
      CASE WHEN auth.role() = 'service_role' THEN 'service_role' ELSE public.auth_user_rol() END,
      'VENTA_ANULADA', 'ventas', NEW.id, NEW.motivo_anulacion, NEW.anulada_en
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validar_anulacion_venta ON public.ventas;
CREATE TRIGGER trg_validar_anulacion_venta
  BEFORE INSERT OR UPDATE ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.auditar_anulacion_venta();
DROP TRIGGER IF EXISTS trg_registrar_auditoria_anulacion_venta ON public.ventas;
CREATE TRIGGER trg_registrar_auditoria_anulacion_venta
  AFTER UPDATE OF estado ON public.ventas
  FOR EACH ROW EXECUTE FUNCTION public.registrar_auditoria_anulacion_venta();
REVOKE ALL ON FUNCTION public.auditar_anulacion_venta() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.registrar_auditoria_anulacion_venta() FROM PUBLIC, anon, authenticated;

COMMIT;

-- Validación manual tras aplicar: cajero/visor no puede cambiar estado;
-- dueño con motivo <5 caracteres falla; dueño con motivo válido genera una fila;
-- cambios posteriores a estado/motivo de anulación fallan y auditoría no admite escrituras directas.
