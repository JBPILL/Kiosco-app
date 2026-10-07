-- Paso 34. Aplicar después de supervisor_pin_intentos y autorización de descuento.
-- No modifica PIN ni permisos; espera por operador: 2, 4, 8, 16, 32 segundos.
BEGIN;
ALTER TABLE public.supervisor_pin_limites ADD COLUMN IF NOT EXISTS reintentar_en timestamptz;
CREATE OR REPLACE FUNCTION public.reservar_intento_pin_supervisor(p_actor_auth_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE; v_pin public.supervisor_pin_secretos%ROWTYPE;
  v_global public.supervisor_pin_limites%ROWTYPE; v_local public.supervisor_pin_limites%ROWTYPE;
  v_ahora timestamptz:=clock_timestamp(); v_id uuid; v_hasta timestamptz;
  v_clave_global text; v_clave_actor text;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere servidor autorizado' USING ERRCODE='42501'; END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501'; END;
  IF NOT coalesce(v_actor.rol IN ('DUEÑO','CAJERO'),false) THEN RAISE EXCEPTION 'Operador no autorizado' USING ERRCODE='42501'; END IF;
  SELECT * INTO v_pin FROM public.supervisor_pin_secretos WHERE kiosco_id=v_actor.kiosco_id FOR SHARE;
  IF NOT FOUND THEN RETURN jsonb_build_object('estado','NO_CONFIGURADO'); END IF;
  v_clave_global:=v_actor.kiosco_id::text||':comercio';
  v_clave_actor:=v_actor.kiosco_id::text||':actor:'||p_actor_auth_id::text;
  -- Todas las reservas/finalizaciones toman comercio antes de operador.
  INSERT INTO public.supervisor_pin_limites(clave,ventana) VALUES(v_clave_global,v_ahora) ON CONFLICT DO NOTHING;
  SELECT * INTO v_global FROM public.supervisor_pin_limites WHERE clave=v_clave_global FOR UPDATE;
  INSERT INTO public.supervisor_pin_limites(clave,ventana) VALUES(v_clave_actor,v_ahora) ON CONFLICT DO NOTHING;
  SELECT * INTO v_local FROM public.supervisor_pin_limites WHERE clave=v_clave_actor FOR UPDATE;
  IF v_global.ventana+interval '15 minutes'<=v_ahora THEN
    UPDATE public.supervisor_pin_limites SET ventana=v_ahora,intentos=0,reintentar_en=NULL WHERE clave=v_clave_global RETURNING * INTO v_global;
  END IF;
  IF v_local.ventana+interval '15 minutes'<=v_ahora THEN
    UPDATE public.supervisor_pin_limites SET ventana=v_ahora,intentos=0,reintentar_en=NULL WHERE clave=v_clave_actor RETURNING * INTO v_local;
  END IF;
  IF v_global.intentos>=10 OR v_local.intentos>=5 THEN
    IF v_global.intentos>=10 THEN v_hasta:=v_global.ventana+interval '15 minutes'; END IF;
    IF v_local.intentos>=5 THEN v_hasta:=greatest(v_hasta,v_local.ventana+interval '15 minutes'); END IF;
    RETURN jsonb_build_object('estado','BLOQUEADO','reintentar_en',v_hasta);
  END IF;
  IF v_local.reintentar_en>v_ahora THEN
    RETURN jsonb_build_object('estado','BLOQUEADO','reintentar_en',v_local.reintentar_en);
  END IF;
  UPDATE public.supervisor_pin_limites SET intentos=intentos+1 WHERE clave IN (v_clave_global,v_clave_actor);
  -- Una reserva abandonada también exige espera; no permite saltar el límite.
  UPDATE public.supervisor_pin_limites
    SET reintentar_en=v_ahora+make_interval(secs=>power(2,v_local.intentos+1)::integer)
    WHERE clave=v_clave_actor;
  INSERT INTO public.supervisor_pin_intentos(kiosco_id,actor_auth_id,revision,ventana_comercio,ventana_actor,creado_en,vence_en)
    VALUES(v_actor.kiosco_id,p_actor_auth_id,v_pin.revision,v_global.ventana,v_local.ventana,v_ahora,v_ahora+interval '30 seconds') RETURNING id INTO v_id;
  RETURN jsonb_build_object('estado','RESERVADO','id',v_id,'kiosco_id',v_actor.kiosco_id,'actor_auth_id',p_actor_auth_id,'revision',v_pin.revision,'pin_hash',v_pin.pin_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.finalizar_intento_pin_supervisor(p_actor_auth_id uuid,p_id uuid,p_valido boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_intento public.supervisor_pin_intentos%ROWTYPE; v_revision bigint;
  v_ahora timestamptz:=clock_timestamp(); v_valido boolean; v_clave_global text; v_clave_actor text;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere servidor autorizado' USING ERRCODE='42501'; END IF;
  IF p_valido IS NULL THEN RAISE EXCEPTION 'Resultado inválido'; END IF;
  SELECT * INTO v_intento FROM public.supervisor_pin_intentos WHERE id=p_id AND actor_auth_id=p_actor_auth_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Intento no disponible'; END IF;
  PERFORM 1 FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND kiosco_id=v_intento.kiosco_id AND activo AND rol IN ('DUEÑO','CAJERO') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operador no disponible' USING ERRCODE='42501'; END IF;
  IF v_intento.finalizado_en IS NOT NULL THEN
    RETURN jsonb_build_object('estado','FINALIZADO','valido',v_intento.valido);
  END IF;
  SELECT revision INTO v_revision FROM public.supervisor_pin_secretos WHERE kiosco_id=v_intento.kiosco_id FOR SHARE;
  v_valido:=p_valido AND v_intento.vence_en>v_ahora AND v_revision IS NOT DISTINCT FROM v_intento.revision AND v_revision IS NOT NULL;
  v_clave_global:=v_intento.kiosco_id::text||':comercio';
  v_clave_actor:=v_intento.kiosco_id::text||':actor:'||p_actor_auth_id::text;
  PERFORM 1 FROM public.supervisor_pin_limites WHERE clave=v_clave_global FOR UPDATE;
  PERFORM 1 FROM public.supervisor_pin_limites WHERE clave=v_clave_actor FOR UPDATE;
  IF v_valido THEN
    UPDATE public.supervisor_pin_limites SET reintentar_en=NULL
      WHERE clave=v_clave_actor AND ventana=v_intento.ventana_actor
      AND NOT EXISTS (SELECT 1 FROM public.supervisor_pin_intentos posterior
        WHERE posterior.actor_auth_id=p_actor_auth_id AND posterior.kiosco_id=v_intento.kiosco_id
          AND posterior.creado_en>v_intento.creado_en);
    UPDATE public.supervisor_pin_limites SET intentos=greatest(intentos-1,0)
      WHERE (clave=v_clave_global AND ventana=v_intento.ventana_comercio) OR (clave=v_clave_actor AND ventana=v_intento.ventana_actor);
  END IF;
  UPDATE public.supervisor_pin_intentos SET finalizado_en=v_ahora,valido=v_valido WHERE id=p_id;
  RETURN jsonb_build_object('estado','FINALIZADO','valido',v_valido);
END;
$$;
REVOKE ALL ON FUNCTION public.reservar_intento_pin_supervisor(uuid),public.finalizar_intento_pin_supervisor(uuid,uuid,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reservar_intento_pin_supervisor(uuid),public.finalizar_intento_pin_supervisor(uuid,uuid,boolean) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

