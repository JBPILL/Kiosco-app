BEGIN;
CREATE TABLE IF NOT EXISTS public.provisiones_comercio (
  operacion_id uuid PRIMARY KEY, actor_usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  solicitud jsonb NOT NULL, solicitud_hash text NOT NULL,
  kiosco_id uuid NOT NULL DEFAULT gen_random_uuid(), usuario_id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id uuid, estado text NOT NULL DEFAULT 'IN_PROGRESS'
    CHECK(estado IN ('IN_PROGRESS','AUTH_READY','COMPENSATING','FAILED','TAINTED','UNCERTAIN','PASS')),
  resultado jsonb, creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.provisiones_comercio ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.provisiones_comercio FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.comercial_actor_edge(p_actor_auth_id uuid)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE uid uuid;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Canal de servicio requerido' USING ERRCODE='42501'; END IF;
  SELECT id INTO uid FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo AND es_superadmin;
  IF uid IS NULL THEN RAISE EXCEPTION 'SuperAdmin activo requerido' USING ERRCODE='42501'; END IF;
  RETURN uid;
END $$;

CREATE OR REPLACE FUNCTION public.reservar_provision_comercio(p_operacion_id uuid,p_actor_auth_id uuid,p_datos jsonb,p_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE uid uuid; r public.provisiones_comercio%ROWTYPE; n integer;
BEGIN
  uid:=public.comercial_actor_edge(p_actor_auth_id);
  IF p_operacion_id IS NULL OR coalesce(jsonb_typeof(p_datos),'')<>'object'
    OR p_datos-ARRAY['email','nombreDueno','nombreKiosco','direccion','telefono','rubro','planId','diasValidez']<>'{}'
    OR p_hash IS NULL OR p_hash !~ '^[a-f0-9]{64}$'
    OR coalesce(length(btrim(p_datos->>'nombreKiosco')),0) NOT BETWEEN 1 AND 120
    OR coalesce(length(btrim(p_datos->>'nombreDueno')),0) NOT BETWEEN 1 AND 120
    OR coalesce(p_datos->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'
    OR length(p_datos->>'email')>254
    OR coalesce((p_datos->>'diasValidez')::integer,0) NOT BETWEEN 1 AND 366 THEN
    RAISE EXCEPTION 'Datos de provisioning inválidos' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.planes WHERE id=(p_datos->>'planId')::uuid AND activo FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan activo requerido' USING ERRCODE='22023'; END IF;
  INSERT INTO public.provisiones_comercio(operacion_id,actor_usuario_id,solicitud,solicitud_hash)
    VALUES(p_operacion_id,uid,p_datos,p_hash) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT;
  SELECT * INTO r FROM public.provisiones_comercio WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF r.actor_usuario_id<>uid OR r.solicitud<>p_datos OR r.solicitud_hash<>p_hash THEN
    RAISE EXCEPTION 'Operation ID asociado a otra solicitud' USING ERRCODE='22023';
  END IF;
  RETURN to_jsonb(r)||jsonb_build_object('claimed',n=1);
END $$;

CREATE OR REPLACE FUNCTION public.transicionar_provision_comercio(p_operacion_id uuid,p_actor_auth_id uuid,p_accion text,p_auth_user_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE uid uuid; r public.provisiones_comercio%ROWTYPE;
BEGIN
  uid:=public.comercial_actor_edge(p_actor_auth_id);
  SELECT * INTO r FROM public.provisiones_comercio WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF r.operacion_id IS NULL OR r.actor_usuario_id<>uid THEN RAISE EXCEPTION 'Reserva no autorizada' USING ERRCODE='42501'; END IF;
  IF r.estado='PASS' THEN RETURN to_jsonb(r); END IF;
  IF p_accion='AUTH_READY' AND r.estado='IN_PROGRESS' AND p_auth_user_id IS NOT NULL THEN
    UPDATE public.provisiones_comercio SET auth_user_id=p_auth_user_id,estado='AUTH_READY' WHERE operacion_id=p_operacion_id;
  ELSIF p_accion='COMPENSATING' AND r.estado='AUTH_READY' AND p_auth_user_id=r.auth_user_id THEN
    UPDATE public.provisiones_comercio SET estado='COMPENSATING' WHERE operacion_id=p_operacion_id;
  ELSIF p_accion IN ('FAILED','TAINTED') AND r.estado='COMPENSATING' AND p_auth_user_id=r.auth_user_id THEN
    UPDATE public.provisiones_comercio SET estado=p_accion WHERE operacion_id=p_operacion_id;
  ELSIF p_accion='FAILED' AND r.estado='IN_PROGRESS' AND p_auth_user_id IS NULL THEN
    UPDATE public.provisiones_comercio SET estado='FAILED' WHERE operacion_id=p_operacion_id;
  ELSIF p_accion='UNCERTAIN' AND r.estado IN ('IN_PROGRESS','AUTH_READY') THEN
    UPDATE public.provisiones_comercio SET estado='UNCERTAIN' WHERE operacion_id=p_operacion_id;
  ELSE RAISE EXCEPTION 'Transición de provisioning no permitida' USING ERRCODE='22023';
  END IF;
  SELECT * INTO r FROM public.provisiones_comercio WHERE operacion_id=p_operacion_id;
  RETURN to_jsonb(r);
END $$;

CREATE OR REPLACE FUNCTION public.finalizar_provision_comercio(p_operacion_id uuid,p_actor_auth_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public
AS $$
DECLARE uid uuid; r public.provisiones_comercio%ROWTYPE; salida jsonb; sid uuid;
BEGIN
  uid:=public.comercial_actor_edge(p_actor_auth_id);
  SELECT * INTO r FROM public.provisiones_comercio WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF r.operacion_id IS NULL OR r.actor_usuario_id<>uid THEN RAISE EXCEPTION 'Reserva no autorizada' USING ERRCODE='42501'; END IF;
  IF r.estado='PASS' THEN RETURN r.resultado; END IF;
  IF r.estado<>'AUTH_READY' OR r.auth_user_id IS NULL THEN RAISE EXCEPTION 'Conciliación de provisioning requerida' USING ERRCODE='22023'; END IF;
  PERFORM 1 FROM auth.users WHERE id=r.auth_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Identidad Auth ausente' USING ERRCODE='23503'; END IF;
  PERFORM 1 FROM public.planes WHERE id=(r.solicitud->>'planId')::uuid AND activo FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Plan activo requerido' USING ERRCODE='22023'; END IF;
  INSERT INTO public.kioscos(id,nombre,direccion,telefono,rubro,estado_suscripcion)
    VALUES(r.kiosco_id,r.solicitud->>'nombreKiosco',r.solicitud->>'direccion',r.solicitud->>'telefono',r.solicitud->>'rubro','ACTIVO');
  INSERT INTO public.suscripciones(kiosco_id,plan_id,fecha_inicio,fecha_vencimiento,estado)
    VALUES(r.kiosco_id,(r.solicitud->>'planId')::uuid,public.comercial_hoy(),
      public.comercial_hoy()+(r.solicitud->>'diasValidez')::integer,'ACTIVA') RETURNING id INTO sid;
  INSERT INTO public.usuarios(id,auth_user_id,kiosco_id,nombre,email,rol,activo,es_superadmin)
    VALUES(r.usuario_id,r.auth_user_id,r.kiosco_id,r.solicitud->>'nombreDueno',r.solicitud->>'email','DUEÑO',true,false);
  salida:=jsonb_build_object('success',true,'kiosco_id',r.kiosco_id,'usuario_id',r.usuario_id,'suscripcion_id',sid);
  INSERT INTO public.operaciones_comerciales(id,actor_usuario_id,kiosco_id,tipo,solicitud,resultado)
    VALUES(p_operacion_id,uid,r.kiosco_id,'CREACION_COMERCIO',r.solicitud,salida);
  INSERT INTO public.auditoria_comercial_admin(operacion_id,actor_usuario_id,kiosco_id,tipo,estado_nuevo)
    VALUES(p_operacion_id,uid,r.kiosco_id,'CREACION_COMERCIO',salida);
  UPDATE public.provisiones_comercio SET estado='PASS',resultado=salida WHERE operacion_id=p_operacion_id;
  RETURN salida;
END $$;
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT oid::regprocedure signature,proname FROM pg_proc WHERE pronamespace='public'::regnamespace
    AND proname IN ('comercial_actor_edge','reservar_provision_comercio','transicionar_provision_comercio','finalizar_provision_comercio') LOOP
    EXECUTE format('ALTER FUNCTION %s OWNER TO postgres',f.signature);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',f.signature);
    IF f.proname<>'comercial_actor_edge' THEN EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',f.signature); END IF;
  END LOOP;
END $$;
COMMIT;
