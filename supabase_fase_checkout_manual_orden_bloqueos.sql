-- Requiere las fases de checkout manual 26 a 29.
-- Orden compartido con confirmación: identificador del checkout antes de caja.
BEGIN;
CREATE OR REPLACE FUNCTION public.cancelar_checkout_manual(p_entrada jsonb,p_motivo text,p_resolucion text,p_referencia text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE; v_preparado public.checkout_manual_entradas%ROWTYPE;
  v_cancelado public.checkout_manual_cancelaciones%ROWTYPE;
  v_id uuid; v_kid uuid; v_uid uuid; v_caja uuid;
  v_motivo text:=trim(p_motivo); v_referencia text:=nullif(trim(p_referencia),'');
BEGIN
  IF NOT coalesce(auth.role()='authenticated',false) OR auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Se requiere una sesión del dueño' USING ERRCODE='42501';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=auth.uid() AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501';
  END;
  IF v_actor.rol IS DISTINCT FROM 'DUEÑO' THEN RAISE EXCEPTION 'Solo el dueño puede cancelar' USING ERRCODE='42501'; END IF;
  IF p_entrada IS NULL OR octet_length(p_entrada::text)>200000 THEN RAISE EXCEPTION 'Entrada inválida'; END IF;
  PERFORM public.checkout_objeto(p_entrada,ARRAY['version','checkoutId','kioscoId','usuarioId','sesionCajaId','fechaHora','clienteId','notas',
    'tipoAjuste','valorAjuste','totalEsperado','subtotalesEsperados','componentesEsperados','lineas','pagos']);
  IF p_entrada->'version' IS DISTINCT FROM '1'::jsonb THEN RAISE EXCEPTION 'Versión inválida'; END IF;
  v_id:=public.checkout_uuid(p_entrada->'checkoutId'); v_kid:=public.checkout_uuid(p_entrada->'kioscoId');
  v_uid:=public.checkout_uuid(p_entrada->'usuarioId'); v_caja:=public.checkout_uuid(p_entrada->'sesionCajaId');
  IF v_actor.kiosco_id IS DISTINCT FROM v_kid THEN RAISE EXCEPTION 'Comercio no autorizado' USING ERRCODE='42501'; END IF;
  IF v_motivo IS NULL OR length(v_motivo) NOT BETWEEN 5 AND 1000
    OR p_resolucion IS NULL OR p_resolucion NOT IN ('NO_COBRADO','REINTEGRADO')
    OR length(coalesce(v_referencia,''))>500
    OR (p_resolucion='REINTEGRADO' AND length(coalesce(v_referencia,''))<5) THEN
    RAISE EXCEPTION 'Indicar motivo, resolución y referencia del reintegro cuando corresponda';
  END IF;
  PERFORM 1 FROM public.usuarios WHERE id=v_uid AND kiosco_id=v_kid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario original no disponible'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout-manual:'||v_id::text,0));
  PERFORM 1 FROM public.sesiones_caja WHERE id=v_caja AND kiosco_id=v_kid AND usuario_id=v_uid FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja original no disponible'; END IF;
  SELECT * INTO v_preparado FROM public.checkout_manual_entradas WHERE id=v_id;
  IF FOUND AND (v_preparado.kiosco_id IS DISTINCT FROM v_kid OR v_preparado.usuario_id IS DISTINCT FROM v_uid
    OR v_preparado.entrada IS DISTINCT FROM p_entrada) THEN RAISE EXCEPTION 'El identificador corresponde a otra entrada'; END IF;
  -- Una venta confirmada o proveniente del circuito anterior requiere revisión y
  -- anulación por el circuito de Reportes. Nunca declarar cancelado un ID vendido.
  IF EXISTS(SELECT 1 FROM public.checkout_manuales WHERE id=v_id)
    OR EXISTS(SELECT 1 FROM public.ventas WHERE id=v_id) THEN
    RAISE EXCEPTION 'Checkout registrado: revisar la venta en Reportes antes de conciliar';
  END IF;
  SELECT * INTO v_cancelado FROM public.checkout_manual_cancelaciones WHERE id=v_id;
  IF FOUND THEN
    IF v_cancelado.kiosco_id IS DISTINCT FROM v_kid OR v_cancelado.entrada IS DISTINCT FROM p_entrada
      OR v_cancelado.motivo IS DISTINCT FROM v_motivo OR v_cancelado.resolucion IS DISTINCT FROM p_resolucion
      OR v_cancelado.referencia IS DISTINCT FROM v_referencia THEN
      RAISE EXCEPTION 'La cancelación original no puede modificarse';
    END IF;
  ELSE
    INSERT INTO public.checkout_manual_cancelaciones(id,kiosco_id,usuario_id,entrada,motivo,resolucion,referencia,autorizado_por,autorizado_por_auth_id)
      VALUES(v_id,v_kid,v_uid,p_entrada,v_motivo,p_resolucion,v_referencia,v_actor.id,auth.uid()) RETURNING * INTO v_cancelado;
  END IF;
  RETURN jsonb_build_object('estado','CANCELADO','checkout_id',v_cancelado.id,'kiosco_id',v_cancelado.kiosco_id,
    'resolucion',v_cancelado.resolucion,'cancelado_en',v_cancelado.creado_en);
END;
$$;
REVOKE ALL ON FUNCTION public.cancelar_checkout_manual(jsonb,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_checkout_manual(jsonb,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;


