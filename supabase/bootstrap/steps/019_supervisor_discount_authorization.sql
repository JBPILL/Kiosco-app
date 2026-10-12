-- Requiere PIN privado e intentos. La integración con ventas se instala después.
BEGIN;
ALTER TABLE public.supervisor_pin_intentos ADD COLUMN IF NOT EXISTS accion text;
ALTER TABLE public.supervisor_pin_intentos ADD COLUMN IF NOT EXISTS solicitud jsonb;
CREATE TABLE IF NOT EXISTS public.supervisor_autorizaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intento_id uuid NOT NULL UNIQUE REFERENCES public.supervisor_pin_intentos(id),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  actor_auth_id uuid NOT NULL,
  revision bigint NOT NULL,
  accion text NOT NULL CHECK(accion='DESCUENTO'),
  solicitud jsonb NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now(),
  vence_en timestamptz NOT NULL,
  consumido_en timestamptz
);
ALTER TABLE public.supervisor_autorizaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.supervisor_autorizaciones FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.supervisor_autorizaciones TO service_role;
DROP POLICY IF EXISTS supervisor_autorizaciones_servidor ON public.supervisor_autorizaciones;
CREATE POLICY supervisor_autorizaciones_servidor ON public.supervisor_autorizaciones FOR SELECT TO service_role USING(true);

CREATE OR REPLACE FUNCTION public.reservar_intento_pin_supervisor(p_actor_auth_id uuid,p_accion text,p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE; v_reserva jsonb; v_id uuid;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere servidor autorizado' USING ERRCODE='42501'; END IF;
  IF p_accion IS DISTINCT FROM 'DESCUENTO' OR p_solicitud IS NULL OR jsonb_typeof(p_solicitud) IS DISTINCT FROM 'object'
    OR octet_length(p_solicitud::text)>200000 THEN RAISE EXCEPTION 'Operación inválida'; END IF;
  IF (SELECT count(*) FROM jsonb_object_keys(p_solicitud))<>15
    OR p_solicitud->'version' IS DISTINCT FROM '1'::jsonb OR p_solicitud->>'checkoutId' IS NULL
    OR NOT coalesce(p_solicitud->>'tipoAjuste' IN ('DESCUENTO_PORCENTAJE','DESCUENTO_FIJO'),false)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_solicitud) k WHERE k NOT IN
      ('version','checkoutId','kioscoId','usuarioId','sesionCajaId','fechaHora','clienteId','notas',
       'tipoAjuste','valorAjuste','totalEsperado','subtotalesEsperados','componentesEsperados','lineas','pagos')) THEN RAISE EXCEPTION 'Operación inválida'; END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501'; END;
  IF NOT coalesce(v_actor.rol IN ('DUEÑO','CAJERO'),false)
    OR v_actor.kiosco_id IS DISTINCT FROM (p_solicitud->>'kioscoId')::uuid
    OR v_actor.id IS DISTINCT FROM (p_solicitud->>'usuarioId')::uuid THEN RAISE EXCEPTION 'Operación no autorizada' USING ERRCODE='42501'; END IF;
  v_id:=(p_solicitud->>'checkoutId')::uuid;
  v_reserva:=public.reservar_intento_pin_supervisor(p_actor_auth_id);
  IF v_reserva->>'estado'='RESERVADO' THEN
    UPDATE public.supervisor_pin_intentos SET accion=p_accion,solicitud=p_solicitud WHERE id=(v_reserva->>'id')::uuid;
  END IF;
  RETURN v_reserva;
END;
$$;

