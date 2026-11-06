-- F04: recuperación TA ligada a la operación de origen, no a otro tenant.
-- Requiere 001–007. Preparado localmente; sin instalación autorizada aún.
BEGIN;
ALTER TABLE public.fiscal_ta_intentos_homologacion ADD COLUMN IF NOT EXISTS operacion_origen_id uuid REFERENCES public.fiscal_operaciones_homologacion(id);
-- No se inventa origen para historia anterior: queda NULL y no cancelable.
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
  INSERT INTO public.fiscal_ta_intentos_homologacion(id,certificado_sha256,revision,operacion_origen_id) VALUES(p_intento_id,p_huella,siguiente,p_operacion_id);
  IF NOT EXISTS(SELECT 1 FROM public.fiscal_ta_intentos_homologacion WHERE id=p_intento_id AND certificado_sha256=p_huella AND revision=siguiente AND operacion_origen_id=p_operacion_id) THEN
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
 IF intento.operacion_origen_id IS DISTINCT FROM p_operacion_id THEN RAISE EXCEPTION 'Preparación TA de otra operación.' USING ERRCODE='42501'; END IF;
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
 IF intento.operacion_origen_id IS DISTINCT FROM p_operacion_id THEN RAISE EXCEPTION 'Preparación TA de otra operación.' USING ERRCODE='42501'; END IF;
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
CREATE OR REPLACE FUNCTION public.confirmar_ta_homologacion(p_operacion_id uuid,p_credencial_id uuid,p_huella text,p_revision integer,
  p_intento_id uuid,p_generacion bigint,p_cifrado jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ta public.fiscal_ta_homologacion%ROWTYPE; intento public.fiscal_ta_intentos_homologacion%ROWTYPE;
  expira timestamptz; ack jsonb; guardado jsonb;
BEGIN
  IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
  PERFORM public.fiscal_binding_ta_homologacion(p_operacion_id,p_credencial_id,p_huella,p_revision);
  IF p_intento_id IS NULL OR p_generacion IS NULL OR p_generacion<1 OR jsonb_typeof(p_cifrado) IS DISTINCT FROM 'object'
    OR NOT p_cifrado ?& ARRAY['version','keyId','nonce','ciphertext','expiresAt']
    OR (SELECT count(*) FROM jsonb_object_keys(p_cifrado))<>5 OR p_cifrado->'version' IS DISTINCT FROM '1'::jsonb
    OR jsonb_typeof(p_cifrado->'keyId') IS DISTINCT FROM 'string' OR p_cifrado->>'keyId' !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    OR jsonb_typeof(p_cifrado->'nonce') IS DISTINCT FROM 'string' OR p_cifrado->>'nonce' !~ '^[0-9a-f]{24}$'
    OR jsonb_typeof(p_cifrado->'ciphertext') IS DISTINCT FROM 'string' OR p_cifrado->>'ciphertext' !~ '^[0-9a-f]{32,}$'
    OR length(p_cifrado->>'ciphertext')>1100000 OR length(p_cifrado->>'ciphertext')%2<>0
    OR jsonb_typeof(p_cifrado->'expiresAt') IS DISTINCT FROM 'number' OR p_cifrado->>'expiresAt' !~ '^[0-9]{1,16}$' THEN
    RAISE EXCEPTION 'Sobre TA inválido.' USING ERRCODE='22023'; END IF;
  SELECT * INTO ta FROM public.fiscal_ta_homologacion WHERE certificado_sha256=p_huella FOR UPDATE;
  SELECT * INTO intento FROM public.fiscal_ta_intentos_homologacion WHERE id=p_intento_id FOR UPDATE;
 IF intento.operacion_origen_id IS DISTINCT FROM p_operacion_id THEN RAISE EXCEPTION 'Preparación TA de otra operación.' USING ERRCODE='42501'; END IF;
  IF ta.certificado_sha256 IS NULL OR intento.id IS NULL OR ta.intento_id IS DISTINCT FROM p_intento_id OR ta.revision IS DISTINCT FROM p_generacion
    OR intento.certificado_sha256 IS DISTINCT FROM p_huella OR intento.revision IS DISTINCT FROM p_generacion THEN
    RAISE EXCEPTION 'Reserva TA cambió.' USING ERRCODE='40001'; END IF;
  IF ta.estado='DISPONIBLE' THEN
    IF ta.cifrado IS DISTINCT FROM p_cifrado OR intento.resultado IS NULL THEN RAISE EXCEPTION 'Otro TA ya confirmado.' USING ERRCODE='22023'; END IF;
    RETURN intento.resultado;
  END IF;
  expira:=to_timestamp((p_cifrado->>'expiresAt')::numeric/1000);
  IF ta.estado IS DISTINCT FROM 'ENVIO_INCIERTO' OR expira<=clock_timestamp() OR expira>clock_timestamp()+interval '12 hours 1 minute' THEN
    RAISE EXCEPTION 'Vigencia TA inválida.' USING ERRCODE='22023'; END IF;
  ack:=jsonb_build_object('estado','DISPONIBLE','intento_id',p_intento_id,'revision',p_generacion,
    'cifrado_sha256',encode(sha256(convert_to(p_cifrado::text,'UTF8')),'hex'));
  UPDATE public.fiscal_ta_homologacion SET estado='DISPONIBLE',cifrado=p_cifrado,vence_en=expira
    WHERE certificado_sha256=p_huella RETURNING * INTO ta;
  IF ta.estado IS DISTINCT FROM 'DISPONIBLE' OR ta.cifrado IS DISTINCT FROM p_cifrado OR ta.vence_en IS DISTINCT FROM expira THEN
    RAISE EXCEPTION 'No se confirmó TA cifrado.' USING ERRCODE='40001'; END IF;
  UPDATE public.fiscal_ta_intentos_homologacion SET resultado=ack WHERE id=p_intento_id RETURNING resultado INTO guardado;
  IF guardado IS DISTINCT FROM ack THEN RAISE EXCEPTION 'No se confirmó resultado TA.' USING ERRCODE='40001'; END IF;
  RETURN ack;
END;
$$;

CREATE OR REPLACE FUNCTION public.consultar_preparacion_ta_homologacion(p_operacion_id uuid,p_credencial_id uuid,p_huella text,p_revision integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE ta public.fiscal_ta_homologacion%ROWTYPE; origen uuid;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 PERFORM public.fiscal_binding_ta_homologacion(p_operacion_id,p_credencial_id,p_huella,p_revision);
 SELECT * INTO ta FROM public.fiscal_ta_homologacion WHERE certificado_sha256=p_huella;
 IF ta.certificado_sha256 IS NULL OR ta.estado='VACIO' THEN RETURN jsonb_build_object('estado','VACIO','intento_id',NULL,'revision',0); END IF;
 SELECT operacion_origen_id INTO origen FROM public.fiscal_ta_intentos_homologacion WHERE id=ta.intento_id;
 IF origen IS DISTINCT FROM p_operacion_id THEN RETURN jsonb_build_object('estado','COMPARTIDA','intento_id',NULL,'revision',0); END IF;
 RETURN jsonb_build_object('estado',ta.estado,'intento_id',ta.intento_id,'revision',ta.revision);
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
REVOKE ALL ON FUNCTION public.solicitar_ta_homologacion(uuid,uuid,text,integer,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.solicitar_ta_homologacion(uuid,uuid,text,integer,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.iniciar_envio_ta_homologacion(uuid,uuid,text,integer,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.iniciar_envio_ta_homologacion(uuid,uuid,text,integer,uuid,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.cancelar_preparacion_ta_homologacion(uuid,uuid,text,integer,uuid,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cancelar_preparacion_ta_homologacion(uuid,uuid,text,integer,uuid,bigint) TO service_role;
REVOKE ALL ON FUNCTION public.confirmar_ta_homologacion(uuid,uuid,text,integer,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.confirmar_ta_homologacion(uuid,uuid,text,integer,uuid,bigint,jsonb) TO service_role;
REVOKE ALL ON FUNCTION public.consultar_preparacion_ta_homologacion(uuid,uuid,text,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.consultar_preparacion_ta_homologacion(uuid,uuid,text,integer) TO service_role;
COMMIT;
