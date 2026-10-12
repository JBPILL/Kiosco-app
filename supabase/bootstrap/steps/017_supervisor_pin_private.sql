BEGIN;
CREATE TABLE IF NOT EXISTS public.supervisor_pin_secretos (
  kiosco_id uuid PRIMARY KEY REFERENCES public.kioscos(id),
  pin_hash jsonb NOT NULL,
  revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
  actualizado_por_auth_id uuid NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.supervisor_pin_config_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  revision bigint NOT NULL,
  actor_auth_id uuid NOT NULL,
  fecha timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.supervisor_pin_secretos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_pin_config_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supervisor_pin_secretos,public.supervisor_pin_config_auditoria FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.supervisor_pin_secretos,public.supervisor_pin_config_auditoria TO service_role;
DROP POLICY IF EXISTS supervisor_pin_servidor ON public.supervisor_pin_secretos;
CREATE POLICY supervisor_pin_servidor ON public.supervisor_pin_secretos FOR SELECT TO service_role USING(true);
DROP POLICY IF EXISTS supervisor_pin_auditoria_servidor ON public.supervisor_pin_config_auditoria;
CREATE POLICY supervisor_pin_auditoria_servidor ON public.supervisor_pin_config_auditoria FOR SELECT TO service_role USING(true);
CREATE OR REPLACE FUNCTION public.configurar_hash_pin_supervisor(p_actor_auth_id uuid,p_hash jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE; v_revision bigint;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere servidor autorizado' USING ERRCODE='42501'; END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501'; END;
  IF v_actor.rol IS DISTINCT FROM 'DUEÑO' THEN RAISE EXCEPTION 'Solo el dueño configura el PIN' USING ERRCODE='42501'; END IF;
  IF p_hash IS NULL OR jsonb_typeof(p_hash) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Hash inválido'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_hash))<>6 OR p_hash->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_hash->'algoritmo') IS DISTINCT FROM 'string' OR jsonb_typeof(p_hash->'sal') IS DISTINCT FROM 'string'
    OR jsonb_typeof(p_hash->'hash') IS DISTINCT FROM 'string' OR jsonb_typeof(p_hash->'pepperVersion') IS DISTINCT FROM 'string'
    OR p_hash->>'algoritmo' IS DISTINCT FROM 'PBKDF2-SHA256' OR p_hash->'iteraciones' IS DISTINCT FROM '600000'::jsonb
    OR coalesce(p_hash->>'sal','') !~ '^[0-9a-f]{32}$' OR coalesce(p_hash->>'hash','') !~ '^[0-9a-f]{64}$'
    OR coalesce(p_hash->>'pepperVersion','') !~ '^[a-zA-Z0-9_-]{1,32}$' THEN RAISE EXCEPTION 'Hash inválido'; END IF;
  INSERT INTO public.supervisor_pin_secretos(kiosco_id,pin_hash,actualizado_por_auth_id)
  VALUES(v_actor.kiosco_id,p_hash,p_actor_auth_id)
  ON CONFLICT(kiosco_id) DO UPDATE SET pin_hash=EXCLUDED.pin_hash,revision=supervisor_pin_secretos.revision+1,
    actualizado_por_auth_id=EXCLUDED.actualizado_por_auth_id,actualizado_en=now()
  RETURNING revision INTO v_revision;
  INSERT INTO public.supervisor_pin_config_auditoria(kiosco_id,revision,actor_auth_id) VALUES(v_actor.kiosco_id,v_revision,p_actor_auth_id);
  RETURN v_revision;
END;
$$;
REVOKE ALL ON FUNCTION public.configurar_hash_pin_supervisor(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.configurar_hash_pin_supervisor(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
