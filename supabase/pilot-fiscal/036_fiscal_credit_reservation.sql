-- Reserva y cuerpo NC privados. No envío/permiso/CAE ni efectos comerciales.
-- Requiere001–035. Instalación remota sólo con gate/autorización específicos.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_series_homologacion (
 cuit_emisor text NOT NULL CHECK(cuit_emisor ~ '^[0-9]{11}$'), punto_venta integer NOT NULL CHECK(punto_venta BETWEEN 1 AND 99998),
 tipo_comprobante integer NOT NULL CHECK(tipo_comprobante IN (3,8,13)), PRIMARY KEY(cuit_emisor,punto_venta,tipo_comprobante)
);
CREATE TABLE IF NOT EXISTS public.fiscal_nc_reservas_homologacion (
 solicitud_id uuid PRIMARY KEY REFERENCES public.fiscal_preparaciones_nc_homologacion(solicitud_id), reserva_id uuid NOT NULL UNIQUE,
 operacion_origen_id uuid NOT NULL REFERENCES public.fiscal_operaciones_homologacion(id), actor_auth_id uuid NOT NULL,
 propuesta_sha256 text NOT NULL CHECK(propuesta_sha256 ~ '^[0-9a-f]{64}$'), preparacion_sha256 text NOT NULL CHECK(preparacion_sha256 ~ '^[0-9a-f]{64}$'),
 cuit_emisor text NOT NULL, punto_venta integer NOT NULL, tipo_comprobante integer NOT NULL, numero integer NOT NULL CHECK(numero BETWEEN 1 AND 99999999),
 ultimo_autorizado integer NOT NULL CHECK(ultimo_autorizado BETWEEN 0 AND 99999998), consultado_en timestamptz NOT NULL,
 datos jsonb NOT NULL, canonico text NOT NULL CHECK(octet_length(canonico)<=131072), solicitud_sha256 text NOT NULL,
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(cuit_emisor,punto_venta,tipo_comprobante) REFERENCES public.fiscal_nc_series_homologacion,
 UNIQUE(cuit_emisor,punto_venta,tipo_comprobante,numero),
 CHECK(numero=ultimo_autorizado+1 AND datos=canonico::jsonb AND solicitud_sha256=encode(sha256(convert_to(canonico,'UTF8')),'hex'))
);
DO $$ DECLARE tabla text; columnas text; rol text; BEGIN
 FOREACH tabla IN ARRAY ARRAY['fiscal_nc_series_homologacion','fiscal_nc_reservas_homologacion'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tabla);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated,service_role',tabla);
  SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid=('public.'||tabla)::regclass AND attnum>0 AND NOT attisdropped;
  EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.%I FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas,tabla);
  FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_table_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.'||tabla,'SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Privilegios heredados en reserva NC.'; END IF;
  END LOOP;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_nc_reserva_inmutable ON public.fiscal_nc_reservas_homologacion;
CREATE TRIGGER fiscal_nc_reserva_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_nc_reservas_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();

CREATE OR REPLACE FUNCTION public.fiscal_nc_excluir_cancelacion_numerada()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Reserva NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:nc:'||NEW.solicitud_id::text,0));
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_reservas_homologacion WHERE solicitud_id=NEW.solicitud_id) THEN
  RAISE EXCEPTION 'NC numerada requiere resolución fiscal; no cancelar como borrador.' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_nc_excluir_cancelacion_numerada() FROM PUBLIC,anon,authenticated,service_role;
DROP TRIGGER IF EXISTS fiscal_nc_excluir_cancelacion_numerada ON public.fiscal_nc_cancelaciones_homologacion;
CREATE TRIGGER fiscal_nc_excluir_cancelacion_numerada BEFORE INSERT ON public.fiscal_nc_cancelaciones_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_nc_excluir_cancelacion_numerada();

CREATE OR REPLACE FUNCTION public.cargar_reserva_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE preparacion jsonb; reserva public.fiscal_nc_reservas_homologacion%ROWTYPE;
BEGIN
 preparacion:=public.cargar_preparacion_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 SELECT * INTO reserva FROM public.fiscal_nc_reservas_homologacion WHERE solicitud_id=p_id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF preparacion IS NULL OR preparacion->>'estado' IS DISTINCT FROM 'DATOS_NC_PREPARADOS' OR reserva.actor_auth_id IS DISTINCT FROM p_actor_auth_id
  OR reserva.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id OR reserva.propuesta_sha256 IS DISTINCT FROM p_sha
  OR reserva.preparacion_sha256 IS DISTINCT FROM preparacion#>>'{preparacion,sha256}' THEN RAISE EXCEPTION 'Reserva NC distinta.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version',1,'entorno','HOMOLOGACION','venta_id',p_venta_id,'operacion_origen_id',p_operacion_origen_id,'solicitud_id',p_id,
  'propuesta_sha256',p_sha,'preparacion_sha256',reserva.preparacion_sha256,'reserva_id',reserva.reserva_id,'cuit_emisor',reserva.cuit_emisor,
  'punto_venta',reserva.punto_venta,'tipo_comprobante',reserva.tipo_comprobante,'numero',reserva.numero,'estado','RESERVADA','emision_habilitada',false);
END $$;

