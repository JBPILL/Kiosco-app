-- Fase 1: impedir elevación de privilegios mediante columnas de usuarios.
-- Aplicar después de supabase_seguridad_roles_rls.sql y antes de costos/auditoría.
-- RLS delimita filas; este trigger protege rol, identidad y privilegios de cada fila.

BEGIN;

-- El login usa .single() y los helpers un único perfil por auth.uid().
-- No resolver duplicados borrando perfiles: abortar para revisión administrativa.
DO $$
BEGIN
  IF EXISTS (
    SELECT auth_user_id FROM public.usuarios WHERE auth_user_id IS NOT NULL
    GROUP BY auth_user_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Hay cuentas de autenticación asociadas a múltiples perfiles; resolver los duplicados antes de aplicar esta migración.' USING ERRCODE = '23505';
  END IF;
END;
$$;
CREATE UNIQUE INDEX IF NOT EXISTS uq_usuarios_auth_user_id
  ON public.usuarios(auth_user_id) WHERE auth_user_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.proteger_privilegios_usuario()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_dueno_del_comercio boolean;
BEGIN
  IF COALESCE(auth.role() = 'service_role', false) OR public.auth_es_superadmin()
     OR (
       auth.uid() IS NULL AND auth.role() IS NULL
       AND session_user IN ('postgres', 'supabase_admin')
     ) THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.es_superadmin IS TRUE THEN
      RAISE EXCEPTION 'Solo un superadmin puede conceder privilegios de superadmin.' USING ERRCODE = '42501';
    END IF;
    -- La política RLS existente exige dueño del mismo comercio para INSERT.
    RETURN NEW;
  END IF;

  IF OLD.es_superadmin IS TRUE THEN
    RAISE EXCEPTION 'Solo un superadmin puede modificar o eliminar otro superadmin.' USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;

  IF NEW.es_superadmin IS DISTINCT FROM OLD.es_superadmin THEN
    RAISE EXCEPTION 'Solo un superadmin puede cambiar los privilegios de superadmin.' USING ERRCODE = '42501';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.kiosco_id IS DISTINCT FROM OLD.kiosco_id THEN
    RAISE EXCEPTION 'La identidad y el comercio del perfil requieren administración de superadmin.' USING ERRCODE = '42501';
  END IF;

  v_dueno_del_comercio := public.auth_es_dueno_o_superadmin()
    AND OLD.kiosco_id = public.auth_user_kiosco_id();
  IF (
    NEW.rol IS DISTINCT FROM OLD.rol
    OR NEW.activo IS DISTINCT FROM OLD.activo
    OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
  ) AND NOT COALESCE(v_dueno_del_comercio, false) THEN
    RAISE EXCEPTION 'Solo el dueño del comercio puede cambiar rol, acceso o estado de un empleado.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_privilegios_usuario ON public.usuarios;
CREATE TRIGGER trg_proteger_privilegios_usuario
  BEFORE INSERT OR UPDATE OR DELETE ON public.usuarios
  FOR EACH ROW EXECUTE FUNCTION public.proteger_privilegios_usuario();
REVOKE ALL ON FUNCTION public.proteger_privilegios_usuario() FROM PUBLIC, anon, authenticated;

COMMIT;
