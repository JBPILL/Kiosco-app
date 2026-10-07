-- Paso 36: política comercial privada. Requiere kioscos, usuarios y Supabase Auth.
-- La integración con la cotización y las preparaciones se realiza en una fase posterior.
BEGIN;
CREATE TABLE IF NOT EXISTS public.supervisor_politicas (
  kiosco_id uuid PRIMARY KEY REFERENCES public.kioscos(id),
  umbral_descuento numeric(5,2) NOT NULL CHECK (umbral_descuento BETWEEN 0 AND 100),
  revision bigint NOT NULL CHECK (revision > 0),
  actualizado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
  actor_auth_id uuid NOT NULL
);
CREATE TABLE IF NOT EXISTS public.supervisor_politica_auditoria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  actor_auth_id uuid NOT NULL,
  umbral_anterior numeric(5,2) NOT NULL,
  umbral_nuevo numeric(5,2) NOT NULL,
  revision bigint NOT NULL,
  fecha timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.supervisor_politicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supervisor_politica_auditoria ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supervisor_politicas,public.supervisor_politica_auditoria FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.supervisor_politicas TO service_role;

CREATE OR REPLACE FUNCTION public.consultar_politica_descuento_supervisor()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE; v_umbral numeric; v_revision bigint;
BEGIN
  IF NOT coalesce(auth.role()='authenticated',false) OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='42501';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501';
  END;
  IF v_actor.rol NOT IN ('DUEÑO','CAJERO') OR v_actor.kiosco_id IS NULL THEN
    RAISE EXCEPTION 'Perfil no autorizado' USING ERRCODE='42501';
  END IF;
  SELECT umbral_descuento,revision INTO v_umbral,v_revision FROM public.supervisor_politicas WHERE kiosco_id=v_actor.kiosco_id;
  RETURN jsonb_build_object('umbralPorcentaje',coalesce(v_umbral,15),'revision',coalesce(v_revision,0));
END;
$$;

CREATE OR REPLACE FUNCTION public.configurar_politica_descuento_supervisor(p_umbral_porcentaje numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE; v_anterior numeric; v_revision bigint;
BEGIN
  IF NOT coalesce(auth.role()='authenticated',false) OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='42501';
  END IF;
  IF p_umbral_porcentaje IS NULL OR p_umbral_porcentaje<0 OR p_umbral_porcentaje>100
    OR p_umbral_porcentaje<>round(p_umbral_porcentaje,2) THEN
    RAISE EXCEPTION 'Umbral inválido';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501';
  END;
  IF v_actor.rol<>'DUEÑO' OR v_actor.kiosco_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere dueño' USING ERRCODE='42501';
  END IF;
  -- Serializa cambios del mismo comercio, incluidos los primeros guardados.
  PERFORM pg_advisory_xact_lock(hashtextextended('supervisor-politica:'||v_actor.kiosco_id::text,0));
  SELECT umbral_descuento INTO v_anterior FROM public.supervisor_politicas WHERE kiosco_id=v_actor.kiosco_id FOR UPDATE;
  INSERT INTO public.supervisor_politicas(kiosco_id,umbral_descuento,revision,actor_auth_id)
    VALUES(v_actor.kiosco_id,p_umbral_porcentaje,1,auth.uid())
    ON CONFLICT(kiosco_id) DO UPDATE SET umbral_descuento=excluded.umbral_descuento,
      revision=supervisor_politicas.revision+1,actor_auth_id=excluded.actor_auth_id,actualizado_en=clock_timestamp()
    RETURNING revision INTO v_revision;
  INSERT INTO public.supervisor_politica_auditoria(kiosco_id,actor_auth_id,umbral_anterior,umbral_nuevo,revision)
    VALUES(v_actor.kiosco_id,auth.uid(),coalesce(v_anterior,15),p_umbral_porcentaje,v_revision);
  RETURN jsonb_build_object('umbralPorcentaje',p_umbral_porcentaje,'revision',v_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_politica_descuento_supervisor() FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.configurar_politica_descuento_supervisor(numeric) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_politica_descuento_supervisor() TO authenticated;
GRANT EXECUTE ON FUNCTION public.configurar_politica_descuento_supervisor(numeric) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
