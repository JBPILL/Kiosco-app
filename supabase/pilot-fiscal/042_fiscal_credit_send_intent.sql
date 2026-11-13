-- Intención NC durable/consumo único, antes del transporte. Requiere001–041.
-- No WSAA/WSFE/CAE ni aplicación comercial. Instalación remota requiere autorización.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_intenciones_homologacion (
 solicitud_id uuid PRIMARY KEY REFERENCES public.fiscal_nc_reservas_homologacion(solicitud_id), intento_id uuid NOT NULL UNIQUE,
 permiso_id uuid NOT NULL UNIQUE REFERENCES public.fiscal_nc_permisos_homologacion(id), revision_id uuid NOT NULL REFERENCES public.fiscal_nc_revisiones_homologacion(id),
 reserva_id uuid NOT NULL REFERENCES public.fiscal_nc_reservas_homologacion(reserva_id), operacion_origen_id uuid NOT NULL REFERENCES public.fiscal_operaciones_homologacion(id),
 actor_auth_id uuid NOT NULL, propuesta_sha256 text NOT NULL CHECK(propuesta_sha256 ~ '^[0-9a-f]{64}$'),
 preparacion_sha256 text NOT NULL CHECK(preparacion_sha256 ~ '^[0-9a-f]{64}$'), solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
 ultimo_autorizado integer NOT NULL CHECK(ultimo_autorizado BETWEEN 0 AND 99999998), consultado_en timestamptz NOT NULL CHECK(isfinite(consultado_en)),
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE public.fiscal_nc_intenciones_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_nc_intenciones_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid='public.fiscal_nc_intenciones_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.fiscal_nc_intenciones_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_nc_intenciones_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_nc_intenciones_homologacion','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Intención NC expuesta.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_nc_intencion_inmutable ON public.fiscal_nc_intenciones_homologacion;
CREATE TRIGGER fiscal_nc_intencion_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_nc_intenciones_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();
CREATE OR REPLACE FUNCTION public.cargar_intencion_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cuerpo jsonb; intento public.fiscal_nc_intenciones_homologacion%ROWTYPE;
BEGIN
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF cuerpo IS NULL THEN RAISE EXCEPTION 'Requiere cuerpo NC reservado.' USING ERRCODE='55000'; END IF;
 SELECT * INTO intento FROM public.fiscal_nc_intenciones_homologacion WHERE solicitud_id=p_id FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF intento.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR intento.operacion_origen_id IS DISTINCT FROM p_operacion_origen_id
  OR intento.propuesta_sha256 IS DISTINCT FROM p_sha OR intento.solicitud_sha256 IS DISTINCT FROM cuerpo#>>'{cuerpo,sha256}'
  OR intento.reserva_id::text IS DISTINCT FROM cuerpo#>>'{reserva,reserva_id}' OR intento.preparacion_sha256 IS DISTINCT FROM cuerpo#>>'{reserva,preparacion_sha256}' THEN RAISE EXCEPTION 'Intención NC distinta.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version',1,'estado','ENVIO_INCIERTO','solicitud_id',p_id,'operacion_origen_id',p_operacion_origen_id,
  'intento_id',intento.intento_id,'permiso_id',intento.permiso_id,'revision_id',intento.revision_id,'reserva_id',intento.reserva_id,
  'propuesta_sha256',intento.propuesta_sha256,'preparacion_sha256',intento.preparacion_sha256,'solicitud_sha256',intento.solicitud_sha256,
  'actor_auth_id',intento.actor_auth_id,'nuevo_envio',false,'emision_habilitada',false);
