-- PR03: permiso privado exacto para un cuerpo ya persistido. Homologación.
-- Requiere 001–008. Sin filas/activación automática; instalar requiere su gate.
BEGIN;
CREATE TABLE IF NOT EXISTS public.fiscal_permisos_emision_homologacion (
 operacion_id uuid PRIMARY KEY REFERENCES public.fiscal_solicitudes_homologacion(operacion_id),
 autorizacion_id uuid NOT NULL UNIQUE,
 solicitud_sha256 text NOT NULL CHECK(solicitud_sha256 ~ '^[0-9a-f]{64}$'),
 credencial_id uuid NOT NULL,
 certificado_sha256 text NOT NULL CHECK(certificado_sha256 ~ '^[0-9a-f]{64}$'),
 emisor_revision integer NOT NULL CHECK(emisor_revision>0),
 habilitado boolean NOT NULL DEFAULT false,
 creado_en timestamptz NOT NULL DEFAULT clock_timestamp(),
 vence_en timestamptz NOT NULL,
 usado_por_intento uuid UNIQUE,
 usado_en timestamptz,
 CHECK(vence_en>creado_en AND vence_en<=creado_en+interval '1 hour'),
 CHECK((usado_por_intento IS NULL)=(usado_en IS NULL))
);
ALTER TABLE public.fiscal_permisos_emision_homologacion ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.fiscal_permisos_emision_homologacion FROM PUBLIC,anon,authenticated,service_role;
DO $$ DECLARE columnas text; rol text; BEGIN
 SELECT string_agg(quote_ident(attname),',' ORDER BY attnum) INTO columnas FROM pg_attribute
 WHERE attrelid='public.fiscal_permisos_emision_homologacion'::regclass AND attnum>0 AND NOT attisdropped;
 EXECUTE format('REVOKE INSERT (%s), UPDATE (%s), SELECT (%s), REFERENCES (%s) ON public.fiscal_permisos_emision_homologacion FROM PUBLIC,anon,authenticated,service_role',columnas,columnas,columnas,columnas);
 FOREACH rol IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
  IF has_table_privilege(rol,'public.fiscal_permisos_emision_homologacion','SELECT,INSERT,UPDATE,DELETE')
   OR has_any_column_privilege(rol,'public.fiscal_permisos_emision_homologacion','SELECT,INSERT,UPDATE') THEN RAISE EXCEPTION 'Permisos de emisión expuestos.'; END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.cargar_preparacion_envio_homologacion(p_operacion_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE op public.fiscal_operaciones_homologacion%ROWTYPE; reserva public.fiscal_reservas_homologacion%ROWTYPE;
 solicitud public.fiscal_solicitudes_homologacion%ROWTYPE; permiso public.fiscal_permisos_emision_homologacion%ROWTYPE;
 actor uuid; binding jsonb; ack jsonb;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador fiscal privado requerido.' USING ERRCODE='42501'; END IF;
 op:=public.fiscal_operacion_vigente_homologacion(p_operacion_id);
 SELECT auth_user_id INTO actor FROM public.usuarios WHERE id=op.usuario_id;
 binding:=public.autorizar_consulta_fiscal_homologacion(actor,p_operacion_id);
 PERFORM 1 FROM public.fiscal_series_homologacion WHERE cuit_emisor=op.contexto->>'cuit_emisor'
 AND punto_venta=(op.contexto->>'punto_venta')::integer AND tipo_comprobante=(op.contexto->>'tipo_comprobante')::integer FOR UPDATE;
 SELECT * INTO reserva FROM public.fiscal_reservas_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
 SELECT * INTO solicitud FROM public.fiscal_solicitudes_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
 IF reserva.operacion_id IS NULL OR solicitud.operacion_id IS NULL OR reserva.solicitud_sha256 IS DISTINCT FROM solicitud.solicitud_sha256 THEN
 RAISE EXCEPTION 'Falta cuerpo fiscal durable.' USING ERRCODE='22023'; END IF;
 SELECT resultado INTO ack FROM public.fiscal_autorizaciones_homologacion WHERE operacion_id=p_operacion_id;
 IF (reserva.estado='AUTORIZADA') IS DISTINCT FROM (ack IS NOT NULL) THEN RAISE EXCEPTION 'Cierre fiscal inconsistente.' USING ERRCODE='40001'; END IF;
 IF reserva.estado='RESERVADA' THEN
  SELECT * INTO permiso FROM public.fiscal_permisos_emision_homologacion WHERE operacion_id=p_operacion_id FOR UPDATE;
  IF permiso.operacion_id IS NULL OR NOT permiso.habilitado OR permiso.creado_en>clock_timestamp() OR permiso.vence_en<=clock_timestamp()
   OR permiso.solicitud_sha256 IS DISTINCT FROM solicitud.solicitud_sha256 OR permiso.usado_por_intento IS NOT NULL
   OR permiso.credencial_id::text IS DISTINCT FROM binding->>'credencial_id'
   OR permiso.certificado_sha256 IS DISTINCT FROM binding->>'certificado_sha256'
   OR permiso.emisor_revision IS DISTINCT FROM (binding->>'revision')::integer THEN
   RAISE EXCEPTION 'Emisión no habilitada para este cuerpo.' USING ERRCODE='42501'; END IF;
 END IF;
 RETURN jsonb_build_object('operacion_id',p_operacion_id,'estado',reserva.estado,'intento_id',reserva.intento_id,'revision',solicitud.revision,
 'solicitud',jsonb_build_object('version',1,'solicitud',solicitud.cuerpo,'sha256',solicitud.solicitud_sha256),'resultado',ack,'permiso',permiso.autorizacion_id);
END;
$$;
CREATE OR REPLACE FUNCTION public.registrar_envio_fiscal_homologacion(p_operacion_id uuid,p_intento_id uuid,p_sha text,p_autorizacion_id uuid,p_ultimo_autorizado integer,p_consultado_en timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE contexto jsonb; ack jsonb; permiso public.fiscal_permisos_emision_homologacion%ROWTYPE; instante timestamptz;
BEGIN
 IF NOT coalesce(auth.role()='service_role',false) THEN RAISE EXCEPTION 'Trabajador fiscal privado requerido.' USING ERRCODE='42501'; END IF;
 IF p_intento_id IS NULL OR p_sha IS NULL OR p_sha !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Identidad de envío inválida.' USING ERRCODE='22023'; END IF;
 contexto:=public.cargar_preparacion_envio_homologacion(p_operacion_id);
 IF contexto#>>'{solicitud,sha256}' IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'Cambió el cuerpo de envío.' USING ERRCODE='40001'; END IF;
 IF contexto->>'estado' IN ('ENVIO_INCIERTO','AUTORIZADA') THEN
  IF contexto->>'intento_id' IS DISTINCT FROM p_intento_id::text THEN RAISE EXCEPTION 'Otro intento requiere conciliación.' USING ERRCODE='55000'; END IF;
  RETURN jsonb_build_object('operacion_id',p_operacion_id,'estado',contexto->>'estado','solicitud_sha256',p_sha,'nuevo_intento',false,'emision_habilitada',false,'requiere_conciliacion',true);
 END IF;
 IF contexto->>'estado' IS DISTINCT FROM 'RESERVADA' OR p_autorizacion_id IS NULL OR contexto->>'permiso' IS DISTINCT FROM p_autorizacion_id::text
  OR p_ultimo_autorizado IS NULL OR p_ultimo_autorizado<0 OR p_ultimo_autorizado<>((contexto#>>'{solicitud,solicitud,numero}')::integer-1)
  OR p_consultado_en IS NULL OR p_consultado_en<clock_timestamp()-interval '2 minutes' OR p_consultado_en>clock_timestamp()+interval '30 seconds' THEN
  RAISE EXCEPTION 'Permiso o numeración cambiaron.' USING ERRCODE='40001'; END IF;
 ack:=public.registrar_intento_fiscal_homologacion(p_operacion_id,p_intento_id);
 IF ack->'nuevo_intento' IS DISTINCT FROM 'true'::jsonb OR ack->>'estado' IS DISTINCT FROM 'ENVIO_INCIERTO'
  OR ack->>'solicitud_sha256' IS DISTINCT FROM p_sha THEN RAISE EXCEPTION 'No se confirmó intención de emisión.' USING ERRCODE='40001'; END IF;
 instante:=clock_timestamp();
 UPDATE public.fiscal_permisos_emision_homologacion SET usado_por_intento=p_intento_id,usado_en=instante
 WHERE operacion_id=p_operacion_id AND autorizacion_id=p_autorizacion_id AND habilitado AND creado_en<=instante AND vence_en>instante AND usado_por_intento IS NULL RETURNING * INTO permiso;
 IF permiso.usado_por_intento IS DISTINCT FROM p_intento_id OR permiso.usado_en IS DISTINCT FROM instante OR permiso.autorizacion_id IS DISTINCT FROM p_autorizacion_id THEN
 RAISE EXCEPTION 'No se confirmó uso del permiso.' USING ERRCODE='40001'; END IF;
 RETURN ack||jsonb_build_object('autorizacion_id',p_autorizacion_id,'emision_habilitada',true);
END;
$$;
REVOKE ALL ON FUNCTION public.cargar_preparacion_envio_homologacion(uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.registrar_envio_fiscal_homologacion(uuid,uuid,text,uuid,integer,timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.cargar_preparacion_envio_homologacion(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.registrar_envio_fiscal_homologacion(uuid,uuid,text,uuid,integer,timestamptz) TO service_role;
COMMIT;
