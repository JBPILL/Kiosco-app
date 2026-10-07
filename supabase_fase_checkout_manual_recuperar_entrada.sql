-- Recuperación puntual de la solicitud original para cancelación del dueño.
BEGIN;
CREATE OR REPLACE FUNCTION public.recuperar_entrada_checkout_manual(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE; v_entrada jsonb;
BEGIN
  IF NOT coalesce(auth.role()='authenticated',false) OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere sesión del dueño' USING ERRCODE='42501';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501';
  END;
  IF v_actor.rol IS DISTINCT FROM 'DUEÑO' THEN RAISE EXCEPTION 'Solo el dueño puede recuperar' USING ERRCODE='42501'; END IF;
  SELECT e.entrada INTO v_entrada FROM public.checkout_manual_entradas e
  WHERE e.id=p_id AND e.kiosco_id=v_actor.kiosco_id
    AND NOT EXISTS(SELECT 1 FROM public.checkout_manual_cancelaciones c WHERE c.id=e.id)
    AND NOT EXISTS(SELECT 1 FROM public.ventas v WHERE v.id=e.id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Pendiente no disponible: actualizar revisión o consultar Reportes'; END IF;
  RETURN v_entrada;
END;
$$;
REVOKE ALL ON FUNCTION public.recuperar_entrada_checkout_manual(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.recuperar_entrada_checkout_manual(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
