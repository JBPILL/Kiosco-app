-- Paso 27: snapshot comercial durable antes del cierre privado (paso 26).
-- No activa Point ni cambia los caminos de cobro hasta desplegar el backend.
BEGIN;
CREATE TABLE IF NOT EXISTS public.checkout_manual_entradas (
  id uuid PRIMARY KEY,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  usuario_id uuid NOT NULL REFERENCES public.usuarios(id),
  entrada jsonb NOT NULL,
  snapshot jsonb NOT NULL,
  autorizado_por_auth_id uuid NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.checkout_manual_entradas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_manual_entradas FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT ON public.checkout_manual_entradas TO service_role;
DROP POLICY IF EXISTS checkout_manual_entradas_servidor ON public.checkout_manual_entradas;
CREATE POLICY checkout_manual_entradas_servidor ON public.checkout_manual_entradas FOR SELECT TO service_role USING(true);

CREATE OR REPLACE FUNCTION public.preparar_checkout_manual(p_actor_auth_id uuid,p_entrada jsonb,p_snapshot jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE
  v_actor public.usuarios%ROWTYPE; v_id uuid; v_kid uuid; v_uid uuid; v_caja uuid;
  v_registro public.checkout_manual_entradas%ROWTYPE;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) OR p_actor_auth_id IS NULL THEN
    RAISE EXCEPTION 'Se requiere el servidor de cobro' USING ERRCODE='42501';
  END IF;
  IF p_entrada IS NULL OR p_snapshot IS NULL OR octet_length(p_entrada::text)>200000 OR octet_length(p_snapshot::text)>200000 THEN
    RAISE EXCEPTION 'Snapshot de checkout inválido';
  END IF;
  PERFORM public.checkout_objeto(p_entrada,ARRAY['version','checkoutId','kioscoId','usuarioId','sesionCajaId','fechaHora','clienteId','notas',
    'tipoAjuste','valorAjuste','totalEsperado','subtotalesEsperados','componentesEsperados','lineas','pagos']);
  PERFORM public.checkout_objeto(p_snapshot,ARRAY['version','id','kiosco_id','usuario_id','sesion_caja_id','fecha_hora','total','notas','cliente_id','detalles','pagos']);
  v_id:=public.checkout_uuid(p_snapshot->'id'); v_kid:=public.checkout_uuid(p_snapshot->'kiosco_id');
  v_uid:=public.checkout_uuid(p_snapshot->'usuario_id'); v_caja:=public.checkout_uuid(p_snapshot->'sesion_caja_id');
  IF p_entrada->'version' IS DISTINCT FROM '1'::jsonb OR p_snapshot->'version' IS DISTINCT FROM '1'::jsonb
    OR public.checkout_uuid(p_entrada->'checkoutId') IS DISTINCT FROM v_id OR public.checkout_uuid(p_entrada->'kioscoId') IS DISTINCT FROM v_kid
    OR public.checkout_uuid(p_entrada->'usuarioId') IS DISTINCT FROM v_uid OR public.checkout_uuid(p_entrada->'sesionCajaId') IS DISTINCT FROM v_caja
    OR p_entrada->'fechaHora' IS DISTINCT FROM p_snapshot->'fecha_hora' OR p_entrada->'clienteId' IS DISTINCT FROM p_snapshot->'cliente_id'
    OR p_entrada->'totalEsperado' IS DISTINCT FROM p_snapshot->'total' OR p_entrada->'notas' IS DISTINCT FROM p_snapshot->'notas' THEN
    RAISE EXCEPTION 'Identidad del snapshot inconsistente';
  END IF;
  BEGIN
    SELECT * INTO STRICT v_actor FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501'; END;
  IF v_actor.kiosco_id IS DISTINCT FROM v_kid OR NOT coalesce(v_actor.rol IN ('DUEÑO','CAJERO'),false)
    OR (v_actor.rol='CAJERO' AND v_actor.id IS DISTINCT FROM v_uid) THEN RAISE EXCEPTION 'Checkout no autorizado' USING ERRCODE='42501'; END IF;
  PERFORM 1 FROM public.kioscos WHERE id=v_kid AND estado_suscripcion='ACTIVO' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no habilitado'; END IF;
  PERFORM 1 FROM public.usuarios WHERE id=v_uid AND kiosco_id=v_kid AND activo AND rol IN ('DUEÑO','CAJERO') FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Usuario original no disponible'; END IF;
  PERFORM 1 FROM public.sesiones_caja WHERE id=v_caja AND kiosco_id=v_kid AND usuario_id=v_uid AND estado='ABIERTA'
    AND fecha_cierre IS NULL AND fecha_apertura<=(p_snapshot->>'fecha_hora')::timestamptz FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Caja original no disponible para preparar'; END IF;
  -- La primera cotización de esta entrada prevalece aun si otra sesión recotiza
  -- mientras se pierde la respuesta. Nunca reemplazar el precio ya congelado.
  INSERT INTO public.checkout_manual_entradas(id,kiosco_id,usuario_id,entrada,snapshot,autorizado_por_auth_id)
    VALUES(v_id,v_kid,v_uid,p_entrada,p_snapshot,p_actor_auth_id) ON CONFLICT(id) DO NOTHING;
  SELECT * INTO v_registro FROM public.checkout_manual_entradas WHERE id=v_id FOR UPDATE;
  IF v_registro.kiosco_id IS DISTINCT FROM v_kid OR v_registro.usuario_id IS DISTINCT FROM v_uid
    OR v_registro.entrada IS DISTINCT FROM p_entrada THEN RAISE EXCEPTION 'El identificador corresponde a otra entrada'; END IF;
  RETURN jsonb_build_object('entrada',v_registro.entrada,'snapshot',v_registro.snapshot);
END;
$$;
REVOKE ALL ON FUNCTION public.preparar_checkout_manual(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_checkout_manual(uuid,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
