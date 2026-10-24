-- PR03/F06: cuerpo final inmutable y reserva atómicos. Sólo homologación.
-- Requiere 001 y 002. No instala ni activa worker/emisión.
BEGIN;
ALTER TABLE public.fiscal_reservas_homologacion ADD COLUMN IF NOT EXISTS solicitud_sha256 text;
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.fiscal_reservas_homologacion WHERE estado='ENVIO_INCIERTO' AND solicitud_sha256 IS NULL) THEN
    RAISE EXCEPTION 'Conciliar intentos anteriores sin cuerpo antes de instalar este módulo.';
  END IF;
END $$;
ALTER TABLE public.fiscal_reservas_homologacion DROP CONSTRAINT IF EXISTS fiscal_reserva_cuerpo_requerido;
ALTER TABLE public.fiscal_reservas_homologacion ADD CONSTRAINT fiscal_reserva_cuerpo_requerido
  CHECK ((solicitud_sha256 IS NULL AND estado='RESERVADA') OR
    (solicitud_sha256 IS NOT NULL AND solicitud_sha256 ~ '^[0-9a-f]{64}$'));
CREATE TABLE IF NOT EXISTS public.fiscal_solicitudes_homologacion (
  operacion_id uuid PRIMARY KEY REFERENCES public.fiscal_operaciones_homologacion(id),
  cuerpo_canonico text NOT NULL CHECK(octet_length(cuerpo_canonico)<=262144),
  cuerpo jsonb NOT NULL CHECK(jsonb_typeof(cuerpo)='object'),
  solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
  revision integer NOT NULL DEFAULT 1 CHECK(revision IN (1,2)),
  creado_en timestamptz NOT NULL DEFAULT now(),
  CHECK(cuerpo=cuerpo_canonico::jsonb),
  CHECK(solicitud_sha256=encode(sha256(convert_to(cuerpo_canonico,'UTF8')),'hex'))
);
ALTER TABLE public.fiscal_solicitudes_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_solicitudes_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
    WHERE attrelid='public.fiscal_solicitudes_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s)
    ON public.fiscal_solicitudes_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
    IF has_table_privilege(rol,'public.fiscal_solicitudes_homologacion','SELECT,INSERT,UPDATE,DELETE')
      OR has_any_column_privilege(rol,'public.fiscal_solicitudes_homologacion','SELECT,INSERT,UPDATE') THEN
      RAISE EXCEPTION 'Privilegios heredados en solicitud fiscal.';
    END IF;
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.fiscal_validar_cuerpo_homologacion(p_op uuid,p_canon text,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.fiscal_operaciones_homologacion%ROWTYPE; body jsonb; k text; line jsonb;
  total numeric:=0; bases numeric:=0; impuestos numeric:=0;
  campos text[]:=ARRAY['version','entorno','cuitEmisor','puntoVenta','tipoComprobante','numero','concepto',
    'tipoDocumento','numeroDocumento','condicionIvaReceptor','fecha','servicioDesde','servicioHasta','vencimientoPago',
    'moneda','cotizacion','importes','iva','tributos'];
BEGIN
  IF p_canon IS NULL OR octet_length(p_canon)>262144 OR p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$'
    OR p_sha<>encode(sha256(convert_to(p_canon,'UTF8')),'hex') THEN
    RAISE EXCEPTION 'Hash o cuerpo fiscal inválido.' USING ERRCODE='22023';
  END IF;
  BEGIN body:=p_canon::jsonb; EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Cuerpo fiscal inválido.' USING ERRCODE='22023'; END;
  IF jsonb_typeof(body) IS DISTINCT FROM 'object' OR NOT body ?& campos
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(body) key WHERE NOT key=ANY(campos)) THEN
    RAISE EXCEPTION 'Campos fiscales inválidos.' USING ERRCODE='22023';
  END IF;
  FOREACH k IN ARRAY ARRAY['version','puntoVenta','tipoComprobante','numero','concepto','tipoDocumento','condicionIvaReceptor'] LOOP
    IF jsonb_typeof(body->k) IS DISTINCT FROM 'number' OR body->>k !~ '^[0-9]{1,10}$' THEN
      RAISE EXCEPTION 'Número fiscal inválido.' USING ERRCODE='22023'; END IF;
  END LOOP;
  FOREACH k IN ARRAY ARRAY['entorno','cuitEmisor','numeroDocumento','moneda','cotizacion'] LOOP
    IF jsonb_typeof(body->k) IS DISTINCT FROM 'string' THEN
      RAISE EXCEPTION 'Texto fiscal inválido.' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF body->'version'<>'1'::jsonb OR body->>'entorno' IS DISTINCT FROM 'HOMOLOGACION'
    OR body->>'moneda' IS DISTINCT FROM 'PES' OR body->>'cotizacion' IS DISTINCT FROM '1'
    OR (body->>'concepto')::numeric NOT BETWEEN 1 AND 3
    OR (body->>'numero')::numeric NOT BETWEEN 1 AND 99999999
    OR (body->>'condicionIvaReceptor')::numeric NOT BETWEEN 1 AND 2147483647 THEN
    RAISE EXCEPTION 'Contrato fiscal fuera de alcance.' USING ERRCODE='22023'; END IF;
  SELECT * INTO op FROM public.fiscal_operaciones_homologacion WHERE id=p_op;
  IF NOT FOUND OR body->>'cuitEmisor' IS DISTINCT FROM op.contexto->>'cuit_emisor'
    OR body->'puntoVenta' IS DISTINCT FROM op.contexto->'punto_venta'
    OR body->'tipoComprobante' IS DISTINCT FROM op.contexto->'tipo_comprobante'
    OR body->'tipoDocumento' IS DISTINCT FROM op.contexto->'tipo_doc_receptor'
    OR body->>'numeroDocumento' IS DISTINCT FROM op.contexto->>'nro_doc_receptor' THEN
    RAISE EXCEPTION 'El cuerpo no corresponde al contexto fiscal.' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['fecha','servicioDesde','servicioHasta','vencimientoPago'] LOOP
    IF k<>'fecha' AND body->k='null'::jsonb THEN CONTINUE; END IF;
    BEGIN
      IF jsonb_typeof(body->k) IS DISTINCT FROM 'string' OR body->>k !~ '^[0-9]{8}$'
        OR to_char(to_date(body->>k,'YYYYMMDD'),'YYYYMMDD') IS DISTINCT FROM body->>k THEN
        RAISE EXCEPTION 'Fecha inválida.'; END IF;
    EXCEPTION WHEN others THEN RAISE EXCEPTION 'Fecha fiscal inválida.' USING ERRCODE='22023'; END;
  END LOOP;
  IF ((body->>'concepto')='1' AND (body->'servicioDesde'<>'null'::jsonb OR body->'servicioHasta'<>'null'::jsonb OR body->'vencimientoPago'<>'null'::jsonb))
    OR ((body->>'concepto')<>'1' AND (body->'servicioDesde'='null'::jsonb OR body->'servicioHasta'='null'::jsonb
      OR body->'vencimientoPago'='null'::jsonb OR body->>'servicioDesde'>body->>'servicioHasta')) THEN
    RAISE EXCEPTION 'Período fiscal inválido.' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(body->'importes') IS DISTINCT FROM 'object'
    OR NOT body->'importes' ?& ARRAY['total','neto','iva','noGravado','exento','tributos']
    OR (SELECT count(*) FROM jsonb_object_keys(body->'importes'))<>6 THEN
    RAISE EXCEPTION 'Importes fiscales inválidos.' USING ERRCODE='22023'; END IF;
  FOREACH k IN ARRAY ARRAY['total','neto','iva','noGravado','exento','tributos'] LOOP
    IF jsonb_typeof(body->'importes'->k) IS DISTINCT FROM 'string'
      OR body->'importes'->>k !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' THEN
      RAISE EXCEPTION 'Importe fiscal no canónico.' USING ERRCODE='22023'; END IF;
    IF k<>'total' THEN total:=total+(body->'importes'->>k)::numeric; END IF;
  END LOOP;
  IF total<>(body->'importes'->>'total')::numeric OR total<=0
    OR total<>(op.venta_snapshot->>'total')::numeric THEN
    RAISE EXCEPTION 'El importe no corresponde a la venta fiscal.' USING ERRCODE='22023'; END IF;
  IF jsonb_typeof(body->'iva') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'iva')>100
    OR jsonb_typeof(body->'tributos') IS DISTINCT FROM 'array' OR jsonb_array_length(body->'tributos')>100 THEN
    RAISE EXCEPTION 'Desglose fiscal inválido.' USING ERRCODE='22023'; END IF;
  FOR line IN SELECT value FROM jsonb_array_elements(body->'iva') LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR NOT line ?& ARRAY['id','base','importe']
      OR (SELECT count(*) FROM jsonb_object_keys(line))<>3
      OR jsonb_typeof(line->'id') IS DISTINCT FROM 'number' OR line->>'id' !~ '^[0-9]{1,10}$'
      OR (line->>'id')::numeric NOT BETWEEN 1 AND 2147483647 THEN
      RAISE EXCEPTION 'Alícuota inválida.' USING ERRCODE='22023'; END IF;
    FOREACH k IN ARRAY ARRAY['base','importe'] LOOP
      IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' OR line->>k !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' THEN
        RAISE EXCEPTION 'Importe de alícuota inválido.' USING ERRCODE='22023'; END IF;
    END LOOP;
    bases:=bases+(line->>'base')::numeric; impuestos:=impuestos+(line->>'importe')::numeric;
  END LOOP;
  IF (SELECT count(*) FROM jsonb_array_elements(body->'iva'))<>(SELECT count(DISTINCT value->'id') FROM jsonb_array_elements(body->'iva'))
    OR impuestos<>(body->'importes'->>'iva')::numeric
    OR ((body->>'tipoComprobante')='11' AND jsonb_array_length(body->'iva')<>0)
    OR ((body->>'tipoComprobante')<>'11' AND bases<>(body->'importes'->>'neto')::numeric) THEN
    RAISE EXCEPTION 'IVA fiscal inconsistente.' USING ERRCODE='22023'; END IF;
  impuestos:=0;
  FOR line IN SELECT value FROM jsonb_array_elements(body->'tributos') LOOP
    IF jsonb_typeof(line) IS DISTINCT FROM 'object' OR NOT line ?& ARRAY['id','descripcion','base','alicuota','importe']
      OR (SELECT count(*) FROM jsonb_object_keys(line))<>5
      OR jsonb_typeof(line->'id') IS DISTINCT FROM 'number' OR line->>'id' !~ '^[0-9]{1,10}$'
      OR (line->>'id')::numeric NOT BETWEEN 1 AND 2147483647
      OR jsonb_typeof(line->'descripcion') IS DISTINCT FROM 'string'
      OR length(btrim(line->>'descripcion')) NOT BETWEEN 1 AND 250
      OR jsonb_typeof(line->'alicuota') IS DISTINCT FROM 'string'
      OR line->>'alicuota' !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{4}$' THEN
      RAISE EXCEPTION 'Tributo inválido.' USING ERRCODE='22023'; END IF;
    FOREACH k IN ARRAY ARRAY['base','importe'] LOOP
      IF jsonb_typeof(line->k) IS DISTINCT FROM 'string' OR line->>k !~ '^(0|[1-9][0-9]{0,9})\.[0-9]{2}$' THEN
        RAISE EXCEPTION 'Importe de tributo inválido.' USING ERRCODE='22023'; END IF;
    END LOOP;
    impuestos:=impuestos+(line->>'importe')::numeric;
  END LOOP;
  IF impuestos<>(body->'importes'->>'tributos')::numeric
    OR (SELECT count(*) FROM jsonb_array_elements(body->'tributos'))<>(SELECT count(DISTINCT value) FROM jsonb_array_elements(body->'tributos')) THEN
    RAISE EXCEPTION 'Tributos fiscales inconsistentes.' USING ERRCODE='22023'; END IF;
  RETURN body;
