-- Requiere las migraciones de checkout manual anteriores.
BEGIN;
CREATE OR REPLACE FUNCTION public.consultar_checkouts_manuales_pendientes(p_despues uuid DEFAULT NULL,p_limite integer DEFAULT 50)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE; v_resultado jsonb;
BEGIN
  IF NOT coalesce(auth.role()='authenticated',false) OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere sesión del dueño' USING ERRCODE='42501';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501';
  END;
  IF v_actor.rol IS DISTINCT FROM 'DUEÑO' THEN
    RAISE EXCEPTION 'Solo el dueño puede revisar pendientes del comercio' USING ERRCODE='42501';
  END IF;
  IF p_limite IS NULL OR p_limite NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Límite inválido'; END IF;
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',e.id,'kioscoId',e.kiosco_id,'usuarioId',e.usuario_id,
    'sesionCajaId',e.snapshot->>'sesion_caja_id','fechaHora',e.entrada->>'fechaHora',
    'total',e.entrada->'totalEsperado') ORDER BY e.id),'[]'::jsonb)
  INTO v_resultado FROM (
    SELECT e.* FROM public.checkout_manual_entradas e
    WHERE e.kiosco_id=v_actor.kiosco_id AND (p_despues IS NULL OR e.id>p_despues)
      AND NOT EXISTS(SELECT 1 FROM public.checkout_manual_cancelaciones c WHERE c.id=e.id)
      AND NOT EXISTS(SELECT 1 FROM public.ventas v WHERE v.id=e.id)
    ORDER BY e.id LIMIT p_limite
  ) e;
  RETURN v_resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_checkouts_manuales_pendientes(uuid,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_checkouts_manuales_pendientes(uuid,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
