-- PR03: cierre durable de conciliación, sólo homologación. Requiere 001–003.
-- No autentica respuestas ARCA: sólo el trabajador privado, tras comparación íntegra,
-- puede invocar la RPC. No instala worker ni habilita emisión.
BEGIN;
DO $$ DECLARE c record; BEGIN
  FOR c IN SELECT conname FROM pg_constraint
    WHERE conrelid='public.fiscal_reservas_homologacion'::regclass
      AND ((contype='u' AND pg_get_constraintdef(oid)='UNIQUE (cuit_emisor, punto_venta, tipo_comprobante)')
      OR (contype='c' AND conname<>'fiscal_reserva_cuerpo_requerido' AND pg_get_constraintdef(oid) LIKE '%estado%')) LOOP
    EXECUTE format('ALTER TABLE public.fiscal_reservas_homologacion DROP CONSTRAINT %I',c.conname);
  END LOOP;
END $$;
ALTER TABLE public.fiscal_reservas_homologacion ADD CONSTRAINT fiscal_reserva_estado_final
  CHECK(estado IN ('RESERVADA','ENVIO_INCIERTO','AUTORIZADA'));
ALTER TABLE public.fiscal_reservas_homologacion ADD CONSTRAINT fiscal_reserva_intento_final
  CHECK((estado='RESERVADA' AND intento_id IS NULL AND intento_en IS NULL)
    OR (estado IN ('ENVIO_INCIERTO','AUTORIZADA') AND intento_id IS NOT NULL AND intento_en IS NOT NULL));
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_reserva_pendiente_serie ON public.fiscal_reservas_homologacion(cuit_emisor,punto_venta,tipo_comprobante)
  WHERE estado IN ('RESERVADA','ENVIO_INCIERTO');
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_reserva_numero_historico ON public.fiscal_reservas_homologacion(cuit_emisor,punto_venta,tipo_comprobante,numero);
ALTER TABLE public.fiscal_series_homologacion DROP CONSTRAINT IF EXISTS fiscal_series_homologacion_ultimo_observado_check;
ALTER TABLE public.fiscal_series_homologacion ADD CONSTRAINT fiscal_series_homologacion_ultimo_observado_check
  CHECK(ultimo_observado BETWEEN 0 AND 99999999);
