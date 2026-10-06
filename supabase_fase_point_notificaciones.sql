-- Aplicar después de supabase_fase_point_intentos.sql.
-- Recepción privada y durable; no confirma pagos ni crea ventas.
BEGIN;
CREATE TABLE IF NOT EXISTS public.point_notificaciones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id text NOT NULL CHECK (application_id ~ '^[0-9]{1,100}$'),
  order_id text NOT NULL CHECK (order_id ~ '^ORD[A-Za-z0-9]{1,100}$'),
  request_id text NOT NULL CHECK (request_id = '' OR request_id ~ '^[A-Za-z0-9_-]{1,200}$'),
  firma_ts text NOT NULL CHECK (firma_ts ~ '^[0-9]{1,16}$'),
  intento_id uuid REFERENCES public.point_intentos(id),
  estado text NOT NULL DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','PROCESADA','CONCILIAR')),
  intentos_proceso integer NOT NULL DEFAULT 0 CHECK (intentos_proceso >= 0),
  fecha_recepcion timestamptz NOT NULL DEFAULT now(),
  fecha_proceso timestamptz,
  UNIQUE (application_id, order_id, request_id, firma_ts)
);
ALTER TABLE public.point_notificaciones ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS point_notificaciones_servidor ON public.point_notificaciones;
CREATE POLICY point_notificaciones_servidor ON public.point_notificaciones
  FOR ALL TO service_role USING (true) WITH CHECK (true);
REVOKE ALL ON public.point_notificaciones FROM PUBLIC,anon,authenticated;
GRANT SELECT,INSERT,UPDATE ON public.point_notificaciones TO service_role;
CREATE OR REPLACE FUNCTION public.registrar_notificacion_point(
  p_application_id text, p_order_id text, p_request_id text, p_firma_ts text
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE v_id uuid;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Esta operación requiere el servidor de pagos' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.point_notificaciones(application_id,order_id,request_id,firma_ts)
    VALUES(p_application_id,p_order_id,p_request_id,p_firma_ts)
    ON CONFLICT(application_id,order_id,request_id,firma_ts) DO NOTHING;
  SELECT id INTO v_id FROM public.point_notificaciones
    WHERE application_id=p_application_id AND order_id=p_order_id
      AND request_id=p_request_id AND firma_ts=p_firma_ts;
  RETURN v_id;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_notificacion_point(text,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.registrar_notificacion_point(text,text,text,text) TO service_role;
COMMIT;