END;
$$;
REVOKE ALL ON FUNCTION public.fiscal_validar_cuerpo_homologacion(uuid,text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.persistir_solicitud_fiscal_homologacion(
  p_operacion_id uuid,p_cuerpo_canonico text,p_solicitud_sha256 text,p_ultimo_autorizado integer,p_consultado_en timestamptz
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.fiscal_operaciones_homologacion%ROWTYPE; solicitud public.fiscal_solicitudes_homologacion%ROWTYPE;
  body jsonb; reserva jsonb; hash_reserva text;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere trabajador fiscal privado.' USING ERRCODE='42501'; END IF;
  op:=public.fiscal_operacion_vigente_homologacion(p_operacion_id);
  body:=public.fiscal_validar_cuerpo_homologacion(p_operacion_id,p_cuerpo_canonico,p_solicitud_sha256);
  reserva:=public.reservar_numero_fiscal_homologacion(p_operacion_id,body->>'cuitEmisor',
    (body->>'puntoVenta')::integer,(body->>'tipoComprobante')::integer,p_ultimo_autorizado,p_consultado_en);
  IF (reserva->>'numero')::integer IS DISTINCT FROM (body->>'numero')::integer THEN
    RAISE EXCEPTION 'Cambió el número candidato; no modificar el cuerpo fiscal.' USING ERRCODE='22023'; END IF;
  INSERT INTO public.fiscal_solicitudes_homologacion(operacion_id,cuerpo_canonico,cuerpo,solicitud_sha256)
    VALUES(p_operacion_id,p_cuerpo_canonico,body,p_solicitud_sha256) ON CONFLICT DO NOTHING;
  SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF NOT FOUND OR solicitud.cuerpo_canonico IS DISTINCT FROM p_cuerpo_canonico
    OR solicitud.cuerpo IS DISTINCT FROM body OR solicitud.solicitud_sha256 IS DISTINCT FROM p_solicitud_sha256 THEN
    RAISE EXCEPTION 'No se confirmó el cuerpo fiscal o ya existe otro.' USING ERRCODE='40001'; END IF;
  UPDATE public.fiscal_reservas_homologacion SET solicitud_sha256=p_solicitud_sha256
    WHERE operacion_id=p_operacion_id AND (solicitud_sha256 IS NULL OR solicitud_sha256=p_solicitud_sha256)
    RETURNING solicitud_sha256 INTO hash_reserva;
  IF hash_reserva IS DISTINCT FROM p_solicitud_sha256 THEN RAISE EXCEPTION 'No se confirmó el vínculo de reserva.' USING ERRCODE='40001'; END IF;
  RETURN reserva||jsonb_build_object('solicitud_sha256',solicitud.solicitud_sha256,'revision',solicitud.revision);
END;
$$;
REVOKE ALL ON FUNCTION public.persistir_solicitud_fiscal_homologacion(uuid,text,text,integer,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.persistir_solicitud_fiscal_homologacion(uuid,text,text,integer,timestamptz) TO service_role;

-- Reemplaza el intento preparatorio: ahora es obligatorio un cuerpo durable.
CREATE OR REPLACE FUNCTION public.registrar_intento_fiscal_homologacion(p_operacion_id uuid,p_intento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.fiscal_operaciones_homologacion%ROWTYPE; reserva public.fiscal_reservas_homologacion%ROWTYPE;
  solicitud public.fiscal_solicitudes_homologacion%ROWTYPE; nuevo boolean:=false;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Se requiere trabajador fiscal privado.' USING ERRCODE='42501'; END IF;
  IF p_intento_id IS NULL THEN RAISE EXCEPTION 'Identidad de intento inválida.' USING ERRCODE='22023'; END IF;
  op:=public.fiscal_operacion_vigente_homologacion(p_operacion_id);
  PERFORM 1 FROM public.fiscal_series_homologacion WHERE cuit_emisor=op.contexto->>'cuit_emisor'
    AND punto_venta=(op.contexto->>'punto_venta')::numeric::integer AND tipo_comprobante=(op.contexto->>'tipo_comprobante')::numeric::integer FOR UPDATE;
  SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF reserva.operacion_id IS NULL OR solicitud.operacion_id IS NULL OR reserva.solicitud_sha256 IS DISTINCT FROM solicitud.solicitud_sha256 THEN
    RAISE EXCEPTION 'Falta cuerpo fiscal durable ligado a la reserva.' USING ERRCODE='22023'; END IF;
  IF reserva.estado='RESERVADA' THEN
    UPDATE public.fiscal_reservas_homologacion SET estado='ENVIO_INCIERTO',intento_id=p_intento_id,intento_en=clock_timestamp()
      WHERE operacion_id=p_operacion_id RETURNING * INTO reserva;
    nuevo:=true;
  ELSIF reserva.estado IS DISTINCT FROM 'ENVIO_INCIERTO' OR reserva.intento_id IS DISTINCT FROM p_intento_id THEN
    RAISE EXCEPTION 'Otro estado o intento requiere conciliación.' USING ERRCODE='55000'; END IF;
  IF reserva.estado IS DISTINCT FROM 'ENVIO_INCIERTO' OR reserva.intento_id IS DISTINCT FROM p_intento_id OR reserva.intento_en IS NULL THEN
    RAISE EXCEPTION 'No se confirmó el intento fiscal.' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('operacion_id',reserva.operacion_id,'numero',reserva.numero,'estado',reserva.estado,
    'solicitud_sha256',solicitud.solicitud_sha256,'revision',solicitud.revision,
    'nuevo_intento',nuevo,'requiere_conciliacion',NOT nuevo,'emision_habilitada',false);
END;
$$;
REVOKE ALL ON FUNCTION public.registrar_intento_fiscal_homologacion(uuid,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.registrar_intento_fiscal_homologacion(uuid,uuid) TO service_role;
COMMIT;
