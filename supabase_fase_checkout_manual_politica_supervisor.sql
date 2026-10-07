-- Requiere checkout manual y consumo transaccional del permiso de supervisor.
BEGIN;
ALTER TABLE public.checkout_manual_entradas ADD COLUMN IF NOT EXISTS requiere_supervisor boolean;

-- Sólo el servidor cotiza y persiste la decisión; nunca procede del navegador.
CREATE OR REPLACE FUNCTION public.preparar_checkout_manual(p_actor_auth_id uuid,p_entrada jsonb,p_snapshot jsonb,p_requiere_supervisor boolean)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid; v_existia boolean; v_resultado jsonb; v_requiere boolean;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) OR p_requiere_supervisor IS NULL THEN
    RAISE EXCEPTION 'Se requiere cotización del servidor' USING ERRCODE='42501';
  END IF;
  v_id:=public.checkout_uuid(p_entrada->'checkoutId');
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout-manual:'||v_id::text,0));
  SELECT EXISTS(SELECT 1 FROM public.checkout_manual_entradas WHERE id=v_id) INTO v_existia;
  v_resultado:=public.preparar_checkout_manual(p_actor_auth_id,p_entrada,p_snapshot);
  IF NOT v_existia THEN
    UPDATE public.checkout_manual_entradas SET requiere_supervisor=p_requiere_supervisor WHERE id=v_id;
  END IF;
  SELECT requiere_supervisor INTO v_requiere FROM public.checkout_manual_entradas WHERE id=v_id;
  RETURN v_resultado||jsonb_build_object('requiere_supervisor',v_requiere);
END;
$$;
REVOKE ALL ON FUNCTION public.preparar_checkout_manual(uuid,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preparar_checkout_manual(uuid,jsonb,jsonb,boolean) TO service_role;

-- Conservar la implementación financiera existente, quitando su acceso directo.
DO $$ BEGIN
  IF to_regprocedure('public.confirmar_venta_manual_interna_supervisor(uuid,jsonb)') IS NULL THEN
    ALTER FUNCTION public.confirmar_venta_manual(uuid,jsonb) RENAME TO confirmar_venta_manual_interna_supervisor;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.confirmar_venta_manual_interna_supervisor(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.confirmar_venta_manual(p_actor_auth_id uuid,p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid; v_preparado public.checkout_manual_entradas%ROWTYPE; v_actor public.usuarios%ROWTYPE;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere servidor de cobro' USING ERRCODE='42501'; END IF;
  v_id:=public.checkout_uuid(p_solicitud->'id');
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout-manual:'||v_id::text,0));
  SELECT * INTO v_preparado FROM public.checkout_manual_entradas WHERE id=v_id FOR SHARE;
  IF FOUND AND NOT EXISTS(SELECT 1 FROM public.checkout_manuales WHERE id=v_id AND resultado IS NOT NULL) THEN
    BEGIN
      SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
    EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501'; END;
    IF v_actor.rol='CAJERO' AND (
      v_preparado.requiere_supervisor IS TRUE
      OR (v_preparado.entrada->>'tipoAjuste'='DESCUENTO_PORCENTAJE' AND (v_preparado.entrada->>'valorAjuste')::numeric>15)
      OR (v_preparado.entrada->>'tipoAjuste'='DESCUENTO_FIJO' AND v_preparado.requiere_supervisor IS NULL)
    ) THEN RAISE EXCEPTION 'Se requiere autorización de supervisor' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN public.confirmar_venta_manual_interna_supervisor(p_actor_auth_id,p_solicitud);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_venta_manual(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_venta_manual(uuid,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.confirmar_venta_manual_autorizada(p_actor_auth_id uuid,p_entrada jsonb,p_snapshot jsonb,p_autorizacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid; v_preparado public.checkout_manual_entradas%ROWTYPE;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere servidor de cobro' USING ERRCODE='42501'; END IF;
  IF p_entrada IS NULL OR p_snapshot IS NULL OR octet_length(p_entrada::text)>200000 OR octet_length(p_snapshot::text)>200000 THEN RAISE EXCEPTION 'Solicitud inválida'; END IF;
  v_id:=public.checkout_uuid(p_entrada->'checkoutId');
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout-manual:'||v_id::text,0));
  SELECT * INTO v_preparado FROM public.checkout_manual_entradas WHERE id=v_id FOR SHARE;
  IF NOT FOUND OR v_preparado.entrada IS DISTINCT FROM p_entrada OR v_preparado.snapshot IS DISTINCT FROM p_snapshot THEN
    RAISE EXCEPTION 'La solicitud debe coincidir con la cotización original preparada';
  END IF;
  IF EXISTS(SELECT 1 FROM public.checkout_manuales WHERE id=v_id AND resultado IS NOT NULL) THEN
    RETURN public.confirmar_venta_manual_interna_supervisor(p_actor_auth_id,p_snapshot);
  END IF;
  PERFORM public.consumir_autorizacion_supervisor(p_actor_auth_id,p_autorizacion_id,'DESCUENTO',p_entrada);
  RETURN public.confirmar_venta_manual_interna_supervisor(p_actor_auth_id,p_snapshot);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_venta_manual_autorizada(uuid,jsonb,jsonb,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_venta_manual_autorizada(uuid,jsonb,jsonb,uuid) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