CREATE OR REPLACE FUNCTION public.emitir_autorizacion_supervisor(p_actor_auth_id uuid,p_intento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_intento public.supervisor_pin_intentos%ROWTYPE; v_permiso public.supervisor_autorizaciones%ROWTYPE; v_revision bigint;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere servidor autorizado' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_intento FROM public.supervisor_pin_intentos WHERE id=p_intento_id AND actor_auth_id=p_actor_auth_id FOR UPDATE;
  IF NOT FOUND OR v_intento.valido IS DISTINCT FROM true OR v_intento.finalizado_en IS NULL
    OR v_intento.accion IS DISTINCT FROM 'DESCUENTO' OR v_intento.solicitud IS NULL THEN RAISE EXCEPTION 'Verificación no autorizada'; END IF;
  PERFORM 1 FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND kiosco_id=v_intento.kiosco_id AND activo AND rol IN ('DUEÑO','CAJERO') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operador no disponible' USING ERRCODE='42501'; END IF;
  SELECT revision INTO v_revision FROM public.supervisor_pin_secretos WHERE kiosco_id=v_intento.kiosco_id FOR SHARE;
  IF v_revision IS DISTINCT FROM v_intento.revision THEN RAISE EXCEPTION 'PIN modificado'; END IF;
  SELECT * INTO v_permiso FROM public.supervisor_autorizaciones WHERE intento_id=p_intento_id;
  IF NOT FOUND THEN
    IF v_intento.vence_en<=clock_timestamp() THEN RAISE EXCEPTION 'Verificación vencida'; END IF;
    INSERT INTO public.supervisor_autorizaciones(intento_id,kiosco_id,actor_auth_id,revision,accion,solicitud,vence_en)
      VALUES(v_intento.id,v_intento.kiosco_id,p_actor_auth_id,v_intento.revision,v_intento.accion,v_intento.solicitud,clock_timestamp()+interval '2 minutes')
      RETURNING * INTO v_permiso;
  END IF;
  -- Recuperar la respuesta perdida nunca renueva el vencimiento ni el permiso.
  IF v_permiso.vence_en<=clock_timestamp() OR v_permiso.consumido_en IS NOT NULL THEN RAISE EXCEPTION 'Permiso vencido o consumido'; END IF;
  RETURN jsonb_build_object('autorizacion_id',v_permiso.id,'vence_en',v_permiso.vence_en);
END;
$$;

CREATE OR REPLACE FUNCTION public.consumir_autorizacion_supervisor(p_actor_auth_id uuid,p_id uuid,p_accion text,p_solicitud jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_permiso public.supervisor_autorizaciones%ROWTYPE; v_revision bigint;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere servidor autorizado' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_permiso FROM public.supervisor_autorizaciones WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR v_permiso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR v_permiso.accion IS DISTINCT FROM p_accion
    OR v_permiso.solicitud IS DISTINCT FROM p_solicitud THEN RAISE EXCEPTION 'Permiso no corresponde a la operación'; END IF;
  IF v_permiso.consumido_en IS NOT NULL OR v_permiso.vence_en<=clock_timestamp() THEN RAISE EXCEPTION 'Permiso vencido o consumido'; END IF;
  PERFORM 1 FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND kiosco_id=v_permiso.kiosco_id AND activo AND rol IN ('DUEÑO','CAJERO') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operador no disponible' USING ERRCODE='42501'; END IF;
  SELECT revision INTO v_revision FROM public.supervisor_pin_secretos WHERE kiosco_id=v_permiso.kiosco_id FOR SHARE;
  IF v_revision IS DISTINCT FROM v_permiso.revision THEN RAISE EXCEPTION 'PIN modificado'; END IF;
  UPDATE public.supervisor_autorizaciones SET consumido_en=clock_timestamp() WHERE id=p_id;
END;
$$;
REVOKE ALL ON FUNCTION public.reservar_intento_pin_supervisor(uuid,text,jsonb),public.emitir_autorizacion_supervisor(uuid,uuid),public.consumir_autorizacion_supervisor(uuid,uuid,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reservar_intento_pin_supervisor(uuid,text,jsonb),public.emitir_autorizacion_supervisor(uuid,uuid) TO service_role;
-- Consumir sólo desde la función financiera SECURITY DEFINER en su transacción.
NOTIFY pgrst,'reload schema';
COMMIT;
