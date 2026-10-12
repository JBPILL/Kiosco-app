-- Requiere checkout manual, PIN privado, intentos y autorización de descuento.
BEGIN;
CREATE OR REPLACE FUNCTION public.confirmar_venta_manual_autorizada(p_actor_auth_id uuid,p_entrada jsonb,p_snapshot jsonb,p_autorizacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid; v_preparado public.checkout_manual_entradas%ROWTYPE;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere servidor de cobro' USING ERRCODE='42501'; END IF;
  IF p_entrada IS NULL OR p_snapshot IS NULL OR octet_length(p_entrada::text)>200000 OR octet_length(p_snapshot::text)>200000 THEN
    RAISE EXCEPTION 'Solicitud inválida';
  END IF;
  v_id:=public.checkout_uuid(p_entrada->'checkoutId');
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout-manual:'||v_id::text,0));
  SELECT * INTO v_preparado FROM public.checkout_manual_entradas WHERE id=v_id FOR SHARE;
  IF NOT FOUND OR v_preparado.entrada IS DISTINCT FROM p_entrada OR v_preparado.snapshot IS DISTINCT FROM p_snapshot THEN
    RAISE EXCEPTION 'La solicitud debe coincidir con la cotización original preparada';
  END IF;
  -- El RPC original comprueba identidad, estado y coherencia del resultado.
  -- Un cierre ya confirmado se recupera sin gastar otro permiso ni renovarlo.
  IF EXISTS(SELECT 1 FROM public.checkout_manuales WHERE id=v_id AND resultado IS NOT NULL) THEN
    RETURN public.confirmar_venta_manual(p_actor_auth_id,p_snapshot);
  END IF;
  PERFORM public.consumir_autorizacion_supervisor(p_actor_auth_id,p_autorizacion_id,'DESCUENTO',p_entrada);
  -- Consumo y efectos financieros comparten transacción: cualquier error revierte ambos.
  RETURN public.confirmar_venta_manual(p_actor_auth_id,p_snapshot);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_venta_manual_autorizada(uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_venta_manual_autorizada(uuid,jsonb,jsonb,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
