-- PR03 incremental, sólo homologación. Sin worker conectado ni envío de comprobantes.
-- Requiere 001_fiscal_journal.sql. Instalación remota sujeta a autorización.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_series_homologacion (
  cuit_emisor text NOT NULL CHECK(cuit_emisor ~ '^[0-9]{11}$'),
  punto_venta integer NOT NULL CHECK(punto_venta BETWEEN 1 AND 99999),
  tipo_comprobante integer NOT NULL CHECK(tipo_comprobante IN (1,6,11)),
  ultimo_observado integer NOT NULL CHECK(ultimo_observado BETWEEN 0 AND 99999998),
  observado_en timestamptz NOT NULL,
  PRIMARY KEY(cuit_emisor,punto_venta,tipo_comprobante)
);
CREATE TABLE IF NOT EXISTS public.fiscal_reservas_homologacion (
  operacion_id uuid PRIMARY KEY REFERENCES public.fiscal_operaciones_homologacion(id),
  cuit_emisor text NOT NULL,
  punto_venta integer NOT NULL,
  tipo_comprobante integer NOT NULL,
  numero integer NOT NULL CHECK(numero BETWEEN 1 AND 99999999),
  estado text NOT NULL DEFAULT 'RESERVADA' CHECK(estado IN ('RESERVADA','ENVIO_INCIERTO')),
  intento_id uuid UNIQUE,
  creado_en timestamptz NOT NULL DEFAULT now(),
  intento_en timestamptz,
  FOREIGN KEY(cuit_emisor,punto_venta,tipo_comprobante)
    REFERENCES public.fiscal_series_homologacion(cuit_emisor,punto_venta,tipo_comprobante),
  UNIQUE(cuit_emisor,punto_venta,tipo_comprobante),
  CHECK((estado='RESERVADA' AND intento_id IS NULL AND intento_en IS NULL)
    OR (estado='ENVIO_INCIERTO' AND intento_id IS NOT NULL AND intento_en IS NOT NULL))
);
-- Una única reserva pendiente por serie global, incluso compartida por comercios.
-- No hay liberación ni avance automático ante timeout o vencimiento de trabajador.
ALTER TABLE public.fiscal_series_homologacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_reservas_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_series_homologacion,public.fiscal_reservas_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$
DECLARE tabla text; columnas text; rol text;
BEGIN
  FOREACH tabla IN ARRAY ARRAY['fiscal_series_homologacion','fiscal_reservas_homologacion'] LOOP
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
      WHERE attrelid=('public.'||tabla)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s)
      ON TABLE public.%I FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas,tabla);
    FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE,DELETE')
        OR has_any_column_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE') THEN
        RAISE EXCEPTION 'Privilegios heredados en reserva fiscal: revisar membresías.';
      END IF;
    END LOOP;
  END LOOP;
END;
$$;

-- Helper privado: revalida y serializa contra anulación/cambio comercial.
CREATE OR REPLACE FUNCTION public.fiscal_operacion_vigente_homologacion(p_operacion_id uuid)
RETURNS public.fiscal_operaciones_homologacion LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.fiscal_operaciones_homologacion%ROWTYPE; perfil public.usuarios%ROWTYPE;
  venta public.ventas%ROWTYPE; detalles jsonb; snapshot jsonb;