CREATE OR REPLACE FUNCTION public.reservar_cuerpo_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text,p_preparacion_sha text,p_reserva_id uuid,p_ultimo_autorizado integer,p_consultado_en timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previa jsonb; preparacion jsonb; contexto jsonb; datos jsonb; cuerpo jsonb; canonico text; cuit text; pv integer; tipo integer;
BEGIN
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Reserva NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF p_reserva_id IS NULL OR p_preparacion_sha IS NULL OR p_preparacion_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Conservar identidad de reserva NC.' USING ERRCODE='22023'; END IF;
 previa:=public.cargar_reserva_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF previa IS NOT NULL THEN
  IF previa->>'preparacion_sha256' IS DISTINCT FROM p_preparacion_sha OR previa->>'reserva_id' IS DISTINCT FROM p_reserva_id::text THEN RAISE EXCEPTION 'Conservar reserva NC original.' USING ERRCODE='22023'; END IF;
  RETURN previa;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('kioskopos:fiscal:nc:'||p_id::text,0));
 preparacion:=public.cargar_preparacion_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF preparacion IS NULL OR preparacion->>'estado' IS DISTINCT FROM 'DATOS_NC_PREPARADOS' OR preparacion#>>'{preparacion,sha256}' IS DISTINCT FROM p_preparacion_sha THEN RAISE EXCEPTION 'Preparación NC no disponible.' USING ERRCODE='55000'; END IF;
 contexto:=public.cargar_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF contexto IS DISTINCT FROM preparacion->'contexto' THEN RAISE EXCEPTION 'Contexto NC cambió.' USING ERRCODE='22023'; END IF;
 cuerpo:=((preparacion#>>'{preparacion,canonico}')::jsonb)->'datos';cuit:=cuerpo->>'cuitEmisor';pv:=(cuerpo->>'puntoVenta')::integer;tipo:=(cuerpo->>'tipoComprobante')::integer;
 INSERT INTO public.fiscal_nc_series_homologacion VALUES(cuit,pv,tipo) ON CONFLICT DO NOTHING;
 PERFORM 1 FROM public.fiscal_nc_series_homologacion WHERE cuit_emisor=cuit AND punto_venta=pv AND tipo_comprobante=tipo FOR UPDATE;
 -- No existe worker/resolución NC aún: toda reserva previa mantiene la serie cerrada.
 -- Una futura resolución privada debe acreditar ARCA antes de permitir otro número.
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_reservas_homologacion WHERE cuit_emisor=cuit AND punto_venta=pv AND tipo_comprobante=tipo) THEN RAISE EXCEPTION 'Serie NC pendiente de resolución fiscal.' USING ERRCODE='55000'; END IF;
 IF p_ultimo_autorizado IS NULL OR p_ultimo_autorizado NOT BETWEEN 0 AND 99999998 OR p_consultado_en IS NULL
  OR NOT isfinite(p_consultado_en) OR p_consultado_en>clock_timestamp() OR p_consultado_en<clock_timestamp()-interval '30 seconds' THEN RAISE EXCEPTION 'Consulta de numeración NC vencida o inválida.' USING ERRCODE='22023'; END IF;
 -- Revalidar vigencia y hechos después de esperar por la serie.
 IF public.cargar_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha) IS DISTINCT FROM contexto THEN RAISE EXCEPTION 'Contexto NC cambió.' USING ERRCODE='22023'; END IF;
 cuerpo:=cuerpo||jsonb_build_object('version',1,'entorno','HOMOLOGACION','numero',p_ultimo_autorizado+1);
 datos:=jsonb_build_object('version',1,'clase','NOTA_CREDITO','entorno','HOMOLOGACION','venta_id',p_venta_id,'operacion_origen_id',p_operacion_origen_id,
  'solicitud_id',p_id,'propuesta_sha256',p_sha,'preparacion_sha256',p_preparacion_sha,'reserva_id',p_reserva_id,'solicitud',cuerpo);
 canonico:=public.fiscal_json_canonico_homologacion(datos);
 INSERT INTO public.fiscal_nc_reservas_homologacion(solicitud_id,reserva_id,operacion_origen_id,actor_auth_id,propuesta_sha256,preparacion_sha256,cuit_emisor,punto_venta,tipo_comprobante,numero,ultimo_autorizado,consultado_en,datos,canonico,solicitud_sha256)
 VALUES(p_id,p_reserva_id,p_operacion_origen_id,p_actor_auth_id,p_sha,p_preparacion_sha,cuit,pv,tipo,p_ultimo_autorizado+1,p_ultimo_autorizado,p_consultado_en,datos,canonico,encode(sha256(convert_to(canonico,'UTF8')),'hex'));
 RETURN public.cargar_reserva_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
END $$;
REVOKE ALL ON FUNCTION public.cargar_reserva_nc_homologacion(uuid,uuid,uuid,uuid,text),public.reservar_cuerpo_nc_homologacion(uuid,uuid,uuid,uuid,text,text,uuid,integer,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_reserva_nc_homologacion(uuid,uuid,uuid,uuid,text),public.reservar_cuerpo_nc_homologacion(uuid,uuid,uuid,uuid,text,text,uuid,integer,timestamptz) TO service_role;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_reservas_homologacion r JOIN public.fiscal_nc_cancelaciones_homologacion c USING(solicitud_id)) THEN RAISE EXCEPTION 'Historia NC incompatible: reserva y cancelación.' USING ERRCODE='55000'; END IF;
END $$;
COMMIT;
