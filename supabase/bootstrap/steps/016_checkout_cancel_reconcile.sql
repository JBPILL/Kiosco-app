BEGIN;
CREATE OR REPLACE FUNCTION public.consultar_cancelacion_checkout_manual(p_entrada jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_actor public.usuarios%ROWTYPE; v_cancelado public.checkout_manual_cancelaciones%ROWTYPE;
  v_id uuid; v_kid uuid; v_uid uuid;
BEGIN
  IF NOT coalesce(auth.role()='authenticated',false) OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere sesión autenticada' USING ERRCODE='42501';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501'; END;
  IF p_entrada IS NULL OR octet_length(p_entrada::text)>200000 THEN RAISE EXCEPTION 'Entrada inválida'; END IF;
  v_id:=public.checkout_uuid(p_entrada->'checkoutId'); v_kid:=public.checkout_uuid(p_entrada->'kioscoId');
  v_uid:=public.checkout_uuid(p_entrada->'usuarioId');
  IF v_actor.kiosco_id IS DISTINCT FROM v_kid OR NOT coalesce(v_actor.rol IN ('DUEÑO','CAJERO'),false)
    OR (v_actor.rol='CAJERO' AND v_actor.id IS DISTINCT FROM v_uid) THEN
    RAISE EXCEPTION 'Consulta no autorizada' USING ERRCODE='42501';
  END IF;
  SELECT * INTO v_cancelado FROM public.checkout_manual_cancelaciones WHERE id=v_id;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF v_cancelado.kiosco_id IS DISTINCT FROM v_kid OR v_cancelado.usuario_id IS DISTINCT FROM v_uid
    OR v_cancelado.entrada IS DISTINCT FROM p_entrada THEN RAISE EXCEPTION 'La entrada original no coincide'; END IF;
  RETURN jsonb_build_object('entrada',v_cancelado.entrada,
    'cancelacion',jsonb_build_object('motivo',v_cancelado.motivo,'resolucion',v_cancelado.resolucion,'referencia',v_cancelado.referencia),
    'confirmacion',jsonb_build_object('estado','CANCELADO','checkout_id',v_cancelado.id,'kiosco_id',v_cancelado.kiosco_id,
      'resolucion',v_cancelado.resolucion,'cancelado_en',v_cancelado.creado_en));
END;
$$;
REVOKE ALL ON FUNCTION public.consultar_cancelacion_checkout_manual(jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_cancelacion_checkout_manual(jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
