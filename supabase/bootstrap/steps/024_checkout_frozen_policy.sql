-- Paso 37. Requiere pasos 33 y 36. Aplicar antes de desplegar checkout-manual nuevo.
BEGIN;
ALTER TABLE public.checkout_manual_entradas ADD COLUMN IF NOT EXISTS politica_umbral numeric(5,2);
ALTER TABLE public.checkout_manual_entradas ADD COLUMN IF NOT EXISTS politica_revision bigint;

CREATE OR REPLACE FUNCTION public.preparar_checkout_manual(
  p_actor_auth_id uuid,p_entrada jsonb,p_snapshot jsonb,p_requiere_supervisor boolean,
  p_umbral_porcentaje numeric,p_politica_revision bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE v_id uuid; v_kiosco uuid; v_existia boolean; v_umbral numeric; v_revision bigint; v_resultado jsonb;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Se requiere servidor de cobro' USING ERRCODE='42501';
  END IF;
  v_id:=public.checkout_uuid(p_entrada->'checkoutId');
  v_kiosco:=public.checkout_uuid(p_entrada->'kioscoId');
  PERFORM pg_advisory_xact_lock(hashtextextended('checkout-manual:'||v_id::text,0));
  SELECT EXISTS(SELECT 1 FROM public.checkout_manual_entradas WHERE id=v_id) INTO v_existia;
  IF NOT v_existia THEN
    PERFORM pg_advisory_xact_lock(hashtextextended('supervisor-politica:'||v_kiosco::text,0));
    SELECT umbral_descuento,revision INTO v_umbral,v_revision FROM public.supervisor_politicas WHERE kiosco_id=v_kiosco FOR SHARE;
    v_umbral:=coalesce(v_umbral,15); v_revision:=coalesce(v_revision,0);
    IF p_umbral_porcentaje IS DISTINCT FROM v_umbral OR p_politica_revision IS DISTINCT FROM v_revision THEN
      RAISE EXCEPTION 'La política cambió; repetí la cotización';
    END IF;
    IF p_requiere_supervisor IS NULL THEN RAISE EXCEPTION 'Decisión de supervisor requerida'; END IF;
    IF p_entrada->>'tipoAjuste'='DESCUENTO_PORCENTAJE'
      AND p_requiere_supervisor IS DISTINCT FROM ((p_entrada->>'valorAjuste')::numeric>v_umbral) THEN
      RAISE EXCEPTION 'Decisión de supervisor inconsistente';
    END IF;
  END IF;
  -- La implementación anterior comprueba actor, comercio, entrada y snapshot.
  v_resultado:=public.preparar_checkout_manual(p_actor_auth_id,p_entrada,p_snapshot,p_requiere_supervisor);
  IF NOT v_existia THEN
    UPDATE public.checkout_manual_entradas SET politica_umbral=v_umbral,politica_revision=v_revision WHERE id=v_id;
  END IF;
  SELECT politica_umbral,politica_revision INTO v_umbral,v_revision FROM public.checkout_manual_entradas WHERE id=v_id;
  RETURN v_resultado||jsonb_build_object('politica_umbral',v_umbral,'politica_revision',v_revision);
END;
$$;
REVOKE ALL ON FUNCTION public.preparar_checkout_manual(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preparar_checkout_manual(uuid,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.preparar_checkout_manual(uuid,jsonb,jsonb,boolean,numeric,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.preparar_checkout_manual(uuid,jsonb,jsonb,boolean,numeric,bigint) TO service_role;
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
      OR (v_preparado.entrada->>'tipoAjuste'='DESCUENTO_PORCENTAJE' AND (v_preparado.entrada->>'valorAjuste')::numeric>coalesce(v_preparado.politica_umbral,15))
      OR (v_preparado.entrada->>'tipoAjuste'='DESCUENTO_FIJO' AND v_preparado.requiere_supervisor IS NULL)
    ) THEN RAISE EXCEPTION 'Se requiere autorización de supervisor' USING ERRCODE='42501'; END IF;
  END IF;
  RETURN public.confirmar_venta_manual_interna_supervisor(p_actor_auth_id,p_solicitud);
END;
$$;
REVOKE ALL ON FUNCTION public.confirmar_venta_manual(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_venta_manual(uuid,jsonb) TO service_role;


NOTIFY pgrst,'reload schema';
COMMIT;
