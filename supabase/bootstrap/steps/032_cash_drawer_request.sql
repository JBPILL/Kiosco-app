-- Paso 41: solicitud auditable de apertura manual. Requiere 04 y 05.
-- Este registro autoriza la solicitud; no acredita un pulso ni apertura física.
BEGIN;
CREATE OR REPLACE FUNCTION public.solicitar_apertura_manual_cajon(p_solicitud uuid,p_motivo text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE; v_anterior public.auditoria_operaciones%ROWTYPE; v_motivo text;
BEGIN
  IF auth.uid() IS NULL OR NOT coalesce(auth.role()='authenticated',false) THEN
    RAISE EXCEPTION 'Sesión requerida' USING ERRCODE='42501';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501';
  END;
  IF v_actor.rol IS DISTINCT FROM 'DUEÑO' OR v_actor.kiosco_id IS NULL THEN
    RAISE EXCEPTION 'Sólo el dueño solicita apertura manual' USING ERRCODE='42501';
  END IF;
  v_motivo := btrim(p_motivo);
  IF p_solicitud IS NULL OR v_motivo IS NULL OR length(v_motivo)<5 OR length(v_motivo)>300 THEN
    RAISE EXCEPTION 'Solicitud o motivo inválido' USING ERRCODE='22023';
  END IF;
  -- Serializa reintentos del mismo UUID sin permitir duplicar registros.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_solicitud::text,0));
  SELECT * INTO v_anterior FROM public.auditoria_operaciones WHERE id=p_solicitud;
  IF FOUND THEN
    IF v_anterior.kiosco_id IS DISTINCT FROM v_actor.kiosco_id
      OR v_anterior.actor_auth_id IS DISTINCT FROM auth.uid()
      OR v_anterior.accion IS DISTINCT FROM 'CAJON_APERTURA_SOLICITADA'
      OR v_anterior.motivo IS DISTINCT FROM v_motivo THEN
      RAISE EXCEPTION 'Solicitud incompatible' USING ERRCODE='42501';
    END IF;
    RETURN p_solicitud;
  END IF;
  INSERT INTO public.auditoria_operaciones(id,kiosco_id,usuario_id,actor_auth_id,actor_rol,accion,entidad,entidad_id,motivo,detalles)
  VALUES(p_solicitud,v_actor.kiosco_id,v_actor.id,auth.uid(),v_actor.rol,'CAJON_APERTURA_SOLICITADA','kioscos',v_actor.kiosco_id,v_motivo,'{"autorizacion":"DUENO_AUTENTICADO"}'::jsonb);
  RETURN p_solicitud;
END;
$$;
REVOKE ALL ON FUNCTION public.solicitar_apertura_manual_cajon(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.solicitar_apertura_manual_cajon(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
