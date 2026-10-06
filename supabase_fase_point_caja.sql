-- Aplicar después de supabase_fase_point_intentos.sql. No habilita cobros.
BEGIN;
CREATE OR REPLACE FUNCTION public.validar_caja_nuevo_intento_point()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_caja uuid; v_usuario uuid;
BEGIN
  -- El RPC compara la solicitud original en los reintentos. No reasignar caja.
  IF EXISTS(SELECT 1 FROM public.point_intentos WHERE id=NEW.id) THEN RETURN NEW; END IF;
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Se requiere el servidor de pagos' USING ERRCODE='42501';
  END IF;
  IF NEW.solicitud->>'version' IS DISTINCT FROM '2'
    OR coalesce(NEW.solicitud->>'sesionCajaId','') !~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$'
    OR coalesce(NEW.solicitud->>'usuarioId','') !~ '^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Falta la caja original del intento Point' USING ERRCODE='22023';
  END IF;
  v_caja := (NEW.solicitud->>'sesionCajaId')::uuid;
  v_usuario := (NEW.solicitud->>'usuarioId')::uuid;
  PERFORM 1 FROM public.sesiones_caja
    WHERE id=v_caja AND kiosco_id=NEW.kiosco_id AND usuario_id=v_usuario AND estado='ABIERTA'
    FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'La caja original no está abierta para este usuario y comercio' USING ERRCODE='22023'; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.validar_caja_nuevo_intento_point() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS validar_caja_point ON public.point_intentos;
CREATE TRIGGER validar_caja_point BEFORE INSERT ON public.point_intentos
  FOR EACH ROW EXECUTE FUNCTION public.validar_caja_nuevo_intento_point();
COMMIT;
