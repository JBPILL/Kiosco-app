-- Paso 53. Instalar antes de desplegar checkout-manual actualizado.
BEGIN;
CREATE TABLE IF NOT EXISTS public.checkout_recuperaciones (
  venta_id uuid NOT NULL REFERENCES public.ventas(id),
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  actor_auth_id uuid NOT NULL,
  actor_usuario_id uuid NOT NULL,
  vendedor_original_id uuid NOT NULL,
  cierre_preexistente boolean NOT NULL,
  confirmado_en timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (venta_id,actor_auth_id)
);
ALTER TABLE public.checkout_recuperaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.checkout_recuperaciones FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text;
BEGIN
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas
  FROM pg_attribute WHERE attrelid='public.checkout_recuperaciones'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s)
    ON public.checkout_recuperaciones FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(rol,'public.checkout_recuperaciones','INSERT,UPDATE,DELETE')
      OR has_any_column_privilege(rol,'public.checkout_recuperaciones','INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Persisten permisos heredados de escritura en recuperación para %',rol;
    END IF;
  END LOOP;
END $$;
GRANT SELECT ON public.checkout_recuperaciones TO authenticated;
DROP POLICY IF EXISTS checkout_recuperacion_dueno ON public.checkout_recuperaciones;
CREATE POLICY checkout_recuperacion_dueno ON public.checkout_recuperaciones FOR SELECT TO authenticated
  USING(kiosco_id=public.auth_user_kiosco_id() AND public.auth_es_dueno_o_superadmin());

CREATE OR REPLACE FUNCTION public.confirmar_checkout_recuperado(p_actor_auth_id uuid,p_solicitud jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE actor public.usuarios%ROWTYPE; entrada public.checkout_manual_entradas%ROWTYPE;
  resultado jsonb; previo boolean;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Se requiere servidor de cobro' USING ERRCODE='42501';
  END IF;
  BEGIN
    SELECT * INTO STRICT actor FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
  EXCEPTION WHEN NO_DATA_FOUND OR TOO_MANY_ROWS THEN
    RAISE EXCEPTION 'Perfil no disponible' USING ERRCODE='42501';
  END;
  IF actor.rol IS DISTINCT FROM 'DUEÑO' THEN RAISE EXCEPTION 'Solo el dueño puede recuperar' USING ERRCODE='42501'; END IF;
  SELECT * INTO entrada FROM public.checkout_manual_entradas
    WHERE id=public.checkout_uuid(p_solicitud->'id') AND kiosco_id=actor.kiosco_id FOR UPDATE;
  IF NOT FOUND OR entrada.snapshot IS DISTINCT FROM p_solicitud
    OR public.checkout_uuid(p_solicitud->'usuario_id')=actor.id THEN
    RAISE EXCEPTION 'Se requiere preparación original de otro operador';
  END IF;
  SELECT EXISTS(SELECT 1 FROM public.checkout_manuales c WHERE c.id=entrada.id AND c.resultado IS NOT NULL) INTO previo;
  resultado:=public.confirmar_venta_manual(p_actor_auth_id,p_solicitud);
  INSERT INTO public.checkout_recuperaciones(venta_id,kiosco_id,actor_auth_id,actor_usuario_id,vendedor_original_id,cierre_preexistente)
    VALUES(entrada.id,actor.kiosco_id,p_actor_auth_id,actor.id,public.checkout_uuid(p_solicitud->'usuario_id'),previo)
    ON CONFLICT(venta_id,actor_auth_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.checkout_recuperaciones WHERE venta_id=entrada.id
    AND kiosco_id=actor.kiosco_id AND actor_auth_id=p_actor_auth_id AND actor_usuario_id=actor.id
    AND vendedor_original_id=public.checkout_uuid(p_solicitud->'usuario_id')) THEN
    RAISE EXCEPTION 'No se confirmó la auditoría de recuperación';
  END IF;
  RETURN resultado;
END $$;
REVOKE ALL ON FUNCTION public.confirmar_checkout_recuperado(uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_checkout_recuperado(uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