BEGIN
  SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Operación fiscal no disponible.' USING ERRCODE='22023'; END IF;
  SELECT * INTO perfil FROM public.usuarios WHERE id=op.usuario_id AND activo FOR SHARE;
  IF NOT FOUND OR perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin
    OR perfil.kiosco_id IS DISTINCT FROM op.kiosco_id THEN
    RAISE EXCEPTION 'El actor fiscal ya no está habilitado.' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.kioscos WHERE id=op.kiosco_id AND estado_suscripcion='ACTIVO' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Comercio no habilitado.' USING ERRCODE='42501'; END IF;
  SELECT * INTO venta FROM public.ventas WHERE id=op.venta_id AND kiosco_id=op.kiosco_id FOR UPDATE;
  IF NOT FOUND OR venta.estado IS DISTINCT FROM 'COMPLETADA' THEN
    RAISE EXCEPTION 'Venta fiscal no disponible.' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.id),'[]'::jsonb) INTO detalles
    FROM public.detalles_venta d WHERE d.venta_id=venta.id;
  snapshot:=jsonb_build_object('version',1,'venta_id',venta.id,'kiosco_id',venta.kiosco_id,
    'total',venta.total,'fecha_hora',to_char(venta.fecha_hora AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"'),'detalles',detalles);
  SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_operacion_id FOR UPDATE;
  IF op.venta_snapshot IS DISTINCT FROM snapshot THEN
    RAISE EXCEPTION 'Cambió el contenido de la venta fiscal.' USING ERRCODE='22023';
  END IF;
  RETURN op;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_operacion_vigente_homologacion(uuid) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.reservar_numero_fiscal_homologacion(
  p_operacion_id uuid,p_cuit_emisor text,p_punto_venta integer,p_tipo_comprobante integer,
  p_ultimo_autorizado integer,p_consultado_en timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.fiscal_operaciones_homologacion%ROWTYPE; serie public.fiscal_series_homologacion%ROWTYPE;
  reserva public.fiscal_reservas_homologacion%ROWTYPE;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Se requiere trabajador fiscal privado.' USING ERRCODE='42501';
  END IF;
  IF p_operacion_id IS NULL OR p_ultimo_autorizado IS NULL OR p_ultimo_autorizado NOT BETWEEN 0 AND 99999998
    OR p_consultado_en IS NULL OR p_consultado_en<clock_timestamp()-interval '2 minutes'
    OR p_consultado_en>clock_timestamp()+interval '30 seconds' THEN
    RAISE EXCEPTION 'Observación fiscal inválida o vencida.' USING ERRCODE='22023';
  END IF;
  op:=public.fiscal_operacion_vigente_homologacion(p_operacion_id);
  IF op.contexto->>'cuit_emisor' IS DISTINCT FROM p_cuit_emisor
    OR (op.contexto->>'punto_venta')::numeric::integer IS DISTINCT FROM p_punto_venta
    OR (op.contexto->>'tipo_comprobante')::numeric::integer IS DISTINCT FROM p_tipo_comprobante THEN
    RAISE EXCEPTION 'La observación no corresponde a la serie fiscal.' USING ERRCODE='22023';
  END IF;
  -- El llamador privado deberá validar la respuesta real de FECompUltimoAutorizado.
  INSERT INTO public.fiscal_series_homologacion(cuit_emisor,punto_venta,tipo_comprobante,ultimo_observado,observado_en)
    VALUES(p_cuit_emisor,p_punto_venta,p_tipo_comprobante,p_ultimo_autorizado,p_consultado_en) ON CONFLICT DO NOTHING;
  SELECT * INTO serie FROM public.fiscal_series_homologacion WHERE cuit_emisor=p_cuit_emisor
    AND punto_venta=p_punto_venta AND tipo_comprobante=p_tipo_comprobante FOR UPDATE;
  IF serie.ultimo_observado IS DISTINCT FROM p_ultimo_autorizado THEN
    RAISE EXCEPTION 'La serie cambió: requiere conciliación fiscal.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE cuit_emisor=p_cuit_emisor
    AND punto_venta=p_punto_venta AND tipo_comprobante=p_tipo_comprobante FOR UPDATE;
  IF FOUND AND reserva.operacion_id IS DISTINCT FROM p_operacion_id THEN
    RAISE EXCEPTION 'La serie tiene una operación pendiente de conciliación.' USING ERRCODE='55000';
  END IF;
  IF NOT FOUND THEN
    INSERT INTO public.fiscal_reservas_homologacion(operacion_id,cuit_emisor,punto_venta,tipo_comprobante,numero)
      VALUES(p_operacion_id,p_cuit_emisor,p_punto_venta,p_tipo_comprobante,serie.ultimo_observado+1)
      RETURNING * INTO reserva;
  END IF;
  IF reserva.operacion_id IS DISTINCT FROM p_operacion_id OR reserva.numero IS DISTINCT FROM serie.ultimo_observado+1
    OR reserva.cuit_emisor IS DISTINCT FROM p_cuit_emisor OR reserva.punto_venta IS DISTINCT FROM p_punto_venta
    OR reserva.tipo_comprobante IS DISTINCT FROM p_tipo_comprobante THEN
    RAISE EXCEPTION 'No se confirmó la reserva fiscal.' USING ERRCODE='40001';
  END IF;
  RETURN jsonb_build_object('operacion_id',reserva.operacion_id,'numero',reserva.numero,
    'estado',reserva.estado,'entorno','HOMOLOGACION','emision_habilitada',false);
END;
$$;
REVOKE ALL ON FUNCTION public.reservar_numero_fiscal_homologacion(uuid,text,integer,integer,integer,timestamptz)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.reservar_numero_fiscal_homologacion(uuid,text,integer,integer,integer,timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.registrar_intento_fiscal_homologacion(p_operacion_id uuid,p_intento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE reserva public.fiscal_reservas_homologacion%ROWTYPE; nuevo boolean:=false;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN
    RAISE EXCEPTION 'Se requiere trabajador fiscal privado.' USING ERRCODE='42501';
  END IF;
  IF p_intento_id IS NULL THEN RAISE EXCEPTION 'Identidad de intento inválida.' USING ERRCODE='22023'; END IF;
  PERFORM public.fiscal_operacion_vigente_homologacion(p_operacion_id);
  SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Falta reserva fiscal.' USING ERRCODE='22023'; END IF;
  IF reserva.estado='RESERVADA' THEN
    UPDATE public.fiscal_reservas_homologacion SET estado='ENVIO_INCIERTO',intento_id=p_intento_id,intento_en=clock_timestamp()
      WHERE operacion_id=p_operacion_id RETURNING * INTO reserva;
    nuevo:=true;
  ELSIF reserva.intento_id IS DISTINCT FROM p_intento_id THEN
    RAISE EXCEPTION 'Otro intento requiere conciliación previa.' USING ERRCODE='55000';
  END IF;
  IF reserva.operacion_id IS DISTINCT FROM p_operacion_id OR reserva.estado IS DISTINCT FROM 'ENVIO_INCIERTO'
    OR reserva.intento_id IS DISTINCT FROM p_intento_id OR reserva.intento_en IS NULL THEN
    RAISE EXCEPTION 'No se confirmó el intento fiscal.' USING ERRCODE='40001';
  END IF;
  -- ACK perdido: repetir no concede un segundo envío. No hay worker/red habilitados.
  RETURN jsonb_build_object('operacion_id',reserva.operacion_id,'numero',reserva.numero,'estado',reserva.estado,
    'nuevo_intento',nuevo,'requiere_conciliacion',NOT nuevo,'emision_habilitada',false);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_intento_fiscal_homologacion(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_intento_fiscal_homologacion(uuid,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.fiscal_proteger_venta_reservada() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
BEGIN
  IF (NEW.id,NEW.kiosco_id,NEW.total,NEW.estado,NEW.fecha_hora)
    IS DISTINCT FROM (OLD.id,OLD.kiosco_id,OLD.total,OLD.estado,OLD.fecha_hora)
    AND EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion r
      JOIN public.fiscal_operaciones_homologacion op ON op.id=r.operacion_id WHERE op.venta_id=OLD.id) THEN
    RAISE EXCEPTION 'La venta tiene una reserva fiscal: requiere conciliación antes de modificar o anular.' USING ERRCODE='55000';
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_proteger_venta_reservada() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_venta_reservada ON public.ventas;
CREATE TRIGGER fiscal_venta_reservada BEFORE UPDATE ON public.ventas FOR EACH ROW EXECUTE FUNCTION public.fiscal_proteger_venta_reservada();
CREATE OR REPLACE FUNCTION public.fiscal_proteger_detalles_reservados() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ids uuid[];
BEGIN
  ids:=CASE TG_OP WHEN 'INSERT' THEN ARRAY[NEW.venta_id] WHEN 'DELETE' THEN ARRAY[OLD.venta_id]
    ELSE ARRAY[OLD.venta_id,NEW.venta_id] END;
  PERFORM 1 FROM public.ventas WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
  IF EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion r
    JOIN public.fiscal_operaciones_homologacion op ON op.id=r.operacion_id WHERE op.venta_id=ANY(ids)) THEN
    RAISE EXCEPTION 'El detalle tiene una reserva fiscal: requiere conciliación.' USING ERRCODE='55000';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_proteger_detalles_reservados() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_detalles_reservados ON public.detalles_venta;
CREATE TRIGGER fiscal_detalles_reservados BEFORE INSERT OR UPDATE OR DELETE ON public.detalles_venta
  FOR EACH ROW EXECUTE FUNCTION public.fiscal_proteger_detalles_reservados();
COMMIT;
