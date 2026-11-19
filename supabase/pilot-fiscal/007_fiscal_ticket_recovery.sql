-- F04: preparación cancelable y permiso único antes de transportar WSAA.
-- Requiere 001–006. Ensayo local; no instalar ni provisionar sin su gate.
BEGIN;
ALTER TABLE public.fiscal_ta_homologacion DROP CONSTRAINT IF EXISTS fiscal_ta_homologacion_estado_check;
ALTER TABLE public.fiscal_ta_homologacion DROP CONSTRAINT IF EXISTS fiscal_ta_homologacion_check;
ALTER TABLE public.fiscal_ta_homologacion ADD CONSTRAINT fiscal_ta_homologacion_estado_check CHECK(estado IN ('VACIO','PREPARADA','ENVIO_INCIERTO','DISPONIBLE'));
ALTER TABLE public.fiscal_ta_homologacion ADD CONSTRAINT fiscal_ta_homologacion_check CHECK(
 (estado='VACIO' AND intento_id IS NULL AND cifrado IS NULL AND vence_en IS NULL)
 OR (estado IN ('PREPARADA','ENVIO_INCIERTO') AND intento_id IS NOT NULL AND cifrado IS NULL AND vence_en IS NULL)
 OR (estado='DISPONIBLE' AND intento_id IS NOT NULL AND cifrado IS NOT NULL AND vence_en IS NOT NULL));
ALTER TABLE public.fiscal_ta_intentos_homologacion ADD COLUMN IF NOT EXISTS envio_iniciado_en timestamptz;
ALTER TABLE public.fiscal_ta_intentos_homologacion ADD COLUMN IF NOT EXISTS cancelado_en timestamptz;
-- Los intentos del contrato anterior se conservan como potencialmente enviados.
UPDATE public.fiscal_ta_intentos_homologacion i SET envio_iniciado_en=i.iniciado_en
 WHERE i.envio_iniciado_en IS NULL AND i.cancelado_en IS NULL AND (i.resultado IS NOT NULL OR EXISTS(
 SELECT 1 FROM public.fiscal_ta_homologacion t WHERE t.intento_id=i.id AND t.estado IN ('ENVIO_INCIERTO','DISPONIBLE')));
ALTER TABLE public.fiscal_ta_intentos_homologacion DROP CONSTRAINT IF EXISTS fiscal_ta_intento_frontera_check;
ALTER TABLE public.fiscal_ta_intentos_homologacion ADD CONSTRAINT fiscal_ta_intento_frontera_check CHECK(
 NOT(envio_iniciado_en IS NOT NULL AND cancelado_en IS NOT NULL) AND (resultado IS NULL OR envio_iniciado_en IS NOT NULL));
