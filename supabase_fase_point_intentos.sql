-- Infraestructura de servidor para Point. No habilita cobros por sí sola.
-- Aplicar cuando se despliegue la integración completa de Point.
BEGIN;
CREATE TABLE IF NOT EXISTS public.point_intentos (
  id uuid PRIMARY KEY,
  kiosco_id uuid NOT NULL REFERENCES public.kioscos(id),
  checkout_id uuid NOT NULL,
  terminal_id text NOT NULL CHECK (length(terminal_id) BETWEEN 1 AND 200 AND terminal_id = btrim(terminal_id)),
  monto_centavos bigint NOT NULL CHECK (monto_centavos > 0 AND monto_centavos <= 9007199254740991),
  solicitud jsonb NOT NULL CHECK (jsonb_typeof(solicitud) = 'object'),
  estado text NOT NULL DEFAULT 'PREPARADO' CHECK (estado IN (
    'PREPARADO','PENDIENTE','CONCILIAR','CANCELACION_SOLICITADA',
    'PAGO_CONFIRMADO','VENTA_CONFIRMADA','CANCELADO','RECHAZADO'
  )),
  order_id text UNIQUE,
  payment_id text UNIQUE,
  venta_id uuid REFERENCES public.ventas(id),
  fecha_creacion timestamptz NOT NULL DEFAULT now(),
  fecha_actualizacion timestamptz NOT NULL DEFAULT now()
);
-- Un resultado incierto o pago confirmado nunca habilita un segundo intento.
CREATE UNIQUE INDEX IF NOT EXISTS point_checkout_activo
  ON public.point_intentos(kiosco_id, checkout_id)
  WHERE estado NOT IN ('CANCELADO','RECHAZADO');
ALTER TABLE public.point_intentos ENABLE ROW LEVEL SECURITY;
-- No inferir la cuenta de intentos antiguos desde la configuración actual.
ALTER TABLE public.point_intentos
  ADD COLUMN IF NOT EXISTS application_id text CHECK (application_id ~ '^[0-9]{1,100}$'),
  ADD COLUMN IF NOT EXISTS account_id text CHECK (account_id ~ '^[0-9]{1,100}$'),
  ADD COLUMN IF NOT EXISTS modo text CHECK (modo IN ('sandbox','production'));
DROP POLICY IF EXISTS point_intentos_servidor ON public.point_intentos;
CREATE POLICY point_intentos_servidor ON public.point_intentos
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.point_intentos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.point_intentos TO service_role;

DROP FUNCTION IF EXISTS public.preparar_intento_point(uuid,uuid,uuid,text,bigint,jsonb);
CREATE OR REPLACE FUNCTION public.preparar_intento_point(
  p_id uuid, p_kiosco_id uuid, p_checkout_id uuid, p_terminal_id text,
  p_monto_centavos bigint, p_solicitud jsonb, p_application_id text, p_account_id text, p_modo text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_intento public.point_intentos%ROWTYPE;
BEGIN
  IF NOT coalesce(auth.role() = 'service_role', false) THEN
    RAISE EXCEPTION 'Esta operación requiere el servidor de pagos' USING ERRCODE = '42501';
  END IF;
  IF p_id IS NULL OR p_kiosco_id IS NULL OR p_checkout_id IS NULL THEN
    RAISE EXCEPTION 'Falta la identidad del intento' USING ERRCODE = '22023';
  END IF;
  IF p_application_id IS NULL OR p_application_id !~ '^[0-9]{1,100}$'
    OR p_account_id IS NULL OR p_account_id !~ '^[0-9]{1,100}$'
    OR p_modo IS NULL OR p_modo NOT IN ('sandbox','production') THEN
    RAISE EXCEPTION 'Falta la identidad de la cuenta Point' USING ERRCODE='22023';
  END IF;
  INSERT INTO public.point_intentos(id,kiosco_id,checkout_id,terminal_id,monto_centavos,solicitud,application_id,account_id,modo)
    VALUES(p_id,p_kiosco_id,p_checkout_id,p_terminal_id,p_monto_centavos,p_solicitud,p_application_id,p_account_id,p_modo)
    ON CONFLICT(id) DO NOTHING;
  SELECT * INTO v_intento FROM public.point_intentos WHERE id=p_id FOR UPDATE;
  IF v_intento.kiosco_id IS DISTINCT FROM p_kiosco_id
    OR v_intento.checkout_id IS DISTINCT FROM p_checkout_id
    OR v_intento.terminal_id IS DISTINCT FROM p_terminal_id
    OR v_intento.monto_centavos IS DISTINCT FROM p_monto_centavos
    OR v_intento.solicitud IS DISTINCT FROM p_solicitud
    OR v_intento.application_id IS DISTINCT FROM p_application_id
    OR v_intento.account_id IS DISTINCT FROM p_account_id
    OR v_intento.modo IS DISTINCT FROM p_modo THEN
    RAISE EXCEPTION 'El intento ya corresponde a otra solicitud' USING ERRCODE = '22023';
  END IF;
  RETURN to_jsonb(v_intento);
END;
$$;
REVOKE ALL ON FUNCTION public.preparar_intento_point(uuid,uuid,uuid,text,bigint,jsonb,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.preparar_intento_point(uuid,uuid,uuid,text,bigint,jsonb,text,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.proteger_identidad_intento_point()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp
AS $$
BEGIN
  IF TG_OP='INSERT' THEN
    IF NEW.application_id IS NULL OR NEW.account_id IS NULL OR NEW.modo IS NULL THEN
      RAISE EXCEPTION 'Falta la identidad de la cuenta Point' USING ERRCODE='22023';
    END IF;
    RETURN NEW;
  END IF;
  IF ROW(NEW.id,NEW.kiosco_id,NEW.checkout_id,NEW.terminal_id,NEW.monto_centavos,
      NEW.solicitud,NEW.application_id,NEW.account_id,NEW.modo)
    IS DISTINCT FROM ROW(OLD.id,OLD.kiosco_id,OLD.checkout_id,OLD.terminal_id,OLD.monto_centavos,
      OLD.solicitud,OLD.application_id,OLD.account_id,OLD.modo)
    OR (OLD.order_id IS NOT NULL AND NEW.order_id IS DISTINCT FROM OLD.order_id)
    OR (OLD.payment_id IS NOT NULL AND NEW.payment_id IS DISTINCT FROM OLD.payment_id) THEN
    RAISE EXCEPTION 'No se puede cambiar la identidad del intento Point' USING ERRCODE='22023';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS proteger_identidad_point ON public.point_intentos;
CREATE TRIGGER proteger_identidad_point BEFORE INSERT OR UPDATE ON public.point_intentos
  FOR EACH ROW EXECUTE FUNCTION public.proteger_identidad_intento_point();
COMMIT;
