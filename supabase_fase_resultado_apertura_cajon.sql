-- Paso 42. Resultado declarado por el navegador; no prueba apertura física.
-- Requiere 41.
BEGIN;
CREATE UNIQUE INDEX IF NOT EXISTS auditoria_cajon_resultado_unico
ON public.auditoria_operaciones(entidad_id) WHERE accion='CAJON_RESULTADO_DECLARADO';
CREATE OR REPLACE FUNCTION public.registrar_resultado_apertura_cajon(p_solicitud uuid,p_resultado text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE; v_solicitud public.auditoria_operaciones%ROWTYPE; v_resultado public.auditoria_operaciones%ROWTYPE; v_id uuid;
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
    RAISE EXCEPTION 'Dueño requerido' USING ERRCODE='42501';
  END IF;
  IF p_solicitud IS NULL OR p_resultado IS NULL OR p_resultado NOT IN ('PULSO_ENVIADO','ERROR_TRANSPORTE','NO_ENVIADO') THEN
    RAISE EXCEPTION 'Resultado inválido' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_solicitud::text,0));
  SELECT * INTO v_solicitud FROM public.auditoria_operaciones WHERE id=p_solicitud;
  IF NOT FOUND OR v_solicitud.accion IS DISTINCT FROM 'CAJON_APERTURA_SOLICITADA'
    OR v_solicitud.actor_auth_id IS DISTINCT FROM auth.uid() OR v_solicitud.kiosco_id IS DISTINCT FROM v_actor.kiosco_id THEN
    RAISE EXCEPTION 'Solicitud no disponible' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_resultado FROM public.auditoria_operaciones WHERE entidad_id=p_solicitud AND accion='CAJON_RESULTADO_DECLARADO';
  IF FOUND THEN
    IF v_resultado.detalles->>'resultado' IS DISTINCT FROM p_resultado THEN
      RAISE EXCEPTION 'Resultado ya registrado' USING ERRCODE='22023';
    END IF;
    RETURN v_resultado.id;
  END IF;
  INSERT INTO public.auditoria_operaciones(kiosco_id,usuario_id,actor_auth_id,actor_rol,accion,entidad,entidad_id,motivo,detalles)
  VALUES(v_actor.kiosco_id,v_actor.id,auth.uid(),v_actor.rol,'CAJON_RESULTADO_DECLARADO','solicitudes_cajon',p_solicitud,v_solicitud.motivo,jsonb_build_object('resultado',p_resultado,'origen','NAVEGADOR')) RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_resultado_apertura_cajon(uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_resultado_apertura_cajon(uuid,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
