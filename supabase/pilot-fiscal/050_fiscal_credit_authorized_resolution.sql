-- Resolución de numeración NC autorizada; sin aplicación comercial.
-- Requiere001–049. Rechazos/ausencia de respuesta/conflictos NO liberan serie.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_nc_resoluciones_homologacion(
 solicitud_id uuid PRIMARY KEY REFERENCES public.fiscal_nc_autorizaciones_homologacion(solicitud_id),
 intento_id uuid NOT NULL UNIQUE REFERENCES public.fiscal_nc_intenciones_homologacion(intento_id),
 reserva_id uuid NOT NULL UNIQUE REFERENCES public.fiscal_nc_reservas_homologacion(reserva_id),
 consulta_id uuid NOT NULL REFERENCES public.fiscal_nc_consultas_homologacion(id),actor_auth_id uuid NOT NULL,
 solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
 cae text NOT NULL CHECK(cae ~ '^[0-9]{14}$' AND cae !~ '^0+$'),vencimiento text NOT NULL CHECK(vencimiento ~ '^[0-9]{8}$'),
 cuit_emisor text NOT NULL,punto_venta integer NOT NULL,tipo_comprobante integer NOT NULL,numero integer NOT NULL CHECK(numero BETWEEN 1 AND 99999999),
 creada_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY(cuit_emisor,punto_venta,tipo_comprobante) REFERENCES public.fiscal_nc_series_homologacion,
 UNIQUE(cuit_emisor,punto_venta,tipo_comprobante,numero)
);
ALTER TABLE public.fiscal_nc_resoluciones_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_nc_resoluciones_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',') INTO columnas FROM pg_attribute WHERE attrelid='public.fiscal_nc_resoluciones_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE SELECT(%s),INSERT(%s),UPDATE(%s),REFERENCES(%s) ON public.fiscal_nc_resoluciones_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_nc_resoluciones_homologacion','SELECT,INSERT,UPDATE,DELETE') OR has_any_column_privilege(rol,'public.fiscal_nc_resoluciones_homologacion','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Resolución NC expuesta.'; END IF;
 END LOOP;
END $$;
DROP TRIGGER IF EXISTS fiscal_nc_resolucion_inmutable ON public.fiscal_nc_resoluciones_homologacion;
CREATE TRIGGER fiscal_nc_resolucion_inmutable BEFORE UPDATE OR DELETE ON public.fiscal_nc_resoluciones_homologacion FOR EACH ROW EXECUTE FUNCTION public.fiscal_revision_inmutable();
-- Helper interno: callers validan Auth; lock compartido con reserva/permiso/consulta.
CREATE OR REPLACE FUNCTION public.fiscal_nc_exigir_serie_sin_conflictos(p_cuit text,p_pv integer,p_tipo integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$ BEGIN
 PERFORM 1 FROM public.fiscal_nc_series_homologacion WHERE cuit_emisor=p_cuit AND punto_venta=p_pv AND tipo_comprobante=p_tipo FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Serie NC no disponible.' USING ERRCODE='55000'; END IF;
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_reservas_homologacion r JOIN public.fiscal_nc_conflictos_homologacion c ON c.solicitud_id=r.solicitud_id WHERE r.cuit_emisor=p_cuit AND r.punto_venta=p_pv AND r.tipo_comprobante=p_tipo) THEN RAISE EXCEPTION 'Serie NC con conflicto pendiente.' USING ERRCODE='55000'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.fiscal_nc_exigir_serie_sin_conflictos(text,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION public.cargar_resolucion_nc_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE intento jsonb; r public.fiscal_nc_resoluciones_homologacion%ROWTYPE;
BEGIN
 intento:=public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF intento IS NULL THEN RAISE EXCEPTION 'Requiere intención NC.' USING ERRCODE='55000'; END IF;
 SELECT * INTO r FROM public.fiscal_nc_resoluciones_homologacion WHERE solicitud_id=p_caso FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF r.actor_auth_id IS DISTINCT FROM p_actor OR r.intento_id::text IS DISTINCT FROM intento->>'intento_id' OR r.solicitud_sha256 IS DISTINCT FROM intento->>'solicitud_sha256' OR r.reserva_id::text IS DISTINCT FROM intento->>'reserva_id' THEN RAISE EXCEPTION 'Resolución NC ajena.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version',1,'solicitud_id',p_caso,'intento_id',r.intento_id,'reserva_id',r.reserva_id,'consulta_id',r.consulta_id,'solicitud_sha256',r.solicitud_sha256,'cae',r.cae,'vencimiento',r.vencimiento,'cuit_emisor',r.cuit_emisor,'punto_venta',r.punto_venta,'tipo_comprobante',r.tipo_comprobante,'numero',r.numero,'estado','RESOLUCION_NC_REGISTRADA_NO_APLICADA','emision_habilitada',false,'reintegro_habilitado',false,'reposicion_habilitada',false);
END $$;
CREATE OR REPLACE FUNCTION public.registrar_resolucion_nc_autorizada_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE previa jsonb; cuerpo jsonb; autorizado jsonb;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Resolución NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 previa:=public.cargar_resolucion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF previa IS NOT NULL THEN RETURN previa; END IF;
 PERFORM public.exigir_nc_sin_conflictos_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 -- Gate conserva lock de serie; revalidar identidad tras la espera.
 previa:=public.cargar_resolucion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF previa IS NOT NULL THEN RETURN previa; END IF;
 autorizado:=public.cargar_autorizacion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF autorizado IS NULL OR autorizado->>'estado' IS DISTINCT FROM 'CAE_NC_REGISTRADO_NO_APLICADO' THEN RAISE EXCEPTION 'NC sin CAE confirmado.' USING ERRCODE='55000'; END IF;
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 IF autorizado->>'solicitud_sha256' IS DISTINCT FROM cuerpo#>>'{cuerpo,sha256}' THEN RAISE EXCEPTION 'CAE de otro cuerpo NC.' USING ERRCODE='22023'; END IF;
 INSERT INTO public.fiscal_nc_resoluciones_homologacion(solicitud_id,intento_id,reserva_id,consulta_id,actor_auth_id,solicitud_sha256,cae,vencimiento,cuit_emisor,punto_venta,tipo_comprobante,numero)
 VALUES(p_caso,(autorizado->>'intento_id')::uuid,(cuerpo#>>'{reserva,reserva_id}')::uuid,(autorizado->>'consulta_id')::uuid,p_actor,autorizado->>'solicitud_sha256',autorizado#>>'{observacion,resultado,cae}',autorizado#>>'{observacion,resultado,vencimiento}',cuerpo#>>'{reserva,cuit_emisor}',(cuerpo#>>'{reserva,punto_venta}')::integer,(cuerpo#>>'{reserva,tipo_comprobante}')::integer,(cuerpo#>>'{reserva,numero}')::integer);
 RETURN public.cargar_resolucion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
END $$;
REVOKE ALL ON FUNCTION public.cargar_resolucion_nc_homologacion(uuid,uuid,uuid,uuid,text),public.registrar_resolucion_nc_autorizada_homologacion(uuid,uuid,uuid,uuid,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_resolucion_nc_homologacion(uuid,uuid,uuid,uuid,text),public.registrar_resolucion_nc_autorizada_homologacion(uuid,uuid,uuid,uuid,text) TO service_role;
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
 PERFORM public.fiscal_nc_exigir_serie_sin_conflictos(cuit,pv,tipo);
 IF EXISTS(SELECT 1 FROM public.fiscal_nc_reservas_homologacion r LEFT JOIN public.fiscal_nc_resoluciones_homologacion s USING(solicitud_id) WHERE r.cuit_emisor=cuit AND r.punto_venta=pv AND r.tipo_comprobante=tipo AND s.solicitud_id IS NULL) THEN RAISE EXCEPTION 'Serie NC pendiente de resolución fiscal.' USING ERRCODE='55000'; END IF;
 IF p_ultimo_autorizado<(SELECT coalesce(max(numero),0) FROM public.fiscal_nc_resoluciones_homologacion WHERE cuit_emisor=cuit AND punto_venta=pv AND tipo_comprobante=tipo) THEN RAISE EXCEPTION 'Numeración remota anterior a NC confirmada.' USING ERRCODE='22023'; END IF;
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
CREATE OR REPLACE FUNCTION public.verificar_permiso_nc_homologacion(p_actor_auth_id uuid,p_venta_id uuid,p_operacion_origen_id uuid,p_id uuid,p_sha text,p_cuerpo_sha text,p_revision_id uuid,p_permiso_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE perfil public.usuarios%ROWTYPE; emisor public.fiscal_emisores_homologacion%ROWTYPE;
 revision public.fiscal_nc_revisiones_homologacion%ROWTYPE; permiso public.fiscal_nc_permisos_homologacion%ROWTYPE;
 cuerpo jsonb; contexto jsonb;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Requiere trabajador privado NC.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Permiso NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF p_revision_id IS NULL OR p_permiso_id IS NULL OR p_cuerpo_sha IS NULL OR p_cuerpo_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Conservar identidad/cuerpo NC.' USING ERRCODE='22023'; END IF;
 BEGIN SELECT * INTO STRICT perfil FROM public.usuarios WHERE auth_user_id=p_actor_auth_id AND activo FOR SHARE;
 EXCEPTION WHEN no_data_found OR too_many_rows THEN RAISE EXCEPTION 'Permiso NC no autorizado.' USING ERRCODE='42501'; END;
 IF perfil.rol IS DISTINCT FROM 'DUEÑO' OR perfil.es_superadmin IS DISTINCT FROM false OR perfil.kiosco_id IS NULL THEN RAISE EXCEPTION 'Permiso NC no autorizado.' USING ERRCODE='42501'; END IF;
 cuerpo:=public.cargar_revision_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha,p_revision_id);
 IF cuerpo#>>'{cuerpo,cuerpo,sha256}' IS DISTINCT FROM p_cuerpo_sha THEN RAISE EXCEPTION 'Cuerpo NC distinto.' USING ERRCODE='22023'; END IF;
 SELECT * INTO revision FROM public.fiscal_nc_revisiones_homologacion WHERE id=p_revision_id FOR SHARE;
 contexto:=public.cargar_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha);
 IF contexto IS DISTINCT FROM revision.contexto OR contexto IS DISTINCT FROM cuerpo#>'{cuerpo,preparacion,contexto}' THEN RAISE EXCEPTION 'Contexto NC cambió.' USING ERRCODE='22023'; END IF;
 SELECT * INTO emisor FROM public.fiscal_emisores_homologacion WHERE kiosco_id=perfil.kiosco_id AND habilitado FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Emisor NC no disponible.' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.fiscal_nc_series_homologacion WHERE cuit_emisor=emisor.cuit_emisor AND punto_venta=emisor.punto_venta AND tipo_comprobante=(contexto->>'tipo_nota_credito')::integer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Serie NC no disponible.' USING ERRCODE='55000'; END IF;
 PERFORM public.fiscal_nc_exigir_serie_sin_conflictos(emisor.cuit_emisor,emisor.punto_venta,(contexto->>'tipo_nota_credito')::integer);
 SELECT * INTO permiso FROM public.fiscal_nc_permisos_homologacion WHERE id=p_permiso_id FOR UPDATE;
 IF NOT FOUND OR permiso.habilitado IS DISTINCT FROM true OR permiso.solicitud_id IS DISTINCT FROM p_id OR permiso.revision_id IS DISTINCT FROM p_revision_id
  OR permiso.actor_auth_id IS DISTINCT FROM p_actor_auth_id OR permiso.reserva_id IS DISTINCT FROM revision.reserva_id
  OR permiso.solicitud_sha256 IS DISTINCT FROM p_cuerpo_sha OR permiso.preparacion_sha256 IS DISTINCT FROM revision.preparacion_sha256
  OR permiso.credencial_id IS DISTINCT FROM emisor.credencial_id OR permiso.certificado_sha256 IS DISTINCT FROM emisor.certificado_sha256
  OR permiso.emisor_revision IS DISTINCT FROM emisor.revision OR permiso.creado_en<revision.creada_en OR permiso.creado_en>clock_timestamp()
  OR permiso.vence_en<=clock_timestamp() OR permiso.vence_en>revision.vence_en OR revision.creada_en>clock_timestamp() OR revision.vence_en<=clock_timestamp()
  OR EXISTS(SELECT 1 FROM public.fiscal_nc_permisos_revocados_homologacion WHERE permiso_id=p_permiso_id) THEN RAISE EXCEPTION 'Permiso NC no vigente para este cuerpo.' USING ERRCODE='42501'; END IF;
 -- Revalidar después de esperar serie/permiso: ningún timeout concede vigencia.
 IF public.cargar_contexto_nc_homologacion(p_actor_auth_id,p_venta_id,p_operacion_origen_id,p_id,p_sha) IS DISTINCT FROM contexto
  OR permiso.vence_en<=clock_timestamp() OR revision.vence_en<=clock_timestamp() THEN RAISE EXCEPTION 'Permiso NC vencido o contexto distinto.' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('version',1,'estado','PERMISO_NC_VERIFICADO','solicitud_id',p_id,'reserva_id',permiso.reserva_id,
  'solicitud_sha256',p_cuerpo_sha,'preparacion_sha256',permiso.preparacion_sha256,'revision_id',p_revision_id,'permiso_id',p_permiso_id,
  'actor_auth_id',p_actor_auth_id,'vence_en',permiso.vence_en,'emision_habilitada',false);
END $$;
CREATE OR REPLACE FUNCTION public.exigir_nc_sin_conflictos_homologacion(p_actor uuid,p_venta uuid,p_operacion uuid,p_caso uuid,p_sha text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE cuerpo jsonb;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador privado requerido.' USING ERRCODE='42501'; END IF;
 IF current_setting('transaction_isolation')<>'read committed' THEN RAISE EXCEPTION 'Gate NC requiere READ COMMITTED.' USING ERRCODE='25001'; END IF;
 IF public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha) IS NULL THEN RAISE EXCEPTION 'Requiere intención NC.' USING ERRCODE='55000'; END IF;
 cuerpo:=public.cargar_fuente_cuerpo_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 PERFORM 1 FROM public.fiscal_nc_series_homologacion WHERE cuit_emisor=cuerpo#>>'{reserva,cuit_emisor}' AND punto_venta=(cuerpo#>>'{reserva,punto_venta}')::integer AND tipo_comprobante=(cuerpo#>>'{reserva,tipo_comprobante}')::integer FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Serie NC no disponible.' USING ERRCODE='55000'; END IF;
 PERFORM public.cargar_intencion_nc_homologacion(p_actor,p_venta,p_operacion,p_caso,p_sha);
 PERFORM public.fiscal_nc_exigir_serie_sin_conflictos(cuerpo#>>'{reserva,cuit_emisor}',(cuerpo#>>'{reserva,punto_venta}')::integer,(cuerpo#>>'{reserva,tipo_comprobante}')::integer);
END $$;
COMMIT;