END $$;
CREATE OR REPLACE FUNCTION public.registrar_intencion_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text,p_cuerpo_sha text,p_revision_id uuid,p_permiso_id uuid,p_intento_id uuid,p_ultimo_autorizado integer,p_consultado_en timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previa jsonb; cuerpo jsonb; permiso jsonb;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Requiere trabajador privado NC.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Intención NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF p_intento_id IS NULL OR p_permiso_id IS NULL OR p_revision_id IS NULL OR p_cuerpo_sha IS NULL OR p_cuerpo_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Conservar identidad NC.' USING ERRCODE='22023'; END IF;
 -- Autoriza identidad original y cuerpo histórico antes de cualquier permiso vigente.
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF cuerpo IS NULL OR cuerpo#>>'{cuerpo,sha256}' IS DISTINCT FROM p_cuerpo_sha THEN RAISE EXCEPTION 'Cuerpo NC distinto.' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM public.fiscal_nc_series_homologacion WHERE cuit_emisor=cuerpo#>>'{reserva,cuit_emisor}' AND punto_venta=(cuerpo#>>'{reserva,punto_venta}')::integer
  AND tipo_comprobante=(cuerpo#>>'{reserva,tipo_comprobante}')::integer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Serie NC no disponible.' USING ERRCODE='55000'; END IF;
 -- Releer después de esperar: recuperación no requiere permiso/emisor aún vigente.
 previa:=public.cargar_intencion_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF previa IS NOT NULL THEN
  IF previa->>'intento_id' IS DISTINCT FROM p_intento_id::text THEN RAISE EXCEPTION 'Otro intento NC requiere conciliación.' USING ERRCODE='55000'; END IF;
  IF previa->>'permiso_id' IS DISTINCT FROM p_permiso_id::text OR previa->>'revision_id' IS DISTINCT FROM p_revision_id::text THEN RAISE EXCEPTION 'Conservar permiso/revisión originales.' USING ERRCODE='22023'; END IF;
  RETURN previa;
 END IF;
 permiso:=public.verificar_permiso_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha,p_cuerpo_sha,p_revision_id,p_permiso_id);
 -- SQL valida forma/vigencia, no acredita procedencia WSFE: el adaptador privado debe hacerlo.
 IF p_ultimo_autorizado IS NULL OR p_ultimo_autorizado NOT BETWEEN 0 AND 99999998 OR p_ultimo_autorizado+1 IS DISTINCT FROM (cuerpo#>>'{reserva,numero}')::integer
  OR p_consultado_en IS NULL OR NOT isfinite(p_consultado_en) OR p_consultado_en>clock_timestamp() OR p_consultado_en<clock_timestamp()-interval '30 seconds' THEN RAISE EXCEPTION 'Consulta de numeración NC no vigente/coincidente.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.fiscal_nc_intenciones_homologacion(solicitud_id,intento_id,permiso_id,revision_id,reserva_id,operacion_origen_id,actor_auth_id,propuesta_sha256,preparacion_sha256,solicitud_sha256,ultimo_autorizado,consultado_en)
 VALUES(p_id,p_intento_id,p_permiso_id,p_revision_id,(permiso->>'reserva_id')::uuid,p_operacion_origen_id,p_actor_auth_id,p_sha,permiso->>'preparacion_sha256',p_cuerpo_sha,p_ultimo_autorizado,p_consultado_en);
 -- INSERT también puede esperar por UUID/FK: vencimiento/query no se congelan antes de la espera.
 PERFORM public.verificar_permiso_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha,p_cuerpo_sha,p_revision_id,p_permiso_id);
 IF p_consultado_en<clock_timestamp()-interval '30 seconds' THEN RAISE EXCEPTION 'Consulta de numeración NC venció esperando.' USING ERRCODE='22023'; END IF;
 -- Fila inmutable/caso PK y permiso UNIQUE consumen autoridad en esta transacción.
 RETURN public.cargar_intencion_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha)||jsonb_build_object('nuevo_envio',true);
END $$;
REVOKE ALL ON FUNCTION public.cargar_intencion_nc_homologacion(uuid,uuid,uuid,uuid,text),public.registrar_intencion_nc_homologacion(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,integer,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_intencion_nc_homologacion(uuid,uuid,uuid,uuid,text),public.registrar_intencion_nc_homologacion(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,integer,timestamptz) TO service_role;
COMMIT;