CREATE TABLE IF NOT EXISTS public.fiscal_autorizaciones_homologacion (
  operacion_id uuid PRIMARY KEY REFERENCES public.fiscal_reservas_homologacion(operacion_id),
  intento_id uuid NOT NULL,
  solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
  cae text NOT NULL CHECK(cae ~ '^[0-9]{14}$' AND cae<>'00000000000000'),
  vencimiento text NOT NULL CHECK(vencimiento ~ '^[0-9]{8}$'),
  procesado_en text,
  resultado jsonb NOT NULL CHECK(jsonb_typeof(resultado)='object'),
  confirmado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE IF NOT EXISTS public.fiscal_reconciliaciones_homologacion (
  id uuid PRIMARY KEY,
  operacion_id uuid NOT NULL REFERENCES public.fiscal_reservas_homologacion(operacion_id),
  intento_id uuid NOT NULL,
  solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
  revision integer NOT NULL CHECK(revision IN (1,2)),
  decision jsonb NOT NULL CHECK(jsonb_typeof(decision)='object'),
  resultado jsonb NOT NULL CHECK(jsonb_typeof(resultado)='object'),
  consultado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.fiscal_autorizaciones_homologacion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_reconciliaciones_homologacion ENABLE ROW LEVEL SECURITY;
DO $$ DECLARE tabla text; columnas text; rol text; BEGIN
  FOREACH tabla IN ARRAY ARRAY['fiscal_autorizaciones_homologacion','fiscal_reconciliaciones_homologacion'] LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tabla);
    SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
      WHERE attrelid=('public.'||tabla)::regclass AND attnum>0 AND NOT attisdropped;
    EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas,tabla);
    FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
      IF has_table_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE,DELETE')
        OR has_any_column_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE') THEN
        RAISE EXCEPTION 'Privilegios heredados en conciliación fiscal.';
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.registrar_reconciliacion_fiscal_homologacion(
  p_id uuid,p_operacion_id uuid,p_intento_id uuid,p_sha text,p_revision integer,p_decision jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.fiscal_operaciones_homologacion%ROWTYPE; reserva public.fiscal_reservas_homologacion%ROWTYPE;
  solicitud public.fiscal_solicitudes_homologacion%ROWTYPE; autorizacion public.fiscal_autorizaciones_homologacion%ROWTYPE;
  anterior public.fiscal_reconciliaciones_homologacion%ROWTYPE; ack jsonb; guardado jsonb;
  ultimo integer; revision_final integer; estado_final text; campos text[]; k text;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere trabajador fiscal privado.' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL OR p_intento_id IS NULL OR p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$'
    OR p_revision IS NULL OR p_revision NOT IN (1,2) OR jsonb_typeof(p_decision) IS DISTINCT FROM 'object'
    OR p_decision->'puedeReenviar' IS DISTINCT FROM 'false'::jsonb THEN
    RAISE EXCEPTION 'Identidad o decisión fiscal inválida.' USING ERRCODE='22023'; END IF;
  op:=public.fiscal_operacion_vigente_homologacion(p_operacion_id);
  PERFORM 1 FROM public.fiscal_series_homologacion WHERE cuit_emisor=op.contexto->>'cuit_emisor'
    AND punto_venta=(op.contexto->>'punto_venta')::integer AND tipo_comprobante=(op.contexto->>'tipo_comprobante')::integer FOR UPDATE;
  SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF reserva.operacion_id IS NULL OR solicitud.operacion_id IS NULL
    OR reserva.estado NOT IN ('ENVIO_INCIERTO','AUTORIZADA') OR reserva.intento_id IS DISTINCT FROM p_intento_id
    OR reserva.solicitud_sha256 IS DISTINCT FROM p_sha OR solicitud.solicitud_sha256 IS DISTINCT FROM p_sha THEN
    RAISE EXCEPTION 'La conciliación no corresponde al intento durable.' USING ERRCODE='22023'; END IF;
  SELECT * INTO anterior FROM public.fiscal_reconciliaciones_homologacion WHERE id=p_id FOR UPDATE;
  IF FOUND THEN
    IF anterior.operacion_id IS DISTINCT FROM p_operacion_id OR anterior.intento_id IS DISTINCT FROM p_intento_id
      OR anterior.solicitud_sha256 IS DISTINCT FROM p_sha OR anterior.revision IS DISTINCT FROM p_revision
      OR anterior.decision IS DISTINCT FROM p_decision THEN
      RAISE EXCEPTION 'Identidad de conciliación reutilizada.' USING ERRCODE='22023'; END IF;
    RETURN anterior.resultado;
  END IF;
  IF p_decision->>'estado'='CONCILIAR' THEN
    campos:=ARRAY['estado','codigo','puedeReenviar'];
    IF p_decision->>'codigo' IS NULL OR p_decision->>'codigo' NOT IN
      ('SOLICITUD_INVALIDA','RESPUESTA_INVALIDA','CONSULTA_DISTINTA','DATOS_DISTINTOS','SIN_CONFIRMACION') THEN
      RAISE EXCEPTION 'Código de conciliación inválido.' USING ERRCODE='22023'; END IF;
  ELSIF p_decision->>'estado'='AUTORIZACION_COINCIDENTE' THEN
    campos:=ARRAY['estado','cae','vencimiento','procesadoEn','solicitudSha256','puedeReenviar'];
    IF jsonb_typeof(p_decision->'cae') IS DISTINCT FROM 'string' OR p_decision->>'cae' !~ '^[0-9]{14}$'
      OR p_decision->>'cae'='00000000000000' OR p_decision->>'solicitudSha256' IS DISTINCT FROM p_sha THEN
      RAISE EXCEPTION 'Autorización fiscal inválida.' USING ERRCODE='22023'; END IF;
    BEGIN
      IF jsonb_typeof(p_decision->'vencimiento') IS DISTINCT FROM 'string' OR p_decision->>'vencimiento' !~ '^[0-9]{8}$'
        OR to_char(to_date(p_decision->>'vencimiento','YYYYMMDD'),'YYYYMMDD') IS DISTINCT FROM p_decision->>'vencimiento'
        OR p_decision->>'vencimiento'<solicitud.cuerpo->>'fecha' THEN RAISE EXCEPTION 'Vencimiento inválido.'; END IF;
      IF p_decision->'procesadoEn' IS DISTINCT FROM 'null'::jsonb THEN
        k:=p_decision->>'procesadoEn';
        IF jsonb_typeof(p_decision->'procesadoEn') IS DISTINCT FROM 'string' OR k !~ '^[0-9]{14}$'
          OR to_char(to_date(left(k,8),'YYYYMMDD'),'YYYYMMDD') IS DISTINCT FROM left(k,8)
          OR substring(k,9,2)::integer>23 OR substring(k,11,2)::integer>59 OR substring(k,13,2)::integer>59 THEN
          RAISE EXCEPTION 'Proceso inválido.'; END IF;
      END IF;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'Fechas de autorización inválidas.' USING ERRCODE='22023'; END;
  ELSE RAISE EXCEPTION 'Estado de conciliación inválido.' USING ERRCODE='22023'; END IF;
  IF NOT p_decision ?& campos OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_decision) key WHERE NOT key=ANY(campos)) THEN
    RAISE EXCEPTION 'Campos de conciliación inválidos.' USING ERRCODE='22023'; END IF;
  SELECT * INTO autorizacion FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF reserva.estado='AUTORIZADA' THEN
    IF autorizacion.operacion_id IS NULL OR solicitud.revision<>2 THEN RAISE EXCEPTION 'Cierre fiscal inconsistente.' USING ERRCODE='40001'; END IF;
    IF p_decision->>'estado'='AUTORIZACION_COINCIDENTE' AND
      (autorizacion.cae IS DISTINCT FROM p_decision->>'cae' OR autorizacion.vencimiento IS DISTINCT FROM p_decision->>'vencimiento'
        OR autorizacion.procesado_en IS DISTINCT FROM p_decision->>'procesadoEn') THEN
      RAISE EXCEPTION 'Autorización contradictoria.' USING ERRCODE='22023'; END IF;
    ack:=autorizacion.resultado;
  ELSE
    IF solicitud.revision IS DISTINCT FROM p_revision OR p_revision<>1 OR autorizacion.operacion_id IS NOT NULL THEN
      RAISE EXCEPTION 'Revisión fiscal cambió.' USING ERRCODE='40001'; END IF;
    ack:=jsonb_build_object('version',1,'operacion_id',p_operacion_id,'numero',reserva.numero,
      'estado','PENDIENTE_CONCILIACION','solicitud_sha256',p_sha,'revision',1,'emision_habilitada',false);
    IF p_decision->>'estado'='AUTORIZACION_COINCIDENTE' THEN
      ack:=ack||jsonb_build_object('estado','AUTORIZADA','revision',2,'cae',p_decision->>'cae',
        'vencimiento',p_decision->>'vencimiento','procesado_en',p_decision->>'procesadoEn');
      INSERT INTO public.fiscal_autorizaciones_homologacion(operacion_id,intento_id,solicitud_sha256,cae,vencimiento,procesado_en,resultado)
        VALUES(p_operacion_id,p_intento_id,p_sha,p_decision->>'cae',p_decision->>'vencimiento',p_decision->>'procesadoEn',ack)
        RETURNING resultado INTO guardado;
      IF guardado IS DISTINCT FROM ack THEN RAISE EXCEPTION 'No se confirmó autorización.' USING ERRCODE='40001'; END IF;
      UPDATE public.fiscal_series_homologacion SET ultimo_observado=reserva.numero,observado_en=clock_timestamp()
        WHERE cuit_emisor=reserva.cuit_emisor AND punto_venta=reserva.punto_venta AND tipo_comprobante=reserva.tipo_comprobante
        AND ultimo_observado=reserva.numero-1 RETURNING ultimo_observado INTO ultimo;
      UPDATE public.fiscal_reservas_homologacion SET estado='AUTORIZADA'
        WHERE operacion_id=p_operacion_id AND estado='ENVIO_INCIERTO' RETURNING estado INTO estado_final;
      UPDATE public.fiscal_solicitudes_homologacion SET revision=2
        WHERE operacion_id=p_operacion_id AND revision=1 RETURNING revision INTO revision_final;
      IF ultimo IS DISTINCT FROM reserva.numero OR estado_final IS DISTINCT FROM 'AUTORIZADA' OR revision_final IS DISTINCT FROM 2 THEN
        RAISE EXCEPTION 'No se confirmó cierre atómico.' USING ERRCODE='40001'; END IF;
      SELECT * INTO autorizacion FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id=p_operacion_id;
      IF autorizacion.operacion_id IS NULL OR autorizacion.intento_id IS DISTINCT FROM p_intento_id
        OR autorizacion.solicitud_sha256 IS DISTINCT FROM p_sha OR autorizacion.cae IS DISTINCT FROM p_decision->>'cae'
        OR autorizacion.vencimiento IS DISTINCT FROM p_decision->>'vencimiento'
        OR autorizacion.procesado_en IS DISTINCT FROM p_decision->>'procesadoEn' OR autorizacion.resultado IS DISTINCT FROM ack THEN
        RAISE EXCEPTION 'Autorización guardada inconsistente.' USING ERRCODE='40001'; END IF;
    END IF;
  END IF;
  INSERT INTO public.fiscal_reconciliaciones_homologacion(id,operacion_id,intento_id,solicitud_sha256,revision,decision,resultado)
    VALUES(p_id,p_operacion_id,p_intento_id,p_sha,p_revision,p_decision,ack) RETURNING resultado INTO guardado;
  IF guardado IS DISTINCT FROM ack THEN RAISE EXCEPTION 'No se confirmó evidencia de conciliación.' USING ERRCODE='40001'; END IF;
  SELECT * INTO anterior FROM public.fiscal_reconciliaciones_homologacion WHERE id=p_id;
  IF anterior.id IS NULL OR anterior.operacion_id IS DISTINCT FROM p_operacion_id OR anterior.intento_id IS DISTINCT FROM p_intento_id
    OR anterior.solicitud_sha256 IS DISTINCT FROM p_sha OR anterior.revision IS DISTINCT FROM p_revision
    OR anterior.decision IS DISTINCT FROM p_decision OR anterior.resultado IS DISTINCT FROM ack THEN
    RAISE EXCEPTION 'Evidencia guardada inconsistente.' USING ERRCODE='40001'; END IF;
  RETURN ack;
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_reconciliacion_fiscal_homologacion(uuid,uuid,uuid,text,integer,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_reconciliacion_fiscal_homologacion(uuid,uuid,uuid,text,integer,jsonb) TO service_role;
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
  SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF FOUND AND reserva.estado='AUTORIZADA' THEN
    RETURN jsonb_build_object('operacion_id',reserva.operacion_id,'numero',reserva.numero,
      'estado',reserva.estado,'entorno','HOMOLOGACION','emision_habilitada',false);
  END IF;
  IF serie.ultimo_observado IS DISTINCT FROM p_ultimo_autorizado THEN
    RAISE EXCEPTION 'La serie cambió: requiere conciliación fiscal.' USING ERRCODE='22023';
  END IF;
  SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE cuit_emisor=p_cuit_emisor
    AND punto_venta=p_punto_venta AND tipo_comprobante=p_tipo_comprobante AND estado IN ('RESERVADA','ENVIO_INCIERTO') FOR UPDATE;
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


-- Recuperación privada: no expone cuerpo/receptor al navegador.
CREATE OR REPLACE FUNCTION public.cargar_contexto_conciliacion_homologacion(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE reserva public.fiscal_reservas_homologacion%ROWTYPE; solicitud public.fiscal_solicitudes_homologacion%ROWTYPE; ack jsonb;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere trabajador fiscal privado.' USING ERRCODE='42501'; END IF;
  PERFORM public.fiscal_operacion_vigente_homologacion(p_operacion_id);
  SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF reserva.operacion_id IS NULL OR solicitud.operacion_id IS NULL OR reserva.intento_id IS NULL
    OR reserva.estado NOT IN ('ENVIO_INCIERTO','AUTORIZADA')
    OR reserva.solicitud_sha256 IS DISTINCT FROM solicitud.solicitud_sha256 THEN
    RAISE EXCEPTION 'Falta intento fiscal durable.' USING ERRCODE='22023'; END IF;
  SELECT resultado INTO ack FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id=p_operacion_id;
  IF (reserva.estado='AUTORIZADA') IS DISTINCT FROM (ack IS NOT NULL) THEN
    RAISE EXCEPTION 'Cierre fiscal inconsistente.' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('operacion_id',p_operacion_id,'intento_id',reserva.intento_id,'revision',solicitud.revision,
    'solicitud',jsonb_build_object('version',1,'solicitud',solicitud.cuerpo,'sha256',solicitud.solicitud_sha256),'resultado',ack);
END;
$$;
CREATE OR REPLACE FUNCTION public.consultar_reconciliacion_homologacion(p_operacion_id uuid,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE obs public.fiscal_reconciliaciones_homologacion%ROWTYPE;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere trabajador fiscal privado.' USING ERRCODE='42501'; END IF;
  IF p_id IS NULL THEN RAISE EXCEPTION 'Identidad de consulta inválida.' USING ERRCODE='22023'; END IF;
  PERFORM public.fiscal_operacion_vigente_homologacion(p_operacion_id);
  SELECT * INTO obs FROM public.fiscal_reconciliaciones_homologacion WHERE id=p_id;
  IF FOUND AND obs.operacion_id IS DISTINCT FROM p_operacion_id THEN
    RAISE EXCEPTION 'Identidad de conciliación reutilizada.' USING ERRCODE='22023'; END IF;
  RETURN obs.resultado;
END;
$$;
REVOKE ALL ON FUNCTION public.cargar_contexto_conciliacion_homologacion(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.consultar_reconciliacion_homologacion(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_contexto_conciliacion_homologacion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.consultar_reconciliacion_homologacion(uuid,uuid) TO service_role;
COMMIT;
