-- Supabase Auth profile helpers. Table/RLS privileges are applied last.
BEGIN;

CREATE FUNCTION public.auth_user_kiosco_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
  SELECT u.kiosco_id FROM public.usuarios AS u
  WHERE u.auth_user_id=(SELECT auth.uid()) AND u.activo
$$;

CREATE FUNCTION public.auth_user_rol()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
  SELECT u.rol FROM public.usuarios AS u
  WHERE u.auth_user_id=(SELECT auth.uid()) AND u.activo
$$;

CREATE FUNCTION public.auth_es_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
  SELECT coalesce((SELECT u.es_superadmin FROM public.usuarios AS u
    WHERE u.auth_user_id=(SELECT auth.uid()) AND u.activo),false)
$$;

CREATE FUNCTION public.auth_es_dueno_o_superadmin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path=pg_catalog,public
AS $$
  SELECT coalesce((SELECT (u.es_superadmin OR u.rol='DUEÑO') FROM public.usuarios AS u
    WHERE u.auth_user_id=(SELECT auth.uid()) AND u.activo),false)
$$;

COMMIT;