CREATE OR REPLACE FUNCTION public.solicitar_ta_homologacion(p_operacion_id uuid,p_credencial_id uuid,p_huella text,p_revision integer,p_intento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ta public.fiscal_ta_homologacion%ROWTYPE; intento public.fiscal_ta_intentos_homologacion%ROWTYPE; siguiente bigint;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
  IF p_intento_id IS NULL THEN RAISE EXCEPTION 'Intento TA inválido.' USING ERRCODE='22023'; END IF;
  PERFORM public.fiscal_binding_ta_homologacion(p_operacion_id,p_credencial_id,p_huella,p_revision);
  INSERT INTO public.fiscal_ta_homologacion(certificado_sha256) VALUES(p_huella) ON CONFLICT DO NOTHING;
  SELECT * INTO ta FROM public.fiscal_ta_homologacion WHERE certificado_sha256=p_huella FOR UPDATE;
  SELECT * INTO intento FROM public.fiscal_ta_intentos_homologacion WHERE id=p_intento_id;
  IF FOUND AND intento.certificado_sha256 IS DISTINCT FROM p_huella THEN RAISE EXCEPTION 'Identidad TA reutilizada.' USING ERRCODE='22023'; END IF;
  IF ta.estado='DISPONIBLE' AND ta.vence_en>clock_timestamp() THEN
    IF ta.vence_en<=clock_timestamp()+interval '60 seconds' THEN
      RETURN jsonb_build_object('estado','ESPERAR_VENCIMIENTO','nuevo_intento',false);
    END IF;
    RETURN jsonb_build_object('estado','DISPONIBLE','nuevo_intento',false,'cifrado',ta.cifrado);
  END IF;
  IF ta.estado IN ('PREPARADA','ENVIO_INCIERTO') THEN
    RETURN jsonb_build_object('estado','RENOVACION_PENDIENTE','nuevo_intento',false);
  END IF;
  IF intento.id IS NOT NULL THEN RETURN jsonb_build_object('estado','INTENTO_OBSOLETO','nuevo_intento',false); END IF;
  siguiente:=ta.revision+1;
  INSERT INTO public.fiscal_ta_intentos_homologacion(id,certificado_sha256,revision) VALUES(p_intento_id,p_huella,siguiente);
  IF NOT EXISTS(SELECT 1 FROM public.fiscal_ta_intentos_homologacion WHERE id=p_intento_id AND certificado_sha256=p_huella AND revision=siguiente) THEN
    RAISE EXCEPTION 'No se confirmó intención TA.' USING ERRCODE='40001'; END IF;
  UPDATE public.fiscal_ta_homologacion SET revision=siguiente,estado='PREPARADA',intento_id=p_intento_id,cifrado=NULL,vence_en=NULL
    WHERE certificado_sha256=p_huella RETURNING * INTO ta;
  IF ta.estado IS DISTINCT FROM 'PREPARADA' OR ta.intento_id IS DISTINCT FROM p_intento_id OR ta.revision IS DISTINCT FROM siguiente THEN
    RAISE EXCEPTION 'No se confirmó reserva TA.' USING ERRCODE='40001'; END IF;
  RETURN jsonb_build_object('estado','RENOVAR','nuevo_intento',true,'intento_id',p_intento_id,'revision',siguiente);
END;
$$;

CREATE OR REPLACE FUNCTION public.iniciar_envio_ta_homologacion(p_operacion_id uuid,p_credencial_id uuid,p_huella text,p_revision integer,p_intento_id uuid,p_generacion bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ta public.fiscal_ta_homologacion%ROWTYPE; intento public.fiscal_ta_intentos_homologacion%ROWTYPE; instante timestamptz:=clock_timestamp();
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 PERFORM public.fiscal_binding_ta_homologacion(p_operacion_id,p_credencial_id,p_huella,p_revision);
 IF p_intento_id IS NULL OR p_generacion IS NULL OR p_generacion<1 THEN RAISE EXCEPTION 'Intento TA inválido.' USING ERRCODE='22023'; END IF;
 SELECT * INTO ta FROM public.fiscal_ta_homologacion WHERE certificado_sha256=p_huella FOR UPDATE;
 SELECT * INTO intento FROM public.fiscal_ta_intentos_homologacion WHERE id=p_intento_id FOR UPDATE;
 IF ta.intento_id IS DISTINCT FROM p_intento_id OR ta.revision IS DISTINCT FROM p_generacion OR intento.id IS NULL
 OR intento.certificado_sha256 IS DISTINCT FROM p_huella OR intento.revision IS DISTINCT FROM p_generacion OR intento.cancelado_en IS NOT NULL THEN
 RAISE EXCEPTION 'Reserva TA cambió.' USING ERRCODE='40001'; END IF;
 IF ta.estado IN ('ENVIO_INCIERTO','DISPONIBLE') AND intento.envio_iniciado_en IS NOT NULL THEN
 RETURN jsonb_build_object('estado',ta.estado,'nuevo_envio',false,'intento_id',p_intento_id,'revision',p_generacion); END IF;
 IF ta.estado IS DISTINCT FROM 'PREPARADA' OR intento.envio_iniciado_en IS NOT NULL THEN RAISE EXCEPTION 'Preparación TA no disponible.' USING ERRCODE='40001'; END IF;
 UPDATE public.fiscal_ta_intentos_homologacion SET envio_iniciado_en=instante WHERE id=p_intento_id RETURNING * INTO intento;
 IF intento.envio_iniciado_en IS DISTINCT FROM instante THEN RAISE EXCEPTION 'Intención TA no confirmada.' USING ERRCODE='40001'; END IF;
 UPDATE public.fiscal_ta_homologacion SET estado='ENVIO_INCIERTO' WHERE certificado_sha256=p_huella RETURNING * INTO ta;
 IF ta.estado IS DISTINCT FROM 'ENVIO_INCIERTO' THEN RAISE EXCEPTION 'Envío TA no confirmado.' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('estado','ENVIO_INCIERTO','nuevo_envio',true,'intento_id',p_intento_id,'revision',p_generacion);
END;
$$;
CREATE OR REPLACE FUNCTION public.cancelar_preparacion_ta_homologacion(p_operacion_id uuid,p_credencial_id uuid,p_huella text,p_revision integer,p_intento_id uuid,p_generacion bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ta public.fiscal_ta_homologacion%ROWTYPE; intento public.fiscal_ta_intentos_homologacion%ROWTYPE; instante timestamptz:=clock_timestamp();
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 PERFORM public.fiscal_binding_ta_homologacion(p_operacion_id,p_credencial_id,p_huella,p_revision);
 IF p_intento_id IS NULL OR p_generacion IS NULL OR p_generacion<1 THEN RAISE EXCEPTION 'Intento TA inválido.' USING ERRCODE='22023'; END IF;
 SELECT * INTO ta FROM public.fiscal_ta_homologacion WHERE certificado_sha256=p_huella FOR UPDATE;
 SELECT * INTO intento FROM public.fiscal_ta_intentos_homologacion WHERE id=p_intento_id FOR UPDATE;
 IF intento.id IS NULL OR intento.certificado_sha256 IS DISTINCT FROM p_huella OR intento.revision IS DISTINCT FROM p_generacion THEN
 RAISE EXCEPTION 'Identidad TA no disponible.' USING ERRCODE='40001'; END IF;
 IF intento.cancelado_en IS NOT NULL THEN RETURN jsonb_build_object('estado','CANCELADA','intento_id',p_intento_id,'revision',p_generacion); END IF;
 IF ta.intento_id IS DISTINCT FROM p_intento_id OR ta.revision IS DISTINCT FROM p_generacion OR ta.estado IS DISTINCT FROM 'PREPARADA'
 OR intento.envio_iniciado_en IS NOT NULL OR intento.resultado IS NOT NULL THEN RAISE EXCEPTION 'No se puede cancelar un envío TA.' USING ERRCODE='40001'; END IF;
 UPDATE public.fiscal_ta_intentos_homologacion SET cancelado_en=instante WHERE id=p_intento_id RETURNING * INTO intento;
 IF intento.cancelado_en IS DISTINCT FROM instante THEN RAISE EXCEPTION 'Cancelación TA no confirmada.' USING ERRCODE='40001'; END IF;
 UPDATE public.fiscal_ta_homologacion SET estado='VACIO',intento_id=NULL,cifrado=NULL,vence_en=NULL WHERE certificado_sha256=p_huella RETURNING * INTO ta;
 IF ta.estado IS DISTINCT FROM 'VACIO' OR ta.intento_id IS NOT NULL THEN RAISE EXCEPTION 'Liberación TA no confirmada.' USING ERRCODE='40001'; END IF;
 RETURN jsonb_build_object('estado','CANCELADA','intento_id',p_intento_id,'revision',p_generacion);
END;
$$;
-- Recuperación privada tras reinicio/ACK de reserva perdido. Sin Token/Sign.
CREATE OR REPLACE FUNCTION public.consultar_preparacion_ta_homologacion(p_operacion_id uuid,p_credencial_id uuid,p_huella text,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ta public.fiscal_ta_homologacion%ROWTYPE;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 PERFORM public.fiscal_binding_ta_homologacion(p_operacion_id,p_credencial_id,p_huella,p_revision);
 SELECT * INTO ta FROM public.fiscal_ta_homologacion WHERE certificado_sha256=p_huella;
 RETURN jsonb_build_object('estado',coalesce(ta.estado,'VACIO'),'intento_id',ta.intento_id,'revision',coalesce(ta.revision,0));
END;
$$;
-- Repetir revocación por columnas: las columnas añadidas nunca quedan públicas.
DO $$ DECLARE tabla text; columnas text; BEGIN
 FOREACH tabla IN ARRAY ARRAY['fiscal_ta_homologacion','fiscal_ta_intentos_homologacion'] LOOP
  SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute WHERE attrelid=('public.'||tabla)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tabla);
  EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas,tabla);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION public.iniciar_envio_ta_homologacion(uuid,uuid,text,integer,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.cancelar_preparacion_ta_homologacion(uuid,uuid,text,integer,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.consultar_preparacion_ta_homologacion(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iniciar_envio_ta_homologacion(uuid,uuid,text,integer,uuid,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_preparacion_ta_homologacion(uuid,uuid,text,integer,uuid,bigint) TO service_role;
GRANT EXECUTE ON FUNCTION public.consultar_preparacion_ta_homologacion(uuid,uuid,text,integer) TO service_role;
COMMIT;
